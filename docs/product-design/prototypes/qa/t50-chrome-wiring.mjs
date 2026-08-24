/**
 * The one that answers "does the mode pill still print rows that do nothing?"
 *
 *   pnpm --filter @lodariq/sdk-authoring build   # the fixture host reads dist
 *   SDK_PORT=5177 node docs/product-design/prototypes/qa/t50-chrome-wiring.mjs
 *
 * Three rows — zoom in, zoom out, reset — were live, enabled, and wrote a
 * controller field no snapshot carried. The surface they name is not on screen
 * in overlay editing at all: the card is drawn at the size it will ship, and
 * `frame-layout.ts` owns its box, so nothing in the frame may scale it. The
 * rows are now drawn disabled with that reason, and this proves both halves —
 * that they are disabled, and that the reason is printed next to them.
 *
 * ASSERT=1 exits non-zero on a regression.
 */
import { chromium } from './env.mjs';

const URL = `http://localhost:${process.env.SDK_PORT ?? 5177}/`;
const assert = process.env.ASSERT === '1';
const failures = [];

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
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

/** The pill lives in the shell's shadow root, beside the frame. */
const menu = await page.evaluate(async () => {
  const shellHost = [...document.querySelectorAll('*')].find((node) =>
    node.shadowRoot?.querySelector('[data-pill-menu]'),
  );
  const root = shellHost?.shadowRoot;
  if (!root) return { error: 'no shell shadow root' };
  root
    .querySelector('[data-pill-menu]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  await new Promise((resolve) => setTimeout(resolve, 350));

  const describe = (key) => {
    const found = root.querySelector(`[data-pill-${key}]`);
    if (!found) return null;
    return {
      label: found.textContent?.replace(/\s+/gu, ' ').trim(),
      disabled: found.hasAttribute('disabled') || found.getAttribute('aria-disabled') === 'true',
    };
  };
  const notes = [...root.querySelectorAll('.overlay-mode-pill-menu-note')].map((node) =>
    node.textContent?.replace(/\s+/gu, ' ').trim(),
  );
  return {
    zoomIn: describe('zoom-in'),
    zoomOut: describe('zoom-out'),
    zoomReset: describe('zoom-reset'),
    record: describe('record'),
    notes,
  };
});

console.log(JSON.stringify(menu, null, 2));

for (const key of ['zoomIn', 'zoomOut', 'zoomReset']) {
  const found = menu[key];
  if (!found) {
    failures.push(`${key} row is missing — it should be printed, not hidden (§14.4)`);
    continue;
  }
  if (!found.disabled) failures.push(`${key} is enabled, so it will move nothing when clicked`);
}
const reason = (menu.notes ?? []).some((note) => note?.includes('size it will ship'));
if (!reason) failures.push('the disabled zoom rows carry no reason');
if (!menu.record) failures.push('the record row is missing');

console.log(failures.length ? `\nFAIL\n  ${failures.join('\n  ')}` : '\nOK — no row lies');
await browser.close();
if (assert && failures.length) process.exit(1);
