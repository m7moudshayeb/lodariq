import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileDocument } from '@lodariq/compiler';
import {
  ReleaseRecoveryHistoryLimitExceededError,
  ReleaseRecoveryHistoryIntegrityError,
  createReleaseRecoveryRequestHash,
  type ControlPlaneRepository,
  type InMemoryControlPlaneSeed,
  type PersistedCompiledArtifact,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  createGrandfatheredInMemoryControlPlaneRepository as createInMemoryControlPlaneRepository,
} from '../../fixtures/commercial.js';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RELEASE_RECOVERY_HISTORY_MAX_ITEMS,
  RENDERER_CONTRACT_VERSION,
  type NewCompiledDocument,
  type LodariqDocument,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_recovery';
const DOCUMENT_ID = 'doc_recovery';
const STAGING_ENVIRONMENT_ID = 'env_staging';
const DEVELOPMENT_ENVIRONMENT_ID = 'env_development';
const ADMIN_USER_ID = 'user_admin';
const OWNER_USER_ID = 'user_owner';
const VIEWER_USER_ID = 'user_viewer';
const NONMEMBER_USER_ID = 'user_outsider';

const PUBLICATION_IDS = {
  first: 'pub_staging_1',
  second: 'pub_staging_2',
  current: 'pub_staging_3',
  future: 'pub_staging_future_4',
  crossEnvironment: 'pub_development_1',
} as const;

const STAGING_ENVIRONMENT = {
  id: STAGING_ENVIRONMENT_ID,
  workspaceId: WORKSPACE_ID,
  kind: 'staging',
  name: 'Staging',
  originAllowlist: ['https://staging.example.com'],
  requiredApprovalCount: 0,
  enabled: true,
  pipelinePosition: 1,
  authoringEnabled: true,
  releasePolicy: {
    allowDirectPublish: true,
    requireSourceVerification: false,
    requiredApprovalCount: 0,
    publisherRoles: ['owner', 'admin', 'member'],
    rollbackRoles: ['owner', 'admin'],
    unpublishRoles: ['owner', 'admin'],
    separationOfDuties: {
      requireSeparateVerifier: false,
      requireSeparateApprover: false,
    },
  },
  createdAt: timestamp(0),
  updatedAt: timestamp(0),
} satisfies WorkspaceEnvironment;

const DEVELOPMENT_ENVIRONMENT = {
  ...STAGING_ENVIRONMENT,
  id: DEVELOPMENT_ENVIRONMENT_ID,
  kind: 'development',
  name: 'Development',
  originAllowlist: ['http://localhost:5173'],
  pipelinePosition: 0,
} satisfies WorkspaceEnvironment;

const MEMBERSHIPS = [
  {
    workspaceId: WORKSPACE_ID,
    userId: ADMIN_USER_ID,
    role: 'admin',
    createdAt: timestamp(0),
  },
  {
    workspaceId: WORKSPACE_ID,
    userId: OWNER_USER_ID,
    role: 'owner',
    createdAt: timestamp(0),
  },
  {
    workspaceId: WORKSPACE_ID,
    userId: VIEWER_USER_ID,
    role: 'viewer',
    createdAt: timestamp(0),
  },
] as const;

const ADMIN_SCOPE = {
  workspaceId: WORKSPACE_ID,
  environmentId: STAGING_ENVIRONMENT_ID,
  documentId: DOCUMENT_ID,
  actorUserId: ADMIN_USER_ID,
} as const;

type RollbackRequest = Extract<ReleaseRecoveryRequest, { action: 'rollback' }>;
type UnpublishRequest = Extract<ReleaseRecoveryRequest, { action: 'unpublish' }>;

interface FixtureArtifacts {
  first: PersistedCompiledArtifact;
  second: PersistedCompiledArtifact;
  current: PersistedCompiledArtifact;
  laterDraft: PersistedCompiledArtifact;
  incompatibleSecond: PersistedCompiledArtifact;
}

interface FixtureDefinition {
  latestDocument: LodariqDocument;
  artifacts: FixtureArtifacts;
}

let fixture: FixtureDefinition;

beforeAll(async () => {
  fixture = await createFixtureDefinition();
});

