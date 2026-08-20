/**
 * The overlay iframe's layout: one frame, three independently solved surfaces.
 *
 * The prototype draws `#tbar`, `#cwrap` and `#insp` as three absolutely
 * positioned peers on the stage, each with its own solve. Everything Lodariq
 * draws on the customer's page has to live inside one iframe, so this module
 * reproduces that: solve the three in viewport coordinates, take their union as
 * the iframe box, and hand back frame-local boxes for the frame to position.
 *
 * Why not one flex column: the card's position is the *runtime's* — it is where
 * the shipped popup will appear — so nothing else may move it. Stacking the
 * toolbar and the inspector in flow around it did exactly that, and letting the
 * inspector's height drive the frame is what made the card jump when settings
 * opened.
 *
 * Reference: docs/plans/authoring-ux-model.md §3.4, §4.2a, §4.3
 *            docs/product-design/prototypes/authoring-spec.html → `solve()`
 */
import {
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO,
  OVERLAY_TOOLBAR_GAP_PX,
  OVERLAY_TOOLBAR_HEIGHT_PX,
} from './constants';
import { solveInspector, solveToolbar, unionRects } from './solver';
import type {
  OverlayInspectorAnchor,
  OverlayToolbarPlacement,
  SolverRect,
  SolverSize,
} from './solver.types';

export interface OverlayFrameLayout {
  /** The iframe box, in viewport coordinates. */
  readonly frame: SolverRect;
  /** The card in viewport coordinates, after clamping. The drag ring uses this. */
  readonly cardViewport: SolverRect;
  /**
   * Frame-local. The height is the authored one: a creator who drags the card
   * taller expects the card to fill what they dragged, not to snap back to its
   * content.
   */
  readonly card: SolverRect;
  /**
   * The card rect's own height, before content measurement widens it. This is the
   * size the creator dragged, and it is what the frame's card floors itself to —
   * `card.height` may have grown to clear overflowing content, and flooring to
   * that would ratchet: taller floor, taller content box, taller measurement.
   */
  readonly cardAuthoredHeight: number;
  /**
   * The tallest the card may draw before it has to scroll its own content. The
   * host is the only side that knows the viewport, so it is solved here and
   * published; the card applies it as a max-height.
   */
  readonly cardMaxHeight: number;
  readonly toolbar: SolverRect;
  readonly toolbarPlacement: OverlayToolbarPlacement;
  /** Frame-local, or null while the inspector is closed. */
  readonly inspector: SolverRect | null;
  readonly inspectorAnchor: OverlayInspectorAnchor | null;
}

export interface OverlayFrameLayoutOptions {
  /** Measured card height, when the content is taller than the reserved rect. */
  readonly cardHeight?: number;
  /**
   * The height the creator dragged, when the step carries one. It wins over the
   * measurement below: a card authored shorter than its content scrolls inside
   * what was dragged. Without it the frame was `max(authored, content)`, so
   * every shrink past the content did nothing at all.
   */
  readonly authoredHeight?: number | null;
  /** The ceiling the card scrolls inside. */
  readonly cardMaxHeight?: number;
  /** The step's target, so the card can be pushed clear of it (§3.4 rule 2). */
  readonly target?: SolverRect | null;
  /** Measured inspector content height. Null or absent means closed. */
  readonly inspectorHeight?: number | null;
  /** Forced toolbar side. The fit test still has the last word. */
  readonly toolbarPlacement?: OverlayToolbarPlacement;
  /** Transient room for an open floating menu, which the iframe would clip. */
  readonly menuAllowance?: number;
}

