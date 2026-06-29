import { sanitizeBlockProps, type BlockActionProps, type TalmehBlock } from '@talmeh/schema';
import { createBlockId } from '../editor/ids';

export type EditableBlockType = 'paragraph' | 'heading' | 'button';
export type BlockDirection = 'up' | 'down';

export function createTourStep(index: number): TalmehBlock {
  return {
    id: createBlockId(),
    type: 'tourStep',
    props: { index },
    status: 'incomplete',
    children: [
      {
        id: createBlockId(),
        type: 'tooltip',
        props: { placement: 'bottom' },
        status: 'incomplete',
        children: [
          {
            id: createBlockId(),
            type: 'heading',
            content: 'Untitled step',
            props: { level: 2 },
            status: 'ready',
            children: [],
          },
          {
            id: createBlockId(),
            type: 'paragraph',
            content: 'Write supporting copy',
            props: {},
            status: 'ready',
            children: [],
          },
          {
            id: createBlockId(),
            type: 'button',
            content: 'Continue',
            props: { variant: 'primary', action: { type: 'next' } },
            status: 'ready',
            children: [],
          },
        ],
      },
    ],
  };
}

export function hasBlock(blocks: TalmehBlock[], blockId: string): boolean {
  return blocks.some((block) => block.id === blockId || hasBlock(block.children, blockId));
}

export function updateBlockContent(
  blocks: TalmehBlock[],
  blockId: string,
  content: string,
): TalmehBlock[] {
  return blocks.map((block) =>
    block.id === blockId
      ? { ...block, content }
      : { ...block, children: updateBlockContent(block.children, blockId, content) },
  );
}

export function setBlockAction(
  blocks: TalmehBlock[],
  blockId: string,
  action: BlockActionProps | null,
): TalmehBlock[] {
  return blocks.map((block) => normalizeBlockStatus(setAction(block, blockId, action)));
}

export function renumberTourSteps(blocks: TalmehBlock[]): TalmehBlock[] {
  let index = 0;
  return blocks.map((block) =>
    block.type === 'tourStep'
      ? { ...block, props: sanitizeBlockProps({ ...block.props, index: index++ }) }
      : block,
  );
}

export function transformBlocks(
  blocks: TalmehBlock[],
  blockId: string,
  type: EditableBlockType,
): TalmehBlock[] {
  return blocks.map((block) => normalizeBlockStatus(transformBlock(block, blockId, type)));
}

export function attachTargetToBlocks(
  blocks: TalmehBlock[],
  blockId: string,
  targetId: string,
  label: string,
): TalmehBlock[] {
  return blocks.map((block) => normalizeBlockStatus(attachTarget(block, blockId, targetId, label)));
}

export function removeTargetFromBlocks(
  blocks: TalmehBlock[],
  blockId: string,
  targetId: string,
): TalmehBlock[] {
  return blocks.map((block) => normalizeBlockStatus(removeTarget(block, blockId, targetId)));
}

export function blocksReferenceTarget(blocks: TalmehBlock[], targetId: string): boolean {
  return blocks.some(
    (block) => block.props.targetId === targetId || blocksReferenceTarget(block.children, targetId),
  );
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
    props: type === 'heading' ? { level: 2 } : type === 'button' ? { variant: 'primary' } : {},
    children: [],
    status: type === 'button' ? 'incomplete' : 'ready',
    content:
      block.content ??
      block.children
        .map((child) => child.content)
        .filter(Boolean)
        .join(' ') ??
      type,
  };
}

function setAction(
  block: TalmehBlock,
  blockId: string,
  action: BlockActionProps | null,
): TalmehBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: block.children.map((child) => setAction(child, blockId, action)),
    };
  }
  const props = sanitizeBlockProps(
    action ? { ...block.props, action } : omitAction(block.props as Record<string, unknown>),
  );
  return {
    ...block,
    props,
    status: block.type === 'button' ? (props.action ? 'ready' : 'incomplete') : block.status,
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
            props: sanitizeBlockProps({ ...child.props, targetId }),
            status: 'ready' as const,
            children: [...child.children.filter((item) => item.type !== 'targetChip'), targetChip],
          }
        : child,
    );
    return { ...block, status: 'ready', children };
  }

  return {
    ...block,
    props: sanitizeBlockProps({ ...block.props, targetId }),
    status: 'ready',
    children: [...block.children.filter((child) => child.type !== 'targetChip'), targetChip],
  };
}

function removeTarget(block: TalmehBlock, blockId: string, targetId: string): TalmehBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: block.children.map((child) => removeTarget(child, blockId, targetId)),
    };
  }

  if (block.type === 'tourStep') {
    return {
      ...block,
      children: block.children.map((child) =>
        child.type === 'tooltip' ? removeTargetFromTooltip(child, targetId) : child,
      ),
    };
  }

  return {
    ...block,
    props:
      block.props.targetId === targetId
        ? sanitizeBlockProps(omitTargetId(block.props as Record<string, unknown>))
        : block.props,
    children: block.children.filter((child) => child.props.targetId !== targetId),
  };
}

function removeTargetFromTooltip(block: TalmehBlock, targetId: string): TalmehBlock {
  return {
    ...block,
    props:
      block.props.targetId === targetId
        ? sanitizeBlockProps(omitTargetId(block.props as Record<string, unknown>))
        : block.props,
    children: block.children.filter((child) => child.props.targetId !== targetId),
  };
}

function normalizeBlockStatus(block: TalmehBlock): TalmehBlock {
  if (block.status === 'invalid') return block;
  const children = block.children.map(normalizeBlockStatus);
  if (block.type === 'button') {
    return { ...block, children, status: block.props.action ? 'ready' : 'incomplete' };
  }
  if (block.type === 'tooltip') {
    return {
      ...block,
      children,
      status:
        block.props.targetId && !children.some(hasIncompleteRequiredConfig)
          ? 'ready'
          : 'incomplete',
    };
  }
  if (block.type === 'tourStep') {
    return {
      ...block,
      children,
      status: children.some(hasIncompleteRequiredConfig) ? 'incomplete' : 'ready',
    };
  }
  return { ...block, children };
}

function hasIncompleteRequiredConfig(block: TalmehBlock): boolean {
  if (block.status === 'invalid') return true;
  if (block.type === 'button') return !block.props.action;
  if (block.type === 'tooltip')
    return !block.props.targetId || block.children.some(hasIncompleteRequiredConfig);
  return block.children.some(hasIncompleteRequiredConfig);
}

function omitAction(props: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...props };
  delete rest['action'];
  return rest;
}

function omitTargetId(props: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...props };
  delete rest['targetId'];
  return rest;
}
