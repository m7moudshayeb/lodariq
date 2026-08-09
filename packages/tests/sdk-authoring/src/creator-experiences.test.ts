import { describe, expect, it } from 'vitest';
import {
  CREATOR_ENABLED_EXPERIENCE_TYPES,
  createTourDraft,
} from '@lodariq/sdk-authoring/creator-experiences';

describe('creator experience capabilities', () => {
  it('advertises only experience types that Phase 2 can actually create and run', () => {
    expect(CREATOR_ENABLED_EXPERIENCE_TYPES.map((type) => type.id)).toEqual(['tour']);
  });

  it('creates a useful, distinct draft tour without a preconfigured placement', () => {
    let blockId = 0;
    const document = createTourDraft({
      documentId: 'doc_new_tour',
      workspaceId: 'wk_creator',
      environment: 'staging',
      schemaVersion: '1.0.0',
      createBlockId: () => `blk_${++blockId}`,
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
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({
      id: 'blk_1',
      type: 'tourStep',
      status: 'incomplete',
      props: { index: 0 },
    });
    expect(document.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
    ]);
  });
});
