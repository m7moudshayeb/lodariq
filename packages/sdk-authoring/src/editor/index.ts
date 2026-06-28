import { createEditor, type LexicalEditor } from 'lexical';

/**
 * Talmeh editor boundary on top of Lexical (PRD §7.2).
 *
 * This directory (`packages/sdk-authoring/src/editor`) is the ONLY source area
 * allowed to import `lexical` / `@lexical/*`. Enforced by package separation,
 * dependency-cruiser, and ESLint (PRD §7.2, §20).
 *
 * Node policy (PRD §7.2): use Lexical's standard text/element nodes for
 * paragraphs, headings, and lists; reserve custom/decorator nodes for
 * Talmeh-specific UI (target chips, validation badges, tooltips, tour steps,
 * action buttons). MVP nodes are implemented in the Pre-phase (PRD §16.1).
 */
export function createTalmehEditor(): LexicalEditor {
  return createEditor({
    namespace: 'talmeh',
    // Custom Talmeh nodes are registered here during Pre-phase editor work.
    nodes: [],
    onError: (error) => {
      throw error;
    },
  });
}

export * from './ids';
export * from './serialize';
