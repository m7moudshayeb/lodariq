export const ACCESSIBILITY_GOVERNANCE_CONTRACT_VERSION = '2026-08-22.1' as const;

export const ACCESSIBILITY_FINDING_CODES = [
  'artifact_unavailable',
  'contrast_unusable',
  'contrast_below_target',
  'missing_accessible_name',
  'missing_captions',
  'compact_viewport_risk',
  'long_copy_risk',
] as const;

export const ACCESSIBILITY_FINDING_SEVERITIES = ['warning', 'blocker'] as const;
export const ACCESSIBILITY_FINDING_STATUSES = ['open', 'resolved'] as const;

export const ACCESSIBILITY_FINDING_LABELS = {
  artifact_unavailable: 'Current compiled artifact is unavailable',
  contrast_unusable: 'Text or control contrast is unusable',
  contrast_below_target: 'Text or control contrast is below target',
  missing_accessible_name: 'Accessible name is missing',
  missing_captions: 'Video captions are missing',
  compact_viewport_risk: 'Content may not fit at a compact viewport',
  long_copy_risk: 'Long copy may be difficult to read or zoom',
} as const satisfies Record<(typeof ACCESSIBILITY_FINDING_CODES)[number], string>;
