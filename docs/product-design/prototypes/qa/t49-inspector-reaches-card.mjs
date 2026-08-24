/**
 * Does every control in the step inspector change the card a creator is looking at?
 *
 * Reported as "the card in editing mode does not reflect the styling attributes
 * applied to it from the inspector". This does not argue: it drives each row the
 * way a creator would and reads the card's computed style before and after. A
 * control that moves its own pill and nothing else fails here.
 *
 * The one known gap is Pointer arrow, which is listed as expected-inert with the
 * reason — see the summary in this directory's README.
 *
 *   pnpm --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t49-inspector-reaches-card.mjs
 */
import { chromium } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';

/** label → the card property it must move, and what to set it to. */
const CHOICES = [
  { label: 'Colour scheme', option: 'Inverse', property: 'background' },
  { label: 'Corner', option: 'Square', property: 'radius' },
  { label: 'Border weight', option: 'Strong', property: 'borderWidth' },
  { label: 'Elevation', option: 'None', property: 'shadow' },
  { label: 'Padding', option: 'Relaxed', property: 'padTop' },
  { label: 'Content alignment', option: 'Center', property: 'textAlign' },
];
const RANGES = [
  { label: 'Vertical padding', value: 28, property: 'padTop' },
  { label: 'Horizontal padding', value: 32, property: 'padLeft' },
  { label: 'Width', value: 440, property: 'width' },
  { label: 'Min height', value: 300, property: 'minHeight' },
];
const COLOURS = [
  { label: 'Surface', value: '#2b1055', property: 'background' },
  { label: 'Text', value: '#f0e68c', property: 'color' },
  { label: 'Border', value: '#ff4500', property: 'borderColor' },
];
/** Set, and known not to reach the card. Listed so the run stays honest. */
const EXPECTED_INERT = [
  {
    label: 'Pointer arrow',
    option: 'Hide',
    why: 'the overlay draws no arrow: the frame is never told which side of the target the host put the card on',
  },
];

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

const readCard = () =>
  frame.evaluate(() => {
    const card = document.querySelector('.overlay-step-card');
    const style = getComputedStyle(card);
    const text = card.querySelector('.rich-content-paragraph, .rich-content-heading, p, h1, h2');
    return {
      background: style.backgroundColor,
      color: style.color,
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow,
      padTop: style.paddingTop,
      padLeft: style.paddingLeft,
      width: style.width,
      minHeight: style.minHeight,
      textAlign: text ? getComputedStyle(text).textAlign : '',
      vars: ['--lq-popup-surface', '--lq-popup-text', '--lq-popup-border']
        .map((name) => `${name}=${style.getPropertyValue(name).trim() || '(unset)'}`)
        .join(' '),
    };
  });

const setChoice = (label, option) =>
  frame.evaluate(
    ({ label, option }) => {
      const field = [
        ...document.querySelectorAll('.overlay-step-inspector-body .rich-step-choice-field'),
      ].find((row) => row.querySelector('.rich-step-field-label')?.textContent?.trim() === label);
      const select = field?.querySelector('select.ui-native-select-mirror');
      const chosen = [...(select?.options ?? [])].find((o) => o.textContent.trim() === option);
      if (!select || !chosen) return `no ${label} / ${option}`;
      select.value = chosen.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    },
    { label, option },
  );

const setRange = (label, value) =>
  frame.evaluate(
    ({ label, value }) => {
      const field = [
        ...document.querySelectorAll('.overlay-step-inspector-body .rich-step-choice-field'),
      ].find((row) => row.querySelector('.rich-step-field-label')?.textContent?.trim() === label);
      const input = field?.querySelector('input[type=range], input[type=number]');
      if (!input) return `no ${label}`;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      ).set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    },
    { label, value },
  );

const setColour = async (label, value) => {
  /*
   * One picker is open at a time (ExclusiveFloatingGroup), and clicking the next
   * pill while one is open spends the click closing it. Escape first, so the
   * pill click is the one that opens.
   */
  await frame.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const opened = await frame.evaluate((label) => {
    const field = [
      ...document.querySelectorAll('.overlay-step-inspector-body .rich-step-color-field'),
    ].find((row) => row.querySelector('.rich-step-field-label')?.textContent?.trim() === label);
    if (!field) return `no ${label}`;
    field.querySelector('button.inspector-pill')?.click();
    return 'ok';
  }, label);
  if (opened !== 'ok') return opened;
  await page.waitForTimeout(350);
  /*
   * Found by its own label. Every pill's popover contributes a colour input, and
   * picking "the visible one" picked whichever popover happened to still be
   * mounted — which is how Text once wrote nothing and read as a broken control.
   */
  const applied = await frame.evaluate(({ label, value }) => {
    const wanted = `custom ${label.toLocaleLowerCase()} color`;
    const input = [...document.querySelectorAll('input[type=color]')].find(
      (candidate) => candidate.getAttribute('aria-label')?.toLocaleLowerCase() === wanted,
    );
    if (!input) return `no colour input for ${label}`;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  }, { label, value });
  await page.waitForTimeout(300);
  await frame.evaluate(() => document.body.click());
  return applied;
};

let previous = await readCard();
let failures = 0;

async function check(name, run, property) {
  const result = await run();
  await page.waitForTimeout(700);
  const now = await readCard();
  const moved = now[property] !== previous[property];
  const ok = result === 'ok' && moved;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'pass' : 'FAIL'}  ${name.padEnd(30)} ${property} ${previous[property]} -> ${now[property]}${
      result === 'ok' ? '' : `   (${result})`
    }`,
  );
  if (!ok) console.log(`        ${now.vars}`);
  previous = now;
}

console.log('--- choices ---');
for (const entry of CHOICES) {
  await check(`${entry.label}=${entry.option}`, () => setChoice(entry.label, entry.option), entry.property);
}
console.log('\n--- numbers ---');
for (const entry of RANGES) {
  await check(`${entry.label}=${entry.value}`, () => setRange(entry.label, entry.value), entry.property);
}
console.log('\n--- colours ---');
for (const entry of COLOURS) {
  await check(`${entry.label}=${entry.value}`, () => setColour(entry.label, entry.value), entry.property);
}

console.log('\n--- known inert ---');
for (const entry of EXPECTED_INERT) {
  const result = await setChoice(entry.label, entry.option);
  await page.waitForTimeout(500);
  const now = await readCard();
  const moved = Object.keys(now).some((key) => now[key] !== previous[key]);
  previous = now;
  console.log(
    `${moved ? 'NEW   ' : 'known '}${entry.label}=${entry.option}  ${
      moved ? 'now reaches the card — remove it from EXPECTED_INERT' : entry.why
    }`,
  );
}

await browser.close();
console.log(failures ? `\n${failures} control(s) do not reach the card` : '\nevery control reaches the card');
process.exit(failures ? 1 : 0);
