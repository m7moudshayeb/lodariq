/** Every section: header lede present, body lede not repeating it. */
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

const TABS = ['flow','storyboard','batch','templates','translation','narration',
  'audience','experiment','check','review','collaboration','share'];
let bad = 0;
for (const id of TABS) {
  await frame().evaluate((t) => document.querySelector(`[data-operations-tab="${t}"]`)?.click(), id);
  await page.waitForTimeout(800);
  const r = await frame().evaluate(() => {
    const head = document.querySelector('.panel-mode-subtitle')?.textContent?.replace(/\s+/g,' ').trim() ?? '';
    const body = document.querySelector('.operations-hub-body .operations-lede')?.textContent?.replace(/\s+/g,' ').trim() ?? '';
    const title = document.querySelector('[data-panel-mode-heading]')?.textContent?.trim();
    const lines = Math.round((document.querySelector('.panel-mode-subtitle')?.getBoundingClientRect().height ?? 0) / 21);
    return { title, head, body, lines };
  });
  // A body lede that restates the header is the duplication we removed.
  const dup = r.body && r.head && (r.head.startsWith(r.body.slice(0, 40)) || r.body.startsWith(r.head.slice(0, 40)));
  if (dup) { bad += 1; console.log(`DUPLICATE LEDE [${id}]`); }
  console.log(`[${id}] ${r.title} — header ${r.lines} line(s)${r.body ? ` · body: "${r.body.slice(0,60)}…"` : ''}`);
}
console.log('\nduplicate ledes:', bad);
await frame().evaluate(() => document.querySelector('[data-operations-tab="templates"]')?.click());
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/t16-final-templates.png` });
await frame().evaluate(() => document.querySelector('[data-operations-tab="check"]')?.click());
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/t16-final-check.png` });
console.log('errors:', errors.slice(0, 6));
await browser.close();
