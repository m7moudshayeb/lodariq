import { describe, expect, it } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  ReleaseArtifactPins,
  ReleaseHistoryEntry,
  ReleaseRecoveryResult,
  RENDERER_CONTRACT_VERSION,
  evaluateReleaseRecovery,
  releaseRecoveryStateMatchesScope,
  releaseRecoveryRequestsEqual,
  validate,
  type EvaluateReleaseRecoveryInput,
  type ReleaseRecoveryPublicationSnapshot,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';

const OCCURRED_AT = '2026-08-09T12:00:00.000Z';

describe('pure release recovery state machine', () => {
  it('rolls back only by reusing the exact prior successful artifact pins without compilation', () => {
    const input = rollbackInput();
    expect(input.deployableRollbackTargetPublicationIds.has('pub_prior_2')).toBe(true);
    const originalDeployment = structuredClone(input.deployment);
    const originalPublications = structuredClone(input.publications);
    const decision = evaluateReleaseRecovery(input);

    expect(decision.kind).toBe('commit');
    if (decision.kind !== 'commit' || decision.action !== 'rollback') return;
    expect(decision.artifactDisposition).toBe('reuse_existing');
    expect(decision.result).toEqual({
      ok: true,
      action: 'rollback',
      state: 'active',
      replayed: false,
      releaseOperationId: 'release_rollback_5',
      publicationId: 'pub_rollback_5',
      targetPublicationId: 'pub_prior_2',
      previousPublicationId: 'pub_current_4',
      generation: 5,
      artifact: pins('a', 'prior'),
      completedAt: OCCURRED_AT,
    });
    expect(decision.publication).toMatchObject({
      id: 'pub_rollback_5',
      generation: 5,
      sourcePublicationId: 'pub_prior_2',
      previousPublicationId: 'pub_current_4',
      artifact: pins('a', 'prior'),
    });
    expect(decision.deployment).toMatchObject({
      state: 'active',
      generation: 5,
      activePublicationId: 'pub_rollback_5',
      pendingReleaseOperationId: null,
    });
    expect(validate(ReleaseRecoveryResult, decision.result).valid).toBe(true);
    expect(validate(ReleaseHistoryEntry, decision.history).valid).toBe(true);
    expect(input.deployment).toEqual(originalDeployment);
    expect(input.publications).toEqual(originalPublications);
    expect(decision).not.toHaveProperty('compiledArtifact');
  });

  it('rejects a valid prior publication when its historical artifact is not deployable', () => {
    const input = rollbackInput();
    const historicalArtifact = {
      ...pins('a', 'historical'),
      artifactSchemaVersion: '1',
      compilerVersion: '0.2.0',
      rendererContractVersion: '1',
      themeContractVersion: '1',
    };
    const historicalTarget = publication('pub_historical_2', 2, {
      artifact: historicalArtifact,
    });
    const decision = evaluateReleaseRecovery({
      ...input,
      request: { ...input.request, targetPublicationId: historicalTarget.id },
      publications: [historicalTarget, currentPublication()],
      deployableRollbackTargetPublicationIds: new Set<string>(),
    });

    expect(validate(ReleaseArtifactPins, historicalArtifact).valid).toBe(true);
    expect(decision.kind).toBe('reject');
    if (decision.kind !== 'reject' || !decision.persistFailure) return;
    expect(decision.result).toMatchObject({
      code: 'artifact_incompatible',
      message: RELEASE_RECOVERY_FAILURE_MESSAGES.artifact_incompatible,
    });
    expect(decision.history).toMatchObject({
      action: 'rollback',
      targetPublicationId: historicalTarget.id,
      failure: {
        code: 'artifact_incompatible',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.artifact_incompatible,
      },
    });
    expect(validate(ReleaseHistoryEntry, decision.history).valid).toBe(true);
    expect(decision).not.toHaveProperty('publication');
    expect(decision).not.toHaveProperty('deployment');
  });

  it('rejects non-prior, failed, current, and cross-scope rollback targets uniformly', () => {
    const invalidTargets: ReleaseRecoveryPublicationSnapshot[] = [
      publication('pub_failed', 2, { outcome: 'failed' }),
      publication('pub_current_alias', 4),
      publication('pub_future', 5),
      publication('pub_other_workspace', 2, { workspaceId: 'wk_other' }),
      publication('pub_other_environment', 2, { environmentId: 'env_staging' }),
      publication('pub_other_document', 2, { documentId: 'doc_other' }),
    ];

    for (const target of invalidTargets) {
      const input = rollbackInput();
      const decision = evaluateReleaseRecovery({
        ...input,
        request: { ...input.request, targetPublicationId: target.id },
        publications: [currentPublication(), target],
      });
      expect(decision.kind).toBe('reject');
      if (decision.kind !== 'reject' || !decision.persistFailure) continue;
      expect(decision.result).toMatchObject({
        code: 'rollback_target_invalid',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
      });
      expect(decision.history).toMatchObject({
        state: 'failed',
        targetPublicationId: target.id,
        failure: {
          code: 'rollback_target_invalid',
          message: RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
        },
      });
      expect(validate(ReleaseHistoryEntry, decision.history).valid).toBe(true);
    }
  });

  it('fails stale generation or active-publication assertions before changing a pointer', () => {
    const input = rollbackInput();
    const staleGeneration = evaluateReleaseRecovery({
      ...input,
      request: { ...input.request, expectedGeneration: 3 },
    });
    const stalePublication = evaluateReleaseRecovery({
      ...input,
      request: { ...input.request, expectedActivePublicationId: 'pub_stale_3' },
    });

    for (const decision of [staleGeneration, stalePublication]) {
      expect(decision.kind).toBe('reject');
      if (decision.kind !== 'reject') continue;
      expect(decision.result).toMatchObject({
        code: 'deployment_changed',
        actualGeneration: 4,
        actualActivePublicationId: 'pub_current_4',
      });
    }
  });

  it('replays the same idempotency key exactly and rejects any altered request', () => {
    const input = rollbackInput();
    const first = evaluateReleaseRecovery(input);
    expect(first.kind).toBe('commit');
    if (first.kind !== 'commit') return;

    const replay = evaluateReleaseRecovery({
      ...input,
      deployment: {
        ...first.deployment,
        state: 'inactive',
        activePublicationId: null,
      },
      operations: [first.operation],
    } as EvaluateReleaseRecoveryInput);
    expect(replay.kind).toBe('replay');
    if (replay.kind === 'replay') {
      expect(replay.result).toEqual({ ...first.result, replayed: true });
    }

    for (const request of [
      { ...input.request, reason: 'A different recovery reason' },
      { ...input.request, targetPublicationId: 'pub_other_target' },
      { ...input.request, correlationId: 'rollback.changed_correlation' },
    ]) {
      const conflict = evaluateReleaseRecovery({
        ...input,
        request,
        operations: [first.operation],
      });
      expect(conflict.kind).toBe('reject');
      if (conflict.kind !== 'reject') continue;
      expect(conflict.result).toMatchObject({
        code: 'idempotency_conflict',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.idempotency_conflict,
      });
      expect(conflict).toMatchObject({
        persistFailure: false,
        operation: null,
        history: null,
        existingReleaseOperationId: first.operation.id,
      });
      let persistedHistoryCount = 1;
      let persistedOperationCount = 1;
      if (conflict.persistFailure) {
        persistedHistoryCount += 1;
        persistedOperationCount += 1;
      }
      expect(persistedHistoryCount).toBe(1);
      expect(persistedOperationCount).toBe(1);
    }
  });

  it('unpublishes to an explicit inactive generation, replays safely, and rejects a new key', () => {
    const input = unpublishInput();
    const first = evaluateReleaseRecovery(input);
    expect(first.kind).toBe('commit');
    if (first.kind !== 'commit' || first.action !== 'unpublish') return;

    expect(first.artifactDisposition).toBe('reuse_existing');
    expect(first.publication).toBeNull();
    expect(first.deployment).toEqual({
      workspaceId: 'wk_1',
      environmentId: 'env_production',
      documentId: 'doc_1',
      state: 'inactive',
      generation: 5,
      activePublicationId: null,
      pendingReleaseOperationId: null,
      updatedAt: OCCURRED_AT,
    });
    expect(first.result).toMatchObject({
      state: 'inactive',
      previousPublicationId: 'pub_current_4',
      deactivatedArtifact: pins('b', 'current'),
    });
    expect(validate(ReleaseHistoryEntry, first.history).valid).toBe(true);

    const replay = evaluateReleaseRecovery({
      ...input,
      deployment: first.deployment,
      operations: [first.operation],
    });
    expect(replay.kind).toBe('replay');
    if (replay.kind === 'replay') expect(replay.result.replayed).toBe(true);

    const newKey = evaluateReleaseRecovery({
      ...input,
      deployment: first.deployment,
      request: {
        ...input.request,
        idempotencyKey: 'unpublish.request_new',
        correlationId: 'unpublish.correlation_new',
      },
      operations: [first.operation],
    });
    expect(newKey.kind).toBe('reject');
    if (newKey.kind !== 'reject' || !newKey.persistFailure) return;
    expect(newKey.result).toMatchObject({
      code: 'already_inactive',
      actualGeneration: 5,
      actualActivePublicationId: null,
    });
    expect(validate(ReleaseHistoryEntry, newKey.history).valid).toBe(true);
  });

  it('fails closed for pending operations or inconsistent active publication state', () => {
    const input = rollbackInput();
    const pending = evaluateReleaseRecovery({
      ...input,
      deployment: { ...input.deployment, pendingReleaseOperationId: 'release_pending' },
    });
    const missingActive = evaluateReleaseRecovery({
      ...input,
      publications: [priorPublication()],
    });

    expect(pending.kind).toBe('reject');
    if (pending.kind === 'reject') {
      expect(pending.result.code).toBe('release_operation_in_progress');
    }
    expect(missingActive.kind).toBe('reject');
    if (missingActive.kind === 'reject') expect(missingActive.result.code).toBe('internal_error');
  });

  it('compares every semantic request field for idempotency', () => {
    const left = rollbackInput().request;
    expect(releaseRecoveryRequestsEqual(left, { ...left })).toBe(true);
    expect(releaseRecoveryRequestsEqual(left, { ...left, expectedGeneration: 5 })).toBe(false);
    expect(releaseRecoveryRequestsEqual(left, unpublishInput().request)).toBe(false);
  });

  it('rejects top-level, deployment, or history scope mismatches before rendering', () => {
    const decision = evaluateReleaseRecovery(rollbackInput());
    expect(decision.kind).toBe('commit');
    if (decision.kind !== 'commit' || decision.action !== 'rollback') return;

    const expectedScope = {
      workspaceId: 'wk_1',
      environmentId: 'env_production',
      documentId: 'doc_1',
    } as const;
    const state: ReleaseRecoveryStateResponse = {
      ...expectedScope,
      permissions: { rollback: true, unpublish: true },
      deployment: decision.deployment,
      history: [decision.history],
      rollbackTargetPublicationIds: ['pub_prior_2'],
    };

    expect(releaseRecoveryStateMatchesScope(state, expectedScope)).toBe(true);
    expect(
      releaseRecoveryStateMatchesScope({ ...state, workspaceId: 'wk_other' }, expectedScope),
    ).toBe(false);
    expect(
      releaseRecoveryStateMatchesScope(
        {
          ...state,
          deployment: { ...decision.deployment, environmentId: 'env_staging' },
        },
        expectedScope,
      ),
    ).toBe(false);
    expect(
      releaseRecoveryStateMatchesScope(
        {
          ...state,
          history: [{ ...decision.history, documentId: 'doc_other' }],
        },
        expectedScope,
      ),
    ).toBe(false);
    expect(releaseRecoveryStateMatchesScope({ ...state, deployment: null }, expectedScope)).toBe(
      true,
    );
  });
});

