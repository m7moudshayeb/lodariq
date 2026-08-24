/**
 * Does the creator's own Preview survive a reload?
 *
 * `t43` asks this of delivery. Preview is a separate answer and cannot borrow
 * delivery's: the runtime's resume record is validated against a published
 * manifest version and content hash, and a draft has neither — it recompiles on
 * every keystroke, so the runtime's rule (never resume into content that
 * changed) would discard a preview constantly, correctly and uselessly.
 *
 * The harder half is that a reload takes the authoring panel with it. What has
 * to come back is the session — which draft, which panel — before a step means
 * anything. So this checks the panel reopened *and* landed on the right step.
 *
 *   pnpm --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t44-preview-resume.mjs
 */
import { chromium } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const state = () =>
  page.evaluate(() => ({
    panel: Boolean(document.querySelector('lodariq-authoring-panel')),
    card: (
      document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('[role=dialog]')
        ?.textContent ?? ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 34),
    keys: Object.keys(sessionStorage).filter((key) => /resume/i.test(key)),
    url: location.href,
  }));

await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForSelector('lodariq-authoring-panel', { timeout: 20_000 });
await page.waitForTimeout(4_000);

const opened = await state();
check('the panel opens and previews', opened.panel && opened.card.length > 0, opened.card);

// Step 3 from the filmstrip, so the reload has something other than step 1 to
// come back to.
const steps = await page.getByRole('button', { name: /^Edit step \d+:/ }).all();
check('the filmstrip lists the authored steps', steps.length >= 3, `${steps.length} steps`);
await steps[2]?.click();
await page.waitForTimeout(3_000);

const onStepThree = await state();
check('preview moved to step 3', /Sort how you think/i.test(onStepThree.card), onStepThree.card);
check(
  'preview keeps its own record, separate from delivery',
  onStepThree.keys.includes('lodariq:preview-resume:wk_local_dev'),
  JSON.stringify(onStepThree.keys),
);
const urlBefore = onStepThree.url;

await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
await page.waitForTimeout(6_000);

const reloaded = await state();
check('the authoring session comes back', reloaded.panel, String(reloaded.panel));
check('...previewing the step it was left on', reloaded.card === onStepThree.card, reloaded.card);
check('...without touching the address bar', reloaded.url === urlBefore, reloaded.url);

await browser.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
