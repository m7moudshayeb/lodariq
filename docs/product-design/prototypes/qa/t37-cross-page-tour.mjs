/**
 * A two-page tour, walked end to end on the fixture application.
 *
 * `t36` proves the resolver refuses the wrong page. That is not the same claim
 * as "a tour that spans two screens works", which is what someone actually
 * authors. This plays one: step A anchored on Projects, step B anchored on
 * Billing, and walks the visitor between them the way a visitor would.
 *
 * The control run at the end is the point. With the page removed from both
 * targets — every target authored before this change — step B appears on
 * *Projects*, pointing at the Import button, and then goes blank once the
 * visitor reaches Billing where it belongs. Exactly backwards.
 *
 *   pnpm --filter @lodariq/sdk-runtime build   # fixture host on :5177
 *   node docs/product-design/prototypes/qa/t37-cross-page-tour.mjs
 */
import { chromium, REPO } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';
const TOUR_MODULE = `${HOST}/@fs${REPO}/packages/sdk-runtime/dist/renderers/tour.js`;

const PROJECTS = '#/projects/all';
const BILLING = '#/billing/plan';
// What `currentPageKey()` reads on the fixture host: pathname, then the route.
const PROJECTS_KEY = `/${PROJECTS}`;
const BILLING_KEY = `/${BILLING}`;

/**
 * Both identities are the shape authoring actually captured on the fixture —
 * no stable attributes, an accessible name, ancestor roles, and the page. The
 * fixture has several lookalike buttons on each screen, so `first` stands in
 * for the answer the creator gives to the disambiguation question.
 */
const target = (id, name, ancestorRoles, page) => ({
  id,
  fingerprint: { tagName: 'button', role: 'button', accessibleName: name, stableAttributes: {} },
  selection: { kind: 'first' },
  identity: {
    schemaVersion: 2,
    targetId: id,
    intent: { elementKind: 'control', requiredAction: 'anchor' },
    invariants: {},
    semantics: { tagName: 'button', role: 'button' },
    context: { ancestorRoles, ...(page ? { page: { key: page } } : {}) },
    localizedEvidence: [{ locale: 'en', accessibleName: name }],
    captureEvidence: {
      sampleCount: 1,
      stableSignalFamilies: ['element-semantics', 'ancestor-context', 'localized-text'],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.5,
      quality: 'usable',
    },
    display: { authorLabel: name },
  },
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

await page.goto(`${HOST}/${PROJECTS}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });

await page.evaluate(async (moduleUrl) => {
  const { TourPlayer } = await import(moduleUrl);
  window.__TourPlayer = TourPlayer;
  window.__peek = () => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    const card = shadow?.querySelector('[role="dialog"]');
    const ring = shadow?.querySelector('[data-lodariq-target-outline]');
    const box = ring && !ring.hidden ? ring.getBoundingClientRect() : null;
    const anchor = box
      ? document.elementFromPoint(box.x + box.width / 2, box.y + Math.min(8, box.height / 2))
      : null;
    return {
      hash: location.hash,
      visible: card ? !card.hidden : false,
      text: (card?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24),
      anchor: anchor ? (anchor.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) : null,
    };
  };
}, TOUR_MODULE);

const play = async (scoped) => {
  await page.evaluate(
    async ({ targets, hash }) => {
      window.__player?.stop();
      document.querySelectorAll('lodariq-tour').forEach((node) => node.remove());
      location.hash = hash;
      await new Promise((resolve) => setTimeout(resolve, 600));
      const step = (id, targetId, text) => ({
        id,
        targetId,
        placement: 'bottom',
        body: [
          { id: `${id}_h`, type: 'heading', text, props: {} },
          { id: `${id}_b`, type: 'button', text: 'Continue', props: { action: { type: 'next' } } },
        ],
      });
      window.__player = new window.__TourPlayer({
        documentId: 'doc_cross_page',
        type: 'tour',
        contentHash: 'local',
        schemaVersion: '1.0.0',
        compilerVersion: '0.1.0',
        targets,
        steps: [
          step('s_a', targets[0].id, 'PAGE A: start a project'),
          step('s_b', targets[1].id, 'PAGE B: pick a plan'),
        ],
      });
      window.__player.start();
    },
    {
      hash: PROJECTS,
      targets: [
        target('t_a', 'Create project', ['article', 'main'], scoped ? PROJECTS_KEY : null),
        target('t_b', 'Choose a plan', ['main'], scoped ? BILLING_KEY : null),
      ],
    },
  );
  await page.waitForTimeout(1_600);
};

const next = async () => {
  await page.evaluate(() => {
    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    [...(shadow?.querySelectorAll('button') ?? [])]
      .find((button) => /continue/i.test(button.textContent ?? ''))
      ?.click();
  });
  await page.waitForTimeout(1_400);
  return page.evaluate(() => window.__peek());
};

const go = async (hash) => {
  await page.evaluate((value) => {
    location.hash = value;
  }, hash);
  await page.waitForTimeout(1_600);
  return page.evaluate(() => window.__peek());
};

const peek = () => page.evaluate(() => window.__peek());

console.log('--- with the page recorded ---');
await play(true);
const a = await peek();
check(
  'step A shows on Projects, on its own button',
  a.visible && /Create project/.test(a.anchor ?? ''),
  JSON.stringify(a),
);

// Advancing to a step on another page takes the visitor there.
const bThere = await next();
check(
  'advancing walks the visitor to Billing',
  bThere.hash.includes('billing'),
  JSON.stringify(bThere),
);
check('  ...and step B shows once it arrives', bThere.visible, JSON.stringify(bThere));

// Leaving is the visitor's own move: it suspends, it never drags them back.
const bBack = await go(PROJECTS);
check(
  'leaving suspends rather than navigating back',
  !bBack.visible && bBack.hash.includes('projects'),
  JSON.stringify(bBack),
);

const bAgain = await go(BILLING);
check('and it returns when they come back', bAgain.visible, JSON.stringify(bAgain));

console.log('--- the same tour with no page recorded (every target authored before this) ---');
await play(false);
const unscopedA = await peek();
check('step A still shows on Projects', unscopedA.visible, JSON.stringify(unscopedA));

const unscopedB = await next();
check(
  'step B hijacks a Projects button — the bug',
  unscopedB.visible && !/Choose a plan/.test(unscopedB.anchor ?? ''),
  JSON.stringify(unscopedB),
);

const unscopedBilling = await go(BILLING);
check(
  '...and goes blank on Billing, where it belongs — also the bug',
  !unscopedBilling.visible,
  JSON.stringify(unscopedBilling),
);

await browser.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
