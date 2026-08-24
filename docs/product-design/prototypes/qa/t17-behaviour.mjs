/** Does the sheet actually do things? Selection, close, tab switching. */
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

/* batch: tick a step, do the operations light up? */
await frame().evaluate(() => document.querySelector('[data-operations-tab="batch"]')?.click());
await page.waitForTimeout(700);
const before = await frame().evaluate(() => ({
  selectedTag: document.querySelector('.tour-batch-workspace .ops-tag')?.textContent?.trim(),
  disabled: [...document.querySelectorAll('.tour-batch-operation .ops-btn')].filter((b) => b.disabled).length,
  total: document.querySelectorAll('.tour-batch-operation .ops-btn').length,
}));
await frame().evaluate(() => document.querySelector('.tour-batch-table input[type=checkbox]')?.click());
await page.waitForTimeout(700);
const after = await frame().evaluate(() => ({
  selectedTag: document.querySelector('.tour-batch-workspace .ops-tag')?.textContent?.trim(),
  disabled: [...document.querySelectorAll('.tour-batch-operation .ops-btn')].filter((b) => b.disabled).length,
  total: document.querySelectorAll('.tour-batch-operation .ops-btn').length,
  rowSelected: document.querySelector('.tour-batch-table tr[data-selected="true"]') !== null,
}));
console.log('BATCH before', JSON.stringify(before));
console.log('BATCH after ', JSON.stringify(after));
await page.screenshot({ path: `${OUT}/batch-selected.png` });

/* every nav row reachable, each renders a head + at least one box */
const rows = await frame().evaluate(() =>
  [...document.querySelectorAll('[data-operations-tab]')].map((b) => b.dataset.operationsTab));
const report = {};
for (const id of rows) {
  const ok = await frame().evaluate((tab) => {
    const b = document.querySelector(`[data-operations-tab="${tab}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, id);
  if (!ok) continue;
  await page.waitForTimeout(550);
  report[id] = await frame().evaluate(() => ({
    head: document.querySelector('.operations-hub-head h2')?.textContent?.trim() ?? null,
    lede: Boolean(document.querySelector('.operations-hub-head p')?.textContent?.trim()),
    boxes: document.querySelectorAll('.operations-hub-body .ops-box').length,
    legacy: document.querySelectorAll('.operations-hub-body .operations-card, .operations-hub-body .operations-table').length,
    close: Boolean(document.querySelector('.operations-hub-close')),
    nav: Boolean(document.querySelector('.operations-hub-nav')),
    innerHeader: document.querySelectorAll('.operations-hub-body .panel-mode-header').length,
  }));
}
console.log('SECTIONS');
for (const [k, v] of Object.entries(report)) console.log(' ', k.padEnd(14), JSON.stringify(v));

/* Esc closes the sheet */
await frame().evaluate(() => document.querySelector('[data-operations-tab="check"]')?.click());
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
const stillOpen = await page.evaluate(() => {
  const h = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  const iframe = h?.querySelector('iframe');
  return iframe ? getComputedStyle(iframe).width : 'gone';
});
console.log('after Esc, iframe width:', stillOpen, '(1440px = still full-bleed)');

console.log('errors:', errors.slice(0, 8));
await browser.close();
