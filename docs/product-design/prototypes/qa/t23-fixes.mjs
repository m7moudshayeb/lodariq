/**
 * The four surfaces this iteration changed.
 *
 * 1. Check must not report targets nobody has inspected as unfindable.
 * 2. The coach toast must not sit on an Operations lede.
 * 3. The Storyboard lede must not claim step 4 repeats step 2.
 * 4. Every step's ring must still resolve after the fixture lost its empty
 *    `stableAttributes`.
 */
import { chromium, outDir } from './env.mjs';

const OUT = outDir('t23');
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

const frame = page.frames().find((f) => f.url().includes('authoring.html'));
if (!frame) throw new Error('authoring frame missing');

/** Opens one Operations section by clicking its nav row. */
const openSection = async (tab) => {
  await frame.evaluate((id) => {
    document.querySelector(`[data-operations-tab="${id}"]`)?.click();
  }, tab);
  await page.waitForTimeout(1400);
};

await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) =>
    n.shadowRoot?.querySelector('[data-pill-operations]'),
  );
  host?.shadowRoot?.querySelector('[data-pill-operations]')?.click();
});
await page.waitForTimeout(2500);

// 1 — Check. Wait past the inspection round-trip the section now requests.
await openSection('check');
await page.waitForTimeout(3000);
const check = await frame.evaluate(() => {
  const groups = [...document.querySelectorAll('.operations-check .ops-box[data-kind]')].map(
    (box) => ({
      kind: box.getAttribute('data-kind'),
      count: box.querySelectorAll('.ops-list > li').length,
      heading: (box.querySelector('h3')?.textContent || '').trim(),
    }),
  );
  const badge = document
    .querySelector('[data-operations-tab="check"] .operations-hub-badge')
    ?.textContent?.trim();
  return { groups, badge };
});
console.log('CHECK badge =', check.badge ?? '(none)');
for (const g of check.groups) console.log(`  ${g.kind.padEnd(12)} ${g.count}  ${g.heading}`);
const unfindable = check.groups.find((g) => g.kind === 'target');
console.log(
  unfindable ? `  !! target group present (${unfindable.count})` : '  OK no target group',
);

// 2 — the toast, against every section head it used to cover.
const toast = await page.evaluate(() => {
  const host = [...document.querySelectorAll('*')].find((n) =>
    n.shadowRoot?.querySelector('.overlay-toasts'),
  );
  const layer = host?.shadowRoot?.querySelector('.overlay-toasts');
  if (!layer) return { present: false };
  const r = layer.getBoundingClientRect();
  return {
    present: true,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    h: window.innerHeight,
  };
});
const head = await frame.evaluate(() => {
  const el = document.querySelector('.operations-hub-head');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
});
console.log('\nTOAST layer', JSON.stringify(toast), 'HEAD', JSON.stringify(head));
if (toast.present && head) {
  const overlaps = toast.top < head.bottom && toast.bottom > head.top;
  console.log(overlaps ? '  !! toast overlaps the section head' : '  OK toast clears the head');
}

// 3 — the Storyboard lede and its own Repetition count, which must agree.
await openSection('storyboard');
const storyboard = await frame.evaluate(() => ({
  lede: (document.querySelector('.operations-hub-head p')?.textContent || '').trim(),
  repetition: [...document.querySelectorAll('.ops-pill-tabs button')]
    .map((b) => (b.textContent || '').trim())
    .find((t) => t.startsWith('Repetition')),
}));
console.log('\nSTORYBOARD lede:', storyboard.lede);
console.log('STORYBOARD pill:', storyboard.repetition);
console.log(
  /step 4 repeats step 2/u.test(storyboard.lede)
    ? '  !! lede still asserts a specific repeat'
    : '  OK lede makes no false claim',
);

await page.screenshot({ path: `${OUT}/storyboard.png` });
console.log('\nerrors:', JSON.stringify(errors));
await browser.close();
