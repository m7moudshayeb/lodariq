import { chromium } from '/Users/mahmoudshayeb/Desktop/lodariq/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';

const OUT = '/private/tmp/claude-501/-Users-mahmoudshayeb-Desktop-lodariq/967f94f7-3061-4061-87bf-c507d2fc30a9/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log('[proto]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[proto:err]', e.message));

await page.goto('file:///Users/mahmoudshayeb/Desktop/lodariq/docs/product-design/prototypes/authoring-spec.html');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/proto-01.png` });

// Enumerate the Lodariq layer children that are visible
const inv = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('#lqlayer > *')) {
    const r = el.getBoundingClientRect();
    out.push({ id: el.id, cls: el.className, visible: r.width > 0 && r.height > 0, w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
});
console.log(JSON.stringify(inv, null, 1));

await browser.close();
