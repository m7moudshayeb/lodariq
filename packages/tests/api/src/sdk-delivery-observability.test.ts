import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApiApp, type CreateApiAppOptions } from '@lodariq/api';
import {
  createEnvironmentClientToken,
  createInMemoryControlPlaneRepository,
  hashEnvironmentToken,
  type ControlPlaneRepository,
  type InMemoryControlPlaneSeed,
  type PersistedCompiledArtifact,
  type PersistedPublication,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type NewCompiledDocument,
} from '@lodariq/schema';

const WORKSPACE_ID = 'wk_delivery_observability';
const ENVIRONMENT_ID = 'env_delivery_observability';
const ACTIVE_DOCUMENT_ID = 'doc_delivery_observability_active';
const INACTIVE_DOCUMENT_ID = 'doc_delivery_observability_inactive';
const INCONSISTENT_DOCUMENT_ID = 'doc_delivery_observability_inconsistent';
const MISSING_DOCUMENT_ID = 'doc_delivery_observability_missing';
const ERROR_DOCUMENT_ID = 'doc_delivery_observability_error';
const PUBLICATION_ID = 'pub_delivery_observability';
const CREATED_AT = '2026-08-09T20:00:00.000Z';
const RETRY_ATTEMPT_HEADER = 'x-lodariq-retry-attempt';

type CapturedObservabilityEvent = Parameters<
  NonNullable<CreateApiAppOptions['observability']>['emit']
>[0];

