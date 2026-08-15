import type { AuthoringPanelLayoutMode } from '@lodariq/schema';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { createElement as createLucideElement } from 'lucide';
import {
  AUTHORING_HOST_LAYER_STYLE_ID,
  AUTHORING_PANEL_LAYOUT_ATTRIBUTE,
  AUTHORING_PANEL_MINIMIZED_ATTRIBUTE,
  AUTHORING_PANEL_OPEN_ATTRIBUTE,
  AUTHORING_TARGET_PICKING_ATTRIBUTE,
  LOCAL_AUTHORING_TRIGGER_SELECTOR,
} from './panel-attributes';
import {
  AUTHORING_COLLAPSED_PANEL_HEIGHT,
  AUTHORING_PANEL_DRAG_THRESHOLD,
  AUTHORING_PANEL_ICONS,
  AUTHORING_PANEL_KEYBOARD_OFFSETS,
  AUTHORING_PANEL_LABELS,
  AUTHORING_PANEL_LAYOUTS,
  AUTHORING_PANEL_LAYOUT_VALUES,
  AUTHORING_PANEL_ZOOM_OPTIONS,
  AUTHORING_PAGE_REVEAL_GUTTER,
  COMPACT_AUTHORING_PANEL_HEIGHT,
  COMPACT_AUTHORING_PANEL_VIEWPORT_RATIO,
  DEFAULT_AUTHORING_PANEL_HEIGHT,
  DEFAULT_AUTHORING_PANEL_LAYOUT,
  DEFAULT_AUTHORING_PANEL_WIDTH,
  MIN_AUTHORING_PANEL_HEIGHT,
  MIN_AUTHORING_PANEL_WIDTH,
  SMALL_VIEWPORT_PANEL_HEIGHT,
  TARGET_PICKING_PANEL_WIDTH,
  type AuthoringPanelGeometry,
  type AuthoringPanelIcon,
  type AuthoringPanelRestoreState,
  type AuthoringPanelZoomValue,
} from './panel-config';

type AuthoringPanelGeometryMode = 'minimized' | 'open' | 'target-picking';

export function startPanelViewportSync(host: HTMLElement): () => void {
  let previousViewportWasCompact = visibleViewportBounds(window).width <= 600;
  let desktopGeometry: AuthoringPanelGeometry | null = previousViewportWasCompact
    ? null
    : readAuthoringPanelGeometry(host);
  const sync = (): void => {
    const viewport = visibleViewportBounds(window);
    const viewportIsCompact = viewport.width <= 600;
    const mode = authoringPanelGeometryMode(host);
    if (!previousViewportWasCompact && viewportIsCompact && mode === 'open') {
      desktopGeometry = readAuthoringPanelGeometry(host);
    }
    let geometry = readAuthoringPanelGeometry(host);
    if (previousViewportWasCompact && !viewportIsCompact && mode === 'open') {
      const layout = currentAuthoringPanelLayout(host);
      geometry = layout
        ? { ...geometry, ...AUTHORING_PANEL_LAYOUTS[layout] }
        : (desktopGeometry ?? geometry);
    }
    applyClampedAuthoringPanelGeometry(host, geometry, mode);
    previousViewportWasCompact = viewportIsCompact;
  };
  window.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  scheduleAnimationFrame(sync);

  return () => {
    window.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
  };
}

export function positionInitialAuthoringPanel(host: HTMLElement): void {
  const viewport = visibleViewportBounds(window);
  const margin = authoringPanelMargin(viewport.width);
  const layout = currentAuthoringPanelLayout(host) ?? DEFAULT_AUTHORING_PANEL_LAYOUT;
  const width = authoringPanelWidth(viewport, margin, false, layout);
  const top = clamp(
    viewport.top + margin,
    viewport.top + margin,
    viewport.bottom - authoringPanelMinimumHeight(viewport.height, margin) - margin,
  );
  const height = authoringPanelHeight(viewport, top, margin, layout);
  applyClampedAuthoringPanelGeometry(
    host,
    {
      height,
      left: viewport.left + (viewport.width - width) / 2,
      top,
      width,
    },
    'open',
  );
}

