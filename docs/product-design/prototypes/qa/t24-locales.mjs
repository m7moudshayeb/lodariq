/**
 * Does `Switch to` actually swap the copy, and does an incomplete locale fall
 * back per block?
 *
 * The fixture is built for this: de is 15/15, fr 9/15 (steps 1–3), es 3/15
 * (step 1 only). So fr must show French on steps 1–3 and English on 4–5, and es
 * must show Spanish on step 1 alone. Storyboard is the read surface — it prints
 * every step's heading and body from the localized document the controller
 * hands the frame.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t24');
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
  await page.waitForTimeout(1300);
};

/** The coverage table, which is what every claim below is measured against. */
await openSection('translation');
const coverage = await frame.evaluate(() =>
  [...document.querySelectorAll('.operations-language table tbody tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')]
      .map((cell) => (cell.textContent || '').trim().replace(/\s+/gu, ' '))
      .join(' | '),
  ),
);
console.log('COVERAGE');
for (const row of coverage) console.log('  ' + row);

/** Clicks `Switch to` on the row whose first cell names this language. */
const switchTo = async (label) => {
  await openSection('translation');
  const clicked = await frame.evaluate((name) => {
    const row = [...document.querySelectorAll('.operations-language table tbody tr')].find((tr) =>
      (tr.querySelector('.ops-table-key')?.textContent || '').includes(name),
    );
    const button = [...(row?.querySelectorAll('button') ?? [])].find((b) =>
      (b.textContent || '').includes('Switch to'),
    );
    if (!button) return row ? 'no switch button (already editing?)' : 'no row';
    button.click();
    return 'clicked';
  }, label);
  await page.waitForTimeout(1600);
  return clicked;
};

/** Every step's heading and body, as Storyboard prints them. */
const readSteps = async () => {
  await openSection('storyboard');
  return frame.evaluate(() =>
    [...document.querySelectorAll('.storyboard-card-preview')].map((card) => ({
      heading: (card.querySelector('strong')?.textContent || '').trim(),
      body: (card.querySelector('p')?.textContent || '').trim().slice(0, 46),
    })),
  );
};

const EXPECT = {
  English: [null, null, null, null, null],
  Deutsch: ['de', 'de', 'de', 'de', 'de'],
  Français: ['fr', 'fr', 'fr', 'en', 'en'],
  Español: ['es', 'en', 'en', 'en', 'en'],
};

// One marker word per locale per step, enough to tell a translation from a fallback.
const MARKERS = {
  de: [/Erstellen/u, /eingrenzen/u, /Sortieren/u, /Tabelle/u, /Berichte/u],
  fr: [/Créez/u, /Affiner/u, /Trier/u, /—/u, /—/u],
  es: [/Cree/u, /—/u, /—/u, /—/u, /—/u],
  en: [
    /Create your first/u,
    /Narrow the list/u,
    /Sort how you think/u,
    /Everything in one table/u,
    /Reports live here/u,
  ],
};

for (const label of ['Deutsch', 'Français', 'Español', 'English']) {
  const outcome = await switchTo(label);
  const steps = await readSteps();
  const status = await frame.evaluate(() =>
    (document.querySelector('[data-frame-status], .overlay-status')?.textContent || '').trim(),
  );
  console.log(
    `\n${label.toUpperCase()}  (switch: ${outcome})${status ? `  status: ${status}` : ''}`,
  );
  steps.forEach((step, index) => {
    const want = EXPECT[label]?.[index];
    const langs = Object.entries(MARKERS)
      .filter(([, patterns]) => patterns[index]?.test(step.heading))
      .map(([code]) => code);
    const saw = langs.length === 1 ? langs[0] : langs.join('/') || '?';
    const verdict = want === null ? '' : saw === want ? ' ok' : `  << expected ${want}`;
    console.log(`  step ${index + 1}  [${saw}] ${step.heading}${verdict}`);
  });
  await page.screenshot({ path: `${OUT}/${label}.png` });
}

console.log('\nerrors:', JSON.stringify(errors));
await browser.close();
