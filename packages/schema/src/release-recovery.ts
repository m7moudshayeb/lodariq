import type {
  ActiveDocumentDeployment,
  DocumentDeployment,
  ReleaseArtifactPins,
  ReleaseRecoveryFailure,
  ReleaseRecoveryFailureHistoryEntry,
  ReleaseRecoveryFailureCode,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
  RollbackReleaseHistoryEntry,
  RollbackReleaseRequest,
  RollbackReleaseSuccess,
  UnpublishReleaseHistoryEntry,
  UnpublishReleaseRequest,
  UnpublishReleaseSuccess,
} from './release';
import { RELEASE_RECOVERY_FAILURE_MESSAGES } from './release-recovery-constants';

export interface ReleaseRecoveryReadScope {
  workspaceId: string;
  environmentId: string;
  documentId: string;
}

/**
 * Enforces response-to-request and nested-row scope equality that JSON Schema
 * cannot express. Callers should run this before rendering server recovery data.
 */
export function releaseRecoveryStateMatchesScope(
  state: ReleaseRecoveryStateResponse,
  expectedScope: ReleaseRecoveryReadScope,
): boolean {
  if (!recoveryReadScopesEqual(state, expectedScope)) return false;
  if (state.deployment && !recoveryReadScopesEqual(state.deployment, expectedScope)) {
    return false;
  }
  return state.history.every((entry) => recoveryReadScopesEqual(entry, expectedScope));
}

export interface ReleaseRecoveryPublicationSnapshot {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  generation: number;
  outcome: 'succeeded' | 'failed';
  artifact: ReleaseArtifactPins;
}

function recoveryReadScopesEqual(
  left: ReleaseRecoveryReadScope,
  right: ReleaseRecoveryReadScope,
): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.environmentId === right.environmentId &&
    left.documentId === right.documentId
  );
}

export interface ReleaseRecoveryOperationSnapshot {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  request: ReleaseRecoveryRequest;
  result: ReleaseRecoveryResult;
}

interface EvaluateReleaseRecoveryBase {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  actorUserId: string;
  deployment: DocumentDeployment | null;
  publications: readonly ReleaseRecoveryPublicationSnapshot[];
  operations: readonly ReleaseRecoveryOperationSnapshot[];
  newReleaseOperationId: string;
  occurredAt: string;
}

type EvaluateRollbackInput = EvaluateReleaseRecoveryBase & {
  request: RollbackReleaseRequest;
  newPublicationId: string;
  deployableRollbackTargetPublicationIds: ReadonlySet<string>;
};

type EvaluateUnpublishInput = EvaluateReleaseRecoveryBase & {
  request: UnpublishReleaseRequest;
  newPublicationId?: never;
};

export type EvaluateReleaseRecoveryInput = EvaluateRollbackInput | EvaluateUnpublishInput;

interface RecoveryOperationCommit {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  request: ReleaseRecoveryRequest;
  result: RollbackReleaseSuccess | UnpublishReleaseSuccess;
}

export interface RollbackPublicationCommit extends ReleaseRecoveryPublicationSnapshot {
  outcome: 'succeeded';
  sourcePublicationId: string;
  previousPublicationId: string;
}

export interface RollbackRecoveryCommit {
  kind: 'commit';
  action: 'rollback';
  artifactDisposition: 'reuse_existing';
  operation: RecoveryOperationCommit;
  deployment: ActiveDocumentDeployment;
  publication: RollbackPublicationCommit;
  history: RollbackReleaseHistoryEntry;
  result: RollbackReleaseSuccess;
}

export interface UnpublishRecoveryCommit {
  kind: 'commit';
  action: 'unpublish';
  artifactDisposition: 'reuse_existing';
  operation: RecoveryOperationCommit;
  deployment: Extract<DocumentDeployment, { state: 'inactive' }>;
  publication: null;
  history: UnpublishReleaseHistoryEntry;
  result: UnpublishReleaseSuccess;
}

export type ReleaseRecoveryCommit = RollbackRecoveryCommit | UnpublishRecoveryCommit;

