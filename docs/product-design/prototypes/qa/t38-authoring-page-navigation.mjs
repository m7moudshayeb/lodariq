/**
 * Cross-page navigation from inside the authoring session.
 *
 * `t37` walks a two-page tour with the runtime alone. This walks the same idea
 * through the creator's own controls: the filmstrip, the preview pill and the
 * card's own Continue. Two different mechanisms sit behind those — selecting a
 * step navigates from the authoring side, advancing navigates from the runtime
 * — and only one of them was wired, so a tour spanning two screens could be
 * stepped through from the preview toolbar and not from the card.
 *
 * It runs against the *built* SDK the fixture host loads, which is the other
 * half of that bug: the runtime change existed in source and had never been
 * bundled into `@lodariq/sdk-authoring`, so the browser never saw it.
 *
 *   pnpm --filter @lodariq/sdk-authoring build   # fixture host on :5177
 *   node docs/product-design/prototypes/qa/t38-authoring-page-navigation.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, REPO } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';
const PROJECTS = '#/projects/all';
const SETTINGS = '#/settings/general';

const fixture = JSON.parse(
  readFileSync(join(REPO, 'packages/schema/fixtures/tour.linear.v1.json'), 'utf8'),
);

/**
 * The shape authoring captures. Only an identity can carry a page, and an
 * identity replaces the fingerprint match — so each one needs a signal that
 * actually singles its element out, or it matches every button in the landmark.
 */
const target = (id, name, pageKey, invariants) => ({
  id,
  fingerprint: { tagName: 'button', role: 'button', accessibleName: name, stableAttributes: {} },
  selection: { kind: 'first' },
  identity: {
    schemaVersion: 2,
    targetId: id,
    intent: { elementKind: 'control', requiredAction: 'anchor', resolutionMode: 'semantic' },
    invariants,
    semantics: { tagName: 'button', role: 'button' },
    context: { page: { key: pageKey }, ancestorRoles: ['main'] },
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

/*
 * Step 1 onto Projects, step 2 onto Settings. The fixture is authored entirely
 * on Projects, so both have to be re-pointed for the tour to span two screens.
 */
const steps = fixture.blocks.filter((block) => block.type === 'tourStep');
const [stepOne, stepTwo] = steps;
const pointAt = (step, targetId) => ({
  ...step,
  children: step.children.map((child) =>
    child.props?.targetId ? { ...child, props: { ...child.props, targetId } } : child,
  ),
});

const seedDocument = {
  ...fixture,
  targets: [
    target('t38_projects', 'Create project', `/${PROJECTS}`, {
      configuredAttributes: { 'data-lodariq-id': 'new-project' },
    }),
    target('t38_settings', 'Advanced', `/${SETTINGS}`, {}),
    ...fixture.targets,
  ],
  blocks: fixture.blocks.map((block) => {
    if (block.id === stepOne.id) return pointAt(block, 't38_projects');
    if (block.id === stepTwo.id) return pointAt(block, 't38_settings');
    return block;
  }),
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

await page.addInitScript(
  ({ doc }) => {
    localStorage.setItem(`lodariq:doc:${doc.id}`, JSON.stringify(doc));
    localStorage.setItem(
      `lodariq:creator-index:${doc.workspaceId}`,
      JSON.stringify([{ documentId: doc.id, routeKey: '/', title: doc.title, type: doc.type }]),
    );
  },
  { doc: seedDocument },
);

await page.goto(`${HOST}/${SETTINGS}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__meridian), null, { timeout: 20_000 });
await page.evaluate(() => window.__meridian.openAuthoring());
await page.waitForSelector('[data-step-id]', { timeout: 20_000 });

const shell = () =>
  page.evaluate(() => {
    const root = document.querySelector('lodariq-authoring-panel')?.shadowRoot;
    const active = root?.querySelector('[data-step-id][aria-current="step"]');
    return {
      hash: location.hash,
      step: active?.getAttribute('data-step-id') ?? null,
      state: active?.getAttribute('data-target-state') ?? null,
    };
  });

/**
 * The runtime card and what its outline is drawn around. The authoring canvas
 * puts its own handles over the target, so the ring is compared with the
 * element's own rect rather than read with `elementFromPoint`.
 */
const card = ([selector, label]) =>
  page.evaluate(
    ({ match, text }) => {
      const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
      const dialog = shadow?.querySelector('[role="dialog"]');
      const ring = shadow?.querySelector('[data-lodariq-target-outline]');
      const box = ring && !ring.hidden ? ring.getBoundingClientRect() : null;
      const nodes = [...document.querySelectorAll(match)];
      const element = text
        ? nodes.find((node) => (node.textContent ?? '').trim() === text)
        : nodes[0];
      const rect = element?.getBoundingClientRect();
      return {
        hash: location.hash,
        visible: dialog ? !dialog.hidden : false,
        // Within a few pixels: the outline is drawn slightly outside its element.
        onTarget: Boolean(
          box && rect && Math.abs(box.x + box.width / 2 - (rect.x + rect.width / 2)) < 8,
        ),
        box: box ? [Math.round(box.x), Math.round(box.width)] : null,
        rect: rect ? [Math.round(rect.x), Math.round(rect.width)] : null,
      };
    },
    { match: selector, text: label ?? null },
  );

const PROJECTS_BUTTON = ['[data-lodariq-id="new-project"]'];
const SETTINGS_BUTTON = ['button', 'Advanced'];

const settleOn = async (hash) => {
  await page
    .waitForFunction((value) => location.hash === value, hash, { timeout: 4_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1_200);
};

const selectStep = async (stepId, expected) => {
  await page.locator(`[data-step-id="${stepId}"]`).click();
  await settleOn(expected);
};

// Selecting a step already on this screen must not move the creator.
await selectStep(stepTwo.id, SETTINGS);
const stayed = await shell();
check(
  'selecting a step on this page leaves the creator where they are',
  stayed.hash === SETTINGS && stayed.step === stepTwo.id,
  JSON.stringify(stayed),
);

// Selecting one that belongs elsewhere is a request to go there.
await selectStep(stepOne.id, PROJECTS);
const moved = await shell();
check(
  'selecting a step on another page takes the creator to it',
  moved.hash === PROJECTS && moved.step === stepOne.id,
  JSON.stringify(moved),
);
const anchored = await card(PROJECTS_BUTTON);
check(
  '  ...and the card anchors to its target once there',
  anchored.visible && anchored.onTarget,
  JSON.stringify(anchored),
);

// Preview runs from the step it starts on, and Continue walks to the next page.
await page.locator('button.overlay-mode-pill-preview').click();
await settleOn(PROJECTS);
const previewing = await card(PROJECTS_BUTTON);
check(
  'preview opens on the step it starts from',
  previewing.visible && previewing.onTarget,
  JSON.stringify(previewing),
);

await page.evaluate(() => {
  const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
  [...(shadow?.querySelectorAll('button') ?? [])]
    .find((button) => /continue|next/i.test(button.textContent ?? ''))
    ?.click();
});
await settleOn(SETTINGS);
const advanced = await card(SETTINGS_BUTTON);
check(
  "the card's own Continue walks the creator to the next page",
  advanced.hash === SETTINGS,
  JSON.stringify(advanced),
);
check(
  '  ...and the next step shows once it arrives',
  advanced.visible && advanced.onTarget,
  JSON.stringify(advanced),
);

await browser.close();
process.exit(failures ? 1 : 0);
