import { describe, expect, it } from 'vitest';
import {
  CREATOR_ENABLED_EXPERIENCE_TYPES,
  createExperienceDraft,
  createTourDraft,
} from '@lodariq/sdk-authoring/creator-experiences';

describe('creator experience capabilities', () => {
  it('advertises only experience types the pipeline can create, compile and run', () => {
    // `knowledge` is registered but seeds no blocks, so it stays out of the
    // catalog rather than authoring into an artifact with nothing in it.
    expect(CREATOR_ENABLED_EXPERIENCE_TYPES.map((type) => type.id)).toEqual([
      'tour',
      'announcement',
      'hotspot',
      'survey',
      'checklist',
    ]);
  });

  it.each(['announcement', 'hotspot', 'survey', 'checklist'] as const)(
    'creates seeded %s drafts with closed default behavior',
    (type) => {
      const document = createExperienceDraft({
        documentId: `doc_${type}`,
        workspaceId: 'wk_creator',
        environment: 'staging',
        schemaVersion: '2.0.0',
        type,
      });
      expect(document.type).toBe(type);
      expect(document.experience?.type).toBe(type);
      expect(document.blocks.length).toBeGreaterThan(0);
    },
  );

  it('creates a distinct empty draft tour without showing a step initially', () => {
    const document = createTourDraft({
      documentId: 'doc_new_tour',
      workspaceId: 'wk_creator',
      environment: 'staging',
      schemaVersion: '1.0.0',
    });

    expect(document).toMatchObject({
      id: 'doc_new_tour',
      workspaceId: 'wk_creator',
      type: 'tour',
      status: 'draft',
      title: 'Untitled tour',
      trigger: { type: 'manual' },
      audience: { environments: ['staging'] },
      targets: [],
      schemaVersion: '1.0.0',
    });
    expect(document.blocks).toEqual([]);
  });
});
