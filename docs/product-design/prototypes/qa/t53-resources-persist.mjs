/**
 * The one that answers "is my saved style still there tomorrow?"
 *
 *   pnpm --filter @lodariq/sdk-authoring build   # the fixture host reads dist
 *   SDK_PORT=5177 ASSERT=1 node docs/product-design/prototypes/qa/t53-resources-persist.mjs
 *
 * `loadStepStyleRecipes`, `loadDraftCheckpoints` and `saveAuthoringResources`
 * are optional services the hosted editor answers through the control plane.
 * Local development answered none of them, so a named style lived until the
 * next refresh — and the Style row offering to create one was, in effect, a
 * control that undid itself.
 *
 * This saves a style, reloads the whole page, and looks for it again. The
 * reload is the entire point: an in-memory stand-in passes every other check.
 */
import { chromium } from './env.mjs';

const PORT = process.env.SDK_PORT ?? 5177;
const assert = process.env.ASSERT === '1';
const failures = [];

const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
// One context throughout: IndexedDB is per origin per context, and a fresh
// context would prove nothing about persistence.
const context = await browser.newContext({ viewport: { width: 1440, height: 980 } });
const page = await context.newPage();

async function openAuthoring() {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__meridian.openAuthoring());
  await page.waitForTimeout(5000);
  const frame = page.frames().find((candidate) => candidate.url().includes('authoring.html'));
  if (!frame) throw new Error('no authoring frame');
  return frame;
}

/**
 * The Style section carries "Create style from this step…" under Reuse.
 *
 * "Step settings" toggles, so opening an inspector that is already open closes
 * it — which is why this checks first rather than clicking unconditionally.
 */
async function openStyleSection(frame) {
  const alreadyOpen = await frame.evaluate(() =>
    Boolean(document.querySelector('.overlay-step-inspector-panel')),
  );
  if (!alreadyOpen) {
    await frame.evaluate(() => {
      [...document.querySelectorAll('button')]
        .find((button) => (button.getAttribute('aria-label') ?? '').trim() === 'Step settings')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(1200);
  }
  await frame.evaluate(() => {
    const style = document.querySelector('details.inspector-section[data-section="style"]');
    if (style) style.open = true;
  });
  await page.waitForTimeout(600);
}

/*
 * Found by its label, not by looking for a `custom` option: the moment a style
 * is created the step matches it, and `Custom` is only offered while nothing
 * matches — so an option-based probe loses the menu exactly when it succeeds.
 */
const listStyles = (frame) =>
  frame.evaluate(() => {
    const row = [...document.querySelectorAll('.rich-step-choice-field')].find(
      (field) => field.querySelector('.rich-step-field-label')?.textContent?.trim() === 'Style',
    );
    const menu = row?.querySelector('select');
    return menu ? [...menu.options].map((option) => option.label) : [];
  });

let frame = await openAuthoring();
await openStyleSection(frame);
const before = await listStyles(frame);
console.log('styles before:', JSON.stringify(before));

const created = await frame.evaluate(() => {
  const button = document.querySelector('[data-style-action="create"]');
  if (!button) return 'no create control';
  if (button.disabled) return 'create control is disabled';
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return 'clicked';
});
console.log('create:', created);
if (created !== 'clicked') failures.push(`could not create a style: ${created}`);
await page.waitForTimeout(2000);

await openStyleSection(frame);
const afterCreate = await listStyles(frame);
console.log('styles after create:', JSON.stringify(afterCreate));
/*
 * Counted without `Custom`, which is not a saved style: it is the row the menu
 * offers only while the step matches nothing, so creating a style *removes* it
 * and the list stays the same length.
 */
const named = (labels) => labels.filter((label) => label !== 'Custom');
if (named(afterCreate).length <= named(before).length) {
  failures.push('creating a style added no named row');
}

// The whole question: does it survive the page going away?
frame = await openAuthoring();
await openStyleSection(frame);
const afterReload = await listStyles(frame);
console.log('styles after reload:', JSON.stringify(afterReload));

const saved = named(afterCreate);
const kept = named(afterReload);
if (saved.length === 0) failures.push('no named style was created to test with');
else if (kept.length < saved.length) {
  failures.push(`the saved style did not survive the reload: ${JSON.stringify(afterReload)}`);
}

console.log(failures.length ? `\nFAIL\n  ${failures.join('\n  ')}` : '\nOK — the style outlived the page');
await browser.close();
if (assert && failures.length) process.exit(1);
