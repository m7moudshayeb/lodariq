export const RELEASE_RECOVERY_ACTIONS = ['rollback', 'unpublish'] as const;

/** Closed, client-safe recovery failures; messages never carry publication data. */
export const RELEASE_RECOVERY_FAILURE_CODES = [
  'capability_denied',
  'environment_not_configured',
  'document_not_found',
  'rollback_target_invalid',
  'artifact_incompatible',
  'deployment_changed',
  'already_inactive',
  'idempotency_conflict',
  'release_operation_in_progress',
  'internal_error',
] as const;

export const RELEASE_RECOVERY_FAILURE_MESSAGES = {
  capability_denied: 'The current actor cannot perform this release recovery action',
  environment_not_configured: 'The release environment is not configured',
  document_not_found: 'The release document was not found',
  rollback_target_invalid: 'The rollback target is not a prior successful publication',
  artifact_incompatible: 'The rollback target artifact is not supported by the current runtime',
  deployment_changed: 'The active document deployment changed before recovery could complete',
  already_inactive: 'The document deployment is already inactive',
  idempotency_conflict: 'The idempotency key was already used for a different recovery request',
  release_operation_in_progress: 'Another release operation is already in progress',
  internal_error: 'Release recovery could not be completed',
} as const satisfies Record<(typeof RELEASE_RECOVERY_FAILURE_CODES)[number], string>;
