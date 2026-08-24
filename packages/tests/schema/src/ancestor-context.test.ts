import { describe, expect, it } from 'vitest';
import { ancestorContextSimilarity } from '@lodariq/schema/target-runtime';

/** Roles are read from the element outwards, so index 0 is its own parent. */
describe('ancestor context agrees by depth, not by presence', () => {
  it('agrees fully when the captured context sits directly above', () => {
    expect(ancestorContextSimilarity(['main'], ['main'])).toBe(1);
    expect(ancestorContextSimilarity(['toolbar', 'main'], ['toolbar', 'main'])).toBe(1);
  });

  it('falls away sharply for an element merely nested inside it', () => {
    const toolbarButton = ancestorContextSimilarity(['main'], ['main']);
    const rowMenu = ancestorContextSimilarity(['main'], ['table', 'main']);
    expect(rowMenu).toBeLessThan(toolbarButton);
    // 25 x 1.1 x each: 27.5 against 8.25, past the runner-up margin.
    expect(rowMenu).toBeCloseTo(0.3);
    expect(ancestorContextSimilarity(['main'], ['row', 'table', 'main'])).toBeCloseTo(0.09);
  });

  it('charges for a captured container the element does not have at all', () => {
    // Half the chain found, one container missing: 0.5 x one step of decay.
    expect(ancestorContextSimilarity(['toolbar', 'main'], ['toolbar', 'region'])).toBeCloseTo(0.15);
    // ...and here the toolbar is missing *and* a banner sits in between.
    expect(ancestorContextSimilarity(['toolbar', 'main'], ['banner', 'main'])).toBeCloseTo(0.045);
  });

  it('keeps a nested match above one that lacks the container entirely', () => {
    // The regression this exists for: a button with no `article` above it beat
    // the one that had it a container further out.
    const nested = ancestorContextSimilarity(['article', 'main'], ['article', 'region', 'main']);
    const absent = ancestorContextSimilarity(['article', 'main'], ['main']);
    expect(nested).toBeGreaterThan(absent);
  });

  it('does not charge for a container reported twice', () => {
    // Capture folds repeated roles away; resolution does not, so the same page
    // reads as `table, main` on one side and `table, table, main` on the other.
    expect(ancestorContextSimilarity(['table', 'main'], ['table', 'table', 'main'])).toBe(1);
  });

  it('is nothing when the context is absent or was never captured', () => {
    expect(ancestorContextSimilarity(['main'], ['dialog'])).toBe(0);
    expect(ancestorContextSimilarity([], ['main'])).toBe(0);
  });
});
