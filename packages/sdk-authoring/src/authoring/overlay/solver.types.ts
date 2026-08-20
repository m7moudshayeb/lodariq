/**
 * Types for the overlay layout solver.
 *
 * The solver is pure — rects in, placements out. No DOM, no React, no knowledge
 * of experience types, which is what makes the collision invariants in §3.4
 * testable without a browser.
 */

export interface SolverRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SolverSize {
  readonly width: number;
  readonly height: number;
}

/** Where the toolbar ended up relative to the card (§4.2a rule 2). */
export const OVERLAY_TOOLBAR_PLACEMENTS = ['above', 'below', 'docked'] as const;
export type OverlayToolbarPlacement = (typeof OVERLAY_TOOLBAR_PLACEMENTS)[number];

/** Where the inspector ended up relative to its anchor (§4.3). */
export const OVERLAY_INSPECTOR_ANCHORS = ['right', 'left', 'corner'] as const;
export type OverlayInspectorAnchor = (typeof OVERLAY_INSPECTOR_ANCHORS)[number];

/**
 * Corner preference for unanchored chrome. Fixed order rather than nearest-free:
 * a solver that picks the closest gap makes chrome hop corners as the card grows,
 * which reads as a bug even though each placement is individually correct.
 */
export const OVERLAY_CHROME_CORNERS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const;
export type OverlayChromeCorner = (typeof OVERLAY_CHROME_CORNERS)[number];

export interface OverlayToolbarSolution {
  readonly rect: SolverRect;
  readonly placement: OverlayToolbarPlacement;
  /** How far the toolbar extends past the card. Asserted by tests and shown in dev overlay. */
  readonly overhang: number;
}

export interface OverlayInspectorSolution {
  readonly rect: SolverRect;
  readonly anchor: OverlayInspectorAnchor;
  /** True when the inspector could not sit beside its anchor and needs a leader line. */
  readonly needsLeader: boolean;
}

export interface OverlayChromeSolution {
  readonly rect: SolverRect;
  readonly corner: OverlayChromeCorner;
  /**
   * True when no corner cleared the reserved rect. The caller falls back to the
   * first corner and relies on the creator's Move/Hide affordance (§3.4 rule 4).
   */
  readonly collides: boolean;
  /**
   * True when the surface had to slide along its edge to find room. The corner
   * no longer describes where it sits, so the caller must honour `rect`.
   */
  readonly slid: boolean;
}
