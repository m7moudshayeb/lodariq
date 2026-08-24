/**
 * Does the card toolbar collapse, or does it just clip?
 *
 * The bar is `overflow: hidden`, so a control that does not fit is not scrolled
 * to — it is gone. The only thing making that acceptable is that everything
 * collapsible also lives in the More menu, which means two invariants have to
 * hold at every width: the bar never scrolls (`scrollWidth === clientWidth`),
 * and More itself is never one of the things that vanishes.
 *
 * This regressed once already because the bar is portaled into the overlay's
 * toolbar slot after first render, so the measuring effect was watching the
 * wrong parent.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t27');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5177/');
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await page.reload();
await page.waitForTimeout(2200);
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForTimeout(4500);

const frame = page.frames().find((f) => f.url().includes('authoring.html'));
if (!frame) throw new Error('authoring frame missing');

// Put the caret in card copy so the formatting bar is up.
const editable = frame.locator('[contenteditable="true"]').first();
await editable.click();
await page.waitForTimeout(700);
await editable.click({ clickCount: 3 });
await page.waitForTimeout(1400);

/*
 * The slot is what the measuring effect observes, and it is flex-sized by the
 * card rather than by the window — so the viewport is the wrong knob. Driving
 * the slot directly exercises the exact ResizeObserver path that regressed.
 */
const setTrackWidth = async (width) => {
  await frame.evaluate((px) => {
    const slot = document.querySelector('.overlay-step-toolbar-slot');
    if (slot instanceof HTMLElement) slot.style.flex = `0 0 ${px}px`;
  }, width);
  await page.waitForTimeout(700);
};

const readToolbar = async () => {
  return frame.evaluate(() => {
    const bar = document.querySelector('.rich-content-toolbar[role="toolbar"]');
    if (!bar) return null;
    const collapsible = [...bar.querySelectorAll('[data-collapsible]')];
    const visibleFixed = [...bar.children].filter(
      (child) => !child.hasAttribute('data-collapsible') && !child.hidden,
    );
    return {
      barW: bar.clientWidth,
      scrollW: bar.scrollWidth,
      clipped: bar.scrollWidth > bar.clientWidth + 1,
      hidden: collapsible.filter((item) => item.hidden).length,
      total: collapsible.length,
      blockTypeLabel: bar.getAttribute('data-block-type-label'),
      // More is the escape hatch; if it is clipped there is no route to anything.
      fixedVisible: visibleFixed.length,
      moreVisible: [...bar.querySelectorAll('button')].some((button) =>
        (button.getAttribute('aria-label') || '').startsWith('More'),
      ),
      shown: [...bar.querySelectorAll('[data-collapsible]')]
        .filter((item) => !item.hidden)
        .map((item) => item.getAttribute('data-collapsible')),
    };
  });
};

console.log('TRACK   bar  scroll  clipped  collapsed  blockType  more');
const rows = [];
// Widen, then come back down: collapsing has to be reversible, not one-way.
for (const width of [900, 700, 520, 400, 300, 220, 520, 900]) {
  await setTrackWidth(width);
  const row = await readToolbar();
  if (!row) {
    console.log('  toolbar gone');
    continue;
  }
  rows.push({ width, ...row });
  console.log(
    `${String(width).padEnd(7)} ${String(row.barW).padEnd(4)} ${String(row.scrollW).padEnd(7)} ` +
      `${row.clipped ? 'CLIPPED' : 'no     '}  ${`${row.hidden}/${row.total}`.padEnd(10)} ` +
      `${String(row.blockTypeLabel).padEnd(10)} ${row.moreVisible ? 'yes' : 'NO'}`,
  );
}

const clipped = rows.filter((row) => row.clipped);
const lostMore = rows.filter((row) => !row.moreVisible);
console.log(
  clipped.length ? `\n!! clipped at ${clipped.map((r) => r.width).join(', ')}` : '\nOK never clips',
);
console.log(
  lostMore.length
    ? `!! More missing at ${lostMore.map((r) => r.width).join(', ')}`
    : 'OK More always reachable',
);

await setTrackWidth(300);
await setTrackWidth(250);
// Everything the bar dropped has to actually be in the menu.
const inMenu = await frame.evaluate(async () => {
  const more = [...document.querySelectorAll('.rich-content-toolbar button')].find((button) =>
    (button.getAttribute('aria-label') || '').startsWith('More'),
  );
  more?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  more?.click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  const row = document.querySelector('.rich-content-more-row[data-overflowed]');
  return {
    open: Boolean(document.querySelector('.rich-content-more-menu')),
    overflowedControls: row ? row.querySelectorAll('button, label').length : 0,
  };
});
console.log('\nMORE MENU when narrow:', JSON.stringify(inMenu));

await page.screenshot({ path: `${OUT}/narrow.png` });
console.log('\nerrors:', JSON.stringify(errors));
await browser.close();
