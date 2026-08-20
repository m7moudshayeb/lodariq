/**
 * The narration caption under the card, during preview (§4.7).
 *
 * Real text, not a placeholder: §7.7 keeps the spoken script in the document and
 * only the *audio* out of the artifact, so the words exist even though nothing
 * can play them. The caption shows the script for the step on screen; it changes
 * with the step rather than with a clock, because there is no clock.
 */
import { escapeHtml } from './html';

export interface Captions {
  readonly element: HTMLElement;
  /** Null when the step has no script, which hides the box rather than empties it. */
  readonly setScript: (script: string | null) => void;
  readonly setVisible: (visible: boolean) => void;
}

export function createCaptions(doc: Document): Captions {
  const element = doc.createElement('p');
  element.className = 'overlay-captions';
  element.dataset['protectedChrome'] = 'true';
  // A caption is announced by the runtime step it belongs to, not by itself.
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;

  let script: string | null = null;
  let visible = false;
  const sync = (): void => {
    element.hidden = !visible || !script;
    element.innerHTML = script ? escapeHtml(script) : '';
  };

  return {
    element,
    setScript: (next) => {
      script = next?.trim() ? next : null;
      sync();
    },
    setVisible: (next) => {
      visible = next;
      sync();
    },
  };
}
