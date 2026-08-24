import { describe, expect, it } from 'vitest';
import { semanticVersionDiff, type LodariqDocument } from '@lodariq/schema';
import fixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

describe('semantic version diff', () => {
  it('reports meaningful categories and ignores object key order', () => {
    const before = structuredClone(fixture) as LodariqDocument;
    const after = structuredClone(before);
    after.title = 'Updated onboarding';
    after.trigger = { type: 'event', config: { eventName: 'project_created' } };
    const diff = semanticVersionDiff({
      beforeId: 'version_before',
      afterId: 'version_after',
      beforeCanonical: before,
      afterCanonical: after,
    });

    expect(diff.requiresReview).toBe(true);
    expect(diff.entries.map((entry) => entry.category)).toEqual(
      expect.arrayContaining(['content', 'conditions']),
    );

    const reordered = structuredClone(before);
    const reorderedAudience = reordered.audience;
    const same = semanticVersionDiff({
      beforeId: 'version_before',
      afterId: 'version_after',
      beforeCanonical: before,
      afterCanonical: { ...reordered, audience: { ...reorderedAudience } },
    });
    expect(same.requiresReview).toBe(false);
  });
});