describe('release recovery in-memory persistence', () => {
  it('rolls back by reusing the exact historical artifact and provenance, never the later draft', async () => {
    const repository = createRepository();
    const publicationsBefore = await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID);
    const latestArtifactBefore = await repository.getLatestCompiledArtifact(WORKSPACE_ID);
    const request = rollbackRequest();

    const result = await repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request });
    const rollback = requireRollbackSuccess(result);
    const expectedPins = artifactPins(fixture.artifacts.first);

    expect(rollback).toMatchObject({
      action: 'rollback',
      state: 'active',
      replayed: false,
      targetPublicationId: PUBLICATION_IDS.first,
      previousPublicationId: PUBLICATION_IDS.current,
      generation: 4,
      artifact: expectedPins,
    });
    expect(rollback.artifact).toEqual(expectedPins);

    await expect(
      repository.getDocumentDeployment(WORKSPACE_ID, STAGING_ENVIRONMENT_ID, DOCUMENT_ID),
    ).resolves.toMatchObject({
      state: 'active',
      activePublicationId: rollback.publicationId,
      pendingReleaseOperationId: null,
      generation: 4,
    });

    const rollbackPublication = await repository.getPublicationById(
      WORKSPACE_ID,
      rollback.publicationId,
    );
    expect(rollbackPublication).toMatchObject({
      action: 'rollback',
      sourcePublicationId: PUBLICATION_IDS.first,
      previousPublicationId: PUBLICATION_IDS.current,
      releaseOperationId: rollback.releaseOperationId,
      documentVersionId: fixture.artifacts.first.documentVersionId,
      compiledArtifactId: fixture.artifacts.first.id,
      contentHash: fixture.artifacts.first.contentHash,
      publishedByUserId: ADMIN_USER_ID,
    });
    expect(rollbackPublication?.artifact).toEqual(fixture.artifacts.first);
    expect(rollbackPublication?.compiledArtifactId).not.toBe(fixture.artifacts.laterDraft.id);

    const operation = await repository.getReleaseOperationById(
      WORKSPACE_ID,
      rollback.releaseOperationId,
    );
    expect(operation).toMatchObject({
      action: 'rollback',
      status: 'completed',
      requestedArtifactId: fixture.artifacts.first.id,
      requestedSourcePublicationId: PUBLICATION_IDS.first,
      requestedActivePublicationId: PUBLICATION_IDS.current,
      actualActivePublicationId: PUBLICATION_IDS.current,
      sourcePublicationId: PUBLICATION_IDS.first,
      resultPublicationId: rollback.publicationId,
      expectedGeneration: 3,
      resultGeneration: 4,
      reason: request.reason,
      errorCode: null,
    });

    const publicationsAfter = await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID);
    expect(publicationsAfter).toHaveLength(publicationsBefore.length + 1);
    expect(await repository.getLatestCompiledArtifact(WORKSPACE_ID)).toEqual(latestArtifactBefore);
    expect(
      await repository.getCompiledArtifact(
        WORKSPACE_ID,
        DOCUMENT_ID,
        fixture.artifacts.laterDraft.id,
      ),
    ).toEqual(fixture.artifacts.laterDraft);
  });

  it('unpublishes only the active pointer and leaves immutable publications available', async () => {
    const repository = createRepository();
    const publicationsBefore = await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID);
    const request = unpublishRequest();

    const result = await repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request });
    const unpublish = requireUnpublishSuccess(result);

    expect(unpublish).toMatchObject({
      action: 'unpublish',
      state: 'inactive',
      replayed: false,
      previousPublicationId: PUBLICATION_IDS.current,
      generation: 4,
      deactivatedArtifact: artifactPins(fixture.artifacts.current),
    });
    await expect(
      repository.getDocumentDeployment(WORKSPACE_ID, STAGING_ENVIRONMENT_ID, DOCUMENT_ID),
    ).resolves.toEqual({
      workspaceId: WORKSPACE_ID,
      environmentId: STAGING_ENVIRONMENT_ID,
      documentId: DOCUMENT_ID,
      state: 'inactive',
      activePublicationId: null,
      pendingReleaseOperationId: null,
      generation: 4,
      updatedAt: unpublish.completedAt,
    });
    await expect(
      repository.getCurrentPublicationForDocument(
        WORKSPACE_ID,
        STAGING_ENVIRONMENT_ID,
        DOCUMENT_ID,
      ),
    ).resolves.toBeNull();

    const publicationsAfter = await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID);
    expect(publicationsAfter).toEqual(publicationsBefore);
    for (const publication of publicationsBefore) {
      await expect(repository.getPublicationById(WORKSPACE_ID, publication.id)).resolves.toEqual(
        publication,
      );
    }

    const state = await requireRecoveryState(repository);
    expect(state.rollbackTargetPublicationIds).toEqual([]);
    expect(state.history).toHaveLength(4);
    expect(state.history[0]).toMatchObject({
      action: 'unpublish',
      state: 'inactive',
      releaseOperationId: unpublish.releaseOperationId,
      previousPublicationId: PUBLICATION_IDS.current,
      reason: request.reason,
      deactivatedArtifact: artifactPins(fixture.artifacts.current),
    });
  });

  it('returns complete scoped history while vetting only earlier currently-deployable targets', async () => {
    const repository = createRepository({
      incompatibleSecond: true,
      includeFuturePublication: true,
      includeCrossEnvironmentPublication: true,
    });

    const state = await requireRecoveryState(repository);
    expect(state.history).toHaveLength(4);
    expect(state.history.map((entry) => entry.releaseOperationId).sort()).toEqual(
      ['relop_staging_1', 'relop_staging_2', 'relop_staging_3', 'relop_staging_future_4'].sort(),
    );
    expect(state.history.map((entry) => entry.releaseOperationId)).not.toContain(
      'relop_development_1',
    );
    expect(state.rollbackTargetPublicationIds).toEqual([PUBLICATION_IDS.first]);

    const incompatibleHistory = state.history.find(
      (entry) => 'publicationId' in entry && entry.publicationId === PUBLICATION_IDS.second,
    );
    expect(incompatibleHistory).toMatchObject({
      action: 'publish',
      artifact: {
        compiledArtifactId: fixture.artifacts.incompatibleSecond.id,
        rendererContractVersion: '99',
      },
    });
    expect(JSON.stringify(state.history)).not.toContain(fixture.artifacts.laterDraft.id);
  });

  it('fails closed for unknown, cross-scope, future, current, and incompatible rollback targets', async () => {
    const repository = createRepository({
      incompatibleSecond: true,
      includeFuturePublication: true,
      includeCrossEnvironmentPublication: true,
    });
    const publicationsBefore = await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID);
    const cases = [
      ['pub_missing', 'rollback_target_invalid'],
      [PUBLICATION_IDS.crossEnvironment, 'rollback_target_invalid'],
      [PUBLICATION_IDS.future, 'rollback_target_invalid'],
      [PUBLICATION_IDS.current, 'rollback_target_invalid'],
      [PUBLICATION_IDS.second, 'artifact_incompatible'],
    ] as const;

    for (const [targetPublicationId, code] of cases) {
      const request = rollbackRequest({
        targetPublicationId,
        idempotencyKey: `recovery:invalid:${targetPublicationId}`,
        correlationId: `correlation:invalid:${targetPublicationId}`,
      });
      const result = await repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request });
      expect(result).toMatchObject({
        ok: false,
        action: 'rollback',
        state: 'failed',
        replayed: false,
        code,
        expectedGeneration: 3,
        actualGeneration: 3,
        expectedActivePublicationId: PUBLICATION_IDS.current,
        actualActivePublicationId: PUBLICATION_IDS.current,
      });
      expect(
        result && 'releaseOperationId' in result ? result.releaseOperationId : undefined,
      ).toEqual(expect.any(String));
    }

    expect(await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID)).toEqual(
      publicationsBefore,
    );
    await expect(
      repository.getDocumentDeployment(WORKSPACE_ID, STAGING_ENVIRONMENT_ID, DOCUMENT_ID),
    ).resolves.toMatchObject({
      state: 'active',
      generation: 3,
      activePublicationId: PUBLICATION_IDS.current,
    });

    const state = await requireRecoveryState(repository);
    const failures = state.history.filter(
      (entry) => entry.action === 'rollback' && entry.state === 'failed',
    );
    for (const [targetPublicationId, code] of cases) {
      expect(failures).toContainEqual(
        expect.objectContaining({
          targetPublicationId,
          failure: expect.objectContaining({ code }),
        }),
      );
    }
  });

  it('replays an exact successful result after the deployment moves again', async () => {
    const repository = createRepository();
    const rollbackMutation = rollbackRequest({
      idempotencyKey: 'recovery:success:replay',
      correlationId: 'correlation:success:replay',
    });
    const first = requireRollbackSuccess(
      await repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request: rollbackMutation }),
    );
    const moveRequest = unpublishRequest({
      expectedGeneration: first.generation,
      expectedActivePublicationId: first.publicationId,
      idempotencyKey: 'recovery:success:move',
      correlationId: 'correlation:success:move',
    });
    requireUnpublishSuccess(
      await repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request: moveRequest }),
    );
    const stateBeforeReplay = await requireRecoveryState(repository);

    const replay = await repository.recoverDocumentRelease({
      ...ADMIN_SCOPE,
      request: rollbackMutation,
    });

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await requireRecoveryState(repository)).toEqual(stateBeforeReplay);
    expect(await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID)).toHaveLength(4);
  });

  it('replays exact persisted failure diagnostics after the deployment moves again', async () => {
    const repository = createRepository();
    const staleRequest = rollbackRequest({
      expectedGeneration: 2,
      expectedActivePublicationId: PUBLICATION_IDS.second,
      idempotencyKey: 'recovery:failure:replay',
      correlationId: 'correlation:failure:replay',
    });
    const first = await repository.recoverDocumentRelease({
      ...ADMIN_SCOPE,
      request: staleRequest,
    });
    expect(first).toMatchObject({
      ok: false,
      code: 'deployment_changed',
      replayed: false,
      expectedGeneration: 2,
      actualGeneration: 3,
      expectedActivePublicationId: PUBLICATION_IDS.second,
      actualActivePublicationId: PUBLICATION_IDS.current,
      releaseOperationId: expect.any(String),
    });

    requireUnpublishSuccess(
      await repository.recoverDocumentRelease({
        ...ADMIN_SCOPE,
        request: unpublishRequest({
          idempotencyKey: 'recovery:failure:move',
          correlationId: 'correlation:failure:move',
        }),
      }),
    );
    const stateBeforeReplay = await requireRecoveryState(repository);

    const replay = await repository.recoverDocumentRelease({
      ...ADMIN_SCOPE,
      request: staleRequest,
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await requireRecoveryState(repository)).toEqual(stateBeforeReplay);
  });

  it('rejects an altered request under the same idempotency key without new history', async () => {
    const repository = createRepository();
    const originalRequest = rollbackRequest({
      idempotencyKey: 'recovery:altered:key',
      correlationId: 'correlation:altered:key',
    });
    const first = requireRollbackSuccess(
      await repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request: originalRequest }),
    );
    const stateBeforeConflict = await requireRecoveryState(repository);
    const publicationsBeforeConflict = await repository.listDocumentPublications(
      WORKSPACE_ID,
      DOCUMENT_ID,
    );

    const conflict = await repository.recoverDocumentRelease({
      ...ADMIN_SCOPE,
      request: rollbackRequest({
        ...originalRequest,
        reason: 'A different recovery intent',
      }),
    });

    expect(conflict).toMatchObject({
      ok: false,
      action: 'rollback',
      code: 'idempotency_conflict',
      replayed: false,
    });
    expect(conflict && 'releaseOperationId' in conflict).toBe(false);
    expect(await requireRecoveryState(repository)).toEqual(stateBeforeConflict);
    expect(await repository.listDocumentPublications(WORKSPACE_ID, DOCUMENT_ID)).toEqual(
      publicationsBeforeConflict,
    );
    await expect(
      repository.getReleaseOperationById(WORKSPACE_ID, first.releaseOperationId),
    ).resolves.toMatchObject({
      status: 'completed',
      reason: originalRequest.reason,
      resultPublicationId: first.publicationId,
    });
  });

  it('persists separate stale-generation and stale-active-publication failures', async () => {
    const repository = createRepository();
    const staleGeneration = rollbackRequest({
      expectedGeneration: 2,
      idempotencyKey: 'recovery:stale:generation',
      correlationId: 'correlation:stale:generation',
    });
    const staleActivePublication = rollbackRequest({
      expectedActivePublicationId: PUBLICATION_IDS.second,
      idempotencyKey: 'recovery:stale:publication',
      correlationId: 'correlation:stale:publication',
    });

    for (const request of [staleGeneration, staleActivePublication]) {
      await expect(
        repository.recoverDocumentRelease({ ...ADMIN_SCOPE, request }),
      ).resolves.toMatchObject({
        ok: false,
        code: 'deployment_changed',
        actualGeneration: 3,
        actualActivePublicationId: PUBLICATION_IDS.current,
        releaseOperationId: expect.any(String),
      });
    }

    const state = await requireRecoveryState(repository);
    expect(state.history).toContainEqual(
      expect.objectContaining({
        idempotencyKey: staleGeneration.idempotencyKey,
        expectedGeneration: 2,
        actualGeneration: 3,
        failure: expect.objectContaining({ code: 'deployment_changed' }),
      }),
    );
    expect(state.history).toContainEqual(
      expect.objectContaining({
        idempotencyKey: staleActivePublication.idempotencyKey,
        expectedActivePublicationId: PUBLICATION_IDS.second,
        actualActivePublicationId: PUBLICATION_IDS.current,
        failure: expect.objectContaining({ code: 'deployment_changed' }),
      }),
    );
    await expect(
      repository.getDocumentDeployment(WORKSPACE_ID, STAGING_ENVIRONMENT_ID, DOCUMENT_ID),
    ).resolves.toMatchObject({
      state: 'active',
      generation: 3,
      activePublicationId: PUBLICATION_IDS.current,
    });
  });

  it('fails closed for a pending deployment and for exact replay of an activating operation', async () => {
    const pendingPointerSeed = baseSeed();
    const pendingPublish = pendingPublishOperation();
    pendingPointerSeed.releaseOperations?.push(pendingPublish);
    if (!pendingPointerSeed.documentDeployments?.[0]) throw new Error('deployment fixture missing');
    pendingPointerSeed.documentDeployments[0].pendingReleaseOperationId = pendingPublish.id;
    const pendingPointerRepository = createInMemoryControlPlaneRepository(pendingPointerSeed);
    const pendingResult = await pendingPointerRepository.recoverDocumentRelease({
      ...ADMIN_SCOPE,
      request: rollbackRequest({
        idempotencyKey: 'recovery:pending:pointer',
        correlationId: 'correlation:pending:pointer',
      }),
    });
    expect(pendingResult).toMatchObject({
      ok: false,
      code: 'release_operation_in_progress',
      releaseOperationId: expect.any(String),
    });
    await expect(
      pendingPointerRepository.getDocumentDeployment(
        WORKSPACE_ID,
        STAGING_ENVIRONMENT_ID,
        DOCUMENT_ID,
      ),
    ).resolves.toMatchObject({
      generation: 3,
      activePublicationId: PUBLICATION_IDS.current,
      pendingReleaseOperationId: pendingPublish.id,
    });

    const existingRequest = rollbackRequest({
      idempotencyKey: 'recovery:pending:existing',
      correlationId: 'correlation:pending:existing',
    });
    const existingSeed = baseSeed();
    existingSeed.releaseOperations?.push(activatingRecoveryOperation(existingRequest));
    const existingRepository = createInMemoryControlPlaneRepository(existingSeed);
    const stateBefore = await requireRecoveryState(existingRepository);
    await expect(
      existingRepository.recoverDocumentRelease({ ...ADMIN_SCOPE, request: existingRequest }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'release_operation_in_progress',
      releaseOperationId: 'relop_recovery_activating',
    });
    expect(await requireRecoveryState(existingRepository)).toEqual(stateBefore);
  });

  it('returns scoped state for a viewer, persists denial, and hides the scope from nonmembers', async () => {
    const repository = createRepository();
    const viewerScope = { ...ADMIN_SCOPE, actorUserId: VIEWER_USER_ID };
    const viewerState = await repository.getReleaseRecoveryState(viewerScope);
    expect(viewerState).toMatchObject({
      workspaceId: WORKSPACE_ID,
      environmentId: STAGING_ENVIRONMENT_ID,
      documentId: DOCUMENT_ID,
      permissions: { rollback: false, unpublish: false },
    });

    const viewerRequest = rollbackRequest({
      idempotencyKey: 'recovery:viewer:denied',
      correlationId: 'correlation:viewer:denied',
    });
    const denied = await repository.recoverDocumentRelease({
      ...viewerScope,
      request: viewerRequest,
    });
    expect(denied).toMatchObject({
      ok: false,
      code: 'capability_denied',
      releaseOperationId: expect.any(String),
      actualGeneration: 3,
      actualActivePublicationId: PUBLICATION_IDS.current,
    });
    const afterViewerDenial = await requireRecoveryState(repository);
    expect(afterViewerDenial.history).toContainEqual(
      expect.objectContaining({
        actorUserId: VIEWER_USER_ID,
        idempotencyKey: viewerRequest.idempotencyKey,
        targetPublicationId: viewerRequest.targetPublicationId,
        failure: expect.objectContaining({ code: 'capability_denied' }),
      }),
    );

    const outsiderScope = { ...ADMIN_SCOPE, actorUserId: NONMEMBER_USER_ID };
    await expect(repository.getReleaseRecoveryState(outsiderScope)).resolves.toBeNull();
    await expect(
      repository.recoverDocumentRelease({
        ...outsiderScope,
        request: rollbackRequest({
          idempotencyKey: 'recovery:outsider:hidden',
          correlationId: 'correlation:outsider:hidden',
        }),
      }),
    ).resolves.toBeNull();
    expect(await requireRecoveryState(repository)).toEqual(afterViewerDenial);
  });

  it('enforces configured recovery roles and disabled-environment policy', async () => {
    const ownerOnlySeed = baseSeed();
    const ownerOnlyEnvironment = ownerOnlySeed.environments?.[0];
    if (!ownerOnlyEnvironment?.releasePolicy) throw new Error('environment policy fixture missing');
    ownerOnlyEnvironment.releasePolicy.rollbackRoles = ['owner'];
    ownerOnlyEnvironment.releasePolicy.unpublishRoles = ['owner'];
    const ownerOnlyRepository = createInMemoryControlPlaneRepository(ownerOnlySeed);

    await expect(ownerOnlyRepository.getReleaseRecoveryState(ADMIN_SCOPE)).resolves.toMatchObject({
      permissions: { rollback: false, unpublish: false },
    });
    await expect(
      ownerOnlyRepository.getReleaseRecoveryState({ ...ADMIN_SCOPE, actorUserId: OWNER_USER_ID }),
    ).resolves.toMatchObject({ permissions: { rollback: true, unpublish: true } });
    await expect(
      ownerOnlyRepository.recoverDocumentRelease({
        ...ADMIN_SCOPE,
        request: rollbackRequest({
          idempotencyKey: 'recovery:admin:policy-denied',
          correlationId: 'correlation:admin:policy-denied',
        }),
      }),
    ).resolves.toMatchObject({ ok: false, code: 'capability_denied' });

    const disabledSeed = baseSeed();
    const disabledEnvironment = disabledSeed.environments?.[0];
    if (!disabledEnvironment) throw new Error('environment fixture missing');
    disabledEnvironment.enabled = false;
    const disabledRepository = createInMemoryControlPlaneRepository(disabledSeed);
    await expect(disabledRepository.getReleaseRecoveryState(ADMIN_SCOPE)).resolves.toMatchObject({
      permissions: { rollback: false, unpublish: false },
    });
    const disabledRequest = unpublishRequest({
      idempotencyKey: 'recovery:disabled:denied',
      correlationId: 'correlation:disabled:denied',
    });
    await expect(
      disabledRepository.recoverDocumentRelease({ ...ADMIN_SCOPE, request: disabledRequest }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'environment_not_configured',
      releaseOperationId: expect.any(String),
    });
    const disabledState = await disabledRepository.getReleaseRecoveryState(ADMIN_SCOPE);
    expect(disabledState?.history).toContainEqual(
      expect.objectContaining({
        idempotencyKey: disabledRequest.idempotencyKey,
        failure: expect.objectContaining({ code: 'environment_not_configured' }),
      }),
    );
    await expect(
      disabledRepository.getDocumentDeployment(WORKSPACE_ID, STAGING_ENVIRONMENT_ID, DOCUMENT_ID),
    ).resolves.toMatchObject({
      state: 'active',
      generation: 3,
      activePublicationId: PUBLICATION_IDS.current,
    });
  });

  it('fails closed when a completed publish or rollback has no completion timestamp', async () => {
    const publishSeed = baseSeed();
    const publishOperation = publishSeed.releaseOperations?.find(
      (operation) => operation.id === 'relop_staging_1',
    );
    if (!publishOperation) throw new Error('completed publish fixture missing');
    publishOperation.completedAt = null;

    const rollbackSeed = completedRollbackSeed();
    const rollbackOperation = rollbackSeed.releaseOperations?.find(
      (operation) => operation.id === 'relop_rollback_4',
    );
    if (!rollbackOperation) throw new Error('completed rollback fixture missing');
    rollbackOperation.completedAt = null;

    for (const seed of [publishSeed, rollbackSeed]) {
      await expect(
        createInMemoryControlPlaneRepository(seed).getReleaseRecoveryState(ADMIN_SCOPE),
      ).rejects.toBeInstanceOf(ReleaseRecoveryHistoryIntegrityError);
    }
  });

  it.each([null, PUBLICATION_IDS.second])(
    'fails closed when rollback publication previous provenance is %s',
    async (previousPublicationId) => {
      const seed = completedRollbackSeed();
      const rollbackPublication = seed.publications?.find(
        (publication) => publication.id === 'pub_rollback_4',
      );
      if (!rollbackPublication) throw new Error('rollback publication fixture missing');
      rollbackPublication.previousPublicationId = previousPublicationId;

      await expect(
        createInMemoryControlPlaneRepository(seed).getReleaseRecoveryState(ADMIN_SCOPE),
      ).rejects.toBeInstanceOf(ReleaseRecoveryHistoryIntegrityError);
    },
  );

  it('returns the exact history cap and fails closed instead of truncating overflow', async () => {
    const atCap = createInMemoryControlPlaneRepository(
      failureHistorySeed(RELEASE_RECOVERY_HISTORY_MAX_ITEMS),
    );
    const atCapState = await atCap.getReleaseRecoveryState(ADMIN_SCOPE);
    expect(atCapState?.history).toHaveLength(RELEASE_RECOVERY_HISTORY_MAX_ITEMS);

    const overflowCount = RELEASE_RECOVERY_HISTORY_MAX_ITEMS + 1;
    const overCap = createInMemoryControlPlaneRepository(failureHistorySeed(overflowCount));
    const overflow = overCap.getReleaseRecoveryState(ADMIN_SCOPE);
    await expect(overflow).rejects.toBeInstanceOf(ReleaseRecoveryHistoryLimitExceededError);
    await expect(overflow).rejects.toMatchObject({ count: overflowCount });
  });
});

