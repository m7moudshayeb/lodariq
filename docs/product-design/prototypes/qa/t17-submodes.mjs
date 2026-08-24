/** Appearance / Release / History open as sub-modes. What do they look like now? */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('build');
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
await page.keyboard.press('Meta+k');
await page.waitForTimeout(600);
await page.keyboard.type('flow');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

const frame = () => page.frames().find((f) => f.url().includes('authoring'));

for (const tab of ['appearance', 'release', 'recovery']) {
  // back to operations first
  const inOps = await frame().evaluate(() => Boolean(document.querySelector('.operations-hub')));
  if (!inOps) {
    await frame().evaluate(() => document.querySelector('.panel-mode-back')?.click());
    await page.waitForTimeout(1200);
  }
  const clicked = await frame().evaluate((t) => {
    const b = document.querySelector(`[data-operations-tab="${t}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, tab);
  if (!clicked) { console.log(tab, '-> no nav row'); continue; }
  await page.waitForTimeout(1600);
  const state = await frame().evaluate(() => ({
    inOperations: Boolean(document.querySelector('.operations-hub')),
    shellClass: document.documentElement.querySelector('.shell')?.className ?? null,
    heading: document.querySelector('[data-panel-mode-heading]')?.textContent?.trim() ?? null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    hasBack: Boolean(document.querySelector('.panel-mode-back')),
  }));
  console.log(tab, JSON.stringify(state));
  await page.screenshot({ path: `${OUT}/submode-${tab}.png` });
}
console.log('errors:', errors.slice(0, 6));
await browser.close();
