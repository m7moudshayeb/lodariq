/**
 * Measures the authoring frame's cold boot: the request waterfall, how much of
 * it is serial, and how long a creator waits before the shell paints.
 *
 *   node docs/product-design/prototypes/qa/t28-authoring-boot.mjs
 *
 * Two origins are served, because the editor derives its trusted parent from
 * `document.referrer` — a same-document harness would never mount.
 *
 *   PROFILE=fast|slow   network/CPU shape (default slow: 9 Mbps, 40ms, 4x CPU)
 *   LOCALE=de-DE        exercises the locale catalog stage (default en-US)
 *   BASELINE=write      records the run as the comparison point
 *   BASELINE=off        prints absolutes only
 *   ASSERT=1            exits non-zero if the boot shape regressed (for CI)
 *   WARM=1              opens twice and reports the second, warm-cache open
 *   SHOT=<name>         writes a screenshot of the mounted frame
 *
 * Numbers are wall-clock from navigation start inside the editor frame, so they
 * move when the code moves. Run it before and after every change.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, REPO, outDir } from './env.mjs';

const EDITOR_DIST = join(REPO, 'apps/editor/dist');
const FIXTURE = join(REPO, 'packages/schema/fixtures/tour.linear.v1.json');
const BASELINE_FILE = join(outDir('boot'), 'authoring-boot-baseline.json');

const PROFILES = {
  // Fast 4G on a mid-range laptop. Generous for a creator on office wifi.
  slow: { latency: 40, downKbps: 9 * 1024, upKbps: 3 * 1024, cpu: 4 },
  fast: { latency: 0, downKbps: 0, upKbps: 0, cpu: 1 },
};
const profile = PROFILES[process.env.PROFILE ?? 'slow'];
const locale = process.env.LOCALE ?? 'en-US';

const TYPES = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
};

/** Serves a directory over gzip, the way a CDN would. */
function serveDir(root, indexFile) {
  return createServer(async (req, res) => {
    let path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!path.startsWith(root)) return res.writeHead(403).end();
    try {
      if ((await stat(path)).isDirectory()) path = join(path, indexFile);
      const body = gzipSync(await readFile(path));
      res.writeHead(200, {
        'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
        'content-encoding': 'gzip',
        // Mirrors production (apps/editor/scripts/serve-static.mjs): hashed
        // assets are immutable, the document is never cached. WARM=1 relies on
        // this to measure a repeat open rather than a cold one.
        'cache-control': path.endsWith('.html')
          ? 'no-store'
          : 'public, max-age=31536000, immutable',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
}

const editorServer = serveDir(EDITOR_DIST, 'authoring.html');
await new Promise((resolve) => editorServer.listen(0, '127.0.0.1', resolve));
const editorOrigin = `http://127.0.0.1:${editorServer.address().port}`;

const doc = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const HOST_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>boot harness</title></head>
<body style="margin:0">
<script type="module">
  const doc = ${JSON.stringify(doc)};
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0';
  frame.src = ${JSON.stringify(`${editorOrigin}/authoring.html`)};
  window.__frameCreated = performance.now();
  document.body.appendChild(frame);

  // The frame only listens once its entry chunk has evaluated, and the exact
  // moment is what this harness exists to measure — so retry rather than guess.
  const init = {
    protocol: '1',
    sessionId: 'authsess_boot_harness',
    documentId: doc.id,
    correlationId: 'authoring_init_boot_harness',
    type: 'authoring.init',
    workspaceId: 'wk_boot_harness',
    environment: 'staging',
    document: doc,
  };
  // Posted unconditionally on an interval: the frame guards its own duplicates,
  // and any cleverness here races the very thing being measured.
  const post = () => {
    if (window.__stopInit) return;
    frame.contentWindow?.postMessage(init, ${JSON.stringify(editorOrigin)});
    window.__initSent ??= performance.now();
  };
  const timer = setInterval(post, 25);
  setTimeout(() => clearInterval(timer), 25000);
  post();
</script>
</body></html>`;

const hostServer = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
  res.end(HOST_PAGE);
});
await new Promise((resolve) => hostServer.listen(0, '127.0.0.1', resolve));
const hostOrigin = `http://127.0.0.1:${hostServer.address().port}`;

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
if (profile.downKbps) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: profile.latency,
    downloadThroughput: (profile.downKbps * 1024) / 8,
    uploadThroughput: (profile.upKbps * 1024) / 8,
  });
}
if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });

/**
 * Marks are taken inside the editor frame, against its own navigation clock, so
 * host-side scheduling noise never lands in the number.
 */
