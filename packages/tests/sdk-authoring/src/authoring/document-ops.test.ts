import { describe, expect, it } from 'vitest';
import type { TalmehBlock } from '@talmeh/schema';
import {
  attachTargetToBlocks,
  blocksReferenceTarget,
  createContentBlock,
  createTourStep,
  hasBlock,
  insertBlockInsideTourStep,
  insertTopLevelBlock,
  moveStepChildBlock,
  moveTopLevelBlock,
  renumberTourSteps,
  removeTargetFromBlocks,
  reorderTopLevelBlock,
  setBlockAction,
  transformBlocks,
  updateBlockContent,
} from '@talmeh/sdk-authoring';

const blocks: TalmehBlock[] = [
  {
    id: 'step_1',
    type: 'tourStep',
    props: {},
    status: 'incomplete',
    children: [
      {
        id: 'tooltip_1',
        type: 'tooltip',
        props: {},
        children: [{ id: 'copy_1', type: 'paragraph', content: 'Hello', props: {}, children: [] }],
      },
    ],
  },
  { id: 'copy_2', type: 'paragraph', content: 'Second', props: {}, children: [] },
];

describe('authoring document ops', () => {
  it('creates a canonical editable tour step with heading, body, and next button', () => {
    const step = createTourStep(2);

    expect(step).toMatchObject({
      type: 'tourStep',
      props: { index: 2 },
      status: 'incomplete',
      children: [
        {
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'incomplete',
        },
      ],
    });
    expect(step.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
    ]);
    expect(step.children[0]?.children[2]).toMatchObject({
      content: 'Continue',
      props: { variant: 'primary', action: { type: 'next' } },
    });
  });

  it('updates nested content and renumbers authored tour steps', () => {
    const step = createTourStep(9);
    const headingId = step.children[0]?.children[0]?.id ?? '';
    const updated = updateBlockContent([step], headingId, 'Updated heading');

    expect(updated[0]?.children[0]?.children[0]?.content).toBe('Updated heading');
    expect(step.children[0]?.children[0]?.content).toBe('Untitled step');
    expect(
      renumberTourSteps([step, { ...step, id: 'step_2' }]).map((block) => block.props),
    ).toEqual([{ index: 0 }, { index: 1 }]);
  });

  it('finds nested blocks and transforms block types', () => {
    expect(hasBlock(blocks, 'copy_1')).toBe(true);

    const next = transformBlocks(blocks, 'copy_2', 'button');

    expect(next[1]).toMatchObject({
      id: 'copy_2',
      type: 'button',
      content: 'Second',
      status: 'incomplete',
      props: { variant: 'primary' },
    });
    expect(blocks[1]?.type).toBe('paragraph');
  });

  it('sets and clears button actions without losing local draft content', () => {
    const transformed = transformBlocks(blocks, 'copy_2', 'button');
    const withAction = setBlockAction(transformed, 'copy_2', { type: 'clickTarget' });
    const withoutAction = setBlockAction(withAction, 'copy_2', null);

    expect(withAction[1]).toMatchObject({
      type: 'button',
      content: 'Second',
      status: 'ready',
      props: { variant: 'primary', action: { type: 'clickTarget' } },
    });
    expect(withoutAction[1]).toMatchObject({
      type: 'button',
      content: 'Second',
      status: 'incomplete',
      props: { variant: 'primary' },
    });
  });

  it('creates media placeholders as structured incomplete block JSON', () => {
    const media = createContentBlock('media');

    expect(media).toMatchObject({
      type: 'media',
      content: 'Media placeholder',
      props: {},
      status: 'incomplete',
      children: [],
    });
    expect(media.id).toMatch(/^block_/);
  });

  it('inserts top-level blocks before and after existing blocks without reordering', () => {
    const heading = { ...createContentBlock('heading'), id: 'heading_new' };
    const media = { ...createContentBlock('media'), id: 'media_new' };
    const afterFirst = insertTopLevelBlock(blocks, 'step_1', heading, 'after');
    const beforeSecond = afterFirst
      ? insertTopLevelBlock(afterFirst, 'copy_2', media, 'before')
      : null;

    expect(beforeSecond?.map((block) => block.id)).toEqual([
      'step_1',
      'heading_new',
      'media_new',
      'copy_2',
    ]);
    expect(blocks.map((block) => block.id)).toEqual(['step_1', 'copy_2']);
  });

  it('inserts and reorders editable content inside a tour step', () => {
    const paragraph = { ...createContentBlock('paragraph', 'Nested copy'), id: 'copy_nested' };
    const button = { ...createContentBlock('button'), id: 'button_nested' };
    const withCopy = insertBlockInsideTourStep(blocks, 'step_1', paragraph, 1);
    const withButton = withCopy ? insertBlockInsideTourStep(withCopy, 'step_1', button, 2) : null;
    const moved = withButton
      ? moveStepChildBlock(withButton, 'step_1', 'button_nested', 'up')
      : null;
    const children = moved?.[0]?.children[0]?.children ?? [];

    expect(children.map((block) => block.id)).toEqual(['copy_1', 'button_nested', 'copy_nested']);
    expect(children[0]).toMatchObject({ id: 'copy_1', content: 'Hello' });
    expect(blocks[0]?.children[0]?.children.map((block) => block.id)).toEqual(['copy_1']);
  });

  it('attaches target chips to tour step tooltips', () => {
    const next = attachTargetToBlocks(blocks, 'step_1', 'target_1', 'New project');
    const tooltip = next[0]?.children[0];

    expect(next[0]?.status).toBe('ready');
    expect(tooltip?.props.targetId).toBe('target_1');
    expect(tooltip?.children[tooltip.children.length - 1]).toMatchObject({
      type: 'targetChip',
      content: 'New project',
      props: { targetId: 'target_1' },
    });
  });

  it('removes target chips and marks tour steps incomplete without deleting content', () => {
    const withTarget = attachTargetToBlocks(blocks, 'step_1', 'target_1', 'New project');
    const next = removeTargetFromBlocks(withTarget, 'step_1', 'target_1');
    const step = next[0];
    const tooltip = step?.children[0];

    expect(step).toMatchObject({ id: 'step_1', status: 'incomplete' });
    expect(tooltip).toMatchObject({ id: 'tooltip_1', status: 'incomplete', props: {} });
    expect(tooltip?.children).toEqual([
      { id: 'copy_1', type: 'paragraph', content: 'Hello', props: {}, children: [] },
    ]);
    expect(blocksReferenceTarget(withTarget, 'target_1')).toBe(true);
    expect(blocksReferenceTarget(next, 'target_1')).toBe(false);
    expect(blocks[0]?.children[0]?.props).toEqual({});
  });

  it('moves and reorders top-level blocks without mutating input', () => {
    expect(moveTopLevelBlock(blocks, 'copy_2', 'up')?.map((block) => block.id)).toEqual([
      'copy_2',
      'step_1',
    ]);
    expect(reorderTopLevelBlock(blocks, 'copy_2', 'step_1')?.map((block) => block.id)).toEqual([
      'copy_2',
      'step_1',
    ]);
    expect(blocks.map((block) => block.id)).toEqual(['step_1', 'copy_2']);
  });
});
