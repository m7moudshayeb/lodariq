import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  releaseRecoveryStateMatchesScope,
  type DocumentDeployment,
  type ReleaseArtifactPins,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryReadScope,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import { authoringText } from '../i18n';

const RELEASE_ACTION_LABELS = {
  publish: authoringText('Published'),
  promote: authoringText('Promoted'),
  rollback: authoringText('Rolled back'),
  unpublish: authoringText('Unpublished'),
} as const satisfies Record<ReleaseHistoryEntry['action'], string>;

const RELEASE_STATE_LABELS = {
  active: authoringText('Active'),
  inactive: authoringText('Inactive'),
  failed: authoringText('Failed'),
} as const;

const MUTATION_IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const RELEASE_REASON_MAX_LENGTH = 500;

export type AuthoringReleaseRecoveryAction = ReleaseRecoveryRequest['action'];

export type AuthoringReleaseRecoveryScope = ReleaseRecoveryReadScope;

export interface AuthoringReleaseRecoveryInput extends AuthoringReleaseRecoveryScope {
  state: ReleaseRecoveryStateResponse;
}

export type AuthoringRollbackAvailability = 'available' | 'unavailable' | 'not-applicable';

export interface AuthoringReleaseHistoryItem {
  id: string;
  action: ReleaseHistoryEntry['action'];
  actionLabel: string;
  state: 'active' | 'inactive' | 'failed';
  stateLabel: string;
  summary: string;
  occurredAt: string;
  actorUserId: string | null;
  generation: number;
  publicationId: string | null;
  previousPublicationId: string | null;
  reason: string | null;
  artifact: ReleaseArtifactPins | null;
  failureMessage: string | null;
  isCurrent: boolean;
  isRollbackTarget: boolean;
  rollbackAvailability: AuthoringRollbackAvailability;
}

export interface AuthoringRollbackTarget {
  publicationId: string;
  generation: number;
  action: 'publish' | 'promote' | 'rollback';
  actionLabel: string;
  occurredAt: string;
  artifact: ReleaseArtifactPins;
}

export interface AuthoringReleaseRecoveryGuard {
  expectedGeneration: number;
  expectedActivePublicationId: string;
}

export interface AuthoringReleaseRecoveryViewModel {
  scope: AuthoringReleaseRecoveryScope;
  deploymentState: 'active' | 'inactive' | 'unavailable';
  deploymentGeneration: number | null;
  activePublicationId: string | null;
  historyItems: readonly AuthoringReleaseHistoryItem[];
  rollbackTargets: readonly AuthoringRollbackTarget[];
  guard: AuthoringReleaseRecoveryGuard | null;
  canRollback: boolean;
  canUnpublish: boolean;
}

interface AuthoringReleaseRecoveryIntentBase extends AuthoringReleaseRecoveryScope {
  confirmationKey: string;
  guard: AuthoringReleaseRecoveryGuard;
}

export interface AuthoringRollbackIntent extends AuthoringReleaseRecoveryIntentBase {
  action: 'rollback';
  targets: readonly AuthoringRollbackTarget[];
}

export interface AuthoringUnpublishIntent extends AuthoringReleaseRecoveryIntentBase {
  action: 'unpublish';
}

export type AuthoringReleaseRecoveryIntent = AuthoringRollbackIntent | AuthoringUnpublishIntent;

export interface AuthoringReleaseRecoveryRequestIdentity {
  idempotencyKey: string;
  correlationId: string;
}

export const AUTHORING_RELEASE_RECOVERY_PREPARATION_FAILURES = [
  'reason_required',
  'reason_not_trimmed',
  'reason_too_long',
  'rollback_target_required',
  'rollback_target_invalid',
  'idempotency_key_invalid',
  'correlation_id_invalid',
] as const;

export type AuthoringReleaseRecoveryPreparationFailure =
  (typeof AUTHORING_RELEASE_RECOVERY_PREPARATION_FAILURES)[number];

