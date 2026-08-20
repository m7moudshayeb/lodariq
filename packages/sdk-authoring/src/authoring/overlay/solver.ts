/**
 * Pure geometry solver for on-page authoring chrome.
 *
 * Invariants this module exists to guarantee (§3.4):
 *   1. No Lodariq surface overlaps another Lodariq surface.
 *   2. No unanchored chrome overlaps the reserved rect (card ∪ target).
 *   3. Placement changes only when the current placement has actually become
 *      invalid, so surfaces do not jitter while the creator types.
 *
 * Audit findings #3 and #4 are this module's responsibility.
 */
import {
  OVERLAY_CARD_GUTTER_OFFSET_PX,
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_INSPECTOR_GAP_PX,
  OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO,
  OVERLAY_INSPECTOR_WIDTH_PX,
  OVERLAY_RESOLVE_HYSTERESIS_PX,
  OVERLAY_TOOLBAR_GAP_PX,
  OVERLAY_TOOLBAR_HEIGHT_PX,
  OVERLAY_TOOLBAR_MIN_WIDTH_PX,
} from './constants';
import {
  OVERLAY_CHROME_CORNERS,
  type OverlayChromeCorner,
  type OverlayChromeSolution,
  type OverlayInspectorSolution,
  type OverlayToolbarSolution,
  type SolverRect,
  type SolverSize,
} from './solver.types';

// ── primitives ───────────────────────────────────────────────────────────────

