/** One clean screenshot per thing that changed, for review. */
import { chromium, outDir } from './env.mjs';

const OUT = outDir();
const SCRIPT = 'Start here. This button is how every new project begins — give it a name and Meridian does the rest.';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const open = async () => {
  await page.evaluate(() => window.__meridian.openAuthoring());
  await page.waitForTimeout(4800);
};
const ev = async (fn) => page.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  return new Function('root', 'host', body)(host.shadowRoot, host);
}, fn);

await page.goto('http://localhost:5177/');
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload();
await page.waitForTimeout(2200);
await open();

// dismiss the opening toast so it does not sit on top of every shot
await ev(`root.querySelectorAll('.overlay-toast').forEach(t => t.remove()); return 1;`);

// 1 — the palette
await page.keyboard.press('Meta+k');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/shot-1-palette.png`, clip: { x: 390, y: 76, width: 660, height: 400 } });

// 2 — a typed sentence read as a proposed edit
await page.keyboard.type('make the wording friendlier for new users');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/shot-2-palette-sentence.png`, clip: { x: 390, y: 76, width: 660, height: 190 } });

// 3 — the ask lands in the preview → accept / reject loop, with a ✕
await page.keyboard.press('Enter');
await page.waitForTimeout(2400);
await page.screenshot({ path: `${OUT}/shot-3-assist.png`, clip: { x: 1000, y: 170, width: 440, height: 330 } });

// 4 — accepted: no box left behind
await page.frames().find((f) => f.url().includes('authoring'))
  .evaluate(() => document.querySelector('[data-assist-action="accept"]')?.click());
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/shot-4-after-accept.png`, clip: { x: 1000, y: 170, width: 440, height: 330 } });

// 5 — resize, mid-drag
const h = await ev(`
  const el = root.querySelector('[data-overlay-frame] [data-edge-resize="se"]');
  const r = el.getBoundingClientRect();
  return { cx: r.x + r.width/2, cy: r.y + r.height/2 };
`);
await page.mouse.move(h.cx, h.cy);
await page.mouse.down();
for (const f of [0.4, 0.75, 1]) { await page.mouse.move(h.cx + 120 * f, h.cy + 90 * f); await page.waitForTimeout(80); }
await page.screenshot({ path: `${OUT}/shot-5-resizing.png`, clip: { x: 760, y: 70, width: 680, height: 420 } });
await page.mouse.up();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/shot-6-resized.png`, clip: { x: 760, y: 70, width: 680, height: 420 } });

// 6 — the show chip
await ev(`root.querySelector('[data-card-tool="hide"]')?.click(); return 1;`);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/shot-7-show-chip.png`, clip: { x: 1120, y: 800, width: 320, height: 100 } });
await ev(`root.querySelector('.overlay-show-chip')?.click(); return 1;`);
await page.waitForTimeout(900);

// 7 — captions in preview (needs a script on the step)
const wrote = await page.evaluate((script) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('lodariq:doc:'));
  if (!key) return false;
  const doc = JSON.parse(localStorage[key]);
  const step = doc.blocks.find((b) => b.type === 'tourStep');
  step.props = { ...step.props, narration: { script } };
  localStorage[key] = JSON.stringify(doc);
  return true;
}, SCRIPT);
if (wrote) {
  await page.reload();
  await page.waitForTimeout(2200);
  await open();
  await ev(`root.querySelectorAll('.overlay-toast').forEach(t => t.remove()); return 1;`);
  await ev(`root.querySelector('[data-pill-preview]')?.click(); return 1;`);
  await page.waitForTimeout(2600);
  await ev(`root.querySelectorAll('.overlay-toast').forEach(t => t.remove()); return 1;`);
  await page.screenshot({ path: `${OUT}/shot-8-captions.png`, clip: { x: 300, y: 640, width: 840, height: 260 } });
}
console.log('shots written; narration seeded:', wrote);
console.log('errors:', errors.slice(0, 5));
await browser.close();
