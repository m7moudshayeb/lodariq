import { createNonceStyleElement } from '@lodariq/schema/dom';
import type { LodariqBrowserApi } from '@lodariq/sdk-runtime/lodariq-loader';

export interface CreatorToolbarOptions {
  container?: HTMLElement;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

const TOOLBAR_SELECTOR = '[data-lodariq-creator-toolbar="true"]';
const TOOLBAR_STYLE_ID = 'lodariq-creator-toolbar-style';
const DEFAULT_CLASS_NAME = 'lodariq-creator-toolbar';
const DEFAULT_LABEL = 'Edit';
const DEFAULT_ARIA_LABEL = 'Open Lodariq authoring';

const CREATOR_TOOLBAR_CSS = `
[data-lodariq-creator-toolbar='true'] {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483645;
  display: inline-flex;
  min-width: 76px;
  height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(78, 207, 178, 0.56);
  border-radius: 8px;
  background: #102b25;
  color: #e8f2ef;
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.32),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  cursor: pointer;
  font: 740 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
  padding: 0 14px;
  user-select: none;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

[data-lodariq-creator-toolbar='true']:hover {
  border-color: rgba(98, 228, 195, 0.82);
  background: #174137;
  color: #f4faf8;
  transform: translateY(-1px);
}

[data-lodariq-creator-toolbar='true']:focus-visible {
  outline: 3px solid rgba(78, 207, 178, 0.36);
  outline-offset: 3px;
}

[data-lodariq-creator-toolbar='true'][aria-busy='true'] {
  cursor: progress;
  opacity: 0.82;
}

@supports (width: 100dvw) {
  [data-lodariq-creator-toolbar='true'] {
    right: calc((100vw - 100dvw) + 18px);
    bottom: calc((100vh - 100dvh) + 18px);
  }
}
`;

export function installCreatorToolbar(
  options: CreatorToolbarOptions = {},
): HTMLButtonElement | null {
  if (!options.container && typeof document === 'undefined') return null;

  const doc = options.container?.ownerDocument ?? document;
  const container = options.container ?? doc.body;
  if (!container) return null;

  const api = currentLodariqApi(doc);
  if (!api?.authoring.enabled) {
    removeCreatorToolbar(container);
    return null;
  }

  ensureCreatorToolbarStyle(doc);
  removeCreatorToolbar(container);

  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset['lodariqCreatorToolbar'] = 'true';
  button.className = options.className ?? DEFAULT_CLASS_NAME;
  button.textContent = options.label ?? DEFAULT_LABEL;
  button.setAttribute('aria-label', options.ariaLabel ?? DEFAULT_ARIA_LABEL);
  button.title = options.ariaLabel ?? DEFAULT_ARIA_LABEL;

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-busy') === 'true') return;
    button.setAttribute('aria-busy', 'true');
    void api
      .openAuthoring()
      .catch((error: unknown) => dispatchAuthoringError(doc, error))
      .finally(() => button.removeAttribute('aria-busy'));
  });

  container.appendChild(button);
  return button;
}

export function removeCreatorToolbar(container?: HTMLElement): void {
  if (!container && typeof document === 'undefined') return;
  const target = container ?? document.body;
  if (!target) return;
  target.querySelector<HTMLButtonElement>(TOOLBAR_SELECTOR)?.remove();
}

function ensureCreatorToolbarStyle(doc: Document): void {
  if (doc.getElementById(TOOLBAR_STYLE_ID)) return;
  const style = createNonceStyleElement(doc, CREATOR_TOOLBAR_CSS);
  style.id = TOOLBAR_STYLE_ID;
  doc.head.appendChild(style);
}

function currentLodariqApi(doc: Document): LodariqBrowserApi | undefined {
  return doc.defaultView?.Lodariq ?? window.Lodariq;
}

function dispatchAuthoringError(doc: Document, error: unknown): void {
  doc.defaultView?.dispatchEvent(
    new CustomEvent('lodariq:authoring-error', {
      detail: { error },
    }),
  );
}