export interface PersistableReleaseRecoveryReject {
  kind: 'reject';
  persistFailure: true;
  result: ReleaseRecoveryFailure;
  operation: ReleaseRecoveryOperationSnapshot;
  history: ReleaseRecoveryFailureHistoryEntry;
}

export interface NonPersistingReleaseRecoveryReject {
  kind: 'reject';
  persistFailure: false;
  result: ReleaseRecoveryFailure;
  operation: null;
  history: null;
  existingReleaseOperationId?: string;
}

export type ReleaseRecoveryDecision =
  | ReleaseRecoveryCommit
  | { kind: 'replay'; result: ReleaseRecoveryResult }
  | PersistableReleaseRecoveryReject
  | NonPersistingReleaseRecoveryReject;

/**
 * Deterministic recovery decision shared by memory and transactional adapters.
 * It never compiles, mutates its inputs, or derives artifact pins from the
 * request; rollback reuses only the exact server-loaded target publication.
 */
export function evaluateReleaseRecovery(
  input: EvaluateReleaseRecoveryInput,
): ReleaseRecoveryDecision {
  const replay = findIdempotentOperation(input);
  if (replay) {
    if (!releaseRecoveryRequestsEqual(replay.request, input.request)) {
      return rejectWithoutPersistence(input, 'idempotency_conflict', replay.id);
    }
    if (replay.result.action !== input.request.action) {
      return rejectWithoutPersistence(input, 'internal_error', replay.id);
    }
    return { kind: 'replay', result: { ...replay.result, replayed: true } };
  }

  const deployment = input.deployment;
  if (!deployment || deployment.state === 'inactive') {
    return reject(input, 'already_inactive', {
      ...(deployment ? { actualGeneration: deployment.generation } : {}),
      actualActivePublicationId: null,
    });
  }
  if (!deploymentMatchesScope(input, deployment)) {
    return reject(input, 'internal_error');
  }
  if (deployment.pendingReleaseOperationId) {
    return reject(input, 'release_operation_in_progress');
  }
  if (
    deployment.generation !== input.request.expectedGeneration ||
    (input.request.expectedActivePublicationId !== undefined &&
      input.request.expectedActivePublicationId !== deployment.activePublicationId)
  ) {
    return reject(input, 'deployment_changed', {
      actualGeneration: deployment.generation,
      actualActivePublicationId: deployment.activePublicationId,
    });
  }

  const activePublication = findPublication(input, deployment.activePublicationId);
  if (
    !activePublication ||
    activePublication.outcome !== 'succeeded' ||
    activePublication.generation !== deployment.generation
  ) {
    return reject(input, 'internal_error');
  }
  const duplicateOperation = findOperationById(input);
  if (duplicateOperation) {
    return rejectWithoutPersistence(input, 'internal_error', duplicateOperation.id);
  }

  return isRollbackInput(input)
    ? evaluateRollback(input, deployment, activePublication)
    : evaluateUnpublish(input, deployment, activePublication);
}

export function releaseRecoveryRequestsEqual(
  left: ReleaseRecoveryRequest,
  right: ReleaseRecoveryRequest,
): boolean {
  if (
    left.action !== right.action ||
    left.reason !== right.reason ||
    left.expectedGeneration !== right.expectedGeneration ||
    left.expectedActivePublicationId !== right.expectedActivePublicationId ||
    left.idempotencyKey !== right.idempotencyKey ||
    left.correlationId !== right.correlationId
  ) {
    return false;
  }
  if (left.action === 'rollback' && right.action === 'rollback') {
    return left.targetPublicationId === right.targetPublicationId;
  }
  return left.action === 'unpublish' && right.action === 'unpublish';
}

