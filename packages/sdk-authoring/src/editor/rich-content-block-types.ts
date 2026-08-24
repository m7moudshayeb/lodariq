import type { LodariqBlockType } from '@lodariq/schema';

/**
 * Which block types the freeform Rich Content editor owns.
 *
 * Split out of `rich-content-doc` so that asking the question does not load the
 * answer's machinery. The frame needs these sets to decide what a step contains
 * before it renders anything, while `rich-content-doc` pulls in Lexical to
 * convert between blocks and editor nodes. Importing one for the other put
 * Lexical, its plugins and the whole `lucide-react` icon map on the first-paint
 * path for every creator, including one who never opens a text field.
 */
export const RICH_CONTENT_BLOCK_TYPES = new Set<LodariqBlockType>([
  'paragraph',
  'heading',
  'list',
  'divider',
  'media',
  'callout',
  'stat',
  'icon',
  'button',
  'formField',
  'targetChip',
  'validationBadge',
]);

export const TEXT_BLOCK_TYPES = new Set<LodariqBlockType>([
  'paragraph',
  'heading',
  'list',
  'callout',
  'stat',
  'targetChip',
]);