function positionTargetPickingPanel(host: HTMLElement): void {
  const viewport = visibleViewportBounds(window);
  const margin = authoringPanelMargin(viewport.width);
  const width = authoringPanelWidth(viewport, margin, true);
  applyClampedAuthoringPanelGeometry(
    host,
    {
      height: AUTHORING_COLLAPSED_PANEL_HEIGHT,
      left: viewport.left + (viewport.width - width) / 2,
      top: viewport.bottom - AUTHORING_COLLAPSED_PANEL_HEIGHT - margin,
      width,
    },
    'target-picking',
  );
}

function authoringPanelMargin(viewportWidth: number): number {
  return viewportWidth <= 600 ? 12 : 16;
}

export function authoringPanelLayoutMode(
  value: string | undefined,
): AuthoringPanelLayoutMode | null {
  return value && AUTHORING_PANEL_LAYOUT_VALUES.has(value)
    ? (value as AuthoringPanelLayoutMode)
    : null;
}

export function panelZoomValue(value: string | undefined): AuthoringPanelZoomValue | null {
  return AUTHORING_PANEL_ZOOM_OPTIONS.some((option) => option.value === value)
    ? (value as AuthoringPanelZoomValue)
    : null;
}

function currentAuthoringPanelLayout(host: HTMLElement): AuthoringPanelLayoutMode | null {
  return authoringPanelLayoutMode(host.getAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE) ?? undefined);
}

export function applyAuthoringPanelLayout(
  host: HTMLElement,
  layout: AuthoringPanelLayoutMode,
): void {
  const geometry = readAuthoringPanelGeometry(host);
  const size = AUTHORING_PANEL_LAYOUTS[layout];
  host.setAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE, layout);
  applyClampedAuthoringPanelGeometry(
    host,
    { ...geometry, height: size.height, width: size.width },
    authoringPanelGeometryMode(host),
  );
}

function authoringPanelWidth(
  viewport: ReturnType<typeof visibleViewportBounds>,
  margin: number,
  targetPicking: boolean,
  layout: AuthoringPanelLayoutMode = DEFAULT_AUTHORING_PANEL_LAYOUT,
): number {
  const horizontalReserve =
    viewport.width <= 600 || targetPicking
      ? margin * 2
      : Math.max(margin * 2, AUTHORING_PAGE_REVEAL_GUTTER);
  const availableWidth = Math.max(0, viewport.width - horizontalReserve);
  let preferredWidth: number = AUTHORING_PANEL_LAYOUTS[layout].width;
  if (viewport.width <= 600) preferredWidth = AUTHORING_PANEL_LAYOUTS.compact.width;
  if (targetPicking) preferredWidth = TARGET_PICKING_PANEL_WIDTH;
  return Math.min(Math.max(MIN_AUTHORING_PANEL_WIDTH, preferredWidth), availableWidth);
}

function authoringPanelMinimumHeight(viewportHeight: number, margin: number): number {
  return Math.min(
    MIN_AUTHORING_PANEL_HEIGHT,
    Math.max(SMALL_VIEWPORT_PANEL_HEIGHT, viewportHeight - margin * 2),
  );
}

function authoringPanelGeometryMode(host: HTMLElement): AuthoringPanelGeometryMode {
  if (host.hasAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE)) return 'target-picking';
  if (host.hasAttribute(AUTHORING_PANEL_MINIMIZED_ATTRIBUTE)) return 'minimized';
  return 'open';
}

export function readAuthoringPanelGeometry(host: HTMLElement): AuthoringPanelGeometry {
  const rect = host.getBoundingClientRect();
  return {
    height: rect.height || pixelStyleValue(host.style.height) || DEFAULT_AUTHORING_PANEL_HEIGHT,
    left: rect.left || pixelStyleValue(host.style.left),
    top: rect.top || pixelStyleValue(host.style.top),
    width: rect.width || pixelStyleValue(host.style.width) || DEFAULT_AUTHORING_PANEL_WIDTH,
  };
}

function pixelStyleValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function applyClampedAuthoringPanelGeometry(
  host: HTMLElement,
  geometry: AuthoringPanelGeometry,
  mode: AuthoringPanelGeometryMode,
): void {
  const viewport = visibleViewportBounds(window);
  const margin = authoringPanelMargin(viewport.width);
  const horizontalReserve =
    viewport.width <= 600 || mode === 'target-picking'
      ? margin * 2
      : Math.max(margin * 2, AUTHORING_PAGE_REVEAL_GUTTER);
  const availableWidth = Math.max(0, viewport.width - horizontalReserve);
  const availableHeight = Math.max(AUTHORING_COLLAPSED_PANEL_HEIGHT, viewport.height - margin * 2);
  let preferredWidth = Math.min(
    Math.max(MIN_AUTHORING_PANEL_WIDTH, geometry.width),
    availableWidth,
  );
  if (mode === 'target-picking') {
    preferredWidth = authoringPanelWidth(viewport, margin, true);
  } else if (viewport.width <= 600) {
    preferredWidth = authoringPanelWidth(viewport, margin, false);
  }
  let preferredHeight = AUTHORING_COLLAPSED_PANEL_HEIGHT;
  if (mode === 'open') {
    preferredHeight =
      viewport.width <= 600
        ? authoringPanelHeight(viewport, geometry.top, margin, 'compact')
        : Math.min(
            Math.max(authoringPanelMinimumHeight(viewport.height, margin), geometry.height),
            availableHeight,
          );
  }
  const minLeft = viewport.left + margin;
  const maxLeft = Math.max(minLeft, viewport.right - preferredWidth - margin);
  const minTop = viewport.top + margin;
  const maxTop = Math.max(minTop, viewport.bottom - preferredHeight - margin);

  host.style.left = `${clamp(geometry.left, minLeft, maxLeft)}px`;
  host.style.top = `${clamp(geometry.top, minTop, maxTop)}px`;
  host.style.right = 'auto';
  host.style.bottom = 'auto';
  host.style.width = `${preferredWidth}px`;
  host.style.height = `${preferredHeight}px`;
}

function authoringPanelHeight(
  viewport: ReturnType<typeof visibleViewportBounds>,
  top: number,
  margin: number,
  layout: AuthoringPanelLayoutMode = DEFAULT_AUTHORING_PANEL_LAYOUT,
): number {
  const availableHeight = Math.max(SMALL_VIEWPORT_PANEL_HEIGHT, viewport.bottom - top - margin);
  const preferredHeight =
    viewport.width <= 600
      ? Math.min(
          COMPACT_AUTHORING_PANEL_HEIGHT,
          Math.max(
            SMALL_VIEWPORT_PANEL_HEIGHT,
            viewport.height * COMPACT_AUTHORING_PANEL_VIEWPORT_RATIO,
          ),
        )
      : AUTHORING_PANEL_LAYOUTS[layout].height;
  return Math.min(preferredHeight, availableHeight);
}

export function attachPanelDrag(
  host: HTMLElement,
  panelDragSurface: HTMLElement | null,
  keyboardHandle: HTMLElement | null,
): () => void {
  if (!panelDragSurface) return () => {};
  let drag: {
    pointerId: number | 'mouse';
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null = null;
  let dragShield: HTMLElement | null = null;

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.moved && distance < AUTHORING_PANEL_DRAG_THRESHOLD) return;
    drag.moved = true;
    dragShield ??= createAuthoringDragShield(host.ownerDocument);
    panelDragSurface.dataset['lodariqAuthoringDragging'] = 'true';
    event.preventDefault();
    moveAuthoringPanel(host, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (drag || event.button !== 0) return;
    if (
      (event.target as Element | null)?.closest(
        'button, input, textarea, select, summary, details, a, [role="combobox"]',
      )
    )
      return;
    const rect = host.getBoundingClientRect();
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    drag = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };

    if (pointerId === 'mouse') {
      ownerWindow.addEventListener('mousemove', move, true);
      ownerWindow.addEventListener('mouseup', finish, true);
      return;
    }

    panelDragSurface.setPointerCapture?.(pointerId);
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', finish, true);
    ownerWindow.addEventListener('pointercancel', finish, true);
  };

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!drag) return;
    if ('pointerId' in event && drag.pointerId !== event.pointerId) return;
    if (!('pointerId' in event) && drag.pointerId !== 'mouse') return;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = drag.pointerId;
    if (pointerId === 'mouse') {
      ownerWindow.removeEventListener('mousemove', move, true);
      ownerWindow.removeEventListener('mouseup', finish, true);
    } else {
      panelDragSurface.releasePointerCapture?.(pointerId);
      ownerWindow.removeEventListener('pointermove', move, true);
      ownerWindow.removeEventListener('pointerup', finish, true);
      ownerWindow.removeEventListener('pointercancel', finish, true);
    }
    dragShield?.remove();
    dragShield = null;
    delete panelDragSurface.dataset['lodariqAuthoringDragging'];
    drag = null;
  };

  const moveWithKeyboard = (event: KeyboardEvent): void => {
    if ((event.target as Element | null)?.matches('input, textarea, select')) return;
    const offset = AUTHORING_PANEL_KEYBOARD_OFFSETS[event.key];
    if (!offset) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const distance = event.shiftKey ? 48 : 16;
    moveAuthoringPanel(host, rect.left + offset.x * distance, rect.top + offset.y * distance);
  };

  panelDragSurface.addEventListener('pointerdown', start);
  panelDragSurface.addEventListener('mousedown', start);
  keyboardHandle?.addEventListener('keydown', moveWithKeyboard);

  return () => {
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    ownerWindow.removeEventListener('mousemove', move, true);
    ownerWindow.removeEventListener('mouseup', finish, true);
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', finish, true);
    ownerWindow.removeEventListener('pointercancel', finish, true);
    panelDragSurface.removeEventListener('pointerdown', start);
    panelDragSurface.removeEventListener('mousedown', start);
    keyboardHandle?.removeEventListener('keydown', moveWithKeyboard);
    dragShield?.remove();
    dragShield = null;
    delete panelDragSurface.dataset['lodariqAuthoringDragging'];
    drag = null;
  };
}

