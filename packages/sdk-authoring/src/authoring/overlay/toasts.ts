import { authoringText } from '../../i18n';

/**
 * Transient notices, top centre (§4.1).
 *
 * The overlay has no other way to say something happened that the creator did
 * not ask about — a tour resumed, the page was frozen so a menu would stay open,
 * an edit was undone. A banner would push the product around; a toast says it
 * and leaves.
 *
 * Meaning always rides in the text. `kind` only tints the border, so a notice is
 * never colour-only.
 */
export const TOAST_DEFAULT_MS = 3_200;
/** Beyond this the stack stops being readable and starts being a wall. */
export const TOAST_MAX_VISIBLE = 4;
const TOAST_EXIT_MS = 300;

export type ToastKind = 'neutral' | 'positive' | 'warning' | 'danger';

export interface ToastAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface ToastOptions {
  readonly kind?: ToastKind;
  readonly durationMs?: number;
  readonly action?: ToastAction;
}

export function createToastLayer(doc: Document): HTMLElement {
  const layer = doc.createElement('div');
  layer.className = 'overlay-toasts';
  layer.dataset['protectedChrome'] = 'true';
  layer.dataset['lodariqAuthoringControl'] = 'true';
  // Polite: a toast reports what happened, it never interrupts a task.
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  layer.setAttribute('aria-label', authoringText('Authoring notices'));
  return layer;
}

export function showToast(layer: HTMLElement, message: string, options: ToastOptions = {}): void {
  const doc = layer.ownerDocument;
  const toast = doc.createElement('div');
  toast.className = 'overlay-toast';
  toast.dataset['kind'] = options.kind ?? 'neutral';

  const text = doc.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  let dismissed = false;
  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    toast.dataset['leaving'] = 'true';
    doc.defaultView?.setTimeout(() => toast.remove(), TOAST_EXIT_MS);
  };

  if (options.action) {
    const action = doc.createElement('button');
    action.type = 'button';
    action.className = 'overlay-toast-action';
    action.textContent = options.action.label;
    action.addEventListener('click', () => {
      dismiss();
      options.action?.onSelect();
    });
    toast.appendChild(action);
  }

  // Clicking the notice itself dismisses it; clicking its button does not, or
  // the action would be lost to a stray click on the way to it.
  toast.addEventListener('click', (event) => {
    if (event.target === toast || event.target === text) dismiss();
  });

  layer.appendChild(toast);
  while (layer.children.length > TOAST_MAX_VISIBLE) layer.firstChild?.remove();
  doc.defaultView?.setTimeout(dismiss, options.durationMs ?? TOAST_DEFAULT_MS);
}
