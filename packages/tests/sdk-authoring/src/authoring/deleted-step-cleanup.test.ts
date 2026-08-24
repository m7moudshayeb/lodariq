import { describe, expect, it } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import { documentLocalizationIssues } from '@lodariq/schema';
import { documentWithBlocks, removeTopLevelBlock } from '@lodariq/sdk-authoring';
import { deleteSelectedTourSteps } from '../../../../sdk-authoring/src/authoring/step-batch-operations';

/**
 * Deleting a step used to leave its translations behind, and the document then
 * stopped compiling with `unknown_block` — the tour would not play at all until
 * someone went into the JSON and removed them by hand.
 */

function twoStepTour(): LodariqDocument {
  return {
    id: 'doc_two_step',
    workspaceId: 'wk_test',
    type: 'tour',
    status: 'draft',
    title: 'Welcome tour',
    schemaVersion: '1.0.0',
    trigger: { type: 'manual', config: {} },
    audience: { environments: ['development'], rules: [] },
    targets: [
      {
        id: 'target_a',
        fingerprint: { tagName: 'button', accessibleName: 'Create project' },
      },
      {
        id: 'target_b',
        fingerprint: { tagName: 'button', accessibleName: 'Choose a plan' },
      },
    ],
    blocks: [
      step('step_a', 'heading_a', 'target_a', 'Start a project'),
      step('step_b', 'heading_b', 'target_b', 'Pick a plan'),
    ],
    localization: {
      defaultLocale: 'en',
      variants: [
        {
          locale: 'de',
          fallbackLocale: 'en',
          title: 'Willkommenstour',
          blocks: [
            { blockId: 'heading_a', content: 'Projekt starten' },
            { blockId: 'heading_b', content: 'Tarif wählen' },
          ],
          targetOverrides: [{ targetId: 'target_b', replacementTargetId: 'target_a' }],
        },
      ],
    },
  } as LodariqDocument;
}

function step(id: string, headingId: string, targetId: string, text: string) {
  return {
    id,
    type: 'tourStep' as const,
    props: { index: 0 },
    status: 'ready' as const,
    children: [
      {
        id: `${id}_tooltip`,
        type: 'tooltip' as const,
        props: { placement: 'bottom', targetId },
        status: 'ready' as const,
        children: [
          {
            id: headingId,
            type: 'heading' as const,
            content: text,
            props: { level: 2 },
            status: 'ready' as const,
            children: [],
          },
        ],
      },
    ],
  };
}

const localizationErrors = (document: LodariqDocument) =>
  documentLocalizationIssues(document).filter((issue) => issue.code === 'unknown_block');

describe('deleting a step takes its translations with it', () => {
  it('leaves a document that still compiles', () => {
    const document = twoStepTour();
    expect(localizationErrors(document)).toEqual([]);

    const blocks = removeTopLevelBlock(document.blocks, 'step_b');
    expect(blocks).not.toBeNull();
    const next = documentWithBlocks(document, blocks!);

    expect(localizationErrors(next)).toEqual([]);
    expect(next.localization?.variants[0]?.blocks.map((entry) => entry.blockId)).toEqual([
      'heading_a',
    ]);
  });

  it('drops the deleted step target, and any override pointing at it', () => {
    const document = twoStepTour();
    const blocks = removeTopLevelBlock(document.blocks, 'step_b')!;
    const next = documentWithBlocks(document, blocks);

    expect(next.targets.map((target) => target.id)).toEqual(['target_a']);
    expect(next.localization?.variants[0]?.targetOverrides ?? []).toEqual([]);
  });

  it('keeps the surviving step translated', () => {
    const document = twoStepTour();
    const next = documentWithBlocks(document, removeTopLevelBlock(document.blocks, 'step_a')!);

    expect(next.localization?.variants[0]?.blocks).toEqual([
      { blockId: 'heading_b', content: 'Tarif wählen' },
    ]);
    expect(next.localization?.variants[0]?.title).toBe('Willkommenstour');
  });

  it('cleans up after a multi-step delete too', () => {
    const document = twoStepTour();
    const next = deleteSelectedTourSteps(document, new Set(['step_a', 'step_b']));

    expect(localizationErrors(next)).toEqual([]);
    expect(next.targets).toEqual([]);
    expect(next.localization?.variants[0]?.blocks ?? []).toEqual([]);
  });
});
