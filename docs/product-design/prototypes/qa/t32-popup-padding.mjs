/**
 * Popup padding, on both axes, and the card staying on screen (§4.3).
 *
 * Three things that were each broken in their own way:
 *
 *  - the authoring card applied the composition padding to its left edge only,
 *    so what a creator composed in did not match what shipped;
 *  - the storyboard popup read no padding variable at all, so the preset and
 *    the sliders both looked inert there;
 *  - a wide card beside a target near the left edge was placed off-screen,
 *    because the placement chooser scored overlap and off-screen overlaps
 *    nothing.
 *
 * Seeds a document straight into storage rather than driving the inspector, so
 * the whole chain is under test — sanitiser, recipe, variables, CSS.
 *
 *   node docs/product-design/prototypes/qa/t32-popup-padding.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium, REPO } from './env.mjs';
import { join } from 'node:path';

const PORT = process.env.SDK_PORT ?? '5177';
const FIXTURE = join(REPO, 'packages/schema/fixtures/tour.linear.v1.json');

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 200));
});

const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures.push(name);
};

/** The shipped fixture with one tooltip's layout replaced. */
function seededDocument(layout) {
  const document = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  for (const block of document.blocks) {
    if (block.type !== 'tourStep') continue;
    for (const child of block.children ?? []) {
      if (child.type !== 'tooltip') continue;
      child.props = { ...child.props, tooltipLayout: { ...child.props?.tooltipLayout, ...layout } };
    }
  }
  return document;
}

async function openWith(layout) {
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate(
    ([document, routeKey]) => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem(`lodariq:doc:${document.id}`, JSON.stringify(document));
      localStorage.setItem(
        'lodariq:creator-index:wk_local_dev',
        JSON.stringify([
          { documentId: document.id, routeKey, title: document.title, type: document.type },
        ]),
      );
    },
    [seededDocument(layout), '/'],
  );
  await page.reload();
  await page.waitForSelector('[data-lodariq-creator-launcher="true"]', { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__meridian?.openAuthoring?.());
  await page.waitForTimeout(7000);
}

/** The authoring card, wherever it lives — it is inside the authoring iframe. */
const readCard = async () => {
  const probe = () => {
    const found = [];
    const walk = (root) => {
      for (const node of root.querySelectorAll('.overlay-step-card')) found.push(node);
      for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
    };
    walk(document);
    const card = found[0];
    if (!card) return null;
    const style = getComputedStyle(card);
    const rect = card.getBoundingClientRect();
    return {
      top: style.paddingTop,
      right: style.paddingRight,
      bottom: style.paddingBottom,
      left: style.paddingLeft,
      scrollbarWidth: style.scrollbarWidth,
      width: Math.round(rect.width),
    };
  };
  for (const frame of page.frames()) {
    let card;
    try {
      card = await frame.evaluate(probe);
    } catch {
      continue;
    }
    if (card) return card;
  }
  return null;
};

// ── 1. Both axes authored, and different from each other ─────────────────────
await openWith({ paddingBlockPx: 4, paddingInlinePx: 40 });
let card = await readCard();
check('the authoring card is present', card !== null);
check(
  'the vertical slider drives top and bottom',
  card?.top === '4px' && card?.bottom === '4px',
  `top=${card?.top} bottom=${card?.bottom}`,
);
check(
  'the horizontal slider drives left and right',
  card?.left === '40px' && card?.right === '40px',
  `left=${card?.left} right=${card?.right}`,
);
check(
  'the two axes stay independent',
  card?.top !== card?.left,
  'one slider must not move the other',
);

// ── 2. One axis authored: the other keeps the preset ─────────────────────────
await openWith({ padding: 'relaxed', paddingInlinePx: 40 });
card = await readCard();
check(
  'an unauthored axis still follows the preset',
  card?.top === card?.bottom && card?.top !== '40px' && card?.left === '40px',
  `top=${card?.top} left=${card?.left} (preset relaxed)`,
);
/*
 * The number, not just "something different". The preset rules lived only in
 * the step inspector's stylesheet, which the overlay does not load, so Compact
 * and Relaxed both silently resolved to the standard 12px here — a control
 * that looks live and does nothing.
 */
check(
  'and the preset is the relaxed step, not the standard one',
  card?.top === '16px',
  `top=${card?.top}, expected 16px for relaxed`,
);

await openWith({ padding: 'compact' });
card = await readCard();
check(
  'compact is its own step too',
  card?.top === '8px' && card?.left === '8px',
  `${card?.top} / ${card?.left}, expected 8px`,
);

// ── 3. No override at all: four equal sides, as the runtime pads it ───────────
await openWith({ padding: 'standard' });
card = await readCard();
check(
  'the preset alone pads all four sides equally',
  card && card.top === card.right && card.right === card.bottom && card.bottom === card.left,
  `${card?.top} ${card?.right} ${card?.bottom} ${card?.left}`,
);
check(
  'and it is not zero on any side — this was padding-left only',
  card?.right !== '0px',
  `right=${card?.right}`,
);

// ── 4. Scrollbars are the frame's, not the platform's ────────────────────────
check(
  'the card declares the thin scrollbar',
  card?.scrollbarWidth === 'thin',
  `scrollbar-width=${card?.scrollbarWidth}`,
);

// ── 5. A wide card stays on screen ───────────────────────────────────────────
await openWith({ widthPx: 720 });
card = await readCard();
const placement = await page.evaluate(() => {
  const found = [];
  const walk = (root) => {
    for (const node of root.querySelectorAll('[data-lodariq-authoring-frame], iframe')) {
      found.push(node);
    }
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
  };
  walk(document);
  const frame = found.find((node) => node.getBoundingClientRect().width > 200);
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  return {
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    width: Math.round(rect.width),
    viewport: window.innerWidth,
  };
});
check(
  'a 720px card is not placed off the left edge',
  placement !== null && placement.left >= -1,
  JSON.stringify(placement),
);
check(
  'and not off the right edge either',
  placement !== null && placement.right <= placement.viewport + 1,
  JSON.stringify(placement),
);

console.log(`\n${errors.length} console error(s)`);
for (const error of errors.slice(0, 6)) console.log(`  ${error}`);
console.log(failures.length ? `\nFAILED: ${failures.join(', ')}` : '\nAll checks passed.');
await browser.close();
process.exit(failures.length ? 1 : 0);