function createRepository(options: BaseSeedOptions = {}): ControlPlaneRepository {
  return createInMemoryControlPlaneRepository(baseSeed(options));
}

interface BaseSeedOptions {
  incompatibleSecond?: boolean;
  includeFuturePublication?: boolean;
  includeCrossEnvironmentPublication?: boolean;
}

function baseSeed(options: BaseSeedOptions = {}): InMemoryControlPlaneSeed {
  const secondArtifact = options.incompatibleSecond
    ? fixture.artifacts.incompatibleSecond
    : fixture.artifacts.second;
  const first = completedPublication(
    fixture.artifacts.first,
    PUBLICATION_IDS.first,
    'relop_staging_1',
    1,
    null,
    STAGING_ENVIRONMENT_ID,
    'staging',
  );
  const second = completedPublication(
    secondArtifact,
    PUBLICATION_IDS.second,
    'relop_staging_2',
    2,
    PUBLICATION_IDS.first,
    STAGING_ENVIRONMENT_ID,
    'staging',
  );
  const current = completedPublication(
    fixture.artifacts.current,
    PUBLICATION_IDS.current,
    'relop_staging_3',
    3,
    PUBLICATION_IDS.second,
    STAGING_ENVIRONMENT_ID,
    'staging',
  );
  const publications = [first.publication, second.publication, current.publication];
  const releaseOperations = [first.operation, second.operation, current.operation];
  const environments: WorkspaceEnvironment[] = [structuredClone(STAGING_ENVIRONMENT)];

  if (options.includeFuturePublication) {
    const future = completedPublication(
      fixture.artifacts.first,
      PUBLICATION_IDS.future,
      'relop_staging_future_4',
      4,
      PUBLICATION_IDS.current,
      STAGING_ENVIRONMENT_ID,
      'staging',
    );
    publications.push(future.publication);
    releaseOperations.push(future.operation);
  }

  if (options.includeCrossEnvironmentPublication) {
    environments.push(structuredClone(DEVELOPMENT_ENVIRONMENT));
    const crossEnvironment = completedPublication(
      fixture.artifacts.first,
      PUBLICATION_IDS.crossEnvironment,
      'relop_development_1',
      1,
      null,
      DEVELOPMENT_ENVIRONMENT_ID,
      'development',
    );
    publications.push(crossEnvironment.publication);
    releaseOperations.push(crossEnvironment.operation);
  }

  return {
    documents: [structuredClone(fixture.latestDocument)],
    environments,
    workspaceMemberships: MEMBERSHIPS.map((membership) => ({ ...membership })),
    compiledArtifacts: [
      structuredClone(fixture.artifacts.first),
      structuredClone(secondArtifact),
      structuredClone(fixture.artifacts.current),
      structuredClone(fixture.artifacts.laterDraft),
    ],
    publications,
    releaseOperations,
    documentDeployments: [
      {
        workspaceId: WORKSPACE_ID,
        environmentId: STAGING_ENVIRONMENT_ID,
        documentId: DOCUMENT_ID,
        state: 'active',
        activePublicationId: PUBLICATION_IDS.current,
        pendingReleaseOperationId: null,
        generation: 3,
        updatedAt: timestamp(3),
      },
    ],
  };
}

