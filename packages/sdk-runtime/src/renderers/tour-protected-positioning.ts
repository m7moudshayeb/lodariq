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
        shift({ padding: 8 }),
        arrow({ element: arrowElement }),
      ],
    });
  if (!protectedSurfaces) return standard();
  const positioned = await Promise.all(
    orderedPlacements(placement).map(async (candidatePlacement) => ({
      result: await computePosition(reference, card, {
        placement: candidatePlacement,
        strategy: 'fixed',
        middleware: [offset(gap), shift({ padding: 8 }), arrow({ element: arrowElement })],
      }),
    })),
  );
  const obstacles = [rectFromDomRect(anchor.getBoundingClientRect(), 2), ...protectedSurfaces];
  const chosen = chooseLowestCollisionCandidate(
    positioned.map(({ result }) => ({
      x: result.x,
      y: result.y,
      width: card.offsetWidth,
      height: card.offsetHeight,
      value: result,
    })),
    obstacles,
  );
  return chosen?.value ?? standard();
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
