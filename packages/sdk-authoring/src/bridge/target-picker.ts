import type { ElementFingerprint } from '@talmeh/schema';
import { accessibleNameOf, createNonceStyleElement, roleOf } from '@talmeh/schema/dom';
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
  const veil = doc.createElement('div');
  veil.dataset['talmehBridge'] = 'target-veil';
  veil.setAttribute('aria-hidden', 'true');
  Object.assign(veil.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483644',
    pointerEvents: 'none',
    background: 'rgba(15, 23, 42, 0.06)',
  });

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

  const label = doc.createElement('div');
  label.dataset['talmehBridge'] = 'target-label';
  label.setAttribute('aria-hidden', 'true');
  Object.assign(label.style, {
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'none',
    display: 'none',
    maxWidth: '240px',
    padding: '6px 8px',
    borderRadius: '6px',
    background: '#172033',
    color: '#fff',
    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.24)',
    font: '12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    whiteSpace: 'pre-line',
  });

  const labelText = doc.createElement('div');
  labelText.dataset['talmehBridge'] = 'target-label-text';
  Object.assign(labelText.style, { pointerEvents: 'none' });
  const controls = doc.createElement('div');
  controls.dataset['talmehBridge'] = 'target-controls';
  Object.assign(controls.style, {
    position: 'fixed',
    left: '50%',
    bottom: '16px',
    transform: 'translateX(-50%)',
    zIndex: '2147483646',
    pointerEvents: 'auto',
    display: 'none',
    gap: '8px',
    width: 'min(340px, calc(100vw - 24px))',
    padding: '10px',
    border: '1px solid rgba(203, 213, 225, 0.92)',
    borderRadius: '10px',
    background: '#fff',
    color: '#172033',
    boxShadow: '0 10px 26px rgba(15, 23, 42, 0.24)',
    whiteSpace: 'normal',
    font: '12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  });
  controls.innerHTML = `
    <div data-talmeh-bridge="target-card-header" style="display:grid; gap:2px;">
      <strong data-talmeh-bridge="target-card-title" style="font-size:13px;">Pick a target</strong>
      <span data-talmeh-bridge="target-card-copy" style="color:#64748b;">Select the product element this step should point to. Press Escape to cancel.</span>
    </div>
    <div data-talmeh-bridge="target-card-actions" style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:6px;">
      <button type="button" data-talmeh-bridge="target-control" data-action="deeper">Select inner element</button>
      <button type="button" data-talmeh-bridge="target-control" data-action="parent">Select parent</button>
      <button type="button" data-talmeh-bridge="target-control" data-action="click-through">Interact with page</button>
    </div>
  `;
  for (const button of controls.querySelectorAll<HTMLButtonElement>('button')) {
    Object.assign(button.style, {
      minHeight: '32px',
      padding: '5px 7px',
      border: '1px solid #dce2ea',
      borderRadius: '7px',
      background: '#f8fafc',
      color: '#172033',
      font: 'inherit',
      fontWeight: '650',
      cursor: 'pointer',
    });
  }
  label.appendChild(labelText);

  const cursor = createNonceStyleElement(
    doc,
    `
    html[data-talmeh-target-picker="active"],
    html[data-talmeh-target-picker="active"] body,
    html[data-talmeh-target-picker="active"] body * {
      cursor: crosshair !important;
    }

    html[data-talmeh-target-picker="blocked"],
    html[data-talmeh-target-picker="blocked"] body,
    html[data-talmeh-target-picker="blocked"] body * {
      cursor: not-allowed !important;
    }
  `,
  );
  const previousPickerState = doc.documentElement.getAttribute('data-talmeh-target-picker');
  doc.documentElement.setAttribute('data-talmeh-target-picker', 'active');
  doc.head.appendChild(cursor);
  doc.body.appendChild(veil);
  doc.body.appendChild(outline);
  doc.body.appendChild(label);
  doc.body.appendChild(controls);

  let currentCandidates: Element[] = [];
  let currentCandidateKey = '';
  let currentIndex = 0;
  let current: Element | null = null;
  let clickThroughNext = false;
  let done = false;

  const cleanup = (): void => {
    if (done) return;
    done = true;
    doc.removeEventListener('pointerover', onPointer, true);
    doc.removeEventListener('pointermove', onPointer, true);
    doc.removeEventListener('pointerdown', suppressProductEvent, true);
    doc.removeEventListener('pointerup', suppressProductEvent, true);
    doc.removeEventListener('mousedown', suppressProductEvent, true);
    doc.removeEventListener('mouseup', suppressProductEvent, true);
    doc.removeEventListener('click', onClick, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    controls.removeEventListener('click', onControlClick);
    if (previousPickerState === null) {
      doc.documentElement.removeAttribute('data-talmeh-target-picker');
    } else {
      doc.documentElement.setAttribute('data-talmeh-target-picker', previousPickerState);
    }
    veil.remove();
    outline.remove();
    label.remove();
    controls.remove();
    cursor.remove();
  };

  const cancel = (): void => {
    if (done) return;
    cleanup();
    options.onCancel?.();
  };

  function onPointer(event: Event): void {
    if (isBridgeEvent(event)) return;
    const target = targetsFromEvent(event);
    if (target.blocked) {
      doc.documentElement.setAttribute('data-talmeh-target-picker', 'blocked');
      outline.style.display = 'none';
      controls.style.display = 'none';
      showLabel('Talmeh UI\nCannot attach', event);
      return;
    }
    doc.documentElement.setAttribute('data-talmeh-target-picker', 'active');
    if (!target.elements.length) {
      hideTargetUi();
      return;
    }
    const key = candidateKey(target.elements);
    if (key !== currentCandidateKey) {
      currentCandidateKey = key;
      currentIndex = 0;
    } else {
      currentIndex = Math.min(currentIndex, target.elements.length - 1);
    }
    currentCandidates = target.elements;
    renderCurrentTarget();
  }

  function renderCurrentTarget(): void {
    current = currentCandidates[currentIndex] ?? null;
    if (!current) {
      hideTargetUi();
      return;
    }
    const rect = current.getBoundingClientRect();
    outline.style.display = 'block';
    outline.style.left = `${rect.left}px`;
    outline.style.top = `${rect.top}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    showLabel(hoverLabelFor(current), rect);
    showControls();
    updateControlState();
  }

  function hideTargetUi(): void {
    outline.style.display = 'none';
    label.style.display = 'none';
    controls.style.display = 'none';
  }

  function showLabel(text: string, anchor: Event | RectAnchor): void {
    const point = labelPoint(anchor);
    labelText.textContent = text;
    label.style.display = 'block';
    label.style.left = `${point.x}px`;
    label.style.top = `${point.y}px`;
  }

  function showControls(): void {
    controls.style.display = 'grid';
  }

  function updateControlState(): void {
    controls.querySelector<HTMLButtonElement>('[data-action="deeper"]')!.disabled =
      currentIndex <= 0;
    controls.querySelector<HTMLButtonElement>('[data-action="parent"]')!.disabled =
      currentIndex >= currentCandidates.length - 1;
  }

  function labelPoint(anchor: Event | RectAnchor): { x: number; y: number } {
    if ('left' in anchor) {
      return overlayPoint(anchor, { preferredWidth: 240, estimatedHeight: 76, offset: 8 });
    }
    if (anchor instanceof MouseEvent) {
      return { x: anchor.clientX + 12, y: anchor.clientY + 12 };
    }
    return { x: 12, y: 12 };
  }

  function overlayPoint(
    anchor: RectAnchor,
    options: { preferredWidth: number; estimatedHeight: number; offset: number },
  ): { x: number; y: number } {
    const viewportWidth = doc.defaultView?.innerWidth ?? anchor.left + options.preferredWidth;
    const viewportHeight = doc.defaultView?.innerHeight ?? anchor.top + options.estimatedHeight;
    const rightX = anchor.left + anchor.width + 8;
    if (rightX + options.preferredWidth <= viewportWidth - 8) {
      return { x: rightX, y: clamp(anchor.top + options.offset - 48, 8, viewportHeight - 48) };
    }
    const belowY = anchor.top + anchor.height + options.offset;
    if (belowY + options.estimatedHeight <= viewportHeight - 8) {
      return { x: clamp(anchor.left, 8, viewportWidth - options.preferredWidth - 8), y: belowY };
    }
    return {
      x: clamp(anchor.left, 8, viewportWidth - options.preferredWidth - 8),
      y: Math.max(8, anchor.top - options.estimatedHeight - options.offset),
    };
  }

  function hoverLabelFor(element: Element): string {
    const role = roleOf(element);
    const name = accessibleNameOf(element);
    const type = capitalize(role ?? element.tagName.toLowerCase());
    const depth =
      currentCandidates.length > 1
        ? `Target ${currentIndex + 1} of ${currentCandidates.length}`
        : undefined;
    return [type, name, depth, 'Click to attach this target'].filter(Boolean).join('\n');
  }

  function onControlClick(event: Event): void {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset['action'];
    if (action === 'parent') {
      currentIndex = Math.min(currentIndex + 1, currentCandidates.length - 1);
      renderCurrentTarget();
      return;
    }
    if (action === 'deeper') {
      currentIndex = Math.max(currentIndex - 1, 0);
      renderCurrentTarget();
      return;
    }
    if (action === 'click-through') {
      clickThroughNext = true;
      showLabel(
        'Interact with page\nNext product click will pass through',
        current?.getBoundingClientRect() ?? { left: 12, top: 56, width: 0, height: 0 },
      );
      controls.style.display = 'none';
    }
  }

  function suppressProductEvent(event: Event): void {
    if (isBridgeEvent(event) || clickThroughNext || clickThroughModifier(event)) return;
    if (!targetsFromEvent(event).elements.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onClick(event: MouseEvent): void {
    if (isBridgeEvent(event)) return;
    if (clickThroughNext || clickThroughModifier(event)) {
      clickThroughNext = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = current ?? targetsFromEvent(event).elements[0];
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
  controls.addEventListener('click', onControlClick);

  return { cancel };
}

interface TargetFromEventResult {
  elements: Element[];
  blocked: boolean;
}

interface RectAnchor {
  left: number;
  top: number;
  width: number;
  height: number;
}

function targetsFromEvent(event: Event): TargetFromEventResult {
  const elements: Element[] = [];
  for (const item of event.composedPath()) {
    if (!(item instanceof Element)) continue;
    if (item.hasAttribute('data-talmeh-bridge')) continue;
    if (item.closest('talmeh-authoring-panel')) return { elements: [], blocked: true };
    if (item === item.ownerDocument.documentElement || item === item.ownerDocument.body) continue;
    elements.push(item);
  }
  return { elements, blocked: false };
}

function isBridgeEvent(event: Event): boolean {
  return event.composedPath().some((item) => {
    return item instanceof Element && item.hasAttribute('data-talmeh-bridge');
  });
}

function clickThroughModifier(event: Event): boolean {
  return event instanceof MouseEvent && event.altKey;
}

function candidateKey(elements: Element[]): string {
  return elements.map((element) => elementPathLabel(element)).join('>');
}

function elementPathLabel(element: Element): string {
  const stable = element.getAttribute('data-talmeh-id') ?? element.id;
  return `${element.tagName.toLowerCase()}${stable ? `#${stable}` : ''}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