function completedPublication(
  artifact: PersistedCompiledArtifact,
  publicationId: string,
  operationId: string,
  generation: number,
  previousPublicationId: string | null,
  environmentId: string,
  environment: 'development' | 'staging',
): { publication: PersistedPublication; operation: PersistedReleaseOperation } {
  const occurredAt = timestamp(generation);
  const idempotencyKey = `publish:${environmentId}:${generation}`;
  const publication: PersistedPublication = {
    id: publicationId,
    workspaceId: WORKSPACE_ID,
    correlationId: `correlation:${environmentId}:${generation}`,
    environmentId,
    environment,
    documentId: DOCUMENT_ID,
    documentVersionId: artifact.documentVersionId,
    compiledArtifactId: artifact.id,
    contentHash: artifact.contentHash,
    action: 'publish',
    sourcePublicationId: null,
    previousPublicationId,
    releaseOperationId: operationId,
    publishedByUserId: ADMIN_USER_ID,
    publishedAt: occurredAt,
    artifact: structuredClone(artifact),
  };
  const operation: PersistedReleaseOperation = {
    id: operationId,
    workspaceId: WORKSPACE_ID,
    environmentId,
    documentId: DOCUMENT_ID,
    action: 'publish',
    requestedArtifactId: artifact.id,
    requestedSourcePublicationId: null,
    requestedActivePublicationId: null,
    actualActivePublicationId: null,
    sourcePublicationId: null,
    expectedGeneration: generation - 1,
    resultGeneration: generation,
    idempotencyKey,
    requestHash: artifact.contentHash,
    status: 'completed',
    correlationId: publication.correlationId,
    requestedByUserId: ADMIN_USER_ID,
    resultPublicationId: publicationId,
    reason: null,
    errorCode: null,
    createdAt: occurredAt,
    completedAt: occurredAt,
  };
  return { publication, operation };
}

