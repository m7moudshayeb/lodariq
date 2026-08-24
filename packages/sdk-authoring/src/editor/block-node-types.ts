import type {
  InlineTextRun,
  LodariqBlockProps,
  LodariqBlockType,
  ValidationLevel,
} from '@lodariq/schema';
import type { SerializedElementNode } from 'lexical';

/**
 * The shape of a serialized Lodariq block, and the block types the editor
 * supports — without the node class that implements them.
 *
 * Split out of `nodes` so that reading or writing block JSON does not require
 * Lexical at runtime. `serialize` needs only this list and these types, but it
 * used to reach them through `nodes`, which extends `ElementNode` and so pulls
 * the Lexical core in. That put an editor engine on the first-paint path for a
 * frame that had not yet decided to show a text field.
 *
 * The `lexical` import here is type-only and erases at build time.
 */
export const LODARIQ_MVP_BLOCK_TYPES = [
  'paragraph',
  'heading',
  'list',
  'divider',
  'media',
  'callout',
  'stat',
  'icon',
  'formField',
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
