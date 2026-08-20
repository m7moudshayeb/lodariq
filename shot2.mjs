import { chromium } from '/Users/mahmoudshayeb/Desktop/lodariq/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs';

const OUT = '/private/tmp/claude-501/-Users-mahmoudshayeb-Desktop-lodariq/967f94f7-3061-4061-87bf-c507d2fc30a9/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log('[sdk]', m.type(), m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[sdk:err]', e.message));

await page.goto('http://localhost:5175/');
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/sdk-00.png` });
try {
  await page.evaluate(() => window.__meridian.openAuthoring());
} catch (e) { console.log('openAuthoring failed', e.message); }
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/sdk-01.png` });

await browser.close();