function pendingPublishOperation(): PersistedReleaseOperation {
  return {
    id: 'relop_publish_pending',
    workspaceId: WORKSPACE_ID,
    environmentId: STAGING_ENVIRONMENT_ID,
    documentId: DOCUMENT_ID,
    action: 'publish',
    requestedArtifactId: fixture.artifacts.current.id,
    requestedSourcePublicationId: null,
    requestedActivePublicationId: null,
    actualActivePublicationId: null,
    sourcePublicationId: null,
    expectedGeneration: 3,
    resultGeneration: null,
    idempotencyKey: 'publish:pending:next',
    requestHash: fixture.artifacts.current.contentHash,
    status: 'activating',
    correlationId: 'correlation:publish:pending',
    requestedByUserId: ADMIN_USER_ID,
    resultPublicationId: null,
    reason: null,
    errorCode: null,
    createdAt: timestamp(4),
    completedAt: null,
  };
}

function completedRollbackSeed(): InMemoryControlPlaneSeed {
  const seed = baseSeed();
  const request = rollbackRequest({
    idempotencyKey: 'recovery:seeded:rollback',
    correlationId: 'correlation:seeded:rollback',
  });
  const occurredAt = timestamp(4);
  seed.publications?.push({
    id: 'pub_rollback_4',
    workspaceId: WORKSPACE_ID,
    correlationId: request.correlationId,
    environmentId: STAGING_ENVIRONMENT_ID,
    environment: 'staging',
    documentId: DOCUMENT_ID,
    documentVersionId: fixture.artifacts.first.documentVersionId,
    compiledArtifactId: fixture.artifacts.first.id,
    contentHash: fixture.artifacts.first.contentHash,
    action: 'rollback',
    sourcePublicationId: PUBLICATION_IDS.first,
    previousPublicationId: PUBLICATION_IDS.current,
    releaseOperationId: 'relop_rollback_4',
    publishedByUserId: ADMIN_USER_ID,
    publishedAt: occurredAt,
    artifact: structuredClone(fixture.artifacts.first),
  });
  seed.releaseOperations?.push({
    id: 'relop_rollback_4',
    workspaceId: WORKSPACE_ID,
    environmentId: STAGING_ENVIRONMENT_ID,
    documentId: DOCUMENT_ID,
    action: 'rollback',
    requestedArtifactId: fixture.artifacts.first.id,
    requestedSourcePublicationId: PUBLICATION_IDS.first,
    requestedActivePublicationId: PUBLICATION_IDS.current,
    actualActivePublicationId: PUBLICATION_IDS.current,
    sourcePublicationId: PUBLICATION_IDS.first,
    expectedGeneration: 3,
    resultGeneration: 4,
    idempotencyKey: request.idempotencyKey,
    requestHash: createReleaseRecoveryRequestHash(ADMIN_SCOPE, request),
    status: 'completed',
    correlationId: request.correlationId,
    requestedByUserId: ADMIN_USER_ID,
    resultPublicationId: 'pub_rollback_4',
    reason: request.reason,
    errorCode: null,
    createdAt: occurredAt,
    completedAt: occurredAt,
  });
  const deployment = seed.documentDeployments?.[0];
  if (!deployment) throw new Error('rollback deployment fixture missing');
  deployment.activePublicationId = 'pub_rollback_4';
  deployment.generation = 4;
  deployment.updatedAt = occurredAt;
  return seed;
}

