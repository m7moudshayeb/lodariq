import {
  isSafeNavigationUrl,
  sanitizeBlockProps,
  sanitizeTextStyleProps,
  type BlockActionProps,
  type LodariqBlock,
  type PresentationAnchor,
  type TextStyleProps,
} from '@lodariq/schema';
import { createBlockId } from '../editor/ids';

export type EditableBlockType =
  'paragraph' | 'heading' | 'list' | 'divider' | 'button' | 'link' | 'media';
export type BlockDirection = 'up' | 'down';
export type BlockInsertPosition = 'before' | 'after';
export type TooltipPlacement = NonNullable<LodariqBlock['props']['placement']>;
export type ButtonVariant = NonNullable<LodariqBlock['props']['variant']>;

const DEFAULT_CONTENT_BY_TYPE = {
  heading: 'Untitled heading',
  paragraph: 'Write supporting copy',
  list: 'First item\nSecond item',
  divider: '',
  button: 'Continue',
  link: 'Learn more',
  media: 'Media placeholder',
} as const satisfies Record<EditableBlockType, string>;

const DEFAULT_PROPS_BY_TYPE = {
  heading: { level: 2 },
  paragraph: {},
  list: {},
  divider: {},
  button: { variant: 'primary' },
  link: { action: { type: 'openPage' } },
  media: {},
} as const satisfies Record<EditableBlockType, LodariqBlock['props']>;

const INCOMPLETE_ON_CREATE_TYPES = new Set<EditableBlockType>(['button', 'link', 'media']);
const ACTION_CONFIG_BLOCK_TYPES = new Set<string>(['button', 'link']);

export function createContentBlock(
  type: EditableBlockType,
  contentOverride?: string,
): LodariqBlock {
  const content = contentOverride ?? defaultContentFor(type);
  return {
    id: createBlockId(),
    type,
    ...(content ? { content } : {}),
    props: defaultPropsFor(type),
    status: initialStatusForEditableType(type),
    children: [],
  };
}

