import { arrow, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { ResolvedAnchor } from '../resolver';
import {
  chooseLowestCollisionCandidate,
  rectFromDomRect,
  type ProtectedSurfaceRect,
} from './protected-surface';

export interface CollisionAwareTourPositionOptions {
  anchor: ResolvedAnchor;
  arrowElement: HTMLElement;
  card: HTMLElement;
  placement: Placement;
  /** Author-set gap between target and card. Defaults to the renderer's own. */
  offsetPx?: number;
  /** Flip to the opposite side when the chosen one does not fit. Defaults to on. */
  autoFlip?: boolean;
  protectedSurfaces?: readonly ProtectedSurfaceRect[];
  reference: Parameters<typeof computePosition>[0];
}

const DEFAULT_ANCHOR_OFFSET_PX = 12;

/** Gutter kept between the card and the edge of the screen, shared by shift and scoring. */
const VIEWPORT_PADDING_PX = 8;

export async function computeCollisionAwareTourPosition({
  anchor,
  arrowElement,
  card,
  placement,
  offsetPx,
  autoFlip,
  protectedSurfaces,
  reference,
}: CollisionAwareTourPositionOptions): ReturnType<typeof computePosition> {
  const gap = offsetPx ?? DEFAULT_ANCHOR_OFFSET_PX;
  const standard = () =>
    computePosition(reference, card, {
      placement,
      strategy: 'fixed',
      middleware: [
        offset(gap),
        ...(autoFlip === false ? [] : [flip()]),
        shift({ padding: VIEWPORT_PADDING_PX }),
        arrow({ element: arrowElement }),
      ],
    });
  if (!protectedSurfaces) return standard();
  const positioned = await Promise.all(
    orderedPlacements(placement).map(async (candidatePlacement) => ({
      result: await computePosition(reference, card, {
        placement: candidatePlacement,
        strategy: 'fixed',
        middleware: [offset(gap), shift({ padding: VIEWPORT_PADDING_PX }), arrow({ element: arrowElement })],
      }),
    })),
  );
  const obstacles = [rectFromDomRect(anchor.getBoundingClientRect(), 2), ...protectedSurfaces];
  /*
   * The candidates here are hand-enumerated flips rather than `flip()`, so
   * nothing else in this branch knows where the screen ends. `shift()` only
   * slides along the axis parallel to the reference edge, which leaves a wide
   * card beside a target near the left edge hanging off it — and off-screen
   * collides with nothing, so it used to win.
   */
  const viewport = viewportRect(card);
  const chosen = chooseLowestCollisionCandidate(
    positioned.map(({ result }) => ({
      x: result.x,
      y: result.y,
      width: card.offsetWidth,
      height: card.offsetHeight,
      value: result,
    })),
    obstacles,
    viewport ? { viewport } : {},
  );
  return chosen?.value ?? standard();
}

/**
 * The visible region, in the same fixed-strategy coordinates the candidates use.
 *
 * Inset by the gutter the `shift()` middleware already reserves, so the two
 * agree on where the edge is: a card the shifter considers flush against the
 * boundary must not read as overflowing here.
 */
function viewportRect(card: HTMLElement): ProtectedSurfaceRect | null {
  const view = card.ownerDocument.defaultView;
  if (!view) return null;
  const right = Math.max(VIEWPORT_PADDING_PX, view.innerWidth - VIEWPORT_PADDING_PX);
  const bottom = Math.max(VIEWPORT_PADDING_PX, view.innerHeight - VIEWPORT_PADDING_PX);
  return {
    left: VIEWPORT_PADDING_PX,
    top: VIEWPORT_PADDING_PX,
    right,
    bottom,
    width: right - VIEWPORT_PADDING_PX,
    height: bottom - VIEWPORT_PADDING_PX,
  };
}

function orderedPlacements(preferred: Placement): Placement[] {
  const side = preferred.split('-')[0] ?? 'bottom';
  const alignment = preferred.includes('-') ? preferred.slice(preferred.indexOf('-')) : '';
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side] ?? 'bottom';
  const perpendicular = side === 'top' || side === 'bottom' ? ['right', 'left'] : ['bottom', 'top'];
  return [
    preferred,
    `${opposite}${alignment}`,
    ...perpendicular.map((item) => `${item}${alignment}`),
  ] as Placement[];
}
