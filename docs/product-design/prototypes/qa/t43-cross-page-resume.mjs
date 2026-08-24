/**
 * Does a tour survive the visitor leaving the page?
 *
 * `t37` walks a two-page tour with hash routing, where the SDK is never torn
 * down. The reported failure is the other case: the next step is on a screen
 * that is a separate bundle, the browser throws the document away, and the tour
 * comes back at step 1. This drives that: play, advance, hard-navigate, and ask
 * what step came back.
 *
 * It also watches the address bar. Resume must be invisible from the URL — a
 * `?tour=` or `&step=` appended to a customer's page breaks their routing,
 * their analytics and the back button.
 *
 *   pnpm --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t43-cross-page-resume.mjs
 */
import { chromium } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';
const PROJECTS = '#/projects/all';
const BILLING = '#/billing/plan';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const peek = () =>
  page.evaluate(() => {
    const card = document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('[role=dialog]');
    return {
      url: location.href,
      visible: card ? !card.hidden : false,
      text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
      resumeKeys: Object.keys(sessionStorage).filter((key) => /resume/i.test(key)),
    };
  });

const booted = () => page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20000 });

const continueStep = async () => {
  await page.evaluate(() => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    [...(shadow?.querySelectorAll('button') ?? [])]
      .find((button) => /continue|next/i.test(button.textContent ?? ''))
      ?.click();
  });
  await page.waitForTimeout(1200);
};

await page.goto(`${HOST}/${PROJECTS}`, { waitUntil: 'networkidle' });
await booted();

// Started the way the host's own chrome starts it, which is the path the report
// came from. `Lodariq.playTour` direct is already covered by the e2e suite.
await page.evaluate(() => window.__meridian.playTour());
await page.waitForTimeout(1500);

const first = await peek();
check('step 1 shows', first.visible && /Create your first project/i.test(first.text), first.text);

await continueStep();
await continueStep();
const third = await peek();
check('advanced to step 3', third.visible && !/Create your first project/i.test(third.text), third.text);
check(
  'the SDK owns the only resume record',
  third.resumeKeys.length === 1 && third.resumeKeys[0].startsWith('lodariq:tour-resume:'),
  JSON.stringify(third.resumeKeys),
);
const urlBefore = third.url;

// A full document teardown on the same screen: everything the SDK held in
// memory is gone and the loader boots from nothing.
await page.reload({ waitUntil: 'networkidle' });
await booted();
await page.waitForTimeout(2000);

const reloaded = await peek();
check('the tour comes back after a full reload', reloaded.visible, reloaded.text);
check('...on the step it was left on, not step 1', reloaded.text === third.text, reloaded.text);
check('...and the URL is untouched', reloaded.url === urlBefore, reloaded.url);

// Now the reported shape: a hard navigation that also changes the screen.
await page.goto(`${HOST}/${BILLING}`, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await booted();
await page.waitForTimeout(2000);
const onBilling = await peek();
check(
  'no `?tour=` or `&step=` is appended on the way',
  !/[?&](tour|step)=/.test(onBilling.url),
  onBilling.url,
);

await page.evaluate((hash) => {
  location.hash = hash;
}, PROJECTS);
await page.waitForTimeout(2000);
const back = await peek();
check(
  'crossing to another screen and back keeps the step',
  back.visible && back.text === third.text,
  back.text,
);

// The control: ending the tour takes the stored position with it, so the next
// page load is a fresh visit rather than a replay of a tour that is over.
await page.evaluate(() => window.__meridian.stopTour());
await page.waitForTimeout(600);
const stopped = await peek();
check('ending the tour clears the stored position', stopped.resumeKeys.length === 0, JSON.stringify(stopped.resumeKeys));

await page.reload({ waitUntil: 'networkidle' });
await booted();
await page.waitForTimeout(1500);
const afterStop = await peek();
check('...and it does not come back on the next load', !afterStop.visible, afterStop.text);

await browser.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
