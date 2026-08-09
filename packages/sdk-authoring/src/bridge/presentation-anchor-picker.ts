import type { PresentationAnchor } from '@lodariq/schema';
import { CREATOR_CHROME_FONT_STACK, CREATOR_CHROME_TOKENS } from '../creator-chrome-tokens';

const PICKER_Z_INDEX = 2_147_483_645;
const MEANINGFUL_DRAG_DISTANCE = 6;
const MEANINGFUL_REGION_EDGE = 4;
const KEYBOARD_POINT_STEP = 0.02;
const KEYBOARD_POINT_LARGE_STEP = 0.1;
const RATIO_PRECISION = 8;

type ExactPresentationAnchor = Extract<PresentationAnchor, { kind: 'point' | 'region' }>;
type RegionPresentationAnchor = Extract<PresentationAnchor, { kind: 'region' }>;

export interface PresentationAnchorPicker {
  cancel: () => void;
}

export interface PresentationAnchorPickerOptions {
  owner: Element;
  current?: PresentationAnchor;
  onPick: (presentationAnchor: ExactPresentationAnchor) => void;
  onCancel?: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface PointerGesture {
  ownerRect: DOMRect;
  pointerId: number | null;
  start: Point;
}

/**
 * Direct-manipulation picker for presentation geometry inside an already
 * resolved owner. It never discovers or changes the owning target.
 */
export function startPresentationAnchorPicker(
  options: PresentationAnchorPickerOptions,
): PresentationAnchorPicker {
  const doc = options.owner.ownerDocument;
  const ownerWindow = doc.defaultView ?? window;
  const initialOwnerRoot = options.owner.getRootNode();
  const initialOwnerRect = readableOwnerRect(options.owner);
  const outline = createOwnerOutline(doc);
  const selectedRegion = createSelectedRegion(doc);
  const pointMarker = createPointMarker(doc);
  const guidance = createGuidance(doc);
  const status = guidance.querySelector<HTMLElement>(
    '[data-lodariq-bridge="presentation-anchor-status"]',
  )!;
  const cancelButton = guidance.querySelector<HTMLButtonElement>(
    '[data-action="cancel-presentation-anchor"]',
  )!;
  const previousPickerState = doc.documentElement.getAttribute(
    'data-lodariq-presentation-anchor-picker',
  );

  outline.append(selectedRegion, pointMarker);
  doc.documentElement.setAttribute('data-lodariq-presentation-anchor-picker', 'active');
  doc.body.append(outline, guidance);

  let done = false;
  let pointerGesture: PointerGesture | null = null;
  let currentOwnerRect = initialOwnerRect;
  let keyboardPoint = initialKeyboardPoint(options.current);
  let scheduledFrame: number | null = null;
  const resizeObserver = createResizeObserver(ownerWindow, scheduleOutlineUpdate);
  const mutationObserver = createMutationObserver(ownerWindow, (records) => {
    const customerPageChanged = records.some(
      (record) => !outline.contains(record.target) && !guidance.contains(record.target),
    );
    if (customerPageChanged) scheduleOutlineUpdate();
  });
  const visibilityMutationOptions: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['aria-hidden', 'class', 'hidden', 'inert', 'style'],
    childList: true,
    subtree: true,
  };

  renderOutline();
  if (done) return { cancel };
  renderCurrentAnchor(options.current);
  outline.focus({ preventScroll: true });

  resizeObserver?.observe(options.owner);
  mutationObserver?.observe(doc.documentElement, visibilityMutationOptions);
  for (const shadowRoot of ownerShadowRootChain(options.owner)) {
    mutationObserver?.observe(shadowRoot, visibilityMutationOptions);
  }

  function cleanup(): void {
    if (done) return;
    done = true;
    if (scheduledFrame !== null) ownerWindow.cancelAnimationFrame?.(scheduledFrame);
    scheduledFrame = null;
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    ownerWindow.removeEventListener('resize', scheduleOutlineUpdate);
    ownerWindow.removeEventListener('scroll', scheduleOutlineUpdate, true);
    doc.removeEventListener('keydown', onDocumentKeyDown, true);
    outline.removeEventListener('keydown', onOutlineKeyDown);
    outline.removeEventListener('pointerdown', onPointerDown);
    outline.removeEventListener('pointermove', onPointerMove);
    outline.removeEventListener('pointerup', onPointerUp);
    outline.removeEventListener('pointercancel', onPointerCancel);
    cancelButton.removeEventListener('click', cancel);
    if (previousPickerState === null) {
      doc.documentElement.removeAttribute('data-lodariq-presentation-anchor-picker');
    } else {
      doc.documentElement.setAttribute(
        'data-lodariq-presentation-anchor-picker',
        previousPickerState,
      );
    }
    outline.remove();
    guidance.remove();
  }

