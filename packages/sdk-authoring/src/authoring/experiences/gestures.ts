/**
 * Tier-1 gestures, and the one that matters most: **edge-drag decides the form**
 * (§5).
 *
 * Announcements and checklists have two open questions each — modal or banner,
 * drawer or floating — that every product in the category asks as a radio group
 * before the creator has seen anything. Dropping the card answers both: the form is
 * a consequence of position, which makes it Tier 1 by definition.
 */
import type { ExperienceSurfaceForm } from '@lodariq/schema';

/** Named so §9's control map and the shipped affordances stay in step. */
export type ExperienceGesture =
  /** Drop into a viewport region, which decides the form. */
  | 'drag-to-region'
  /** Move the card relative to its target, which moves the presentation anchor. */
  | 'drag-anchor'
  | 'drag-marker'
  | 'resize'
  | 'reorder'
  | 'pick-target'
  | 'pick-marker-form'
  | 'reorder-items';

export type ViewportRegion = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** Within this fraction of a side, a drop counts as that edge. */
export const EDGE_REGION_RATIO = 0.2;

export interface DropPoint {
  readonly xRatio: number;
  readonly yRatio: number;
}

/**
 * Which region a normalized drop lands in. Vertical edges win ties, because a
 * banner is the stronger reading of a drop into a corner: it is the form that
 * spans, and a creator who wanted a side panel drags further in.
 */
export function dropRegion(point: DropPoint, edgeRatio = EDGE_REGION_RATIO): ViewportRegion {
  const x = clampRatio(point.xRatio);
  const y = clampRatio(point.yRatio);
  if (y <= edgeRatio) return 'top';
  if (y >= 1 - edgeRatio) return 'bottom';
  if (x <= edgeRatio) return 'left';
  if (x >= 1 - edgeRatio) return 'right';
  return 'center';
}

function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}

/**
 * Announcement: the top edge spans, so it is a banner; the other edges slide in
 * from where they were dropped; the centre is a modal.
 */
export function announcementFormFor(region: ViewportRegion): ExperienceSurfaceForm {
  if (region === 'top') return 'banner';
  return region === 'center' ? 'modal' : 'slideIn';
}

/** Checklist: any edge is a drawer; the middle floats. */
export function checklistFormFor(region: ViewportRegion): ExperienceSurfaceForm {
  return region === 'center' ? 'floating' : 'drawer';
}

/** The four marker forms a hotspot offers inline, rather than in a dropdown (§5). */
export const HOTSPOT_MARKER_FORMS = ['pulse', 'dot', 'ring', 'number'] as const;
export type HotspotMarkerForm = (typeof HOTSPOT_MARKER_FORMS)[number];
