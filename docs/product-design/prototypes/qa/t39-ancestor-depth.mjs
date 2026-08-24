/**
 * "How is this button not unique?"
 *
 * The Projects toolbar has one Import button. Picking it asked which of ten
 * things on the page the creator meant. The ten were Import, Filter and the
 * eight row menus in the table below — every one a `button`, every one inside
 * `main`, every one carrying `aria-haspopup="menu"`. Ancestor context was
 * tested by asking whether the captured roles appeared *somewhere* above, so a
 * control captured directly under `main` matched everything buried inside it.
 *
 * This measures the tie set on the real fixture, with each cue removed in turn,
 * because the failure only shows when the capture is one cue short. It runs the
 * capture module against the live page rather than a fixture DOM: the roles a
 * real application produces are the whole subject.
 *
 *   pnpm --filter @lodariq/schema --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t39-ancestor-depth.mjs
 */
import { chromium, REPO } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';
const CAPTURE = `${HOST}/@fs${REPO}packages/sdk-authoring/src/bridge/targeting/capture.ts`;
const PICKER = `${HOST}/@fs${REPO}packages/sdk-authoring/src/bridge/target-picker.ts`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });

const measured = await page.evaluate(async (url) => {
  const capture = await import(url);
  const button = [...document.querySelectorAll('button')].find((node) =>
    (node.textContent ?? '').trim().startsWith('Import'),
  );
  if (!button) throw new Error('the fixture has no Import button');
  const base = capture.captureTargetEvidence(button, undefined, { locale: 'en' });

  /** The same identity with one cue taken away, as a thin capture would have it. */
  const without = (family) => ({
    ...base.identity,
    invariants: family === 'semantic-attribute' ? {} : base.identity.invariants,
    captureEvidence: {
      ...base.identity.captureEvidence,
      stableSignalFamilies: base.identity.captureEvidence.stableSignalFamilies.filter(
        (entry) => entry !== family,
      ),
    },
  });
  const label = (element) =>
    (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) || element.tagName;
  const tied = (identity) => capture.ambiguousCandidates(button, identity).map(label);

  return {
    everything: tied(base.identity),
    withoutOrdinal: tied(without('sibling-position')),
    withoutAttribute: tied(without('semantic-attribute')),
    menuButtons: document.querySelectorAll('main [aria-haspopup="menu"]').length,
  };
}, CAPTURE);

// The page really does have ten of them; that part was never wrong.
check(
  'the page holds ten menu buttons for the resolver to tell apart',
  measured.menuButtons === 10,
  `${measured.menuButtons}`,
);

check(
  'a full capture of Import is unique',
  measured.everything.length === 0,
  JSON.stringify(measured.everything),
);

// The reported failure: one cue short, and it used to tie with all ten.
check(
  'one cue short, it no longer ties with the rows below it',
  measured.withoutOrdinal.every((name) => /Import|Filter/.test(name)),
  JSON.stringify(measured.withoutOrdinal),
);
// Import and Filter never shared a name, so the words finish what is left.
check(
  '  ...and the toolbar pair it is left with is settled by name',
  measured.withoutOrdinal.length === 0,
  JSON.stringify(measured.withoutOrdinal),
);

check(
  'the container is enough on its own when the attribute goes instead',
  measured.withoutAttribute.length === 0,
  JSON.stringify(measured.withoutAttribute),
);

// The creator's half of it: picking that button must not stop to ask anything.
const picked = await page.evaluate(async (url) => {
  const { startTargetPicker } = await import(url);
  const button = [...document.querySelectorAll('main button')].find((node) =>
    (node.textContent ?? '').trim().startsWith('Import'),
  );
  const result = await new Promise((resolve) => {
    startTargetPicker({ initialTarget: button, requiredAction: 'anchor', onPick: resolve });
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    setTimeout(() => resolve(null), 3_000);
  });
  return {
    picked: Boolean(result),
    asked: document.querySelectorAll('[data-action="choose-look-alike"]').length,
    telemetry: Boolean(
      document.querySelector('[data-lodariq-bridge="target-card-technical-copy"]'),
    ),
  };
}, PICKER);

check(
  'picking it commits without asking anything',
  picked.picked && picked.asked === 0,
  JSON.stringify(picked),
);
check(
  'and shows the creator no capture telemetry',
  picked.telemetry === false,
  JSON.stringify(picked),
);

console.log(
  '\nImport and Filter are two buttons in one toolbar with the same role and the\n' +
    'same aria. Nothing durable separates them but their order, which is what\n' +
    '`sibling-position` is for. Ten was the bug; two is the honest answer.',
);

await browser.close();
process.exit(failures ? 1 : 0);