export function attachPanelResize(
  host: HTMLElement,
  resizeHandle: HTMLButtonElement | null,
  onResize: () => void,
): () => void {
  if (!resizeHandle) return () => {};
  let resize: {
    height: number;
    left: number;
    pointerId: number | 'mouse';
    startHeight: number;
    startWidth: number;
    startX: number;
    startY: number;
    top: number;
    width: number;
  } | null = null;
  let resizeFrame: number | null = null;
  let resizeShield: HTMLElement | null = null;

  const cancelResizeFrame = (): void => {
    if (resizeFrame === null) return;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    if (typeof ownerWindow.cancelAnimationFrame === 'function') {
      ownerWindow.cancelAnimationFrame(resizeFrame);
    } else {
      ownerWindow.clearTimeout(resizeFrame);
    }
    resizeFrame = null;
  };

  const flushResize = (): void => {
    resizeFrame = null;
    if (!resize) return;
    applyClampedAuthoringPanelGeometry(
      host,
      {
        height: resize.height,
        left: resize.left,
        top: resize.top,
        width: resize.width,
      },
      authoringPanelGeometryMode(host),
    );
  };

  const scheduleResize = (): void => {
    if (resizeFrame !== null) return;
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    resizeFrame =
      typeof ownerWindow.requestAnimationFrame === 'function'
        ? ownerWindow.requestAnimationFrame(flushResize)
        : ownerWindow.setTimeout(flushResize, 0);
  };

  const applyKeyboardResize = (width: number, height: number): void => {
    host.setAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE, 'custom');
    const geometry = readAuthoringPanelGeometry(host);
    applyClampedAuthoringPanelGeometry(
      host,
      { ...geometry, height, width },
      authoringPanelGeometryMode(host),
    );
    onResize();
  };

  const updatePendingResize = (event: MouseEvent | PointerEvent): void => {
    if (!resize) return;
    resize.width = resize.startWidth + event.clientX - resize.startX;
    resize.height = resize.startHeight + event.clientY - resize.startY;
  };

  const move = (event: MouseEvent | PointerEvent): void => {
    if (!resize) return;
    if ('pointerId' in event && resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    resizeShield ??= createAuthoringDragShield(host.ownerDocument, 'nwse-resize');
    resizeHandle.dataset['lodariqAuthoringResizing'] = 'true';
    updatePendingResize(event);
    scheduleResize();
  };

  const finish = (event: MouseEvent | PointerEvent): void => {
    if (!resize) return;
    if ('pointerId' in event && resize.pointerId !== event.pointerId) return;
    updatePendingResize(event);
    cancelResizeFrame();
    flushResize();
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = resize.pointerId;
    ownerWindow.removeEventListener('mousemove', move, true);
    ownerWindow.removeEventListener('mouseup', finish, true);
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', finish, true);
    ownerWindow.removeEventListener('pointercancel', finish, true);
    if (pointerId !== 'mouse') {
      resizeHandle.releasePointerCapture?.(pointerId);
    }
    resizeShield?.remove();
    resizeShield = null;
    delete resizeHandle.dataset['lodariqAuthoringResizing'];
    resize = null;
    onResize();
  };

  const start = (event: MouseEvent | PointerEvent): void => {
    if (resize || event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    const pointerId = 'pointerId' in event ? event.pointerId : 'mouse';
    host.setAttribute(AUTHORING_PANEL_LAYOUT_ATTRIBUTE, 'custom');
    resize = {
      height: rect.height,
      left: rect.left,
      pointerId,
      startHeight: rect.height,
      startWidth: rect.width,
      startX: event.clientX,
      startY: event.clientY,
      top: rect.top,
      width: rect.width,
    };
    if (pointerId !== 'mouse') resizeHandle.setPointerCapture?.(pointerId);
    ownerWindow.addEventListener('mousemove', move, true);
    ownerWindow.addEventListener('mouseup', finish, true);
    ownerWindow.addEventListener('pointermove', move, true);
    ownerWindow.addEventListener('pointerup', finish, true);
    ownerWindow.addEventListener('pointercancel', finish, true);
  };

  const resizeWithKeyboard = (event: KeyboardEvent): void => {
    const offset = AUTHORING_PANEL_KEYBOARD_OFFSETS[event.key];
    if (!offset) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const distance = event.shiftKey ? 40 : 8;
    applyKeyboardResize(rect.width + offset.x * distance, rect.height + offset.y * distance);
  };

  resizeHandle.addEventListener('pointerdown', start);
  resizeHandle.addEventListener('mousedown', start);
  resizeHandle.addEventListener('keydown', resizeWithKeyboard);

  return () => {
    const ownerWindow = host.ownerDocument.defaultView ?? window;
    ownerWindow.removeEventListener('mousemove', move, true);
    ownerWindow.removeEventListener('mouseup', finish, true);
    ownerWindow.removeEventListener('pointermove', move, true);
    ownerWindow.removeEventListener('pointerup', finish, true);
    ownerWindow.removeEventListener('pointercancel', finish, true);
    resizeHandle.removeEventListener('pointerdown', start);
    resizeHandle.removeEventListener('mousedown', start);
    resizeHandle.removeEventListener('keydown', resizeWithKeyboard);
    cancelResizeFrame();
    resizeShield?.remove();
    resizeShield = null;
    delete resizeHandle.dataset['lodariqAuthoringResizing'];
    resize = null;
  };
}

function createAuthoringDragShield(doc: Document, cursor = 'grabbing'): HTMLElement {
  const shield = doc.createElement('div');
  shield.dataset['lodariqAuthoringDragShield'] = 'true';
  shield.setAttribute('aria-hidden', 'true');
  Object.assign(shield.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor,
    pointerEvents: 'auto',
    userSelect: 'none',
    background: 'transparent',
  });
  doc.body.appendChild(shield);
  return shield;
}

