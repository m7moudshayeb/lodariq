/** Card resize: does the drag start where the card is drawn, and can it shrink? */
import { chromium, outDir } from './env.mjs';

const OUT = outDir();
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

const snap = () => ev(`
  const f = root.querySelector('[data-overlay-frame]');
  const i = host.querySelector('iframe');
  const r = f.getBoundingClientRect();
  const handles = {};
  for (const h of f.querySelectorAll('[data-edge-resize]')) {
    const hr = h.getBoundingClientRect();
    handles[h.dataset.edgeResize] = { cx: hr.x + hr.width/2, cy: hr.y + hr.height/2 };
  }
  return { w: Math.round(r.width), h: Math.round(r.height),
    l: Math.round(r.left), t: Math.round(r.top),
    cardH: i.dataset.overlayCardHeight, maxH: i.dataset.overlayCardMaxHeight,
    contentH: i.dataset.overlayContentHeight, handles };
`);

async function drag(edge, dx, dy) {
  const s = await snap();
  const h = s.handles[edge];
  await page.mouse.move(h.cx, h.cy);
  await page.mouse.down();
  for (const f of [0.34, 0.67, 1]) { await page.mouse.move(h.cx + dx * f, h.cy + dy * f); await page.waitForTimeout(50); }
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const a = await snap();
  console.log(`${edge} ${dx >= 0 ? '+' : ''}${dx},${dy >= 0 ? '+' : ''}${dy}:  ${s.w}x${s.h} -> ${a.w}x${a.h}   Δ ${a.w - s.w}x${a.h - s.h}  (content ${s.contentH} -> ${a.contentH}, roof ${a.maxH})`);
  return a;
}

console.log('rest', JSON.stringify(await snap()).slice(0, 160));
console.log('\n1. grow height 60 — the drag must start from the drawn 148, so expect ~208');
await drag('s', 0, 60);

console.log('\n2. narrow to the minimum so the text reflows taller than the box');
await drag('e', -200, 0);
let s = await snap();
console.log('   now', s.w, 'x', s.h, ' content', s.contentH, ' roof', s.maxH);

console.log('\n3. shrink height below the content — this did nothing before');
await drag('s', 0, -80);
s = await snap();
console.log('   frame', s.w, 'x', s.h, ' content', s.contentH, ' roof', s.maxH);

const scrolls = await page.evaluate(() => {
  const f = [...document.querySelectorAll('iframe')].find((n) => n.src.includes('authoring'));
  const d = f?.contentDocument;
  const card = d?.querySelector('.overlay-step-card');
  if (!card) return 'no card';
  return { clientH: card.clientHeight, scrollH: card.scrollHeight, overflow: getComputedStyle(card).overflowY,
    scrollable: card.scrollHeight > card.clientHeight + 1 };
});
console.log('   card scrolls inside the box?', JSON.stringify(scrolls));

const doc = await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('lodariq:doc:'));
  const m = k && localStorage[k].match(/"tooltipLayout":\{[^}]*\}/);
  return m ? m[0] : null;
});
console.log('   stored', doc);

console.log('\n4. reload and confirm the authored size comes back');
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);
const r = await snap();
console.log('   after reload', r.w, 'x', r.h, ' cardH', r.cardH, ' roof', r.maxH);

await page.screenshot({ path: `${OUT}/t11-resize-fixed.png` });
console.log('\nerrors', errors.slice(0, 5));
await browser.close();
