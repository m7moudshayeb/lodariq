import {
  TOOLTIP_HEIGHT_PX_LIMITS,
  TOOLTIP_WIDTH_PX_LIMITS,
} from '@lodariq/schema';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';
import {
  attachEdgeResize,
  mountEdgeResizeHandles,
  snapPlacement,
  type OverlayPlacement,
} from '../canvas/edge-resize';

export const OVERLAY_TOOLBAR_HEIGHT_PX = 44;
export const OVERLAY_TOOLBAR_GAP_PX = 8;
export const OVERLAY_TOOLBAR_BAND_PX = OVERLAY_TOOLBAR_HEIGHT_PX + OVERLAY_TOOLBAR_GAP_PX;
export const OVERLAY_CHROME_PAD_PX = 12;
export const OVERLAY_HANDLE_GUTTER_PX = 0;
export const OVERLAY_INSPECTOR_BAND_PX = 328;

export function chooseOverlayToolbarSide(
  card: { left: number; top: number; width: number; height: number } | null,
  target: { left: number; top: number; width: number; height: number } | null,
): 'above' | 'below' {
  if (!card) return 'above';
  if (card.top < OVERLAY_TOOLBAR_BAND_PX + OVERLAY_CHROME_PAD_PX + 8) return 'below';
  if (!target) return 'above';
  const aboveTop = card.top - OVERLAY_TOOLBAR_BAND_PX - OVERLAY_CHROME_PAD_PX;
  const overlapsX =
    card.left < target.left + target.width + 8 && card.left + card.width > target.left - 8;
  if (overlapsX && aboveTop < target.top + target.height + 12) return 'below';
  return 'above';
}

export function createOverlayFrame(doc: Document): HTMLElement {
  const frame = doc.createElement('div');
  frame.className = 'overlay-iframe-frame';
  frame.dataset['overlayFrame'] = 'true';
  frame.hidden = true;
  const ring = doc.createElement('div');
  ring.className = 'overlay-drag-ring';
  ring.dataset['overlayDrag'] = 'true';
  frame.appendChild(ring);
  mountEdgeResizeHandles(frame);
  return frame;
}

