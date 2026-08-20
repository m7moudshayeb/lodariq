/**
 * The three openers are shared. From the canvas they must still open the
 * full-surface mode; from inside Operations they must select the section.
 */
import { chromium } from './env.mjs';

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
const state = async () => frame().evaluate(() => ({
  inOperations: Boolean(document.querySelector('.operations-hub')),
  section: document.querySelector('.operations-hub-head h2')?.textContent?.trim() ?? null,
  modeHeading: (() => {
    const h = document.querySelector('[data-panel-mode-heading]');
    return h && h.offsetParent !== null ? h.textContent.trim() : null;
  })(),
}));

const palette = async (query) => {
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(600);
  await page.keyboard.type(query);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
};

/* 1. from the canvas — must open the full mode, not the sheet */
await palette('appearance');
console.log('canvas -> palette appearance:', JSON.stringify(await state()));

/* back to the canvas */
await frame().evaluate(() => document.querySelector('.panel-mode-back')?.click());
await page.waitForTimeout(1200);

/* 2. open Operations, then ask again — must select the section, not navigate */
await palette('flow');
console.log('sheet opened:', JSON.stringify(await state()));
/* Check's publish button calls openReleaseVerificationMode from inside the
   sheet — the exact path the routing change governs. */
await frame().evaluate(() => document.querySelector('[data-operations-tab="check"]')?.click());
await page.waitForTimeout(700);
const publish = await frame().evaluate(() => {
  const b = document.querySelector('[data-check-action="publish"]');
  if (!b || b.disabled) return { clicked: false, disabled: b?.disabled ?? null };
  b.click();
  return { clicked: true };
});
await page.waitForTimeout(1200);
console.log('check publish ->', JSON.stringify(publish), JSON.stringify(await state()));

/* And the nav row for Release itself. */
await frame().evaluate(() => document.querySelector('[data-operations-tab="recovery"]')?.click());
await page.waitForTimeout(900);
console.log('nav recovery ->', JSON.stringify(await state()));

console.log('errors:', errors.slice(0, 6));
await browser.close();