function activatingRecoveryOperation(request: RollbackRequest): PersistedReleaseOperation {
  return {
    id: 'relop_recovery_activating',
    workspaceId: WORKSPACE_ID,
    environmentId: STAGING_ENVIRONMENT_ID,
    documentId: DOCUMENT_ID,
    action: 'rollback',
    requestedArtifactId: null,
    requestedSourcePublicationId: request.targetPublicationId,
    requestedActivePublicationId: request.expectedActivePublicationId ?? null,
    actualActivePublicationId: null,
    sourcePublicationId: null,
    expectedGeneration: request.expectedGeneration,
    resultGeneration: null,
    idempotencyKey: request.idempotencyKey,
    requestHash: createReleaseRecoveryRequestHash(ADMIN_SCOPE, request),
    status: 'activating',
    correlationId: request.correlationId,
    requestedByUserId: ADMIN_USER_ID,
    resultPublicationId: null,
    reason: request.reason,
    errorCode: null,
    createdAt: timestamp(4),
    completedAt: null,
  };
}

function failureHistorySeed(count: number): InMemoryControlPlaneSeed {
  const operations = Array.from({ length: count }, (_, index): PersistedReleaseOperation => {
    const sequence = index + 1;
    return {
      id: `relop_history_failure_${sequence}`,
      workspaceId: WORKSPACE_ID,
      environmentId: STAGING_ENVIRONMENT_ID,
      documentId: DOCUMENT_ID,
      action: 'rollback',
      requestedArtifactId: null,
      requestedSourcePublicationId: `pub_missing_${sequence}`,
      requestedActivePublicationId: null,
      actualActivePublicationId: null,
      sourcePublicationId: null,
      expectedGeneration: 1,
      resultGeneration: null,
      idempotencyKey: `recovery:history:${sequence}`,
      requestHash: `sha256-${sequence.toString(16).padStart(64, '0')}`,
      status: 'failed',
      correlationId: `correlation:history:${sequence}`,
      requestedByUserId: ADMIN_USER_ID,
      resultPublicationId: null,
      reason: 'Rejected recovery target',
      errorCode: 'rollback_target_invalid',
      createdAt: timestamp(1),
      completedAt: timestamp(1),
    };
  });
  return {
    documents: [structuredClone(fixture.latestDocument)],
    environments: [structuredClone(STAGING_ENVIRONMENT)],
    workspaceMemberships: MEMBERSHIPS.map((membership) => ({ ...membership })),
    releaseOperations: operations,
  };
}