function fallbackOverlayCard(): ProtectedSurfaceRect {
  const width = Math.min(TOOLTIP_WIDTH_PX_LIMITS.max, Math.max(TOOLTIP_WIDTH_PX_LIMITS.min, 360));
  const height = Math.min(TOOLTIP_HEIGHT_PX_LIMITS.max, Math.max(TOOLTIP_HEIGHT_PX_LIMITS.min, 240));
  const left = Math.max(16, (window.innerWidth - width) / 2);
  const top = 96;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

export function applyOverlayGeometry(
  iframe: HTMLIFrameElement,
  frame: HTMLElement,
  card: ProtectedSurfaceRect | null,
  visible: boolean,
  toolbar: 'above' | 'below' = 'above',
): void {
  if (!visible) {
    hideIframe(iframe, frame);
    return;
  }
  const rect = card ?? fallbackOverlayCard();
  const pad = OVERLAY_CHROME_PAD_PX;
  const inspectorBand =
    iframe.dataset['overlayInspector'] === '1' ? OVERLAY_INSPECTOR_BAND_PX : 0;
  const contentHeight = Number.parseInt(iframe.dataset['overlayContentHeight'] ?? '', 10);
  const maxCardHeight = Math.min(
    TOOLTIP_HEIGHT_PX_LIMITS.max,
    Math.max(
      TOOLTIP_HEIGHT_PX_LIMITS.min,
      window.innerHeight - OVERLAY_TOOLBAR_BAND_PX - pad * 2 - 72,
    ),
  );
  const grownHeight = Number.isFinite(contentHeight)
    ? Math.min(maxCardHeight, contentHeight)
    : 0;
  const cardHeight = Math.max(rect.height, grownHeight);
  const width = Math.max(1, Math.round(rect.width + pad * 2 + inspectorBand));
  const height = Math.max(1, Math.round(cardHeight + OVERLAY_TOOLBAR_BAND_PX + pad * 2));
  const gutter = Math.min(OVERLAY_HANDLE_GUTTER_PX, Math.max(0, Math.round(rect.left - pad)));
  const spaceRight = window.innerWidth - (rect.right + pad);
  const spaceLeft = rect.left - pad;
  const growRight =
    inspectorBand === 0 || spaceRight >= inspectorBand || spaceRight >= spaceLeft;
  const left = growRight
    ? rect.left - pad - gutter
    : rect.left - pad - gutter - inspectorBand;
  const top =
    toolbar === 'below' ? rect.top - pad : rect.top - OVERLAY_TOOLBAR_BAND_PX - pad;
  iframe.style.position = 'fixed';
  iframe.style.left = `${left}px`;
  iframe.style.top = `${top}px`;
  iframe.style.width = `${width + gutter}px`;
  iframe.style.height = `${height}px`;
  revealIframe(iframe);
  iframe.style.border = '0';
  iframe.style.borderRadius = '0';
  iframe.style.background = 'transparent';
  iframe.style.colorScheme = 'normal';
  iframe.style.boxShadow = '';
  iframe.style.overflow = '';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.zIndex = '2';
  iframe.dataset['overlayToolbar'] = toolbar;
  iframe.dataset['overlayGutter'] = String(gutter);
  iframe.dataset['overlayInspectorSide'] = growRight ? 'right' : 'left';
  frame.hidden = false;
  frame.style.left = `${rect.left}px`;
  frame.style.top = `${rect.top}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}

export function applyOperationsGeometry(iframe: HTMLIFrameElement, frame: HTMLElement): void {
  frame.hidden = true;
  const width = Math.min(1040, Math.max(320, window.innerWidth * 0.9));
  const height = Math.min(720, Math.max(320, window.innerHeight * 0.9));
  iframe.style.position = 'fixed';
  iframe.style.left = `${Math.max(16, (window.innerWidth - width) / 2)}px`;
  iframe.style.top = `${Math.max(16, (window.innerHeight - height) / 2)}px`;
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  revealIframe(iframe);
  iframe.style.background = '#ffffff';
  iframe.style.colorScheme = 'light';
  iframe.style.border = '0';
  iframe.style.borderRadius = '16px';
  iframe.style.boxShadow = '0 24px 64px rgba(15, 36, 31, 0.28)';
  iframe.style.overflow = 'hidden';
  iframe.removeAttribute('allowtransparency');
  iframe.style.zIndex = '3';
}

function revealIframe(iframe: HTMLIFrameElement): void {
  iframe.style.pointerEvents = 'auto';
  iframe.style.opacity = '1';
  iframe.style.visibility = 'visible';
  iframe.removeAttribute('aria-hidden');
}

export function hideIframe(iframe: HTMLIFrameElement, frame: HTMLElement): void {
  frame.hidden = true;
  iframe.style.pointerEvents = 'none';
  iframe.style.opacity = '0';
  iframe.style.visibility = 'hidden';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.background = '';
  iframe.style.colorScheme = '';
  iframe.style.borderRadius = '';
  iframe.style.boxShadow = '';
  iframe.style.overflow = '';
  iframe.removeAttribute('allowtransparency');
  iframe.setAttribute('aria-hidden', 'true');
}

export function attachOverlayFrameInteractions(
  frame: HTMLElement,
  options: {
    getCardSize: () => { width: number; height: number };
    getTargetRect: () => { left: number; top: number; width: number; height: number } | null;
    onDragSnap: (placement: OverlayPlacement) => void;
    onResize: (size: { width: number; height: number }) => void;
  },
): () => void {
  const stopResize = attachEdgeResize(frame, {
    getSize: options.getCardSize,
    heightLimits: TOOLTIP_HEIGHT_PX_LIMITS,
    onCommit: options.onResize,
    widthLimits: TOOLTIP_WIDTH_PX_LIMITS,
  });
  const ring = frame.querySelector<HTMLElement>('[data-overlay-drag]');
  let drag: { startX: number; startY: number; left: number; top: number } | null = null;
  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest('[data-edge-resize]')) return;
    event.preventDefault();
    drag = {
      startX: event.clientX,
      startY: event.clientY,
      left: frame.getBoundingClientRect().left,
      top: frame.getBoundingClientRect().top,
    };
    ring?.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (!drag) return;
    frame.style.left = `${drag.left + event.clientX - drag.startX}px`;
    frame.style.top = `${drag.top + event.clientY - drag.startY}px`;
  };
  const onPointerUp = (): void => {
    if (!drag) return;
    const target = options.getTargetRect();
    const card = frame.getBoundingClientRect();
    drag = null;
    if (!target) return;
    options.onDragSnap(
      snapPlacement(
        { left: card.left, top: card.top, width: card.width, height: card.height },
        target,
      ),
    );
  };
  ring?.addEventListener('pointerdown', onPointerDown);
  ring?.addEventListener('pointermove', onPointerMove);
  ring?.addEventListener('pointerup', onPointerUp);
  ring?.addEventListener('pointercancel', onPointerUp);
  return () => {
    stopResize();
    ring?.removeEventListener('pointerdown', onPointerDown);
    ring?.removeEventListener('pointermove', onPointerMove);
    ring?.removeEventListener('pointerup', onPointerUp);
    ring?.removeEventListener('pointercancel', onPointerUp);
  };
}
