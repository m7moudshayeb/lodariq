/** Fine-grained: sample every frame during and after a slow, human-like drag. */
import { chromium } from './env.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5177/');
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);

const ev = async (fn) => page.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  return new Function('root', 'host', body)(host.shadowRoot, host);
}, fn);

const handles = () => ev(`
  const f = root.querySelector('[data-overlay-frame]');
  const o = {};
  for (const h of f.querySelectorAll('[data-edge-resize]')) {
    const r = h.getBoundingClientRect();
    o[h.dataset.edgeResize] = { cx: r.x + r.width/2, cy: r.y + r.height/2 };
  }
  const r = f.getBoundingClientRect();
  o.__box = { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  return o;
`);

/** Start a rAF recorder in the page; returns the samples when stopped. */
const startRecording = () => page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  const f = host.shadowRoot.querySelector('[data-overlay-frame]');
  window.__samples = [];
  window.__recording = true;
  const t0 = performance.now();
  const tick = () => {
    if (!window.__recording) return;
    const r = f.getBoundingClientRect();
    const last = window.__samples[window.__samples.length - 1];
    const row = { t: Math.round(performance.now() - t0), l: Math.round(r.left), t2: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height) };
    if (!last || last.w !== row.w || last.h !== row.h || last.l !== row.l || last.t2 !== row.t2) {
      window.__samples.push(row);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const stopRecording = () => page.evaluate(() => { window.__recording = false; return window.__samples; });

async function slowDrag(edge, dx, dy, label) {
  const h = await handles();
  const p = h[edge];
  console.log(`\n--- ${label}: ${edge} ${dx >= 0 ? '+' : ''}${dx},${dy >= 0 ? '+' : ''}${dy}   from ${h.__box.w}x${h.__box.h} @(${h.__box.l},${h.__box.t})`);
  // approach the handle first, the way a hand does
  await page.mouse.move(p.cx - 40, p.cy - 40);
  await page.waitForTimeout(120);
  await page.mouse.move(p.cx, p.cy);
  await page.waitForTimeout(200);
  await startRecording();
  await page.mouse.down();
  const STEPS = 20;
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(p.cx + (dx * i) / STEPS, p.cy + (dy * i) / STEPS);
    await page.waitForTimeout(18);
  }
  const held = (await handles()).__box;
  await page.mouse.up();
  await page.waitForTimeout(1600);
  // and then drift the pointer off, as a hand does
  await page.mouse.move(p.cx + dx + 60, p.cy + dy + 60);
  await page.waitForTimeout(900);
  const samples = await stopRecording();
  const settled = (await handles()).__box;
  console.log(`   held ${held.w}x${held.h} @(${held.l},${held.t})  ->  settled ${settled.w}x${settled.h} @(${settled.l},${settled.t})`);
  if (held.w !== settled.w || held.h !== settled.h || held.l !== settled.l || held.t !== settled.t) {
    console.log('   >>> CHANGED AFTER RELEASE');
  }
  // Print only the tail of the trace: what happened around and after pointerup.
  const tail = samples.slice(-10);
  console.log('   trace tail:', tail.map((s) => `${s.t}ms ${s.w}x${s.h}@${s.l},${s.t2}`).join('  '));
  return settled;
}

await slowDrag('se', 110, 80, 'A. first resize, fresh card');
await slowDrag('e', 70, 0, 'B. width only, on an already-authored card');
await slowDrag('s', 0, 60, 'C. height only');
await slowDrag('e', -60, 0, 'D. width back in');
await slowDrag('n', 0, -50, 'E. north edge');
await slowDrag('w', -70, 0, 'F. west edge');

console.log('\nerrors', errors.slice(0, 5));
await browser.close();
