import { createEditor, type LexicalEditor } from 'lexical';
import { HeadingNode } from '@lexical/rich-text';
import { LodariqBlockNode } from './nodes';

/**
 * Lodariq editor boundary on top of Lexical (PRD §7.2).
 *
 * `packages/sdk-authoring/src/editor` is the ONLY source area allowed to import
 * `lexical` / `@lexical/*`. Enforced by package separation, dependency-cruiser,
 * and ESLint (PRD §7.2, §20).
 *
 * Node policy (PRD §7.2): use Lexical's standard text/element nodes for
 * paragraphs, headings, and lists; reserve custom/decorator nodes for
 * Lodariq-specific UI (target chips, validation badges, tooltips, tour steps,
 * action buttons).
 *
 * Kept in its own module rather than in the directory barrel. The frame's
 * controller needs this factory at mount to canonicalise a document, and
 * reaching it through the barrel also pulled in the Rich Content editor, its
 * plugins and the `lucide-react` dynamic icon map — none of which the
 * controller uses.
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