export function solveOverlayFrame(
  card: SolverRect,
  stage: SolverSize,
  options: OverlayFrameLayoutOptions = {},
): OverlayFrameLayout {
  const pad = OVERLAY_CHROME_PAD_PX;
  const height = options.authoredHeight ?? Math.max(card.height, options.cardHeight ?? 0);
  /**
   * The prototype clamps the card into the stage before anything else is solved,
   * and so does this. A step whose target is the whole page gets a runtime rect
   * below the fold; drawing the authoring card there means the creator opens a
   * step and sees nothing at all.
   */
  const anchor = placeCardClearOfTarget(
    {
      width: card.width,
      height,
      left: clamp(card.left, pad, Math.max(pad, stage.width - card.width - pad)),
      top: clamp(card.top, pad, Math.max(pad, stage.height - height - pad)),
    },
    options.target ?? null,
    stage,
  );
  const toolbar = solveToolbar(anchor, stage, options.target ?? null);
  const placement = resolveToolbarPlacement(
    toolbar.placement,
    options.toolbarPlacement,
    anchor,
    toolbar.rect,
    options.target ?? null,
  );
  const toolbarRect: SolverRect = {
    ...toolbar.rect,
    top: toolbarTop(anchor, placement),
  };

  const inspectorHeight = options.inspectorHeight ?? null;
  const inspector =
    inspectorHeight === null || inspectorHeight <= 0
      ? null
      : solveInspector(
          anchor,
          stage,
          Math.min(inspectorHeight, stage.height * OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO),
        );

  const content = unionRects([anchor, toolbarRect, ...(inspector ? [inspector.rect] : [])]);
  /**
   * Padding is trimmed at the viewport edge rather than clamped inward: shrinking
   * the frame to fit its own padding would clip a surface that was solved to be
   * on-screen.
   */
  const left = Math.max(0, content.left - pad);
  const top = Math.max(0, content.top - pad);
  const allowance = Math.max(0, options.menuAllowance ?? 0);
  const right = Math.min(stage.width, content.left + content.width + pad + allowance);
  const bottom = Math.min(stage.height, content.top + content.height + pad + allowance);
  const frame: SolverRect = {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };

  return {
    frame,
    cardViewport: anchor,
    card: toLocal(anchor, frame),
    cardAuthoredHeight: options.authoredHeight ?? card.height,
    /* An authored height is a roof as well as a floor, or the content pushes
     * straight back through it and the shrink is undone. */
    cardMaxHeight:
      options.authoredHeight == null
        ? (options.cardMaxHeight ?? height)
        : Math.min(options.cardMaxHeight ?? height, options.authoredHeight),
    toolbar: toLocal(toolbarRect, frame),
    toolbarPlacement: placement,
    inspector: inspector ? toLocal(inspector.rect, frame) : null,
    inspectorAnchor: inspector?.anchor ?? null,
  };
}

/**
 * The frame-local geometry contract: what the host writes onto the iframe as
 * `data-*`, and the custom property each value becomes inside the frame. One map
 * so neither side can add a measurement the other does not read.
 */
export const OVERLAY_FRAME_GEOMETRY_VARS = {
  overlayCardX: '--overlay-card-x',
  overlayCardY: '--overlay-card-y',
  overlayCardWidth: '--overlay-card-width',
  overlayCardHeight: '--overlay-card-height',
  overlayCardMaxHeight: '--overlay-card-max-height',
  overlayToolbarX: '--overlay-toolbar-x',
  overlayToolbarY: '--overlay-toolbar-y',
  overlayToolbarWidth: '--overlay-toolbar-width',
  overlayToolbarCenter: '--overlay-toolbar-center',
  overlayInspectorX: '--overlay-inspector-x',
  overlayInspectorY: '--overlay-inspector-y',
  overlayInspectorHeight: '--overlay-inspector-height',
} as const;

export type OverlayFrameGeometryKey = keyof typeof OVERLAY_FRAME_GEOMETRY_VARS;

/** Null means "not applicable right now" — the writer deletes those keys. */
export function overlayFrameGeometry(
  layout: OverlayFrameLayout,
): Readonly<Record<OverlayFrameGeometryKey, number | null>> {
  return {
    overlayCardX: layout.card.left,
    overlayCardY: layout.card.top,
    overlayCardWidth: layout.card.width,
    /*
     * Clamped to the ceiling, because the card floors itself to this value and a
     * floor above the roof wins in CSS. The authored height tracks the rect the
     * runtime reports, which grows with the content — so without the clamp a long
     * step raised its own floor past the cap and never scrolled.
     */
    overlayCardHeight: Math.min(layout.cardAuthoredHeight, layout.cardMaxHeight),
    /*
     * The ceiling the host already applies when it solves the frame, published
     * so the card can apply it to itself. Without it the card had a floor and no
     * roof: a step with a dozen blocks grew past the frame and its content spilled
     * over the page instead of scrolling inside the card.
     */
    overlayCardMaxHeight: layout.cardMaxHeight,
    overlayToolbarX: layout.toolbar.left,
    overlayToolbarY: layout.toolbar.top,
    overlayToolbarWidth: layout.toolbar.width,
    overlayToolbarCenter: layout.toolbar.left + Math.round(layout.toolbar.width / 2),
    overlayInspectorX: layout.inspector?.left ?? null,
    overlayInspectorY: layout.inspector?.top ?? null,
    overlayInspectorHeight: layout.inspector?.height ?? null,
  };
}

/** Sides in the order the fallback walks them when the preferred one is full. */
const CARD_SIDES = ['right', 'left', 'below', 'above'] as const;
type CardSide = (typeof CARD_SIDES)[number];

