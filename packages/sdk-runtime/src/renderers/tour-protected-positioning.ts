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
  protectedSurfaces?: readonly ProtectedSurfaceRect[];
  reference: Parameters<typeof computePosition>[0];
}

export async function computeCollisionAwareTourPosition({
  anchor,
  arrowElement,
  card,
  placement,
  protectedSurfaces,
  reference,
}: CollisionAwareTourPositionOptions): ReturnType<typeof computePosition> {
  const standard = () =>
    computePosition(reference, card, {
      placement,
      strategy: 'fixed',
      middleware: [offset(12), flip(), shift({ padding: 8 }), arrow({ element: arrowElement })],
    });
  if (!protectedSurfaces) return standard();
  const positioned = await Promise.all(
    orderedPlacements(placement).map(async (candidatePlacement) => ({
      result: await computePosition(reference, card, {
        placement: candidatePlacement,
        strategy: 'fixed',
        middleware: [offset(12), shift({ padding: 8 }), arrow({ element: arrowElement })],
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
