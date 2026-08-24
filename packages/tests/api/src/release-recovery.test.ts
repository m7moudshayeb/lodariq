import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  ReleaseRecoveryHistoryIntegrityError,
  createAuthoringSessionToken,
  createEnvironmentClientToken,
  createInMemoryControlPlaneRepository,
  getAuthoringDocumentSessionCapabilities,
  hashAuthoringSessionToken,
  hashEnvironmentToken,
  type ControlPlaneRepository,
  type InMemoryControlPlaneSeed,
  type PersistedCompiledArtifact,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  AUTHORING_SESSION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMMERCIAL_PLAN_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  PUBLIC_MANIFEST_SCHEMA_VERSION,
  RENDERER_CONTRACT_VERSION,
  type NewCompiledDocument,
  type LodariqDocument,
  type ReleaseRecoveryRequest,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_api_recovery';
const FOREIGN_WORKSPACE_ID = 'wk_api_recovery_foreign';
const DOCUMENT_ID = 'doc_api_recovery';
const OWNER_ID = 'user_api_recovery_owner';
const STAGING_ID = 'env_api_recovery_staging';
const DEVELOPMENT_ID = 'env_api_recovery_development';
const PRODUCTION_ID = 'env_api_recovery_production';
const FOREIGN_ENVIRONMENT_ID = 'env_api_recovery_foreign';
const FIRST_PUBLICATION_ID = 'pub_api_recovery_first';
const CURRENT_PUBLICATION_ID = 'pub_api_recovery_current';
const CREATED_AT = '2026-08-09T12:00:00.000Z';
const APP_ORIGIN = 'https://app.lodariq.io';
const EDITOR_ORIGIN = 'https://editor.lodariq.io';
const STAGING_ORIGIN = 'https://staging.customer.example';
const PRODUCTION_ORIGIN = 'https://production.customer.example';

const dashboardHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': OWNER_ID,
  'x-lodariq-role': 'owner',
};

