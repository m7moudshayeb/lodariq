import {
  sanitizeBlockProps,
  type TalmehBlock,
  type TalmehBlockType,
  type TalmehDocument,
  type ValidationLevel,
} from '@talmeh/schema';
import {
  TALMEH_MVP_BLOCK_TYPES,
  type SerializedTalmehBlockNode,
  type TalmehMvpBlockType,
} from './nodes';

/**
 * Serialization boundary between Lexical editor state and canonical Talmeh
 * block JSON (PRD §7.2 required capabilities).
 *
 * Stable Talmeh block IDs are serialized as `talmehBlockId`; Lexical node keys
 * remain ephemeral and are never used as persistent IDs (PRD §7.2, §20).
 */

interface SerializedTextChild {
  type: 'text';
  version: 1;
  text: string;
  format: 0;
  style: '';
  mode: 'normal';
  detail: 0;
}

export interface SerializedEditorState {
  root: {
    type: 'root';
    version: 1;
    children: Array<SerializedTalmehBlockNode | SerializedTextChild>;
    direction: null;
    format: '';
    indent: 0;
  };
}

/** Lexical state -> canonical block JSON (PRD §7.2). */
export function toBlockJson(state: SerializedEditorState): TalmehBlock[] {
  return state.root.children.filter(isSerializedTalmehBlockNode).map(nodeToBlock);
}

/** Canonical block JSON -> Lexical-ready state (PRD §7.2). */
export function fromBlockJson(blocks: TalmehBlock[]): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      children: blocks.map(blockToNode),
      direction: null,
      format: '',
      indent: 0,
    },
  };
}

function blockToNode(block: TalmehBlock): SerializedTalmehBlockNode {
  if (!isTalmehMvpBlockType(block.type)) {
    throw new Error(`Unsupported Talmeh MVP editor block type: ${block.type}`);
  }
  return {
    type: 'talmeh-block',
    version: 1,
    talmehBlockId: block.id,
    blockType: block.type,
    props: sanitizeBlockProps(block.props),
    ...(block.status ? { status: block.status } : {}),
    children: [
      ...(block.content ? [textChild(block.content)] : []),
      ...block.children.map(blockToNode),
    ],
    direction: null,
    format: '',
    indent: 0,
  };
}

function nodeToBlock(node: SerializedTalmehBlockNode): TalmehBlock {
  const text = node.children
    .filter(isSerializedTextChild)
    .map((child) => child.text)
    .join('');
  return {
    id: node.talmehBlockId,
    type: node.blockType,
    ...(text ? { content: text } : {}),
    props: sanitizeBlockProps(node.props),
    ...(node.status ? { status: node.status as ValidationLevel } : {}),
    children: node.children.filter(isSerializedTalmehBlockNode).map(nodeToBlock),
  };
}

function textChild(text: string): SerializedTextChild {
  return { type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 };
}

function isSerializedTalmehBlockNode(value: unknown): value is SerializedTalmehBlockNode {
  return Boolean(
    value && typeof value === 'object' && (value as { type?: unknown }).type === 'talmeh-block',
  );
}

function isSerializedTextChild(value: unknown): value is SerializedTextChild {
  return Boolean(
    value && typeof value === 'object' && (value as { type?: unknown }).type === 'text',
  );
}

function isTalmehMvpBlockType(value: TalmehBlockType): value is TalmehMvpBlockType {
  return TALMEH_MVP_BLOCK_TYPES.some((type) => type === value);
}

/**
 * Versioned migration entry point for older block JSON (PRD §7.2, §16.1).
 * Each step upgrades one schemaVersion to the next; register migrations here.
 */
export type Migration = (doc: TalmehDocument) => TalmehDocument;

const MIGRATIONS: Record<string, Migration> = {
  '0.9.0': (doc) => ({ ...doc, schemaVersion: '1.0.0' }),
};

export function migrate(doc: TalmehDocument): TalmehDocument {
  let current = doc;
  let migration = MIGRATIONS[current.schemaVersion];
  while (migration) {
    current = migration(current);
    migration = MIGRATIONS[current.schemaVersion];
  }
  return current;
}
