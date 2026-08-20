/**
 * The one module that owns placement and pointer routing for every unanchored
 * Lodariq surface (§3.4). Audit findings #3 and #4 are its responsibility.
 *
 * Rules it enforces:
 *   1. No two interactive Lodariq surfaces occupy the same pixel — each solved
 *      surface joins the obstacle list, so the next one avoids it too.
 *   2. Unanchored chrome clears the reserved rect (card ∪ target ∪ compass).
 *   3. Placement is corner-granular and only re-solved when the reserved rect has
 *      actually moved, so nothing drifts while the creator types.
 *   4. Automatic avoidance first; `Move` / `Hide` are the fallback, not the path.
 */
import { reservedRect, shouldResolve, solveChromeAmong } from './solver';
import type { OverlayChromeCorner, SolverRect, SolverSize } from './solver.types';

export interface OverlayManagedSurface {
  readonly id: string;
  readonly element: HTMLElement;
  /**
   * Corner preference, most-wanted first. A creator who dragged a surface puts
   * their chosen corner at the head; the rest is the stable fallback order.
   */
  readonly preference: () => readonly OverlayChromeCorner[];
  /** Called only when the surface actually moves, so callers can persist or announce. */
  readonly onPlaced?: (corner: OverlayChromeCorner, displaced: boolean) => void;
}

export interface OverlayLayerManagerOptions {
  /** Viewport size. Injected so the solver stays testable without a window. */
  readonly stage: () => SolverSize;
}

export interface OverlayLayerManager {
  register: (surface: OverlayManagedSurface) => () => void;
  /** Card ∪ target ∪ compass — whatever the creator is working on right now. */
  setReserved: (parts: readonly (SolverRect | null | undefined)[]) => void;
  /**
   * Surfaces to avoid that are *not* part of the work — our launcher in the host
   * page, for one. Kept out of the reserved rect on purpose: unioning a
   * bottom-right launcher with a top-right card would report the whole right-hand
   * edge as taken and evict chrome to a corner nothing is wrong with.
   */
  setObstacles: (parts: readonly (SolverRect | null | undefined)[]) => void;
  /** Re-place surfaces if the reserved rect moved enough to matter. */
  solve: (options?: { force?: boolean }) => void;
  /** Solved rects, for the overlap assertion in tests and diagnostics. */
  placements: () => readonly { readonly id: string; readonly rect: SolverRect }[];
  destroy: () => void;
}

export function createOverlayLayerManager(
  options: OverlayLayerManagerOptions,
): OverlayLayerManager {
  const surfaces = new Map<string, OverlayManagedSurface>();
  const placed = new Map<string, { corner: OverlayChromeCorner; rect: SolverRect }>();
  let reserved: SolverRect = { left: 0, top: 0, width: 0, height: 0 };
  let extraObstacles: readonly SolverRect[] = [];
  let solvedFor: SolverRect | null = null;

  function measure(surface: OverlayManagedSurface): SolverSize {
    const rect = surface.element.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  function apply(
    surface: OverlayManagedSurface,
    corner: OverlayChromeCorner,
    rect: SolverRect,
    displaced: boolean,
    slid: boolean,
  ): void {
    const previous = placed.get(surface.id);
    placed.set(surface.id, { corner, rect });
    /**
     * A corner alone is usually enough — the stylesheet pins each one. When the
     * solver had to slide along an edge to find room the corner no longer says
     * where the surface goes, so the solved position is written out. Otherwise
     * the slide is computed and discarded, and the surface renders straight back
     * on top of whatever it was avoiding.
     */
    if (slid) {
      surface.element.style.top = `${rect.top}px`;
      surface.element.style.left = `${rect.left}px`;
      surface.element.style.right = 'auto';
      surface.element.style.bottom = 'auto';
    } else {
      surface.element.style.removeProperty('top');
      surface.element.style.removeProperty('left');
      surface.element.style.removeProperty('right');
      surface.element.style.removeProperty('bottom');
    }
    if (previous?.corner === corner) return;
    surface.element.dataset['corner'] = corner;
    surface.onPlaced?.(corner, displaced);
  }

  function solve({ force = false }: { force?: boolean } = {}): void {
    if (!force && !shouldResolve(solvedFor, reserved)) return;
    solvedFor = reserved;
    const stage = options.stage();
    // Each placement joins the obstacle list: rule 1 falls out of the ordering.
    const obstacles: SolverRect[] = [reserved, ...extraObstacles];
    for (const surface of surfaces.values()) {
      if (surface.element.hidden) {
        placed.delete(surface.id);
        continue;
      }
      const size = measure(surface);
      if (size.width === 0 || size.height === 0) continue;
      const solution = solveChromeAmong(size, stage, obstacles, surface.preference());
      apply(surface, solution.corner, solution.rect, solution.collides, solution.slid);
      obstacles.push(solution.rect);
    }
  }

  return {
    register: (surface) => {
      surfaces.set(surface.id, surface);
      solvedFor = null;
      return () => {
        surfaces.delete(surface.id);
        placed.delete(surface.id);
      };
    },
    setReserved: (parts) => {
      reserved = reservedRect(parts);
    },
    setObstacles: (parts) => {
      const next = parts.filter(
        (rect): rect is SolverRect => Boolean(rect) && rect!.width > 0 && rect!.height > 0,
      );
      // A launcher that moved is a reason to re-solve, same as the card moving.
      if (next.length !== extraObstacles.length) solvedFor = null;
      extraObstacles = next;
    },
    solve,
    placements: () =>
      [...placed.entries()].map(([id, entry]) => ({ id, rect: entry.rect })),
    destroy: () => {
      surfaces.clear();
      placed.clear();
    },
  };
}

/** Creator's chosen corner first, then the stable fallback order (§3.4 rule 2). */
export function cornerPreference(
  chosen: OverlayChromeCorner,
  order: readonly OverlayChromeCorner[],
): readonly OverlayChromeCorner[] {
  return [chosen, ...order.filter((corner) => corner !== chosen)];
}