function rollbackInput() {
  return {
    workspaceId: 'wk_1',
    environmentId: 'env_production',
    documentId: 'doc_1',
    actorUserId: 'user_1',
    deployment: activeDeployment(),
    publications: [priorPublication(), currentPublication()],
    operations: [],
    newReleaseOperationId: 'release_rollback_5',
    newPublicationId: 'pub_rollback_5',
    deployableRollbackTargetPublicationIds: new Set(['pub_prior_2']),
    occurredAt: OCCURRED_AT,
    request: {
      action: 'rollback',
      targetPublicationId: 'pub_prior_2',
      reason: 'Restore the prior verified release',
      expectedGeneration: 4,
      expectedActivePublicationId: 'pub_current_4',
      idempotencyKey: 'rollback.request_1',
      correlationId: 'rollback.correlation_1',
    },
  } satisfies EvaluateReleaseRecoveryInput;
}

function unpublishInput() {
  return {
    workspaceId: 'wk_1',
    environmentId: 'env_production',
    documentId: 'doc_1',
    actorUserId: 'user_1',
    deployment: activeDeployment(),
    publications: [currentPublication()],
    operations: [],
    newReleaseOperationId: 'release_unpublish_5',
    occurredAt: OCCURRED_AT,
    request: {
      action: 'unpublish',
      reason: 'Pause delivery during incident response',
      expectedGeneration: 4,
      expectedActivePublicationId: 'pub_current_4',
      idempotencyKey: 'unpublish.request_1',
      correlationId: 'unpublish.correlation_1',
    },
  } satisfies EvaluateReleaseRecoveryInput;
}

