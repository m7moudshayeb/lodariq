/**
 * Where does the time go while someone authors against a live application?
 *
 * `t29` answers "what does opening authoring cost to load" — requests, bytes,
 * blocking. This answers the different question the "feels slow and lagging"
 * report actually asks: once it is open and a creator is working, whose code is
 * on the main thread.
 *
 * It samples the CPU profiler through CDP and attributes self-time by script
 * URL, so the answer is measured rather than argued. Read the buckets, not the
 * absolute milliseconds: this is a Vite dev server serving unbundled ES modules
 * with no minification, which is not what a customer downloads from the CDN.
 *
 *   pnpm --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t45-authoring-profile.mjs
 *
 *   SDK_PORT=5177   fixture host port
 */
import { chromium } from './env.mjs';

const port = process.env['SDK_PORT'] ?? '5177';
const url = `http://localhost:${port}/#/projects/all`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

/** Which codebase a sampled frame belongs to. Order matters: first match wins. */
const BUCKETS = [
  ['sdk-authoring', /packages\/sdk-authoring/],
  ['sdk-runtime', /packages\/sdk-runtime/],
  ['sdk-schema+compiler', /packages\/(schema|compiler|i18n)/],
  ['host application', /\/(src|apps)\//],
  ['third-party deps', /node_modules/],
];

/**
 * V8's own bookkeeping frames — `(idle)`, `(program)`, `(garbage collector)` —
 * carry no script URL and are most of the samples on a page that is mostly
 * waiting. Counting them as anybody's code makes every share meaningless, so
 * they are held out of the attribution rather than folded into it.
 */
const NON_ATTRIBUTABLE = new Set(['(idle)', '(program)', '(root)', '(garbage collector)']);

function bucketOf(frame) {
  if (NON_ATTRIBUTABLE.has(frame.functionName)) return null;
  const scriptUrl = frame.url ?? '';
  if (!scriptUrl) return 'browser internals';
  for (const [name, pattern] of BUCKETS) if (pattern.test(scriptUrl)) return name;
  return 'other';
}

/** Self-time per bucket, from hit counts and the profile's own sample interval. */
function attribute(profile) {
  const spanMs = (profile.endTime - profile.startTime) / 1000;
  const totalHits = profile.nodes.reduce((sum, node) => sum + (node.hitCount ?? 0), 0);
  if (!totalHits) return { spanMs, totals: new Map(), totalHits };
  const msPerHit = spanMs / totalHits;
  const totals = new Map();
  let idleMs = 0;
  for (const node of profile.nodes) {
    const hits = node.hitCount ?? 0;
    if (!hits) continue;
    const bucket = bucketOf(node.callFrame);
    if (!bucket) {
      idleMs += hits * msPerHit;
      continue;
    }
    totals.set(bucket, (totals.get(bucket) ?? 0) + hits * msPerHit);
  }
  return { spanMs, totals, idleMs };
}

function report(label, { spanMs, totals, idleMs }) {
  const rows = [...totals.entries()].sort((left, right) => right[1] - left[1]);
  const busy = rows.reduce((sum, [, ms]) => sum + ms, 0);
  console.log(
    `\n${label}  ${Math.round(spanMs)} ms wall clock, ${Math.round(busy)} ms of it running code`,
  );
  for (const [bucket, ms] of rows) {
    const share = busy > 0 ? Math.round((ms / busy) * 100) : 0;
    console.log(`  ${bucket.padEnd(22)} ${String(Math.round(ms)).padStart(6)} ms  ${share}% of busy`);
  }
  console.log(`  ${'(idle / waiting)'.padEnd(22)} ${String(Math.round(idleMs)).padStart(6)} ms`);
  return busy;
}

/** The named functions behind a bucket, so a share is something to go and read. */
function topFrames(profile, limit = 6) {
  const spanMs = (profile.endTime - profile.startTime) / 1000;
  const totalHits = profile.nodes.reduce((sum, node) => sum + (node.hitCount ?? 0), 0);
  if (!totalHits) return [];
  const msPerHit = spanMs / totalHits;
  const byFrame = new Map();
  for (const node of profile.nodes) {
    const hits = node.hitCount ?? 0;
    if (!hits || !bucketOf(node.callFrame)) continue;
    const frame = node.callFrame;
    const file = (frame.url ?? '').split('/').pop() ?? '(anonymous)';
    const key = `${frame.functionName || '(anonymous)'}  ${file}`;
    byFrame.set(key, (byFrame.get(key) ?? 0) + hits * msPerHit);
  }
  return [...byFrame.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit);
}

async function profile(label, work, { frames = false } = {}) {
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await work();
  const { profile: captured } = await cdp.send('Profiler.stop');
  const busy = report(label, attribute(captured));
  if (frames) {
    for (const [name, ms] of topFrames(captured)) {
      console.log(`    ${String(Math.round(ms)).padStart(5)} ms  ${name}`);
    }
  }
  return busy;
}

await cdp.send('Profiler.enable');

// 1. Idle install. What the SDK costs a page nobody authors on.
await profile('install and settle', async () => {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
  await page.waitForTimeout(2_000);
});

// 2. Opening authoring. The moment the report describes as a freeze.
await profile('open authoring', async () => {
  await page.evaluate(() => window.__meridian.openAuthoring());
  await page.waitForSelector('lodariq-authoring-panel', { timeout: 20_000 });
  await page.waitForTimeout(4_000);
});

// 3. A working session: move between steps, type into the card.
await profile('author: step changes and typing', async () => {
  const steps = await page.getByRole('button', { name: /^Edit step \d+:/ }).all();
  for (const step of steps.slice(0, 3)) {
    await step.click();
    await page.waitForTimeout(1_200);
  }
  await page.keyboard.type('Measuring the authoring session', { delay: 30 });
  await page.waitForTimeout(1_500);
});

// 4. Host churn with authoring open. The watchdog used to make this expensive:
//    it observed documentElement with subtree, so every mutation in a live
//    application ran a querySelector.
const mutations = await profile('host mutates the DOM 2000 times', async () => {
  await page.evaluate(async () => {
    const sink = document.createElement('div');
    document.body.appendChild(sink);
    for (let index = 0; index < 2_000; index += 1) {
      const row = document.createElement('span');
      row.textContent = `row ${index}`;
      sink.appendChild(row);
      if (index % 200 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    sink.remove();
  });
  await page.waitForTimeout(1_500);
}, { frames: true });

const longTasks = await page.evaluate(
  () =>
    performance
      .getEntriesByType('longtask')
      .map((entry) => Math.round(entry.duration))
      .sort((left, right) => right - left)
      .slice(0, 5),
  // longtask is buffered only when observed; this is a best-effort tail.
);
console.log(`\nlongest long tasks seen: ${longTasks.length ? longTasks.join(', ') : 'none recorded'}`);
console.log(
  `\nwatchdog check: 2000 host mutations cost ${Math.round(mutations)} ms of main thread across all code.`,
);

await browser.close();