  function cancel(): void {
    if (done) return;
    cleanup();
    options.onCancel?.();
  }

  function commit(presentationAnchor: ExactPresentationAnchor): void {
    if (done) return;
    cleanup();
    options.onPick(presentationAnchor);
  }

  function scheduleOutlineUpdate(): void {
    if (done || scheduledFrame !== null) return;
    if (!options.owner.isConnected) {
      cancel();
      return;
    }
    if (typeof ownerWindow.requestAnimationFrame !== 'function') {
      renderOutline();
      return;
    }
    scheduledFrame = ownerWindow.requestAnimationFrame(() => {
      scheduledFrame = null;
      renderOutline();
    });
  }

  function renderOutline(): void {
    if (!options.owner.isConnected || options.owner.getRootNode() !== initialOwnerRoot) {
      cancel();
      return;
    }
    const nextOwnerRect = visibleOwnerRect(options.owner);
    if (!nextOwnerRect) {
      cancel();
      return;
    }
    if (pointerGesture && rectGeometryChanged(currentOwnerRect, nextOwnerRect)) {
      if (pointerGesture.pointerId !== null) {
        outline.releasePointerCapture?.(pointerGesture.pointerId);
      }
      pointerGesture = null;
      renderCurrentAnchor(options.current);
      status.textContent = 'The element moved. Start the click or drag again.';
    }
    currentOwnerRect = nextOwnerRect;
    Object.assign(outline.style, {
      left: `${currentOwnerRect.left}px`,
      top: `${currentOwnerRect.top}px`,
      width: `${currentOwnerRect.width}px`,
      height: `${currentOwnerRect.height}px`,
    });
    positionGuidance(guidance, currentOwnerRect, doc);
  }

  function renderCurrentAnchor(anchor: PresentationAnchor | undefined): void {
    if (anchor?.kind === 'region') {
      renderRegion(selectedRegion, anchor);
      pointMarker.style.display = 'none';
      keyboardPoint = {
        x: boundedRatio(anchor.xRatio + anchor.widthRatio / 2),
        y: boundedRatio(anchor.yRatio + anchor.heightRatio / 2),
      };
      return;
    }
    if (anchor?.kind === 'point') {
      keyboardPoint = { x: boundedRatio(anchor.xRatio), y: boundedRatio(anchor.yRatio) };
    }
    selectedRegion.style.display = 'none';
    renderPoint(pointMarker, keyboardPoint);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || pointerGesture) return;
    const ownerRect = visibleOwnerRect(options.owner);
    if (!ownerRect) {
      cancel();
      return;
    }
    const start = clampedPoint(event.clientX, event.clientY, ownerRect);
    pointerGesture = {
      ownerRect,
      pointerId: Number.isInteger(event.pointerId) ? event.pointerId : null,
      start,
    };
    if (pointerGesture.pointerId !== null) {
      outline.setPointerCapture?.(pointerGesture.pointerId);
    }
    const normalizedStart = normalizedPoint(start, ownerRect);
    keyboardPoint = { x: normalizedStart.xRatio, y: normalizedStart.yRatio };
    selectedRegion.style.display = 'none';
    renderPoint(pointMarker, keyboardPoint);
    status.textContent = 'Drag to mark an area, or release to use this point.';
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerMove(event: PointerEvent): void {
    const gesture = pointerGesture;
    if (!gesture || !matchesPointer(event, gesture.pointerId)) return;
    const current = clampedPoint(event.clientX, event.clientY, gesture.ownerRect);
    const preview = regionFromPoints(gesture.start, current, gesture.ownerRect);
    pointMarker.style.display = 'none';
    renderRegion(selectedRegion, preview);
    event.preventDefault();
    event.stopPropagation();
  }

