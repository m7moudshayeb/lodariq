/**
 * One zoom scale for both surfaces.
 *
 * The mode pill's zoom rows and the storyboard's own control used to hold
 * separate numbers on separate scales — the pill stepped by 15 between 40 and
 * 200 into a field nothing rendered, while the control stepped through this
 * ladder in local state. Zooming from the pill therefore moved nothing.
 */
export const CANVAS_ZOOM_LEVELS: readonly number[] = [60, 70, 80, 90, 100, 110, 120];
export const DEFAULT_CANVAS_ZOOM = 80;
export const CANVAS_ZOOM_LIMITS = { min: 60, max: 120 } as const;

/** Snaps to the ladder, so a percent from either surface still lands on a rung. */
export function steppedCanvasZoom(current: number, direction: 'in' | 'out' | 'reset'): number {
  if (direction === 'reset') return DEFAULT_CANVAS_ZOOM;
  const next = nearestCanvasZoomIndex(current) + (direction === 'in' ? 1 : -1);
  const clamped = Math.min(CANVAS_ZOOM_LEVELS.length - 1, Math.max(0, next));
  return CANVAS_ZOOM_LEVELS[clamped] ?? DEFAULT_CANVAS_ZOOM;
}

export function nearestCanvasZoomIndex(percent: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  CANVAS_ZOOM_LEVELS.forEach((level, index) => {
    const distance = Math.abs(level - percent);
    if (distance >= bestDistance) return;
    best = index;
    bestDistance = distance;
  });
  return best;
}

export function clampCanvasZoom(percent: number): number {
  return Math.min(CANVAS_ZOOM_LIMITS.max, Math.max(CANVAS_ZOOM_LIMITS.min, percent));
}
