import { describe, expect, it } from 'vitest';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import { isValidCompiledRuntimeArtifact } from '@lodariq/schema/compiled-runtime';
import { compileDocument } from '@lodariq/compiler';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

/**
 * The creator's answer to "which of these look-alikes did you mean" was left
 * out of the delivery artifact. The publish gate refuses an ambiguous target
 * without one, so every published tour that needed an answer shipped without
 * it — the resolver saw the ambiguity, abstained, and the step never anchored.
 */

const withSelection = (selection: unknown): LodariqDocument => {
  const document = structuredClone(tourFixture) as LodariqDocument;
  const target = document.targets[0];
  if (!target) throw new Error('fixture has no target');
  (target as { selection?: unknown }).selection = selection;
  return document;
};

const input = (document: LodariqDocument) => ({
  document,
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
});
/** The hashed, delivery-shaped artifact — `compile` alone is preview-only. */
const publishTour = (document: LodariqDocument) => compileDocument(input(document));

describe('the author answer reaches delivery', () => {
  it('carries a look-alike answer onto the compiled target', async () => {
    const compiled = await publishTour(withSelection({ kind: 'any-matching' }));

    expect(compiled.targets[0]?.selection).toEqual({ kind: 'any-matching' });
    expect(isValidCompiledRuntimeArtifact(compiled)).toBe(true);
  });

  it('carries the answers that name a position or a container', async () => {
    for (const selection of [
      { kind: 'first' },
      { kind: 'last' },
      { kind: 'ordinal', position: 2, order: 'reading-order' },
      { kind: 'newest-in-collection', collectionLabel: 'Projects' },
      { kind: 'within-container', containerLabel: 'Project workspace' },
    ]) {
      const compiled = await publishTour(withSelection(selection));
      expect(compiled.targets[0]?.selection, JSON.stringify(selection)).toEqual(selection);
      expect(isValidCompiledRuntimeArtifact(compiled), JSON.stringify(selection)).toBe(true);
    }
  });

  it('leaves the field off a target that never needed an answer', async () => {
    const compiled = await publishTour(structuredClone(tourFixture) as LodariqDocument);

    expect(compiled.targets[0]).not.toHaveProperty('selection');
    expect(isValidCompiledRuntimeArtifact(compiled)).toBe(true);
  });

  it('changes the content hash, so an answer cannot be swapped invisibly', async () => {
    const withAnswer = await publishTour(withSelection({ kind: 'first' }));
    const withOther = await publishTour(withSelection({ kind: 'last' }));

    expect(withAnswer.contentHash).toMatch(/^sha256-/);
    expect(withAnswer.contentHash).not.toBe(withOther.contentHash);
  });
});
