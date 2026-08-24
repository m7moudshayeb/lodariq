/**
 * Operations → Language, with locale variants in the document (#12).
 *
 * The section had only ever been rendered empty, so the coverage table, its
 * meters and "Still to write" were built but never watched with data. This walks
 * the populated shape and prints what each row actually says.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t21');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5177/');
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);

const frame = page.frames().find((f) => f.url().includes('authoring.html'));
if (!frame) throw new Error('authoring frame not found');

// ⌘K → Language is the route a creator has; it exercises the palette on the way.
await page.keyboard.press('Meta+k');
await page.waitForTimeout(600);
await page.keyboard.type('Language');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1800);

const shape = await frame.evaluate(() => {
  const section = document.querySelector('.operations-language');
  if (!section) return { missing: true };
  const rows = [...section.querySelectorAll('.ops-table tbody tr')].map((tr) =>
    [...tr.children].map((td) => (td.textContent || '').trim().replace(/\s+/gu, ' ')),
  );
  const meters = [...section.querySelectorAll('.ops-meter')].map((m) => {
    const fill = m.querySelector('*');
    return {
      width: fill ? getComputedStyle(fill).width : null,
      text: (m.textContent || '').trim(),
    };
  });
  const still = [...section.querySelectorAll('.ops-list li')].map((li) =>
    (li.textContent || '').trim().replace(/\s+/gu, ' '),
  );
  const boxes = [...section.querySelectorAll('.ops-box h3')].map((h) =>
    (h.textContent || '').trim().replace(/\s+/gu, ' '),
  );
  return { rows, meters, still, boxes, bg: getComputedStyle(section).backgroundColor };
});

console.log('BOXES', JSON.stringify(shape.boxes, null, 1));
console.log('\nCOVERAGE TABLE');
for (const row of shape.rows ?? []) console.log('  ', JSON.stringify(row));
console.log('\nMETERS', JSON.stringify(shape.meters));
console.log('\nSTILL TO WRITE');
for (const item of shape.still ?? []) console.log('  ', item);

const nav = await frame.evaluate(() => {
  const row = document.querySelector('[data-operations-tab="translation"]');
  return row ? (row.textContent || '').trim().replace(/\s+/gu, ' ') : null;
});
console.log('\nNAV ROW', JSON.stringify(nav));

await page.screenshot({ path: `${OUT}/language.png` });
console.log('\nerrors:', JSON.stringify(errors));
await browser.close();