describe('SDK delivery observability', () => {
  it('emits one bounded privacy-safe event for every manifest resolution outcome', async () => {
    const token = createEnvironmentClientToken('production');
    const repository = createDeliveryRepository(token);
    const originalGetDeployment = repository.getDocumentDeployment.bind(repository);
    const originalGetCurrentPublication =
      repository.getCurrentPublicationForDocument.bind(repository);
    repository.getDocumentDeployment = async (workspaceId, environmentId, documentId) => {
      if (documentId === ERROR_DOCUMENT_ID) {
        throw new Error('synthetic repository failure with https://private.example/secret');
      }
      return originalGetDeployment(workspaceId, environmentId, documentId);
    };
    repository.getCurrentPublicationForDocument = async (
      workspaceId,
      environmentId,
      documentId,
    ) => {
      if (documentId === INCONSISTENT_DOCUMENT_ID) return null;
      return originalGetCurrentPublication(workspaceId, environmentId, documentId);
    };
    const events: CapturedObservabilityEvent[] = [];
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
      observability: { emit: (event) => events.push(event) },
    });
    const headers = { authorization: `Bearer ${token}` };

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: manifestPath(ACTIVE_DOCUMENT_ID),
      headers: { origin: 'https://delivery.customer.example' },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-headers']).toContain(RETRY_ATTEMPT_HEADER);

    const active = await app.inject({
      method: 'GET',
      url: manifestPath(ACTIVE_DOCUMENT_ID),
      headers,
    });
    expect(active.statusCode, active.body).toBe(200);

    const notModified = await app.inject({
      method: 'GET',
      url: manifestPath(ACTIVE_DOCUMENT_ID),
      headers: {
        ...headers,
        'if-none-match': requiredHeader(active.headers.etag),
        [RETRY_ATTEMPT_HEADER]: '1',
      },
    });
    expect(notModified.statusCode).toBe(304);

    const inactive = await app.inject({
      method: 'GET',
      url: manifestPath(INACTIVE_DOCUMENT_ID),
      headers: { ...headers, [RETRY_ATTEMPT_HEADER]: '2' },
    });
    expect(inactive.statusCode, inactive.body).toBe(200);
    expect(inactive.json()).toMatchObject({ state: 'inactive' });

    const missing = await app.inject({
      method: 'GET',
      url: manifestPath(MISSING_DOCUMENT_ID),
      headers: { ...headers, [RETRY_ATTEMPT_HEADER]: 'unbounded-private-value' },
    });
    expect(missing.statusCode).toBe(404);

    const inconsistent = await app.inject({
      method: 'GET',
      url: manifestPath(INCONSISTENT_DOCUMENT_ID),
      headers,
    });
    expect(inconsistent.statusCode).toBe(409);

    const failed = await app.inject({
      method: 'GET',
      url: manifestPath(ERROR_DOCUMENT_ID),
      headers,
    });
    expect(failed.statusCode).toBe(500);

    expect(events).toHaveLength(6);
    expectResolutionEvent(events[0], {
      name: 'sdk.delivery.manifest.resolved',
      outcome: 'active',
      statusCode: 200,
      cacheOutcome: 'served',
      retryBucket: 'initial',
    });
    expectResolutionEvent(events[1], {
      name: 'sdk.delivery.manifest.resolved',
      outcome: 'active',
      statusCode: 304,
      cacheOutcome: 'not_modified',
      retryBucket: 'first_retry',
    });
    expectResolutionEvent(events[2], {
      name: 'sdk.delivery.manifest.resolved',
      outcome: 'inactive',
      statusCode: 200,
      cacheOutcome: 'served',
      retryBucket: 'multiple_retries',
    });
    expectResolutionEvent(events[3], {
      name: 'sdk.delivery.manifest.resolved',
      outcome: 'not_found',
      statusCode: 404,
      cacheOutcome: 'not_applicable',
      retryBucket: 'unknown',
    });
    expectResolutionEvent(events[4], {
      name: 'sdk.delivery.manifest.resolved',
      outcome: 'inconsistent',
      statusCode: 409,
      cacheOutcome: 'not_applicable',
      retryBucket: 'initial',
    });
    expectResolutionEvent(events[5], {
      name: 'sdk.delivery.manifest.resolved',
      outcome: 'error',
      statusCode: 500,
      cacheOutcome: 'not_applicable',
      retryBucket: 'initial',
    });
    expect(JSON.stringify(events)).not.toContain(token);
    expect(JSON.stringify(events)).not.toContain(MISSING_DOCUMENT_ID);
    expect(JSON.stringify(events)).not.toContain('https://private.example/secret');

    await app.close();
  });

  it('measures immutable artifact 200, ETag 304, not-found, and retry buckets', async () => {
    const token = createEnvironmentClientToken('production');
    const repository = createDeliveryRepository(token);
    const originalListPublications = repository.listDocumentPublications.bind(repository);
    repository.listDocumentPublications = async (workspaceId, documentId) => {
      if (documentId === ERROR_DOCUMENT_ID) {
        throw new Error('synthetic artifact failure with https://private.example/artifact');
      }
      return originalListPublications(workspaceId, documentId);
    };
    const events: CapturedObservabilityEvent[] = [];
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
      observability: { emit: (event) => events.push(event) },
    });
    const headers = { authorization: `Bearer ${token}` };
    const artifact = createArtifact();

    const served = await app.inject({
      method: 'GET',
      url: artifactPath(ACTIVE_DOCUMENT_ID, artifact.contentHash),
      headers,
    });
    expect(served.statusCode, served.body).toBe(200);

    const notModified = await app.inject({
      method: 'GET',
      url: artifactPath(ACTIVE_DOCUMENT_ID, artifact.contentHash),
      headers: {
        ...headers,
        'if-none-match': requiredHeader(served.headers.etag),
        [RETRY_ATTEMPT_HEADER]: '10',
      },
    });
    expect(notModified.statusCode).toBe(304);

    const missingHash = `sha256-${'f'.repeat(64)}`;
    const missing = await app.inject({
      method: 'GET',
      url: artifactPath(ACTIVE_DOCUMENT_ID, missingHash),
      headers: { ...headers, [RETRY_ATTEMPT_HEADER]: '11' },
    });
    expect(missing.statusCode).toBe(404);

    const failed = await app.inject({
      method: 'GET',
      url: artifactPath(ERROR_DOCUMENT_ID, artifact.contentHash),
      headers,
    });
    expect(failed.statusCode).toBe(500);

    expect(events).toHaveLength(4);
    expectResolutionEvent(events[0], {
      name: 'sdk.delivery.artifact.resolved',
      outcome: 'found',
      statusCode: 200,
      cacheOutcome: 'served',
      retryBucket: 'initial',
    });
    expectResolutionEvent(events[1], {
      name: 'sdk.delivery.artifact.resolved',
      outcome: 'found',
      statusCode: 304,
      cacheOutcome: 'not_modified',
      retryBucket: 'multiple_retries',
    });
    expectResolutionEvent(events[2], {
      name: 'sdk.delivery.artifact.resolved',
      outcome: 'not_found',
      statusCode: 404,
      cacheOutcome: 'not_applicable',
      retryBucket: 'unknown',
    });
    expectResolutionEvent(events[3], {
      name: 'sdk.delivery.artifact.resolved',
      outcome: 'error',
      statusCode: 500,
      cacheOutcome: 'not_applicable',
      retryBucket: 'initial',
    });
    expect(JSON.stringify(events)).not.toContain(artifact.contentHash);
    expect(JSON.stringify(events)).not.toContain(missingHash);

    await app.close();
  });
});

interface ExpectedResolutionEvent {
  name: 'sdk.delivery.artifact.resolved' | 'sdk.delivery.manifest.resolved';
  outcome: 'active' | 'error' | 'found' | 'inactive' | 'inconsistent' | 'not_found';
  statusCode: 200 | 304 | 404 | 409 | 500;
  cacheOutcome: 'not_applicable' | 'not_modified' | 'served';
  retryBucket: 'first_retry' | 'initial' | 'multiple_retries' | 'unknown';
}

