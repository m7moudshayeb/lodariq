/**
 * Overlay chrome measurements, derived from the token module.
 *
 * This file exists so the shell can keep using the `OVERLAY_*_PX` names it
 * already imports while every value has a single definition in
 * `creator-chrome-tokens.ts`. Nothing here may introduce a new literal — if a
 * measurement is missing, add it to `OVERLAY_CHROME_GEOMETRY`, not here.
 *
 * Reference: docs/plans/authoring-ux-model.md §3.4, §4.2a, §4.3
 *            docs/product-design/prototypes/authoring-spec.html → "Measurements"
 */
import {
  OVERLAY_CHROME_GEOMETRY,
  OVERLAY_CHROME_GHOST_OPACITY,
  OVERLAY_CHROME_MOTION,
} from '../../creator-chrome-tokens';

/** Toolbar (§4.2a). Deliberately not width-coupled to the card. */
export const OVERLAY_TOOLBAR_HEIGHT_PX = OVERLAY_CHROME_GEOMETRY.toolbarHeight;
export const OVERLAY_TOOLBAR_GAP_PX = OVERLAY_CHROME_GEOMETRY.toolbarGap;
export const OVERLAY_TOOLBAR_MIN_WIDTH_PX = OVERLAY_CHROME_GEOMETRY.toolbarMinWidth;
export const OVERLAY_TOOLBAR_RADIUS_PX = OVERLAY_CHROME_GEOMETRY.toolbarRadius;
export const OVERLAY_CONTROL_RADIUS_PX = OVERLAY_CHROME_GEOMETRY.controlRadius;
/** Vertical space the toolbar occupies including its gap to the card. */
export const OVERLAY_TOOLBAR_BAND_PX = OVERLAY_TOOLBAR_HEIGHT_PX + OVERLAY_TOOLBAR_GAP_PX;

/** Stage (§3.4). */
export const OVERLAY_CHROME_PAD_PX = OVERLAY_CHROME_GEOMETRY.stagePadding;
export const OVERLAY_RESOLVE_HYSTERESIS_PX = OVERLAY_CHROME_GEOMETRY.resolveHysteresis;

/**
 * Gutter reserved beside the card for block handles.
 *
 * Zero on the host page: handles render inside the editor iframe's own margin
 * (§4.2a rule 6), so the host does not need to reserve space for them.
 */
export const OVERLAY_HANDLE_GUTTER_PX = 0;

/** Inspector (§4.3). */
export const OVERLAY_INSPECTOR_WIDTH_PX = OVERLAY_CHROME_GEOMETRY.inspectorWidth;
export const OVERLAY_INSPECTOR_GAP_PX = OVERLAY_CHROME_GEOMETRY.inspectorGap;
/** Horizontal space the inspector occupies including its gap to the card. */
export const OVERLAY_INSPECTOR_BAND_PX =
  OVERLAY_INSPECTOR_WIDTH_PX + OVERLAY_INSPECTOR_GAP_PX;
export const OVERLAY_INSPECTOR_MAX_HEIGHT_RATIO =
  OVERLAY_CHROME_GEOMETRY.inspectorMaxHeightRatio;
export const OVERLAY_INSPECTOR_MIN_HEIGHT_PX = OVERLAY_CHROME_GEOMETRY.inspectorMinHeight;
export const OVERLAY_INSPECTOR_MAX_SECTIONS =
  OVERLAY_CHROME_GEOMETRY.inspectorMaxSections;

/** Mode pill (§4.1). Must never grow into a rail. */
export const OVERLAY_PILL_HEIGHT_PX = OVERLAY_CHROME_GEOMETRY.pillHeight;
export const OVERLAY_PILL_COLLAPSED_PX = OVERLAY_CHROME_GEOMETRY.pillCollapsedSize;
export const OVERLAY_PILL_IDLE_COLLAPSE_MS = OVERLAY_CHROME_GEOMETRY.pillIdleCollapseMs;

/** Card (§4.2a). */
export const OVERLAY_CARD_GUTTER_OFFSET_PX = OVERLAY_CHROME_GEOMETRY.cardGutterOffset;

export const OVERLAY_MOTION = OVERLAY_CHROME_MOTION;
export const OVERLAY_GHOST_OPACITY = OVERLAY_CHROME_GHOST_OPACITY;
