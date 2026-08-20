/**
 * Opens the fixture host with authoring already running, and leaves the browser
 * open so you can drive it by hand.
 *
 *   node docs/product-design/prototypes/qa/open-authoring.mjs
 *
 * HEADLESS=1 runs it without a window (for a smoke check).
 * SDK_PORT overrides the default 5177.
 */
import { chromium } from './env.mjs';

const URL = `http://localhost:${process.env.SDK_PORT ?? 5177}/`;
const headless = process.env.HEADLESS === '1';

const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL);
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);

const ring = await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) =>
    n.shadowRoot?.querySelector('[data-overlay-root]'),
  );
  const band = host?.shadowRoot.querySelector('.overlay-target-ring');
  if (!band || band.hidden) return null;
  const b = band.getBoundingClientRect();
  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
});

console.log(ring ? `Ring at ${ring.x},${ring.y} — ${ring.w}×${ring.h}` : 'No ring: the step has no resolved target.');
console.log('Click the ring\'s border band (not its middle, not a compass dot) to open the Target inspector.');

if (headless) {
  await browser.close();
} else {
  console.log('\nBrowser left open. Ctrl-C here to close it.');
  await new Promise(() => {});
}
