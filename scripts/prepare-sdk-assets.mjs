#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputPrefix = '/sdk/';
const outputRoot = resolve(repoRoot, 'dist/sdk-assets/sdk');
const creatorModuleCdnOrigin = canonicalCdnOrigin(
  process.env.LODARIQ_CDN_ORIGIN ?? 'https://cdn.lodariq.io',
);
const creatorModuleSourceRoot = resolve(repoRoot, 'packages/sdk-authoring/dist');
const creatorModuleSourceEntry = 'hosted-entry.js';
/** The one entry a customer's page loads directly, and so the one that can be SRI-pinned. */
const publicLoaderEntry = 'lodariq-public-bootstrap.js';

const assetSets = [
  {
    sourceRoot: resolve(repoRoot, 'packages/sdk-runtime/dist'),
    entries: [
      'lodariq-public-bootstrap.js',
      'lodariq-loader.js',
      'lodariq-runtime.js',
      'runtime/index.js',
      'renderers/tour.js',
    ],
    publicEntries: ['lodariq-public-bootstrap.js', 'lodariq-loader.js'],
  },
  {
    sourceRoot: creatorModuleSourceRoot,
    entries: ['lodariq-creator.js'],
    publicEntries: ['lodariq-creator.js'],
  },
];

const manifest = {
  generatedAt: new Date().toISOString(),
  prefix: outputPrefix,
  entries: {
    runtime: ['lodariq-public-bootstrap.js', 'lodariq-loader.js'],
    authoring: ['lodariq-creator.js'],
  },
  creatorModule: null,
  /**
   * Identity of the public loader, so a deployment can pin it (ADR-0027).
   *
   * Subresource integrity needs a base64 digest, while `files[].sha256` is hex
   * for byte-verification at upload time. Rather than widen every file entry
   * for one consumer, the loader gets its own pointer — the same shape the
   * creator module already uses.
   */
  publicLoader: null,
  files: [],
};

await rm(resolve(repoRoot, 'dist/sdk-assets'), { force: true, recursive: true });

const copiedPaths = new Set();
for (const assetSet of assetSets) {
  const files = collectReferencedFiles(assetSet);
  for (const sourcePath of files) {
    const outputPath = normalize(relative(assetSet.sourceRoot, sourcePath));
    if (outputPath.startsWith('..')) {
      throw new Error(`SDK asset escapes its source root: ${sourcePath}`);
    }
    await copyPublicJavaScript(sourcePath, outputPath, assetSet.publicEntries);
    copiedPaths.add(outputPath);
  }
}

manifest.creatorModule = await copyContentAddressedCreatorModule();
manifest.publicLoader = readPublicLoaderIdentity();

