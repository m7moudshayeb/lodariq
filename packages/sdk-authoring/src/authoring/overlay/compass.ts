import { ANCHOR_OFFSET_PX_LIMITS, type AnchorAlign } from '@lodariq/schema';
import { AUTHORING_PANEL_LABELS } from '../panel-config';
import type { OverlayPlacement } from '../canvas/edge-resize';
import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';

/**
 * The compass is Tier 1: placement has a visible position, so it is dragged,
 * not typed. Twelve dots — three alignments on each of four sides — plus a drag
 * that sets the offset. The inspector's Placement section mirrors all three for
 * keyboard users; neither is the only way.
 */
export interface CompassPosition {
  readonly placement: OverlayPlacement;
  readonly align: AnchorAlign;
}

const ALIGNS: readonly AnchorAlign[] = ['start', 'center', 'end'];
const SIDES: readonly OverlayPlacement[] = ['top', 'right', 'bottom', 'left'];

const SIDE_LABEL: Record<OverlayPlacement, string> = {
  top: AUTHORING_PANEL_LABELS.placementAbove,
  right: AUTHORING_PANEL_LABELS.placementRight,
  bottom: AUTHORING_PANEL_LABELS.placementBelow,
  left: AUTHORING_PANEL_LABELS.placementLeft,
};

/** Fraction along the side each alignment sits at. */
const ALIGN_FRACTION: Record<AnchorAlign, number> = { start: 0.16, center: 0.5, end: 0.84 };

export interface CompassCallbacks {
  readonly onPlace: (position: CompassPosition) => void;
  /** Live during the drag, so the creator sees the gap they are setting. */
  readonly onOffsetPreview?: (offsetPx: number) => void;
  readonly onOffsetCommit?: (offsetPx: number) => void;
  readonly onRetarget?: () => void;
}

/**
 * True when a Lodariq surface is sitting on the target the dots ring.
 *
 * Adjacent is fine — the dots sit on the free edges. What is not fine is a
 * surface *covering* the target, because then the dots are drawn across our own
 * copy. The inspector's Placement section still offers every side, so nothing is
 * lost by withholding the ring.
 */
function compassCollidesWithSurface(
  target: ProtectedSurfaceRect,
  surfaces: readonly (ProtectedSurfaceRect | null | undefined)[],
): boolean {
  return surfaces.some(
    (surface) =>
      surface != null &&
      surface.width > 0 &&
      surface.height > 0 &&
      surface.left < target.left + target.width &&
      target.left < surface.left + surface.width &&
      surface.top < target.top + target.height &&
      target.top < surface.top + surface.height,
  );
}

interface CompassState {
  callbacks: CompassCallbacks;
  current: { placement: OverlayPlacement | null; align: AnchorAlign; offsetPx: number };
}

/**
 * One delegated listener bound at creation. Re-binding per sync would either
 * stack handlers or depend on `onpointerdown` being a real IDL attribute, and
 * both are avoidable.
 */
const compassState = new WeakMap<HTMLElement, CompassState>();

export function createCompass(doc: Document): HTMLElement {
  const compass = doc.createElement('div');
  compass.className = 'overlay-compass';
  compass.dataset['protectedChrome'] = 'true';
  compass.dataset['lodariqCompass'] = 'true';
  compass.hidden = true;
  for (const placement of SIDES) {
    for (const align of ALIGNS) {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'overlay-compass-hit';
      dot.dataset['placement'] = placement;
      dot.dataset['align'] = align;
      const label = `${SIDE_LABEL[placement]} · ${align}`;
      dot.setAttribute('aria-label', label);
      dot.title = label;
      compass.appendChild(dot);
    }
  }
  // The rule and its number are one element: the number labels the distance.
  const line = doc.createElement('div');
  line.className = 'overlay-compass-line';
  line.dataset['offsetLine'] = 'true';
  line.hidden = true;
  const readout = doc.createElement('span');
  readout.className = 'overlay-compass-offset';
  readout.dataset['offsetReadout'] = 'true';
  line.appendChild(readout);
  compass.appendChild(line);

  const retarget = doc.createElement('button');
  retarget.type = 'button';
  retarget.className = 'overlay-compass-retarget';
  retarget.dataset['retarget'] = 'true';
  retarget.setAttribute('aria-label', AUTHORING_PANEL_LABELS.changeTarget);
  retarget.title = AUTHORING_PANEL_LABELS.changeTarget;
  retarget.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';
  compass.appendChild(retarget);

  compass.addEventListener('pointerdown', (event) => {
    const dot = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-placement]');
    const state = compassState.get(compass);
    if (!dot || !state) return;
    const placement = dot.dataset['placement'] as OverlayPlacement;
    const align = dot.dataset['align'] as AnchorAlign;
    state.callbacks.onPlace({ placement, align });
    startOffsetDrag(compass, event as PointerEvent, placement, state.current.offsetPx, state.callbacks);
  });
  compass.addEventListener('click', (event) => {
    const retargetButton = (event.target as HTMLElement | null)?.closest('[data-retarget]');
    if (retargetButton) compassState.get(compass)?.callbacks.onRetarget?.();
  });
  return compass;
}

