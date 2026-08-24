// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Target, TargetIdentityV2, TargetLocalizedEvidence } from '@lodariq/schema';
import { resolveTarget } from '@lodariq/sdk-runtime/resolver';

/**
 * Import and Filter share everything durable but their order. Swap them and the
 * recorded identity describes Filter exactly, so every "is it still here?" gate
 * says yes about the wrong button. Only disagreement catches it.
 */
/** jsdom measures zero, and a slot needs a box. Without this the two just tie. */
function laidOut(): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_440 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  [...document.querySelectorAll('main, header, div, button')].forEach((node, index) => {
    node.getBoundingClientRect = vi.fn(
      () =>
        ({
          x: 20 + index * 120,
          y: 40,
          left: 20 + index * 120,
          top: 40,
          width: 110,
          height: 32,
          right: 130 + index * 120,
          bottom: 72,
          toJSON: () => ({}),
        }) as DOMRect,
    );
  });
}

function renderToolbar(order: readonly string[]): void {
  const buttons = order
    .map((name) => `<button type="button" aria-haspopup="menu">${name}</button>`)
    .join('');
  document.body.innerHTML = `<main><header><div>${buttons}</div></header></main>`;
  laidOut();
}

const button = (name: string): Element =>
  [...document.querySelectorAll('button')].find((node) => node.textContent === name)!;

function identity(localizedEvidence: readonly TargetLocalizedEvidence[]): TargetIdentityV2 {
  return {
    schemaVersion: 2,
    targetId: 'target_import',
    intent: { elementKind: 'control', requiredAction: 'observe-click', resolutionMode: 'semantic' },
    invariants: { semanticAttributes: { 'aria-haspopup': 'menu' } },
    semantics: { tagName: 'button', role: 'button' },
    context: { ancestorRoles: ['main'] },
    localizedEvidence: [...localizedEvidence],
    visualFingerprints: [
      {
        viewportClass: 'desktop',
        // Only the slot is read here; the hashes are shape, not subject.
        structuralHash: '0'.repeat(16),
        occupancyGrid: '0'.repeat(64),
        appearanceHash: '0'.repeat(16),
        neighborhoodHash: '0'.repeat(16),
        layoutSlot: { siblingIndex: 0, siblingCount: 2 },
      },
    ],
    captureEvidence: {
      sampleCount: 5,
      stableSignalFamilies: [
        'semantic-attribute',
        'element-semantics',
        'ancestor-context',
        'sibling-position',
      ],
      uniqueCandidateCount: 1,
      runnerUpMargin: 0.3,
      quality: 'usable',
    },
    display: { authorLabel: 'Import' },
  };
}

const targetFor = (localizedEvidence: readonly TargetLocalizedEvidence[]): Target => ({
  id: 'target_import',
  fingerprint: { stableAttributes: {}, tagName: 'button', accessibleName: 'Import' },
  identity: identity(localizedEvidence),
});

const english = targetFor([{ locale: 'en', accessibleName: 'Import' }]);

/** The same target as a highlight step: the tour points at it and stops there. */
const highlighting = (target: Target): Target => ({
  ...target,
  identity: {
    ...target.identity!,
    intent: { elementKind: 'control', requiredAction: 'anchor', resolutionMode: 'semantic' },
  },
});

describe('a control that carries every recorded cue but is the wrong one', () => {
  it('takes the recorded button while the row is in the recorded order', () => {
    renderToolbar(['Import', 'Filter']);
    const result = resolveTarget(english, document);
    expect(result.state).toBe('found');
    expect(result.element).toBe(button('Import'));
  });

  it('refuses the neighbour after the two swap places', () => {
    renderToolbar(['Filter', 'Import']);
    const result = resolveTarget(english, document);
    // Before the contradiction gate this returned `found` on the Filter button.
    expect(result.element).toBeNull();
    expect(result.state).toBe('needs_review');
    expect(result.reasonCode).toBe('evidence_drift');
  });

  it('reports the copy changing without withholding a step that only points', () => {
    // Nobody else claims the name, so this is an edit rather than a substitution
    // — and a card drawn beside a renamed button is a mistake the user can see.
    renderToolbar(['Upload', 'Filter']);
    const result = resolveTarget(highlighting(english), document);
    expect(result.state).toBe('found');
    expect(result.element).toBe(button('Upload'));
    expect(result.reasonCode).toBe('resolved_with_drift');
  });

  it('withholds the same page from a step that clicks', () => {
    // Identical evidence, different stake. The recorded words are gone from the
    // page, which reads equally well as a rename and as a different control
    // standing where ours used to, and nothing here separates the two. Pointing
    // at the wrong button is recoverable; pressing it on the user's behalf is not.
    renderToolbar(['Upload', 'Filter']);
    const result = resolveTarget(english, document);
    expect(result.element).toBeNull();
    expect(result.state).toBe('needs_review');
    expect(result.reasonCode).toBe('evidence_drift');
  });
});

describe('languages the target was never captured in', () => {
  beforeEach(() => {
    document.documentElement.lang = 'ar';
  });

  it('does not read English copy against an Arabic page', () => {
    // A translated toolbar contradicts every recorded word and is correct.
    renderToolbar(['استيراد', 'تصفية']);
    const result = resolveTarget(english, document);
    expect(result.state).toBe('found');
    expect(result.element).toBe(button('استيراد'));
  });

  it('catches the swap once the Arabic label is known', () => {
    renderToolbar(['تصفية', 'استيراد']);
    const learned = targetFor([
      { locale: 'en', accessibleName: 'Import' },
      { locale: 'ar', accessibleName: 'استيراد' },
    ]);
    expect(resolveTarget(learned, document).reasonCode).toBe('evidence_drift');
  });
});

describe('copy that carries data', () => {
  it('matches the part that held still', () => {
    document.documentElement.lang = 'en';
    document.body.innerHTML =
      '<main><header><div>' +
      '<button type="button" aria-haspopup="menu">Delete (7)</button>' +
      '<button type="button" aria-haspopup="menu">Filter</button>' +
      '</div></header></main>';
    laidOut();
    const target = targetFor([{ locale: 'en', accessibleName: 'Delete', partial: true }]);
    const result = resolveTarget(target, document);
    expect(result.state).toBe('found');
    expect(result.element).toBe(button('Delete (7)'));
  });
});

describe('a language the target has no copy for', () => {
  it('reports what the control says so the author is never asked', () => {
    document.documentElement.lang = 'ar';
    renderToolbar(['استيراد', 'تصفية']);
    const result = resolveTarget(english, document);
    expect(result.learnedLocalizedEvidence).toEqual({ locale: 'ar', accessibleName: 'استيراد' });
  });

  it('offers nothing for a language already recorded', () => {
    document.documentElement.lang = 'en';
    renderToolbar(['Import', 'Filter']);
    expect(resolveTarget(english, document).learnedLocalizedEvidence).toBeUndefined();
  });

  it('offers nothing when the win was not clean', () => {
    // A shaky resolve would teach the wrong word permanently.
    document.documentElement.lang = 'ar';
    renderToolbar(['تصفية', 'استيراد']);
    const learned = targetFor([
      { locale: 'en', accessibleName: 'Import' },
      { locale: 'ar', accessibleName: 'استيراد' },
    ]);
    expect(resolveTarget(learned, document).learnedLocalizedEvidence).toBeUndefined();
  });
});