  function onPointerUp(event: PointerEvent): void {
    const gesture = pointerGesture;
    if (!gesture || !matchesPointer(event, gesture.pointerId)) return;
    pointerGesture = null;
    if (gesture.pointerId !== null) outline.releasePointerCapture?.(gesture.pointerId);
    const end = clampedPoint(event.clientX, event.clientY, gesture.ownerRect);
    const width = Math.abs(end.x - gesture.start.x);
    const height = Math.abs(end.y - gesture.start.y);
    const distance = Math.hypot(width, height);
    event.preventDefault();
    event.stopPropagation();

    if (
      distance >= MEANINGFUL_DRAG_DISTANCE &&
      width >= MEANINGFUL_REGION_EDGE &&
      height >= MEANINGFUL_REGION_EDGE
    ) {
      commit(regionFromPoints(gesture.start, end, gesture.ownerRect));
      return;
    }
    commit({ kind: 'point', ...normalizedPoint(end, gesture.ownerRect) });
  }

  function onPointerCancel(event: PointerEvent): void {
    const gesture = pointerGesture;
    if (!gesture || !matchesPointer(event, gesture.pointerId)) return;
    pointerGesture = null;
    if (gesture.pointerId !== null) outline.releasePointerCapture?.(gesture.pointerId);
    renderCurrentAnchor(options.current);
    status.textContent = defaultGuidance();
  }

  function onOutlineKeyDown(event: KeyboardEvent): void {
    const movement = keyboardMovement(event.key);
    if (movement) {
      const step = event.shiftKey ? KEYBOARD_POINT_LARGE_STEP : KEYBOARD_POINT_STEP;
      keyboardPoint = {
        x: boundedRatio(keyboardPoint.x + movement.x * step),
        y: boundedRatio(keyboardPoint.y + movement.y * step),
      };
      selectedRegion.style.display = 'none';
      renderPoint(pointMarker, keyboardPoint);
      status.textContent = 'Point moved. Press Enter to use it, or Escape to cancel.';
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    commit({ kind: 'point', xRatio: keyboardPoint.x, yRatio: keyboardPoint.y });
  }

  function onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
  }

  ownerWindow.addEventListener('resize', scheduleOutlineUpdate);
  ownerWindow.addEventListener('scroll', scheduleOutlineUpdate, true);
  doc.addEventListener('keydown', onDocumentKeyDown, true);
  outline.addEventListener('keydown', onOutlineKeyDown);
  outline.addEventListener('pointerdown', onPointerDown);
  outline.addEventListener('pointermove', onPointerMove);
  outline.addEventListener('pointerup', onPointerUp);
  outline.addEventListener('pointercancel', onPointerCancel);
  cancelButton.addEventListener('click', cancel);

  return { cancel };
}

function createOwnerOutline(doc: Document): HTMLDivElement {
  const outline = doc.createElement('div');
  outline.dataset['lodariqBridge'] = 'presentation-anchor-outline';
  outline.tabIndex = 0;
  outline.setAttribute('role', 'group');
  outline.setAttribute('aria-label', 'Choose an exact area inside the selected element');
  outline.setAttribute(
    'aria-describedby',
    'lodariq-presentation-anchor-instructions lodariq-presentation-anchor-status',
  );
  outline.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape');
  Object.assign(outline.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX),
    boxSizing: 'border-box',
    overflow: 'hidden',
    border: `2px solid ${CREATOR_CHROME_TOKENS.focus}`,
    borderRadius: '8px',
    background: 'rgba(55, 107, 255, 0.05)',
    boxShadow: '0 0 0 4px rgba(55, 107, 255, 0.16)',
    cursor: 'crosshair',
    pointerEvents: 'auto',
    touchAction: 'none',
    userSelect: 'none',
  });
  return outline;
}

function createSelectedRegion(doc: Document): HTMLDivElement {
  const region = doc.createElement('div');
  region.dataset['lodariqBridge'] = 'presentation-anchor-region';
  region.setAttribute('aria-hidden', 'true');
  Object.assign(region.style, {
    position: 'absolute',
    display: 'none',
    boxSizing: 'border-box',
    border: `2px solid ${CREATOR_CHROME_TOKENS.action}`,
    borderRadius: '6px',
    background: 'rgba(11, 102, 85, 0.2)',
    boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.82) inset',
    pointerEvents: 'none',
  });
  return region;
}

