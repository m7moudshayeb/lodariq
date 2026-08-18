import type { FormFieldControl, FormFieldPresentation, LodariqBlock, MediaPresentation } from '@lodariq/schema';
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from 'lexical';
import { authoringText } from '../i18n';
import {
  clampSpacing,
  exportRichContent,
  type RichContentMetadata,
} from './rich-content-doc';
import { $isRichMediaNode } from './rich-content-nodes';

export function insertNodeAtSelection(
  editor: LexicalEditor,
  createNode: () => LexicalNode,
  options: { afterKey?: NodeKey | null; trailingParagraph?: boolean } = {},
): NodeKey | null {
  let insertedNodeKey: NodeKey | null = null;
  editor.update(() => {
    const node = createNode();
    insertedNodeKey = node.getKey();
    const afterKey = options.afterKey;
    const inline = node.isInline();
    if (afterKey) {
      const anchor = $getNodeByKey(afterKey) ?? $getRoot().getLastChild();
      const placed = inline ? wrapInlineNode(node) : node;
      if (anchor) anchor.insertAfter(placed);
      else $getRoot().append(placed);
      if (
        anchor &&
        $isParagraphNode(anchor) &&
        anchor.getTextContent() === '' &&
        !$isDecoratorNode(node) &&
        !inline
      ) {
        anchor.remove();
      }
      if (options.trailingParagraph && !inline) placed.insertAfter($createParagraphNode());
      if (inline && $isElementNode(placed)) placed.selectEnd();
      else {
        const focusTarget = options.trailingParagraph ? placed.getNextSibling() : placed;
        if ($isElementNode(focusTarget)) focusTarget.selectStart();
      }
    } else {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && inline) {
        $insertNodes([node]);
      } else if ($isRangeSelection(selection)) {
        selection.anchor.getNode().getTopLevelElementOrThrow().insertAfter(node);
      } else {
        $getRoot().append(inline ? wrapInlineNode(node) : node);
      }
      if (options.trailingParagraph && !inline) {
        node.insertAfter($createParagraphNode());
        const trailing = node.getNextSibling();
        if ($isElementNode(trailing)) trailing.selectStart();
      } else if (!inline && $isElementNode(node)) {
        node.selectStart();
      }
    }
    $hoistBlockDecorator(node);
  });
  editor.focus();
  return insertedNodeKey;
}

function wrapInlineNode(node: LexicalNode): LexicalNode {
  const paragraph = $createParagraphNode();
  paragraph.append(node);
  return paragraph;
}

function $hoistBlockDecorator(node: LexicalNode): void {
  if (node.isInline()) return;
  const parent = node.getParent();
  if (!$isParagraphNode(parent)) return;
  parent.insertAfter(node);
  if (parent.getChildrenSize() === 0) parent.remove();
}

export function formFieldNameFromBlockId(blockId: string): string {
  const slug = blockId
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/^[^a-z]+/u, '');
  return (slug || 'field').slice(0, 64);
}

export function createFormFieldProps(
  control: FormFieldControl,
  blockId: string,
): { formField: FormFieldPresentation } {
  const formField: FormFieldPresentation = {
    control,
    name: formFieldNameFromBlockId(blockId),
  };
  if (control === 'radio') {
    formField.options = [
      { id: 'option_a', label: authoringText('Option 1') },
      { id: 'option_b', label: authoringText('Option 2') },
    ];
  }
  if (control === 'text') formField.placeholder = authoringText('Type here');
  return { formField };
}

export function formFieldInsertLabel(control: FormFieldControl): string {
  if (control === 'checkbox') return authoringText('I agree');
  if (control === 'radio') return authoringText('Choose one');
  return authoringText('Your answer');
}

export function insertTextAtSelection(
  editor: LexicalEditor,
  text: string,
  options: { afterKey?: NodeKey | null } = {},
): void {
  editor.update(() => {
    const afterKey = options.afterKey;
    if (afterKey) {
      const anchor = $getNodeByKey(afterKey);
      if (anchor && $isElementNode(anchor) && !$isDecoratorNode(anchor)) {
        anchor.selectEnd();
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertText(text);
          return;
        }
      }
      const paragraph = $createParagraphNode();
      if (anchor) anchor.insertAfter(paragraph);
      else $getRoot().append(paragraph);
      paragraph.selectEnd();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
      return;
    }
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.insertText(text);
      return;
    }
    const paragraph = $getRoot().getLastChild();
    if ($isElementNode(paragraph) && !$isDecoratorNode(paragraph)) {
      paragraph.selectEnd();
    } else {
      const next = $createParagraphNode();
      $getRoot().append(next);
      next.selectEnd();
    }
    const nextSelection = $getSelection();
    if ($isRangeSelection(nextSelection)) nextSelection.insertText(text);
  });
  editor.focus();
}

export function applyBlockSpacingAfter(
  editor: LexicalEditor,
  metadata: RichContentMetadata,
  onChange: (value: LodariqBlock[]) => void,
  key: NodeKey,
  blockId: string,
  value: number,
): void {
  const spacing = clampSpacing(value);
  const element = editor.getElementByKey(key);
  if (element) {
    element.style.marginBottom = `${spacing}px`;
    element.setAttribute('data-lodariq-spacing-after-px', String(spacing));
  }
  editor.update(() => {
    const node = $getNodeByKey(key);
    if (!$isElementNode(node)) return;
    const withoutMargin = node.getStyle().replace(/margin-bottom:\s*[^;]+;?/gu, '').trim();
    node.setStyle(`${withoutMargin ? `${withoutMargin}; ` : ''}margin-bottom: ${spacing}px`);
  });
  const current = editor.getEditorState().read(() => exportRichContent(metadata));
  const next = current.map((block) =>
    block.id === blockId
      ? {
          ...block,
          props: {
            ...block.props,
            blockLayout: { ...block.props.blockLayout, spacingAfterPx: spacing },
          },
        }
      : block,
  );
  const updated = next.find((block) => block.id === blockId);
  if (updated) metadata.originalByBlockId.set(blockId, structuredClone(updated));
  onChange(next);
}

export function setMediaUploadProgress(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  progress: number | undefined,
): void {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey);
    if ($isRichMediaNode(node)) node.setUploadProgress(progress);
  });
}

export function removeMediaNode(editor: LexicalEditor, nodeKey: NodeKey): void {
  editor.update(() => {
    const node = $getNodeByKey(nodeKey);
    if ($isRichMediaNode(node)) node.remove();
  });
}

export function createLocalMediaPreview(file: File): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
}

export function revokeLocalMediaPreview(previewUrl: string | null): void {
  if (previewUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(previewUrl);
}

export function createMediaPresentation(
  kind: 'image' | 'video',
  assetId: string,
  accessibilityName: string,
): MediaPresentation {
  return { kind, assetId, accessibilityName };
}

export function clampUploadProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function mediaUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return authoringText('Media could not be saved. Check the file size and available storage.');
}
