import type { TalmehBlockType, ValidationLevel } from '@talmeh/schema';
import {
  $applyNodeReplacement,
  ElementNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
} from 'lexical';

export const TALMEH_MVP_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'tourStep',
  'tooltip',
  'button',
  'targetChip',
  'validationBadge',
] as const satisfies readonly TalmehBlockType[];

export type TalmehMvpBlockType = (typeof TALMEH_MVP_BLOCK_TYPES)[number];

export interface SerializedTalmehBlockNode extends SerializedElementNode {
  type: 'talmeh-block';
  version: 1;
  talmehBlockId: string;
  blockType: TalmehMvpBlockType;
  props: Record<string, unknown>;
  status?: ValidationLevel;
}

export class TalmehBlockNode extends ElementNode {
  __talmehBlockId: string;
  __blockType: TalmehMvpBlockType;
  __props: Record<string, unknown>;
  __status: ValidationLevel | undefined;

  static override getType(): string {
    return 'talmeh-block';
  }

  static override clone(node: TalmehBlockNode): TalmehBlockNode {
    return new TalmehBlockNode(
      node.__talmehBlockId,
      node.__blockType,
      node.__props,
      node.__status,
      node.__key,
    );
  }

  static override importJSON(serializedNode: SerializedTalmehBlockNode): TalmehBlockNode {
    return new TalmehBlockNode(
      serializedNode.talmehBlockId,
      serializedNode.blockType,
      serializedNode.props,
      serializedNode.status,
    );
  }

  constructor(
    talmehBlockId: string,
    blockType: TalmehMvpBlockType,
    props: Record<string, unknown> = {},
    status?: ValidationLevel,
    key?: NodeKey,
  ) {
    super(key);
    this.__talmehBlockId = talmehBlockId;
    this.__blockType = blockType;
    this.__props = props;
    this.__status = status;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement(tagForBlockType(this.__blockType));
    element.dataset['talmehBlockId'] = this.__talmehBlockId;
    element.dataset['talmehBlockType'] = this.__blockType;
    if (this.__status) element.dataset['talmehStatus'] = this.__status;
    return element;
  }

  override updateDOM(prevNode: TalmehBlockNode, dom: HTMLElement): boolean {
    if (prevNode.__blockType !== this.__blockType) return true;
    dom.dataset['talmehBlockId'] = this.__talmehBlockId;
    dom.dataset['talmehBlockType'] = this.__blockType;
    if (this.__status) dom.dataset['talmehStatus'] = this.__status;
    else delete dom.dataset['talmehStatus'];
    return false;
  }

  override exportJSON(): SerializedTalmehBlockNode {
    return {
      ...super.exportJSON(),
      type: 'talmeh-block',
      version: 1,
      talmehBlockId: this.__talmehBlockId,
      blockType: this.__blockType,
      props: this.__props,
      ...(this.__status ? { status: this.__status } : {}),
    };
  }

  getTalmehBlockId(): string {
    return this.__talmehBlockId;
  }

  getBlockType(): TalmehMvpBlockType {
    return this.__blockType;
  }
}

export function $createTalmehBlockNode(
  talmehBlockId: string,
  blockType: TalmehMvpBlockType,
  props?: Record<string, unknown>,
  status?: ValidationLevel,
): TalmehBlockNode {
  return $applyNodeReplacement(new TalmehBlockNode(talmehBlockId, blockType, props, status));
}

export function $isTalmehBlockNode(node: LexicalNode | null | undefined): node is TalmehBlockNode {
  return node instanceof TalmehBlockNode;
}

function tagForBlockType(blockType: TalmehMvpBlockType): keyof HTMLElementTagNameMap {
  switch (blockType) {
    case 'paragraph':
      return 'p';
    case 'heading':
      return 'h2';
    case 'button':
      return 'button';
    case 'targetChip':
    case 'validationBadge':
      return 'span';
    default:
      return 'section';
  }
}
