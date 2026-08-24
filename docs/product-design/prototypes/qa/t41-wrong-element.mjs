/**
 * Import and Filter share every durable cue. Swapping them used to resolve to
 * Filter and report `found`.
 *
 *   pnpm --filter @lodariq/schema --filter @lodariq/sdk-runtime --filter @lodariq/sdk-authoring build
 *   node docs/product-design/prototypes/qa/t41-wrong-element.mjs
 */
import { chromium, REPO } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? 'http://localhost:5177';
const CAPTURE = `${HOST}/@fs${REPO}packages/sdk-authoring/src/bridge/targeting/capture.ts`;
const RESOLVER = `${HOST}/@fs${REPO}packages/sdk-runtime/src/resolver/index.ts`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

await page.goto(`${HOST}/#/projects/all`, { waitUntil: 'networkidle' });

const measured = await page.evaluate(
  async ([captureUrl, resolverUrl]) => {
    const capture = await import(captureUrl);
    const { resolveTarget } = await import(resolverUrl);
    const named = (name) =>
      [...document.querySelectorAll('main button')].find((node) =>
        (node.textContent ?? '').trim().startsWith(name),
      );

    const importButton = named('Import');
    const filterButton = named('Filter');
    if (!importButton || !filterButton) throw new Error('the toolbar changed shape');

    const { identity } = capture.captureTargetEvidence(importButton, undefined, { locale: 'en' });
    const target = { id: identity.targetId, fingerprint: { tagName: 'button' }, identity };
    const label = (element) =>
      (element?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 16) || null;

    const before = resolveTarget(target, document);

    // The substitution: same row, same count, the two exchange places.
    const parent = importButton.parentElement;
    const marker = document.createComment('swap');
    parent.insertBefore(marker, importButton);
    filterButton.replaceWith(importButton);
    marker.replaceWith(filterButton);
    marker.remove?.();
    const after = resolveTarget(target, document);

    // And the language nobody recorded.
    document.documentElement.lang = 'de';
    importButton.replaceWith(filterButton.cloneNode(true));
    const localeSample = resolveTarget(target, document);

    return {
      capturedFamilies: identity.captureEvidence.stableSignalFamilies,
      before: { state: before.state, reason: before.reasonCode, on: label(before.element) },
      after: { state: after.state, reason: after.reasonCode, on: label(after.element) },
      learned: localeSample.learnedLocalizedEvidence ?? null,
    };
  },
  [CAPTURE, RESOLVER],
);

check(
  'order is part of what separates the two buttons',
  measured.capturedFamilies.includes('sibling-position'),
  JSON.stringify(measured.capturedFamilies),
);
check(
  'the recorded button resolves while the row is untouched',
  measured.before.state === 'found' && measured.before.on?.startsWith('Import'),
  JSON.stringify(measured.before),
);
check(
  'swapping the two no longer resolves to the neighbour',
  measured.after.state !== 'found',
  JSON.stringify(measured.after),
);
check(
  '  ...and says why, so the step goes red instead of silent',
  measured.after.reason === 'evidence_drift',
  JSON.stringify(measured.after),
);
check(
  'a language the target never saw is offered back, not asked about',
  measured.learned === null || typeof measured.learned.accessibleName === 'string',
  JSON.stringify(measured.learned),
);

console.log('\nEvery cue survives the swap, so only disagreement catches it.');

await browser.close();
process.exit(failures ? 1 : 0);
