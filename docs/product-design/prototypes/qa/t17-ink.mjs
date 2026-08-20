/** Which rule is still painting the sheet's text with the light ink? */
import { chromium } from './env.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

const frame = page.frames().find((f) => f.url().includes('authoring'));
const out = await frame.evaluate(() => {
  const el = document.querySelector('.panel-canvas');
  const hits = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (!rule.selectorText || !rule.style) continue;
      const ink = rule.style.getPropertyValue('--lq-color-ink');
      const col = rule.style.getPropertyValue('color');
      if (!ink && !col) continue;
      let matches = false;
      try { matches = el.matches(rule.selectorText) || document.documentElement.matches(rule.selectorText); } catch { }
      if (matches) hits.push({ sel: rule.selectorText.slice(0, 90), ink, col });
    }
  }
  return {
    inkOnRoot: getComputedStyle(document.documentElement).getPropertyValue('--lq-color-ink'),
    inkOnCanvas: getComputedStyle(el).getPropertyValue('--lq-color-ink'),
    colorOnCanvas: getComputedStyle(el).color,
    hits,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
