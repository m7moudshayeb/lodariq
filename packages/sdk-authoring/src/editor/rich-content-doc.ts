import {
  BLOCK_SPACING_PX_LIMITS,
  TOUR_MOTION_EASING_VALUES,
  TOUR_MOTION_RECIPE_VALUES,
  type InlineTextRun,
  type LodariqBlock,
  type LodariqBlockProps,
  type LodariqBlockType,
  type TourMotionPresentation,
} from '@lodariq/schema';
import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $createListItemNode, $createListNode, $isListNode } from '@lexical/list';
import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type NodeKey,
  type TextNode,
} from 'lexical';
import { authoringText } from '../i18n';
import { createBlockId } from './ids';
import {
  $createRichCalloutNode,
  $createRichButtonNode,
  $createRichDividerNode,
  $createRichFormFieldNode,
  $createRichIconNode,
  $createRichMediaNode,
  $createRichStatNode,
  $createRichTargetChipNode,
  $createRichValidationBadgeNode,
  $isRichCalloutNode,
  $isRichButtonNode,
  $isRichDividerNode,
  $isRichFormFieldNode,
  $isRichIconNode,
  $isRichMediaNode,
  $isRichStatNode,
  $isRichTargetChipNode,
  $isRichValidationBadgeNode,
} from './rich-content-nodes';

/**
 * Canonical block types that the freeform Rich Content editor owns.
 *
 * Defined in `rich-content-block-types` and re-exported here so callers that
 * already hold Lexical keep one import, while callers that only need the sets
 * can reach them without it.
 */
import { RICH_CONTENT_BLOCK_TYPES, TEXT_BLOCK_TYPES } from './rich-content-block-types';

export { RICH_CONTENT_BLOCK_TYPES, TEXT_BLOCK_TYPES };

const INLINE_MOTION_RECIPE_SET = new Set<string>(TOUR_MOTION_RECIPE_VALUES);
const INLINE_MOTION_EASING_SET = new Set<string>(TOUR_MOTION_EASING_VALUES);

export interface RichContentMetadata {
  blockIdByNodeKey: Map<NodeKey, string>;
  originalByBlockId: Map<string, LodariqBlock>;
}

export function importRichContent(
  blocks: readonly LodariqBlock[],
  metadata: RichContentMetadata,
): void {
  const root = $getRoot();
  root.clear();
  metadata.blockIdByNodeKey.clear();
  metadata.originalByBlockId.clear();
  for (const block of blocks) {
    const node = nodeFromBlock(block);
    if (!node) continue;
    const placed = node.isInline() ? wrapInlineNode(node) : node;
    root.append(placed);
    metadata.blockIdByNodeKey.set(node.getKey(), block.id);
    metadata.originalByBlockId.set(block.id, structuredClone(block));
  }
  if (root.getChildrenSize() === 0) root.append($createParagraphNode());
}

function wrapInlineNode(node: LexicalNode): LexicalNode {
  const paragraph = $createParagraphNode();
  paragraph.append(node);
  return paragraph;
}

export function nodeFromBlock(block: LodariqBlock): LexicalNode | null {
  if (block.type === 'button') {
    return $createRichButtonNode(block.id, block.content ?? authoringText('Continue'), block.props);
  }
  if (block.type === 'formField') {
    return $createRichFormFieldNode(
      block.id,
      block.content ?? authoringText('Label'),
      block.props,
    );
  }
  if (block.type === 'media' && block.props.media) {
    return $createRichMediaNode(block.id, block.props.media);
  }
  if (block.type === 'icon') {
    const icon = block.props.composition?.kind === 'icon' ? block.props.composition.icon : 'info';
    return $createRichIconNode(
      block.id,
      icon,
      block.props.accessibilityName ?? block.content ?? humanizeIconName(icon),
      block.props.textStyle?.color,
    );
  }
  if (block.type === 'divider') return $createRichDividerNode(block.id);
  if (block.type === 'validationBadge') {
    return $createRichValidationBadgeNode(
      block.id,
      block.status ?? 'ready',
      block.content ?? authoringText('Verified on this screen'),
    );
  }
  if (!TEXT_BLOCK_TYPES.has(block.type)) return null;
  if (block.type === 'list') {
    const list = $createListNode('bullet');
    for (const item of (block.content ?? '').split('\n').filter(Boolean)) {
      const listItem = $createListItemNode();
      appendRuns(listItem, [{ text: item }]);
      list.append(listItem);
    }
    if (list.getChildrenSize() === 0) list.append($createListItemNode());
    applyImportedSpacing(list, block);
    return list;
  }
  const element =
    block.type === 'heading'
      ? $createHeadingNode('h2')
      : block.type === 'callout'
        ? $createRichCalloutNode()
        : block.type === 'stat'
          ? $createRichStatNode()
          : block.type === 'targetChip'
            ? $createRichTargetChipNode()
            : $createParagraphNode();
  appendRuns(
    element,
    block.contentRuns?.length ? block.contentRuns : [{ text: block.content ?? '' }],
  );
  const align = block.props.textStyle?.align;
  if (align) element.setFormat(align);
  applyImportedSpacing(element, block);
  return element;
}

