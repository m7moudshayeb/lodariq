import { describe, expect, it } from 'vitest';
import {
  CREATOR_ENABLED_EXPERIENCE_TYPES,
  createTourDraft,
} from '@lodariq/sdk-authoring/creator-experiences';

describe('creator experience capabilities', () => {
  it('advertises only experience types that Phase 2 can actually create and run', () => {
    expect(CREATOR_ENABLED_EXPERIENCE_TYPES.map((type) => type.id)).toEqual(['tour']);
  });

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