export type AuthoringReleaseRecoveryRequestPreparation =
  | { ok: true; request: ReleaseRecoveryRequest }
  | { ok: false; code: AuthoringReleaseRecoveryPreparationFailure };

export interface PrepareAuthoringReleaseRecoveryRequestInput {
  reason: string;
  identity: AuthoringReleaseRecoveryRequestIdentity;
  targetPublicationId?: string;
}

/**
 * Builds authoring-only presentation state from the server-vetted recovery
 * response. The complete response is rejected when its top-level or nested
 * scope differs from the exact scope supplied by the caller.
 */
export function createAuthoringReleaseRecoveryViewModel(
  input: AuthoringReleaseRecoveryInput,
): AuthoringReleaseRecoveryViewModel {
  const scope = releaseScope(input);
  if (!releaseRecoveryStateMatchesScope(input.state, scope)) {
    return unavailableReleaseRecoveryViewModel(scope);
  }

  const deployment = input.state.deployment;
  const guard = activeDeploymentGuard(deployment);
  const historyEntries = [...input.state.history].sort(compareReleaseHistoryEntries);
  const allowedRollbackTargetIds = new Set(input.state.rollbackTargetPublicationIds);
  const rollbackTargets = guard
    ? priorRollbackTargets(historyEntries, guard, allowedRollbackTargetIds)
    : [];
  const rollbackTargetIds = new Set(rollbackTargets.map((target) => target.publicationId));
  const historyItems = historyEntries.map((entry) =>
    releaseHistoryItem(entry, guard, rollbackTargetIds),
  );

  return {
    scope,
    deploymentState: deployment?.state ?? 'unavailable',
    deploymentGeneration: deployment?.generation ?? null,
    activePublicationId: guard?.expectedActivePublicationId ?? null,
    historyItems,
    rollbackTargets,
    guard,
    canRollback: Boolean(input.state.permissions.rollback && guard && rollbackTargets.length > 0),
    canUnpublish: Boolean(input.state.permissions.unpublish && guard),
  };
}

/** Captures the exact compare-and-swap guard shown in a confirmation. */
export function createAuthoringReleaseRecoveryIntent(
  model: AuthoringReleaseRecoveryViewModel,
  action: AuthoringReleaseRecoveryAction,
): AuthoringReleaseRecoveryIntent | null {
  if (!model.guard) return null;

  const base = {
    ...model.scope,
    guard: { ...model.guard },
  };
  if (action === 'rollback') {
    if (!model.canRollback) return null;
    const targets = model.rollbackTargets.map(cloneRollbackTarget);
    return {
      ...base,
      action,
      confirmationKey: confirmationKey(base, action, targets),
      targets,
    };
  }
  if (!model.canUnpublish) return null;
  return {
    ...base,
    action,
    confirmationKey: confirmationKey(base, action, []),
  };
}

/**
 * Creates only the existing recovery contract. It cannot accept artifact
 * bytes or compiler input, and rollback targets must come from the captured
 * exact-prior-publication list.
 */
export function prepareAuthoringReleaseRecoveryRequest(
  intent: AuthoringReleaseRecoveryIntent,
  input: PrepareAuthoringReleaseRecoveryRequestInput,
): AuthoringReleaseRecoveryRequestPreparation {
  const reasonFailure = authoringReleaseRecoveryReasonFailure(input.reason);
  if (reasonFailure) return { ok: false, code: reasonFailure };
  if (!validMutationIdentifier(input.identity.idempotencyKey, 200)) {
    return { ok: false, code: 'idempotency_key_invalid' };
  }
  if (!validMutationIdentifier(input.identity.correlationId, 256)) {
    return { ok: false, code: 'correlation_id_invalid' };
  }

  const mutation = {
    reason: input.reason,
    expectedGeneration: intent.guard.expectedGeneration,
    expectedActivePublicationId: intent.guard.expectedActivePublicationId,
    idempotencyKey: input.identity.idempotencyKey,
    correlationId: input.identity.correlationId,
  };
  if (intent.action === 'unpublish') {
    return { ok: true, request: { action: 'unpublish', ...mutation } };
  }
  if (!input.targetPublicationId) {
    return { ok: false, code: 'rollback_target_required' };
  }
  if (!intent.targets.some((target) => target.publicationId === input.targetPublicationId)) {
    return { ok: false, code: 'rollback_target_invalid' };
  }
  return {
    ok: true,
    request: {
      action: 'rollback',
      targetPublicationId: input.targetPublicationId,
      ...mutation,
    },
  };
}

