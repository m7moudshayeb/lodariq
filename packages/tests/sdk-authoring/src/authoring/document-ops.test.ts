import { describe, expect, it } from 'vitest';
import type { TalmehBlock } from '@talmeh/schema';
import {
  attachTargetToBlocks,
  hasBlock,
  moveTopLevelBlock,
  reorderTopLevelBlock,
  transformBlocks,
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
  it('finds nested blocks and transforms block types', () => {
    expect(hasBlock(blocks, 'copy_1')).toBe(true);

    const next = transformBlocks(blocks, 'copy_2', 'button');

    expect(next[1]).toMatchObject({
      id: 'copy_2',
      type: 'button',
      content: 'Second',
      props: { variant: 'primary', action: { type: 'next' } },
    });
    expect(blocks[1]?.type).toBe('paragraph');
  });

  it('attaches target chips to tour step tooltips', () => {
    const next = attachTargetToBlocks(blocks, 'step_1', 'target_1', 'New project');
    const tooltip = next[0]?.children[0];

    expect(next[0]?.status).toBe('ready');
    expect(tooltip?.props['targetId']).toBe('target_1');
    expect(tooltip?.children.at(-1)).toMatchObject({
      type: 'targetChip',
      content: 'New project',
      props: { targetId: 'target_1' },
    });
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