function rollbackRequest(overrides: Partial<RollbackRequest> = {}): RollbackRequest {
  return {
    action: 'rollback',
    targetPublicationId: PUBLICATION_IDS.first,
    reason: 'Restore the last stable release',
    expectedGeneration: 3,
    expectedActivePublicationId: PUBLICATION_IDS.current,
    idempotencyKey: 'recovery:rollback:stable',
    correlationId: 'correlation:rollback:stable',
    ...overrides,
  };
}

function unpublishRequest(overrides: Partial<UnpublishRequest> = {}): UnpublishRequest {
  return {
    action: 'unpublish',
    reason: 'Temporarily remove this release',
    expectedGeneration: 3,
    expectedActivePublicationId: PUBLICATION_IDS.current,
    idempotencyKey: 'recovery:unpublish:current',
    correlationId: 'correlation:unpublish:current',
    ...overrides,
  };
}

async function requireRecoveryState(repository: ControlPlaneRepository) {
  const state = await repository.getReleaseRecoveryState(ADMIN_SCOPE);
  if (!state) throw new Error('release recovery state fixture missing');
  return state;
}

function requireRollbackSuccess(result: ReleaseRecoveryResult | null) {
  if (!result?.ok || result.action !== 'rollback') {
    throw new Error('expected rollback success');
  }
  return result;
}

