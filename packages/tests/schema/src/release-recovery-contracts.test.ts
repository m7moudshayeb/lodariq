import { describe, expect, it } from 'vitest';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  PublishReleaseHistoryEntry,
  PromoteReleaseHistoryEntry,
  RELEASE_RECOVERY_FAILURE_CODES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  RELEASE_RECOVERY_HISTORY_MAX_ITEMS,
  RELEASE_RECOVERY_ROLLBACK_TARGET_MAX_ITEMS,
  ReleaseArtifactPins,
  ReleaseHistoryEntry,
  ReleaseReason,
  ReleaseRecoveryFailureHistoryEntry,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
  RENDERER_CONTRACT_VERSION,
  RollbackReleaseRequest,
  UnpublishReleaseRequest,
  validate,
} from '@lodariq/schema';

const CONTENT_HASH = `sha256-${'a'.repeat(64)}`;
const THEME_HASH = `sha256-${'b'.repeat(64)}`;
const OCCURRED_AT = '2026-08-09T12:00:00.000Z';

const artifact = {
  compiledArtifactId: 'artifact_prior_1',
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  contentHash: CONTENT_HASH,
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
  themeVersionId: 'themev_prior_1',
  themeContentHash: THEME_HASH,
} as const;

const rollbackRequest = {
  action: 'rollback',
  targetPublicationId: 'pub_prior_1',
  reason: 'Restore the last verified release',
  expectedGeneration: 4,
  expectedActivePublicationId: 'pub_current_4',
  idempotencyKey: 'rollback.request_1',
  correlationId: 'rollback.correlation_1',
} as const;

const historyIdentity = {
  id: 'history_1',
  workspaceId: 'wk_1',
  environmentId: 'env_production',
  documentId: 'doc_1',
  releaseOperationId: 'release_1',
  generation: 5,
  idempotencyKey: 'rollback.request_1',
  correlationId: 'rollback.correlation_1',
  actorUserId: 'user_1',
  occurredAt: OCCURRED_AT,
} as const;

