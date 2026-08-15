import {
  sanitizeBlockProps,
  sanitizeInlineTextRuns,
  type InlineTextRun,
  type LodariqBlockProps,
  type LodariqBlockType,
  type ValidationLevel,
} from '@lodariq/schema';
import {
  $applyNodeReplacement,
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';

export const LODARIQ_MVP_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'list',
  'divider',
  'media',
  'callout',
  'stat',
  'icon',
  'link',
  'tourStep',
  'tooltip',
  'button',
  'targetChip',
  'validationBadge',
] as const satisfies readonly LodariqBlockType[];

export type LodariqMvpBlockType = (typeof LODARIQ_MVP_BLOCK_TYPES)[number];

export interface SerializedLodariqBlockNode extends SerializedElementNode {
  type: 'lodariq-block';
  version: 1;
  lodariqBlockId: string;
  blockType: LodariqMvpBlockType;
  props: LodariqBlockProps;
  contentRuns?: InlineTextRun[];
  status?: ValidationLevel;
}

export class LodariqBlockNode extends ElementNode {
  __lodariqBlockId: string;
  __blockType: LodariqMvpBlockType;
  __props: LodariqBlockProps;
  __contentRuns: InlineTextRun[] | undefined;
  __status: ValidationLevel | undefined;

  static override getType(): string {
    return 'lodariq-block';
  }

  static override clone(node: LodariqBlockNode): LodariqBlockNode {
    return new LodariqBlockNode(
      node.__lodariqBlockId,
      node.__blockType,
      node.__props,
      node.__status,
      node.__contentRuns,
      node.__key,
    );
  }

  static override importJSON(serializedNode: SerializedLodariqBlockNode): LodariqBlockNode {
    return new LodariqBlockNode(
      serializedNode.lodariqBlockId,
      serializedNode.blockType,
      sanitizeBlockProps(serializedNode.props),
      serializedNode.status,
      serializedNode.contentRuns,
    );
  }

  constructor(
    lodariqBlockId: string,
    blockType: LodariqMvpBlockType,
    props: Record<string, unknown> = {},
    status?: ValidationLevel,
    contentRuns?: InlineTextRun[],
    key?: NodeKey,
  ) {
    super(key);
    this.__lodariqBlockId = lodariqBlockId;
    this.__blockType = blockType;
    this.__props = sanitizeBlockProps(props);
    this.__contentRuns = sanitizeInlineTextRuns(contentRuns);
    this.__status = status;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement(tagForBlockType(this.__blockType));
    element.dataset['lodariqBlockId'] = this.__lodariqBlockId;
    element.dataset['lodariqBlockType'] = this.__blockType;
    if (this.__status) element.dataset['lodariqStatus'] = this.__status;
    return element;
  }

  override updateDOM(prevNode: LodariqBlockNode, dom: HTMLElement): boolean {
    if (prevNode.__blockType !== this.__blockType) return true;
    dom.dataset['lodariqBlockId'] = this.__lodariqBlockId;
    dom.dataset['lodariqBlockType'] = this.__blockType;
    if (this.__status) dom.dataset['lodariqStatus'] = this.__status;
    else delete dom.dataset['lodariqStatus'];
    return false;
  }

  override exportJSON(): SerializedLodariqBlockNode {
    return {
      ...super.exportJSON(),
      type: 'lodariq-block',
      version: 1,
      lodariqBlockId: this.__lodariqBlockId,
      blockType: this.__blockType,
      props: this.__props,
      ...(this.__contentRuns ? { contentRuns: structuredClone(this.__contentRuns) } : {}),
      ...(this.__status ? { status: this.__status } : {}),
    };
  }

  getLodariqBlockId(): string {
    return this.__lodariqBlockId;
  }

  getBlockType(): LodariqMvpBlockType {
    return this.__blockType;
  }
}

export function $createLodariqBlockNode(
  lodariqBlockId: string,
  blockType: LodariqMvpBlockType,
  props?: Record<string, unknown>,
  status?: ValidationLevel,
  contentRuns?: InlineTextRun[],
): LodariqBlockNode {
  return $applyNodeReplacement(
    new LodariqBlockNode(lodariqBlockId, blockType, props, status, contentRuns),
  );
}

export function $isLodariqBlockNode(
  node: LexicalNode | null | undefined,
): node is LodariqBlockNode {
  return node instanceof LodariqBlockNode;
}

function tagForBlockType(blockType: LodariqMvpBlockType): keyof HTMLElementTagNameMap {
  switch (blockType) {
    case 'paragraph':
      return 'p';
    case 'heading':
      return 'h2';
    case 'button':
      return 'button';
    case 'media':
      return 'figure';
    case 'targetChip':
    case 'validationBadge':
      return 'span';
    default:
      return 'section';
  }
}
