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
  return (
    rect.right > 0 && rect.bottom > 0 && rect.left < viewport.width && rect.top < viewport.height
  );
}

/** Which axes the dragged edge actually moved. `e` drives width and nothing else. */
export interface EdgeResizeAxes {
  readonly width: boolean;
  readonly height: boolean;
}

export interface AttachEdgeResizeOptions {
  getSize: () => { width: number; height: number };
  heightMode?: 'both' | 'width-only';
  heightLimits?: EdgeResizeLimits;
  onCommit: (size: { width: number; height: number }, axes: EdgeResizeAxes) => void;
  onDraft?: (size: { width: number; height: number }) => void;
  widthLimits: EdgeResizeLimits;
}

export function attachEdgeResize(frame: HTMLElement, options: AttachEdgeResizeOptions): () => void {
  const handles = [...frame.querySelectorAll<HTMLElement>('[data-edge-resize]')];
  const cleanups: Array<() => void> = [];
  for (const handle of handles) {
    const edge = handle.dataset['edgeResize'];
    if (!isEdgeResizeEdge(edge)) continue;
    const axes: EdgeResizeAxes = {
      width: EDGE_RESIZE_HORIZONTAL_DIRECTION[edge] !== 0,
      height: EDGE_RESIZE_VERTICAL_DIRECTION[edge] !== 0 && options.heightMode !== 'width-only',
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startSize = options.getSize();
      const start = { ...startSize, x: event.clientX, y: event.clientY };
      /**
       * Capture the pointer on the handle, and listen on the handle.
       *
       * Window listeners are enough only while the pointer stays in the same
       * document. The overlay's card renders inside an iframe that covers the area
       * the creator drags across, and pointer events do not cross that boundary —
       * so the first move inward went to the iframe, the top window saw no
       * `pointermove` and no `pointerup`, and the drag died silently with the card
       * still at its original size. Capture retargets every event for this pointer
       * back here regardless of what it travels over.
       */
      handle.setPointerCapture(event.pointerId);
      frame.dataset['resizing'] = 'true';
      const apply = (clientX: number, clientY: number): { width: number; height: number } => {
        const next = resizedSize(edge, start, { x: clientX, y: clientY });
        if (options.heightMode === 'width-only') next.height = startSize.height;
        const sized = options.heightLimits
          ? clampSnappedSize(next, options.widthLimits, options.heightLimits)
          : { width: clampSnappedWidth(next.width, options.widthLimits), height: next.height };
        /*
         * Say when the drag has run out of room, and on which axis.
         *
         * A card at the width limit takes the drag and does nothing with it, and
         * nothing on screen says why — the limits were only ever mentioned in a
         * toast, after the gesture had already ended. A wide, short card
         * therefore reads as "horizontal resize is broken": the side edges are
         * pinned at the maximum while the top and bottom still move, because the
         * two axes have different ceilings (720 against 640).
         *
         * Tested against the limits rather than against the clamped result: the
         * sizes are also snapped to a 4px step, and comparing before and after
         * would call almost every pixel of an ordinary drag a limit.
         */
        const pinned: string[] = [];
        if (axes.width && outsideLimits(next.width, options.widthLimits)) pinned.push('width');
        if (
          axes.height &&
          options.heightLimits &&
          outsideLimits(next.height, options.heightLimits)
        ) {
          pinned.push('height');
        }
        if (pinned.length > 0) frame.dataset['resizeAtLimit'] = pinned.join(' ');
        else delete frame.dataset['resizeAtLimit'];

        /*
         * An axis the edge does not drive keeps the size it started at, unsnapped
         * and unclamped. Passing it through the clamp rounded a card drawn at its
         * content height up to the authored minimum, so dragging the width alone
         * made the card taller.
         */
        return {
          width: axes.width ? sized.width : startSize.width,
          height: axes.height ? sized.height : startSize.height,
        };
      };
      const onMove = (moveEvent: PointerEvent): void => {
        moveEvent.preventDefault();
        options.onDraft?.(apply(moveEvent.clientX, moveEvent.clientY));
      };
      const onUp = (upEvent: PointerEvent): void => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        delete frame.dataset['resizing'];
        const committed = apply(upEvent.clientX, upEvent.clientY);
        // The limit marker belongs to the gesture, not to the card.
        delete frame.dataset['resizeAtLimit'];
        options.onCommit(committed, axes);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointerdown', onPointerDown);
    cleanups.push(() => handle.removeEventListener('pointerdown', onPointerDown));
  }
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

/**
 * Hold a resize drag to the handle that started it.
 *
 * The card renders inside an iframe sized to the card, so a drag outward crosses
 * that boundary within a few pixels: the frame's window stops seeing
 * `pointermove` and never sees `pointerup`, so the gesture freezes, then
 * resumes — still stuck to the cursor — the moment the pointer wanders back in.
 * Capture retargets every event for this pointer to the handle whatever it
 * travels over, and the browser releases it on `pointerup` itself.
 */
export function capturePointerForResize(handle: Element, pointerId: number): void {
  /* A pointer that is already gone (a synthesised or replayed event) cannot be
   * captured; the drag is still worth starting for the in-frame case. */
  try {
    handle.setPointerCapture(pointerId);
  } catch {
    /* no capture available — window listeners still cover the in-frame drag */
  }
}

/** Past a wall, not merely off the 4px grid. */
function outsideLimits(value: number, limits: EdgeResizeLimits): boolean {
  return value > limits.max || value < limits.min;
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
