import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  getEnvironmentTokenPrefix,
  hashEnvironmentToken,
  type InMemoryControlPlaneSeed,
  type PersistedCompiledArtifact,
  type PersistedPublication,
  type WorkspaceEnvironment,
} from '@lodariq/database';

const WORKSPACE_ID = 'wk_analytics';
const DOCUMENT_ID = 'doc_analytics';
const STAGING_TOKEN = 'lod_staging_analytics_token_1234567890';
const PRODUCTION_TOKEN = 'lod_production_analytics_token_1234567890';
const STAGING_HASH = `sha256-${'a'.repeat(64)}`;
const PRODUCTION_HASH = `sha256-${'b'.repeat(64)}`;
const authHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': 'user_analytics',
};

describe('SDK analytics authority and environment isolation', () => {
  it('does not advertise ingestion when a legacy publication has no active deployment pointer', async () => {
    const seed = analyticsSeed();
    seed.documentDeployments = [];
    const repository = createInMemoryControlPlaneRepository(seed);
    const app = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.com' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: { environment: 'staging' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ ingestUrl: string; analyticsPointers?: unknown[] }>()).toMatchObject({
      ingestUrl: '',
    });
    expect(response.json<{ analyticsPointers?: unknown[] }>().analyticsPointers).toBeUndefined();
    await app.close();
  });

  it('derives identity from the token and current pointer, then keeps environments separate', async () => {
    const repository = createInMemoryControlPlaneRepository(analyticsSeed());
    const app = createApiApp({ repository, publicApiBaseUrl: 'https://api.lodariq.com' });

    const stagingPointer = await bootstrapPointer(app, STAGING_TOKEN, 'staging');
    expect(stagingPointer).toEqual({
      documentId: DOCUMENT_ID,
      generation: 3,
      publicationId: 'pub_analytics_staging',
      contentHash: STAGING_HASH,
    });

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: { events: [sdkEvent(stagingPointer)] },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual({ accepted: 1, rejected: 0, diagnostics: [] });

    const targetFailure = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: {
        events: [
          {
            ...sdkEvent(stagingPointer, 'target_resolution'),
            props: { result: 'missing' },
          },
        ],
      },
    });
    expect(targetFailure.json()).toEqual({ accepted: 1, rejected: 0, diagnostics: [] });

    const spoofed = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: {
        events: [
          {
            ...sdkEvent(stagingPointer),
            workspaceId: 'wk_spoofed',
            environmentId: 'env_production',
          },
        ],
      },
    });
    expect(spoofed.statusCode).toBe(202);
    expect(spoofed.json()).toEqual({
      accepted: 0,
      rejected: 1,
      diagnostics: [{ code: 'identity_forbidden', count: 1 }],
    });

    const stale = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: {
        events: [
          sdkEvent({
            ...stagingPointer,
            publicationId: 'pub_stale',
            generation: stagingPointer.generation - 1,
          }),
        ],
      },
    });
    expect(stale.json()).toEqual({
      accepted: 0,
      rejected: 1,
      diagnostics: [{ code: 'pointer_stale', count: 1 }],
    });

    const productionPointer = await bootstrapPointer(app, PRODUCTION_TOKEN, 'production');
    const production = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${PRODUCTION_TOKEN}` },
      payload: { events: [sdkEvent(productionPointer, 'tour_completed')] },
    });
    expect(production.json()).toEqual({ accepted: 1, rejected: 0, diagnostics: [] });

    const stagingEvents = await app.inject({
      method: 'GET',
      url: '/v1/analytics/events?environmentId=env_staging',
      headers: authHeaders,
    });
    expect(stagingEvents.statusCode).toBe(200);
    expect(
      stagingEvents.json<{
        events: Array<{
          workspaceId: string;
          environmentId: string;
          publicationId: string;
          contentHash: string;
        }>;
      }>().events,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_staging',
          publicationId: 'pub_analytics_staging',
          contentHash: STAGING_HASH,
        }),
      ]),
    );

    const productionEvents = await app.inject({
      method: 'GET',
      url: '/v1/analytics/events?environmentId=env_production',
      headers: authHeaders,
    });
    expect(productionEvents.statusCode).toBe(200);
    expect(productionEvents.json<{ events: Array<{ environmentId: string }> }>().events).toEqual([
      expect.objectContaining({ environmentId: 'env_production' }),
    ]);

    const missingEnvironment = await app.inject({
      method: 'GET',
      url: '/v1/analytics/events',
      headers: authHeaders,
    });
    expect(missingEnvironment.statusCode).toBe(400);

    const aggregates = await app.inject({
      method: 'GET',
      url: '/v1/analytics/aggregate?environmentId=env_staging',
      headers: authHeaders,
    });
    expect(aggregates.statusCode).toBe(200);
    expect(
      aggregates.json<{
        aggregates: Array<{
          name: string;
          count: number;
          targetResolutionStatus?: string;
        }>;
      }>().aggregates,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'tour_started', count: 1 }),
        expect.objectContaining({
          name: 'target_resolution',
          targetResolutionStatus: 'missing',
          count: 1,
        }),
      ]),
    );

    await app.close();
  });

  it('rejects inactive pointers and cross-tenant document selectors without leaking scope', async () => {
    const seed = analyticsSeed();
    seed.documentDeployments?.push({
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      documentId: 'doc_inactive',
      state: 'inactive',
      generation: 7,
      activePublicationId: null,
      updatedAt: '2026-08-09T12:00:00.000Z',
    });
    const repository = createInMemoryControlPlaneRepository(seed);
    const app = createApiApp({ repository });

    const inactive = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: {
        events: [
          sdkEvent({
            documentId: 'doc_inactive',
            generation: 7,
            publicationId: 'pub_former',
            contentHash: STAGING_HASH,
          }),
        ],
      },
    });
    expect(inactive.json()).toEqual({
      accepted: 0,
      rejected: 1,
      diagnostics: [{ code: 'pointer_inactive', count: 1 }],
    });

    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${STAGING_TOKEN}` },
      payload: {
        events: [
          sdkEvent({
            documentId: 'doc_other_tenant',
            generation: 1,
            publicationId: 'pub_other_tenant',
            contentHash: STAGING_HASH,
          }),
        ],
      },
    });
    expect(unknown.json()).toEqual({
      accepted: 0,
      rejected: 1,
      diagnostics: [{ code: 'pointer_not_found', count: 1 }],
    });
    expect(unknown.body).not.toContain('other tenant');

    await app.close();
  });
});

