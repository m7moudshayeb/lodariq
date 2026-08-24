/** Drag every resize edge and report what moved. */
import { chromium } from './env.mjs';

const SDK_URL = 'http://localhost:5177/';
const EDGES = process.argv[2] ? process.argv[2].split(',') : ['se', 'e', 's', 'w', 'n', 'nw', 'ne', 'sw'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(SDK_URL);
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);

const ev = async (fn) => page.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  if (!host) return { error: 'no overlay host' };
  return new Function('root', body)(host.shadowRoot);
}, fn);

const rect = () => ev(`
  const f = root.querySelector('[data-overlay-frame]');
  const r = f.getBoundingClientRect();
  const handles = {};
  for (const h of f.querySelectorAll('[data-edge-resize]')) {
    const hr = h.getBoundingClientRect();
    handles[h.dataset.edgeResize] = { cx: hr.x + hr.width/2, cy: hr.y + hr.height/2 };
  }
  const inner = root.querySelector('iframe');
  const ir = inner ? inner.getBoundingClientRect() : null;
  return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom),
    w: Math.round(r.width), h: Math.round(r.height),
    iw: ir && Math.round(ir.width), ih: ir && Math.round(ir.height),
    handles };
`);

const stored = () => page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('lodariq:doc:'));
  if (!key) return null;
  const raw = localStorage[key];
  const m = raw.match(/"tooltipLayout":\{[^}]*\}/);
  return m ? m[0] : 'no tooltipLayout';
});

const DELTA = { se: [90, 60], e: [90, 0], s: [0, 60], w: [-90, 0], n: [0, -60],
  nw: [-90, -60], ne: [90, -60], sw: [-90, 60] };

for (const edge of EDGES) {
  const before = await rect();
  const h = before.handles[edge];
  if (!h) { console.log(edge, 'NO HANDLE'); continue; }
  const [dx, dy] = DELTA[edge];
  await page.mouse.move(h.cx, h.cy);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (const f of [0.34, 0.67, 1]) {
    await page.mouse.move(h.cx + dx * f, h.cy + dy * f);
    await page.waitForTimeout(50);
  }
  const during = await rect();
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const after = await rect();
  const doc = await stored();
  console.log(`\n--- ${edge}  drag ${dx},${dy}`);
  console.log(` before  l${before.l} t${before.t} r${before.r} b${before.b}  ${before.w}x${before.h}  iframe ${before.iw}x${before.ih}`);
  console.log(` during  l${during.l} t${during.t} r${during.r} b${during.b}  ${during.w}x${during.h}  iframe ${during.iw}x${during.ih}`);
  console.log(` after   l${after.l} t${after.t} r${after.r} b${after.b}  ${after.w}x${after.h}  iframe ${after.iw}x${after.ih}`);
  const grew = { w: after.w - before.w, h: after.h - before.h };
  const anchor = { l: after.l - before.l, t: after.t - before.t, r: after.r - before.r, b: after.b - before.b };
  console.log(` Δsize ${grew.w}x${grew.h}   Δedges  l${anchor.l} t${anchor.t} r${anchor.r} b${anchor.b}`);
  console.log(` stored ${doc}`);
}
console.log('\nerrors:', errors.slice(0, 8));
await browser.close();
