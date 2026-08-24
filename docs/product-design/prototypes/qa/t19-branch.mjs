/** The branch workbench — rules, conditions, fallback — on the dark sheet. */
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

/* the branch node between the two steps opens the workbench */
const node = frame().locator('.react-flow__node', { hasText: 'Go to next step' }).first();
console.log('action node found:', await node.count());
await node.click();
await page.waitForTimeout(1200);
console.log('workbench present:', await frame().locator('.tour-flow-workbench').count());
console.log('transition editor:', await frame().locator('.transition-editor').count());
await page.screenshot({ path: `${OUT}/branch.png` });

/* Add branch -> fallback card; Add rule -> rule card with a condition. */
for (const label of ['Add branch', 'Add rule', 'Add condition']) {
  const button = frame().locator('button', { hasText: label }).first();
  if (await button.count()) {
    await button.click();
    await page.waitForTimeout(900);
    console.log('clicked', label);
  } else {
    console.log('no button for', label);
  }
}
await page.screenshot({ path: `${OUT}/branch-rule.png` });

const light = await frame().evaluate(() => {
  const luminance = (rgb) => {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
    return (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
  };
  const hits = [];
  for (const el of document.querySelectorAll('.tour-flow-workbench, .tour-flow-workbench *, .transition-editor, .transition-editor *')) {
    if (el.offsetParent === null) continue;
    const cs = getComputedStyle(el);
    const lum = luminance(cs.backgroundColor);
    if (lum !== null && lum > 0.5) {
      hits.push({
        cls: (el.className || '').toString().slice(0, 44),
        bg: cs.backgroundColor,
      });
    }
  }
  return hits.slice(0, 12);
});
console.log('light surfaces in the branch workbench:', JSON.stringify(light));
console.log('errors:', errors.slice(0, 5));
await browser.close();