export function syncCompass(
  compass: HTMLElement,
  target: ProtectedSurfaceRect | null,
  visible: boolean,
  callbacks: CompassCallbacks,
  current: { placement: OverlayPlacement | null; align: AnchorAlign; offsetPx: number },
  /** The surfaces the dots must not be drawn across: the card and the inspector. */
  ...surfaces: readonly (ProtectedSurfaceRect | null | undefined)[]
): void {
  compass.hidden = !visible || !target || compassCollidesWithSurface(target, surfaces);
  if (!target) return;
  const ring = Math.max(12, current.offsetPx);
  compass.style.left = `${target.left - ring}px`;
  compass.style.top = `${target.top - ring}px`;
  compass.style.width = `${target.width + ring * 2}px`;
  compass.style.height = `${target.height + ring * 2}px`;

  for (const dot of compass.querySelectorAll<HTMLButtonElement>('[data-placement]')) {
    const placement = dot.dataset['placement'] as OverlayPlacement;
    const align = dot.dataset['align'] as AnchorAlign;
    // `hidden` rather than transparent: three overlapping hit areas on a short
    // edge are three things the creator cannot aim at, and two of them would
    // still be reachable by keyboard.
    dot.hidden = align !== 'center' && !edgeFitsAlignDots(placement, target);
    if (dot.hidden) continue;
    const position = dotPosition(placement, align, target, ring);
    dot.style.left = `${position.x}px`;
    dot.style.top = `${position.y}px`;
    const isCurrent = placement === current.placement && align === current.align;
    dot.dataset['current'] = isCurrent ? 'true' : 'false';
    dot.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
  }
  compassState.set(compass, { callbacks, current });
}

/** Hit area of one dot; three of them need twice this much edge to not overlap. */
const COMPASS_DOT_SIZE_PX = 20;

/**
 * Whether an edge is long enough to offer start/centre/end.
 *
 * A 30px button cannot hold three distinct choices along its side — the dots
 * land on top of each other and the creator aims at a pile. Short edges offer
 * the centre only, which is the placement they meant anyway.
 */
function edgeFitsAlignDots(placement: OverlayPlacement, target: ProtectedSurfaceRect): boolean {
  const edge = placement === 'top' || placement === 'bottom' ? target.width : target.height;
  return edge >= COMPASS_DOT_SIZE_PX * 2;
}

/** Dot centre, in the compass's own coordinates. */
function dotPosition(
  placement: OverlayPlacement,
  align: AnchorAlign,
  target: ProtectedSurfaceRect,
  ring: number,
): { x: number; y: number } {
  const fraction = ALIGN_FRACTION[align];
  if (placement === 'top') return { x: ring + target.width * fraction, y: 0 };
  if (placement === 'bottom') return { x: ring + target.width * fraction, y: ring * 2 + target.height };
  if (placement === 'left') return { x: 0, y: ring + target.height * fraction };
  return { x: ring * 2 + target.width, y: ring + target.height * fraction };
}

/**
 * Dragging a dot away from the target sets the gap. The threshold keeps a plain
 * click a placement change rather than an accidental 1px offset.
 */
function startOffsetDrag(
  compass: HTMLElement,
  event: PointerEvent,
  placement: OverlayPlacement,
  startOffset: number,
  callbacks: CompassCallbacks,
): void {
  if (!callbacks.onOffsetCommit) return;
  const line = compass.querySelector<HTMLElement>('[data-offset-line]');
  const readout = compass.querySelector<HTMLElement>('[data-offset-readout]');
  const startX = event.clientX;
  const startY = event.clientY;
  let offset = startOffset;
  let moved = false;

  const distance = (moveEvent: PointerEvent): number => {
    if (placement === 'top') return startY - moveEvent.clientY;
    if (placement === 'bottom') return moveEvent.clientY - startY;
    if (placement === 'left') return startX - moveEvent.clientX;
    return moveEvent.clientX - startX;
  };

  const onMove = (moveEvent: PointerEvent): void => {
    const delta = distance(moveEvent);
    if (!moved && Math.abs(delta) < 3) return;
    moved = true;
    offset = Math.min(
      ANCHOR_OFFSET_PX_LIMITS.max,
      Math.max(ANCHOR_OFFSET_PX_LIMITS.min, Math.round(startOffset + delta)),
    );
    if (line && readout) {
      line.hidden = false;
      readout.textContent = `${offset}px`;
      drawOffsetLine(compass, line, placement, offset);
    }
    callbacks.onOffsetPreview?.(offset);
  };

  const onUp = (): void => {
    compass.ownerDocument.removeEventListener('pointermove', onMove);
    compass.ownerDocument.removeEventListener('pointerup', onUp);
    if (line) line.hidden = true;
    if (moved) callbacks.onOffsetCommit?.(offset);
  };

  compass.ownerDocument.addEventListener('pointermove', onMove);
  compass.ownerDocument.addEventListener('pointerup', onUp);
}

/**
 * The rule runs from the target's own edge outward by the gap, along the side
 * being dragged — measured in the compass's coordinates, where the target sits
 * inset by the ring.
 */
function drawOffsetLine(
  compass: HTMLElement,
  line: HTMLElement,
  placement: OverlayPlacement,
  offset: number,
): void {
  const box = compass.getBoundingClientRect();
  const inset = Math.max(12, offset);
  line.style.width = `${offset}px`;
  if (placement === 'top') {
    line.style.left = `${box.width / 2}px`;
    line.style.top = `${inset}px`;
    line.style.transform = 'rotate(-90deg)';
  } else if (placement === 'bottom') {
    line.style.left = `${box.width / 2}px`;
    line.style.top = `${box.height - inset}px`;
    line.style.transform = 'rotate(90deg)';
  } else if (placement === 'left') {
    line.style.left = `${inset}px`;
    line.style.top = `${box.height / 2}px`;
    line.style.transform = 'rotate(180deg)';
  } else {
    line.style.left = `${box.width - inset}px`;
    line.style.top = `${box.height / 2}px`;
    line.style.transform = 'none';
  }
}
