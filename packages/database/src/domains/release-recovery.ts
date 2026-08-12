import { createHash } from 'node:crypto';
import {
  RELEASE_RECOVERY_FAILURE_CODES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  evaluateEnvironmentReleasePolicy,
  type ControlPlaneRole,
  type ReleaseRecoveryFailure,
  type ReleaseRecoveryFailureCode,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import { toWorkspaceEnvironmentPolicyRow, type WorkspaceEnvironment } from './environments';
import type {
  PersistedDocumentDeployment,
  PersistedReleaseOperation,
  ReleaseRecoveryScopeInput,
} from './releases';

export function createReleaseRecoveryRequestHash(
  input: Pick<
    ReleaseRecoveryScopeInput,
    'workspaceId' | 'environmentId' | 'documentId' | 'actorUserId'
  >,
  request: ReleaseRecoveryRequest,
): string {
  const canonicalRequest = {
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: request.action,
    reason: request.reason,
    expectedGeneration: request.expectedGeneration,
    expectedActivePublicationId: request.expectedActivePublicationId ?? null,
    targetPublicationId: request.action === 'rollback' ? request.targetPublicationId : null,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
  };
  return `sha256-${createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex')}`;
}

export function releaseRecoveryOperationMatchesRequest(
  operation: PersistedReleaseOperation,
  input: ReleaseRecoveryScopeInput,
  request: ReleaseRecoveryRequest,
  requestHash: string,
): boolean {
  return (
    operation.workspaceId === input.workspaceId &&
    operation.environmentId === input.environmentId &&
    operation.documentId === input.documentId &&
    operation.requestedByUserId === input.actorUserId &&
    operation.action === request.action &&
    operation.reason === request.reason &&
    operation.expectedGeneration === request.expectedGeneration &&
    operation.requestedActivePublicationId === (request.expectedActivePublicationId ?? null) &&
    operation.requestedSourcePublicationId ===
      (request.action === 'rollback' ? request.targetPublicationId : null) &&
    operation.idempotencyKey === request.idempotencyKey &&
    operation.correlationId === request.correlationId &&
    operation.requestHash === requestHash
  );
}

export function releaseRecoveryRequestFromOperation(
  operation: PersistedReleaseOperation,
): ReleaseRecoveryRequest | null {
  if ((operation.action !== 'rollback' && operation.action !== 'unpublish') || !operation.reason) {
    return null;
  }
  const shared = {
    reason: operation.reason,
    expectedGeneration: operation.expectedGeneration,
    ...(operation.requestedActivePublicationId
      ? { expectedActivePublicationId: operation.requestedActivePublicationId }
      : {}),
    idempotencyKey: operation.idempotencyKey,
    correlationId: operation.correlationId,
  };
  if (operation.action === 'rollback') {
    if (!operation.requestedSourcePublicationId) return null;
    return {
      action: 'rollback',
      targetPublicationId: operation.requestedSourcePublicationId,
      ...shared,
    };
  }
  return { action: 'unpublish', ...shared };
}

export function createCompletedRecoveryOperation(
  input: ReleaseRecoveryScopeInput,
  request: ReleaseRecoveryRequest,
  requestHash: string,
  result: Exclude<ReleaseRecoveryResult, ReleaseRecoveryFailure>,
  occurredAt: string,
): PersistedReleaseOperation {
  const rollback = result.action === 'rollback' ? result : null;
  return {
    id: result.releaseOperationId,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    action: request.action,
    requestedArtifactId: rollback?.artifact.compiledArtifactId ?? null,
    requestedSourcePublicationId:
      request.action === 'rollback' ? request.targetPublicationId : null,
    requestedActivePublicationId: request.expectedActivePublicationId ?? null,
    actualActivePublicationId: result.previousPublicationId,
    sourcePublicationId: rollback?.targetPublicationId ?? null,
    expectedGeneration: request.expectedGeneration,
    resultGeneration: result.generation,
    idempotencyKey: request.idempotencyKey,
    requestHash,
    status: 'completed',
    correlationId: request.correlationId,
    requestedByUserId: input.actorUserId,
    resultPublicationId: rollback?.publicationId ?? null,
    reason: request.reason,
    errorCode: null,
    createdAt: occurredAt,
    completedAt: occurredAt,
  };
}

export function createPersistedRecoveryFailure(
  request: ReleaseRecoveryRequest,
  code: ReleaseRecoveryFailureCode,
  operationId: string,
  deployment: PersistedDocumentDeployment | null,
): ReleaseRecoveryFailure {
  return {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    releaseOperationId: operationId,
    expectedGeneration: request.expectedGeneration,
    ...(deployment ? { actualGeneration: deployment.generation } : {}),
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
    ...(deployment?.state === 'active'
      ? {
          actualActivePublicationId: deployment.activePublicationId,
        }
      : {}),
  };
}

export function createNonPersistingRecoveryFailure(
  request: ReleaseRecoveryRequest,
  code: ReleaseRecoveryFailureCode,
  releaseOperationId?: string,
): ReleaseRecoveryFailure {
  return {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    ...(releaseOperationId ? { releaseOperationId } : {}),
    expectedGeneration: request.expectedGeneration,
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
  };
}

export function releaseRecoveryPermissions(
  environment: WorkspaceEnvironment,
  membershipRole: ControlPlaneRole | null,
): ReleaseRecoveryStateResponse['permissions'] {
  if (!membershipRole) return { rollback: false, unpublish: false };
  return {
    rollback:
      releaseRecoveryPolicyFailure(environment, membershipRole, 'permissions', 'rollback') === null,
    unpublish:
      releaseRecoveryPolicyFailure(environment, membershipRole, 'permissions', 'unpublish') ===
      null,
  };
}

export function releaseRecoveryPolicyFailure(
  environment: WorkspaceEnvironment,
  membershipRole: ControlPlaneRole | null,
  actorUserId: string,
  action: ReleaseRecoveryRequest['action'],
): ReleaseRecoveryFailureCode | null {
  if (!membershipRole) return 'capability_denied';
  const decision = evaluateEnvironmentReleasePolicy({
    environment: toWorkspaceEnvironmentPolicyRow(environment),
    actorRole: membershipRole,
    actorUserId,
    action,
  });
  if (decision.allowed) return null;
  return decision.code === 'environment_disabled'
    ? 'environment_not_configured'
    : 'capability_denied';
}

export function toControlPlaneRole(role: string | undefined): ControlPlaneRole | null {
  return role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer'
    ? role
    : null;
}

export function isReleaseRecoveryFailureCode(
  code: string | null,
): code is ReleaseRecoveryFailureCode {
  return Boolean(code && RELEASE_RECOVERY_FAILURE_CODES.some((candidate) => candidate === code));
}
