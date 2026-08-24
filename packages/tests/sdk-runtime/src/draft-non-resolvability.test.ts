import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §14.2, written into the tests as the research asks:
 *
 * > Draft isolation is achieved by non-resolvability, never by a visibility filter
 * > on a shared fetch.
 *
 * A visibility flag is a thing that can be wrong — one bad boolean and a
 * half-finished tour is in front of every customer. No path at all cannot be wrong.
 * These assertions are structural on purpose: they guard the *absence* of a code
 * path, which no behavioural test can do.
 */
const RUNTIME_SRC = '../../packages/sdk-runtime/src';

function sourceFiles(directory: string): readonly string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

/** Files that legitimately mention drafts: the authoring handoff, not delivery. */
const AUTHORING_SURFACES = ['activation', 'authoring-preview', 'local-dev'];

function deliveryFiles(): readonly string[] {
  return sourceFiles(RUNTIME_SRC).filter(
    (file) => !AUTHORING_SURFACES.some((surface) => file.includes(surface)),
  );
}

describe('draft isolation is non-resolvability, not a filter (§14.2)', () => {
  it('has no visibility flag anywhere in the delivery path', () => {
    const offenders: string[] = [];
    for (const file of deliveryFiles()) {
      const source = readFileSync(file, 'utf8');
      /**
       * A content-visibility flag the runtime could read is the failure mode this
       * rule exists to stop. CSS `visibility` is unrelated and deliberately not
       * matched — a pattern that cries wolf gets deleted.
       */
      if (/\b(includeDrafts|showDrafts|draftVisible|draftVisibility|visibleDrafts)\b/iu.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never asks a delivery endpoint for draft content', () => {
    const offenders: string[] = [];
    for (const file of deliveryFiles()) {
      const source = readFileSync(file, 'utf8');
      if (/['"`][^'"`]*\bdrafts?\b[^'"`]*['"`]\s*(?:,|\)|\})/iu.test(source)) offenders.push(file);
      if (/\/drafts?\b/iu.test(source)) offenders.push(file);
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it('keeps the draft-shaped words to the authoring handoff', () => {
    const mentions = sourceFiles(RUNTIME_SRC).filter((file) =>
      /\bnew-draft\b/u.test(readFileSync(file, 'utf8')),
    );
    // The one legitimate mention is the authoring activation intent, not delivery.
    expect(mentions.length).toBeGreaterThan(0);
    for (const file of mentions) {
      expect(AUTHORING_SURFACES.some((surface) => file.includes(surface))).toBe(true);
    }
  });
});
