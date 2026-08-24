import { lazy, Suspense, type ReactElement } from 'react';
import type { RichContentEditorProps } from '../../../editor/rich-content-editor';

/**
 * The Rich Content editor, loaded on its own rather than with the frame.
 *
 * Lexical, its plugins, and the `lucide-react` dynamic icon map together came
 * to roughly a third of the workspace chunk — and none of it is needed to draw
 * the shell, the rail, the inspector or the toolbar. Keeping it in the
 * first-paint graph meant every creator downloaded a text editor before seeing
 * any of the surface around it.
 *
 * Both popup surfaces render through this one boundary so the chunk is shared
 * and the pending state is identical wherever a step's content appears.
 */
const RichContentEditorChunk = lazy(async () => {
  const module = await import('../../../editor/rich-content-editor');
  return { default: module.RichContentEditor };
});

export function LazyRichContentEditor(props: RichContentEditorProps): ReactElement {
  return (
    <Suspense fallback={<RichContentEditorPending />}>
      <RichContentEditorChunk {...props} />
    </Suspense>
  );
}

/**
 * Holds the popup's shape while the editor arrives.
 *
 * A popup that collapses to nothing and then springs open reads as a bug, so
 * this reserves a line of content rather than rendering an empty box. It is
 * deliberately not a spinner: on a warm cache the editor is already there and a
 * spinner would flash for one frame every time a step is selected.
 */
function RichContentEditorPending(): ReactElement {
  return <div className="rich-content-pending" aria-hidden="true" />;
}
