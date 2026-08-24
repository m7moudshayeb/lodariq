/**
 * Does a step stay on the page it was authored for?
 *
 * It used not to. The resolver only knows what an element looks like, so on
 * `/billing` the "Everything in one table" step bound itself to the invoices
 * table, and the step anchored to the Reports nav link followed the visitor
 * across the whole product — nothing in the player noticed the page changed.
 *
 * The two halves are equally load-bearing. Suspending too eagerly is just as
 * broken as never suspending: this fixture keeps its sort order, open dialogs
 * and row menus in the hash query, so a page key that read them would blank the
 * card every time someone sorted a column.
 *
 * Needs the fixture host on :5177 and a current
 * `pnpm --filter @lodariq/sdk-runtime build && pnpm --filter @lodariq/sdk-authoring build`.
 */
import { chromium } from './env.mjs';

const HOST = process.env.HOST ?? 'http://localhost:5177';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

const state = () =>
  page.evaluate(() => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    const card = shadow?.querySelector('[role="dialog"]');
    const outline = shadow?.querySelector('[data-lodariq-target-outline]');
    const rect = outline && !outline.hidden ? outline.getBoundingClientRect() : null;
    const owner = rect
      ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + Math.min(8, rect.height / 2))
      : null;
    return {
      hash: location.hash,
      visible: card ? !card.hidden : false,
      text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32),
      anchoredTo: owner
        ? `${owner.tagName.toLowerCase()} "${(owner.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24)}"`
        : null,
    };
  });

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);
  if (!ok) failures += 1;
};

async function play() {
  await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
  await page.evaluate(() => window.__meridian.playTour());
  await page.waitForTimeout(1_500);
}

const next = async () => {
  await page.evaluate(() => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    [...(shadow?.querySelectorAll('button') ?? [])]
      .find((button) => /continue|next|finish|done|got it/i.test(button.textContent ?? ''))
      ?.click();
  });
  await page.waitForTimeout(1_000);
};

const go = async (hash) => {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
  await page.waitForTimeout(2_000);
};

// Step 4 anchors the projects table — the step that used to rebind to invoices.
await play();
await next();
await next();
await next();
check('step 4 shows on its own page', (await state()).visible, JSON.stringify(await state()));
await go('#/billing/plan');
const away = await state();
check('step 4 suspends on /billing/plan', !away.visible, JSON.stringify(away));
await go('#/projects/all');
const back = await state();
check(
  'step 4 comes back anchored to the projects table',
  back.visible && /Team|Project|Owner|Select/i.test(back.anchoredTo ?? ''),
  JSON.stringify(back),
);

// Everything the fixture keeps in the query: sort order, an open dialog, a
// session identifier. None of it is a different page.
await go('#/projects/all?sort=name');
check('a hash query change does not suspend', (await state()).visible, JSON.stringify(await state()));
await go('#/projects/all?sort=name&pop=import');
check('opening a row menu does not suspend', (await state()).visible, JSON.stringify(await state()));
await page.evaluate(() => {
  history.pushState(null, '', `/?session=abc123&q=invoices${location.hash}`);
});
await page.waitForTimeout(1_500);
check('a search-string change does not suspend', (await state()).visible, JSON.stringify(await state()));

// Step 5 anchors the Reports nav link, which exists on every screen: proof the
// fix is page scope and not just "the target went missing".
await play();
await next();
await next();
await next();
await next();
check('step 5 shows on /projects/all', (await state()).visible, JSON.stringify(await state()));
await go('#/reports/adoption');
const onReports = await state();
check('step 5 suspends on /reports even though its nav link is there', !onReports.visible, JSON.stringify(onReports));

await browser.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
