/** The Release blocker card's real geometry inside the sheet. */
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

/* a bare step gives Release something to be blocked by */
await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  host?.shadowRoot?.querySelector('[data-step-command="add"], [data-action="add-step"], [aria-label*="Add step" i]')?.click();
});
await page.waitForTimeout(2500);

await page.keyboard.press('Meta+k');
await page.waitForTimeout(600);
await page.keyboard.type('check');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(2000);

const frame = () => page.frames().find((f) => f.url().includes('authoring'));
await frame().evaluate(() => document.querySelector('[data-operations-tab="release"]')?.click());
await page.waitForTimeout(1600);
const box = await frame().evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x),
      display: cs.display, justifySelf: cs.justifySelf, gap: cs.gap,
      padding: cs.padding, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
    };
  };
  return {
    body: pick('.operations-hub-body'),
    shell: pick('.operations-hub-body .panel-mode-shell'),
    panelBody: pick('.operations-hub-body .panel-mode-body'),
    card: pick('.release-blocker-card'),
    heading: pick('.release-blocker-card .panel-mode-card-heading'),
    truth: pick('.release-blocker-card .panel-release-truth'),
    button: pick('.release-blocker-card button'),
    truthTop: pick('.operations-hub-body > .panel-mode-shell .panel-release-truth'),
  };
});
console.log(JSON.stringify(box, null, 1));
await page.screenshot({ path: `${OUT}/release-card.png` });
console.log('errors:', errors.slice(0, 5));
await browser.close();
