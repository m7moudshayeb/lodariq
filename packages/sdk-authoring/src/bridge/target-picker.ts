import type { ElementFingerprint } from '@talmeh/schema';
import { captureElementFingerprint } from './fingerprint';

export interface TargetPickResult {
  element: Element;
  fingerprint: ElementFingerprint;
}

export interface TargetPicker {
  cancel: () => void;
}

export interface TargetPickerOptions {
  root?: Document;
  onPick: (result: TargetPickResult) => void;
  onCancel?: () => void;
}

export function startTargetPicker(options: TargetPickerOptions): TargetPicker {
  const doc = options.root ?? document;
  const outline = doc.createElement('div');
  outline.dataset['talmehBridge'] = 'target-outline';
  outline.setAttribute('aria-hidden', 'true');
  Object.assign(outline.style, {
    position: 'fixed',
    zIndex: '2147483645',
    pointerEvents: 'none',
    border: '2px solid #2563eb',
    borderRadius: '6px',
    boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.16)',
    display: 'none',
  });

  const cursor = doc.createElement('style');
  cursor.textContent = 'html, body, body * { cursor: crosshair !important; }';
  doc.head.appendChild(cursor);
  doc.body.appendChild(outline);

  let current: Element | null = null;

  const cleanup = (): void => {
    doc.removeEventListener('pointerover', onPointer, true);
    doc.removeEventListener('pointermove', onPointer, true);
    doc.removeEventListener('pointerdown', suppressProductEvent, true);
    doc.removeEventListener('pointerup', suppressProductEvent, true);
    doc.removeEventListener('mousedown', suppressProductEvent, true);
    doc.removeEventListener('mouseup', suppressProductEvent, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    outline.remove();
    cursor.remove();
  };

  const cancel = (): void => {
    cleanup();
    options.onCancel?.();
  };

  function onPointer(event: Event): void {
    const next = elementFromEvent(event);
    current = next;
    if (!next) {
      outline.style.display = 'none';
      return;
    }
    const rect = next.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  }

  function suppressProductEvent(event: Event): void {
    if (!elementFromEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = current ?? elementFromEvent(event);
    if (!selected) return;
    cleanup();
    options.onPick({ element: selected, fingerprint: captureElementFingerprint(selected, event) });
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  }

  doc.addEventListener('pointerover', onPointer, true);
  doc.addEventListener('pointermove', onPointer, true);
  doc.addEventListener('pointerdown', suppressProductEvent, true);
  doc.addEventListener('pointerup', suppressProductEvent, true);
  doc.addEventListener('mousedown', suppressProductEvent, true);
  doc.addEventListener('mouseup', suppressProductEvent, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);

  return { cancel };
}

function elementFromEvent(event: Event): Element | null {
  for (const item of event.composedPath()) {
    if (!(item instanceof Element)) continue;
    if (item.getAttribute('data-talmeh-bridge') === 'target-outline') continue;
    if (item.closest('talmeh-authoring-panel')) return null;
    if (item === item.ownerDocument.documentElement || item === item.ownerDocument.body) continue;
    return item;
  }
  return null;
}
