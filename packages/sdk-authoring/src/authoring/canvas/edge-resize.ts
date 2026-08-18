import { clampAndSnap } from './transform-math';

export const EDGE_RESIZE_EDGES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type EdgeResizeEdge = (typeof EDGE_RESIZE_EDGES)[number];

export const EDGE_RESIZE_HORIZONTAL_DIRECTION: Readonly<Record<EdgeResizeEdge, -1 | 0 | 1>> = {
  n: 0,
  ne: 1,
  e: 1,
  se: 1,
  s: 0,
  sw: -1,
  w: -1,
  nw: -1,
};

export const EDGE_RESIZE_VERTICAL_DIRECTION: Readonly<Record<EdgeResizeEdge, -1 | 0 | 1>> = {
  n: -1,
  ne: -1,
  e: 0,
  se: 1,
  s: 1,
  sw: 1,
  w: 0,
  nw: -1,
};

export type EdgeResizeLimits = Readonly<{ min: number; max: number; step: number }>;

export function resizedSize(
  edge: EdgeResizeEdge,
  start: Readonly<{ width: number; height: number; x: number; y: number }>,
  pointer: Readonly<{ x: number; y: number }>,
): { width: number; height: number } {
  const horizontal = EDGE_RESIZE_HORIZONTAL_DIRECTION[edge];
  const vertical = EDGE_RESIZE_VERTICAL_DIRECTION[edge];
  return {
    width: start.width + (pointer.x - start.x) * horizontal,
    height: start.height + (pointer.y - start.y) * vertical,
  };
}

export function clampSnappedWidth(width: number, limits: EdgeResizeLimits): number {
  return clampAndSnap(width, limits);
}

export function clampSnappedSize(
  size: Readonly<{ width: number; height: number }>,
  widthLimits: EdgeResizeLimits,
  heightLimits: EdgeResizeLimits,
): { width: number; height: number } {
  return {
    width: clampAndSnap(size.width, widthLimits),
    height: clampAndSnap(size.height, heightLimits),
  };
}

export type OverlayPlacement = 'top' | 'right' | 'bottom' | 'left';

export function snapPlacement(
  card: Readonly<{ left: number; top: number; width: number; height: number }>,
  target: Readonly<{ left: number; top: number; width: number; height: number }>,
): OverlayPlacement {
  const dx = card.left + card.width / 2 - (target.left + target.width / 2);
  const dy = card.top + card.height / 2 - (target.top + target.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

export function rectIntersectsViewport(
  rect: Readonly<{ left: number; top: number; right: number; bottom: number }>,
  viewport: Readonly<{ width: number; height: number }>,
): boolean {
  return rect.right > 0 && rect.bottom > 0 && rect.left < viewport.width && rect.top < viewport.height;
}

export interface AttachEdgeResizeOptions {
  getSize: () => { width: number; height: number };
  heightMode?: 'both' | 'width-only';
  heightLimits?: EdgeResizeLimits;
  onCommit: (size: { width: number; height: number }) => void;
  onDraft?: (size: { width: number; height: number }) => void;
  widthLimits: EdgeResizeLimits;
}

export function attachEdgeResize(
  frame: HTMLElement,
  options: AttachEdgeResizeOptions,
): () => void {
  const handles = [...frame.querySelectorAll<HTMLElement>('[data-edge-resize]')];
  const cleanups: Array<() => void> = [];
  for (const handle of handles) {
    const edge = handle.dataset['edgeResize'];
    if (!isEdgeResizeEdge(edge)) continue;
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startSize = options.getSize();
      const start = { ...startSize, x: event.clientX, y: event.clientY };
      const ownerWindow = frame.ownerDocument.defaultView ?? window;
      frame.dataset['resizing'] = 'true';
      const apply = (clientX: number, clientY: number): { width: number; height: number } => {
        const next = resizedSize(edge, start, { x: clientX, y: clientY });
        if (options.heightMode === 'width-only') next.height = startSize.height;
        return options.heightLimits
          ? clampSnappedSize(next, options.widthLimits, options.heightLimits)
          : { width: clampSnappedWidth(next.width, options.widthLimits), height: next.height };
      };
      const onMove = (moveEvent: PointerEvent): void => {
        moveEvent.preventDefault();
        options.onDraft?.(apply(moveEvent.clientX, moveEvent.clientY));
      };
      const onUp = (upEvent: PointerEvent): void => {
        ownerWindow.removeEventListener('pointermove', onMove, true);
        ownerWindow.removeEventListener('pointerup', onUp, true);
        ownerWindow.removeEventListener('pointercancel', onUp, true);
        delete frame.dataset['resizing'];
        options.onCommit(apply(upEvent.clientX, upEvent.clientY));
      };
      ownerWindow.addEventListener('pointermove', onMove, true);
      ownerWindow.addEventListener('pointerup', onUp, true);
      ownerWindow.addEventListener('pointercancel', onUp, true);
    };
    handle.addEventListener('pointerdown', onPointerDown);
    cleanups.push(() => handle.removeEventListener('pointerdown', onPointerDown));
  }
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

function isEdgeResizeEdge(value: string | undefined): value is EdgeResizeEdge {
  return Boolean(value && (EDGE_RESIZE_EDGES as readonly string[]).includes(value));
}

export function mountEdgeResizeHandles(frame: HTMLElement): void {
  for (const edge of EDGE_RESIZE_EDGES) {
    const handle = frame.ownerDocument.createElement('div');
    handle.className = 'edge-resize-handle';
    handle.dataset['edge'] = edge;
    handle.dataset['edgeResize'] = edge;
    handle.setAttribute('aria-hidden', 'true');
    frame.appendChild(handle);
  }
}