function expectResolutionEvent(
  event: CapturedObservabilityEvent | undefined,
  expected: ExpectedResolutionEvent,
): void {
  expect(event).toBeDefined();
  expect(Object.keys(event ?? {}).sort()).toEqual([
    'attributes',
    'environmentId',
    'name',
    'timestamp',
    'workspaceId',
  ]);
  expect(event).toMatchObject({
    name: expected.name,
    workspaceId: WORKSPACE_ID,
    environmentId: ENVIRONMENT_ID,
  });
  expect(event?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  expect(Object.keys(event?.attributes ?? {}).sort()).toEqual([
    'cacheOutcome',
    'durationMs',
    'outcome',
    'retryBucket',
    'statusCode',
  ]);
  expect(event?.attributes).toMatchObject({
    outcome: expected.outcome,
    statusCode: expected.statusCode,
    cacheOutcome: expected.cacheOutcome,
    retryBucket: expected.retryBucket,
  });
  const durationMs = event?.attributes?.['durationMs'];
  expect(Number.isSafeInteger(durationMs)).toBe(true);
  expect(durationMs).toEqual(expect.any(Number));
  expect(durationMs as number).toBeGreaterThanOrEqual(0);
  expect(durationMs as number).toBeLessThanOrEqual(60_000);
}

function createDeliveryRepository(token: string): ControlPlaneRepository {
  return createInMemoryControlPlaneRepository(deliverySeed(token));
}

function deliverySeed(token: string): InMemoryControlPlaneSeed {
  const artifact = createArtifact();
  const publication: PersistedPublication = {
    id: PUBLICATION_ID,
    workspaceId: WORKSPACE_ID,
    correlationId: 'correlation:delivery:observability',
    environmentId: ENVIRONMENT_ID,
    environment: 'production',
    documentId: ACTIVE_DOCUMENT_ID,
    documentVersionId: artifact.documentVersionId,
    compiledArtifactId: artifact.id,
    contentHash: artifact.contentHash,
    action: null,
    sourcePublicationId: null,
    previousPublicationId: null,
    releaseOperationId: null,
    publishedByUserId: null,
    publishedAt: CREATED_AT,
    artifact,
  };
  return {
    environments: [productionEnvironment()],
    environmentTokens: [
      {
        id: 'envtok_delivery_observability',
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        environment: 'production',
        name: 'Delivery observability test token',
        tokenHash: hashEnvironmentToken(token),
        tokenPrefix: token.slice(0, 18),
        createdAt: CREATED_AT,
        revokedAt: null,
      },
    ],
    compiledArtifacts: [artifact],
    publications: [publication],
    documentDeployments: [
      {
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: ACTIVE_DOCUMENT_ID,
        state: 'active',
        activePublicationId: PUBLICATION_ID,
        pendingReleaseOperationId: null,
        generation: 1,
        updatedAt: CREATED_AT,
      },
      {
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: INCONSISTENT_DOCUMENT_ID,
        state: 'active',
        activePublicationId: 'pub_delivery_observability_missing',
        pendingReleaseOperationId: null,
        generation: 3,
        updatedAt: CREATED_AT,
      },
      {
        workspaceId: WORKSPACE_ID,
        environmentId: ENVIRONMENT_ID,
        documentId: INACTIVE_DOCUMENT_ID,
        state: 'inactive',
        activePublicationId: null,
        pendingReleaseOperationId: null,
        generation: 2,
        updatedAt: CREATED_AT,
      },
    ],
  };
}

function productionEnvironment(): WorkspaceEnvironment {
  return {
    id: ENVIRONMENT_ID,
    workspaceId: WORKSPACE_ID,
    kind: 'production',
    name: 'Production',
    originAllowlist: [],
    requiredApprovalCount: 0,
    enabled: true,
    pipelinePosition: 2,
    authoringEnabled: false,
    releasePolicy: {
      allowDirectPublish: false,
      requireSourceVerification: true,
      requiredApprovalCount: 0,
      publisherRoles: ['owner', 'admin'],
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

function createArtifact(): PersistedCompiledArtifact {
  const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  const contentWithoutHash = {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    documentId: ACTIVE_DOCUMENT_ID,
    type: 'tour' as const,
    schemaVersion: '1.0.0' as const,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    trigger: { type: 'manual' as const },
    audience: { environments: ['production' as const] },
    theme,
    appearance: DEFAULT_EXPERIENCE_APPEARANCE,
    targets: [],
    steps: [],
    localization: { defaultLocale: 'en', defaultTitle: 'Observed tour', variants: [] },
  };
  const compiled: NewCompiledDocument = {
    ...contentWithoutHash,
    contentHash: contentHash(contentWithoutHash),
  };
  return {
    id: 'artifact_delivery_observability',
    workspaceId: WORKSPACE_ID,
    documentId: ACTIVE_DOCUMENT_ID,
    documentVersionId: 'docv_delivery_observability',
    contentHash: compiled.contentHash,
    compilerVersion: compiled.compilerVersion,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
    compiled,
    createdAt: CREATED_AT,
  };
}

function manifestPath(documentId: string): string {
  return `/v1/sdk/workspaces/${WORKSPACE_ID}/environments/${ENVIRONMENT_ID}/documents/${documentId}/manifest`;
}

function artifactPath(documentId: string, artifactContentHash: string): string {
  return `/v1/sdk/workspaces/${WORKSPACE_ID}/environments/${ENVIRONMENT_ID}/documents/${documentId}/artifacts/${artifactContentHash}`;
}

function requiredHeader(value: string | string[] | undefined): string {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) throw new Error('required response header missing');
  return header;
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