function createPointMarker(doc: Document): HTMLDivElement {
  const marker = doc.createElement('div');
  marker.dataset['lodariqBridge'] = 'presentation-anchor-point';
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, {
    position: 'absolute',
    width: '16px',
    height: '16px',
    border: '3px solid #ffffff',
    borderRadius: '999px',
    background: CREATOR_CHROME_TOKENS.action,
    boxShadow: '0 2px 8px rgba(12, 33, 28, 0.28)',
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
  });
  return marker;
}

function createGuidance(doc: Document): HTMLDivElement {
  const guidance = doc.createElement('div');
  guidance.dataset['lodariqBridge'] = 'presentation-anchor-guidance';
  Object.assign(guidance.style, {
    position: 'fixed',
    zIndex: String(PICKER_Z_INDEX + 1),
    display: 'flex',
    width: 'min(440px, calc(100vw - 28px))',
    minHeight: '44px',
    boxSizing: 'border-box',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 9px 8px 14px',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '14px',
    background: CREATOR_CHROME_TOKENS.chrome,
    color: CREATOR_CHROME_TOKENS.onChrome,
    boxShadow: '0 16px 36px rgba(12, 33, 28, 0.24)',
    font: `600 12px/1.4 ${CREATOR_CHROME_FONT_STACK}`,
    pointerEvents: 'auto',
  });
  guidance.innerHTML = `
    <span style="display:grid; min-width:0; gap:1px; flex:1 1 auto;">
      <strong id="lodariq-presentation-anchor-instructions" style="font-size:12px;">Choose an exact area</strong>
      <span id="lodariq-presentation-anchor-status" data-lodariq-bridge="presentation-anchor-status" role="status" aria-live="polite">${defaultGuidance()}</span>
    </span>
    <button type="button" data-lodariq-bridge="presentation-anchor-cancel" data-action="cancel-presentation-anchor" aria-label="Cancel exact area selection">Cancel</button>
  `;
  const button = guidance.querySelector<HTMLButtonElement>('button');
  if (button) {
    Object.assign(button.style, {
      minHeight: '34px',
      flex: '0 0 auto',
      padding: '0 12px',
      border: '1px solid rgba(255, 255, 255, 0.24)',
      borderRadius: '9px',
      background: 'rgba(255, 255, 255, 0.1)',
      color: CREATOR_CHROME_TOKENS.onChrome,
      cursor: 'pointer',
      font: 'inherit',
      fontWeight: '700',
    });
  }
  return guidance;
}

function defaultGuidance(): string {
  return 'Drag for an area, click for a point, or use Arrow keys then Enter. Esc cancels.';
}

function readableOwnerRect(owner: Element): DOMRect {
  if (!owner.isConnected) throw new Error('The selected element is no longer on the page');
  const rect = visibleOwnerRect(owner);
  if (rect) return rect;
  throw new Error('The selected element has no visible area');
}

function visibleOwnerRect(owner: Element): DOMRect | null {
  if (isHiddenFromAuthoring(owner)) return null;
  const rect = owner.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function isHiddenFromAuthoring(owner: Element): boolean {
  const ownerWindow = owner.ownerDocument.defaultView;
  let current: Element | null = owner;
  while (current) {
    if (
      current.hasAttribute('hidden') ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden')?.toLowerCase() === 'true'
    ) {
      return true;
    }
    const style = ownerWindow?.getComputedStyle(current);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse' ||
      style?.contentVisibility === 'hidden' ||
      Number.parseFloat(style?.opacity ?? '1') === 0
    ) {
      return true;
    }
    const root = current.getRootNode();
    current = current.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}

function ownerShadowRootChain(owner: Element): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  let current: Element = owner;
  while (true) {
    const root = current.getRootNode();
    if (!(root instanceof ShadowRoot)) return roots;
    roots.push(root);
    current = root.host;
  }
}

function initialKeyboardPoint(current: PresentationAnchor | undefined): Point {
  if (current?.kind === 'point') {
    return { x: boundedRatio(current.xRatio), y: boundedRatio(current.yRatio) };
  }
  if (current?.kind === 'region') {
    return {
      x: boundedRatio(current.xRatio + current.widthRatio / 2),
      y: boundedRatio(current.yRatio + current.heightRatio / 2),
    };
  }
  return { x: 0.5, y: 0.5 };
}