function evaluateRollback(
  input: EvaluateRollbackInput,
  deployment: ActiveDocumentDeployment,
  activePublication: ReleaseRecoveryPublicationSnapshot,
): ReleaseRecoveryDecision {
  const target = findPublication(input, input.request.targetPublicationId);
  if (
    !target ||
    target.outcome !== 'succeeded' ||
    target.id === activePublication.id ||
    target.generation >= deployment.generation
  ) {
    return reject(input, 'rollback_target_invalid');
  }
  if (!input.deployableRollbackTargetPublicationIds.has(target.id)) {
    return reject(input, 'artifact_incompatible');
  }
  if (!input.newPublicationId || findPublication(input, input.newPublicationId)) {
    return reject(input, 'internal_error');
  }

  const generation = deployment.generation + 1;
  const artifact = copyArtifactPins(target.artifact);
  const result: RollbackReleaseSuccess = {
    ok: true,
    action: 'rollback',
    state: 'active',
    replayed: false,
    releaseOperationId: input.newReleaseOperationId,
    publicationId: input.newPublicationId,
    targetPublicationId: target.id,
    previousPublicationId: activePublication.id,
    generation,
    artifact,
    completedAt: input.occurredAt,
  };
  const publication: RollbackPublicationCommit = {
    id: input.newPublicationId,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    generation,
    outcome: 'succeeded',
    sourcePublicationId: target.id,
    previousPublicationId: activePublication.id,
    artifact: copyArtifactPins(target.artifact),
  };
  const history: RollbackReleaseHistoryEntry = {
    ...historyIdentity(input, generation),
    action: 'rollback',
    state: 'active',
    publicationId: input.newPublicationId,
    targetPublicationId: target.id,
    previousPublicationId: activePublication.id,
    reason: input.request.reason,
    artifact: copyArtifactPins(target.artifact),
  };
  const nextDeployment: ActiveDocumentDeployment = {
    ...deployment,
    state: 'active',
    generation,
    activePublicationId: input.newPublicationId,
    pendingReleaseOperationId: null,
    updatedAt: input.occurredAt,
  };
  return {
    kind: 'commit',
    action: 'rollback',
    artifactDisposition: 'reuse_existing',
    operation: operationCommit(input, result),
    deployment: nextDeployment,
    publication,
    history,
    result,
  };
}

function evaluateUnpublish(
  input: EvaluateUnpublishInput,
  deployment: ActiveDocumentDeployment,
  activePublication: ReleaseRecoveryPublicationSnapshot,
): UnpublishRecoveryCommit {
  const generation = deployment.generation + 1;
  const deactivatedArtifact = copyArtifactPins(activePublication.artifact);
  const result: UnpublishReleaseSuccess = {
    ok: true,
    action: 'unpublish',
    state: 'inactive',
    replayed: false,
    releaseOperationId: input.newReleaseOperationId,
    previousPublicationId: activePublication.id,
    generation,
    deactivatedArtifact,
    completedAt: input.occurredAt,
  };
  const history: UnpublishReleaseHistoryEntry = {
    ...historyIdentity(input, generation),
    action: 'unpublish',
    state: 'inactive',
    previousPublicationId: activePublication.id,
    reason: input.request.reason,
    deactivatedArtifact: copyArtifactPins(activePublication.artifact),
  };
  return {
    kind: 'commit',
    action: 'unpublish',
    artifactDisposition: 'reuse_existing',
    operation: operationCommit(input, result),
    deployment: {
      workspaceId: deployment.workspaceId,
      environmentId: deployment.environmentId,
      documentId: deployment.documentId,
      state: 'inactive',
      generation,
      activePublicationId: null,
      pendingReleaseOperationId: null,
      updatedAt: input.occurredAt,
    },
    publication: null,
    history,
    result,
  };
}

function findIdempotentOperation(
  input: EvaluateReleaseRecoveryInput,
): ReleaseRecoveryOperationSnapshot | undefined {
  return input.operations.find(
    (operation) =>
      operation.workspaceId === input.workspaceId &&
      operation.environmentId === input.environmentId &&
      operation.documentId === input.documentId &&
      operation.request.idempotencyKey === input.request.idempotencyKey,
  );
}

function findPublication(
  input: EvaluateReleaseRecoveryInput,
  publicationId: string,
): ReleaseRecoveryPublicationSnapshot | undefined {
  return input.publications.find(
    (publication) =>
      publication.id === publicationId &&
      publication.workspaceId === input.workspaceId &&
      publication.environmentId === input.environmentId &&
      publication.documentId === input.documentId,
  );
}

