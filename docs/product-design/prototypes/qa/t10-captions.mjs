/** Captions in preview: the script shows, the toggle works, no script disables it. */
import { chromium, outDir } from './env.mjs';

const OUT = outDir();
const SCRIPT = 'Start here. This button is how every new project begins — give it a name and Meridian does the rest.';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

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

const bar = () => ev(`
  const b = root.querySelector('.overlay-preview-bar');
  const cap = root.querySelector('.overlay-captions');
  const cc = b?.querySelector('[data-preview-captions]');
  const capRect = cap && !cap.hidden ? cap.getBoundingClientRect() : null;
  const barRect = b && !b.hidden ? b.getBoundingClientRect() : null;
  return {
    barVisible: b ? !b.hidden : false,
    barBottom: barRect ? Math.round(barRect.bottom) : null,
    cc: cc ? { disabled: cc.disabled, pressed: cc.getAttribute('aria-pressed'),
      title: cc.title, opacity: getComputedStyle(cc).opacity,
      bg: getComputedStyle(cc).backgroundColor } : null,
    caption: cap ? { hidden: cap.hidden, text: cap.textContent.trim().slice(0, 90),
      bottom: capRect ? Math.round(capRect.bottom) : null,
      w: capRect ? Math.round(capRect.width) : null,
      bg: getComputedStyle(cap).backgroundColor, pe: getComputedStyle(cap).pointerEvents } : null,
  };
`);

console.log('A. preview with NO narration script');
await ev(`root.querySelector('[data-pill-preview]')?.click(); return 1;`);
await page.waitForTimeout(2500);
console.log('  ', JSON.stringify(await bar(), null, 0));
await page.screenshot({ path: `${OUT}/t10-captions-none.png`, clip: { x: 300, y: 700, width: 840, height: 200 } });

console.log('\nB. author a narration script on the step, then preview again');
await ev(`root.querySelector('[data-preview-exit]')?.click(); return 1;`);
await page.waitForTimeout(2000);

// The local doc is only written to storage once something is saved, so nudge one
// edit through first: a one-notch resize commit.
const h = await ev(`
  const hh = root.querySelector('[data-overlay-frame] [data-edge-resize="e"]');
  const r = hh.getBoundingClientRect();
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
`);
await page.mouse.move(h.cx, h.cy);
await page.mouse.down();
await page.mouse.move(h.cx + 12, h.cy);
await page.mouse.up();
await page.waitForTimeout(1500);

const wrote = await page.evaluate((script) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('lodariq:doc:'));
  if (!key) return 'no doc; keys=' + JSON.stringify(Object.keys(localStorage));
  const doc = JSON.parse(localStorage[key]);
  const step = doc.blocks.find((b) => b.type === 'tourStep');
  if (!step) return 'no step';
  step.props = { ...step.props, narration: { script } };
  localStorage[key] = JSON.stringify(doc);
  return step.id;
}, SCRIPT);
console.log('   wrote narration onto', wrote);

await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);
await ev(`root.querySelector('[data-pill-preview]')?.click(); return 1;`);
await page.waitForTimeout(2500);
let s = await bar();
console.log('   caption:', JSON.stringify(s.caption));
console.log('   cc button:', JSON.stringify(s.cc));
console.log('   caption sits above the bar?', s.caption?.bottom, '<', s.barBottom, '→', s.caption?.bottom < s.barBottom);
await page.screenshot({ path: `${OUT}/t10-captions-on.png`, clip: { x: 300, y: 660, width: 840, height: 240 } });

console.log('\nC. toggle captions off');
await ev(`root.querySelector('[data-preview-captions]')?.click(); return 1;`);
await page.waitForTimeout(600);
s = await bar();
console.log('   caption hidden:', s.caption?.hidden, ' pressed:', s.cc?.pressed);

console.log('\nD. toggle back on');
await ev(`root.querySelector('[data-preview-captions]')?.click(); return 1;`);
await page.waitForTimeout(600);
s = await bar();
console.log('   caption hidden:', s.caption?.hidden, ' pressed:', s.cc?.pressed);

console.log('\nE. exit preview — the caption must go with it');
await ev(`root.querySelector('[data-preview-exit]')?.click(); return 1;`);
await page.waitForTimeout(1800);
s = await bar();
console.log('   bar visible:', s.barVisible, ' caption hidden:', s.caption?.hidden);

console.log('\nerrors:', errors.slice(0, 6));
await browser.close();