function normalizedPoint(point: Point, ownerRect: DOMRect): { xRatio: number; yRatio: number } {
  return {
    xRatio: boundedRatio((point.x - ownerRect.left) / ownerRect.width),
    yRatio: boundedRatio((point.y - ownerRect.top) / ownerRect.height),
  };
}

function regionFromPoints(start: Point, end: Point, ownerRect: DOMRect): RegionPresentationAnchor {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  const xRatio = boundedRatio((left - ownerRect.left) / ownerRect.width);
  const yRatio = boundedRatio((top - ownerRect.top) / ownerRect.height);
  const widthRatio = boundedRatio((right - left) / ownerRect.width, 1 - xRatio);
  const heightRatio = boundedRatio((bottom - top) / ownerRect.height, 1 - yRatio);
  return { kind: 'region', xRatio, yRatio, widthRatio, heightRatio };
}

function clampedPoint(clientX: number, clientY: number, ownerRect: DOMRect): Point {
  return {
    x: clamp(clientX, ownerRect.left, ownerRect.right),
    y: clamp(clientY, ownerRect.top, ownerRect.bottom),
  };
}

function renderPoint(marker: HTMLElement, point: Point): void {
  marker.style.display = 'block';
  marker.style.left = `${boundedRatio(point.x) * 100}%`;
  marker.style.top = `${boundedRatio(point.y) * 100}%`;
}

function renderRegion(
  region: HTMLElement,
  anchor: Extract<PresentationAnchor, { kind: 'region' }>,
): void {
  const xRatio = boundedRatio(anchor.xRatio);
  const yRatio = boundedRatio(anchor.yRatio);
  region.style.display = 'block';
  region.style.left = `${xRatio * 100}%`;
  region.style.top = `${yRatio * 100}%`;
  region.style.width = `${boundedRatio(anchor.widthRatio, 1 - xRatio) * 100}%`;
  region.style.height = `${boundedRatio(anchor.heightRatio, 1 - yRatio) * 100}%`;
}

function positionGuidance(guidance: HTMLElement, ownerRect: DOMRect, doc: Document): void {
  const margin = 14;
  const clearance = 10;
  const viewportWidth = doc.defaultView?.innerWidth ?? doc.documentElement.clientWidth;
  const viewportHeight = doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight;
  const guidanceRect = guidance.getBoundingClientRect();
  const width = Math.min(guidanceRect.width || 440, Math.max(0, viewportWidth - margin * 2));
  const height = guidanceRect.height || 58;
  const preferredTop = ownerRect.top - height - clearance;
  const fallbackTop = ownerRect.bottom + clearance;
  const fitsAbove = preferredTop >= margin;
  const top = fitsAbove ? preferredTop : Math.min(fallbackTop, viewportHeight - height - margin);
  const left = clamp(ownerRect.left, margin, Math.max(margin, viewportWidth - width - margin));
  guidance.style.left = `${left}px`;
  guidance.style.top = `${Math.max(margin, top)}px`;
}

function matchesPointer(event: PointerEvent, pointerId: number | null): boolean {
  return pointerId === null || event.pointerId === pointerId;
}

function rectGeometryChanged(previous: DOMRect, next: DOMRect): boolean {
  return (
    previous.left !== next.left ||
    previous.top !== next.top ||
    previous.width !== next.width ||
    previous.height !== next.height
  );
}

function keyboardMovement(key: string): Point | null {
  if (key === 'ArrowLeft') return { x: -1, y: 0 };
  if (key === 'ArrowRight') return { x: 1, y: 0 };
  if (key === 'ArrowUp') return { x: 0, y: -1 };
  if (key === 'ArrowDown') return { x: 0, y: 1 };
  return null;
}

function boundedRatio(value: number, maximum = 1): number {
  const bounded = clamp(Number.isFinite(value) ? value : 0, 0, maximum);
  return Number(bounded.toFixed(RATIO_PRECISION));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function createResizeObserver(ownerWindow: Window, callback: () => void): ResizeObserver | null {
  const Observer = (ownerWindow as Window & { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
  return Observer ? new Observer(callback) : null;
}

function createMutationObserver(
  ownerWindow: Window,
  callback: MutationCallback,
): MutationObserver | null {
  const Observer = (ownerWindow as Window & { MutationObserver?: typeof MutationObserver })
    .MutationObserver;
  return Observer ? new Observer(callback) : null;
}
