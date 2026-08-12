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
    // Phase 2 completion baseline (2026-08-09): 229,644 bytes. This package-wide,
    // authenticated-only compatibility surface retains synchronous direct-host
    // methods and recovery UI exports; it remains outside the production viewer.
    baseline: 229_644,
    limit: 250 * 1024,
  },
  {
    name: 'authoring-frame',
    entries: ['authoring-frame.js'],
    // Searchable authoring language controls baseline (2026-08-12): 145,428
    // bytes. This includes sparse locale editing, translation status, and the
    // on-demand catalog loader; unselected catalogs remain separate chunks.
    // Authoring code never ships in normal viewer delivery.
    baseline: 145_428,
    limit: 143 * 1024,
  },
  {
    name: 'creator-toolbar',
    entries: ['creator-toolbar/index.js'],
    // Localization baseline (2026-08-12): 9,675 bytes, including the shared
    // locale policy and dynamic catalog selector.
    baseline: 9_675,
    limit: 10 * 1024,
  },
  {
    name: 'creator-install',
    entries: ['lodariq-creator.js'],
    // Phase 2 baseline (2026-08-09): 164,428 bytes. The compatibility creator
    // entry owns exact-theme hydration, preview, durable save, and release. It
    // is never part of the normal production-viewer graph.
    baseline: 164_428,
    limit: 168 * 1024,
    forbidBareImports: true,
  },
  {
    name: 'hosted-creator-entry',
    entries: ['hosted-entry.js'],
    // Phase 2 baseline (2026-08-09): 171,408 bytes. This integrity-loaded,
    // post-activation creator module is absent from production bootstrap and
    // the normal production-viewer graph.
    baseline: 171_408,
    limit: 176 * 1024,
    forbidBareImports: true,
  },
];

function distPath(relativePath) {
  return new URL(relativePath, dist).pathname;
}

function staticImports(file) {
  const source = readFileSync(file, 'utf8');
  const imports = [
    ...source.matchAll(/import\s*(?:[^'"]+?\s*from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/export\s*[^'"]+?\s*from\s*['"]([^'"]+)['"]/g),
  ];
  return imports.map((match) => match[1]);
}

function literalModuleSpecifiers(file) {
  const source = readFileSync(file, 'utf8');
  const imports = [
    ...source.matchAll(/import\s*(?:[^'"]+?\s*from\s*)?['"]([^'"]+)['"]/g),
    ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/export\s*[^'"]+?\s*from\s*['"]([^'"]+)['"]/g),
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

function collectBrowserGraph(files, seen = new Set()) {
  for (const file of files) {
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Missing authoring build artifact: ${file}`);
    seen.add(file);
    collectBrowserGraph(
      literalModuleSpecifiers(file)
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => resolveImport(specifier, file))
        .filter(Boolean),
      seen,
    );
  }
  return seen;
}

for (const check of checks) {
  const entries = check.entries.map(distPath);
  const staticFiles = collect(entries);
  const browserFiles = collectBrowserGraph(entries);
  if (check.forbidBareImports) assertNoBareBrowserImports(check, browserFiles);
  const size = [...staticFiles].reduce(
    (total, file) => total + gzipSync(readFileSync(file)).length,
    0,
  );
  if (size > check.limit) {
    throw new Error(`${check.name} is ${size} bytes gzipped; limit is ${check.limit}`);
  }
  process.stdout.write(
    `${check.name}: ${size}/${check.limit} bytes gzipped (baseline ${check.baseline})\n`,
  );
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
