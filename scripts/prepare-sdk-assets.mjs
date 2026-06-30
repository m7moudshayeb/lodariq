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

const assetSets = [
  {
    sourceRoot: resolve(repoRoot, 'packages/sdk-runtime/dist'),
    entries: ['lodariq-loader.js', 'lodariq-runtime.js', 'renderers/tour.js'],
    publicEntries: ['lodariq-loader.js'],
  },
  {
    sourceRoot: resolve(repoRoot, 'packages/sdk-authoring/dist'),
    entries: ['lodariq-creator.js'],
    publicEntries: ['lodariq-creator.js'],
  },
];

const manifest = {
  generatedAt: new Date().toISOString(),
  prefix: outputPrefix,
  entries: {
    runtime: ['lodariq-loader.js'],
    authoring: ['lodariq-creator.js'],
  },
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
    ...source.matchAll(/import\s*(?:[^'"]+\s+from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)'\s*\)/g),
    ...source.matchAll(/import\(\s*"([^"]+)"\s*\)/g),
    ...source.matchAll(/export\s*[^'"]+\s*from\s*['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
}

async function copyPublicJavaScript(sourcePath, outputPath, publicEntries) {
  const source = await readFile(sourcePath, 'utf8');
  const withoutSourceMapReference = source.replace(/\/\/# sourceMappingURL=.*$/gm, '').trimEnd();
  const content = `${withoutSourceMapReference}\n`;
  const destination = resolve(outputRoot, outputPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');

  const bytes = Buffer.from(content);
  manifest.files.push({
    path: `${outputPrefix}${outputPath}`,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    cache: cachePolicy(outputPath, publicEntries),
  });
}

function cachePolicy(outputPath, publicEntries) {
  if (publicEntries.includes(outputPath)) return 'short';
  const fileName = outputPath.split('/').pop() ?? '';
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*-[A-Z0-9_]{8}\.js$/.test(fileName)) return 'immutable';
  return 'short';
}
