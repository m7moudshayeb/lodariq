/**
 * Which step the editor is on when a preview ends (§4.7), by all three exits:
 * Exit preview, Edit this step, and the tour running out.
 *
 *   node docs/product-design/prototypes/qa/t33-preview-exit-step.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, REPO } from './env.mjs';

const PORT = process.env.SDK_PORT ?? '5177';
const FIXTURE = join(REPO, 'packages/schema/fixtures/tour.linear.v1.json');

/** Heading text per step, so a card can be identified by what it says. */
const HEADING = {
  block_step_1: 'Create your first project',
  block_step_2: 'Narrow the list',
  block_step_3: 'Sort how you think',
  block_step_4: 'Everything in one table',
  block_step_5: 'Reports live here',
};

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

const DEEP = `(sel) => {
  const found = [];
  const walk = (root) => {
    for (const node of root.querySelectorAll(sel)) found.push(node);
    for (const node of root.querySelectorAll('*')) if (node.shadowRoot) walk(node.shadowRoot);
  };
  walk(document);
  return found;
}`;

async function openAuthoring() {
  const document = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  await page.goto(`http://localhost:${PORT}/`);
  await page.evaluate((seed) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(`lodariq:doc:${seed.id}`, JSON.stringify(seed));
    localStorage.setItem(
      'lodariq:creator-index:wk_local_dev',
      JSON.stringify([
        {
          documentId: seed.id,
          routeKey: window.location.pathname,
          title: seed.title,
          type: seed.type,
        },
      ]),
    );
  }, document);
  await page.reload();
  await page.waitForSelector('[data-lodariq-creator-launcher="true"]', { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__meridian?.openAuthoring?.());
  await page.waitForTimeout(7000);
}

/** Real pointer input: the shell's chrome opts into pointer events by name. */
const clickDeep = async (selector) => {
  const point = await page.evaluate(
    ([sel, source]) => {
      const deep = new Function(`return (${source})`)();
      const node = deep(sel).find((item) => item.getBoundingClientRect().width > 0);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    [selector, DEEP],
  );
  if (!point) return false;
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1800);
  return true;
};

/** The tour's own primary action — how a creator actually walks a preview. */
const clickRuntimeAction = async () => {
  const point = await page.evaluate(() => {
    const dialog = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector('[role="dialog"]');
    const button = dialog?.querySelector('button');
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  if (!point) return false;
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1800);
  return true;
};

async function state() {
  const host = await page.evaluate((source) => {
    const deep = new Function(`return (${source})`)();
    const dialog = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector('[role="dialog"]');
    const bar = deep('.overlay-preview-bar')[0] ?? null;
    const filmstrip = deep('[data-lodariq-filmstrip]')[0] ?? null;
    const frame = deep('iframe').find((node) => node.getBoundingClientRect().width > 200) ?? null;
    return {
      dialogHeading: dialog?.querySelector('h1,h2,h3')?.textContent?.trim() ?? null,
      activeStepId:
        deep('[data-lodariq-filmstrip] button[aria-current="step"]')[0]?.dataset.stepId ?? null,
      previewBar: bar && !bar.hidden ? bar.textContent.replace(/\s+/g, ' ').trim() : null,
      filmstripVisible: filmstrip ? filmstrip.getBoundingClientRect().height > 0 : false,
      editorVisible: Boolean(frame),
    };
  }, DEEP);

  let cardText = null;
  for (const frame of page.frames()) {
    try {
      const value = await frame.evaluate(() => {
        const card = document.querySelector('.overlay-step-card');
        return card ? card.textContent.replace(/\s+/g, ' ').trim() : null;
      });
      if (value) {
        cardText = value;
        break;
      }
    } catch {
      /* detached or cross-origin frame */
    }
  }
  return { ...host, cardText };
}

const showsStep = (snapshot, stepId) => snapshot.cardText?.startsWith(HEADING[stepId]) ?? false;

// ── 1. The runtime's own Next moves the editor with it ───────────────────────
await openAuthoring();
await clickDeep('[data-lodariq-filmstrip] button[data-step-id="block_step_2"]');
await clickDeep('[data-pill-preview]');
await page.waitForTimeout(2500);
let now = await state();
check('preview starts on the selected step', now.dialogHeading === HEADING.block_step_2, now.dialogHeading);

await clickRuntimeAction();
await clickRuntimeAction();
now = await state();
check(
  'the tour advancing itself moves the editor step',
  now.activeStepId === 'block_step_4',
  `runtime shows "${now.dialogHeading}", editor is on ${now.activeStepId}`,
);

// ── 2. Exit preview lands on the step that was showing ───────────────────────
await clickDeep('[data-preview-exit]');
await page.waitForTimeout(2500);
now = await state();
check('exiting preview closes the preview bar', now.previewBar === null, now.previewBar);
check('exiting preview brings the editor back', now.editorVisible, `editorVisible=${now.editorVisible}`);
check(
  'the card that returns is the step that was showing',
  showsStep(now, 'block_step_4'),
  `card reads "${now.cardText?.slice(0, 40)}"`,
);
// The bug: a stale editor puts one step's words on another step's anchor.
check(
  'and its content agrees with the card it is drawn on',
  now.dialogHeading === HEADING.block_step_4 && showsStep(now, 'block_step_4'),
  `card "${now.cardText?.slice(0, 30)}" vs target "${now.dialogHeading}"`,
);

// ── 3. The tour ending ends the preview ──────────────────────────────────────
await clickDeep('[data-pill-preview]');
await page.waitForTimeout(2500);
for (let index = 0; index < 3; index += 1) {
  now = await state();
  if (now.previewBar === null) break;
  await clickRuntimeAction();
}
await page.waitForTimeout(1500);
now = await state();
check('finishing the tour closes the preview bar', now.previewBar === null, now.previewBar);
check('finishing the tour returns the editor', now.editorVisible, `editorVisible=${now.editorVisible}`);
check(
  'finishing the tour leaves the editor on the last step seen',
  showsStep(now, 'block_step_5'),
  `card reads "${now.cardText?.slice(0, 40)}"`,
);

// ── 4. `Edit this step` unwinds preview too ──────────────────────────────────
await clickDeep('[data-lodariq-filmstrip] button[data-step-id="block_step_1"]');
await clickDeep('[data-pill-preview]');
await page.waitForTimeout(2500);
await clickDeep('[data-preview-step="next"]');
await clickDeep('[data-preview-step="next"]');
await clickDeep('[data-preview-edit]');
await page.waitForTimeout(2500);
now = await state();
check(
  'Edit this step opens the step that was showing',
  showsStep(now, 'block_step_3'),
  `card reads "${now.cardText?.slice(0, 40)}"`,
);
// Preview minimizes the panel; leaving preview has to put that back.
check(
  'Edit this step restores the filmstrip',
  now.filmstripVisible,
  `filmstripVisible=${now.filmstripVisible}`,
);

console.log(`\n${errors.length} console error(s)`);
for (const error of errors.slice(0, 6)) console.log(`  ${error}`);
console.log(failures.length ? `\nFAILED: ${failures.join(', ')}` : '\nAll checks passed.');
await browser.close();
process.exit(failures.length ? 1 : 0);
