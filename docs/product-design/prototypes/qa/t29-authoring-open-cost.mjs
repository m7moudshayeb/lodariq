/**
 * What it costs to open authoring on the fixture host: how many requests the
 * browser makes, how many bytes arrive, and how long the main thread is blocked.
 *
 *   node docs/product-design/prototypes/qa/t29-authoring-open-cost.mjs
 *
 * This exists because of a failure that only ever showed up as "the SDK freezes
 * while it loads", and was invisible to every production budget we had.
 *
 * Vite pre-bundles dependencies for the dev server. While anything imported
 * `lucide-react/dynamic`, the optimiser had two entries into `lucide-react`, so
 * esbuild split every icon into its own chunk and rewrote the main entry as
 * roughly sixteen hundred STATIC imports. Importing one named icon then cost
 * ~1600 requests. The source no longer imports that subpath, but a dev cache
 * created before the change keeps serving the split version — the fix is
 * invisible until `node_modules/.vite` is cleared:
 *
 *   rm -rf apps/fixture-host/node_modules/.vite
 *
 * A production build never had this shape, which is exactly why it needs its
 * own check. Nothing in `apps/editor/scripts/check-size.mjs` can see it.
 *
 *   SDK_PORT=5177   fixture host port (default 5177, as the other scripts use)
 *   ASSERT=1        exit non-zero when the thresholds below are exceeded
 */
import { chromium } from './env.mjs';

/**
 * A healthy open is ~140 requests on a cold dev cache; the broken one was 1864.
 * The gap is wide enough that a single number separates them without being
 * brittle about ordinary growth.
 */
const THRESHOLDS = {
  requests: 400,
  megabytes: 20,
  blockingMs: 600,
};

const port = process.env.SDK_PORT ?? '5177';
const url = `http://localhost:${port}/`;

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await page.addInitScript(() => {
  window.__longTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks.push({
          start: Math.round(entry.startTime),
          ms: Math.round(entry.duration),
        });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long tasks are unsupported here; the request count still tells the story.
  }
});

await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2500);

// Counting starts here so the host page's own load is not attributed to us.
const opened = [];
page.on('request', (request) => opened.push({ url: request.url() }));
page.on('response', async (response) => {
  const row = opened.find((r) => r.url === response.url() && r.size === undefined);
  if (!row) return;
  try {
    row.size = (await response.body()).length;
  } catch {
    row.size = 0;
  }
});

const startedAt = Date.now();
await page.evaluate(() => window.__meridian?.openAuthoring?.());

let previous = -1;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await page.waitForTimeout(500);
  if (opened.length === previous) break;
  previous = opened.length;
}
const settleMs = Date.now() - startedAt;

const bytes = opened.reduce((total, row) => total + (row.size ?? 0), 0);
const groups = new Map();
for (const row of opened) {
  const group = /\/node_modules\/\.vite\/deps\//.test(row.url)
    ? 'vite optimised deps'
    : /sdk-authoring/.test(row.url)
      ? 'sdk-authoring'
      : 'host page';
  groups.set(group, (groups.get(group) ?? 0) + 1);
}

const longTasks = await page.evaluate(() => window.__longTasks ?? []);
const blockingMs = longTasks.reduce((total, task) => total + Math.max(0, task.ms - 50), 0);
const mounted = await page.evaluate(() =>
  Boolean(
    document.querySelector('[data-overlay-root]') ??
    [...document.querySelectorAll('*')].find((node) =>
      node.shadowRoot?.querySelector('[data-overlay-root]'),
    ),
  ),
);

console.log(`opening authoring on ${url}`);
console.log(`  requests             ${opened.length} (budget ${THRESHOLDS.requests})`);
console.log(
  `  bytes                ${(bytes / 1024 / 1024).toFixed(2)} MB (budget ${THRESHOLDS.megabytes} MB)`,
);
console.log(`  settle               ${settleMs} ms`);
console.log(`  total blocking time  ${blockingMs} ms (budget ${THRESHOLDS.blockingMs})`);
for (const [group, count] of [...groups].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${group.padEnd(21)}${count} requests`);
}
console.log(`  overlay              ${mounted ? 'mounted' : 'NOT mounted'}`);

if (process.env.ASSERT === '1') {
  const problems = [];
  if (!mounted) problems.push('authoring never mounted');
  if (opened.length > THRESHOLDS.requests) {
    problems.push(
      `${opened.length} requests to open authoring; budget is ${THRESHOLDS.requests}. ` +
        'If this is in the thousands, the Vite dep cache is stale: rm -rf apps/*/node_modules/.vite',
    );
  }
  if (bytes / 1024 / 1024 > THRESHOLDS.megabytes) {
    problems.push(
      `${(bytes / 1024 / 1024).toFixed(1)} MB transferred; budget is ${THRESHOLDS.megabytes} MB.`,
    );
  }
  if (blockingMs > THRESHOLDS.blockingMs) {
    problems.push(
      `${blockingMs} ms of main-thread blocking; budget is ${THRESHOLDS.blockingMs} ms.`,
    );
  }
  if (problems.length) {
    console.error(`\nopen-cost regression:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    await browser.close();
    process.exit(1);
  }
  console.log('\nopen cost within budget');
}

await browser.close();
