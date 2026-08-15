import type { CSSProperties, ReactNode } from 'react';
import { TEXT_FONT_SIZE_PX_LIMITS, type InlineTextRun, type LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { TEXT_SIZE_OPTIONS } from './tour-sequence-options';

export type RichTextSelection = { blockId: string; start: number; end: number };

export const EDITOR_BLOCK_TYPE_OPTIONS = [
  { value: 'paragraph', label: authoringText('Normal text') },
  { value: 'heading', label: authoringText('Heading') },
  { value: 'list', label: authoringText('List') },
  { value: 'button', label: authoringText('Button') },
  { value: 'link', label: authoringText('Link') },
  { value: 'media', label: authoringText('Media') },
  { value: 'divider', label: authoringText('Divider') },
] as const;

export const BLOCK_EDITOR_LABELS: Partial<Record<LodariqBlock['type'], string>> = {
  heading: authoringText('heading'),
  paragraph: authoringText('text'),
  list: authoringText('list'),
  divider: authoringText('divider'),
  button: authoringText('button'),
  link: authoringText('link'),
  media: authoringText('media'),
};

export const BLOCK_EDITOR_INPUT_LABELS: Partial<Record<LodariqBlock['type'], string>> = {
  button: authoringText('Button label'),
  link: authoringText('Link label'),
  media: authoringText('Media description'),
};
export function blockTypeEditorLabel(block: LodariqBlock): string {
  return BLOCK_EDITOR_LABELS[block.type] ?? authoringText('content');
}

export function renderInlineTextRuns(block: LodariqBlock): ReactNode {
  const runs = block.contentRuns;
  if (!runs?.length || runs.map((run) => run.text).join('') !== (block.content ?? ''))
    return block.content;
  return runs.map((run, index) => (
    <span
      key={`${block.id}-run-${index}`}
      data-inline-run="true"
      data-marks={(run.marks ?? []).join(' ')}
      data-font-size-px={run.fontSizePx}
      data-color={run.color}
      data-highlight-color={run.highlightColor}
      data-link={run.link}
      style={inlineRunStyle(run)}
    >
      {run.text}
    </span>
  ));
}

function inlineRunStyle(run: InlineTextRun): CSSProperties {
  const marks = new Set(run.marks ?? []);
  return {
    color: run.color,
    backgroundColor: run.highlightColor,
    fontSize: run.fontSizePx ? `${run.fontSizePx}px` : undefined,
    fontWeight: marks.has('bold') ? 700 : undefined,
    fontStyle: marks.has('italic') ? 'italic' : undefined,
    textDecoration: marks.has('underline') || run.link ? 'underline' : undefined,
  };
}

export function richTextSelection(element: HTMLElement, blockId: string): RichTextSelection | null {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  const startRange = range.cloneRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { blockId, start: startRange.toString().length, end: endRange.toString().length };
}

export function extractInlineTextRuns(element: HTMLElement): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  const visit = (node: Node, inherited?: InlineTextRun): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push({ ...inherited, text });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      runs.push({ ...inherited, text: '\n' });
      return;
    }
    const marks = node.dataset['marks']?.split(' ').filter(Boolean) as InlineTextRun['marks'];
    const next: InlineTextRun = { text: '' };
    const effectiveMarks = marks?.length ? marks : inherited?.marks;
    const fontSizePx = node.dataset['fontSizePx']
      ? boundedFontSizePx(node.dataset['fontSizePx'])
      : inherited?.fontSizePx;
    const color = node.dataset['color'] ?? inherited?.color;
    const highlightColor = node.dataset['highlightColor'] ?? inherited?.highlightColor;
    const link = node.dataset['link'] ?? inherited?.link;
    if (effectiveMarks?.length) next.marks = effectiveMarks;
    if (fontSizePx) next.fontSizePx = fontSizePx;
    if (color) next.color = color;
    if (highlightColor) next.highlightColor = highlightColor;
    if (link) next.link = link;
    node.childNodes.forEach((child) => visit(child, next));
  };
  element.childNodes.forEach((child) => visit(child));
  return runs;
}

export function inlineMarkActive(
  block: LodariqBlock | null,
  selection: RichTextSelection | null,
  mark: NonNullable<InlineTextRun['marks']>[number],
): boolean {
  if (!block) return false;
  if (!selection || selection.blockId !== block.id || selection.start === selection.end) {
    if (mark === 'bold') return (block.props.textStyle?.fontWeight ?? 400) >= 600;
    if (mark === 'italic') return block.props.textStyle?.fontStyle === 'italic';
    return false;
  }
  let offset = 0;
  const runs = block.contentRuns ?? [{ text: block.content ?? '' }];
  const selectedRuns = runs.filter((run) => {
    const start = offset;
    const end = offset + run.text.length;
    offset = end;
    return end > selection.start && start < selection.end;
  });
  return selectedRuns.length > 0 && selectedRuns.every((run) => run.marks?.includes(mark));
}

export function selectedTextFontSize(
  block: LodariqBlock | null,
  selection: RichTextSelection | null,
): number | 'default' | 'mixed' {
  const blockDefault = block?.props.textStyle?.fontSizePx ?? (block?.type === 'heading' ? 24 : 14);
  if (!block || !selection || selection.blockId !== block.id || selection.start === selection.end) {
    return blockDefault;
  }
  let offset = 0;
  const selectedRuns = (block.contentRuns ?? [{ text: block.content ?? '' }]).filter((run) => {
    const start = offset;
    const end = offset + run.text.length;
    offset = end;
    return end > selection.start && start < selection.end;
  });
  if (selectedRuns.every((run) => run.fontSizePx === undefined)) return 'default';
  const firstSize = selectedRuns[0]?.fontSizePx;
  return firstSize && selectedRuns.every((run) => run.fontSizePx === firstSize)
    ? firstSize
    : 'mixed';
}

export function boundedFontSizePx(value: number | string): number | undefined {
  const candidate = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(candidate)) return undefined;
  if (candidate < TEXT_FONT_SIZE_PX_LIMITS.min) return undefined;
  if (candidate > TEXT_FONT_SIZE_PX_LIMITS.max) return undefined;
  return candidate;
}

export function fontSizeOptions(includeBlockDefault: boolean) {
  return [
    ...(includeBlockDefault ? [{ value: 'default', label: authoringText('Block default') }] : []),
    ...TEXT_SIZE_OPTIONS.map((size) => ({
      value: size,
      label: `${size}${authoringText('px')}`,
    })),
  ];
}

export function richTextBlockStyle(block: LodariqBlock) {
  const textStyle = block.props.textStyle;
  return {
    color: textStyle?.color,
    fontSize: textStyle?.fontSizePx ? `${textStyle.fontSizePx}px` : undefined,
    fontStyle: textStyle?.fontStyle,
    fontWeight: textStyle?.fontWeight,
    textAlign: textStyle?.align,
  } as const;
}
