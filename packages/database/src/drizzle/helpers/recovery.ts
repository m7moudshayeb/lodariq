import {
  RELEASE_RECOVERY_FAILURE_CODES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  evaluateEnvironmentReleasePolicy,
  type ControlPlaneRole,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryFailure,
  type ReleaseRecoveryFailureCode,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  type PersistedDocumentDeployment,
  type PersistedReleaseOperation,
  type ReleaseRecoveryScopeInput,
  type WorkspaceEnvironment,
  ReleaseRecoveryHistoryIntegrityError,
  toWorkspaceEnvironmentPolicyRow,
} from '../../repository';
import type { DrizzleReleaseRecoveryPublicationMaterial } from '../types';

export function drizzleRecoveryOperationMatchesRequest(
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
    operation.correlationId === request.correlationId &&
    operation.requestHash === requestHash
  );
}

export function drizzleRecoveryRequestFromOperation(
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

export function drizzleNonPersistingRecoveryFailure(
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

export function drizzlePersistedRecoveryFailure(
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
      ? { actualActivePublicationId: deployment.activePublicationId }
      : {}),
  };
}

export function drizzleReleaseRecoveryPolicyFailure(
  environment: WorkspaceEnvironment,
  membershipRole: ControlPlaneRole,
  actorUserId: string,
  action: ReleaseRecoveryRequest['action'],
): ReleaseRecoveryFailureCode | null {
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

export function drizzleReleaseRecoveryPermissions(
  environment: WorkspaceEnvironment,
  membershipRole: ControlPlaneRole,
  actorUserId: string,
): ReleaseRecoveryStateResponse['permissions'] {
  return {
    rollback:
      drizzleReleaseRecoveryPolicyFailure(environment, membershipRole, actorUserId, 'rollback') ===
      null,
    unpublish:
      drizzleReleaseRecoveryPolicyFailure(environment, membershipRole, actorUserId, 'unpublish') ===
      null,
  };
}

export function isDrizzleRecoveryFailureCode(
  code: string | null,
): code is ReleaseRecoveryFailureCode {
  return Boolean(code && RELEASE_RECOVERY_FAILURE_CODES.some((candidate) => candidate === code));
}

export function buildDrizzleReleaseRecoveryHistory(
  materials: readonly DrizzleReleaseRecoveryPublicationMaterial[],
  operations: readonly PersistedReleaseOperation[],
): ReleaseHistoryEntry[] {
  const history: ReleaseHistoryEntry[] = [];
  const materialByPublicationId = new Map(
    materials.map((material) => [material.publication.id, material] as const),
  );
  for (const { operation, publication, snapshot } of materials) {
    if (!operation.completedAt || operation.resultGeneration === null) {
      throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
    }
    const identity = {
      id: operation.id,
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      releaseOperationId: operation.id,
      generation: operation.resultGeneration,
      idempotencyKey: operation.idempotencyKey,
      correlationId: operation.correlationId,
      actorUserId: operation.requestedByUserId,
      occurredAt: operation.completedAt,
    };
    if (operation.action === 'publish') {
      history.push({
        ...identity,
        action: 'publish',
        state: 'active',
        publicationId: publication.id,
        previousPublicationId: publication.previousPublicationId,
        artifact: { ...snapshot.artifact },
      });
    } else if (operation.action === 'promote' && operation.sourcePublicationId) {
      history.push({
        ...identity,
        action: 'promote',
        state: 'active',
        publicationId: publication.id,
        sourcePublicationId: operation.sourcePublicationId,
        previousPublicationId: publication.previousPublicationId,
        artifact: { ...snapshot.artifact },
      });
    } else if (
      operation.action === 'rollback' &&
      operation.sourcePublicationId &&
      publication.previousPublicationId &&
      operation.reason
    ) {
      history.push({
        ...identity,
        action: 'rollback',
        state: 'active',
        publicationId: publication.id,
        targetPublicationId: operation.sourcePublicationId,
        previousPublicationId: publication.previousPublicationId,
        reason: operation.reason,
        artifact: { ...snapshot.artifact },
      });
    } else {
      throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
    }
  }

  for (const operation of operations) {
    if (
      (operation.action !== 'rollback' && operation.action !== 'unpublish') ||
      (operation.status !== 'completed' && operation.status !== 'failed')
    ) {
      continue;
    }
    if (!operation.completedAt || !operation.reason) {
      throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
    }
    if (operation.action === 'unpublish' && operation.status === 'completed') {
      if (operation.resultGeneration === null || !operation.actualActivePublicationId) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const previous = materialByPublicationId.get(operation.actualActivePublicationId);
      if (!previous) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      history.push({
        id: operation.id,
        workspaceId: operation.workspaceId,
        environmentId: operation.environmentId,
        documentId: operation.documentId,
        releaseOperationId: operation.id,
        generation: operation.resultGeneration,
        idempotencyKey: operation.idempotencyKey,
        correlationId: operation.correlationId,
        actorUserId: operation.requestedByUserId,
        occurredAt: operation.completedAt,
        action: 'unpublish',
        state: 'inactive',
        previousPublicationId: operation.actualActivePublicationId,
        reason: operation.reason,
        deactivatedArtifact: { ...previous.snapshot.artifact },
      });
      continue;
    }
    if (operation.status === 'completed') continue;
    if (!isDrizzleRecoveryFailureCode(operation.errorCode)) {
      throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
    }
    if (operation.action === 'rollback' && !operation.requestedSourcePublicationId) {
      throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
    }
    if (operation.status !== 'failed') {
      continue;
    }
    const failureBase = {
      id: operation.id,
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      releaseOperationId: operation.id,
      idempotencyKey: operation.idempotencyKey,
      correlationId: operation.correlationId,
      actorUserId: operation.requestedByUserId,
      occurredAt: operation.completedAt,
      state: 'failed' as const,
      reason: operation.reason,
      expectedGeneration: operation.expectedGeneration,
      ...(operation.resultGeneration !== null
        ? { actualGeneration: operation.resultGeneration }
        : {}),
      ...(operation.requestedActivePublicationId
        ? { expectedActivePublicationId: operation.requestedActivePublicationId }
        : {}),
      ...(operation.actualActivePublicationId
        ? { actualActivePublicationId: operation.actualActivePublicationId }
        : operation.errorCode === 'already_inactive'
          ? { actualActivePublicationId: null }
          : {}),
      failure: {
        code: operation.errorCode,
        message: RELEASE_RECOVERY_FAILURE_MESSAGES[operation.errorCode],
      },
    };
    if (operation.action === 'rollback' && operation.requestedSourcePublicationId) {
      history.push({
        ...failureBase,
        action: 'rollback',
        targetPublicationId: operation.requestedSourcePublicationId,
      });
    } else if (operation.action === 'unpublish') {
      history.push({ ...failureBase, action: 'unpublish' });
    }
  }
  return history.sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
  );
}