/**
 * The card, moved off its own target (§3.4 rule 2).
 *
 * A card that covers the thing it points at hides the one thing the creator is
 * checking, and the compass has nowhere to draw. Clamping into the viewport can
 * cause it on its own: a target on the far right leaves less than a card's width
 * beside it, so the clamp slides the card back across the target.
 *
 * So when the two intersect, the card takes the side of the target with the most
 * free space — the opposite side, by definition, when the preferred one has none.
 * The card's current side is tried first so a placement that already works is
 * never disturbed.
 */
function placeCardClearOfTarget(
  card: SolverRect,
  target: SolverRect | null,
  stage: SolverSize,
): SolverRect {
  if (!target || target.width <= 0 || target.height <= 0) return card;
  if (!intersects(card, target)) return card;
  const pad = OVERLAY_CHROME_PAD_PX;
  const free: Readonly<Record<CardSide, number>> = {
    right: stage.width - (target.left + target.width) - pad * 2,
    left: target.left - pad * 2,
    below: stage.height - (target.top + target.height) - pad * 2,
    above: target.top - pad * 2,
  };
  const current = currentSide(card, target);
  const order = [current, ...CARD_SIDES.filter((side) => side !== current)].sort(
    (a, b) => (a === current ? -1 : b === current ? 1 : free[b] - free[a]),
  );
  let best: SolverRect | null = null;
  for (const side of order) {
    const candidate = cardOnSide(card, target, stage, side);
    if (!intersects(candidate, target) && insideStage(candidate, stage)) return candidate;
    if (!best && !intersects(candidate, target)) best = candidate;
  }
  // Nothing clears it — a target the size of the page. Keep the clamped position.
  return best ?? card;
}

function cardOnSide(
  card: SolverRect,
  target: SolverRect,
  stage: SolverSize,
  side: CardSide,
): SolverRect {
  /**
   * Twice the pad: the frame is drawn one pad outside the card, so clearing the
   * target by a single pad still lets the visible edge lap over it.
   */
  const pad = OVERLAY_CHROME_PAD_PX * 2;
  const centredLeft = target.left + target.width / 2 - card.width / 2;
  const centredTop = target.top + target.height / 2 - card.height / 2;
  const horizontal = side === 'left' || side === 'right';
  const left = horizontal
    ? side === 'right'
      ? target.left + target.width + pad
      : target.left - pad - card.width
    : clamp(centredLeft, pad, Math.max(pad, stage.width - card.width - pad));
  const top = horizontal
    ? clamp(centredTop, pad, Math.max(pad, stage.height - card.height - pad))
    : side === 'below'
      ? target.top + target.height + pad
      : target.top - pad - card.height;
  return { left: Math.round(left), top: Math.round(top), width: card.width, height: card.height };
}

/** Which side of the target the card already leans toward, by centre distance. */
function currentSide(card: SolverRect, target: SolverRect): CardSide {
  const dx = card.left + card.width / 2 - (target.left + target.width / 2);
  const dy = card.top + card.height / 2 - (target.top + target.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'below' : 'above';
}

function intersects(a: SolverRect, b: SolverRect): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

function insideStage(rect: SolverRect, stage: SolverSize): boolean {
  const pad = OVERLAY_CHROME_PAD_PX;
  return (
    rect.left >= pad &&
    rect.top >= pad &&
    rect.left + rect.width <= stage.width - pad &&
    rect.top + rect.height <= stage.height - pad
  );
}

/** A request for `above` loses to a viewport that has no room for it. */
/**
 * A caller may prefer a side, but preference never wins over the target: the
 * solver already rejected the side that covers it, and honouring the request
 * blindly would slide the whole frame back across the element being authored.
 */
function resolveToolbarPlacement(
  fitted: OverlayToolbarPlacement,
  requested: OverlayToolbarPlacement | undefined,
  card: SolverRect,
  toolbar: SolverRect,
  target: SolverRect | null,
): OverlayToolbarPlacement {
  if (!requested || requested === fitted) return fitted;
  if (fitted === 'docked') return 'docked';
  if (!target || target.width <= 0 || target.height <= 0) return requested;
  const requestedRect = { ...toolbar, top: toolbarTop(card, requested) };
  return intersects(requestedRect, target) ? fitted : requested;
}

function toolbarTop(card: SolverRect, placement: OverlayToolbarPlacement): number {
  if (placement === 'docked') return 0;
  if (placement === 'below') return card.top + card.height + OVERLAY_TOOLBAR_GAP_PX;
  return card.top - OVERLAY_TOOLBAR_GAP_PX - OVERLAY_TOOLBAR_HEIGHT_PX;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toLocal(rect: SolverRect, frame: SolverRect): SolverRect {
  return {
    left: Math.round(rect.left - frame.left),
    top: Math.round(rect.top - frame.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}
