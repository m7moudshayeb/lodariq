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
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO_BASE = '/demo/';
const MARKETING_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE_HOST_DIR = join(MARKETING_DIR, '..', 'fixture-host');
const DEMO_DIST_DIR = join(FIXTURE_HOST_DIR, 'dist-demo');

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

const REWRITES = {
  html: [
    [
      'data-manifest="/lodariq-local/manifest.json"',
      `data-manifest="${DEMO_BASE}lodariq-local/manifest.json"`,
    ],
    ['<div id="app"></div>', `${LOADER_CONFIG_TAG}\n    <div id="app"></div>`],
  ],
  js: [['"/authoring.html"', `"${DEMO_BASE}authoring.html"`]],
};

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

const ifMissing = process.argv.includes('--if-missing');
if (ifMissing && existsSync(join(DEMO_DIST_DIR, 'index.html'))) {
  process.exit(0);
}
buildDemoFixtureHost();
applyRewrites();
console.log(`Demo fixture host ready at ${DEMO_DIST_DIR}`);
