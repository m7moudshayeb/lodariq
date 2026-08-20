export const LOCAL_AUTHORING_SESSION_ID = 'local_authoring_session' as const;
export const LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT = 'lodariq-authoring-anchorchange' as const;
export const LOCAL_AUTHORING_PANEL_TOGGLE_EVENT = 'lodariq-authoring-panel-toggle' as const;
/**
 * A launcher quick action asked for from inside the panel. The launcher owns
 * those surfaces; the panel only asks, so there is one implementation of "new
 * experience" rather than two that can drift.
 */
export const LOCAL_AUTHORING_LAUNCHER_ACTION_EVENT = 'lodariq-authoring-launcher-action' as const;
export const LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY =
  'lodariqAuthoringOpenManualPlacement' as const;