function applyImportedSpacing(node: ElementNode, block: LodariqBlock): void {
  const spacing = block.props.blockLayout?.spacingAfterPx;
  if (spacing === undefined) return;
  node.setStyle(`margin-bottom: ${clampSpacing(spacing)}px`);
}

function appendRuns(element: ElementNode, runs: readonly InlineTextRun[]): void {
  for (const run of runs) {
    const text = $createTextNode(run.text);
    for (const mark of run.marks ?? []) text.toggleFormat(mark);
    const styles = [
      run.fontSizePx ? `font-size: ${run.fontSizePx}px` : '',
      run.color ? `color: ${run.color}` : '',
      run.highlightColor ? `background-color: ${run.highlightColor}` : '',
      run.animation ? `--lq-inline-motion: ${run.animation.recipe}` : '',
      run.animation ? `--lq-inline-motion-duration: ${run.animation.durationMs}ms` : '',
      run.animation ? `--lq-inline-motion-easing: ${run.animation.easing}` : '',
      run.animation
        ? `--lq-inline-motion-timing: ${inlineAnimationCssEasing(run.animation.easing)}`
        : '',
    ]
      .filter(Boolean)
      .join('; ');
    if (styles) text.setStyle(styles);
    const url = run.link ? safeAuthorUrl(run.link) : null;
    if (url) {
      const link = $createLinkNode(url);
      link.append(text);
      element.append(link);
    } else {
      element.append(text);
    }
  }
}

export function exportRichContent(metadata: RichContentMetadata): LodariqBlock[] {
  return $getRoot()
    .getChildren()
    .flatMap((node) => exportTopLevel(node, metadata));
}

function exportTopLevel(node: LexicalNode, metadata: RichContentMetadata): LodariqBlock[] {
  if ($isElementNode(node) && node.getChildren().some(isFlowDecorator)) {
    return flattenParagraph(node, metadata);
  }
  const block = blockFromNode(node, metadata);
  return block ? [block] : [];
}

function isFlowDecorator(node: LexicalNode): boolean {
  return (
    $isRichButtonNode(node) ||
    $isRichMediaNode(node) ||
    $isRichIconNode(node) ||
    $isRichFormFieldNode(node) ||
    $isRichDividerNode(node) ||
    $isRichValidationBadgeNode(node) ||
    node.getType() === 'lodariq-rich-divider'
  );
}

function flattenParagraph(paragraph: ElementNode, metadata: RichContentMetadata): LodariqBlock[] {
  const blocks: LodariqBlock[] = [];
  let runNodes: LexicalNode[] = [];
  let usedParagraphId = false;
  const flushRuns = (): void => {
    if (runNodes.length === 0) return;
    const runs = runsFromNodes(runNodes);
    const content = runs.map((run) => run.text).join('');
    runNodes = [];
    if (!content) return;
    const id = usedParagraphId ? createBlockId() : blockIdForNode(paragraph, metadata);
    usedParagraphId = true;
    const original = metadata.originalByBlockId.get(id);
    const textStyle = {
      ...original?.props.textStyle,
      ...elementAlignment(paragraph),
    };
    blocks.push(
      canonicalBlock(
        id,
        'paragraph',
        content,
        {
          ...original?.props,
          ...(Object.keys(textStyle).length ? { textStyle } : {}),
        },
        runs,
        original,
      ),
    );
  };
  for (const child of paragraph.getChildren()) {
    if (isFlowDecorator(child)) {
      flushRuns();
      const block = blockFromNode(child, metadata);
      if (block) blocks.push(block);
      continue;
    }
    runNodes.push(child);
  }
  flushRuns();
  const spacing = spacingAfterFromNode(paragraph);
  const last = blocks[blocks.length - 1];
  if (last && spacing !== undefined) {
    last.props = {
      ...last.props,
      blockLayout: { ...last.props.blockLayout, spacingAfterPx: spacing },
    };
  }
  return blocks;
}

