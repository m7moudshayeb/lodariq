/**
 * Every surface, with and without a target.
 *
 * The bug this exists to catch: a target used to decide layout, so any
 * experience the creator attached to an element turned back into a tour
 * tooltip, and `modal` had no rule of its own at all. The registry is now the
 * contract, so this harness reads the registry and asserts the rendered card
 * against it rather than against numbers pasted in here.
 *
 *   pnpm --filter @lodariq/sdk-runtime build
 *   pnpm --filter @lodariq/fixture-host dev
 *   node docs/product-design/prototypes/qa/t50-experience-surfaces.mjs
 *
 * SHOT=1 writes one screenshot per surface.
 *
 * The player comes from built `dist` on purpose: the src entry pulls
 * @floating-ui through Vite's dependency optimizer, and a long-lived dev server
 * serves a stale `?v=` hash for it until it is restarted. The registry has no
 * imports at all, so it is read from src and cannot drift from the source of
 * truth this harness is checking against.
 */
import { chromium, REPO, outDir } from './env.mjs';

const HOST = process.env['SDK_HOST'] ?? `http://localhost:${process.env.SDK_PORT ?? 5177}`;
const TOUR = `${HOST}/@fs${REPO}packages/sdk-runtime/dist/renderers/tour.js`;
const REGISTRY = `${HOST}/@fs${REPO}packages/sdk-runtime/src/renderers/experience-surface-registry.ts`;
const SHOT = process.env['SHOT'] === '1';

/** One document per surface, using the type that actually compiles to it. */
const SURFACES = [
  ['popup', { type: 'tour', surface: 'popup' }],
  ['modal', { type: 'announcement', surface: 'modal', frequency: 'always', dismissible: true }],
  ['banner', { type: 'announcement', surface: 'banner', frequency: 'always', dismissible: true }],
  ['slideIn', { type: 'announcement', surface: 'slideIn', frequency: 'always', dismissible: true }],
  ['hotspot', { type: 'hotspot', surface: 'hotspot', marker: 'pulse', activation: 'click' }],
  [
    'drawer',
    { type: 'checklist', surface: 'drawer', showProgress: true, completion: 'allItems', itemBlockIds: [] },
  ],
  [
    'floating',
    { type: 'checklist', surface: 'floating', showProgress: true, completion: 'allItems', itemBlockIds: [] },
  ],
];

const browser = await chromium.launch({ headless: process.env['HEADLESS'] !== '0' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));
await page.goto(`${HOST}/`, { waitUntil: 'networkidle' });

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
};

