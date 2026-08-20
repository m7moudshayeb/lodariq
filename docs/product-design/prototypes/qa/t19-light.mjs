/** Every element inside the sheet still painting itself light, and the rule doing it. */
import { chromium, outDir } from './env.mjs';

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

const scan = () => frame().evaluate(() => {
  const luminance = (rgb) => {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    if (alpha < 0.5) return null;
    return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
  };
  const seen = new Map();
  for (const el of document.querySelectorAll('.operations-hub *')) {
    const cs = getComputedStyle(el);
    if (el.offsetParent === null && cs.position !== 'fixed') continue;
    const lum = luminance(cs.backgroundColor);
    if (lum === null || lum < 0.5) continue;
    const key = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 3).join('.')}`;
    if (!seen.has(key)) {
      seen.set(key, { bg: cs.backgroundColor, color: cs.color, text: (el.textContent || '').trim().slice(0, 40) });
    }
  }
  return [...seen.entries()].map(([k, v]) => ({ sel: k, ...v }));
});

const tabs = ['flow', 'storyboard', 'batch', 'templates', 'appearance', 'translation',
  'narration', 'audience', 'experiment', 'check', 'analytics', 'release', 'review',
  'recovery', 'collaboration', 'share'];

for (const t of tabs) {
  const ok = await frame().evaluate((id) => {
    const b = document.querySelector(`[data-operations-tab="${id}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, t);
  if (!ok) continue;
  await page.waitForTimeout(600);
  const hits = await scan();
  if (hits.length) {
    console.log(`\n${t}`);
    for (const h of hits) console.log('   ', h.sel, '|', h.bg, '| text:', JSON.stringify(h.text));
  }
}

/* an open dropdown, which only exists while open */
await frame().evaluate(() => document.querySelector('[data-operations-tab="audience"]')?.click());
await page.waitForTimeout(700);
/* The trigger toggles on pointerdown, so a synthetic .click() never opens it. */
const trigger = frame().locator('.operations-audience .ui-select-trigger').first();
await trigger.click();
await page.waitForTimeout(800);
console.log('dropdown open:', await frame().locator('.ui-select-content').count());
await page.screenshot({ path: `${outDir('build')}/dropdown.png` });
const menu = await frame().evaluate(() => {
  const nodes = [...document.querySelectorAll('.ui-select-content, .ui-popover-content, .menu, [role="listbox"]')];
  return nodes.map((n) => ({
    cls: (n.className || '').toString().slice(0, 40),
    bg: getComputedStyle(n).backgroundColor,
    color: getComputedStyle(n).color,
    visible: n.offsetParent !== null || getComputedStyle(n).position === 'fixed',
  }));
});
console.log('\nOPEN DROPDOWN', JSON.stringify(menu));
console.log('\nerrors:', errors.slice(0, 5));
await browser.close();
