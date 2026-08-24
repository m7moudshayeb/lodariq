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

/**
 * How much of the candidate falls outside the visible region.
 *
 * Overlap alone cannot rank placements, because a card pushed off the edge of
 * the screen overlaps nothing at all and therefore scores a perfect zero. A
 * target near the left edge would send a wide card to `left`, off-screen, and
 * that placement won every comparison precisely because nobody could see it.
 */
export function viewportOverflowArea(
  candidate: SurfacePositionCandidate,
  viewport: ProtectedSurfaceRect,
): number {
  const visibleWidth = Math.max(
    0,
    Math.min(candidate.x + candidate.width, viewport.right) - Math.max(candidate.x, viewport.left),
  );
  const visibleHeight = Math.max(
    0,
    Math.min(candidate.y + candidate.height, viewport.bottom) - Math.max(candidate.y, viewport.top),
  );
  return Math.max(0, candidate.width * candidate.height - visibleWidth * visibleHeight);
}

export interface CandidateRankingOptions {
  /** Visible region the card must stay inside. Omitted for pure overlap ranking. */
  viewport?: ProtectedSurfaceRect;
}

/**
 * Least off-screen first, then least overlapping.
 *
 * Ranked in that order rather than as one weighted sum: visibility is not worth
 * some number of square pixels of overlap, it is the precondition for the card
 * meaning anything. A placement fully on screen that clips the target beats one
 * hanging off the edge that touches nothing, at every ratio. Ties on visibility
 * — the ordinary case, where every candidate fits — fall through to the overlap
 * score and behave exactly as before.
 */
export function chooseLowestCollisionCandidate<T>(
  candidates: readonly SurfacePositionCandidate<T>[],
  obstacles: readonly ProtectedSurfaceRect[],
  options: CandidateRankingOptions = {},
): SurfacePositionCandidate<T> | null {
  const viewport = options.viewport;
  let best: SurfacePositionCandidate<T> | null = null;
  let bestOverflow = Number.POSITIVE_INFINITY;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const overflow = viewport ? viewportOverflowArea(candidate, viewport) : 0;
    const score = protectedSurfaceCollisionScore(candidate, obstacles);
    if (overflow < bestOverflow || (overflow === bestOverflow && score < bestScore)) {
      best = candidate;
      bestOverflow = overflow;
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
