import type { ProtectedSurfaceRect } from '@lodariq/sdk-runtime/renderers/tour';

export interface ProtectedChromeGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Chooses an edge position for authoring chrome. These rectangles are transient
 * presentation data and are never fed into target resolution or actions.
 */
export function chooseChromeGeometryAwayFrom(
  current: ProtectedChromeGeometry,
  obstacle: ProtectedSurfaceRect,
  viewport: Readonly<{ width: number; height: number }>,
  margin = 12,
): ProtectedChromeGeometry {
  const maxLeft = Math.max(margin, viewport.width - current.width - margin);
  const maxTop = Math.max(margin, viewport.height - current.height - margin);
  const candidates: ProtectedChromeGeometry[] = [
    { ...current, left: margin, top: margin },
    { ...current, left: maxLeft, top: margin },
    { ...current, left: margin, top: maxTop },
    { ...current, left: maxLeft, top: maxTop },
  ];
  let best = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const overlap = overlapArea(candidate, obstacle);
    const movement = Math.hypot(candidate.left - current.left, candidate.top - current.top);
    const score = overlap * 1_000 + movement;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function domRectAsProtectedSurface(
  rect: DOMRectReadOnly,
  priority = 1,
): ProtectedSurfaceRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    priority,
  };
}

function overlapArea(geometry: ProtectedChromeGeometry, obstacle: ProtectedSurfaceRect): number {
  const right = geometry.left + geometry.width;
  const bottom = geometry.top + geometry.height;
  const width = Math.max(
    0,
    Math.min(right, obstacle.right) - Math.max(geometry.left, obstacle.left),
  );
  const height = Math.max(
    0,
    Math.min(bottom, obstacle.bottom) - Math.max(geometry.top, obstacle.top),
  );
  return width * height;
}
