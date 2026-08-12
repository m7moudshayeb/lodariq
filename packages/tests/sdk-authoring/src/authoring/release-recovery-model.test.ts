import { describe, expect, it } from 'vitest';
import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type DocumentDeployment,
  type ReleaseArtifactPins,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  authoringReleaseRecoveryReasonFailure,
  createAuthoringReleaseRecoveryIntent,
  createAuthoringReleaseRecoveryViewModel,
  prepareAuthoringReleaseRecoveryRequest,
} from '../../../../../packages/sdk-authoring/src/authoring/release-recovery-model';

const SCOPE = {
  workspaceId: 'workspace_recovery_ui',
  environmentId: 'environment_production',
  documentId: 'document_tour',
} as const;

const REQUEST_IDENTITY = {
  idempotencyKey: 'rollback.request_1',
  correlationId: 'rollback.correlation_1',
} as const;

describe('authoring release recovery model', () => {
  it('derives exact-scope history and only prior successful publication targets', () => {
    const model = releaseModel();

    expect(model.deploymentState).toBe('active');
    expect(model.guard).toEqual({
      expectedGeneration: 4,
      expectedActivePublicationId: 'publication_current_4',
    });
    expect(model.historyItems.map((item) => item.id)).toEqual([
      'history_failed_5',
      'history_current_4',
      'history_rollback_3',
      'history_publish_1',
    ]);
    expect(model.historyItems.find((item) => item.id === 'history_current_4')).toMatchObject({
      isCurrent: true,
      isRollbackTarget: false,
      publicationId: 'publication_current_4',
      rollbackAvailability: 'not-applicable',
    });
    expect(model.historyItems.find((item) => item.id === 'history_failed_5')).toMatchObject({
      state: 'failed',
      isRollbackTarget: false,
      rollbackAvailability: 'not-applicable',
      failureMessage: RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
    });
    expect(model.historyItems.find((item) => item.id === 'history_rollback_3')).toMatchObject({
      publicationId: 'publication_rollback_3',
      isRollbackTarget: false,
      rollbackAvailability: 'unavailable',
    });
    expect(model.rollbackTargets.map((target) => target.publicationId)).toEqual([
      'publication_prior_1',
    ]);
    expect(
      model.historyItems.filter((item) => item.isRollbackTarget).map((item) => item.id),
    ).toEqual(['history_publish_1']);
    expect(model.historyItems.find((item) => item.id === 'history_publish_1')).toMatchObject({
      rollbackAvailability: 'available',
    });
    expect(model.canRollback).toBe(true);
    expect(model.canUnpublish).toBe(true);
  });

  it('captures exact guards and emits only the existing rollback request contract', () => {
    const model = releaseModel();
    const intent = createAuthoringReleaseRecoveryIntent(model, 'rollback');
    expect(intent?.action).toBe('rollback');
    if (!intent || intent.action !== 'rollback') throw new Error('Rollback intent is unavailable');

    expect(
      prepareAuthoringReleaseRecoveryRequest(intent, {
        reason: ' Incident recovery',
        identity: REQUEST_IDENTITY,
        targetPublicationId: 'publication_prior_1',
      }),
    ).toEqual({ ok: false, code: 'reason_not_trimmed' });
    expect(
      prepareAuthoringReleaseRecoveryRequest(intent, {
        reason: 'Incident recovery',
        identity: REQUEST_IDENTITY,
        targetPublicationId: 'publication_freely_typed',
      }),
    ).toEqual({ ok: false, code: 'rollback_target_invalid' });

    const prepared = prepareAuthoringReleaseRecoveryRequest(intent, {
      reason: 'Incident recovery',
      identity: REQUEST_IDENTITY,
      targetPublicationId: 'publication_prior_1',
    });
    expect(prepared).toEqual({
      ok: true,
      request: {
        action: 'rollback',
        targetPublicationId: 'publication_prior_1',
        reason: 'Incident recovery',
        expectedGeneration: 4,
        expectedActivePublicationId: 'publication_current_4',
        ...REQUEST_IDENTITY,
      },
    });
    expect(JSON.stringify(prepared)).not.toContain('compiledArtifactId');
    expect(JSON.stringify(prepared)).not.toContain('compilerVersion');
  });

  it('requires a non-empty, bounded, already-trimmed human reason', () => {
    expect(authoringReleaseRecoveryReasonFailure('')).toBe('reason_required');
    expect(authoringReleaseRecoveryReasonFailure('   ')).toBe('reason_required');
    expect(authoringReleaseRecoveryReasonFailure('Pause delivery ')).toBe('reason_not_trimmed');
    expect(authoringReleaseRecoveryReasonFailure('x'.repeat(501))).toBe('reason_too_long');
    expect(authoringReleaseRecoveryReasonFailure('Pause delivery\nfor incident review')).toBeNull();
  });

  it('builds an unpublish request with the same exact active-pointer guard', () => {
    const intent = createAuthoringReleaseRecoveryIntent(releaseModel(), 'unpublish');
    if (!intent || intent.action !== 'unpublish') {
      throw new Error('Unpublish intent is unavailable');
    }
    const prepared = prepareAuthoringReleaseRecoveryRequest(intent, {
      reason: 'Pause delivery for incident review',
      identity: {
        idempotencyKey: 'unpublish.request_1',
        correlationId: 'unpublish.correlation_1',
      },
    });

    expect(prepared).toEqual({
      ok: true,
      request: {
        action: 'unpublish',
        reason: 'Pause delivery for incident review',
        expectedGeneration: 4,
        expectedActivePublicationId: 'publication_current_4',
        idempotencyKey: 'unpublish.request_1',
        correlationId: 'unpublish.correlation_1',
      },
    });
  });

  it('fails closed for inactive, mismatched, and unauthorized deployment state', () => {
    const inactive = createAuthoringReleaseRecoveryViewModel({
      ...SCOPE,
      state: recoveryState({
        deployment: {
          ...SCOPE,
          state: 'inactive',
          generation: 5,
          activePublicationId: null,
          updatedAt: '2026-08-09T12:05:00.000Z',
        },
      }),
    });
    expect(inactive).toMatchObject({
      deploymentState: 'inactive',
      guard: null,
      canRollback: false,
      canUnpublish: false,
    });
    expect(createAuthoringReleaseRecoveryIntent(inactive, 'rollback')).toBeNull();
    expect(createAuthoringReleaseRecoveryIntent(inactive, 'unpublish')).toBeNull();

    const mismatched = createAuthoringReleaseRecoveryViewModel({
      ...SCOPE,
      state: recoveryState({
        deployment: activeDeployment({ documentId: 'different_document' }),
      }),
    });
    expect(mismatched.deploymentState).toBe('unavailable');
    expect(mismatched.guard).toBeNull();
    expect(mismatched.historyItems).toEqual([]);

    const mismatchedHistory = createAuthoringReleaseRecoveryViewModel({
      ...SCOPE,
      state: recoveryState({ history: [...releaseHistory(), crossScopeHistory()] }),
    });
    expect(mismatchedHistory).toMatchObject({
      deploymentState: 'unavailable',
      historyItems: [],
      rollbackTargets: [],
      guard: null,
      canRollback: false,
      canUnpublish: false,
    });

    const unauthorized = createAuthoringReleaseRecoveryViewModel({
      ...SCOPE,
      state: recoveryState({ permissions: { rollback: false, unpublish: false } }),
    });
    expect(unauthorized.canRollback).toBe(false);
    expect(unauthorized.canUnpublish).toBe(false);
  });
});