function requireUnpublishSuccess(result: ReleaseRecoveryResult | null) {
  if (!result?.ok || result.action !== 'unpublish') {
    throw new Error('expected unpublish success');
  }
  return result;
}

function artifactPins(artifact: PersistedCompiledArtifact) {
  const compiled = artifact.compiled as NewCompiledDocument;
  return {
    compiledArtifactId: artifact.id,
    artifactSchemaVersion: compiled.artifactSchemaVersion,
    contentHash: artifact.contentHash,
    compilerVersion: artifact.compilerVersion,
    rendererContractVersion: compiled.rendererContractVersion,
    themeContractVersion: compiled.theme.contractVersion,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
  };
}

async function createFixtureDefinition(): Promise<FixtureDefinition> {
  const labels = ['first', 'second', 'current', 'later-draft'] as const;
  const variants = await Promise.all(
    labels.map(async (label, index) => {
      const document = documentVariant(label);
      const compiled = await compileDocument({
        document,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      });
      return {
        document,
        artifact: persistedArtifact(compiled, label, index + 1),
      };
    }),
  );
  const first = variants[0];
  const second = variants[1];
  const current = variants[2];
  const laterDraft = variants[3];
  if (!first || !second || !current || !laterDraft) {
    throw new Error('compiled recovery fixture is incomplete');
  }
  return {
    latestDocument: laterDraft.document,
    artifacts: {
      first: first.artifact,
      second: second.artifact,
      current: current.artifact,
      laterDraft: laterDraft.artifact,
      incompatibleSecond: makeHistoricallyReadableIncompatibleArtifact(second.artifact),
    },
  };
}

function documentVariant(label: string): LodariqDocument {
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = DOCUMENT_ID;
  document.workspaceId = WORKSPACE_ID;
  document.title = `Recovery fixture ${label}`;
  document.trigger = {
    type: 'urlMatch',
    config: {
      pattern: `https://staging.example.com/${label}`,
      mode: 'exact',
    },
  };
  document.audience = { environments: ['staging'] };
  return document;
}

function persistedArtifact(
  compiled: NewCompiledDocument,
  label: string,
  sequence: number,
): PersistedCompiledArtifact {
  const recordLabel = label.replace(/-/gu, '_');
  return {
    id: `artifact_${recordLabel}`,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    documentVersionId: `docv_${recordLabel}`,
    contentHash: compiled.contentHash,
    compilerVersion: compiled.compilerVersion,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
    compiled: structuredClone(compiled),
    createdAt: timestamp(sequence),
  };
}

function makeHistoricallyReadableIncompatibleArtifact(
  source: PersistedCompiledArtifact,
): PersistedCompiledArtifact {
  const compiled = structuredClone(source.compiled) as unknown as Record<string, unknown>;
  compiled['rendererContractVersion'] = '99';
  delete compiled['contentHash'];
  const contentHash = sha256ContentHash(compiled);
  compiled['contentHash'] = contentHash;
  return {
    ...structuredClone(source),
    id: 'artifact_second_unsupported_renderer',
    contentHash,
    rendererContractVersion: '99',
    compiled: compiled as unknown as PersistedCompiledArtifact['compiled'],
  };
}

function sha256ContentHash(value: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function timestamp(sequence: number): string {
  return new Date(Date.UTC(2026, 7, 9, 0, sequence, 0)).toISOString();
}
