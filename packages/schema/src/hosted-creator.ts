/** Dependency-free registration boundary for the integrity-loaded creator entry. */
export const HOSTED_CREATOR_REGISTRATION_PROPERTY = '__lodariqRegisterHostedCreatorV1' as const;

/** Credential-free coordination between the permanent launcher and hosted panel chrome. */
export const HOSTED_CREATOR_PANEL_STATE_EVENT = 'lodariq:hosted-authoring-panel-state' as const;
export const HOSTED_CREATOR_PANEL_TOGGLE_EVENT = 'lodariq:hosted-authoring-panel-toggle' as const;
export const HOSTED_CREATOR_PANEL_STATES = ['closed', 'browsing', 'open', 'minimized'] as const;
export type HostedCreatorPanelState = (typeof HOSTED_CREATOR_PANEL_STATES)[number];