function releaseModel() {
  return createAuthoringReleaseRecoveryViewModel({
    ...SCOPE,
    state: recoveryState(),
  });
}

function recoveryState(
  overrides: Partial<ReleaseRecoveryStateResponse> = {},
): ReleaseRecoveryStateResponse {
  return {
    ...SCOPE,
    permissions: { rollback: true, unpublish: true },
    deployment: activeDeployment(),
    history: releaseHistory(),
    rollbackTargetPublicationIds: ['publication_prior_1'],
    ...overrides,
  };
}

function activeDeployment(
  overrides: Partial<Extract<DocumentDeployment, { state: 'active' }>> = {},
): Extract<DocumentDeployment, { state: 'active' }> {
  return {
    ...SCOPE,
    state: 'active',
    generation: 4,
    activePublicationId: 'publication_current_4',
    updatedAt: '2026-08-09T12:04:00.000Z',
    ...overrides,
  };
}

function releaseHistory(): ReleaseHistoryEntry[] {
  return [publishHistory(), rollbackHistory(), currentHistory(), failedHistory()];
}

function crossScopeHistory(): ReleaseHistoryEntry {
  return {
    ...historyIdentity('history_cross_scope', 1),
    documentId: 'different_document',
    action: 'publish',
    state: 'active',
    publicationId: 'publication_cross_scope',
    previousPublicationId: null,
    artifact: artifact('9'),
  };
}

