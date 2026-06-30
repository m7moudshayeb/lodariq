import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const checks = [
  {
    name: 'authoring-owned',
    entries: ['lodariq-authoring.js'],
    limit: 96 * 1024,
  },
  {
    name: 'creator-toolbar',
    entries: ['creator-toolbar/index.js'],
    limit: 8 * 1024,
  },
  {
    name: 'creator-install',
    entries: ['lodariq-creator.js'],
    limit: 96 * 1024,
    forbidBareImports: true,
  },
];

function distPath(relativePath) {
  return new URL(relativePath, dist).pathname;
}

function staticImports(file) {
  const source = readFileSync(file, 'utf8');
  const imports = [
    ...source.matchAll(/import\s*(?:[^'"]+\s+from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/export\s*[^'"]+\s*from\s*['"]([^'"]+)['"]/g),
  ];
  return imports.map((match) => match[1]);
}

function literalModuleSpecifiers(file) {
  const source = readFileSync(file, 'utf8');
  const imports = [
    ...source.matchAll(/import\s*(?:[^'"]+\s+from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/export\s*[^'"]+\s*from\s*['"]([^'"]+)['"]/g),
  ];
  return imports.map((match) => match[1]);
}

function resolveImport(specifier, fromFile) {
  if (!specifier.startsWith('.')) return null;
  return resolveFile(normalize(join(dirname(fromFile), specifier)));
}

function resolveFile(file) {
  const candidates = [file, `${file}.js`, `${file}.mjs`, join(file, 'index.js')];
  const found = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  if (!found) throw new Error(`Missing authoring build artifact: ${file}`);
  return found;
}

function collect(files, seen = new Set()) {
  for (const file of files) {
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Missing authoring build artifact: ${file}`);
    seen.add(file);
    collect(
      staticImports(file)
        .map((specifier) => resolveImport(specifier, file))
        .filter(Boolean),
      seen,
    );
  }
  return seen;
}

for (const check of checks) {
  const files = collect(check.entries.map(distPath));
  if (check.forbidBareImports) assertNoBareBrowserImports(check, files);
  const size = [...files].reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
  if (size > check.limit) {
    throw new Error(`${check.name} is ${size} bytes gzipped; limit is ${check.limit}`);
  }
  process.stdout.write(`${check.name}: ${size}/${check.limit} bytes gzipped\n`);
}

function assertNoBareBrowserImports(check, files) {
  for (const file of files) {
    for (const specifier of literalModuleSpecifiers(file)) {
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
        continue;
      }

      throw new Error(
        `${check.name} bundle contains browser-unresolvable bare import "${specifier}" in ${file}`,
      );
    }
  }
}
