/** Dependency-free constants shared by the dashboard and public SDK entry shell. */
export const AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER = 'lodariq-launcher' as const;
export const AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE = 'show' as const;
/** Non-secret UI preference carried from the dashboard into creator surfaces. */
export const AUTHORING_LOCALE_QUERY_PARAMETER = 'lodariq-locale' as const;
/** Non-secret deep-link scope consumed once by the customer-page SDK shell. */
export const AUTHORING_DOCUMENT_QUERY_PARAMETER = 'lodariq-document' as const;
export const AUTHORING_WORKSPACE_QUERY_PARAMETER = 'lodariq-workspace' as const;
export const AUTHORING_FOCUS_BLOCK_QUERY_PARAMETER = 'lodariq-focus-block' as const;
export const AUTHORING_FLOW_MAP_QUERY_VALUE = 'flow-map' as const;
export const AUTHORING_WORKSPACE_QUERY_VALUES = {
  canvas: 'canvas',
  flowMap: AUTHORING_FLOW_MAP_QUERY_VALUE,
  reviewRecovery: 'review-recovery',
} as const;
export const AUTHORING_LAUNCHER_SHORTCUT = {
  key: 'l',
  shiftKey: true,
  primaryModifier: true,
} as const;
export const AUTHORING_LAUNCHER_SHORTCUT_LABEL = 'Ctrl/⌘ + Shift + L' as const;
