import {
  ReleaseRecoveryResult as ReleaseRecoveryResultSchema,
  ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseSchema,
  releaseRecoveryStateMatchesScope,
  validate,
  type ReleaseRecoveryReadScope,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';

export class ReleaseRecoveryResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseRecoveryResponseValidationError';
  }
}

/** Compiler-free validation boundary for persisted recovery reads. */
export function validateReleaseRecoveryStateResponse(
  value: unknown,
  scope: ReleaseRecoveryReadScope,
): ReleaseRecoveryStateResponse {
  const result = validate(ReleaseRecoveryStateResponseSchema, value);
  if (!result.valid) {
    throw new ReleaseRecoveryResponseValidationError(
      'release recovery state failed contract validation',
    );
  }
  if (!releaseRecoveryStateMatchesScope(result.value, scope)) {
    throw new ReleaseRecoveryResponseValidationError(
      'release recovery state failed contract or scope validation',
    );
  }
  return result.value;
}

/** Compiler-free validation boundary for every closed recovery outcome. */
export function validateReleaseRecoveryResult(value: unknown): ReleaseRecoveryResult {
  const result = validate(ReleaseRecoveryResultSchema, value);
  if (!result.valid) {
    throw new ReleaseRecoveryResponseValidationError(
      'release recovery result failed contract validation',
    );
  }
  return result.value;
}

export function releaseRecoveryHttpStatus(
  result: ReleaseRecoveryResult,
): 200 | 201 | 403 | 409 | 500 {
  if (result.ok) return result.replayed ? 200 : 201;
  if (result.code === 'capability_denied') return 403;
  return result.code === 'internal_error' ? 500 : 409;
}