function runsFromNodes(nodes: readonly LexicalNode[]): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  for (const node of nodes) {
    const texts = $isElementNode(node)
      ? node.getAllTextNodes()
      : $isTextNode(node)
        ? [node]
        : [];
    for (const text of texts) {
      const run = runFromTextNode(text);
      const previous = runs[runs.length - 1];
      if (
        previous &&
        JSON.stringify({ ...previous, text: '' }) === JSON.stringify({ ...run, text: '' })
      ) {
        previous.text += run.text;
      } else {
        runs.push(run);
      }
    }
  }
  return runs;
}

function spacingAfterFromNode(node: ElementNode): number | undefined {
  const match = /margin-bottom:\s*([0-9]+)px/u.exec(node.getStyle());
  return match ? clampSpacing(Number(match[1])) : undefined;
}

function blockFromNode(node: LexicalNode, metadata: RichContentMetadata): LodariqBlock | null {
  if ($isRichButtonNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'button',
      node.getContent(),
      node.getProps(),
      undefined,
      original,
    );
  }
  if ($isRichFormFieldNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'formField',
      node.getContent(),
      node.getProps(),
      undefined,
      original,
    );
  }
  if ($isRichMediaNode(node)) {
    if (node.isPendingAsset()) return null;
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'media',
      node.getMedia().accessibilityName,
      { ...original?.props, media: node.getMedia() },
      undefined,
      original,
    );
  }
  if ($isRichIconNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    return canonicalBlock(
      node.getBlockId(),
      'icon',
      node.getAccessibilityName(),
      {
        ...original?.props,
        composition: { kind: 'icon', icon: node.getIcon() },
        accessibilityName: node.getAccessibilityName(),
        textStyle: {
          ...original?.props.textStyle,
          ...(node.getColor() ? { color: node.getColor() } : {}),
        },
      },
      undefined,
      original,
    );
  }
  if ($isRichDividerNode(node) || node.getType() === 'lodariq-rich-divider') {
    const blockId = $isRichDividerNode(node) ? node.getBlockId() : createBlockId();
    const original = metadata.originalByBlockId.get(blockId);
    return canonicalBlock(blockId, 'divider', undefined, original?.props ?? {}, undefined, original);
  }
  if ($isRichValidationBadgeNode(node)) {
    const original = metadata.originalByBlockId.get(node.getBlockId());
    // The badge's state IS the block's validation status, so it is written back
    // there rather than duplicated into props where the two could disagree.
    return {
      ...canonicalBlock(
        node.getBlockId(),
        'validationBadge',
        node.getText(),
        original?.props ?? {},
        undefined,
        original,
      ),
      status: node.getState(),
    };
  }
  if (!$isElementNode(node)) return null;
  const original = originalBlockForNode(node, metadata);
  const id = blockIdForNode(node, metadata);
  const type = typeForNode(node, original?.type);
  const runs = inlineRunsFromNode(node);
  const content = $isListNode(node)
    ? node
        .getChildren()
        .map((child) => child.getTextContent())
        .join('\n')
    : runs.map((run) => run.text).join('');
  const textStyle = {
    ...original?.props.textStyle,
    ...elementAlignment(node),
  };
  return canonicalBlock(
    id,
    type,
    content,
    {
      ...original?.props,
      ...(Object.keys(textStyle).length ? { textStyle } : {}),
      ...(type === 'callout'
        ? { composition: original?.props.composition ?? { kind: 'callout' as const, tone: 'info' as const } }
        : {}),
      ...(type === 'stat'
        ? {
            composition:
              original?.props.composition ?? { kind: 'stat' as const, emphasis: 'strong' as const },
          }
        : {}),
    },
    type === 'list' ? undefined : runs,
    original,
  );
}

function canonicalBlock(
  id: string,
  type: LodariqBlockType,
  content: string | undefined,
  props: LodariqBlockProps,
  contentRuns: InlineTextRun[] | undefined,
  original?: LodariqBlock,
): LodariqBlock {
  return {
    id,
    type,
    ...(content ? { content } : {}),
    ...(contentRuns?.length ? { contentRuns } : {}),
    props,
    status: original?.status ?? 'ready',
    children: [],
  };
}

function inlineRunsFromNode(node: ElementNode): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  for (const descendant of node.getAllTextNodes()) {
    const run = runFromTextNode(descendant);
    const previous = runs[runs.length - 1];
    if (
      previous &&
      JSON.stringify({ ...previous, text: '' }) === JSON.stringify({ ...run, text: '' })
    )
      previous.text += run.text;
    else runs.push(run);
  }
  return runs;
}

