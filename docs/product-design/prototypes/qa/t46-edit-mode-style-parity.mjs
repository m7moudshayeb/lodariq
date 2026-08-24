/**
 * Does the card in edit mode look like the card that ships?
 *
 * Reported as "the card in edit mode does not reflect the applied style at all".
 * This does not argue about it: it puts both renderers on screen at once — the
 * editor's canvas card inside the authoring iframe, and the runtime's own card
 * on the host page — and diffs the computed styles a creator would notice.
 *
 * Scope is style only: colour, typography, spacing, radius, shadow, button
 * appearance. Positioning and motion legitimately differ, because one is a
 * canvas and the other is an anchored overlay.
 *
 *   pnpm --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t46-edit-mode-style-parity.mjs
 */
import { chromium } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';

/** What a creator would say is wrong, not every property that exists. */
const CARD_PROPERTIES = [
  'background-color',
  'color',
  'font-family',
  'font-size',
  'border-top-width',
  'border-top-color',
  'border-top-left-radius',
  'box-shadow',
  'padding-top',
  'padding-left',
];
const BUTTON_PROPERTIES = [
  'background-color',
  'color',
  'border-top-left-radius',
  'font-size',
  'font-weight',
];

/** The resolved Tour variables, read off whichever host actually carries them. */
const THEME_VARIABLES = [
  '--lq-tour-surface',
  '--lq-tour-text-color',
  '--lq-tour-border-color',
  '--lq-tour-radius',
  '--lq-tour-elevation',
  '--lq-tour-font-family',
  '--lq-tour-base-font-size',
  '--lq-tour-spacing',
  '--lq-tour-primary-surface',
  '--lq-tour-primary-text',
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 160)));

await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForSelector('lodariq-authoring-panel', { timeout: 20_000 });
await page.waitForTimeout(6_000);

const runtimeSide = await page.evaluate(
  ({ cardProps, buttonProps, variables }) => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    const card = shadow?.querySelector('[role=dialog]');
    if (!card) return { found: false };
    const read = (element, names) =>
      Object.fromEntries(
        names.map((name) => [name, getComputedStyle(element).getPropertyValue(name).trim()]),
      );
    const button = card.querySelector('button');
    const host = document.querySelector('lodariq-tour');
    return {
      found: true,
      card: read(card, cardProps),
      button: button ? read(button, buttonProps) : null,
      variables: read(host, variables),
      text: (card.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    };
  },
  { cardProps: CARD_PROPERTIES, buttonProps: BUTTON_PROPERTIES, variables: THEME_VARIABLES },
);

const frame = page
  .frames()
  .find((candidate) => candidate.url().includes('authoring.html'));
if (!frame) throw new Error('authoring iframe not found');

const editorSide = await frame.evaluate(
  ({ cardProps, buttonProps, variables }) => {
    // The card a creator actually edits. `.step-presentation-preview-card` is a
    // different, non-default surface; the overlay shell is what edit mode shows.
    const card =
      document.querySelector('.overlay-step-card') ??
      document.querySelector('.step-presentation-preview-card');
    if (!card) return { found: false };
    const read = (element, names) =>
      Object.fromEntries(
        names.map((name) => [name, getComputedStyle(element).getPropertyValue(name).trim()]),
      );
    const button = card.querySelector(
      '.rich-content-button-preview, .rich-step-action-preview, button',
    );
    return {
      found: true,
      card: read(card, cardProps),
      button: button ? read(button, buttonProps) : null,
      variables: read(card, variables),
      text: (card.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
    };
  },
  { cardProps: CARD_PROPERTIES, buttonProps: BUTTON_PROPERTIES, variables: THEME_VARIABLES },
);

console.log(`runtime card: ${runtimeSide.found ? runtimeSide.text : 'NOT FOUND'}`);
console.log(`editor card:  ${editorSide.found ? editorSide.text : 'NOT FOUND'}`);
if (!runtimeSide.found || !editorSide.found) {
  await browser.close();
  console.log('\ncould not put both renderers on screen; nothing to diff');
  process.exit(1);
}

let differences = 0;
const diff = (label, left, right) => {
  console.log(`\n--- ${label} ---`);
  for (const key of Object.keys(left ?? {})) {
    const a = left?.[key] ?? '';
    const b = right?.[key] ?? '';
    const same = a === b;
    if (!same) differences += 1;
    console.log(`${same ? 'same ' : 'DIFF '} ${key.padEnd(24)} runtime=${a || '(unset)'}`);
    if (!same) console.log(`      ${''.padEnd(24)} editor =${b || '(unset)'}`);
  }
};

diff('resolved theme variables', runtimeSide.variables, editorSide.variables);
diff('card', runtimeSide.card, editorSide.card);
if (runtimeSide.button && editorSide.button) diff('primary action', runtimeSide.button, editorSide.button);
else console.log('\n--- primary action ---\n  (no comparable button on one side)');

await browser.close();
console.log(differences ? `\n${differences} properties differ` : '\nno differences');
