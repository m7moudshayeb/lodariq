import { createEditor, type LexicalEditor } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';
import { LodariqBlockNode } from './nodes';

/**
 * Lodariq editor boundary on top of Lexical (PRD §7.2).
 *
 * This directory (`packages/sdk-authoring/src/editor`) is the ONLY source area
 * allowed to import `lexical` / `@lexical/*`. Enforced by package separation,
 * dependency-cruiser, and ESLint (PRD §7.2, §20).
 *
 * Node policy (PRD §7.2): use Lexical's standard text/element nodes for
 * paragraphs, headings, and lists; reserve custom/decorator nodes for
 * Lodariq-specific UI (target chips, validation badges, tooltips, tour steps,
 * action buttons). MVP nodes are implemented in the Pre-phase (PRD §16.1).
 */
export function createLodariqEditor(): LexicalEditor {
  return createEditor({
    namespace: 'lodariq',
    nodes: [HeadingNode, LodariqBlockNode],
    onError: (error) => {
      throw error;
    },
  });
}

export * from './ids';
export * from './nodes';
export * from './paste';
export * from './rich-content-editor';
export * from './serialize';