export function createTourStep(index: number, title = 'Untitled step'): LodariqBlock {
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
            content: title,
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

export function normalizeTourRootBlocks(blocks: LodariqBlock[]): LodariqBlock[] {
  return renumberTourSteps(
    blocks.map((block, index) =>
      normalizeBlockStatus(block.type === 'tourStep' ? block : createTourStepWrapper(block, index)),
    ),
  );
}

export function hasBlock(blocks: LodariqBlock[], blockId: string): boolean {
  return blocks.some((block) => block.id === blockId || hasBlock(block.children, blockId));
}

export function updateBlockContent(
  blocks: LodariqBlock[],
  blockId: string,
  content: string,
): LodariqBlock[] {
  return blocks.map((block) =>
    block.id === blockId
      ? { ...block, content }
      : { ...block, children: updateBlockContent(block.children, blockId, content) },
  );
}

export function setBlockAction(
  blocks: LodariqBlock[],
  blockId: string,
  action: BlockActionProps | null,
): LodariqBlock[] {
  return blocks.map((block) => normalizeBlockStatus(setAction(block, blockId, action)));
}

export function setBlockActionUrl(
  blocks: LodariqBlock[],
  blockId: string,
  url: string,
): LodariqBlock[] {
  return blocks.map((block) => normalizeBlockStatus(setActionUrl(block, blockId, url)));
}

export function setBlockVariant(
  blocks: LodariqBlock[],
  blockId: string,
  variant: ButtonVariant,
): LodariqBlock[] {
  return blocks.map((block) =>
    block.id === blockId
      ? { ...block, props: sanitizeBlockProps({ ...block.props, variant }) }
      : { ...block, children: setBlockVariant(block.children, blockId, variant) },
  );
}

export function setBlockPlacement(
  blocks: LodariqBlock[],
  blockId: string,
  placement: TooltipPlacement,
): LodariqBlock[] {
  return blocks.map((block) =>
    block.id === blockId
      ? {
          ...block,
          props: sanitizeBlockProps({ ...block.props, placement }),
        }
      : {
          ...block,
          children: setBlockPlacement(block.children, blockId, placement),
        },
  );
}

export function setBlockTextStyle(
  blocks: LodariqBlock[],
  blockId: string,
  textStyle?: TextStyleProps,
): LodariqBlock[] {
  return blocks.map((block) => {
    if (block.id !== blockId) {
      return {
        ...block,
        children: setBlockTextStyle(block.children, blockId, textStyle),
      };
    }
    const props = { ...block.props };
    const safeStyle = sanitizeTextStyleProps(textStyle);
    if (safeStyle) props.textStyle = safeStyle;
    else delete props.textStyle;
    return { ...block, props: sanitizeBlockProps(props) };
  });
}

export function setBlockPresentationAnchor(
  blocks: LodariqBlock[],
  blockId: string,
  presentationAnchor?: PresentationAnchor,
): LodariqBlock[] {
  return blocks.map((block) => {
    if (block.id !== blockId) {
      return {
        ...block,
        children: setBlockPresentationAnchor(block.children, blockId, presentationAnchor),
      };
    }
    const props = { ...block.props };
    if (presentationAnchor && presentationAnchor.kind !== 'element-bounds') {
      props.presentationAnchor = structuredClone(presentationAnchor);
    } else {
      delete props.presentationAnchor;
    }
    return { ...block, props: sanitizeBlockProps(props) };
  });
}

export function renumberTourSteps(blocks: LodariqBlock[]): LodariqBlock[] {
  let index = 0;
  return blocks.map((block) =>
    block.type === 'tourStep'
      ? { ...block, props: sanitizeBlockProps({ ...block.props, index: index++ }) }
      : block,
  );
}

export function transformBlocks(
  blocks: LodariqBlock[],
  blockId: string,
  type: EditableBlockType,
  contentOverride?: string,
): LodariqBlock[] {
  return blocks.map((block) =>
    normalizeBlockStatus(transformBlock(block, blockId, type, contentOverride)),
  );
}

export function attachTargetToBlocks(
  blocks: LodariqBlock[],
  blockId: string,
  targetId: string,
  label: string,
  options: { resetPresentationAnchor?: boolean } = {},
): LodariqBlock[] {
  return blocks.map((block) =>
    normalizeBlockStatus(attachTarget(block, blockId, targetId, label, options)),
  );
}

export function removeTargetFromBlocks(
  blocks: LodariqBlock[],
  blockId: string,
  targetId: string,
): LodariqBlock[] {
  return blocks.map((block) => normalizeBlockStatus(removeTarget(block, blockId, targetId)));
}

export function blocksReferenceTarget(blocks: LodariqBlock[], targetId: string): boolean {
  return blocks.some(
    (block) => block.props.targetId === targetId || blocksReferenceTarget(block.children, targetId),
  );
}

export function moveTopLevelBlock(
  blocks: LodariqBlock[],
  blockId: string,
  direction: BlockDirection,
): LodariqBlock[] | null {
  const index = blocks.findIndex((block) => block.id === blockId);
  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return null;
  const next = [...blocks];
  [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
  return next;
}

export function duplicateTopLevelBlock(
  blocks: LodariqBlock[],
  blockId: string,
): LodariqBlock[] | null {
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return null;
  const duplicate = duplicateBlock(blocks[index]!);
  return [...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)];
}

export function removeTopLevelBlock(
  blocks: LodariqBlock[],
  blockId: string,
): LodariqBlock[] | null {
  if (!blocks.some((block) => block.id === blockId)) return null;
  return blocks.filter((block) => block.id !== blockId);
}

export function reorderTopLevelBlock(
  blocks: LodariqBlock[],
  blockId: string,
  targetBlockId: string,
  position: BlockInsertPosition = 'before',
): LodariqBlock[] | null {
  if (blockId === targetBlockId) return null;
  const current = blocks.find((block) => block.id === blockId);
  if (!current) return null;
  const withoutCurrent = blocks.filter((block) => block.id !== blockId);
  const targetIndex = withoutCurrent.findIndex((block) => block.id === targetBlockId);
  if (targetIndex < 0) return null;
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  return [...withoutCurrent.slice(0, insertIndex), current, ...withoutCurrent.slice(insertIndex)];
}

export function insertTopLevelBlock(
  blocks: LodariqBlock[],
  anchorBlockId: string,
  block: LodariqBlock,
  position: BlockInsertPosition,
): LodariqBlock[] | null {
  const anchorIndex = blocks.findIndex((item) => item.id === anchorBlockId);
  if (anchorIndex < 0) return null;
  const insertIndex = position === 'before' ? anchorIndex : anchorIndex + 1;
  return [...blocks.slice(0, insertIndex), block, ...blocks.slice(insertIndex)];
}

export function insertBlockInsideTourStep(
  blocks: LodariqBlock[],
  stepBlockId: string,
  block: LodariqBlock,
  index: number,
): LodariqBlock[] | null {
  let inserted = false;
  const next = blocks.map((item) => {
    const updated = insertInsideStep(item, stepBlockId, block, index);
    if (updated !== item) inserted = true;
    return normalizeBlockStatus(updated);
  });
  return inserted ? next : null;
}

export function moveStepChildBlock(
  blocks: LodariqBlock[],
  stepBlockId: string,
  childBlockId: string,
  direction: BlockDirection,
): LodariqBlock[] | null {
  let moved = false;
  const next = blocks.map((item) => {
    const updated = moveInsideStep(item, stepBlockId, childBlockId, direction);
    if (updated !== item) moved = true;
    return normalizeBlockStatus(updated);
  });
  return moved ? next : null;
}

export function reorderStepChildBlock(
  blocks: LodariqBlock[],
  stepBlockId: string,
  childBlockId: string,
  targetChildBlockId: string,
  position: BlockInsertPosition = 'before',
): LodariqBlock[] | null {
  let moved = false;
  const next = blocks.map((item) => {
    const updated = reorderInsideStep(
      item,
      stepBlockId,
      childBlockId,
      targetChildBlockId,
      position,
    );
    if (updated !== item) moved = true;
    return normalizeBlockStatus(updated);
  });
  return moved ? next : null;
}

export function duplicateStepChildBlock(
  blocks: LodariqBlock[],
  stepBlockId: string,
  childBlockId: string,
): LodariqBlock[] | null {
  let duplicated = false;
  const next = blocks.map((item) => {
    const updated = duplicateInsideStep(item, stepBlockId, childBlockId);
    if (updated !== item) duplicated = true;
    return normalizeBlockStatus(updated);
  });
  return duplicated ? next : null;
}

export function removeStepChildBlock(
  blocks: LodariqBlock[],
  stepBlockId: string,
  childBlockId: string,
): LodariqBlock[] | null {
  let removed = false;
  const next = blocks.map((item) => {
    const updated = removeInsideStep(item, stepBlockId, childBlockId);
    if (updated !== item) removed = true;
    return normalizeBlockStatus(updated);
  });
  return removed ? next : null;
}

function transformBlock(
  block: LodariqBlock,
  blockId: string,
  type: EditableBlockType,
  contentOverride?: string,
): LodariqBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: transformBlocks(block.children, blockId, type, contentOverride),
    };
  }
  return {
    ...block,
    type,
    props: sanitizeBlockProps({
      ...defaultPropsFor(type),
      ...(block.props.textStyle ? { textStyle: block.props.textStyle } : {}),
    }),
    children: [],
    status: initialStatusForEditableType(type),
    content: transformedBlockContent(block, type, contentOverride),
  };
}

