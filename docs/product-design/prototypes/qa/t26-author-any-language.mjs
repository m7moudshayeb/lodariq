/**
 * Can a creator author a card in a language the document has never had, and that
 * Lodariq's own chrome does not speak?
 *
 * Japanese is the test: nowhere in `PRODUCT_LOCALES`, no authoring catalog, and a
 * non-Latin script — so a picker that is really the UI-language list in disguise
 * cannot fake passing. The whole chain has to hold: the tag is offered, selecting
 * it is accepted, an edit made under it creates the variant, and the copy comes
 * back when the locale is re-selected.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t26');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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

await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) =>
    n.shadowRoot?.querySelector('[data-pill-operations]'),
  );
  host?.shadowRoot?.querySelector('[data-pill-operations]')?.click();
});
await page.waitForTimeout(2500);

const frame = page.frames().find((f) => f.url().includes('authoring.html'));
if (!frame) throw new Error('authoring frame missing');

const openSection = async (tab) => {
  await frame.evaluate((id) => {
    document.querySelector(`[data-operations-tab="${id}"]`)?.click();
  }, tab);
  await page.waitForTimeout(1400);
};

await openSection('translation');

// 1 — the picker is here at all, where the disabled button used to be.
const picker = await frame.evaluate(() => {
  const trigger = document.querySelector('.operations-language [data-action="content-locale"]');
  const legacy = [...document.querySelectorAll('.operations-language button')].find((b) =>
    (b.textContent || '').includes('Add a language'),
  );
  return {
    present: Boolean(trigger),
    disabledLegacy: legacy ? legacy.disabled : null,
  };
});
console.log('PICKER', JSON.stringify(picker));

// 2 — type a tag nobody offered and commit the row it produces.
const chose = await frame.evaluate(async () => {
  const trigger = document.querySelector(
    '.operations-language [data-action="content-locale"].ui-select-trigger',
  );
  if (!trigger) return 'no trigger';
  trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const search = document.querySelector('.ui-select-search-field input');
  if (!search) return 'no search field';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(search, 'ja');
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const rows = [...document.querySelectorAll('.ui-searchable-select-option')].map((r) =>
    (r.textContent || '').trim(),
  );
  const tableBefore = [
    ...document.querySelectorAll('.operations-language tbody .ops-table-key'),
  ].map((cell) => (cell.textContent || '').trim());
  console.log('TABLE BEFORE', JSON.stringify(tableBefore));
  const custom = document.querySelector('[data-select-custom]');
  const match = [...document.querySelectorAll('.ui-searchable-select-option')].find((r) =>
    (r.textContent || '').includes('日本語'),
  );
  match?.click();
  return {
    rows: rows.slice(0, 4),
    offeredCustom: custom?.getAttribute('data-select-custom') ?? null,
  };
});
await page.waitForTimeout(1600);
console.log('CHOSE', JSON.stringify(chose));

const locale = await frame.evaluate(
  () => document.querySelector('select[data-action="content-locale"]')?.value ?? null,
);
console.log('active content locale =', locale);
const tableAfter = await frame.evaluate(() =>
  [...document.querySelectorAll('.operations-language tbody .ops-table-key')].map((cell) =>
    (cell.textContent || '').trim(),
  ),
);
console.log('LANGUAGE TABLE now:', JSON.stringify(tableAfter));

/*
 * `ja` is a suggested tag, so that only proves the list grew. `haw` is in no
 * suggestion list and has no product catalog — the only way through is the
 * free-form row, which is the thing that makes the list a suggestion and not a
 * gate.
 */
const freeform = await frame.evaluate(async () => {
  const trigger = document.querySelector(
    '.operations-language [data-action="content-locale"].ui-select-trigger',
  );
  trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const search = document.querySelector('.ui-select-search-field input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(search, 'haw');
  search?.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const custom = document.querySelector('[data-select-custom]');
  const offered = custom?.textContent?.trim() ?? null;
  custom?.click();
  return offered;
});
await page.waitForTimeout(1400);
const freeformLocale = await frame.evaluate(
  () => document.querySelector('select[data-action="content-locale"]')?.value ?? null,
);
console.log(`free-form: offered "${freeform}" -> locale=${freeformLocale}`);

// Back to Japanese for the authoring pass below.
await frame.evaluate(async () => {
  const trigger = document.querySelector(
    '.operations-language [data-action="content-locale"].ui-select-trigger',
  );
  trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const search = document.querySelector('.ui-select-search-field input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(search, '日本語');
  search?.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 400));
  [...document.querySelectorAll('.ui-searchable-select-option')]
    .find((row) => (row.textContent || '').includes('日本語'))
    ?.click();
});
await page.waitForTimeout(1400);

/*
 * 3 — author under it. Storyboard's side-by-side pane is the plainest real edit
 * path: its textareas commit through `commitRichTextContent`, which writes to
 * whichever locale is active. Two cards have to be selected for it to open.
 */
await openSection('storyboard');
await frame.evaluate(() => {
  for (const card of [...document.querySelectorAll('.storyboard-card')].slice(0, 2)) {
    [...card.querySelectorAll('button')]
      .find((button) => (button.textContent || '').trim() === 'Select')
      ?.click();
  }
});
await page.waitForTimeout(1200);

const JAPANESE_HEADING = 'プロジェクトを作成しましょう';
const heading = frame.locator('.storyboard-compare-column textarea').first();
const before = await heading.inputValue().catch(() => null);
await heading.fill(JAPANESE_HEADING);
await heading.blur();
await page.waitForTimeout(2000);
console.log('EDIT', JSON.stringify({ before, after: await heading.inputValue() }));

// 4 — the variant exists in the saved document, holding exactly that copy.
const stored = await page.evaluate(() => {
  for (const key of Object.keys(localStorage)) {
    const raw = localStorage.getItem(key) ?? '';
    if (!raw.includes('"localization"')) continue;
    try {
      const parsed = JSON.parse(raw);
      const document = parsed?.document ?? parsed;
      const variants = document?.localization?.variants ?? [];
      const ja = variants.find((variant) => variant.locale === 'ja');
      if (ja) return { key, locales: variants.map((v) => v.locale), ja };
    } catch {
      /* not ours */
    }
  }
  return null;
});
console.log(
  '\nSAVED DOCUMENT',
  stored ? JSON.stringify(stored, null, 2).slice(0, 700) : 'no ja variant found',
);

await page.screenshot({ path: `${OUT}/japanese.png` });
console.log('\nerrors:', JSON.stringify(errors));
await browser.close();