function moveAuthoringPanel(host: HTMLElement, left: number, top: number): void {
  const geometry = readAuthoringPanelGeometry(host);
  applyClampedAuthoringPanelGeometry(
    host,
    { ...geometry, left, top },
    authoringPanelGeometryMode(host),
  );
}

export function setPanelTargetPicking(host: HTMLElement, active: boolean, label?: string): void {
  const targetPickingLabel = host.shadowRoot?.querySelector<HTMLElement>('.target-picking-label');
  if (active) {
    host.setAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE, 'true');
    if (targetPickingLabel) {
      targetPickingLabel.textContent = label ?? AUTHORING_PANEL_LABELS.selectTarget;
    }
    positionTargetPickingPanel(host);
  } else {
    host.removeAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE);
    if (targetPickingLabel) targetPickingLabel.textContent = AUTHORING_PANEL_LABELS.selectTarget;
  }
}

export function restorePanelAfterTargetPicking(
  host: HTMLElement,
  restoreState: AuthoringPanelRestoreState | null,
  restoreFocus = true,
): void {
  host.removeAttribute(AUTHORING_TARGET_PICKING_ATTRIBUTE);
  const targetPickingLabel = host.shadowRoot?.querySelector<HTMLElement>('.target-picking-label');
  if (targetPickingLabel) targetPickingLabel.textContent = AUTHORING_PANEL_LABELS.selectTarget;
  if (!restoreState) {
    positionInitialAuthoringPanel(host);
    return;
  }
  applyClampedAuthoringPanelGeometry(host, restoreState.geometry, 'open');
  if (restoreFocus) schedulePanelFocusRestore(restoreState.focusedElement, null);
}