export function rectsIntersect(a: SolverRect, b: SolverRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

export function unionRects(input: readonly SolverRect[]): SolverRect {
  // Zero-area rects reserve nothing; including them would drag the union to
  // their origin and swallow the whole stage.
  const rects = input.filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * The area unanchored chrome must avoid: the card, its target, and anything
 * anchored to either (§3.4 rule 2).
 */
export function reservedRect(parts: readonly (SolverRect | null | undefined)[]): SolverRect {
  return unionRects(parts.filter((r): r is SolverRect => r != null));
}

// ── toolbar (§4.2a) ──────────────────────────────────────────────────────────

/**
 * Toolbar placement. Anchor order is above → below → docked, and the toolbar is
 * never width-coupled to the card: it takes its own minimum width and overhangs
 * the card symmetrically. Squeezing a text toolbar into a 260px card produces
 * 14px hit targets and makes the bar read as part of the card.
 */
export function solveToolbar(
  card: SolverRect,
  stage: SolverSize,
  /** The step's target, when it has one. The toolbar must not cover it either. */
  target?: SolverRect | null,
): OverlayToolbarSolution {
  const width = Math.max(OVERLAY_TOOLBAR_MIN_WIDTH_PX, card.width);
  const height = OVERLAY_TOOLBAR_HEIGHT_PX;
  const centred = card.left + card.width / 2 - width / 2;
  const left = clamp(
    centred,
    OVERLAY_CHROME_PAD_PX,
    Math.max(OVERLAY_CHROME_PAD_PX, stage.width - width - OVERLAY_CHROME_PAD_PX),
  );

  const aboveTop = card.top - OVERLAY_TOOLBAR_GAP_PX - height;
  const belowTop = card.top + card.height + OVERLAY_TOOLBAR_GAP_PX;
  const fitsAbove = aboveTop >= OVERLAY_CHROME_PAD_PX;
  const fitsBelow = belowTop + height <= stage.height - OVERLAY_CHROME_PAD_PX;

  const hitsTarget = (top: number): boolean =>
    target != null &&
    target.width > 0 &&
    target.height > 0 &&
    rectsIntersect({ left, top, width, height }, target);

  // Above is preferred, but a toolbar sitting on the very thing the step points
  // at is worse than one below the card.
  const clearAbove = fitsAbove && !hitsTarget(aboveTop);
  const clearBelow = fitsBelow && !hitsTarget(belowTop);

  const placement = clearAbove
    ? 'above'
    : clearBelow
      ? 'below'
      : fitsAbove
        ? 'above'
        : fitsBelow
          ? 'below'
          : 'docked';
  const top = placement === 'above' ? aboveTop : placement === 'below' ? belowTop : 0;

  return {
    rect: { left, top, width, height },
    placement,
    overhang: Math.max(0, width - card.width),
  };
}

// ── inspector (§4.3) ─────────────────────────────────────────────────────────

/**
 * Inspector placement: preferred side → opposite side → corner with a leader
 * line. It never overlaps its anchor.
 */
export function solveInspector(
  anchor: SolverRect,
  stage: SolverSize,
  contentHeight: number,
): OverlayInspectorSolution {
  const width = OVERLAY_INSPECTOR_WIDTH_PX;
  const height = Math.min(contentHeight, stage.height * OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO);

  /*
   * The card's block gutter hangs off its left edge (§4.2a rule 6), so the left
   * side has to clear the gutter as well as the gap — otherwise the inspector
   * lands under the grip and the creator drags a block by clicking the panel.
   */
  const rightLeft = anchor.left + anchor.width + OVERLAY_INSPECTOR_GAP_PX;
  const leftLeft = anchor.left + OVERLAY_CARD_GUTTER_OFFSET_PX - OVERLAY_INSPECTOR_GAP_PX - width;
  const fitsRight = rightLeft + width <= stage.width - OVERLAY_CHROME_PAD_PX;
  const fitsLeft = leftLeft >= OVERLAY_CHROME_PAD_PX;

  const side = fitsRight ? 'right' : fitsLeft ? 'left' : 'corner';
  const left = fitsRight
    ? rightLeft
    : fitsLeft
      ? leftLeft
      : stage.width - width - OVERLAY_CHROME_PAD_PX;
  const top = clamp(
    anchor.top,
    OVERLAY_CHROME_PAD_PX,
    Math.max(OVERLAY_CHROME_PAD_PX, stage.height - height - OVERLAY_CHROME_PAD_PX),
  );

  return {
    rect: { left, top, width, height },
    anchor: side,
    needsLeader: side === 'corner',
  };
}

// ── unanchored chrome (§3.4) ─────────────────────────────────────────────────

type CornerOrigin = (
  stage: SolverSize,
  size: SolverSize,
  pad: number,
) => { left: number; top: number };

/** Map rather than a switch, so a new corner is one entry (AGENTS.md). */
const CORNER_ORIGIN: Readonly<Record<OverlayChromeCorner, CornerOrigin>> = {
  'bottom-right': (stage, size, pad) => ({
    left: stage.width - size.width - pad,
    top: stage.height - size.height - pad,
  }),
  'bottom-left': (stage, size, pad) => ({ left: pad, top: stage.height - size.height - pad }),
  'top-right': (stage, size, pad) => ({ left: stage.width - size.width - pad, top: pad }),
  'top-left': (_stage, _size, pad) => ({ left: pad, top: pad }),
};

/**
 * Places unanchored chrome (mode pill, filmstrip) against the obstacles it must
 * clear.
 *
 * Order matters. The preferred corner is tried exactly, then *slid along its own
 * edge*, before any other corner is considered — a pill nudged up over the
 * launcher still reads as living bottom-right, where one thrown to the opposite
 * corner reads as a bug. Only when its own edge has no room does it move house.
 *
 * Obstacles are a list rather than a union: the union of two far-apart rects
 * covers everything between them, which would report every corner as taken.
 */
export function solveChromeAmong(
  size: SolverSize,
  stage: SolverSize,
  obstacles: readonly SolverRect[],
  preference: readonly OverlayChromeCorner[] = OVERLAY_CHROME_CORNERS,
): OverlayChromeSolution {
  const blocking = obstacles.filter((rect) => rect.width > 0 && rect.height > 0);
  const clear = (rect: SolverRect): boolean =>
    !blocking.some((obstacle) => rectsIntersect(rect, obstacle));

  const [wanted = OVERLAY_CHROME_CORNERS[0], ...rest] = preference;
  const wantedOrigin = CORNER_ORIGIN[wanted](stage, size, OVERLAY_CHROME_PAD_PX);
  const wantedRect: SolverRect = { ...wantedOrigin, width: size.width, height: size.height };
  if (clear(wantedRect)) return { rect: wantedRect, corner: wanted, collides: false, slid: false };

  const slid = slideAlongEdge(wantedOrigin, size, stage, clear);
  if (slid) return { rect: slid, corner: wanted, collides: false, slid: true };

  for (const corner of rest) {
    const origin = CORNER_ORIGIN[corner](stage, size, OVERLAY_CHROME_PAD_PX);
    const rect: SolverRect = { ...origin, width: size.width, height: size.height };
    if (clear(rect)) return { rect, corner, collides: false, slid: false };
  }

  return { rect: wantedRect, corner: wanted, collides: true, slid: false };
}

/** Walks the corner's own edge, inward from the viewport edge, for a clear gap. */
function slideAlongEdge(
  origin: { left: number; top: number },
  size: SolverSize,
  stage: SolverSize,
  clear: (rect: SolverRect) => boolean,
): SolverRect | null {
  const towardTop = origin.top > stage.height / 2;
  for (let offset = CHROME_SLIDE_STEP_PX; offset <= stage.height / 2; offset += CHROME_SLIDE_STEP_PX) {
    const top = towardTop ? origin.top - offset : origin.top + offset;
    if (top < OVERLAY_CHROME_PAD_PX || top + size.height > stage.height - OVERLAY_CHROME_PAD_PX) {
      break;
    }
    const rect: SolverRect = { left: origin.left, top, width: size.width, height: size.height };
    if (clear(rect)) return rect;
  }
  return null;
}

/** Slide granularity. Coarse enough to stay legible, fine enough to find a gap. */
const CHROME_SLIDE_STEP_PX = 12;

/** Single-obstacle convenience over {@link solveChromeAmong}. */
export function solveChrome(
  size: SolverSize,
  stage: SolverSize,
  reserved: SolverRect,
  preference: readonly OverlayChromeCorner[] = OVERLAY_CHROME_CORNERS,
): OverlayChromeSolution {
  return solveChromeAmong(size, stage, [reserved], preference);
}

// ── hysteresis (§4.2a rule 3) ────────────────────────────────────────────────

/**
 * Whether a previously solved placement should be recomputed.
 *
 * Returning false is the common case while typing: the card has grown a few
 * pixels, the existing placement is still valid, and moving the toolbar would be
 * pure noise.
 */
export function shouldResolve(
  previous: SolverRect | null | undefined,
  next: SolverRect,
  threshold: number = OVERLAY_RESOLVE_HYSTERESIS_PX,
): boolean {
  if (previous == null) {
    return true;
  }
  const drift = Math.max(
    Math.abs(previous.left - next.left),
    Math.abs(previous.top - next.top),
    Math.abs(previous.width - next.width),
    Math.abs(previous.height - next.height),
  );
  return drift > threshold;
}

/**
 * Rule 1 as an assertion. Used by tests and the dev overlay: no two solved
 * surfaces may occupy the same pixel.
 */
export function findOverlaps(
  surfaces: readonly { readonly id: string; readonly rect: SolverRect }[],
): readonly (readonly [string, string])[] {
  const pairs: (readonly [string, string])[] = [];
  for (let i = 0; i < surfaces.length; i += 1) {
    for (let j = i + 1; j < surfaces.length; j += 1) {
      const a = surfaces[i];
      const b = surfaces[j];
      if (a && b && rectsIntersect(a.rect, b.rect)) {
        pairs.push([a.id, b.id]);
      }
    }
  }
  return pairs;
}
