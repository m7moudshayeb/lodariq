import { describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { changedAuthoringStepIds } from '../../../../apps/api/src/routes/control-plane/helpers/authoring-step-locks';

function fixture(): LodariqDocument {
  return structuredClone(tourFixture as LodariqDocument);
}

describe('authoring step lock change detection', () => {
  it('ignores document metadata and detects nested step content', () => {
    const current = fixture();
    const renamed = { ...current, title: 'A document-only edit' };
    expect(changedAuthoringStepIds(current, renamed)).toEqual([]);

    const edited = fixture();
    const heading = (
      edited.blocks[0] as { children: Array<{ children: Array<{ content?: string }> }> }
    ).children[0]?.children[0];
    if (!heading) throw new Error('fixture heading missing');
    heading.content = 'Changed copy';
    expect(changedAuthoringStepIds(current, edited)).toEqual(['block_step_1']);
  });

  it('maps localized copy and semantic target changes back to their step', () => {
    const current = fixture();
    const localized = fixture();
    const frenchHeading = localized.localization?.variants
      .find((variant) => variant.locale === 'fr')
      ?.blocks.find((block) => block.blockId === 'block_heading_1');
    if (!frenchHeading) throw new Error('fixture French heading missing');
    frenchHeading.content = 'Créer un projet';
    expect(changedAuthoringStepIds(current, localized)).toEqual(['block_step_1']);

    const retargeted = fixture();
    retargeted.targets[0] = {
      ...retargeted.targets[0]!,
      fingerprint: {
        ...retargeted.targets[0]!.fingerprint,
        accessibleName: 'Create project',
      },
    };
    expect(changedAuthoringStepIds(current, retargeted)).toEqual(['block_step_1']);
  });
});