function activeDeployment() {
  return {
    workspaceId: 'wk_1',
    environmentId: 'env_production',
    documentId: 'doc_1',
    state: 'active',
    generation: 4,
    activePublicationId: 'pub_current_4',
    pendingReleaseOperationId: null,
    updatedAt: '2026-08-09T11:00:00.000Z',
  } as const;
}

function priorPublication() {
  return publication('pub_prior_2', 2, { artifact: pins('a', 'prior') });
}

function currentPublication() {
  return publication('pub_current_4', 4, { artifact: pins('b', 'current') });
}

function publication(
  id: string,
  generation: number,
  overrides: Partial<ReleaseRecoveryPublicationSnapshot> = {},
): ReleaseRecoveryPublicationSnapshot {
  return {
    id,
    workspaceId: 'wk_1',
    environmentId: 'env_production',
    documentId: 'doc_1',
    generation,
    outcome: 'succeeded',
    artifact: pins('c', id),
    ...overrides,
  };
}

function pins(hashCharacter: string, suffix: string): ReleaseArtifactPins {
  return {
    compiledArtifactId: `artifact_${suffix}`,
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    contentHash: `sha256-${hashCharacter.repeat(64)}`,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: `themev_${suffix}`,
    themeContentHash: `sha256-${hashCharacter.repeat(64)}`,
  };
}