function defaultContentFor(type: EditableBlockType): string {
  return DEFAULT_CONTENT_BY_TYPE[type];
}

function defaultPropsFor(type: EditableBlockType): LodariqBlock['props'] {
  return DEFAULT_PROPS_BY_TYPE[type];
}

function initialStatusForEditableType(type: EditableBlockType): LodariqBlock['status'] {
  return INCOMPLETE_ON_CREATE_TYPES.has(type) ? 'incomplete' : 'ready';
}

function transformedBlockContent(
  block: LodariqBlock,
  type: EditableBlockType,
  contentOverride?: string,
): string {
  const childContent = block.children
    .map((child) => child.content)
    .filter(Boolean)
    .join(' ');
  const preservedContent = contentOverride ?? block.content ?? childContent;
  return preservedContent || defaultContentFor(type);
}

function insertInsideStep(
  block: LodariqBlock,
  stepBlockId: string,
  blockToInsert: LodariqBlock,
  index: number,
): LodariqBlock {
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

function createTourStepWrapper(block: LodariqBlock, index: number): LodariqBlock {
  const tooltip =
    block.type === 'tooltip'
      ? {
          ...block,
          props: sanitizeBlockProps({
            ...block.props,
            placement: block.props.placement ?? 'bottom',
          }),
          status: 'incomplete' as const,
        }
      : {
          id: createBlockId(),
          type: 'tooltip' as const,
          props: { placement: 'bottom' as const },
          status: 'incomplete' as const,
          children: [block],
        };

  return {
    id: createBlockId(),
    type: 'tourStep',
    props: { index },
    status: 'incomplete',
    children: [tooltip],
  };
}

function moveInsideStep(
  block: LodariqBlock,
  stepBlockId: string,
  childBlockId: string,
  direction: BlockDirection,
): LodariqBlock {
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

function reorderInsideStep(
  block: LodariqBlock,
  stepBlockId: string,
  childBlockId: string,
  targetChildBlockId: string,
  position: BlockInsertPosition,
): LodariqBlock {
  if (block.id !== stepBlockId) {
    let changed = false;
    const children = block.children.map((child) => {
      const updated = reorderInsideStep(
        child,
        stepBlockId,
        childBlockId,
        targetChildBlockId,
        position,
      );
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...block, children } : block;
  }
  if (block.type !== 'tourStep') return block;
  const children = stepTooltipChildren(block, (currentChildren) =>
    reorderEditableTooltipChild(currentChildren, childBlockId, targetChildBlockId, position),
  );
  if (children === block.children) return block;
  return {
    ...block,
    children,
  };
}

function duplicateInsideStep(
  block: LodariqBlock,
  stepBlockId: string,
  childBlockId: string,
): LodariqBlock {
  if (block.id !== stepBlockId) {
    let changed = false;
    const children = block.children.map((child) => {
      const updated = duplicateInsideStep(child, stepBlockId, childBlockId);
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...block, children } : block;
  }
  if (block.type !== 'tourStep') return block;
  const children = stepTooltipChildren(block, (currentChildren) =>
    duplicateEditableTooltipChild(currentChildren, childBlockId),
  );
  if (children === block.children) return block;
  return {
    ...block,
    children,
  };
}

function removeInsideStep(
  block: LodariqBlock,
  stepBlockId: string,
  childBlockId: string,
): LodariqBlock {
  if (block.id !== stepBlockId) {
    let changed = false;
    const children = block.children.map((child) => {
      const updated = removeInsideStep(child, stepBlockId, childBlockId);
      if (updated !== child) changed = true;
      return updated;
    });
    return changed ? { ...block, children } : block;
  }
  if (block.type !== 'tourStep') return block;
  const children = stepTooltipChildren(block, (currentChildren) =>
    removeEditableTooltipChild(currentChildren, childBlockId),
  );
  if (children === block.children) return block;
  return {
    ...block,
    children,
  };
}

function stepTooltipChildren(
  step: LodariqBlock,
  update: (children: LodariqBlock[]) => LodariqBlock[],
): LodariqBlock[] {
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
  children: LodariqBlock[],
  blockToInsert: LodariqBlock,
  index: number,
): LodariqBlock[] {
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
  children: LodariqBlock[],
  childBlockId: string,
  direction: BlockDirection,
): LodariqBlock[] {
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

function reorderEditableTooltipChild(
  children: LodariqBlock[],
  childBlockId: string,
  targetChildBlockId: string,
  position: BlockInsertPosition,
): LodariqBlock[] {
  if (childBlockId === targetChildBlockId) return children;
  const utilityStart = firstUtilityChildIndex(children);
  const editableChildren = children.slice(0, utilityStart);
  const utilityChildren = children.slice(utilityStart);
  const current = editableChildren.find((child) => child.id === childBlockId);
  if (!current) return children;
  const withoutCurrent = editableChildren.filter((child) => child.id !== childBlockId);
  const targetIndex = withoutCurrent.findIndex((child) => child.id === targetChildBlockId);
  if (targetIndex < 0) return children;
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  return [
    ...withoutCurrent.slice(0, insertIndex),
    current,
    ...withoutCurrent.slice(insertIndex),
    ...utilityChildren,
  ];
}

function duplicateEditableTooltipChild(
  children: LodariqBlock[],
  childBlockId: string,
): LodariqBlock[] {
  const utilityStart = firstUtilityChildIndex(children);
  const editableChildren = children.slice(0, utilityStart);
  const utilityChildren = children.slice(utilityStart);
  const index = editableChildren.findIndex((child) => child.id === childBlockId);
  if (index < 0) return children;
  const duplicate = duplicateBlock(editableChildren[index]!);
  return [
    ...editableChildren.slice(0, index + 1),
    duplicate,
    ...editableChildren.slice(index + 1),
    ...utilityChildren,
  ];
}

function removeEditableTooltipChild(
  children: LodariqBlock[],
  childBlockId: string,
): LodariqBlock[] {
  const utilityStart = firstUtilityChildIndex(children);
  const editableChildren = children.slice(0, utilityStart);
  const utilityChildren = children.slice(utilityStart);
  const index = editableChildren.findIndex((child) => child.id === childBlockId);
  if (index < 0) return children;
  return [
    ...editableChildren.slice(0, index),
    ...editableChildren.slice(index + 1),
    ...utilityChildren,
  ];
}

function duplicateBlock(block: LodariqBlock): LodariqBlock {
  const clonedChildren = block.children
    .filter((child) => child.type !== 'targetChip' && child.type !== 'validationBadge')
    .map(duplicateBlock);
  return normalizeBlockStatus({
    ...block,
    id: createBlockId(),
    props: sanitizeBlockProps(omitTargetBinding(block.props as Record<string, unknown>)),
    children: clonedChildren,
  });
}

function firstUtilityChildIndex(children: LodariqBlock[]): number {
  const index = children.findIndex(
    (child) => child.type === 'targetChip' || child.type === 'validationBadge',
  );
  return index < 0 ? children.length : index;
}

function setAction(
  block: LodariqBlock,
  blockId: string,
  action: BlockActionProps | null,
): LodariqBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: block.children.map((child) => setAction(child, blockId, action)),
    };
  }
  const props = sanitizeBlockProps(
    action ? { ...block.props, action } : omitAction(block.props as Record<string, unknown>),
  );
  const status = actionConfigStatus(block, props);
  return {
    ...block,
    props,
    status,
  };
}

function setActionUrl(block: LodariqBlock, blockId: string, url: string): LodariqBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: block.children.map((child) => setActionUrl(child, blockId, url)),
    };
  }
  const action: BlockActionProps = { type: 'openPage', url };
  const props = sanitizeBlockProps({ ...block.props, action });
  const status = actionConfigStatus(block, props);
  return {
    ...block,
    props,
    status,
  };
}

