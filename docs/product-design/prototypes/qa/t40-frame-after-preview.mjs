/**
 * The resize ring after a preview ends.
 *
 * The frame is drawn around `max(the runtime's card rect, the editable card as
 * the frame measures it)`, and that measurement travels from inside the iframe
 * as a dataset number. The iframe is then sized from it — so the shell the
 * measurement was observed on is as tall as the answer it produces. When the
 * card shrank on its own, nothing was watching a box that had changed, and the
 * last number held: a 240px ring around a 156px card, with no event left to
 * correct it. Finishing a tour is the everyday way to land in that state.
 *
 * Only a real browser has a ResizeObserver and a real iframe, so this cannot be
 * a unit test.
 *
 *   pnpm --filter @lodariq/sdk-authoring build   # fixture host on :5177
 *   node docs/product-design/prototypes/qa/t40-frame-after-preview.mjs
 */
import { chromium } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';
/** The ring may sit a little proud of the card; it may not stand open past it. */
const ALLOWED_SLACK_PX = 24;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForSelector('[data-step-id]', { timeout: 20_000 });
await page.waitForTimeout(2_000);

const geometry = () =>
  page.evaluate(() => {
    const deep = (root, selector) => {
      const hit = root.querySelector?.(selector);
      if (hit) return hit;
      for (const element of root.querySelectorAll?.('*') ?? []) {
        if (element.shadowRoot) {
          const found = deep(element.shadowRoot, selector);
          if (found) return found;
        }
      }
      return null;
    };
    const ring = deep(document, '[data-overlay-frame]');
    const iframe =
      [...document.querySelectorAll('iframe')].find(
        (node) => node.dataset.overlayContentHeight !== undefined,
      ) ?? deep(document, 'iframe');
    const box = iframe?.contentDocument?.querySelector('.overlay-step-card');
    return {
      ring: ring ? Math.round(ring.getBoundingClientRect().height) : null,
      // What the frame actually measures, against what it last told the host.
      measured: box?.offsetHeight ?? null,
      reported: Number.parseInt(iframe?.dataset?.overlayContentHeight ?? '', 10) || null,
    };
  });

const before = await geometry();
check(
  'the ring matches the card it is drawn around, before any preview',
  before.ring !== null && Math.abs(before.ring - before.measured) <= ALLOWED_SLACK_PX,
  JSON.stringify(before),
);

await page.locator('button.overlay-mode-pill-preview').click();
await page.waitForTimeout(1_800);

// Walk the tour to its end and finish it, the way a creator checks their work.
for (let index = 0; index < 8; index += 1) {
  const finished = await page.evaluate(() => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    const buttons = [...(shadow?.querySelectorAll('button') ?? [])];
    const finish = buttons.find((button) => /finish|done|complete/i.test(button.textContent ?? ''));
    const next = buttons.find((button) => /continue|next/i.test(button.textContent ?? ''));
    (finish ?? next)?.click();
    return Boolean(finish);
  });
  await page.waitForTimeout(1_400);
  if (finished) break;
}
await page.waitForTimeout(2_500);

const after = await geometry();
check(
  'the reported height is the one the frame currently measures',
  after.reported === after.measured,
  JSON.stringify(after),
);
check(
  'the ring closes back onto the card when the tour ends',
  after.ring !== null && Math.abs(after.ring - after.measured) <= ALLOWED_SLACK_PX,
  JSON.stringify(after),
);

// Nothing arrives after this; a ring that is going to settle has settled.
await page.waitForTimeout(3_000);
const settled = await geometry();
check('and stays closed', settled.ring === after.ring, JSON.stringify(settled));

await browser.close();
process.exit(failures ? 1 : 0);