await page.addInitScript(() => {
  if (!location.pathname.endsWith('authoring.html')) return;
  window.__marks = [];
  const seen = new Set();
  const mark = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    window.__marks.push({ name, t: Math.round(performance.now()) });
  };
  mark('frame-document-start');
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) mark(`paint:${entry.name}`);
  }).observe({ type: 'paint', buffered: true });

  // The placeholder paints in a few ms and means nothing; what a creator waits
  // for is the shell. Poll per frame so the mark lands on the paint that
  // actually shows authoring UI rather than on the next unrelated mutation.
  const poll = () => {
    const root = document.getElementById('authoring');
    if (root) {
      if (root.dataset.state) mark(`state:${root.dataset.state}`);
      else mark('state:cleared');
      if (root.firstElementChild) mark('shell-first-element');
      if (root.querySelector('button, [role="tablist"], [contenteditable]'))
        mark('shell-interactive');
      if (document.head.querySelector('style, link[rel="stylesheet"]')) mark('styles-applied');
    }
    if (window.__lodariqEditorMounted) mark('editor-mounted');
    if (!seen.has('shell-interactive') || !seen.has('editor-mounted')) {
      requestAnimationFrame(poll);
    }
  };
  requestAnimationFrame(poll);
});

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 200)}`));

const requests = new Map();
const order = [];
page.on('request', (request) => {
  const record = { url: request.url(), start: Date.now(), size: 0, status: 0 };
  requests.set(request, record);
  order.push(record);
});
page.on('response', async (response) => {
  const record = requests.get(response.request());
  if (!record) return;
  record.end = Date.now();
  record.status = response.status();
  try {
    record.size = (await response.body()).length;
  } catch {
    record.size = 0;
  }
  try {
    // A cache hit reports a negative or zero body size; count it as no network
    // rather than letting it subtract from the total.
    const bodySize = (await response.request().sizes()).responseBodySize;
    record.transfer = Math.max(0, bodySize);
    record.fromCache = bodySize <= 0;
  } catch {
    record.transfer = 0;
  }
});

if (process.env.WARM === '1') {
  // First pass only fills the HTTP cache; its requests are not measured.
  const primer = await context.newPage();
  await primer.goto(`${hostOrigin}/`, { waitUntil: 'domcontentloaded' });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const frame = primer.frames().find((f) => f.url().includes('authoring.html'));
    if (
      frame &&
      (await frame.evaluate(() => Boolean(window.__lodariqEditorMounted)).catch(() => false))
    )
      break;
    await primer.waitForTimeout(100);
  }
  await primer.close();
}

const navigationStart = Date.now();
await page.goto(`${hostOrigin}/`, { waitUntil: 'domcontentloaded' });

const editorFrame = async () => page.frames().find((f) => f.url().includes('authoring.html'));
let mounted = false;
for (let attempt = 0; attempt < 200; attempt += 1) {
  const frame = await editorFrame();
  if (frame) {
    mounted = await frame.evaluate(() => Boolean(window.__lodariqEditorMounted)).catch(() => false);
    if (mounted) break;
  }
  await page.waitForTimeout(100);
}
await page
  .evaluate(() => {
    window.__stopInit = true;
  })
  .catch(() => {});
await page.waitForTimeout(600);

const frame = await editorFrame();
const marks = frame ? await frame.evaluate(() => window.__marks ?? []).catch(() => []) : [];
const frameNavigation = frame
  ? await frame
      .evaluate(() => {
        const entry = performance.getEntriesByType('navigation')[0];
        return entry ? Math.round(performance.timeOrigin) : null;
      })
      .catch(() => null)
  : null;

const editorRequests = order
  .filter((r) => r.url.startsWith(editorOrigin))
  .map((r) => ({
    name: r.url.slice(editorOrigin.length),
    start: r.start - navigationStart,
    end: (r.end ?? r.start) - navigationStart,
    size: r.size,
    transfer: r.transfer ?? 0,
    fromCache: Boolean(r.fromCache),
  }))
  .sort((a, b) => a.start - b.start);

/**
 * Serial depth: how many requests had to finish before the next one could be
 * discovered. Counting overlap is what separates "we shipped less" from "we
 * stopped queueing", and only the second survives new chunks being added.
 */
function serialDepth(rows) {
  let depth = 0;
  let frontier = -1;
  for (const row of rows) {
    if (row.start >= frontier - 5) {
      depth += 1;
      frontier = row.end;
    } else {
      frontier = Math.max(frontier, row.end);
    }
  }
  return depth;
}

const totalBytes = editorRequests.reduce((sum, r) => sum + r.size, 0);
const totalTransfer = editorRequests.reduce((sum, r) => sum + r.transfer, 0);
const markAt = (name) => marks.find((m) => m.name === name)?.t ?? null;
const summary = {
  profile: process.env.PROFILE ?? 'slow',
  locale,
  requests: editorRequests.length,
  bytes: totalBytes,
  transfer: totalTransfer,
  serialDepth: serialDepth(editorRequests),
  firstPaint: markAt('paint:first-contentful-paint') ?? markAt('paint:first-paint'),
  shellVisible: markAt('shell-first-element'),
  shellInteractive: markAt('shell-interactive'),
  editorMounted: markAt('editor-mounted'),
  lastByte: editorRequests.length ? Math.max(...editorRequests.map((r) => r.end)) : null,
  largestChunk: editorRequests.reduce((max, r) => (r.size > (max?.size ?? 0) ? r : max), null),
};

console.log(`profile ${summary.profile} · locale ${locale} · mounted=${mounted}`);
console.log('\n  start    end     ms        raw     wire  asset');
for (const row of editorRequests) {
  if (row.size < 1024 && editorRequests.length > 25) continue;
  console.log(
    `${String(row.start).padStart(7)}${String(row.end).padStart(7)}${String(row.end - row.start).padStart(7)}${String(row.size).padStart(11)}${String(row.transfer).padStart(9)}  ${row.name}`,
  );
}
console.log('\nframe marks (frame clock):');
for (const m of marks) console.log(`  ${String(m.t).padStart(6)} ms  ${m.name}`);

const line = (label, value, unit = 'ms') =>
  `  ${label.padEnd(22)} ${value === null ? 'n/a' : `${value}${unit}`}`;
console.log('\nsummary:');
console.log(line('requests', summary.requests, ''));
console.log(line('decoded bytes', Math.round(summary.bytes / 1024), ' KiB raw'));
console.log(line('over the wire', Math.round(summary.transfer / 1024), ' KiB gz'));
console.log(
  line(
    'served from cache',
    editorRequests.filter((r) => r.fromCache).length,
    ` of ${editorRequests.length}`,
  ),
);
console.log(line('serial depth', summary.serialDepth, ' round trips'));
console.log(line('first paint (shim)', summary.firstPaint));
console.log(line('shell visible', summary.shellVisible));
console.log(line('shell interactive', summary.shellInteractive));
console.log(line('editor mounted', summary.editorMounted));
console.log(line('last byte', summary.lastByte));
if (summary.largestChunk) {
  console.log(
    `  ${'largest chunk'.padEnd(22)} ${Math.round(summary.largestChunk.size / 1024)} KiB gz  ${summary.largestChunk.name}`,
  );
}

const baselineMode = process.env.BASELINE ?? 'compare';
if (baselineMode === 'write') {
  writeFileSync(BASELINE_FILE, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nbaseline written to ${BASELINE_FILE}`);
} else if (baselineMode !== 'off' && existsSync(BASELINE_FILE)) {
  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  if (baseline.profile === summary.profile && baseline.locale === summary.locale) {
    console.log('\ndelta vs baseline:');
    for (const key of [
      'requests',
      'bytes',
      'transfer',
      'serialDepth',
      'firstPaint',
      'shellVisible',
      'shellInteractive',
      'editorMounted',
      'lastByte',
    ]) {
      const before = baseline[key];
      const after = summary[key];
      if (typeof before !== 'number' || typeof after !== 'number') continue;
      const diff = after - before;
      const pct = before === 0 ? 0 : Math.round((diff / before) * 100);
      console.log(
        `  ${key.padEnd(22)} ${String(before).padStart(8)} -> ${String(after).padStart(8)}  ${diff >= 0 ? '+' : ''}${diff} (${pct >= 0 ? '+' : ''}${pct}%)`,
      );
    }
  }
}