function attachTarget(
  block: LodariqBlock,
  blockId: string,
  targetId: string,
  label: string,
  options: { resetPresentationAnchor?: boolean },
): LodariqBlock {
  if (block.id !== blockId) {
    return {
      ...block,
      children: attachTargetToBlocks(block.children, blockId, targetId, label, options),
    };
  }

  const targetChip: LodariqBlock = {
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
            props: sanitizeBlockProps({
              ...presentationAnchorProps(child.props, options.resetPresentationAnchor),
              targetId,
            }),
            status: 'ready' as const,
            children: [...child.children.filter((item) => item.type !== 'targetChip'), targetChip],
          }
        : child,
    );
    return { ...block, status: 'ready', children };
  }

  return {
    ...block,
    props: sanitizeBlockProps({
      ...presentationAnchorProps(block.props, options.resetPresentationAnchor),
      targetId,
    }),
    status: 'ready',
    children: [...block.children.filter((child) => child.type !== 'targetChip'), targetChip],
  };
}

function removeTarget(block: LodariqBlock, blockId: string, targetId: string): LodariqBlock {
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
        ? sanitizeBlockProps(omitTargetBinding(block.props as Record<string, unknown>))
        : block.props,
    children: block.children.filter((child) => child.props.targetId !== targetId),
  };
}

