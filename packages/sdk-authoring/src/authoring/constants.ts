export const LOCAL_AUTHORING_SESSION_ID = 'local_authoring_session' as const;
export const LOCAL_AUTHORING_ANCHOR_CHANGE_EVENT = 'lodariq-authoring-anchorchange' as const;
export const LOCAL_AUTHORING_PANEL_TOGGLE_EVENT = 'lodariq-authoring-panel-toggle' as const;
/**
 * The panel asking whoever owns the experiences to introduce itself (§3.3).
 *
 * A handshake rather than a shared module: the launcher and the panel are
 * installed independently and need not have been bundled into the same chunk,
 * so the only thing they reliably share is the window they are both in.
 */
export const LOCAL_AUTHORING_EXPERIENCE_PROVIDER_EVENT =
  'lodariq-authoring-experience-provider' as const;
export const LOCAL_AUTHORING_OPEN_MANUAL_PLACEMENT_KEY =
  'lodariqAuthoringOpenManualPlacement' as const;
