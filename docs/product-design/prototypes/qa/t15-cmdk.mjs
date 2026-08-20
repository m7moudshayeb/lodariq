/** The forwarded chord, and the prompt row's ✕, driven the way a person would. */
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

const ev = async (fn) => page.evaluate((body) => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  return new Function('root', 'host', body)(host.shadowRoot, host);
}, fn);
const frame = () => page.frames().find((f) => f.url().includes('authoring'));
const paletteOpen = () => ev(`const p = root.querySelector('.overlay-palette'); return p ? !p.hidden : null;`);

console.log('A. ⌘K pressed INSIDE the frame document — the forward path');
console.log('   palette before:', await paletteOpen());
await frame().evaluate(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'k', metaKey: true, bubbles: true, cancelable: true,
  }));
});
await page.waitForTimeout(800);
const after = await paletteOpen();
console.log('   palette after :', after, after ? '>>> FORWARDED AND OPENED' : '>>> FAILED');
await page.screenshot({ path: `${OUT}/t15-cmdk-forwarded.png`, clip: { x: 390, y: 76, width: 660, height: 300 } });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('\nB. ⌘K no longer opens the in-frame prompt row');
console.log('   prompt row present:', await frame().evaluate(() => Boolean(document.querySelector('.assist-prompt'))));

console.log('\nC. the toolbar Assist control opens the prompt row, and it closes with the X');
await frame().evaluate(() => document.querySelector('[data-toolbar-control="assist"]')?.click());
await page.waitForTimeout(700);
const menu = await frame().evaluate(() =>
  [...document.querySelectorAll('.rich-content-assist-menu button, [role="menu"] button')]
    .map((b) => b.textContent?.trim()).filter(Boolean));
console.log('   assist menu:', JSON.stringify(menu));
await frame().evaluate(() => {
  const ask = [...document.querySelectorAll('.rich-content-assist-menu button, [role="menu"] button')]
    .find((b) => /ask/i.test(b.textContent ?? ''));
  ask?.click();
});
await page.waitForTimeout(900);
const prompt = await frame().evaluate(() => {
  const p = document.querySelector('.assist-prompt');
  if (!p) return { open: false };
  const r = p.getBoundingClientRect();
  const close = p.querySelector('[data-assist-action="close-prompt"]');
  return { open: true, w: Math.round(r.width), h: Math.round(r.height),
    close: Boolean(close), closeLabel: close?.getAttribute('aria-label') ?? null };
});
console.log('   prompt row:', JSON.stringify(prompt));
if (prompt.open) {
  await page.screenshot({ path: `${OUT}/t15-prompt-with-close.png`, clip: { x: 900, y: 140, width: 540, height: 340 } });
  await frame().evaluate(() => document.querySelector('[data-assist-action="close-prompt"]')?.click());
  await page.waitForTimeout(700);
  const gone = await frame().evaluate(() => !document.querySelector('.assist-prompt'));
  console.log('   after X:', gone ? 'CLOSED' : 'STILL OPEN');
}

console.log('\nerrors:', errors.slice(0, 6));
await browser.close();