export function activePanelFocusElement(shadow: ShadowRoot): HTMLElement | null {
  const shadowActiveElement = shadow.activeElement;
  if (shadowActiveElement instanceof HTMLElement) return shadowActiveElement;
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

export function schedulePanelFocusRestore(
  focusedElement: HTMLElement | null,
  fallback: HTMLElement | null,
): void {
  scheduleAnimationFrame(() => {
    const focusTarget = focusedElement?.isConnected ? focusedElement : fallback;
    focusTarget?.focus({ preventScroll: true });
  });
}

export function setMinimizeButtonState(
  button: HTMLButtonElement | null,
  iconContainer: HTMLElement | null,
  minimized: boolean,
): void {
  if (!button) return;
  const actionLabel = minimized ? AUTHORING_PANEL_LABELS.restore : AUTHORING_PANEL_LABELS.minimize;
  button.setAttribute('aria-label', actionLabel);
  button.dataset['tooltip'] = actionLabel;
  button.setAttribute('title', actionLabel);
  const label = button.querySelector<HTMLElement>('[data-panel-minimize-label]');
  if (label) label.textContent = minimized ? 'Restore' : 'Minimize';
  setAuthoringPanelIcon(iconContainer, minimized ? 'maximize' : 'minimize');
}

export function setAuthoringPanelIcon(
  container: HTMLElement | null,
  icon: AuthoringPanelIcon,
): void {
  if (!container) return;
  const svg = createLucideElement(AUTHORING_PANEL_ICONS[icon], {
    'aria-hidden': 'true',
    focusable: 'false',
    height: '18',
    width: '18',
  });
  const ownedSvg =
    svg.ownerDocument === container.ownerDocument
      ? svg
      : (container.ownerDocument.importNode(svg, true) as SVGElement);
  container.replaceChildren(ownedSvg);
}

function visibleViewportBounds(ownerWindow: Window): {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
} {
  const viewport = ownerWindow.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? ownerWindow.innerWidth;
  const height = viewport?.height ?? ownerWindow.innerHeight;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

export function setAuthoringPanelOpenState(open: boolean): void {
  if (open) {
    ensureAuthoringHostLayerStyles(document);
    document.documentElement.setAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(AUTHORING_PANEL_OPEN_ATTRIBUTE);
  }
  setAuthoringTriggerPanelState(open ? 'open' : 'closed');
}

export function setAuthoringTriggerPanelState(state: 'closed' | 'minimized' | 'open'): void {
  document
    .querySelectorAll<HTMLButtonElement>(LOCAL_AUTHORING_TRIGGER_SELECTOR)
    .forEach((button) => {
      const defaultAriaLabel =
        button.dataset['lodariqDefaultAriaLabel'] ??
        button.getAttribute('aria-label') ??
        'Open Lodariq actions';
      button.dataset['lodariqDefaultAriaLabel'] = defaultAriaLabel;
      button.dataset['lodariqAuthoringPanelExpanded'] = state === 'open' ? 'true' : 'false';
      button.setAttribute('aria-expanded', 'false');

      const launcher = button.closest<HTMLElement>('[data-lodariq-creator-launcher="true"]');
      if (state === 'closed') {
        button.setAttribute('aria-label', defaultAriaLabel);
        button.setAttribute('title', defaultAriaLabel);
        if (launcher) delete launcher.dataset['lodariqAuthoringPanelState'];
        return;
      }

      const actionLabel =
        state === 'open' ? 'Minimize Lodariq authoring' : 'Restore Lodariq authoring';
      button.setAttribute('aria-label', actionLabel);
      button.setAttribute('title', actionLabel);
      if (launcher) launcher.dataset['lodariqAuthoringPanelState'] = state;
    });
}

function scheduleAnimationFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 0);
  }
}

function ensureAuthoringHostLayerStyles(doc: Document): void {
  if (doc.getElementById(AUTHORING_HOST_LAYER_STYLE_ID)) return;
  const style = createNonceStyleElement(
    doc,
    `
    :root[${AUTHORING_PANEL_OPEN_ATTRIBUTE}="true"] lodariq-tour {
      --lodariq-tour-z-index: 2147483644;
    }
  `,
  );
  style.id = AUTHORING_HOST_LAYER_STYLE_ID;
  doc.head.appendChild(style);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
