import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, normalize } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url);
const checks = [
  {
    name: 'loader',
    entries: ['lodariq-loader.js'],
    limit: 3 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
  },
  {
    name: 'runtime+tour',
    entries: ['lodariq-runtime.js', 'renderers/tour.js'],
    limit: 40 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
  },
];

function productionRuntimeForbiddenPatterns() {
  return [
    {
      name: 'React',
      pattern: /(?:^|['"])react(?:['"]|\/)|react-dom/,
    },
    {
      name: 'Lexical',
      pattern: /(?:^|['"])lexical(?:['"]|\/)|@lexical\//,
    },
    {
      name: 'SDK authoring package',
      pattern: /@lodariq\/sdk-authoring|(?:^|['"`/])lodariq-authoring(?:\.js|['"`/])/,
    },
    {
      name: 'dashboard-only code',
      pattern: /@lodariq\/dashboard|@clerk\/nextjs|next\/headers|next-themes|server-only/,
    },
  ];
}

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
  if (specifier.startsWith('.')) return resolveFile(normalize(join(dirname(fromFile), specifier)));
  if (specifier.startsWith('node:')) return null;
  return resolvePackageImport(specifier, fromFile);
}

function resolveFile(file) {
  const candidates = [file, `${file}.js`, `${file}.mjs`, `${file}.cjs`, join(file, 'index.js')];
  const found = candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
  if (!found) throw new Error(`Missing SDK build artifact: ${file}`);
  return found;
}

function resolvePackageImport(specifier, fromFile) {
  const { packageName, subpath } = parsePackageSpecifier(specifier);
  const requireFromFile = createRequire(fromFile);
  const packageJsonPath = requireFromFile.resolve(`${packageName}/package.json`);
  const packageRoot = dirname(packageJsonPath);
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const exported = resolvePackageExport(pkg, subpath);
  return exported ? resolveFile(join(packageRoot, exported)) : null;
}

function parsePackageSpecifier(specifier) {
  const parts = specifier.split('/');
  const packageName = specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  const consumed = specifier.startsWith('@') ? 2 : 1;
  const rest = parts.slice(consumed).join('/');
  return { packageName, subpath: rest ? `./${rest}` : '.' };
}

function resolvePackageExport(pkg, subpath) {
  if (pkg.exports) {
    const entry =
      subpath === '.' && typeof pkg.exports !== 'object' ? pkg.exports : pkg.exports[subpath];
    return pickExportPath(entry);
  }
  if (subpath !== '.') return subpath;
  return pkg.module ?? pkg.main;
}

function pickExportPath(entry) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  return pickExportPath(entry.import ?? entry.browser ?? entry.module ?? entry.default);
}

function collect(files, seen = new Set()) {
  for (const file of files) {
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Missing SDK build artifact: ${file}`);
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
  assertNoBareBrowserImports(check, files);
  assertNoForbiddenRuntimeDeps(check, files);
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

function assertNoForbiddenRuntimeDeps(check, files) {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of check.forbidden ?? []) {
      if (!forbidden.pattern.test(source)) continue;
      throw new Error(
        `${check.name} bundle includes forbidden ${forbidden.name} reference in ${file}`,
      );
    }
  }
}