function removeTargetFromTooltip(block: LodariqBlock, targetId: string): LodariqBlock {
  return {
    ...block,
    props:
      block.props.targetId === targetId
        ? sanitizeBlockProps(omitTargetBinding(block.props as Record<string, unknown>))
        : block.props,
    children: block.children.filter((child) => child.props.targetId !== targetId),
  };
}

function normalizeBlockStatus(block: LodariqBlock): LodariqBlock {
  if (block.status === 'invalid') return block;
  const children = block.children.map(normalizeBlockStatus);
  if (requiresActionConfig(block)) {
    return { ...block, children, status: actionConfigStatus(block, block.props) };
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

function hasIncompleteRequiredConfig(block: LodariqBlock): boolean {
  if (block.status === 'invalid') return true;
  if (requiresActionConfig(block)) return !isCompleteAction(block.props.action);
  if (block.type === 'media') return true;
  if (block.type === 'tooltip')
    return !block.props.targetId || block.children.some(hasIncompleteRequiredConfig);
  return block.children.some(hasIncompleteRequiredConfig);
}

function isCompleteAction(action: BlockActionProps | undefined): boolean {
  if (!action) return false;
  if (action.type === 'openPage') return Boolean(action.url?.trim());
  return true;
}

function requiresActionConfig(block: LodariqBlock): boolean {
  return ACTION_CONFIG_BLOCK_TYPES.has(block.type);
}

function actionConfigStatus(
  block: LodariqBlock,
  props: LodariqBlock['props'],
): LodariqBlock['status'] {
  if (!requiresActionConfig(block)) return block.status;
  if (
    props.action?.type === 'openPage' &&
    props.action.url &&
    !isSafeNavigationUrl(props.action.url)
  ) {
    return 'invalid';
  }
  return isCompleteAction(props.action) ? 'ready' : 'incomplete';
}

function omitAction(props: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...props };
  delete rest['action'];
  return rest;
}

function omitTargetBinding(props: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...props };
  delete rest['targetId'];
  delete rest['presentationAnchor'];
  return rest;
}

function presentationAnchorProps(
  props: LodariqBlock['props'],
  resetPresentationAnchor: boolean | undefined,
): Record<string, unknown> {
  if (!resetPresentationAnchor) return props;
  const rest: Record<string, unknown> = { ...props };
  delete rest['presentationAnchor'];
  return rest;
}
