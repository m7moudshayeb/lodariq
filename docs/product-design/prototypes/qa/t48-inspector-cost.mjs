/**
 * What one inspector change costs.
 *
 * Baseline for three reported symptoms: the inspector scrolls back to the top
 * on every edit, the card flickers, and the whole thing feels slow. This counts
 * what actually happens per change — DOM writes, React commits, the focus moves
 * that reset the scroll, and wall-clock to paint.
 *
 *   node docs/product-design/prototypes/qa/t48-inspector-cost.mjs
 */
import { chromium } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 160)));

await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForSelector('lodariq-authoring-panel', { timeout: 20_000 });
await page.waitForTimeout(6_000);

const frame = page.frames().find((candidate) => candidate.url().includes('authoring.html'));
if (!frame) throw new Error('authoring iframe not found');
await frame.click('.overlay-step-settings');
await frame.waitForSelector('.overlay-step-inspector-panel', { timeout: 10_000 });
await page.waitForTimeout(600);

await frame.evaluate(() => {
  const w = window;
  w.__cost = { records: 0, attrs: 0, added: 0, removed: 0, text: 0, focus: 0, batches: 0 };
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (...args) {
    w.__cost.focus += 1;
    return focus.apply(this, args);
  };
  const observer = new MutationObserver((records) => {
    w.__cost.batches += 1;
    for (const record of records) {
      w.__cost.records += 1;
      if (record.type === 'attributes') w.__cost.attrs += 1;
      else if (record.type === 'characterData') w.__cost.text += 1;
      else {
        w.__cost.added += record.addedNodes.length;
        w.__cost.removed += record.removedNodes.length;
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  const body = document.querySelector('.overlay-step-inspector-body');
  body.scrollTop = 120;
  w.__cost.scrollBefore = body.scrollTop;
});

/** Six ordinary edits, the kind a creator makes in a row. */
const EDITS = [
  ['Corner', 'Soft'],
  ['Border weight', 'Strong'],
  ['Elevation', 'None'],
  ['Padding', 'Relaxed'],
  ['Content alignment', 'Center'],
  ['Corner', 'Square'],
];

const started = Date.now();
const latencies = [];
for (const [label, option] of EDITS) {
  /*
   * Dispatch to painted, measured inside the page: the creator's "is it swift"
   * is the gap between choosing and seeing, not the round trip through CDP.
   */
  const latency = await frame.evaluate(
    ({ label, option }) => {
      const field = [
        ...document.querySelectorAll('.overlay-step-inspector-body .rich-step-choice-field'),
      ].find((candidate) => candidate.querySelector('.rich-step-field-label')?.textContent?.trim() === label);
      const select = field?.querySelector('select.ui-native-select-mirror');
      const chosen = [...(select?.options ?? [])].find((entry) => entry.textContent.trim() === option);
      if (!select || !chosen) return null;
      /*
       * Dispatch until the card carries the change, which is the gap a creator
       * sees. Timing to the next animation frame instead would measure whatever
       * happened to be scheduled in it, and moves when the work does.
       */
      return new Promise((resolve) => {
        const card = document.querySelector('.overlay-step-card');
        const at = performance.now();
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve(Math.round(performance.now() - at));
        });
        observer.observe(card, { attributes: true });
        select.value = chosen.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        setTimeout(() => {
          observer.disconnect();
          resolve(-1);
        }, 2_000);
      });
    },
    { label, option },
  );
  if (latency !== null) latencies.push(latency);
  await page.waitForTimeout(500);
}
const elapsed = Date.now() - started;

/** Read before the drag, so the drag's own churn is not charged to the six edits. */
const cost = await frame.evaluate(() => {
  const body = document.querySelector('.overlay-step-inspector-body');
  return { ...window.__cost, scrollAfter: body.scrollTop };
});

/*
 * The drag, which is where an edit stops being one event and becomes forty. A
 * range input fires on every pointer move, and each one used to tear the preview
 * player down and build a new one.
 */
await page.evaluate(() => {
  window.__rebuilds = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeName?.toLowerCase() === 'lodariq-tour') window.__rebuilds += 1;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
});

const DRAG_STEPS = 20;
const dragStarted = Date.now();
await frame.evaluate(async (count) => {
  const field = [
    ...document.querySelectorAll('.overlay-step-inspector-body .rich-step-choice-field'),
  ].find(
    (candidate) =>
      candidate.querySelector('.rich-step-field-label')?.textContent?.trim() === 'Vertical padding',
  );
  const input = field?.querySelector('input[type=range]');
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  /*
   * Spaced like a hand, not fired in a loop. A synchronous burst is coalesced by
   * the in-flight request guard on its own and proves nothing; a real drag emits
   * one of these every frame or two, which is the case that has to hold up.
   */
  for (let step = 0; step < count; step += 1) {
    setter.call(input, String(8 + step));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}, DRAG_STEPS);
await page.waitForTimeout(1_200);
const dragElapsed = Date.now() - dragStarted;
const rebuilds = await page.evaluate(() => window.__rebuilds);

const per = (value) => (value / EDITS.length).toFixed(1);
console.log(`\n${EDITS.length} edits in ${elapsed}ms\n`);
console.log(`  DOM records      ${String(cost.records).padStart(5)}   ${per(cost.records)} per edit`);
console.log(`    attributes     ${String(cost.attrs).padStart(5)}   ${per(cost.attrs)} per edit`);
console.log(`    nodes added    ${String(cost.added).padStart(5)}   ${per(cost.added)} per edit`);
console.log(`    nodes removed  ${String(cost.removed).padStart(5)}   ${per(cost.removed)} per edit`);
console.log(`    text           ${String(cost.text).padStart(5)}   ${per(cost.text)} per edit`);
console.log(`  observer batches ${String(cost.batches).padStart(5)}   ${per(cost.batches)} per edit`);
console.log(`  focus() calls    ${String(cost.focus).padStart(5)}   ${per(cost.focus)} per edit`);
const sorted = [...latencies].sort((a, b) => a - b);
console.log(
  `  dispatch->card   ${String(sorted[Math.floor(sorted.length / 2)] ?? 0).padStart(5)}ms median, ${
    sorted[sorted.length - 1] ?? 0
  }ms worst   [${latencies.join(', ')}]`,
);
/*
 * Chrome re-anchors a scroller when content above the viewport changes height,
 * so a few pixels of drift is the browser doing its job. Going to zero is the
 * reported bug — a creator halfway down the inspector finding themselves at the
 * top again.
 */
console.log(
  `\n  ${DRAG_STEPS}-step slider drag: ${rebuilds} preview rebuilds in ${dragElapsed}ms  ${
    rebuilds >= DRAG_STEPS ? '(one per move)' : `(${(DRAG_STEPS / Math.max(rebuilds, 1)).toFixed(1)}x coalesced)`
  }`,
);
console.log(
  `\n  inspector scroll ${cost.scrollBefore} -> ${cost.scrollAfter}  ${
    cost.scrollAfter === 0 && cost.scrollBefore > 0
      ? 'RESET TO TOP'
      : cost.scrollAfter === cost.scrollBefore
        ? 'held exactly'
        : 'held (re-anchored)'
  }`,
);

await browser.close();