export function authoringReleaseRecoveryReasonFailure(
  reason: string,
): Extract<
  AuthoringReleaseRecoveryPreparationFailure,
  'reason_required' | 'reason_not_trimmed' | 'reason_too_long'
> | null {
  if (reason.length === 0 || !/\S/.test(reason)) return 'reason_required';
  if (reason.length > RELEASE_REASON_MAX_LENGTH) return 'reason_too_long';
  if (reason !== reason.trim()) return 'reason_not_trimmed';
  return null;
}

function releaseScope(input: AuthoringReleaseRecoveryInput): AuthoringReleaseRecoveryScope {
  return {
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
  };
}

function unavailableReleaseRecoveryViewModel(
  scope: AuthoringReleaseRecoveryScope,
): AuthoringReleaseRecoveryViewModel {
  return {
    scope,
    deploymentState: 'unavailable',
    deploymentGeneration: null,
    activePublicationId: null,
    historyItems: [],
    rollbackTargets: [],
    guard: null,
    canRollback: false,
    canUnpublish: false,
  };
}

function activeDeploymentGuard(
  deployment: DocumentDeployment | null,
): AuthoringReleaseRecoveryGuard | null {
  if (!deployment || deployment.state !== 'active') return null;
  return {
    expectedGeneration: deployment.generation,
    expectedActivePublicationId: deployment.activePublicationId,
  };
}

function compareReleaseHistoryEntries(
  left: ReleaseHistoryEntry,
  right: ReleaseHistoryEntry,
): number {
  const occurredAtOrder = right.occurredAt.localeCompare(left.occurredAt);
  return occurredAtOrder || right.id.localeCompare(left.id);
}

function priorRollbackTargets(
  entries: readonly ReleaseHistoryEntry[],
  guard: AuthoringReleaseRecoveryGuard,
  allowedPublicationIds: ReadonlySet<string>,
): AuthoringRollbackTarget[] {
  const targets = new Map<string, AuthoringRollbackTarget>();
  for (const entry of entries) {
    if (!isPriorSuccessfulPublication(entry, guard)) continue;
    if (!allowedPublicationIds.has(entry.publicationId)) continue;
    if (targets.has(entry.publicationId)) continue;
    targets.set(entry.publicationId, {
      publicationId: entry.publicationId,
      generation: entry.generation,
      action: entry.action,
      actionLabel: RELEASE_ACTION_LABELS[entry.action],
      occurredAt: entry.occurredAt,
      artifact: structuredClone(entry.artifact),
    });
  }
  return [...targets.values()];
}

function releaseHistoryItem(
  entry: ReleaseHistoryEntry,
  guard: AuthoringReleaseRecoveryGuard | null,
  rollbackTargetIds: ReadonlySet<string>,
): AuthoringReleaseHistoryItem {
  const publicationId = successfulPublicationId(entry);
  const isRollbackTarget = Boolean(publicationId && rollbackTargetIds.has(publicationId));
  return {
    id: entry.id,
    action: entry.action,
    actionLabel: RELEASE_ACTION_LABELS[entry.action],
    state: entry.state,
    stateLabel: RELEASE_STATE_LABELS[entry.state],
    summary: releaseHistorySummary(entry),
    occurredAt: entry.occurredAt,
    actorUserId: entry.actorUserId,
    generation: releaseHistoryGeneration(entry),
    publicationId,
    previousPublicationId: releaseHistoryPreviousPublicationId(entry),
    reason: 'reason' in entry ? entry.reason : null,
    artifact: releaseHistoryArtifact(entry),
    failureMessage: entry.state === 'failed' ? releaseFailureMessage(entry) : null,
    isCurrent: Boolean(
      guard &&
      publicationId === guard.expectedActivePublicationId &&
      entry.state === 'active' &&
      entry.generation === guard.expectedGeneration,
    ),
    isRollbackTarget,
    rollbackAvailability: rollbackAvailability(entry, guard, isRollbackTarget),
  };
}

