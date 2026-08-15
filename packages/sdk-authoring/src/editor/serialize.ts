import {
  sanitizeBlockProps,
  sanitizeInlineTextRuns,
  type InlineTextRun,
  type LodariqBlock,
  type LodariqBlockType,
  type LodariqDocument,
  type ValidationLevel,
} from '@lodariq/schema';
import {
  LODARIQ_MVP_BLOCK_TYPES,
  type SerializedLodariqBlockNode,
  type LodariqMvpBlockType,
} from './nodes';

/**
 * Serialization boundary between Lexical editor state and canonical Lodariq
 * block JSON (PRD §7.2 required capabilities).
 *
 * Stable Lodariq block IDs are serialized as `lodariqBlockId`; Lexical node keys
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
    children: Array<SerializedLodariqBlockNode | SerializedTextChild>;
    direction: null;
    format: '';
    indent: 0;
  };
}

/** Lexical state -> canonical block JSON (PRD §7.2). */
export function toBlockJson(state: SerializedEditorState): LodariqBlock[] {
  return state.root.children.filter(isSerializedLodariqBlockNode).map(nodeToBlock);
}

/** Canonical block JSON -> Lexical-ready state (PRD §7.2). */
export function fromBlockJson(blocks: LodariqBlock[]): SerializedEditorState {
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

function blockToNode(block: LodariqBlock): SerializedLodariqBlockNode {
  if (!isLodariqMvpBlockType(block.type)) {
    throw new Error(`Unsupported Lodariq MVP editor block type: ${block.type}`);
  }
  const content = block.content ?? '';
  const contentRuns = inlineRunsForText(block.contentRuns, content);
  return {
    type: 'lodariq-block',
    version: 1,
    lodariqBlockId: block.id,
    blockType: block.type,
    props: sanitizeBlockProps(block.props),
    ...(contentRuns ? { contentRuns } : {}),
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

function nodeToBlock(node: SerializedLodariqBlockNode): LodariqBlock {
  const text = node.children
    .filter(isSerializedTextChild)
    .map((child) => child.text)
    .join('');
  const contentRuns = inlineRunsForText(node.contentRuns, text);
  return {
    id: node.lodariqBlockId,
    type: node.blockType,
    ...(text ? { content: text } : {}),
    ...(contentRuns ? { contentRuns } : {}),
    props: sanitizeBlockProps(node.props),
    ...(node.status ? { status: node.status as ValidationLevel } : {}),
    children: node.children.filter(isSerializedLodariqBlockNode).map(nodeToBlock),
  };
}

function inlineRunsForText(
  value: InlineTextRun[] | undefined,
  text: string,
): InlineTextRun[] | undefined {
  const contentRuns = sanitizeInlineTextRuns(value);
  return contentRuns?.map((run) => run.text).join('') === text ? contentRuns : undefined;
}

function textChild(text: string): SerializedTextChild {
  return { type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 };
}

function isSerializedLodariqBlockNode(value: unknown): value is SerializedLodariqBlockNode {
  return Boolean(
    value && typeof value === 'object' && (value as { type?: unknown }).type === 'lodariq-block',
  );
}

function isSerializedTextChild(value: unknown): value is SerializedTextChild {
  return Boolean(
    value && typeof value === 'object' && (value as { type?: unknown }).type === 'text',
  );
}

function isLodariqMvpBlockType(value: LodariqBlockType): value is LodariqMvpBlockType {
  return LODARIQ_MVP_BLOCK_TYPES.some((type) => type === value);
}

/**
 * Versioned migration entry point for older block JSON (PRD §7.2, §16.1).
 * Each step upgrades one schemaVersion to the next; register migrations here.
 */
export type Migration = (doc: LodariqDocument) => LodariqDocument;

const MIGRATIONS: Record<string, Migration> = {
  '0.9.0': (doc) => ({ ...doc, schemaVersion: '1.0.0' }),
  '1.0.0': (doc) => ({ ...doc, schemaVersion: '2.0.0' }),
};

export function migrate(doc: LodariqDocument): LodariqDocument {
  let current = doc;
  let migration = MIGRATIONS[current.schemaVersion];
  while (migration) {
    current = migration(current);
    migration = MIGRATIONS[current.schemaVersion];
  }
  return current;
}
