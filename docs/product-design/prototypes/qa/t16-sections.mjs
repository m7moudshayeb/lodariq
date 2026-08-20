/** Templates and Collaboration after the section pass. */
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

await frame().evaluate(() => document.querySelector('[data-operations-tab="templates"]')?.click());
await page.waitForTimeout(900);
console.log('TEMPLATES');
console.log(JSON.stringify(await frame().evaluate(() =>
  [...document.querySelectorAll('.template-card')].map((c) => ({
    name: c.querySelector('h4')?.textContent?.trim(),
    icon: Boolean(c.querySelector('h4 svg')),
    steps: c.querySelector('.template-card-steps')?.textContent?.trim() ?? null,
    targets: c.querySelector('.template-card-targets')?.textContent?.replace(/\s+/g,' ').trim(),
  }))), null, 1));
await page.screenshot({ path: `${OUT}/t16-ops-templates.png` });

await frame().evaluate(() => document.querySelector('[data-operations-tab="collaboration"]')?.click());
await page.waitForTimeout(900);
console.log('\nCOLLABORATION cards:', JSON.stringify(await frame().evaluate(() =>
  [...document.querySelectorAll('.operations-collaboration .operations-card h4')].map((h) => h.textContent.trim()))));
console.log('lock copy:', await frame().evaluate(() => {
  const cards = [...document.querySelectorAll('.operations-collaboration .operations-card')];
  const lock = cards.find((c) => /holding/i.test(c.querySelector('h4')?.textContent ?? ''));
  return lock?.textContent.replace(/\s+/g,' ').trim().slice(0, 140);
}));
await page.screenshot({ path: `${OUT}/t16-ops-collab.png` });

console.log('\nerrors:', errors.slice(0, 6));
await browser.close();
