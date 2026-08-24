import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

const dist = new URL('../dist/', import.meta.url);
const checks = [
  {
    name: 'authoring-owned',
    entries: ['lodariq-authoring.js'],
    // Roadmap baseline (2026-08-21): 292,654 bytes. This dependency-inclusive,
    // authenticated-only compatibility surface remains outside the viewer.
    // Milestones 2.1-2.8 add commercial gates, delivery controls, adaptive
    // authoring, narration, retained analytics identities, and collaboration.
    // Milestone 2.9 adds the canonical five-type behavior schemas, draft seeds,
    // and compilation contracts. Milestone 2.10 adds the lazy audit labels and
    // complete localized governance history vocabulary. Milestone 3 adds the
    // review-first voice, recording, template, diff, copy, locale-media, and
    // shareable-demo authoring surfaces. Their operations panes and roadmap
    // fallback catalog remain separate lazy chunks; this authenticated entry
    // carries only the typed service boundary and review state needed to open
    // those panes. Non-tour runtime stays deferred, and the separate editor
    // gate continues to protect first paint.
    baseline: 333_522,
    limit: 328 * 1024,
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
    //
    // Raised from 10 KiB when the toolbar's hover states moved off raw rgba
    // onto `color-mix` over the accent token (ADR-0013). The token form is
    // longer than the literal it replaced; keeping the literal would put a
    // colour value back in a file the design-token gate exists to keep clean.
    //
    // Raised again to 11 KiB (2026-08-21) for the shared experiences menu. The
    // launcher's own two panels — a type chooser and a list of the page's
    // experiences — became one menu it shares with the panel's mode pill, which
    // brought a name dialog, cursor paging and a search field with it.
    //
    // Almost none of that is in this number. The menu is imported dynamically on
    // the first hover and its stylesheet is injected with it, so a customer page
    // where nobody opens it pays nothing; importing the barrel eagerly measured
    // 18,148 bytes here, against 10,714 for the deferred form. What remains is
    // the two palette labels, the click-away guard, the provider handshake and
    // the loader — set against the surface-rendering code and CSS they replaced.
    baseline: 9_675,
    limit: 11 * 1024,
  },
  {
    name: 'creator-install',
    entries: ['lodariq-creator.js'],
    // Phase 2 baseline (2026-08-09): 164,428 bytes. The compatibility creator
    // entry owns exact-theme hydration, preview, durable save, and release. The
    // 2.10 baseline includes the localized governance audit vocabulary; the
    // current roadmap also carries the typed review-first operation boundary;
    // each operation pane and its expanded fallback catalog stay lazy. This
    // entry is never part of the normal production-viewer graph.
    baseline: 188_816,
    limit: 187 * 1024,
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
  return moduleSpecifiers(readFileSync(file, 'utf8'), false);
}

function literalModuleSpecifiers(file) {
  return moduleSpecifiers(readFileSync(file, 'utf8'), true);
}

function moduleSpecifiers(source, includeDynamic) {
  const sourceFile = ts.createSourceFile(
    'sdk-authoring-asset.js',
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  const specifiers = [];

  const addSpecifier = (node) => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (
      includeDynamic &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      addSpecifier(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
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
