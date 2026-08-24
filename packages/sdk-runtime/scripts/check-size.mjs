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
    // Raised from 3 KiB for cross-application handoff: the bootstrap now sniffs
    // the URL for a journey token so an arriving visitor resumes on the step
    // they were sent to. The module that does the work stays lazy — only the
    // sniff and its branch are in the critical path.
    limit: 3.125 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
  },
  {
    // This bundle IS the idle-page cost. A visitor on a page with no eligible
    // experience downloads exactly this and nothing else, so the number below
    // is the honest answer to "what does Lodariq cost a page that shows
    // nothing?" — the one figure a customer's performance review asks for.
    //
    // Raised from 5 KiB for the cacheable eligibility pre-flight (ADR-0027):
    // ~650 bytes that let a page rule itself out from a GET the browser can
    // cache, instead of an uncacheable POST on every single page view. Bytes
    // bought a request, which is the right direction for this trade.
    name: 'public-bootstrap',
    entries: ['lodariq-public-bootstrap.js'],
    limit: 6 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
    forbiddenStatic: [
      {
        name: 'eager authoring activation client',
        pattern: /lodariq\.authoring\.activation\.v1|data-lodariq-launcher/,
      },
      // The whole design rests on delivery and runtime being reachable only
      // through `import()`. A refactor that turns either into a static import
      // would quietly restore the old cost on every page — and nothing else in
      // CI would notice, because the totals below would still pass.
      {
        name: 'eagerly linked public delivery module',
        pattern: /Lodariq public delivery configuration is invalid/,
      },
      {
        name: 'eagerly linked viewer runtime',
        pattern: /Lodariq\.playTour requires compiled delivery JSON/,
      },
    ],
  },
  {
    name: 'activation-client',
    entries: ['lodariq-activation.js'],
    // The creator-only activation client carries the small, source-controlled
    // locale catalog used before the authoring bundle is allowed to load.
    limit: 18 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
  },
  {
    name: 'public-delivery',
    entries: ['lodariq-public-delivery.js'],
    // Phase 2 baseline includes the frozen synchronous registerBrandTokens API
    // and its canonical-validation guard; forbidden production deps remain checked.
    //
    // Raised from 7 KiB for cross-page resume. A tour that spans two screens was
    // torn down and restarted at step 1 by the activation trigger the second
    // page re-evaluates from an empty in-memory state, so playback now knows
    // which document is on screen and an automatic activation yields to it.
    // This bundle is not the idle-page cost that ADR-0027 governs: it is fetched
    // only once the bootstrap says an experience is actually available, and
    // public-bootstrap, which is that cost, did not move.
    limit: 7.25 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
  },
  {
    name: 'public-demo-shell',
    entries: ['lodariq-demo-player.js'],
    // The shell fetches one bounded envelope, records four fixed anonymous
    // events, then lazy-loads validation and the existing viewer renderer.
    limit: 4 * 1024,
    forbidden: productionRuntimeForbiddenPatterns(),
    forbiddenStatic: [
      {
        name: 'eagerly linked viewer renderer',
        pattern: /Lodariq tour has not started/,
      },
      {
        name: 'eagerly linked compiled artifact validator',
        pattern: /artifactSchemaVersion/,
      },
    ],
  },
  {
    name: 'runtime+tour',
    entries: ['lodariq-runtime.js', 'renderers/tour.js'],
    // Includes the viewer-facing labels for all production locales; authored
    // experience content remains in the separately fetched artifact.
    //
    // Raised from 46 KiB for the emphasis layer (backdrop, outline, zoom),
    // continuous target tracking, and journey handoff — all load-bearing for a
    // tour that follows a moving target, so none of it is separable behind a
    // lazy import without an async boundary in the reposition path.
    //
    // Raised from 49 KiB for the resolver's candidate pool, pass-scoped
    // visibility memo, and timing hooks — ~0.5 KiB that halves resolution on a
    // 6,700-element page (40.6 ms -> 18.9 ms p50). Bytes here buy back main-thread
    // time on the customer's page, which is the scarcer budget.
    //
    // Then to 52 KiB for the launcher's experience chooser: it offered Tour alone,
    // which made every other experience type unreachable from the product. The
    // cost is the type names in all eight locales, so the chooser names the types
    // and describes only Tour.
    //
    // Then to 53 KiB for cancel-safe presentation orchestration. Spotlight travel,
    // viewport zoom, and motion effects stay in lazy chunks; this covers only the
    // readiness and transition control that prevents flashes and stale actions.
    //
    // Then to 53.5 KiB for immutable semantic-approach detection and scoped
    // creator replay. Execution, waits, and recovery remain in a lazy chunk.
    //
    // Then to 56 KiB after milestones 2.1-2.6 added adaptive presentation and
    // narration lifecycle glue. Narration playback remains a lazy 1.49 KiB
    // chunk; this budget applies only after an experience starts.
    //
    // Then to 57 KiB for page-aware steps: the resolver refuses a target on
    // the wrong page and playback walks the visitor to the next step's page.
    // The separate demo entry changes shared-chunk boundaries and adds gzip
    // framing overhead to this aggregate without adding demo code to either
    // runtime entry; the demo-specific entry has its own strict budget above.
    //
    // Then to 58 KiB for the per-visitor completed/skipped record. Where a
    // visitor is in a tour is a fact about the tab and stays in sessionStorage;
    // whether they finished or skipped it is a fact about the person, so it is
    // kept under the same one-way engagement key the analytics events carry and
    // behind a store interface a server-backed one can replace. ~0.4 KiB, paid
    // only after an experience starts, and it is what stops a tour someone
    // already dismissed for good from being offered again on their next visit.
    //
    // Then to 60 KiB, which is two separate costs. ~0.9 KiB is the step
    // indicator (2f64731), which landed over the 58 KiB line without this
    // check being run. The other ~0.4 KiB is the target-resolution timing
    // handed to onTargetResolution: ten bounded numbers per targeted step,
    // added to answer whether the 1.5s settling window is a latency problem or
    // a first-pass resolution failure. Drop the timing once that is answered.
    limit: 60 * 1024,
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

function collectBrowserGraph(files, seen = new Set()) {
  for (const file of files) {
    if (seen.has(file)) continue;
    if (!existsSync(file)) throw new Error(`Missing SDK build artifact: ${file}`);
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
  assertNoBareBrowserImports(check, browserFiles);
  assertNoForbiddenRuntimeDeps(check, browserFiles);
  assertNoForbiddenStaticCode(check, staticFiles);
  const size = [...staticFiles].reduce(
    (total, file) => total + gzipSync(readFileSync(file)).length,
    0,
  );
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

function assertNoForbiddenStaticCode(check, files) {
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of check.forbiddenStatic ?? []) {
      if (!forbidden.pattern.test(source)) continue;
      throw new Error(`${check.name} includes forbidden ${forbidden.name} in ${file}`);
    }
  }
}
