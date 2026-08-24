/**
 * Builds the fixture host as the marketing hero demo.
 *
 * The hero embeds the REAL fixture host (`apps/fixture-host`) with the REAL
 * SDK installed — not a video, not a mock. The fixture host normally builds
 * for the root of its own origin, so this script rebuilds it with
 * `--base /demo/` into `apps/fixture-host/dist-demo` and then fixes the two
 * root-absolute references its own build does not rewrite:
 *
 *  1. `data-manifest="/lodariq-local/manifest.json"` on the loader script tag
 *     (the loader fetches whatever the attribute says, so the HTML attribute
 *     is the single place to repoint).
 *  2. The `/authoring.html` iframe source inside the built JS, so the hidden
 *     creator entry (`Ctrl/⌘+Shift+L`) keeps working inside the demo too.
 *
 * The fixture host's normal `dist/` output is untouched; e2e keeps using it.
 */
/* global process, console */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO_BASE = '/demo/';
const MARKETING_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = join(MARKETING_DIR, '..', '..');
const FIXTURE_HOST_DIR = join(MARKETING_DIR, '..', 'fixture-host');
const DEMO_DIST_DIR = join(FIXTURE_HOST_DIR, 'dist-demo');

/**
 * Everything the demo bundle is built out of. If any of it is newer than the
 * demo build, the demo is serving a stale SDK and has to be rebuilt.
 *
 * The fixture host imports the SDK packages by their `import` condition, which
 * resolves to `dist/` — so the packages' BUILD output is the input here, not
 * their source. A source edit that has not been rebuilt is reported as a
 * warning rather than silently ignored.
 */
const SDK_PACKAGES = ['sdk-runtime', 'sdk-authoring', 'schema', 'compiler'];

const DEMO_INPUTS = [
  join(REPO_ROOT, 'packages/sdk-runtime/dist'),
  join(REPO_ROOT, 'packages/sdk-authoring/dist'),
  join(REPO_ROOT, 'packages/schema/dist'),
  join(REPO_ROOT, 'packages/compiler/dist'),
  join(FIXTURE_HOST_DIR, 'src'),
  join(FIXTURE_HOST_DIR, 'index.html'),
  join(FIXTURE_HOST_DIR, 'authoring.html'),
  join(FIXTURE_HOST_DIR, 'public'),
  fileURLToPath(import.meta.url),
];

/**
 * Vite inlines the fixture host's loader module into the main bundle and drops
 * its script TAG — but the SDK reads its install config (workspace, env,
 * manifest URL) from that tag's data attributes. This inert tag restores the
 * config exactly as a customer page would carry it; the loader code itself
 * already lives in the bundle.
 */
const LOADER_CONFIG_TAG =
  '<script type="application/json" data-lodariq-loader data-workspace="wk_local_dev" ' +
  `data-env="development" data-manifest="${DEMO_BASE}lodariq-local/manifest.json"></script>`;

/**
 * The demo is a fixture product ("Meridian"), not Lodariq content. Without
 * this it gets crawled and indexed as a second page under lodariq.io — a fake
 * SaaS product competing with the real landing page. robots.txt disallows
 * /demo/ as well; this tag is the belt to that braces, since a disallowed URL
 * can still be indexed from an external link.
 */
const NOINDEX_TAG = '<meta name="robots" content="noindex, nofollow" />';

const REWRITES = {
  html: [
    [
      'data-manifest="/lodariq-local/manifest.json"',
      `data-manifest="${DEMO_BASE}lodariq-local/manifest.json"`,
    ],
    ['<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${NOINDEX_TAG}`],
    ['<div id="app"></div>', `${LOADER_CONFIG_TAG}\n    <div id="app"></div>`],
  ],
  js: [['"/authoring.html"', `"${DEMO_BASE}authoring.html"`]],
};

/**
 * The demo bundles the SDK packages' `dist/`, so SDK source edits only reach it
 * once those packages are rebuilt. Turbo handles that ordering for `pnpm build`
 * (marketing devDepends on the fixture host, so `^build` runs first). `pnpm
 * dev` deliberately does NOT trigger a workspace build -- that would add
 * minutes to every start -- so it warns instead of silently serving a bundle
 * missing the developer's newest work.
 */
function warnIfSdkSourceIsAhead() {
  const stale = SDK_PACKAGES.filter((pkg) => {
    const dist = newestMtime(join(REPO_ROOT, 'packages', pkg, 'dist'));
    return dist > 0 && newestMtime(join(REPO_ROOT, 'packages', pkg, 'src')) > dist;
  });
  if (!stale.length) return;
  console.warn(
    `\n  ! ${stale.join(', ')} ${stale.length > 1 ? 'have' : 'has'} source changes newer than ` +
      `${stale.length > 1 ? 'their' : 'its'} build output.\n` +
      '    The demo bundles dist/, so those changes will NOT appear in it.\n' +
      '    Run `pnpm build` at the repo root first.\n',
  );
}

/** Newest mtime anywhere under a file or directory; 0 if it does not exist. */
function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const stats = statSync(path);
  if (!stats.isDirectory()) return stats.mtimeMs;
  let newest = stats.mtimeMs;
  for (const name of readdirSync(path)) {
    newest = Math.max(newest, newestMtime(join(path, name)));
  }
  return newest;
}

function isDemoStale() {
  const built = newestMtime(join(DEMO_DIST_DIR, 'index.html'));
  if (!built) return true;
  return DEMO_INPUTS.some((input) => newestMtime(input) > built);
}

function buildDemoFixtureHost() {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--base', DEMO_BASE, '--outDir', 'dist-demo'], {
    cwd: FIXTURE_HOST_DIR,
    stdio: 'inherit',
  });
}

function rewriteFile(path, rewrites) {
  const source = readFileSync(path, 'utf8');
  let next = source;
  for (const [from, to] of rewrites) next = next.split(from).join(to);
  if (next !== source) writeFileSync(path, next);
}

function applyRewrites() {
  for (const name of readdirSync(DEMO_DIST_DIR)) {
    if (name.endsWith('.html')) rewriteFile(join(DEMO_DIST_DIR, name), REWRITES.html);
  }
  const assetsDir = join(DEMO_DIST_DIR, 'assets');
  for (const name of readdirSync(assetsDir)) {
    if (name.endsWith('.js')) rewriteFile(join(assetsDir, name), REWRITES.js);
  }
}

/*
 * `--if-stale` skips the rebuild only when the demo is genuinely up to date.
 * It replaced an `--if-missing` check that tested only for the demo's
 * EXISTENCE — which meant `pnpm dev` pinned whichever SDK happened to be
 * current the first time it ran, and silently served that forever.
 */
const ifStale = process.argv.includes('--if-stale');
warnIfSdkSourceIsAhead();
if (ifStale && !isDemoStale()) {
  console.log('Demo fixture host is up to date.');
  process.exit(0);
}
buildDemoFixtureHost();
applyRewrites();
console.log(`Demo fixture host ready at ${DEMO_DIST_DIR}`);
