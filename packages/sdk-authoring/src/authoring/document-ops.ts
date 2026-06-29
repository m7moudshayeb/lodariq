import { sanitizeBlockProps, type BlockActionProps, type TalmehBlock } from '@talmeh/schema';
import { createBlockId } from '../editor/ids';

export type EditableBlockType = 'paragraph' | 'heading' | 'button' | 'media';
export type BlockDirection = 'up' | 'down';
export type BlockInsertPosition = 'before' | 'after';

export function createContentBlock(type: EditableBlockType, contentOverride?: string): TalmehBlock {
  const content =
    contentOverride ??
    (type === 'heading'
      ? 'Untitled heading'
      : type === 'button'
        ? 'Continue'
        : type === 'media'
          ? 'Media placeholder'
          : 'Write supporting copy');
  return {
    id: createBlockId(),
    type,
    content,
    props: type === 'heading' ? { level: 2 } : type === 'button' ? { variant: 'primary' } : {},
    status: type === 'button' || type === 'media' ? 'incomplete' : 'ready',
    children: [],
  };
}

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

export function insertTopLevelBlock(
  blocks: TalmehBlock[],
  anchorBlockId: string,
  block: TalmehBlock,
  position: BlockInsertPosition,
): TalmehBlock[] | null {
  const anchorIndex = blocks.findIndex((item) => item.id === anchorBlockId);
  if (anchorIndex < 0) return null;
  const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1;
  return [...blocks.slice(0, insertIndex), block, ...blocks.slice(insertIndex)];
}

export function insertBlockInsideTourStep(
  blocks: TalmehBlock[],
  stepBlockId: string,
  block: TalmehBlock,
  index: number,
): TalmehBlock[] | null {
  let inserted = false;
  const next = blocks.map((item) => {
    const updated = insertInsideStep(item, stepBlockId, block, index);
    if (updated !== item) inserted = true;
    return normalizeBlockStatus(updated);
  });
  return inserted ? next : null;
}

export function moveStepChildBlock(
  blocks: TalmehBlock[],
  stepBlockId: string,
  childBlockId: string,
  direction: BlockDirection,
): TalmehBlock[] | null {
  let moved = false;
  const next = blocks.map((item) => {
    const updated = moveInsideStep(item, stepBlockId, childBlockId, direction);
    if (updated !== item) moved = true;
    return normalizeBlockStatus(updated);
  });
  return moved ? next : null;
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
    status: type === 'button' || type === 'media' ? 'incomplete' : 'ready',
    content:
      block.content ??
      block.children
        .map((child) => child.content)
        .filter(Boolean)
        .join(' ') ??
      (type === 'media' ? 'Media placeholder' : type),
  };
}

function insertInsideStep(
  block: TalmehBlock,
  stepBlockId: string,
  blockToInsert: TalmehBlock,
  index: number,
): TalmehBlock {
  if (block.id !== stepBlockId) {
    let changed = false;
    const children = block.children.map((child) => {
      const updated = insertInsideStep(child, stepBlockId, blockToInsert, index);
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...block, children } : block;
  }
  if (block.type !== 'tourStep') return block;
  const children = stepTooltipChildren(block, (currentChildren) =>
    insertBeforeUtilityChildren(currentChildren, blockToInsert, index),
  );
  if (children === block.children) return block;
  return {
    ...block,
    children,
  };
}

function moveInsideStep(
  block: TalmehBlock,
  stepBlockId: string,
  childBlockId: string,
  direction: BlockDirection,
): TalmehBlock {
  if (block.id !== stepBlockId) {
    let changed = false;
    const children = block.children.map((child) => {
      const updated = moveInsideStep(child, stepBlockId, childBlockId, direction);
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...block, children } : block;
  }
  if (block.type !== 'tourStep') return block;
  const children = stepTooltipChildren(block, (currentChildren) =>
    moveEditableTooltipChild(currentChildren, childBlockId, direction),
  );
  if (children === block.children) return block;
  return {
    ...block,
    children,
  };
}

function stepTooltipChildren(
  step: TalmehBlock,
  update: (children: TalmehBlock[]) => TalmehBlock[],
): TalmehBlock[] {
  const existingTooltip = step.children.find((child) => child.type === 'tooltip');
  if (!existingTooltip) {
    const children = update([]);
    if (children.length === 0) return step.children;
    return [
      {
        id: createBlockId(),
        type: 'tooltip',
        props: { placement: 'bottom' },
        status: 'incomplete',
        children,
      },
      ...step.children,
    ];
  }
  const updatedChildren = update(existingTooltip.children);
  if (updatedChildren === existingTooltip.children) return step.children;
  return step.children.map((child) =>
    child.id === existingTooltip.id ? { ...child, children: updatedChildren } : child,
  );
}

function insertBeforeUtilityChildren(
  children: TalmehBlock[],
  blockToInsert: TalmehBlock,
  index: number,
): TalmehBlock[] {
  const utilityStart = firstUtilityChildIndex(children);
  const editableChildren = children.slice(0, utilityStart);
  const utilityChildren = children.slice(utilityStart);
  const insertIndex = Math.min(Math.max(0, index), editableChildren.length);
  return [
    ...editableChildren.slice(0, insertIndex),
    blockToInsert,
    ...editableChildren.slice(insertIndex),
    ...utilityChildren,
  ];
}

function moveEditableTooltipChild(
  children: TalmehBlock[],
  childBlockId: string,
  direction: BlockDirection,
): TalmehBlock[] {
  const utilityStart = firstUtilityChildIndex(children);
  const editableChildren = children.slice(0, utilityStart);
  const utilityChildren = children.slice(utilityStart);
  const index = editableChildren.findIndex((child) => child.id === childBlockId);
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= editableChildren.length) return children;
  const next = [...editableChildren];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return [...next, ...utilityChildren];
}

function firstUtilityChildIndex(children: TalmehBlock[]): number {
  const index = children.findIndex(
    (child) => child.type === 'targetChip' || child.type === 'validationBadge',
  );
  return index < 0 ? children.length : index;
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
  if (block.type === 'media') {
    return { ...block, children, status: 'incomplete' };
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
  if (block.type === 'media') return true;
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