describe('release recovery HTTP integration', () => {
  it('serves complete dashboard history and performs idempotent rollback', async () => {
    const fixture = createFixture();
    const path = dashboardRecoveryPath();

    const preflight = await fixture.app.inject({
      method: 'OPTIONS',
      url: path,
      headers: { origin: APP_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(APP_ORIGIN);

    const state = await fixture.app.inject({ method: 'GET', url: path, headers: dashboardHeaders });
    expect(state.statusCode, state.body).toBe(200);
    expect(state.json()).toMatchObject({
      workspaceId: WORKSPACE_ID,
      environmentId: PRODUCTION_ID,
      documentId: DOCUMENT_ID,
      deployment: {
        state: 'active',
        generation: 2,
        activePublicationId: CURRENT_PUBLICATION_ID,
      },
      permissions: { rollback: true, unpublish: true },
      rollbackTargetPublicationIds: [FIRST_PUBLICATION_ID],
      history: [{}, {}],
    });

    const request = rollbackRequest();
    const first = await fixture.app.inject({
      method: 'POST',
      url: path,
      headers: dashboardHeaders,
      payload: request,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({
      ok: true,
      action: 'rollback',
      replayed: false,
      targetPublicationId: FIRST_PUBLICATION_ID,
      previousPublicationId: CURRENT_PUBLICATION_ID,
      generation: 3,
    });

    const replay = await fixture.app.inject({
      method: 'POST',
      url: path,
      headers: dashboardHeaders,
      payload: request,
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toEqual({ ...first.json<Record<string, unknown>>(), replayed: true });

    const altered = await fixture.app.inject({
      method: 'POST',
      url: path,
      headers: dashboardHeaders,
      payload: { ...request, reason: 'A different rollback intent' },
    });
    expect(altered.statusCode, altered.body).toBe(409);
    expect(altered.json()).toMatchObject({ ok: false, code: 'idempotency_conflict' });

    await fixture.app.close();
  });

  it('uses one vetted template for production recovery from staging direct authoring', async () => {
    const fixture = createFixture();
    const directHeaders = {
      authorization: `Bearer ${fixture.tokens.stagingEnvironment}`,
      'x-lodariq-authoring-session': fixture.tokens.directSession,
      origin: STAGING_ORIGIN,
    };
    const template =
      'https://api.lodariq.io/v1/sdk/authoring/environments/:environmentId/release-recovery';

    const bootstrap = await fixture.app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: directHeaders,
      payload: { environment: 'staging', origin: STAGING_ORIGIN },
    });
    expect(bootstrap.statusCode, bootstrap.body).toBe(200);
    expect(bootstrap.json()).toMatchObject({
      authoring: {
        release: {
          recoveryState: { capability: 'document:read-release-state', url: template },
          rollback: { capability: 'document:rollback', url: template },
          unpublish: { capability: 'document:unpublish', url: template },
        },
      },
    });

    const productionPath = directRecoveryPath(PRODUCTION_ID);
    const preflight = await fixture.app.inject({
      method: 'OPTIONS',
      url: productionPath,
      headers: { origin: STAGING_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(STAGING_ORIGIN);

    const productionState = await fixture.app.inject({
      method: 'GET',
      url: productionPath,
      headers: directHeaders,
    });
    expect(productionState.statusCode, productionState.body).toBe(200);
    expect(productionState.json()).toMatchObject({
      environmentId: PRODUCTION_ID,
      permissions: { rollback: true, unpublish: true },
      rollbackTargetPublicationIds: [FIRST_PUBLICATION_ID],
    });

    for (const unavailableEnvironmentId of ['env_api_recovery_unknown', FOREIGN_ENVIRONMENT_ID]) {
      const unavailable = await fixture.app.inject({
        method: 'GET',
        url: directRecoveryPath(unavailableEnvironmentId),
        headers: directHeaders,
      });
      expect(unavailable.statusCode).toBe(404);
    }

    const rolledBack = await fixture.app.inject({
      method: 'POST',
      url: productionPath,
      headers: directHeaders,
      payload: rollbackRequest({
        idempotencyKey: 'recovery:api:direct:rollback',
        correlationId: 'correlation:api:direct:rollback',
      }),
    });
    expect(rolledBack.statusCode, rolledBack.body).toBe(201);
    expect(rolledBack.json()).toMatchObject({ ok: true, action: 'rollback', generation: 3 });

    const invalidIdentifier = await fixture.app.inject({
      method: 'POST',
      url: productionPath,
      headers: directHeaders,
      payload: rollbackRequest({
        targetPublicationId: ' https://example.invalid/private ',
        idempotencyKey: 'recovery:api:invalid:id',
        correlationId: 'correlation:api:invalid:id',
      }),
    });
    expect(invalidIdentifier.statusCode).toBe(400);

    await fixture.app.close();
  });

  it('grants nothing to legacy direct sessions carrying no capability list', async () => {
    const tokens = createTokens();
    const seed = createSeed(tokens);
    const directSession = seed.authoringSessions?.find(
      (session) => session.id === 'authsess_api_direct',
    );
    if (!directSession) throw new Error('direct session fixture missing');
    directSession.capabilities = null;
    const repository = createInMemoryControlPlaneRepository(seed);
    const app = createApiApp({
      repository,
      defaultWorkspaceId: WORKSPACE_ID,
      defaultUserId: OWNER_ID,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    const headers = {
      authorization: `Bearer ${tokens.stagingEnvironment}`,
      'x-lodariq-authoring-session': tokens.directSession,
      origin: STAGING_ORIGIN,
    };

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers,
      payload: { environment: 'staging', origin: STAGING_ORIGIN },
    });
    expect(bootstrap.statusCode, bootstrap.body).toBe(200);
    // An absent capability list is not a wildcard: the release envelope is
    // withheld entirely rather than narrowed to the read-only subset.
    const authoring = bootstrap.json<{ authoring?: { release?: unknown } }>().authoring;
    expect(authoring?.release).toBeUndefined();

    const state = await app.inject({
      method: 'GET',
      url: directRecoveryPath(PRODUCTION_ID),
      headers,
    });
    expect(state.statusCode, state.body).toBe(403);

    const denied = await app.inject({
      method: 'POST',
      url: directRecoveryPath(PRODUCTION_ID),
      headers,
      payload: rollbackRequest({
        idempotencyKey: 'recovery:api:legacy:denied',
        correlationId: 'correlation:api:legacy:denied',
      }),
    });
    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json()).toMatchObject({
      ok: false,
      action: 'rollback',
      code: 'capability_denied',
    });
    await expect(
      repository.getDocumentDeployment(WORKSPACE_ID, PRODUCTION_ID, DOCUMENT_ID),
    ).resolves.toMatchObject({
      generation: 2,
      activePublicationId: CURRENT_PUBLICATION_ID,
    });

    await app.close();
  });

  it('refuses a direct-SDK document save when the session lacks document:write', async () => {
    const tokens = createTokens();
    const seed = createSeed(tokens);
    const directSession = seed.authoringSessions?.find(
      (session) => session.id === 'authsess_api_direct',
    );
    if (!directSession) throw new Error('direct session fixture missing');
    directSession.capabilities = getAuthoringDocumentSessionCapabilities('staging').filter(
      (capability) => capability !== AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
    );
    const repository = createInMemoryControlPlaneRepository(seed);
    const app = createApiApp({
      repository,
      defaultWorkspaceId: WORKSPACE_ID,
      defaultUserId: OWNER_ID,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });

    const refused = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: {
        authorization: `Bearer ${tokens.stagingEnvironment}`,
        'x-lodariq-authoring-session': tokens.directSession,
        origin: STAGING_ORIGIN,
      },
      payload: { document: {}, expectedDocumentUpdatedAt: CREATED_AT },
    });
    expect(refused.statusCode, refused.body).toBe(403);
    expect(refused.json()).toMatchObject({ error: 'authoring_capability_forbidden' });

    await app.close();
  });

  it('refuses a direct-SDK document save that omits the concurrency precondition', async () => {
    const tokens = createTokens();
    const repository = createInMemoryControlPlaneRepository(createSeed(tokens));
    const app = createApiApp({
      repository,
      defaultWorkspaceId: WORKSPACE_ID,
      defaultUserId: OWNER_ID,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });

    const headers = {
      authorization: `Bearer ${tokens.stagingEnvironment}`,
      'x-lodariq-authoring-session': tokens.directSession,
      origin: STAGING_ORIGIN,
    };
    const loaded = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/document',
      headers,
    });
    expect(loaded.statusCode, loaded.body).toBe(200);

    const refused = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers,
      payload: { document: loaded.json<{ document: unknown }>().document },
    });
    expect(refused.statusCode, refused.body).toBe(428);
    expect(refused.json()).toMatchObject({ error: 'precondition_required' });

    await app.close();
  });

  it('returns a stable entitlement denial when release recovery is not included', async () => {
    const tokens = createTokens();
    const seed = createSeed(tokens);
    const subscription = seed.workspaceSubscriptions?.[0];
    if (!subscription) throw new Error('commercial fixture missing');
    subscription.planId = 'free';
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository(seed),
      defaultWorkspaceId: WORKSPACE_ID,
      defaultUserId: OWNER_ID,
    });

    const denied = await app.inject({
      method: 'POST',
      url: dashboardRecoveryPath(),
      headers: dashboardHeaders,
      payload: rollbackRequest(),
    });

    expect(denied.statusCode, denied.body).toBe(403);
    expect(denied.json()).toEqual({
      error: 'commercial_entitlement_exceeded',
      message: 'recovery is not included in this workspace plan',
    });
    await app.close();
  });

  it('intersects development permissions and supports hosted production unpublish', async () => {
    const fixture = createFixture();
    const developmentState = await fixture.app.inject({
      method: 'GET',
      url: directRecoveryPath(PRODUCTION_ID),
      headers: {
        authorization: `Bearer ${fixture.tokens.developmentEnvironment}`,
        'x-lodariq-authoring-session': fixture.tokens.developmentSession,
        origin: 'http://localhost:5175',
      },
    });
    expect(developmentState.statusCode, developmentState.body).toBe(200);
    expect(developmentState.json()).toMatchObject({
      environmentId: PRODUCTION_ID,
      permissions: { rollback: false, unpublish: false },
    });

    const hostedPath = hostedRecoveryPath(PRODUCTION_ID);
    const hostedHeaders = {
      'x-lodariq-authoring-session': fixture.tokens.hostedSession,
      origin: EDITOR_ORIGIN,
    };
    const hostedPreflight = await fixture.app.inject({
      method: 'OPTIONS',
      url: hostedPath,
      headers: { origin: EDITOR_ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(hostedPreflight.statusCode).toBe(204);
    expect(hostedPreflight.headers['access-control-allow-origin']).toBe(EDITOR_ORIGIN);

    const hostedState = await fixture.app.inject({
      method: 'GET',
      url: hostedPath,
      headers: hostedHeaders,
    });
    expect(hostedState.statusCode, hostedState.body).toBe(200);
    expect(hostedState.json()).toMatchObject({
      environmentId: PRODUCTION_ID,
      permissions: { rollback: true, unpublish: true },
    });

    const unpublished = await fixture.app.inject({
      method: 'POST',
      url: hostedPath,
      headers: hostedHeaders,
      payload: unpublishRequest(),
    });
    expect(unpublished.statusCode, unpublished.body).toBe(201);
    expect(unpublished.json()).toMatchObject({
      ok: true,
      action: 'unpublish',
      state: 'inactive',
      previousPublicationId: CURRENT_PUBLICATION_ID,
      generation: 3,
    });

    const manifest = await fixture.app.inject({
      method: 'GET',
      url: `/v1/sdk/workspaces/${WORKSPACE_ID}/environments/${PRODUCTION_ID}/documents/${DOCUMENT_ID}/manifest`,
      headers: {
        authorization: `Bearer ${fixture.tokens.productionEnvironment}`,
        origin: PRODUCTION_ORIGIN,
      },
    });
    expect(manifest.statusCode, manifest.body).toBe(200);
    expect(manifest.json()).toEqual({
      schemaVersion: PUBLIC_MANIFEST_SCHEMA_VERSION,
      workspaceId: WORKSPACE_ID,
      environmentId: PRODUCTION_ID,
      documentId: DOCUMENT_ID,
      state: 'inactive',
      generation: 3,
      deactivatedAt: unpublished.json<{ completedAt: string }>().completedAt,
    });

    await fixture.app.close();
  });

  it('maps repository history and malformed-response failures to typed 500 responses', async () => {
    const base = createInMemoryControlPlaneRepository(createSeed(createTokens()));
    const repository = new Proxy(base, {
      get(target, property, receiver) {
        if (property === 'getReleaseRecoveryState') {
          return async () => {
            throw new ReleaseRecoveryHistoryIntegrityError('relop_corrupt');
          };
        }
        if (property === 'recoverDocumentRelease') {
          return async () => ({ ok: true, action: 'rollback' });
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as ControlPlaneRepository;
    const app = createApiApp({
      repository,
      defaultWorkspaceId: WORKSPACE_ID,
      defaultUserId: OWNER_ID,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });

    const state = await app.inject({
      method: 'GET',
      url: dashboardRecoveryPath(),
      headers: dashboardHeaders,
    });
    expect(state.statusCode, state.body).toBe(500);
    expect(state.json()).toEqual({
      error: 'release_recovery_history_unavailable',
      message: 'Complete release recovery history is temporarily unavailable',
    });

    const mutation = await app.inject({
      method: 'POST',
      url: dashboardRecoveryPath(),
      headers: dashboardHeaders,
      payload: rollbackRequest(),
    });
    expect(mutation.statusCode, mutation.body).toBe(500);
    expect(mutation.json()).toMatchObject({
      ok: false,
      action: 'rollback',
      state: 'failed',
      replayed: false,
      code: 'internal_error',
      expectedGeneration: 2,
      expectedActivePublicationId: CURRENT_PUBLICATION_ID,
    });

    await app.close();
  });
});

interface FixtureTokens {
  stagingEnvironment: string;
  developmentEnvironment: string;
  productionEnvironment: string;
  directSession: string;
  developmentSession: string;
  hostedSession: string;
}

function createFixture() {
  const tokens = createTokens();
  const repository = createInMemoryControlPlaneRepository(createSeed(tokens));
  const app = createApiApp({
    repository,
    defaultWorkspaceId: WORKSPACE_ID,
    defaultUserId: OWNER_ID,
    publicApiBaseUrl: 'https://api.lodariq.io',
  });
  return { app, repository, tokens };
}

function createTokens(): FixtureTokens {
  return {
    stagingEnvironment: createEnvironmentClientToken('staging'),
    developmentEnvironment: createEnvironmentClientToken('development'),
    productionEnvironment: createEnvironmentClientToken('production'),
    directSession: createAuthoringSessionToken(),
    developmentSession: createAuthoringSessionToken(),
    hostedSession: createAuthoringSessionToken(),
  };
}

function createSeed(tokens: FixtureTokens): InMemoryControlPlaneSeed {
  const firstArtifact = createArtifact('first', ['staging']);
  const currentArtifact = createArtifact('current', ['production']);
  const first = completedPublication(
    firstArtifact,
    FIRST_PUBLICATION_ID,
    'relop_api_first',
    1,
    null,
  );
  const current = completedPublication(
    currentArtifact,
    CURRENT_PUBLICATION_ID,
    'relop_api_current',
    2,
    FIRST_PUBLICATION_ID,
  );
  const document = structuredClone(tourFixture) as LodariqDocument;
  document.id = DOCUMENT_ID;
  document.workspaceId = WORKSPACE_ID;
  const sessionPins = {
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
  };
  const installationId = 'ins_pub_api_recovery_hosted';

  return {
    workspaceSubscriptions: [
      {
        workspaceId: WORKSPACE_ID,
        planId: 'business',
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: '2026-08-01T00:00:00.000Z',
        currentPeriodEnd: '2026-09-01T00:00:00.000Z',
        revision: 1,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
    documents: [document],
    environments: [
      environment(DEVELOPMENT_ID, WORKSPACE_ID, 'development', 'http://localhost:5175', 0),
      environment(STAGING_ID, WORKSPACE_ID, 'staging', STAGING_ORIGIN, 1),
      environment(PRODUCTION_ID, WORKSPACE_ID, 'production', PRODUCTION_ORIGIN, 2),
      environment(
        FOREIGN_ENVIRONMENT_ID,
        FOREIGN_WORKSPACE_ID,
        'production',
        'https://foreign.example',
        2,
      ),
    ],
    workspaceMemberships: [
      { workspaceId: WORKSPACE_ID, userId: OWNER_ID, role: 'owner', createdAt: CREATED_AT },
    ],
    compiledArtifacts: [firstArtifact, currentArtifact],
    publications: [first.publication, current.publication],
    releaseOperations: [first.operation, current.operation],
    documentDeployments: [
      {
        workspaceId: WORKSPACE_ID,
        environmentId: PRODUCTION_ID,
        documentId: DOCUMENT_ID,
        state: 'active',
        activePublicationId: CURRENT_PUBLICATION_ID,
        pendingReleaseOperationId: null,
        generation: 2,
        updatedAt: timestamp(2),
      },
    ],
    environmentTokens: [
      environmentToken('envtok_api_staging', STAGING_ID, 'staging', tokens.stagingEnvironment),
      environmentToken(
        'envtok_api_development',
        DEVELOPMENT_ID,
        'development',
        tokens.developmentEnvironment,
      ),
      environmentToken(
        'envtok_api_production',
        PRODUCTION_ID,
        'production',
        tokens.productionEnvironment,
      ),
    ],
    publicSdkInstallations: [
      {
        installationId,
        workspaceId: WORKSPACE_ID,
        name: 'Hosted recovery fixture',
        createdByUserId: OWNER_ID,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        revokedAt: null,
        suspendedAt: null,
      },
    ],
    publicSdkInstallationOrigins: [
      {
        installationId,
        workspaceId: WORKSPACE_ID,
        environmentId: STAGING_ID,
        exactOrigin: STAGING_ORIGIN,
        authoringEnabled: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    ],
    authoringSessions: [
      {
        id: 'authsess_api_direct',
        workspaceId: WORKSPACE_ID,
        environmentId: STAGING_ID,
        environment: 'staging',
        documentId: DOCUMENT_ID,
        correlationId: 'correlation:api:direct:session',
        tokenHash: hashAuthoringSessionToken(tokens.directSession),
        iframeSrc: 'https://editor.lodariq.io/authoring.html',
        createdByUserId: OWNER_ID,
        createdAt: CREATED_AT,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        capabilities: getAuthoringDocumentSessionCapabilities('staging'),
        ...sessionPins,
      },
      {
        id: 'authsess_api_development',
        workspaceId: WORKSPACE_ID,
        environmentId: DEVELOPMENT_ID,
        environment: 'development',
        documentId: DOCUMENT_ID,
        correlationId: 'correlation:api:development:session',
        tokenHash: hashAuthoringSessionToken(tokens.developmentSession),
        iframeSrc: 'https://editor.lodariq.io/authoring.html',
        createdByUserId: OWNER_ID,
        createdAt: CREATED_AT,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        capabilities: getAuthoringDocumentSessionCapabilities('development'),
        ...sessionPins,
      },
      {
        id: 'authsess_api_hosted',
        workspaceId: WORKSPACE_ID,
        environmentId: STAGING_ID,
        environment: 'staging',
        documentId: DOCUMENT_ID,
        correlationId: 'correlation:api:hosted:session',
        tokenHash: hashAuthoringSessionToken(tokens.hostedSession),
        iframeSrc: 'https://editor.lodariq.io/authoring.html',
        createdByUserId: OWNER_ID,
        createdAt: CREATED_AT,
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: null,
        installationId,
        activationGrantId: 'authgrant_api_recovery',
        customerOrigin: STAGING_ORIGIN,
        capabilities: getAuthoringDocumentSessionCapabilities('staging'),
        ...sessionPins,
      },
    ],
  };
}

function environment(
  id: string,
  workspaceId: string,
  kind: WorkspaceEnvironment['kind'],
  origin: string,
  pipelinePosition: 0 | 1 | 2,
): WorkspaceEnvironment {
  return {
    id,
    workspaceId,
    kind,
    name: kind,
    originAllowlist: [origin],
    requiredApprovalCount: 0,
    enabled: true,
    pipelinePosition,
    authoringEnabled: kind !== 'production',
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
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function environmentToken(
  id: string,
  environmentId: string,
  environmentKind: 'development' | 'staging' | 'production',
  raw: string,
) {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    environmentId,
    environment: environmentKind,
    name: `${environmentKind} recovery token`,
    tokenHash: hashEnvironmentToken(raw),
    tokenPrefix: raw.slice(0, 18),
    createdAt: CREATED_AT,
    revokedAt: null,
  };
}

function completedPublication(
  artifact: PersistedCompiledArtifact,
  publicationId: string,
  operationId: string,
  generation: number,
  previousPublicationId: string | null,
): { publication: PersistedPublication; operation: PersistedReleaseOperation } {
  const occurredAt = timestamp(generation);
  const publication: PersistedPublication = {
    id: publicationId,
    workspaceId: WORKSPACE_ID,
    correlationId: `correlation:api:publication:${generation}`,
    environmentId: PRODUCTION_ID,
    environment: 'production',
    documentId: DOCUMENT_ID,
    documentVersionId: artifact.documentVersionId,
    compiledArtifactId: artifact.id,
    contentHash: artifact.contentHash,
    action: 'publish',
    sourcePublicationId: null,
    previousPublicationId,
    releaseOperationId: operationId,
    publishedByUserId: OWNER_ID,
    publishedAt: occurredAt,
    artifact: structuredClone(artifact),
  };
  return {
    publication,
    operation: {
      id: operationId,
      workspaceId: WORKSPACE_ID,
      environmentId: PRODUCTION_ID,
      documentId: DOCUMENT_ID,
      action: 'publish',
      requestedArtifactId: artifact.id,
      requestedSourcePublicationId: null,
      requestedActivePublicationId: null,
      actualActivePublicationId: null,
      sourcePublicationId: null,
      expectedGeneration: generation - 1,
      resultGeneration: generation,
      idempotencyKey: `publish:api:recovery:${generation}`,
      requestHash: artifact.contentHash,
      status: 'completed',
      correlationId: publication.correlationId,
      requestedByUserId: OWNER_ID,
      resultPublicationId: publication.id,
      reason: null,
      errorCode: null,
      createdAt: occurredAt,
      completedAt: occurredAt,
    },
  };
}

function createArtifact(label: string, environments: Array<'staging' | 'production'>) {
  const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  const contentWithoutHash = {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    documentId: DOCUMENT_ID,
    type: 'tour' as const,
    schemaVersion: '1.0.0' as const,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    trigger: { type: 'manual' as const },
    audience: { environments },
    theme,
    appearance: DEFAULT_EXPERIENCE_APPEARANCE,
    targets: [],
    steps: [],
    localization: { defaultLocale: 'en', defaultTitle: 'Recovery tour', variants: [] },
  };
  const compiled: NewCompiledDocument = {
    ...contentWithoutHash,
    contentHash: contentHash(contentWithoutHash),
  };
  return {
    id: `artifact_api_recovery_${label}`,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    documentVersionId: `docv_api_recovery_${label}`,
    contentHash: compiled.contentHash,
    compilerVersion: compiled.compilerVersion,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
    compiled,
    createdAt: label === 'first' ? timestamp(1) : timestamp(2),
  } satisfies PersistedCompiledArtifact;
}

function rollbackRequest(
  overrides: Partial<Extract<ReleaseRecoveryRequest, { action: 'rollback' }>> = {},
) {
  return {
    action: 'rollback' as const,
    targetPublicationId: FIRST_PUBLICATION_ID,
    reason: 'Restore the prior production release',
    expectedGeneration: 2,
    expectedActivePublicationId: CURRENT_PUBLICATION_ID,
    idempotencyKey: 'recovery:api:dashboard:rollback',
    correlationId: 'correlation:api:dashboard:rollback',
    ...overrides,
  };
}

function unpublishRequest(): Extract<ReleaseRecoveryRequest, { action: 'unpublish' }> {
  return {
    action: 'unpublish',
    reason: 'Temporarily remove the production release',
    expectedGeneration: 2,
    expectedActivePublicationId: CURRENT_PUBLICATION_ID,
    idempotencyKey: 'recovery:api:hosted:unpublish',
    correlationId: 'correlation:api:hosted:unpublish',
  };
}

function dashboardRecoveryPath(): string {
  return `/v1/documents/${DOCUMENT_ID}/environments/${PRODUCTION_ID}/release-recovery`;
}

function directRecoveryPath(environmentId: string): string {
  return `/v1/sdk/authoring/environments/${environmentId}/release-recovery`;
}

function hostedRecoveryPath(environmentId: string): string {
  return `/v1/authoring/environments/${environmentId}/release-recovery`;
}

function contentHash(value: unknown): string {
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
  return new Date(Date.UTC(2026, 7, 9, 12, sequence, 0)).toISOString();
}