function deploymentMatchesScope(
  input: EvaluateReleaseRecoveryInput,
  deployment: ActiveDocumentDeployment,
): boolean {
  return (
    deployment.workspaceId === input.workspaceId &&
    deployment.environmentId === input.environmentId &&
    deployment.documentId === input.documentId
  );
}

function findOperationById(
  input: EvaluateReleaseRecoveryInput,
): ReleaseRecoveryOperationSnapshot | undefined {
  return input.operations.find((operation) => operation.id === input.newReleaseOperationId);
}

function historyIdentity(input: EvaluateReleaseRecoveryInput, generation: number) {
  return {
    id: input.newReleaseOperationId,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    releaseOperationId: input.newReleaseOperationId,
    generation,
    idempotencyKey: input.request.idempotencyKey,
    correlationId: input.request.correlationId,
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt,
  };
}

function operationCommit(
  input: EvaluateReleaseRecoveryInput,
  result: RollbackReleaseSuccess | UnpublishReleaseSuccess,
): RecoveryOperationCommit {
  return {
    id: input.newReleaseOperationId,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    request: input.request,
    result,
  };
}

interface RecoveryFailureDetails {
  actualGeneration?: number;
  actualActivePublicationId?: string | null;
}

function reject(
  input: EvaluateReleaseRecoveryInput,
  code: ReleaseRecoveryFailureCode,
  details: RecoveryFailureDetails = {},
): PersistableReleaseRecoveryReject {
  const request = input.request;
  const message = RELEASE_RECOVERY_FAILURE_MESSAGES[code];
  const actualGeneration = details.actualGeneration ?? input.deployment?.generation;
  let actualActivePublicationId = details.actualActivePublicationId;
  if (!('actualActivePublicationId' in details) && input.deployment?.state === 'active') {
    actualActivePublicationId = input.deployment.activePublicationId;
  }
  const result = {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message,
    releaseOperationId: input.newReleaseOperationId,
    expectedGeneration: request.expectedGeneration,
    ...(actualGeneration !== undefined ? { actualGeneration } : {}),
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
    ...(actualActivePublicationId !== undefined ? { actualActivePublicationId } : {}),
  } as ReleaseRecoveryFailure;
  const historyBase = {
    id: input.newReleaseOperationId,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    releaseOperationId: input.newReleaseOperationId,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt,
    state: 'failed' as const,
    reason: request.reason,
    expectedGeneration: request.expectedGeneration,
    ...(actualGeneration !== undefined ? { actualGeneration } : {}),
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
    ...(actualActivePublicationId !== undefined ? { actualActivePublicationId } : {}),
    failure: { code, message },
  };
  const history = (
    isRollbackInput(input)
      ? {
          ...historyBase,
          action: 'rollback',
          targetPublicationId: input.request.targetPublicationId,
        }
      : { ...historyBase, action: 'unpublish' }
  ) as ReleaseRecoveryFailureHistoryEntry;
  return {
    kind: 'reject',
    persistFailure: true,
    result,
    operation: {
      id: input.newReleaseOperationId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      request: input.request,
      result,
    },
    history,
  };
}

function rejectWithoutPersistence(
  input: EvaluateReleaseRecoveryInput,
  code: ReleaseRecoveryFailureCode,
  existingReleaseOperationId?: string,
): NonPersistingReleaseRecoveryReject {
  const request = input.request;
  const result = {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    expectedGeneration: request.expectedGeneration,
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
  } as ReleaseRecoveryFailure;
  return {
    kind: 'reject',
    persistFailure: false,
    result,
    operation: null,
    history: null,
    ...(existingReleaseOperationId ? { existingReleaseOperationId } : {}),
  };
}

function copyArtifactPins(artifact: ReleaseArtifactPins): ReleaseArtifactPins {
  return { ...artifact };
}

function isRollbackInput(input: EvaluateReleaseRecoveryInput): input is EvaluateRollbackInput {
  return input.request.action === 'rollback';
}