function runFromTextNode(node: TextNode): InlineTextRun {
  const marks = ['bold', 'italic', 'underline'].filter((mark) =>
    node.hasFormat(mark as 'bold'),
  ) as InlineTextRun['marks'];
  const style = styleMap(node.getStyle());
  let parent: LexicalNode | null = node.getParent();
  let link: string | undefined;
  while (parent) {
    if ($isLinkNode(parent)) {
      link = parent.getURL();
      break;
    }
    parent = parent.getParent();
  }
  const fontSize = /^([0-9]{1,2})px$/.exec(style.get('font-size') ?? '')?.[1];
  const animation = inlineAnimationFromStyle(style);
  return {
    text: node.getTextContent(),
    ...(marks?.length ? { marks } : {}),
    ...(fontSize ? { fontSizePx: Number(fontSize) } : {}),
    ...(style.get('color') ? { color: style.get('color') } : {}),
    ...(style.get('background-color') ? { highlightColor: style.get('background-color') } : {}),
    ...(animation ? { animation } : {}),
    ...(link ? { link } : {}),
  };
}

function inlineAnimationFromStyle(
  style: ReadonlyMap<string, string>,
): TourMotionPresentation | undefined {
  const recipe = style.get('--lq-inline-motion');
  const easing = style.get('--lq-inline-motion-easing');
  const duration = /^([0-9]{3,4})ms$/.exec(style.get('--lq-inline-motion-duration') ?? '')?.[1];
  if (!recipe || !INLINE_MOTION_RECIPE_SET.has(recipe)) return undefined;
  if (!easing || !INLINE_MOTION_EASING_SET.has(easing)) return undefined;
  if (!duration) return undefined;
  const durationMs = Number(duration);
  if (durationMs < 100 || durationMs > 1200) return undefined;
  return {
    recipe: recipe as TourMotionPresentation['recipe'],
    durationMs,
    easing: easing as TourMotionPresentation['easing'],
    reducedMotion: 'none',
  };
}

function styleMap(value: string): Map<string, string> {
  return new Map(
    value
      .split(';')
      .map((entry) => entry.split(':').map((part) => part.trim()) as [string, string])
      .filter(([key, item]) => Boolean(key && item)),
  );
}

export function selectedTopLevelNode(): LexicalNode | null {
  const selection = $getSelection();
  if (!selection) return null;
  const node = $isRangeSelection(selection)
    ? selection.anchor.getNode()
    : (selection.getNodes()[0] ?? null);
  if (node === $getRoot()) return null;
  return node?.getTopLevelElementOrThrow() ?? null;
}

export function blockIdForNode(node: LexicalNode, metadata: RichContentMetadata): string {
  if (
    $isRichButtonNode(node) ||
    $isRichMediaNode(node) ||
    $isRichIconNode(node) ||
    $isRichFormFieldNode(node) ||
    $isRichDividerNode(node)
  )
    return node.getBlockId();
  const existing = metadata.blockIdByNodeKey.get(node.getKey());
  if (existing) return existing;
  const id = createBlockId();
  metadata.blockIdByNodeKey.set(node.getKey(), id);
  return id;
}

export function originalBlockForNode(
  node: LexicalNode,
  metadata: RichContentMetadata,
): LodariqBlock | undefined {
  return metadata.originalByBlockId.get(blockIdForNode(node, metadata));
}

export function typeForNode(node: LexicalNode, originalType?: LodariqBlockType): LodariqBlockType {
  if ($isHeadingNode(node)) return 'heading';
  if ($isListNode(node)) return 'list';
  if ($isRichCalloutNode(node)) return 'callout';
  if ($isRichStatNode(node)) return 'stat';
  if ($isRichButtonNode(node)) return 'button';
  if ($isRichMediaNode(node)) return 'media';
  if ($isRichIconNode(node)) return 'icon';
  if ($isRichFormFieldNode(node)) return 'formField';
  if ($isRichDividerNode(node)) return 'divider';
  if ($isRichTargetChipNode(node)) return 'targetChip';
  if ($isRichValidationBadgeNode(node)) return 'validationBadge';
  return originalType && TEXT_BLOCK_TYPES.has(originalType) ? originalType : 'paragraph';
}

function elementAlignment(node: ElementNode): LodariqBlockProps['textStyle'] {
  const format = node.getFormatType();
  return format === 'center' || format === 'right' || format === 'left' ? { align: format } : {};
}

export function inlineAnimationCssEasing(easing: TourMotionPresentation['easing']): string {
  if (easing === 'linear') return 'linear';
  if (easing === 'emphasized') return 'cubic-bezier(0.2, 0.8, 0.2, 1)';
  return 'cubic-bezier(0.2, 0, 0, 1)';
}

export function safeAuthorUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function humanizeIconName(value: string): string {
  return value
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function clampSpacing(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(
    BLOCK_SPACING_PX_LIMITS.max,
    Math.max(BLOCK_SPACING_PX_LIMITS.min, Math.round(value)),
  );
}