function publishHistory(): ReleaseHistoryEntry {
  return {
    ...historyIdentity('history_publish_1', 1),
    action: 'publish',
    state: 'active',
    publicationId: 'publication_prior_1',
    previousPublicationId: null,
    artifact: artifact('1'),
  };
}

function rollbackHistory(): ReleaseHistoryEntry {
  return {
    ...historyIdentity('history_rollback_3', 3),
    action: 'rollback',
    state: 'active',
    publicationId: 'publication_rollback_3',
    targetPublicationId: 'publication_prior_1',
    previousPublicationId: 'publication_middle_2',
    reason: 'Restore the stable tour',
    artifact: artifact('3'),
  };
}

function currentHistory(): ReleaseHistoryEntry {
  return {
    ...historyIdentity('history_current_4', 4),
    action: 'promote',
    state: 'active',
    publicationId: 'publication_current_4',
    sourcePublicationId: 'publication_staging_4',
    previousPublicationId: 'publication_rollback_3',
    artifact: artifact('4'),
  };
}

function failedHistory(): ReleaseHistoryEntry {
  return {
    id: 'history_failed_5',
    ...SCOPE,
    releaseOperationId: 'operation_failed_5',
    idempotencyKey: 'rollback.failed_5',
    correlationId: 'rollback.failed.correlation_5',
    actorUserId: 'user_owner',
    occurredAt: timestamp(5),
    action: 'rollback',
    state: 'failed',
    targetPublicationId: 'publication_invalid',
    reason: 'Investigate a bad target',
    expectedGeneration: 4,
    actualGeneration: 4,
    expectedActivePublicationId: 'publication_current_4',
    actualActivePublicationId: 'publication_current_4',
    failure: {
      code: 'rollback_target_invalid',
      message: RELEASE_RECOVERY_FAILURE_MESSAGES.rollback_target_invalid,
    },
  };
}

function historyIdentity(id: string, generation: number) {
  return {
    id,
    ...SCOPE,
    releaseOperationId: `operation_${generation}`,
    generation,
    idempotencyKey: `release.request_${generation}`,
    correlationId: `release.correlation_${generation}`,
    actorUserId: generation === 1 ? null : 'user_owner',
    occurredAt: timestamp(generation),
  } as const;
}

function artifact(version: string): ReleaseArtifactPins {
  return {
    compiledArtifactId: `artifact_${version}`,
    artifactSchemaVersion: '1',
    contentHash: `sha256-${version.repeat(64)}`,
    compilerVersion: '1.0.0',
    rendererContractVersion: '1',
    themeContractVersion: '1',
    themeVersionId: `theme_version_${version}`,
    themeContentHash: `sha256-${version.repeat(64)}`,
  };
}

function timestamp(index: number): string {
  return `2026-08-09T12:0${index}:00.000Z`;
}