for (const [surface, experience] of SURFACES) {
  for (const targeted of [false, true]) {
    const measured = await page.evaluate(
      async ([tourUrl, registryUrl, behavior, withTarget]) => {
        const { TourPlayer } = await import(tourUrl);
        const { getExperienceSurfaceDefinition } = await import(registryUrl);
        document.querySelector('#lq-qa-target')?.remove();
        const anchorButton = document.createElement('button');
        anchorButton.id = 'lq-qa-target';
        anchorButton.setAttribute('data-lodariq-id', 'qa-anchor');
        anchorButton.setAttribute('aria-label', 'QA anchor');
        anchorButton.textContent = 'QA anchor';
        Object.assign(anchorButton.style, {
          position: 'fixed',
          top: '400px',
          left: '600px',
          zIndex: '0',
        });
        document.body.appendChild(anchorButton);

        const target = {
          id: 'target_qa_anchor',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'QA anchor',
            stableAttributes: { 'data-lodariq-id': 'qa-anchor' },
          },
        };
        const player = new TourPlayer({
          documentId: `doc_qa_${behavior.surface}_${withTarget ? 'targeted' : 'free'}`,
          type: behavior.type,
          contentHash: 'local-preview',
          schemaVersion: '1.0.0',
          compilerVersion: '0.1.0',
          targets: withTarget ? [target] : [],
          experience: behavior,
          steps: [
            {
              id: 'step_1',
              ...(withTarget ? { targetId: target.id, placement: 'bottom' } : {}),
              body: [
                { id: 'heading_1', type: 'heading', text: `${behavior.surface} surface`, props: {} },
                { id: 'text_1', type: 'text', text: 'Rendered by the QA harness.', props: {} },
              ],
            },
          ],
        });
        player.start();
        await player.waitUntilReady();

        const host = document.querySelector('lodariq-tour');
        const card = host?.shadowRoot?.querySelector('div[role="dialog"]');
        const backdrop = host?.shadowRoot?.querySelector('.tour-backdrop');
        const arrow = host?.shadowRoot?.querySelector('.tour-arrow');
        const rect = card?.getBoundingClientRect();
        const round = (value) => Math.round(value);
        return {
          definition: getExperienceSurfaceDefinition(behavior.surface),
          surfaceAnchor: host?.dataset.lodariqSurfaceAnchor ?? null,
          anchoredAttribute: card?.hasAttribute('data-lodariq-anchored') ?? null,
          ariaModal: card?.getAttribute('aria-modal'),
          hasClose: Boolean(card?.querySelector('.experience-close')),
          backdropVisible: backdrop ? !backdrop.hidden : false,
          arrowHidden: arrow?.hidden ?? null,
          rect: rect
            ? { top: round(rect.top), left: round(rect.left), width: round(rect.width), height: round(rect.height) }
            : null,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          stop: (globalThis.__lqQaStop = () => player.stop()) && true,
        };
      },
      [TOUR, REGISTRY, experience, targeted],
    );

    const label = `${surface}${targeted ? ' + target' : ''}`;
    const { definition, rect, viewport } = measured;
    const viewportAnchored = definition.anchor === 'viewport';

    if (SHOT) {
      await page.screenshot({
        path: `${outDir('t50-surfaces')}/${surface}-${targeted ? 'targeted' : 'free'}.png`,
      });
    }

    check(
      `${label}: a target does not decide layout`,
      measured.anchoredAttribute === (definition.anchor === 'target' && targeted),
      `anchored=${measured.anchoredAttribute}`,
    );
    if (viewportAnchored) {
      check(
        `${label}: the surface places itself inside the viewport`,
        rect !== null &&
          rect.left >= 0 &&
          rect.top >= 0 &&
          rect.left + rect.width <= viewport.width + 1 &&
          rect.top + rect.height <= viewport.height + 1,
        JSON.stringify(rect),
      );
    }
    if (surface === 'modal') {
      const centered =
        rect && Math.abs(rect.left + rect.width / 2 - viewport.width / 2) <= 2;
      check(`${label}: centers on the viewport`, Boolean(centered), JSON.stringify(rect));
    }
    if (surface === 'banner') {
      check(
        `${label}: sits at the top edge`,
        Boolean(rect && rect.top <= 16),
        JSON.stringify(rect),
      );
    }
    check(
      `${label}: focus contract matches the registry`,
      measured.ariaModal === (definition.focus === 'trap' ? 'true' : null),
      `aria-modal=${measured.ariaModal} focus=${definition.focus}`,
    );
    check(
      `${label}: backdrop contract matches the registry`,
      measured.backdropVisible === definition.backdrop,
      `backdrop=${measured.backdropVisible}`,
    );
    if (definition.kind !== 'popup') {
      check(
        `${label}: close control matches the registry`,
        measured.hasClose === definition.dismissal.includes('close-control'),
        `close=${measured.hasClose}`,
      );
    }
    check(
      `${label}: the arrow belongs to anchored surfaces only`,
      measured.arrowHidden === !(definition.anchor === 'target' && targeted),
      `arrowHidden=${measured.arrowHidden}`,
    );

    await page.evaluate(() => {
      globalThis.__lqQaStop?.();
      document.querySelector('lodariq-tour')?.remove();
      document.querySelector('#lq-qa-target')?.remove();
    });
  }
}

console.log(failures === 0 ? '\nall surfaces hold their contract' : `\n${failures} failing check(s)`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
