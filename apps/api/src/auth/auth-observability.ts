import { randomBytes } from 'node:crypto';
import { AUTH_CORRELATION_HEADER } from '@lodariq/schema';
import type { ObservabilitySink } from '../observability';

export { AUTH_CORRELATION_HEADER };

export const AUTH_OBSERVABILITY_EVENTS = Object.freeze({
  recoveryRequested: 'auth.recovery.requested',
  recoveryChallengePersisted: 'auth.recovery.challenge.persisted',
  recoveryRequestCompleted: 'auth.recovery.request.completed',
  recoveryChallengeResolved: 'auth.recovery.challenge.resolved',
  recoveryChallengeConsumed: 'auth.recovery.challenge.consumed',
});

export function createAuthCorrelationId(): string {
  return `authcorr_${randomBytes(18).toString('base64url')}`;
}

export function emitAuthRecoveryEvent(
  sink: ObservabilitySink,
  input: {
    name: (typeof AUTH_OBSERVABILITY_EVENTS)[keyof typeof AUTH_OBSERVABILITY_EVENTS];
    correlationId: string;
    observedAt: Date;
    attributes: Record<string, unknown>;
  },
): void {
  sink.emit({
    name: input.name,
    timestamp: input.observedAt.toISOString(),
    correlationId: input.correlationId,
    attributes: input.attributes,
  });
}
