import type { TalmehBlock } from '@talmeh/schema';
import { createBlockId } from '../editor/ids';

export type EditableBlockType = 'paragraph' | 'heading' | 'button';
export type BlockDirection = 'up' | 'down';

export function hasBlock(blocks: TalmehBlock[], blockId: string): boolean {
  return blocks.some((block) => block.id === blockId || hasBlock(block.children, blockId));
}

export function transformBlocks(
  blocks: TalmehBlock[],
  blockId: string,
  type: EditableBlockType,
): TalmehBlock[] {
  return blocks.map((block) => transformBlock(block, blockId, type));
}

export function attachTargetToBlocks(
  blocks: TalmehBlock[],
  blockId: string,
  targetId: string,
  label: string,
): TalmehBlock[] {
  return blocks.map((block) => attachTarget(block, blockId, targetId, label));
}

export function moveTopLevelBlock(
  blocks: TalmehBlock[],
  blockId: string,
  direction: BlockDirection,
): TalmehBlock[] | null {
  const index = blocks.findIndex((block) => block.id === blockId);
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return null;
  const next = [...blocks];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next;
}

export function reorderTopLevelBlock(
  blocks: TalmehBlock[],
  blockId: string,
  beforeBlockId: string,
): TalmehBlock[] | null {
  if (blockId === beforeBlockId) return null;
  const current = blocks.find((block) => block.id === blockId);
  if (!current) return null;
  const withoutCurrent = blocks.filter((block) => block.id !== blockId);
  const beforeIndex = withoutCurrent.findIndex((block) => block.id === beforeBlockId);
  if (beforeIndex < 0) return null;
  return [...withoutCurrent.slice(0, beforeIndex), current, ...withoutCurrent.slice(beforeIndex)];
}

function transformBlock(block: TalmehBlock, blockId: string, type: EditableBlockType): TalmehBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: transformBlocks(block.children, blockId, type),
    };
  }
  return {
    ...block,
    type,
    props:
      type === 'heading'
        ? { level: 2 }
        : type === 'button'
          ? { variant: 'primary', action: { type: 'next' } }
          : {},
    children: [],
    content:
      block.content ??
      block.children
        .map((child) => child.content)
        .filter(Boolean)
        .join(' ') ??
      type,
  };
}

function attachTarget(
  block: TalmehBlock,
  blockId: string,
  targetId: string,
  label: string,
): TalmehBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: attachTargetToBlocks(block.children, blockId, targetId, label),
    };
  }

  const targetChip: TalmehBlock = {
    id: createBlockId(),
    type: 'targetChip',
    content: label,
    props: { targetId },
    status: 'ready',
    children: [],
  };

  if (block.type === 'tourStep') {
    const children = block.children.map((child) =>
      child.type === 'tooltip'
        ? {
            ...child,
            props: { ...child.props, targetId },
            status: 'ready' as const,
            children: [...child.children.filter((item) => item.type !== 'targetChip'), targetChip],
          }
        : child,
    );
    return { ...block, status: 'ready', children };
  }

  return {
    ...block,
    props: { ...block.props, targetId },
    status: 'ready',
    children: [...block.children.filter((child) => child.type !== 'targetChip'), targetChip],
  };
}
