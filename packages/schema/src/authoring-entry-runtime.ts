/** Dependency-free constants shared by the dashboard and public SDK entry shell. */
export const AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER = 'lodariq-launcher' as const;
export const AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE = 'show' as const;
/** Non-secret UI preference carried from the dashboard into creator surfaces. */
export const AUTHORING_LOCALE_QUERY_PARAMETER = 'lodariq-locale' as const;
export const AUTHORING_LAUNCHER_SHORTCUT = {
  key: 'l',
  shiftKey: true,
  primaryModifier: true,
} as const;
export const AUTHORING_LAUNCHER_SHORTCUT_LABEL = 'Ctrl/⌘ + Shift + L' as const;
