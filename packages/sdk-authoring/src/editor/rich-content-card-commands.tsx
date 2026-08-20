import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createNodeSelection,
  $getRoot,
  $isDecoratorNode,
  $setSelection,
  type LexicalNode,
} from 'lexical';
import { authoringText } from '../i18n';
import { $createRichButtonNode, $isRichButtonNode } from './rich-content-nodes';
import { createBlockId } from './ids';
import { FLUSH_RICH_CONTENT_COMMAND, insertNodeAtSelection } from './rich-content-commands';

export interface RichContentCardCommand {
  kind: 'add-button' | 'remove-block' | 'select-block';
  blockId?: string;
  token: number;
}

/**
 * Performs a structural change asked for from outside the editor (§4.3).
 *
 * The inspector lists the card's buttons and offers to add and remove them, but
 * it renders outside the Lexical tree, and the editor holds the only live copy
 * of the card's content. So the request arrives here as data and the mutation
 * happens inside `editor.update`, which is the one place that can change the
 * card without the change being silently discarded.
 *
 * `token` is compared rather than the whole request, so re-rendering for an
 * unrelated reason cannot replay the last command.
 */
export function CardCommandPlugin({
  request,
}: {
  request: RichContentCardCommand | null;
}): null {
  const [editor] = useLexicalComposerContext();
  const performed = useRef<number | null>(null);

  useEffect(() => {
    if (!request || performed.current === request.token) return;
    performed.current = request.token;
    /*
     * The save is debounced and holds off while focus sits in an inspector —
     * which is exactly where focus is, because an inspector button was just
     * clicked. Structural changes cannot wait for that: until the document has
     * them, the list that ordered the change still shows the old card.
     */
    const handOver = (): void => {
      queueMicrotask(() => editor.dispatchCommand(FLUSH_RICH_CONTENT_COMMAND, undefined));
    };
    if (request.kind === 'add-button') {
      insertNodeAtSelection(
        editor,
        () =>
          $createRichButtonNode(createBlockId(), authoringText('Continue'), {
            action: { type: 'next' },
            variant: 'primary',
          }),
        { afterKey: lastTopLevelKey(editor) },
      );
      handOver();
      return;
    }
    if (!request.blockId) return;
    const blockId = request.blockId;
    editor.update(() => {
      const node = findByBlockId(blockId);
      if (!node) return;
      if (request.kind === 'remove-block') {
        node.remove();
        return;
      }
      /*
       * A decorator holds no caret, so it is selected as a node rather than as a
       * range — the same selection a click on the button itself makes, which is
       * what opens its settings.
       */
      const selection = $createNodeSelection();
      selection.add(node.getKey());
      $setSelection(selection);
    });
    if (request.kind === 'remove-block') handOver();
  }, [editor, request]);

  return null;
}

/** Where an appended block goes: after everything already in the card. */
function lastTopLevelKey(editor: ReturnType<typeof useLexicalComposerContext>[0]): string | null {
  let key: string | null = null;
  editor.getEditorState().read(() => {
    key = $getRoot().getLastChild()?.getKey() ?? null;
  });
  return key;
}

/**
 * A button is an inline decorator, so it is a grandchild of the root rather than
 * a child — the search has to descend.
 */
function findByBlockId(blockId: string): LexicalNode | null {
  const stack: LexicalNode[] = [...$getRoot().getChildren()];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if ($isRichButtonNode(node) && node.getBlockId() === blockId) return node;
    if (!$isDecoratorNode(node) && 'getChildren' in node) {
      const children = (node as unknown as { getChildren: () => LexicalNode[] }).getChildren();
      stack.push(...children);
    }
  }
  return null;
}
