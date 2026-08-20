import { chromium } from './env.mjs';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5177/');
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload(); await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring()); await page.waitForTimeout(5000);
await page.keyboard.press('Meta+k'); await page.waitForTimeout(600);
await page.keyboard.type('flow'); await page.waitForTimeout(500);
await page.keyboard.press('Enter'); await page.waitForTimeout(1800);
const frame = page.frames().find((f) => f.url().includes('authoring'));
console.log(JSON.stringify(await frame.evaluate(() => {
  const h = document.querySelector('.panel-mode-header');
  const shell = document.querySelector('.panel-mode-shell');
  const sub = document.querySelector('.panel-mode-subtitle');
  const r = (el) => el ? (({width,height,x,y})=>({w:Math.round(width),h:Math.round(height),x:Math.round(x),y:Math.round(y)}))(el.getBoundingClientRect()) : null;
  return {
    shellClass: shell?.className,
    ancestors: (() => { const out=[]; let n=h?.parentElement; while(n&&out.length<6){out.push(n.className||n.tagName);n=n.parentElement;} return out; })(),
    header: r(h),
    headerCols: h ? getComputedStyle(h).gridTemplateColumns : null,
    headerPad: h ? getComputedStyle(h).padding : null,
    span: r(h?.querySelector('span')),
    strong: r(h?.querySelector('strong')),
    strongSize: h ? getComputedStyle(h.querySelector('strong')).fontSize : null,
    subtitle: r(sub),
    subtitleMax: sub ? getComputedStyle(sub).maxWidth : null,
  };
}), null, 1));
await browser.close();
