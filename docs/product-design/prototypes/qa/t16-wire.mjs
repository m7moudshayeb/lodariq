/** Disabled-with-a-reason, not hidden — the WIRE_ convention, on screen. */
import { chromium, outDir } from './env.mjs';
const OUT = outDir();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5177/');
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload(); await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring()); await page.waitForTimeout(5000);
await page.keyboard.press('Meta+k'); await page.waitForTimeout(600);
await page.keyboard.type('flow'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(1800);
const frame = () => page.frames().find((f) => f.url().includes('authoring'));
await frame().evaluate(() => document.querySelector('[data-operations-tab="check"]')?.click());
await page.waitForTimeout(900);
console.log('CHECK actions');
console.log(JSON.stringify(await frame().evaluate(() =>
  [...document.querySelectorAll('.operations-check-actions button')].map((b) => ({
    label: b.textContent.trim(), disabled: b.disabled, reason: b.title || null,
    opacity: getComputedStyle(b).opacity,
  }))), null, 1));
console.log('note:', await frame().evaluate(() =>
  [...document.querySelectorAll('.operations-check .operations-note')].map((p) => p.textContent.trim())));
console.log('plan footer:', await frame().evaluate(() =>
  document.querySelector('.operations-hub-plan')?.textContent?.replace(/\s+/g,' ').trim()));
await page.screenshot({ path: `${OUT}/t16-wire-check.png` });
console.log('errors:', errors.slice(0, 5));
await browser.close();