manifest.files.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(
  resolve(repoRoot, 'dist/sdk-assets/manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

process.stdout.write(
  `Prepared ${copiedPaths.size} SDK CDN assets in ${relative(repoRoot, outputRoot)}\n`,
);

function collectReferencedFiles(assetSet) {
  const seen = new Set();
  const pending = assetSet.entries.map((entry) => resolveFile(assetSet.sourceRoot, entry));

  while (pending.length) {
    const file = pending.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);

    const source = readTextSync(file);
    for (const specifier of moduleSpecifiers(source)) {
      if (!specifier.startsWith('.')) {
        throw new Error(`SDK CDN asset contains browser-unresolvable import "${specifier}"`);
      }
      pending.push(resolveFile(dirname(file), specifier));
    }
  }

  return [...seen].sort();
}

function resolveFile(baseDir, specifier) {
  const normalized = normalize(resolve(baseDir, specifier));
  const candidates = [
    normalized,
    `${normalized}.js`,
    `${normalized}.mjs`,
    join(normalized, 'index.js'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Missing SDK CDN asset dependency: ${specifier}`);
  return found;
}

function readTextSync(path) {
  return readFileSync(path, 'utf8');
}

function moduleSpecifiers(source) {
  return [
    ...source.matchAll(/import\s*(?:[^'"]+?\s*from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)'\s*\)/g),
    ...source.matchAll(/import\(\s*"([^"]+)"\s*\)/g),
    ...source.matchAll(/export\s*[^'"]+?\s*from\s*['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
}

async function copyContentAddressedCreatorModule() {
  const entryPath = resolveFile(creatorModuleSourceRoot, creatorModuleSourceEntry);
  const entryContent = publicJavaScriptContent(await readFile(entryPath, 'utf8'));
  const entryBytes = Buffer.from(entryContent);
  const digestHex = createHash('sha256').update(entryBytes).digest('hex');
  const digestBase64 = createHash('sha256').update(entryBytes).digest('base64');
  const version = `sha256-${digestHex}`;
  const outputDirectory = version;
  const entryOutputPath = `${outputDirectory}/creator.js`;
  const files = collectReferencedFiles({
    sourceRoot: creatorModuleSourceRoot,
    entries: [creatorModuleSourceEntry],
  });

  for (const sourcePath of files) {
    const sourceRelativePath = normalize(relative(creatorModuleSourceRoot, sourcePath));
    if (sourceRelativePath.startsWith('..')) {
      throw new Error(`Hosted creator asset escapes its source root: ${sourcePath}`);
    }
    const outputPath =
      sourcePath === entryPath
        ? entryOutputPath
        : normalize(join(outputDirectory, sourceRelativePath));
    await copyPublicJavaScript(sourcePath, outputPath, []);
    copiedPaths.add(outputPath);
  }

  return {
    url: `${creatorModuleCdnOrigin}${outputPrefix}${entryOutputPath}`,
    version,
    integrity: `sha256-${digestBase64}`,
  };
}

async function copyPublicJavaScript(sourcePath, outputPath, publicEntries) {
  const source = await readFile(sourcePath, 'utf8');
  const content = publicJavaScriptContent(source);
  const bytes = Buffer.from(content);
  const candidate = {
    path: `${outputPrefix}${outputPath}`,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    cache: cachePolicy(outputPath, publicEntries),
  };
  const existing = manifest.files.find((file) => file.path === candidate.path);
  if (existing) {
    if (
      existing.bytes !== candidate.bytes ||
      existing.sha256 !== candidate.sha256 ||
      existing.cache !== candidate.cache
    ) {
      throw new Error(`SDK asset output collision has different content: ${candidate.path}`);
    }
    return;
  }

  const destination = resolve(outputRoot, outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
  manifest.files.push(candidate);
}

/**
 * Read the prepared loader back off disk and describe it for the deployment.
 *
 * Deliberately hashes the written bytes rather than reusing an in-memory value:
 * an integrity digest that does not describe the file actually uploaded is
 * worse than no digest, because it fails closed on the customer's page.
 */
function readPublicLoaderIdentity() {
  const loaderPath = resolve(outputRoot, publicLoaderEntry);
  if (!existsSync(loaderPath)) {
    throw new Error(`Prepared SDK assets are missing the public loader: ${publicLoaderEntry}`);
  }
  const bytes = readFileSync(loaderPath);
  return {
    path: `${outputPrefix}${publicLoaderEntry}`,
    integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
  };
}

function publicJavaScriptContent(source) {
  const withoutSourceMapReference = source.replace(/\/\/# sourceMappingURL=.*$/gm, '').trimEnd();
  return `${withoutSourceMapReference}\n`;
}

function cachePolicy(outputPath, publicEntries) {
  if (publicEntries.includes(outputPath)) return 'short';
  if (/^sha256-[0-9a-f]{64}\//u.test(outputPath)) return 'immutable';
  const fileName = outputPath.split('/').pop() ?? '';
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*-[A-Z0-9_]{8}\.js$/.test(fileName)) return 'immutable';
  return 'short';
}

function canonicalCdnOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin !== value
  ) {
    throw new Error('LODARIQ_CDN_ORIGIN must be an exact HTTPS origin');
  }
  return url.origin;
}
