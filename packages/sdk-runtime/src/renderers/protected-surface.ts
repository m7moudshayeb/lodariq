export interface ProtectedSurfaceRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  priority?: number;
}

export interface SurfacePositionCandidate<T = unknown> {
  x: number;
  y: number;
  width: number;
  height: number;
  value: T;
}

/** Stable, DOM-free collision score. Rectangles affect presentation only. */
export function protectedSurfaceCollisionScore(
  candidate: SurfacePositionCandidate,
  obstacles: readonly ProtectedSurfaceRect[],
): number {
  const candidateRect = {
    left: candidate.x,
    top: candidate.y,
    right: candidate.x + candidate.width,
    bottom: candidate.y + candidate.height,
  };
  return obstacles.reduce((score, obstacle) => {
    const overlapWidth = Math.max(
      0,
      Math.min(candidateRect.right, obstacle.right) - Math.max(candidateRect.left, obstacle.left),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(candidateRect.bottom, obstacle.bottom) - Math.max(candidateRect.top, obstacle.top),
    );
    return score + overlapWidth * overlapHeight * Math.max(1, obstacle.priority ?? 1);
  }, 0);
}

export function chooseLowestCollisionCandidate<T>(
  candidates: readonly SurfacePositionCandidate<T>[],
  obstacles: readonly ProtectedSurfaceRect[],
): SurfacePositionCandidate<T> | null {
  let best: SurfacePositionCandidate<T> | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = protectedSurfaceCollisionScore(candidate, obstacles);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function rectFromDomRect(rect: DOMRectReadOnly, priority?: number): ProtectedSurfaceRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    ...(priority ? { priority } : {}),
  };
}
