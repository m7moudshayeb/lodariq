/** The build's Operations sheet, section by section, plus what paints it. */
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

/* what is actually painting the sheet */
const paint = await frame().evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, color: cs.color };
  };
  return {
    root: (() => { const cs = getComputedStyle(document.documentElement);
      return { bg: cs.backgroundColor, color: cs.color, scheme: cs.colorScheme }; })(),
    body: pick('body'),
    canvas: pick('.panel-canvas'),
    documentPage: pick('.document-page'),
    workspace: pick('.panel-reference-workspace'),
    shell: pick('.panel-mode-shell'),
    nav: pick('.operations-hub-nav'),
    bodyEl: pick('.operations-hub-body'),
    footer: pick('.panel-workspace-footer'),
    hasFooter: Boolean(document.querySelector('.panel-workspace-footer')),
  };
});
console.log('WHAT PAINTS THE SHEET');
console.log(JSON.stringify(paint, null, 1));

/* iframe host-side */
const host = await page.evaluate(() => {
  const h = [...document.querySelectorAll('*')].find((n) => n.shadowRoot?.querySelector('[data-overlay-root]'));
  const iframe = h?.querySelector('iframe') ?? document.querySelector('iframe[src*="authoring"]');
  const cs = getComputedStyle(iframe);
  return { bg: cs.backgroundColor, scheme: cs.colorScheme, inlineBg: iframe.style.background };
});
console.log('IFRAME', JSON.stringify(host));

const tabs = ['flow', 'storyboard', 'batch', 'templates', 'appearance', 'translation', 'narration',
  'audience', 'experiment', 'check', 'analytics', 'release', 'review', 'recovery',
  'collaboration', 'share'];
for (const t of tabs) {
  const ok = await frame().evaluate((id) => {
    const b = document.querySelector(`[data-operations-tab="${id}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, t);
  if (!ok) { console.log('  no nav row for', t); continue; }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${t}.png` });
}
console.log('errors:', errors.slice(0, 6));
await browser.close();