interface TestPointer {
  documentId: string;
  generation: number;
  publicationId: string;
  contentHash: string;
}

async function bootstrapPointer(
  app: ReturnType<typeof createApiApp>,
  token: string,
  environment: 'staging' | 'production',
): Promise<TestPointer> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/sdk/bootstrap',
    headers: { authorization: `Bearer ${token}` },
    payload: { environment },
  });
  expect(response.statusCode).toBe(200);
  const pointers = response.json<{ analyticsPointers: TestPointer[] }>().analyticsPointers;
  expect(pointers).toHaveLength(1);
  return pointers[0]!;
}

function sdkEvent(pointer: TestPointer, name = 'tour_started') {
  return {
    name,
    documentId: pointer.documentId,
    pointer: {
      generation: pointer.generation,
      publicationId: pointer.publicationId,
      contentHash: pointer.contentHash,
    },
    sdkVersion: '0.0.0-test',
    timestamp: '2026-08-09T12:00:00.000Z',
    props: { trigger: 'manual' },
  };
}

function analyticsSeed(): InMemoryControlPlaneSeed {
  const environments: WorkspaceEnvironment[] = [
    {
      id: 'env_staging',
      workspaceId: WORKSPACE_ID,
      kind: 'staging',
      name: 'Staging',
      originAllowlist: ['https://staging.customer.example'],
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    },
    {
      id: 'env_production',
      workspaceId: WORKSPACE_ID,
      kind: 'production',
      name: 'Production',
      originAllowlist: ['https://customer.example'],
      createdAt: '2026-08-09T00:00:00.000Z',
      updatedAt: '2026-08-09T00:00:00.000Z',
    },
  ];
  const artifacts = [
    artifact('artifact_analytics_staging', STAGING_HASH),
    artifact('artifact_analytics_production', PRODUCTION_HASH),
  ];
  const publications: PersistedPublication[] = [
    publication('pub_analytics_staging', 'env_staging', 'staging', artifacts[0]!),
    publication('pub_analytics_production', 'env_production', 'production', artifacts[1]!),
  ];
  return {
    environments,
    environmentTokens: [
      {
        id: 'token_analytics_staging',
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        environment: 'staging' as const,
        name: 'Staging analytics',
        tokenHash: hashEnvironmentToken(STAGING_TOKEN),
        tokenPrefix: getEnvironmentTokenPrefix(STAGING_TOKEN),
        createdAt: '2026-08-09T00:00:00.000Z',
        revokedAt: null,
      },
      {
        id: 'token_analytics_production',
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_production',
        environment: 'production' as const,
        name: 'Production analytics',
        tokenHash: hashEnvironmentToken(PRODUCTION_TOKEN),
        tokenPrefix: getEnvironmentTokenPrefix(PRODUCTION_TOKEN),
        createdAt: '2026-08-09T00:00:00.000Z',
        revokedAt: null,
      },
    ],
    compiledArtifacts: artifacts,
    publications,
    documentDeployments: [
      {
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_staging',
        documentId: DOCUMENT_ID,
        state: 'active' as const,
        generation: 3,
        activePublicationId: 'pub_analytics_staging',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
      {
        workspaceId: WORKSPACE_ID,
        environmentId: 'env_production',
        documentId: DOCUMENT_ID,
        state: 'active' as const,
        generation: 5,
        activePublicationId: 'pub_analytics_production',
        updatedAt: '2026-08-09T12:00:00.000Z',
      },
    ],
  };
}

function artifact(id: string, contentHash: string): PersistedCompiledArtifact {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    documentVersionId: null,
    contentHash,
    compilerVersion: '0.0.0-test',
    compiled: {
      documentId: DOCUMENT_ID,
      type: 'tour',
      contentHash,
      schemaVersion: '1.0.0',
      compilerVersion: '0.0.0-test',
      targets: [],
      steps: [],
    },
    createdAt: '2026-08-09T10:00:00.000Z',
  };
}

function publication(
  id: string,
  environmentId: string,
  environment: 'staging' | 'production',
  compiledArtifact: PersistedCompiledArtifact,
): PersistedPublication {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    correlationId: `corr_${id}`,
    environmentId,
    environment,
    documentId: DOCUMENT_ID,
    documentVersionId: null,
    compiledArtifactId: compiledArtifact.id,
    contentHash: compiledArtifact.contentHash,
    action: 'publish',
    sourcePublicationId: null,
    previousPublicationId: null,
    releaseOperationId: null,
    publishedByUserId: 'user_analytics',
    publishedAt: '2026-08-09T12:00:00.000Z',
    artifact: compiledArtifact,
  };
}