function rollbackAvailability(
  entry: ReleaseHistoryEntry,
  guard: AuthoringReleaseRecoveryGuard | null,
  isRollbackTarget: boolean,
): AuthoringRollbackAvailability {
  if (!guard || !isPriorSuccessfulPublication(entry, guard)) return 'not-applicable';
  return isRollbackTarget ? 'available' : 'unavailable';
}

function isPriorSuccessfulPublication(
  entry: ReleaseHistoryEntry,
  guard: AuthoringReleaseRecoveryGuard,
): entry is Extract<ReleaseHistoryEntry, { state: 'active' }> {
  return (
    entry.state === 'active' &&
    entry.generation < guard.expectedGeneration &&
    entry.publicationId !== guard.expectedActivePublicationId
  );
}

function successfulPublicationId(entry: ReleaseHistoryEntry): string | null {
  return entry.state === 'active' ? entry.publicationId : null;
}

function releaseHistoryGeneration(entry: ReleaseHistoryEntry): number {
  if (entry.state !== 'failed') return entry.generation;
  return entry.actualGeneration ?? entry.expectedGeneration;
}

function releaseHistoryPreviousPublicationId(entry: ReleaseHistoryEntry): string | null {
  if (entry.state === 'failed') return entry.actualActivePublicationId ?? null;
  return entry.previousPublicationId;
}

function releaseHistoryArtifact(entry: ReleaseHistoryEntry): ReleaseArtifactPins | null {
  if (entry.state === 'failed') return null;
  if (entry.state === 'inactive') return structuredClone(entry.deactivatedArtifact);
  return structuredClone(entry.artifact);
}

function releaseHistorySummary(entry: ReleaseHistoryEntry): string {
  if (entry.state === 'failed') {
    return authoringText('{action} attempt failed: {message}', {
      action: RELEASE_ACTION_LABELS[entry.action],
      message: releaseFailureMessage(entry),
    });
  }
  if (entry.action === 'publish') {
    return authoringText('Activated publication {publication}.', {
      publication: entry.publicationId,
    });
  }
  if (entry.action === 'promote') {
    return authoringText('Activated publication {publication} from source {source}.', {
      publication: entry.publicationId,
      source: entry.sourcePublicationId,
    });
  }
  if (entry.action === 'rollback') {
    return authoringText('Activated publication {publication} from prior publication {target}.', {
      publication: entry.publicationId,
      target: entry.targetPublicationId,
    });
  }
  return authoringText('Deactivated publication {publication}.', {
    publication: entry.previousPublicationId,
  });
}

function releaseFailureMessage(entry: Extract<ReleaseHistoryEntry, { state: 'failed' }>): string {
  return authoringText(RELEASE_RECOVERY_FAILURE_MESSAGES[entry.failure.code]);
}

function cloneRollbackTarget(target: AuthoringRollbackTarget): AuthoringRollbackTarget {
  return { ...target, artifact: structuredClone(target.artifact) };
}

function confirmationKey(
  base: Omit<AuthoringReleaseRecoveryIntentBase, 'confirmationKey'>,
  action: AuthoringReleaseRecoveryAction,
  targets: readonly AuthoringRollbackTarget[],
): string {
  const targetKey = targets.map((target) => target.publicationId).join(',');
  return [
    base.workspaceId,
    base.environmentId,
    base.documentId,
    action,
    base.guard.expectedGeneration,
    base.guard.expectedActivePublicationId,
    targetKey,
  ].join(':');
}

function validMutationIdentifier(value: string, maxLength: number): boolean {
  return value.length >= 8 && value.length <= maxLength && MUTATION_IDENTIFIER_PATTERN.test(value);
}