if (process.env.SHOT) {
  await page.screenshot({ path: join(outDir('boot'), `${process.env.SHOT}.png`) });
  console.log(`\nscreenshot: ${join(outDir('boot'), `${process.env.SHOT}.png`)}`);
}
console.log(`\nconsole errors: ${consoleErrors.length}`);
for (const error of consoleErrors.slice(0, 8)) console.log(`  ${error}`);

/**
 * The shape of the boot, not just its weight.
 *
 * The static gate in `apps/editor/scripts/check-size.mjs` counts bytes, which
 * cannot see serialisation: a boot can ship the same payload across two round
 * trips or across five. These thresholds are what stop a newly added
 * `await import()` from quietly putting a round trip back.
 */
const THRESHOLDS = {
  serialDepth: 3,
  shellInteractive: 1100,
  consoleErrors: 0,
};

if (process.env.ASSERT === '1') {
  const problems = [];
  if (!mounted) problems.push('the authoring frame never mounted');
  if (summary.serialDepth > THRESHOLDS.serialDepth) {
    problems.push(
      `boot takes ${summary.serialDepth} serial round trips; the budget is ${THRESHOLDS.serialDepth}. ` +
        'Something on the path is only discoverable after an earlier request finishes.',
    );
  }
  if ((summary.shellInteractive ?? Infinity) > THRESHOLDS.shellInteractive) {
    problems.push(
      `shell became interactive at ${summary.shellInteractive}ms; the budget is ${THRESHOLDS.shellInteractive}ms.`,
    );
  }
  if (consoleErrors.length > THRESHOLDS.consoleErrors) {
    problems.push(`${consoleErrors.length} console errors during boot.`);
  }
  if (problems.length) {
    process.stderr.write(`\nboot regression:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    await browser.close();
    editorServer.close();
    hostServer.close();
    process.exit(1);
  }
  console.log('\nboot shape within budget');
}

await browser.close();
editorServer.close();
hostServer.close();
