import { createNonceStyleElement } from '@lodariq/schema/dom';
import { normalizeTargetElement } from './fingerprint';
import { applyAuthoringLocale, authoringText } from '../i18n';

const STYLE_PICKER_LAYER = 2_147_483_644;

export interface ProductStylePicker {
  cancel(): void;
}

export interface ProductStylePickerOptions {
  root?: Document;
  onPick(element: Element): void;
  onCancel?(): void;
}

/** One-click visual-source picker. It never creates or stores a target selector. */
export function startProductStylePicker(options: ProductStylePickerOptions): ProductStylePicker {
  const doc = options.root ?? document;
  const outline = doc.createElement('div');
  const hint = doc.createElement('div');
  applyAuthoringLocale(hint);
  const style = createNonceStyleElement(doc, '');
  style.textContent = `
    [data-lodariq-style-picker-outline] {
      position: fixed;
      pointer-events: none;
      z-index: ${STYLE_PICKER_LAYER};
      border: 2px solid #5b5cf0;
      border-radius: 8px;
      background: color-mix(in srgb, #5b5cf0 10%, transparent);
      box-shadow: 0 0 0 3px color-mix(in srgb, #5b5cf0 20%, transparent);
    }
    [data-lodariq-style-picker-hint] {
      position: fixed;
      inset: 16px auto auto 50%;
      transform: translateX(-50%);
      z-index: ${STYLE_PICKER_LAYER};
      pointer-events: none;
      padding: 9px 12px;
      border: 1px solid rgba(255,255,255,.5);
      border-radius: 999px;
      color: #fff;
      background: rgba(24,24,31,.82);
      box-shadow: 0 10px 30px rgba(15,23,42,.24);
      backdrop-filter: blur(14px);
      font: 600 12px/1.2 system-ui, sans-serif;
    }
  `;
  outline.setAttribute('data-lodariq-style-picker-outline', '');
  outline.hidden = true;
  hint.setAttribute('data-lodariq-style-picker-hint', '');
  hint.textContent = authoringText('Choose one element to match · Esc to cancel');
  doc.head.appendChild(style);
  doc.body.append(outline, hint);

  let current: Element | null = null;
  let done = false;

  const finish = (picked: Element | null): void => {
    if (done) return;
    done = true;
    doc.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('pointerdown', suppressPointer, true);
    doc.removeEventListener('pointerup', suppressPointer, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    outline.remove();
    hint.remove();
    style.remove();
    if (picked) options.onPick(picked);
    else options.onCancel?.();
  };

  const onPointerMove = (event: PointerEvent): void => {
    current = productElementFromEvent(event);
    if (!current) {
      outline.hidden = true;
      return;
    }
    const rect = current.getBoundingClientRect();
    outline.hidden = false;
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  };

  const suppressPointer = (event: Event): void => {
    if (!productElementFromEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onClick = (event: MouseEvent): void => {
    const picked = productElementFromEvent(event) ?? current;
    if (!picked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finish(picked);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    finish(null);
  };

  doc.addEventListener('pointermove', onPointerMove, true);
  doc.addEventListener('pointerdown', suppressPointer, true);
  doc.addEventListener('pointerup', suppressPointer, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
  return { cancel: () => finish(null) };
}

function productElementFromEvent(event: Event): Element | null {
  const path = event.composedPath();
  if (path.some((candidate) => candidate instanceof Element && isLodariqChrome(candidate))) {
    return null;
  }
  for (const candidate of path) {
    if (!(candidate instanceof Element)) continue;
    if (candidate === candidate.ownerDocument.documentElement) continue;
    return normalizeTargetElement(candidate);
  }
  return null;
}

function isLodariqChrome(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName.startsWith('lodariq-')) return true;
  return Boolean(
    element.closest(
      '[data-lodariq-authoring-trigger], [data-lodariq-style-picker-hint], [data-lodariq-style-picker-outline]',
    ),
  );
}