describe('rollback and unpublish contracts', () => {
  it('requires an already-trimmed recovery reason between 1 and 500 characters', () => {
    expect(validate(ReleaseReason, 'Restore verified release').valid).toBe(true);
    for (const reason of ['', ' ', ' leading', 'trailing ', '\nline', 'line\n', 'x'.repeat(501)]) {
      expect(validate(ReleaseReason, reason).valid).toBe(false);
    }

    expect(validate(RollbackReleaseRequest, rollbackRequest).valid).toBe(true);
    expect(
      validate(UnpublishReleaseRequest, {
        action: 'unpublish',
        reason: 'Take delivery offline during the incident',
        expectedGeneration: 4,
        idempotencyKey: 'unpublish.request_1',
        correlationId: 'unpublish.correlation_1',
      }).valid,
    ).toBe(true);
  });

  it('accepts only an exact prior publication selector and server-resolved request fields', () => {
    expect(validate(ReleaseRecoveryRequest, rollbackRequest).valid).toBe(true);
    expect(
      validate(ReleaseRecoveryRequest, {
        ...rollbackRequest,
        targetPublicationId: undefined,
      }).valid,
    ).toBe(false);
    for (const clientArtifactInput of [
      { compiledArtifactId: artifact.compiledArtifactId },
      { contentHash: artifact.contentHash },
      { compilerVersion: artifact.compilerVersion },
      { artifact },
    ]) {
      expect(
        validate(ReleaseRecoveryRequest, {
          ...rollbackRequest,
          ...clientArtifactInput,
        }).valid,
      ).toBe(false);
    }
    expect(
      validate(ReleaseRecoveryRequest, {
        action: 'unpublish',
        reason: 'Pause delivery',
        expectedGeneration: 0,
        expectedActivePublicationId: null,
        idempotencyKey: 'unpublish.request_2',
        correlationId: 'unpublish.correlation_2',
      }).valid,
    ).toBe(false);
  });

  it('accepts only bounded opaque identifiers in caller-controlled recovery fields', () => {
    const maximumIdentifier = `p${'a'.repeat(255)}`;
    expect(
      validate(RollbackReleaseRequest, {
        ...rollbackRequest,
        targetPublicationId: maximumIdentifier,
        expectedActivePublicationId: 'pub.current:4-safe',
      }).valid,
    ).toBe(true);

    for (const invalidIdentifier of [
      ' pub_prior_1',
      'pub_prior_1 ',
      'pub prior 1',
      'https://lodariq.io/publications/1',
      'pub/prior/1',
      'pub\nprior',
      'pub\u0000prior',
      `p${'a'.repeat(256)}`,
    ]) {
      expect(
        validate(RollbackReleaseRequest, {
          ...rollbackRequest,
          targetPublicationId: invalidIdentifier,
        }).valid,
      ).toBe(false);
      expect(
        validate(RollbackReleaseRequest, {
          ...rollbackRequest,
          expectedActivePublicationId: invalidIdentifier,
        }).valid,
      ).toBe(false);
    }
  });

  it('returns exact immutable pins for rollback and an explicit inactive unpublish result', () => {
    expect(validate(ReleaseArtifactPins, artifact).valid).toBe(true);
    expect(
      validate(ReleaseRecoveryResult, {
        ok: true,
        action: 'rollback',
        state: 'active',
        replayed: false,
        releaseOperationId: 'release_rollback_1',
        publicationId: 'pub_rollback_5',
        targetPublicationId: 'pub_prior_1',
        previousPublicationId: 'pub_current_4',
        generation: 5,
        artifact,
        completedAt: OCCURRED_AT,
      }).valid,
    ).toBe(true);
    expect(
      validate(ReleaseRecoveryResult, {
        ok: true,
        action: 'unpublish',
        state: 'inactive',
        replayed: false,
        releaseOperationId: 'release_unpublish_1',
        previousPublicationId: 'pub_current_4',
        generation: 5,
        deactivatedArtifact: artifact,
        completedAt: OCCURRED_AT,
      }).valid,
    ).toBe(true);
    expect(
      validate(ReleaseRecoveryResult, {
        ok: true,
        action: 'unpublish',
        state: 'inactive',
        replayed: false,
        releaseOperationId: 'release_unpublish_1',
        previousPublicationId: 'pub_current_4',
        publicationId: 'must_not_remain_active',
        generation: 5,
        deactivatedArtifact: artifact,
        completedAt: OCCURRED_AT,
      }).valid,
    ).toBe(false);
  });

  it('accepts older persisted pins so rollback never requires recompilation after a version bump', () => {
    const historicalArtifact = {
      ...artifact,
      artifactSchemaVersion: '1',
      compilerVersion: '0.2.0',
      rendererContractVersion: '1',
      themeContractVersion: '1',
    };

    expect(validate(ReleaseArtifactPins, historicalArtifact).valid).toBe(true);
    expect(
      validate(ReleaseHistoryEntry, {
        ...historyIdentity,
        id: 'history_historical_artifact',
        generation: 1,
        action: 'publish',
        state: 'active',
        publicationId: 'pub_historical_artifact',
        previousPublicationId: null,
        artifact: historicalArtifact,
      }).valid,
    ).toBe(true);
    expect(
      validate(ReleaseRecoveryResult, {
        ok: true,
        action: 'rollback',
        state: 'active',
        replayed: false,
        releaseOperationId: 'release_rollback_historical',
        publicationId: 'pub_rollback_historical',
        targetPublicationId: 'pub_historical',
        previousPublicationId: 'pub_current',
        generation: 5,
        artifact: historicalArtifact,
        completedAt: OCCURRED_AT,
      }).valid,
    ).toBe(true);
  });

  it('keeps failure diagnostics closed and bounded', () => {
    for (const code of RELEASE_RECOVERY_FAILURE_CODES) {
      expect(
        validate(ReleaseRecoveryResult, {
          ok: false,
          action: 'rollback',
          state: 'failed',
          replayed: false,
          code,
          message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
        }).valid,
      ).toBe(true);
    }
    expect(
      validate(ReleaseRecoveryResult, {
        ok: false,
        action: 'rollback',
        state: 'failed',
        replayed: false,
        code: 'deployment_changed',
        message: 'Client-controlled detail about pub_secret',
      }).valid,
    ).toBe(false);
    expect(
      validate(ReleaseRecoveryResult, {
        ok: false,
        action: 'rollback',
        state: 'failed',
        replayed: false,
        code: 'database_exception',
        message: 'Recovery was rejected',
      }).valid,
    ).toBe(false);
  });

  it('provides a closed append-only history union for every release action', () => {
    const publish = {
      ...historyIdentity,
      action: 'publish',
      state: 'active',
      publicationId: 'pub_publish_1',
      previousPublicationId: null,
      artifact,
    } as const;
    const promote = {
      ...historyIdentity,
      action: 'promote',
      state: 'active',
      publicationId: 'pub_promote_1',
      sourcePublicationId: 'pub_staging_1',
      previousPublicationId: 'pub_production_0',
      artifact,
    } as const;
    const rollback = {
      ...historyIdentity,
      action: 'rollback',
      state: 'active',
      publicationId: 'pub_rollback_5',
      targetPublicationId: 'pub_prior_1',
      previousPublicationId: 'pub_current_4',
      reason: rollbackRequest.reason,
      artifact,
    } as const;
    const unpublish = {
      ...historyIdentity,
      action: 'unpublish',
      state: 'inactive',
      previousPublicationId: 'pub_current_4',
      reason: 'Pause delivery',
      deactivatedArtifact: artifact,
    } as const;

    expect(validate(PublishReleaseHistoryEntry, publish).valid).toBe(true);
    expect(validate(PublishReleaseHistoryEntry, { ...publish, actorUserId: null }).valid).toBe(
      true,
    );
    expect(validate(PromoteReleaseHistoryEntry, promote).valid).toBe(true);
    for (const entry of [publish, promote, rollback, unpublish]) {
      expect(validate(ReleaseHistoryEntry, entry).valid).toBe(true);
    }
    expect(validate(ReleaseHistoryEntry, { ...rollback, reason: undefined }).valid).toBe(false);
    expect(validate(ReleaseHistoryEntry, { ...unpublish, state: 'active' }).valid).toBe(false);

    const failedRollback = {
      id: 'history_failed_1',
      workspaceId: 'wk_1',
      environmentId: 'env_production',
      documentId: 'doc_1',
      releaseOperationId: 'release_failed_1',
      idempotencyKey: 'rollback.failed_1',
      correlationId: 'rollback.failed.correlation_1',
      actorUserId: null,
      occurredAt: OCCURRED_AT,
      action: 'rollback',
      state: 'failed',
      targetPublicationId: 'pub_invalid_target',
      reason: 'Attempt incident recovery',
      expectedGeneration: 4,
      actualGeneration: 4,
      failure: {
        code: 'rollback_target_invalid',
        message: RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
      },
    } as const;
    expect(validate(ReleaseRecoveryFailureHistoryEntry, failedRollback).valid).toBe(true);
    expect(validate(ReleaseHistoryEntry, failedRollback).valid).toBe(true);
  });

  it('returns a closed bounded recovery read with server-vetted rollback targets', () => {
    const historicalArtifact = {
      ...artifact,
      artifactSchemaVersion: '1',
      compilerVersion: '0.2.0',
      rendererContractVersion: '1',
      themeContractVersion: '1',
    };
    const historicalPublication = {
      ...historyIdentity,
      id: 'history_historical_1',
      generation: 1,
      action: 'publish',
      state: 'active',
      publicationId: 'pub_historical_1',
      previousPublicationId: null,
      artifact: historicalArtifact,
    } as const;
    const selectablePublication = {
      ...historyIdentity,
      id: 'history_selectable_2',
      generation: 2,
      action: 'publish',
      state: 'active',
      publicationId: 'pub_selectable_2',
      previousPublicationId: 'pub_historical_1',
      artifact,
    } as const;
    const currentPublication = {
      ...historyIdentity,
      id: 'history_current_5',
      action: 'promote',
      state: 'active',
      publicationId: 'pub_current_5',
      sourcePublicationId: 'pub_staging_5',
      previousPublicationId: 'pub_selectable_2',
      artifact,
    } as const;
    const response = {
      workspaceId: historyIdentity.workspaceId,
      environmentId: historyIdentity.environmentId,
      documentId: historyIdentity.documentId,
      permissions: { rollback: true, unpublish: false },
      deployment: {
        workspaceId: historyIdentity.workspaceId,
        environmentId: historyIdentity.environmentId,
        documentId: historyIdentity.documentId,
        state: 'active',
        generation: 5,
        activePublicationId: currentPublication.publicationId,
        pendingReleaseOperationId: null,
        updatedAt: OCCURRED_AT,
      },
      history: [historicalPublication, selectablePublication, currentPublication],
      rollbackTargetPublicationIds: [selectablePublication.publicationId],
    } as const;

    expect(validate(ReleaseRecoveryStateResponse, response).valid).toBe(true);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        deployment: null,
        history: [],
        rollbackTargetPublicationIds: [],
      }).valid,
    ).toBe(true);
    expect(response.history).toContain(historicalPublication);
    expect(response.rollbackTargetPublicationIds).not.toContain(
      historicalPublication.publicationId,
    );
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        workspaceId: ' workspace_with_leading_space',
      }).valid,
    ).toBe(false);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        permissions: { ...response.permissions, publish: true },
      }).valid,
    ).toBe(false);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        permissions: { rollback: true },
      }).valid,
    ).toBe(false);
    const { documentId: _missingDocumentId, ...missingDocumentScope } = response;
    expect(validate(ReleaseRecoveryStateResponse, missingDocumentScope).valid).toBe(false);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        rollbackTargetPublicationIds: [
          selectablePublication.publicationId,
          selectablePublication.publicationId,
        ],
      }).valid,
    ).toBe(false);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        history: Array.from(
          { length: RELEASE_RECOVERY_HISTORY_MAX_ITEMS + 1 },
          () => historicalPublication,
        ),
      }).valid,
    ).toBe(false);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        rollbackTargetPublicationIds: Array.from(
          { length: RELEASE_RECOVERY_ROLLBACK_TARGET_MAX_ITEMS + 1 },
          (_, index) => `pub_target_${index}`,
        ),
      }).valid,
    ).toBe(false);
    expect(
      validate(ReleaseRecoveryStateResponse, {
        ...response,
        nextCursor: 'must-not-truncate-or-paginate-silently',
      }).valid,
    ).toBe(false);
  });
});
