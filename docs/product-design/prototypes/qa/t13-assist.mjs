/** Assist: does Accept leave a box behind, and can the panel be closed? */
import { chromium, outDir } from './env.mjs';

const OUT = outDir();
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
await page.waitForTimeout(5000);

const frame = () => page.frames().find((f) => f.url().includes('authoring'));
const assist = () => frame().evaluate(() => {
  const s = document.querySelector('.assist-preview');
  const wrap = document.querySelector('.overlay-step-assist');
  if (!s) return { panel: null, wrapperOpen: wrap?.getAttribute('data-overlay-assist') ?? null };
  const r = s.getBoundingClientRect();
  return {
    panel: { phase: s.dataset.assistPhase, h: Math.round(r.height), w: Math.round(r.width),
      text: s.textContent.replace(/\s+/g, ' ').trim().slice(0, 120),
      buttons: [...s.querySelectorAll('button')].map((b) => b.dataset.assistAction || b.textContent.trim()) },
    wrapperOpen: wrap?.getAttribute('data-overlay-assist') ?? null,
  };
});
const shot = (name, clip) => page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });

const ask = async () => {
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2200);
};

console.log('1. ask from the palette');
await ask();
let s = await assist();
console.log('   ', JSON.stringify(s.panel), 'wrapper=', s.wrapperOpen);
await shot('t13-assist-preview', { x: 1000, y: 180, width: 440, height: 320 });

console.log('\n2. Accept — this used to leave an empty box');
await frame().evaluate(() => document.querySelector('[data-assist-action="accept"]')?.click());
await page.waitForTimeout(1500);
s = await assist();
console.log('   panel:', JSON.stringify(s.panel), ' wrapper=', s.wrapperOpen);
console.log('   >>>', s.panel === null ? 'GONE' : 'STILL THERE');
await shot('t13-assist-after-accept', { x: 1000, y: 180, width: 440, height: 320 });

console.log('\n3. ask again, then close with the ✕');
await ask();
s = await assist();
console.log('   open again, buttons:', JSON.stringify(s.panel?.buttons));
await frame().evaluate(() => document.querySelector('[data-assist-action="close"]')?.click());
await page.waitForTimeout(800);
s = await assist();
console.log('   after ✕:', s.panel === null ? 'CLOSED' : JSON.stringify(s.panel));

console.log('\n4. ask again, then Escape');
await ask();
await frame().evaluate(() => {
  const el = document.querySelector('.assist-preview');
  el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await page.waitForTimeout(800);
s = await assist();
console.log('   after Esc:', s.panel === null ? 'CLOSED' : JSON.stringify(s.panel));

console.log('\n5. close while it is still drafting (working phase)');
await page.keyboard.press('Meta+k');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
const working = await assist();
console.log('   phase while drafting:', working.panel?.phase, ' has close:', working.panel?.buttons.includes('close'));
await frame().evaluate(() => document.querySelector('[data-assist-action="close"]')?.click());
await page.waitForTimeout(2500);
s = await assist();
console.log('   after closing mid-draft:', s.panel === null ? 'CLOSED and stayed closed' : JSON.stringify(s.panel));

console.log('\nerrors:', errors.slice(0, 6));
await browser.close();
