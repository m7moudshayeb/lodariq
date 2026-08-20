import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type InMemoryControlPlaneSeed,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  ControlPlaneAuthContext,
  MAX_ACTIVE_DOCUMENT_MANIFESTS,
  PublicSdkBootstrapContext,
  RENDERER_CONTRACT_VERSION,
  validate,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const authHeaders = {
  'x-lodariq-workspace-id': 'wk_public_sdk',
  'x-lodariq-user-id': 'user_public_sdk',
};

const memberHeaders = {
  ...authHeaders,
  'x-lodariq-user-id': 'user_public_sdk_member',
  'x-lodariq-role': 'member',
};
const viewerHeaders = {
  ...authHeaders,
  'x-lodariq-user-id': 'user_public_sdk_viewer',
  'x-lodariq-role': 'viewer',
};

const environments: WorkspaceEnvironment[] = [
  environment('env_staging', 'staging'),
  environment('env_staging_blue', 'staging'),
  environment('env_production', 'production'),
];

const baseDocument = tourFixture as LodariqDocument;

describe('origin-resolved public SDK bootstrap', () => {
  it('returns the exact membership-resolved control-plane auth context', async () => {
    const repository = createPublicSdkRepository({
      environments,
      workspaceMemberships: [
        {
          workspaceId: 'wk_public_sdk',
          userId: 'user_public_sdk',
          role: 'member',
          createdAt: '2026-08-07T00:00:00.000Z',
        },
      ],
    });
    const app = createApiApp({ repository });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/context',
      headers: { ...authHeaders, 'x-lodariq-role': 'owner' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: 'user_public_sdk',
      workspaceId: 'wk_public_sdk',
      role: 'member',
    });
    expect(validate(ControlPlaneAuthContext, response.json()).valid).toBe(true);
    await app.close();
  });

  it('creates one credential-free installation and bootstraps unpublished staging authoring', async () => {
    const repository = createPublicSdkRepository({ environments });
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://staging-api.lodariq.io',
      loaderSrc: 'https://staging-cdn.lodariq.io/loader/v1/lodariq-loader.js',
      authoringIframeSrc: 'https://staging-editor.lodariq.io/authoring.html',
    });

    const installationId = await createInstallation(app, 'Customer application');
    const disallowedMapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        origin: 'https://other.customer.example',
        authoringEnabled: true,
      },
    });
    expect(disallowedMapping.statusCode).toBe(409);
    expect(disallowedMapping.json()).toEqual({
      error: 'environment_policy_forbidden',
      message: 'Origin is not present in the environment origin allowlist',
    });
    const disallowedSync = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins/sync`,
      headers: authHeaders,
      payload: {
        origins: [
          {
            environmentId: 'env_staging',
            origin: 'https://other.customer.example',
            authoringEnabled: true,
          },
        ],
      },
    });
    expect(disallowedSync.statusCode).toBe(409);
    expect(disallowedSync.json()).toEqual({
      error: 'environment_policy_forbidden',
      message: 'Origin is not present in the environment origin allowlist',
    });

    const mapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        origin: 'https://staging.customer.example',
        authoringEnabled: true,
      },
    });
    expect(mapping.statusCode).toBe(200);

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/sdk-installations',
      headers: memberHeaders,
    });
    expect(listed.statusCode).toBe(200);
    const listedInstallations = listed.json<{
      installations: Array<{
        installationId: string;
        workspaceId: string;
        name: string;
        revokedAt: string | null;
        origins: Array<{ environmentId: string; exactOrigin: string; authoringEnabled: boolean }>;
        sdkSnippet: string;
      }>;
    }>().installations;
    expect(listedInstallations).toHaveLength(1);
    expect(listedInstallations[0]).toMatchObject({
      installationId,
      workspaceId: 'wk_public_sdk',
      name: 'Customer application',
      revokedAt: null,
      origins: [
        {
          environmentId: 'env_staging',
          exactOrigin: 'https://staging.customer.example',
          authoringEnabled: true,
        },
      ],
    });
    expect(listedInstallations[0]?.sdkSnippet).toContain(`data-installation="${installationId}"`);
    expect(JSON.stringify(listedInstallations)).not.toMatch(
      /data-lodariq-token|authoring-session|bootstrap-grant/i,
    );

    const localStagingMapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        origin: 'http://localhost:4173',
        authoringEnabled: true,
      },
    });
    expect(localStagingMapping.statusCode).toBe(200);

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: 'https://staging.customer.example' },
      payload: {
        installationId,
        origin: 'https://staging.customer.example',
        href: 'https://staging.customer.example/products?tab=active',
      },
    });

    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers['access-control-allow-origin']).toBe(
      'https://staging.customer.example',
    );
    const context = bootstrap.json<Record<string, unknown>>();
    expect(validate(PublicSdkBootstrapContext, context).valid).toBe(true);
    expect(context).toMatchObject({
      installationId,
      environmentId: 'env_staging',
      environment: 'staging',
      customerOrigin: 'https://staging.customer.example',
      delivery: { state: 'unavailable' },
      authoring: {
        state: 'available',
        appOrigin: 'https://staging-app.lodariq.io',
        activationUrl: 'https://staging-app.lodariq.io/authoring/activate',
        authorizationRequestUrl:
          'https://staging-api.lodariq.io/v1/sdk/authoring/authorization-requests',
        exchangeUrl: 'https://staging-api.lodariq.io/v1/sdk/authoring/exchange',
      },
    });
    expect(JSON.stringify(context)).not.toContain('creatorModule');
    expect(JSON.stringify(context)).not.toContain('authoringSession');

    const unpublishedDocument = await app.inject({
      method: 'GET',
      url: '/v1/sdk/current-document',
      headers: {
        origin: 'https://staging.customer.example',
        'x-lodariq-installation-id': installationId,
      },
    });
    expect(unpublishedDocument.statusCode).toBe(404);

    const event = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: {
        origin: 'https://staging.customer.example',
        'x-lodariq-installation-id': installationId,
      },
      payload: {
        events: [
          {
            name: 'sdk_loaded',
            sdkVersion: '0.0.0-test',
            timestamp: '2026-08-07T00:00:00.000Z',
          },
        ],
      },
    });
    expect(event.statusCode).toBe(202);
    expect(event.json()).toEqual({
      accepted: 0,
      rejected: 1,
      diagnostics: [{ code: 'pointer_required', count: 1 }],
    });

    await app.close();
  });

  it('returns a structurally data-free authoring branch for production', async () => {
    const app = createApiApp({
      repository: createPublicSdkRepository({ environments }),
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    const installationId = await createInstallation(app, 'Production application');

    const rejectedAuthoringMapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_production',
        origin: 'https://app.customer.example',
        authoringEnabled: true,
      },
    });
    expect(rejectedAuthoringMapping.statusCode).toBe(403);

    const rejectedHttpMapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_production',
        origin: 'http://app.customer.example',
        authoringEnabled: false,
      },
    });
    expect(rejectedHttpMapping.statusCode).toBe(400);
    expect(rejectedHttpMapping.json()).toMatchObject({ error: 'production_https_required' });

    const mapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_production',
        origin: 'https://app.customer.example',
        authoringEnabled: false,
      },
    });
    expect(mapping.statusCode).toBe(200);

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: 'https://app.customer.example' },
      payload: { installationId },
    });
    expect(bootstrap.statusCode).toBe(200);
    const context = bootstrap.json<{
      authoring: Record<string, unknown>;
      environment: string;
    }>();
    expect(context.environment).toBe('production');
    // §14: the dead end names its reason, and still leaks no activation surface.
    expect(context.authoring).toEqual({ state: 'disabled', reason: 'production_environment' });
    expect(JSON.stringify(context)).not.toMatch(
      /activationUrl|appOrigin|exchangeUrl|creator|editor|bootstrapGrant/i,
    );
    expect(validate(PublicSdkBootstrapContext, context).valid).toBe(true);

    await app.close();
  });

  it('bootstraps multiple document pointers and serves immutable, integrity-pinned artifacts', async () => {
    const repository = createPublicSdkRepository({ environments });
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    const documents = ['doc_delivery_alpha', 'doc_delivery_beta'].map((id) => ({
      ...structuredClone(baseDocument),
      id,
      workspaceId: 'wk_public_sdk',
      title: id.endsWith('alpha') ? 'Alpha tour' : 'Beta tour',
    }));
    for (const [index, document] of documents.entries()) {
      const saved = await app.inject({
        method: 'POST',
        url: '/v1/documents',
        headers: authHeaders,
        payload: document,
      });
      expect(saved.statusCode).toBe(201);
      const artifact = saved.json<{ latestArtifact: ReviewedArtifact | null }>().latestArtifact;
      if (!artifact) throw new Error('public delivery artifact missing');
      const published = await app.inject({
        method: 'POST',
        url: `/v1/documents/${document.id}/publications`,
        headers: {
          ...authHeaders,
          'idempotency-key': `release:public-delivery:${index}`,
          'x-lodariq-correlation-id': `corr_public_delivery_${index}`,
        },
        payload: {
          environmentId: 'env_staging',
          expectedGeneration: 0,
          expectedArtifactId: artifact.id,
          expectedContentHash: artifact.contentHash,
        },
      });
      expect(published.statusCode).toBe(201);
    }

    const installationId = await createInstallation(app, 'Document delivery');
    await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        origin: 'https://staging.customer.example',
        authoringEnabled: true,
      },
    });
    const publicHeaders = {
      origin: 'https://staging.customer.example',
      'x-lodariq-installation-id': installationId,
    };
    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: publicHeaders.origin },
      payload: { installationId },
    });
    expect(bootstrap.statusCode).toBe(200);
    const context = bootstrap.json<{
      delivery: {
        state: 'available';
        mode: 'document-scoped-v2';
        defaultDocumentId: string;
        manifests: Array<{
          workspaceId: string;
          documentId: string;
          environmentId: string;
          generation: number;
          publicationId: string;
          artifact: {
            artifactSchemaVersion: string;
            contentHash: string;
            compilerVersion: string;
            rendererContractVersion: string;
            themeContractVersion: string;
            url: string;
            integrity: string;
          };
        }>;
      };
    }>();
    expect(validate(PublicSdkBootstrapContext, context).valid).toBe(true);
    expect(context.delivery).toMatchObject({
      state: 'available',
      mode: 'document-scoped-v2',
      defaultDocumentId: 'doc_delivery_alpha',
    });
    expect(context.delivery.manifests.map((manifest) => manifest.documentId)).toEqual([
      'doc_delivery_alpha',
      'doc_delivery_beta',
    ]);

    const [manifest] = context.delivery.manifests;
    if (!manifest) throw new Error('document manifest missing');
    expect(manifest.artifact).toMatchObject({
      artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    });
    const manifestResponse = await app.inject({
      method: 'GET',
      url: publicManifestPath(manifest),
      headers: publicHeaders,
    });
    expect(manifestResponse.statusCode).toBe(200);
    expect(manifestResponse.headers['cache-control']).toContain('private');
    expect(manifestResponse.headers['cache-control']).toContain('no-store');
    expect(manifestResponse.headers['cache-control']).not.toContain('public');
    expect(manifestResponse.headers.etag).toBeTruthy();
    expect(manifestResponse.json()).toEqual(manifest);
    const notModified = await app.inject({
      method: 'GET',
      url: publicManifestPath(manifest),
      headers: { ...publicHeaders, 'if-none-match': manifestResponse.headers.etag! },
    });
    expect(notModified.statusCode).toBe(304);

    const artifactPath = new URL(manifest.artifact.url).pathname;
    const artifactResponse = await app.inject({
      method: 'GET',
      url: artifactPath,
      headers: publicHeaders,
    });
    expect(artifactResponse.statusCode).toBe(200);
    expect(artifactResponse.headers['cache-control']).toContain('immutable');
    expect(artifactResponse.json()).toMatchObject({
      documentId: manifest.documentId,
      contentHash: manifest.artifact.contentHash,
      artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    });
    expect(`sha256-${createHash('sha256').update(artifactResponse.body).digest('base64')}`).toBe(
      manifest.artifact.integrity,
    );

    const analytics = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: publicHeaders,
      payload: {
        events: [
          {
            name: 'tour_started',
            documentId: manifest.documentId,
            pointer: {
              generation: manifest.generation,
              publicationId: manifest.publicationId,
              contentHash: manifest.artifact.contentHash,
            },
            sdkVersion: '0.0.0-test',
            timestamp: '2026-08-09T12:00:00.000Z',
          },
        ],
      },
    });
    expect(analytics.statusCode).toBe(202);
    expect(analytics.json()).toEqual({ accepted: 1, rejected: 0, diagnostics: [] });

    const wrongOrigin = await app.inject({
      method: 'GET',
      url: artifactPath,
      headers: {
        origin: 'https://evil.customer.example',
        'x-lodariq-installation-id': installationId,
      },
    });
    expect(wrongOrigin.statusCode).toBe(403);
    await app.close();
  });

  it('isolates delivery paths for two installations on the same browser origin', async () => {
    const repository = createPublicSdkRepository({ environments });
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
    });
    const document = {
      ...structuredClone(baseDocument),
      id: 'doc_shared_origin',
      workspaceId: 'wk_public_sdk',
      title: 'Staging release',
    };
    const saved = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(saved.statusCode).toBe(201);
    const stagingArtifact = saved.json<{ latestArtifact: ReviewedArtifact | null }>()
      .latestArtifact;
    if (!stagingArtifact) throw new Error('shared-origin staging artifact missing');
    const firstRelease = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:isolation:staging:1',
        'x-lodariq-correlation-id': 'corr_isolation_staging_1',
      },
      payload: {
        environmentId: 'env_staging',
        expectedGeneration: 0,
        expectedArtifactId: stagingArtifact.id,
        expectedContentHash: stagingArtifact.contentHash,
      },
    });
    expect(firstRelease.statusCode).toBe(201);

    const persisted = await repository.getDocument('wk_public_sdk', document.id);
    if (!persisted) throw new Error('shared-origin document missing');
    const blueDocument = structuredClone(persisted.document);
    blueDocument.title = 'Blue staging release';
    const blueParagraph = blueDocument.blocks[0]?.children[0]?.children[1];
    if (!blueParagraph || blueParagraph.type !== 'paragraph') {
      throw new Error('shared-origin paragraph missing');
    }
    blueParagraph.content = 'This copy belongs only to the blue staging release.';
    const blueSaved = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: blueDocument,
    });
    expect(blueSaved.statusCode).toBe(201);
    const blueArtifact = blueSaved.json<{ latestArtifact: ReviewedArtifact | null }>()
      .latestArtifact;
    if (!blueArtifact) throw new Error('shared-origin blue artifact missing');
    const blueRelease = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:isolation:blue:1',
        'x-lodariq-correlation-id': 'corr_isolation_blue_1',
      },
      payload: {
        environmentId: 'env_staging_blue',
        expectedGeneration: 0,
        expectedArtifactId: blueArtifact.id,
        expectedContentHash: blueArtifact.contentHash,
      },
    });
    expect(blueRelease.statusCode).toBe(201);

    const sharedOrigin = 'https://shared.customer.example';
    const stagingInstallationId = await createInstallation(app, 'Shared origin staging');
    const blueInstallationId = await createInstallation(app, 'Shared origin blue');
    for (const [installationId, environmentId] of [
      [stagingInstallationId, 'env_staging'],
      [blueInstallationId, 'env_staging_blue'],
    ] as const) {
      const mapping = await app.inject({
        method: 'PUT',
        url: `/v1/sdk-installations/${installationId}/origins`,
        headers: authHeaders,
        payload: { environmentId, origin: sharedOrigin, authoringEnabled: true },
      });
      expect(mapping.statusCode).toBe(200);
    }

    const stagingBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: sharedOrigin },
      payload: { installationId: stagingInstallationId },
    });
    const blueBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: sharedOrigin },
      payload: { installationId: blueInstallationId },
    });
    expect(stagingBootstrap.statusCode).toBe(200);
    expect(blueBootstrap.statusCode).toBe(200);
    const stagingManifest = readFirstManifest(stagingBootstrap.json());
    const blueManifest = readFirstManifest(blueBootstrap.json());
    expect(stagingManifest.environmentId).toBe('env_staging');
    expect(blueManifest.environmentId).toBe('env_staging_blue');
    expect(stagingManifest.artifact.contentHash).not.toBe(blueManifest.artifact.contentHash);
    expect(stagingManifest.artifact.url).not.toBe(blueManifest.artifact.url);

    const stagingHeaders = {
      origin: sharedOrigin,
      'x-lodariq-installation-id': stagingInstallationId,
    };
    const blueHeaders = {
      origin: sharedOrigin,
      'x-lodariq-installation-id': blueInstallationId,
    };
    const stagingManifestPath = publicManifestPath(stagingManifest);
    const ownManifest = await app.inject({
      method: 'GET',
      url: stagingManifestPath,
      headers: stagingHeaders,
    });
    expect(ownManifest.statusCode).toBe(200);
    const crossInstallationManifest = await app.inject({
      method: 'GET',
      url: stagingManifestPath,
      headers: blueHeaders,
    });
    expect(crossInstallationManifest.statusCode).toBe(403);
    expect(crossInstallationManifest.json()).toMatchObject({
      error: 'delivery_scope_mismatch',
    });

    const stagingArtifactPath = new URL(stagingManifest.artifact.url).pathname;
    const ownArtifact = await app.inject({
      method: 'GET',
      url: stagingArtifactPath,
      headers: stagingHeaders,
    });
    expect(ownArtifact.statusCode).toBe(200);
    expect(ownArtifact.headers['cache-control']).toContain('public');
    expect(ownArtifact.headers['cache-control']).toContain('immutable');
    const crossInstallationArtifact = await app.inject({
      method: 'GET',
      url: stagingArtifactPath,
      headers: blueHeaders,
    });
    expect(crossInstallationArtifact.statusCode).toBe(403);
    expect(crossInstallationArtifact.json()).toMatchObject({
      error: 'delivery_scope_mismatch',
    });
    const blueArtifactResponse = await app.inject({
      method: 'GET',
      url: new URL(blueManifest.artifact.url).pathname,
      headers: blueHeaders,
    });
    expect(blueArtifactResponse.statusCode).toBe(200);

    await app.close();
  });

  it('returns a bounded error instead of serializing more than 100 active manifests', async () => {
    const repository = createPublicSdkRepository({
      environments,
      documentDeployments: Array.from(
        { length: MAX_ACTIVE_DOCUMENT_MANIFESTS + 1 },
        (_, index) => ({
          workspaceId: 'wk_public_sdk',
          environmentId: 'env_staging',
          documentId: `doc_manifest_limit_${String(index).padStart(3, '0')}`,
          state: 'active' as const,
          activePublicationId: `pub_manifest_limit_${String(index).padStart(3, '0')}`,
          generation: 1,
          updatedAt: '2026-08-07T00:00:00.000Z',
        }),
      ),
    });
    const app = createApiApp({ repository });
    const installationId = await createInstallation(app, 'Bounded manifest delivery');
    const origin = 'https://bounded.customer.example';
    const mapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        origin,
        authoringEnabled: true,
      },
    });
    expect(mapping.statusCode).toBe(200);

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin },
      payload: { installationId },
    });
    expect(bootstrap.statusCode).toBe(409);
    expect(bootstrap.json()).toMatchObject({
      error: 'active_document_limit_exceeded',
      maximum: MAX_ACTIVE_DOCUMENT_MANIFESTS,
    });

    await app.close();
  });

  it('fails closed for missing, mismatched, disallowed, and revoked origins', async () => {
    const app = createApiApp({
      repository: createPublicSdkRepository({ environments }),
    });
    const installationId = await createInstallation(app, 'Revocable application');
    await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        origin: 'https://staging.customer.example',
        authoringEnabled: true,
      },
    });

    const missingOrigin = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      payload: { installationId },
    });
    expect(missingOrigin.statusCode).toBe(400);

    const mismatchedClaim = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: 'https://staging.customer.example' },
      payload: {
        installationId,
        origin: 'https://other.customer.example',
      },
    });
    expect(mismatchedClaim.statusCode).toBe(403);

    const disallowedOrigin = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: 'https://other.customer.example' },
      payload: { installationId },
    });
    expect(disallowedOrigin.statusCode).toBe(403);

    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/sdk-installations/${installationId}/revoke`,
      headers: authHeaders,
    });
    expect(revoked.statusCode).toBe(200);

    const auditList = await app.inject({
      method: 'GET',
      url: '/v1/sdk-installations',
      headers: memberHeaders,
    });
    expect(auditList.statusCode).toBe(200);
    expect(
      auditList.json<{
        installations: Array<{ installationId: string; revokedAt: string | null }>;
      }>().installations,
    ).toEqual([expect.objectContaining({ installationId, revokedAt: expect.any(String) })]);

    const afterRevoke = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: 'https://staging.customer.example' },
      payload: { installationId },
    });
    expect(afterRevoke.statusCode).toBe(403);

    await app.close();
  });

  it('allows members to inspect installations but reserves mutations for admins and owners', async () => {
    const app = createApiApp({
      repository: createPublicSdkRepository({ environments }),
    });
    const memberCreate = await app.inject({
      method: 'POST',
      url: '/v1/sdk-installations',
      headers: memberHeaders,
      payload: { name: 'Forbidden member installation' },
    });
    expect(memberCreate.statusCode).toBe(403);

    const installationId = await createInstallation(app, 'Admin-owned installation');
    const memberList = await app.inject({
      method: 'GET',
      url: '/v1/sdk-installations',
      headers: memberHeaders,
    });
    expect(memberList.statusCode).toBe(200);

    const memberMapping = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: memberHeaders,
      payload: {
        environmentId: 'env_staging',
        origin: 'https://staging.customer.example',
        authoringEnabled: true,
      },
    });
    expect(memberMapping.statusCode).toBe(403);
    const memberRevoke = await app.inject({
      method: 'POST',
      url: `/v1/sdk-installations/${installationId}/revoke`,
      headers: memberHeaders,
    });
    expect(memberRevoke.statusCode).toBe(403);
    const memberSync = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins/sync`,
      headers: memberHeaders,
      payload: { origins: [] },
    });
    expect(memberSync.statusCode).toBe(403);

    const viewerList = await app.inject({
      method: 'GET',
      url: '/v1/sdk-installations',
      headers: viewerHeaders,
    });
    expect(viewerList.statusCode).toBe(403);
    await app.close();
  });

  it.each([
    {
      name: 'the environment is disabled',
      enabled: false,
      authoringEnabled: false,
      mappingAuthoringEnabled: false,
      message: 'environment is disabled',
    },
    {
      name: 'environment authoring is disabled',
      enabled: true,
      authoringEnabled: false,
      mappingAuthoringEnabled: true,
      message: 'authoring is disabled for the environment',
    },
  ])('returns a stable policy error for single and synced mappings when $name', async (policy) => {
    const repository = createPublicSdkRepository({
      environments: [
        {
          ...environment('env_staging', 'staging'),
          enabled: policy.enabled,
          authoringEnabled: policy.authoringEnabled,
        },
      ],
    });
    const app = createApiApp({ repository });
    const installationId = await createInstallation(app, `Policy conflict: ${policy.name}`);
    const payload = {
      environmentId: 'env_staging',
      origin: 'https://staging.customer.example',
      authoringEnabled: policy.mappingAuthoringEnabled,
    };

    const single = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins`,
      headers: authHeaders,
      payload,
    });
    expect(single.statusCode).toBe(409);
    expect(single.json()).toEqual({
      error: 'environment_policy_forbidden',
      message: policy.message,
    });

    const synced = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins/sync`,
      headers: authHeaders,
      payload: { origins: [payload] },
    });
    expect(synced.statusCode).toBe(409);
    expect(synced.json()).toEqual({
      error: 'environment_policy_forbidden',
      message: policy.message,
    });

    await app.close();
  });

  it('atomically removes stale origin authorization during installation sync', async () => {
    const repository = createPublicSdkRepository({ environments });
    const app = createApiApp({ repository });
    const installationId = await createInstallation(app, 'Synchronized application');
    for (const origin of ['https://keep.customer.example', 'https://stale.customer.example']) {
      const configured = await app.inject({
        method: 'PUT',
        url: `/v1/sdk-installations/${installationId}/origins`,
        headers: authHeaders,
        payload: { environmentId: 'env_staging', origin, authoringEnabled: true },
      });
      expect(configured.statusCode).toBe(200);
    }

    const synchronized = await app.inject({
      method: 'PUT',
      url: `/v1/sdk-installations/${installationId}/origins/sync`,
      headers: authHeaders,
      payload: {
        origins: [
          {
            environmentId: 'env_staging',
            origin: 'https://keep.customer.example',
            authoringEnabled: true,
          },
        ],
      },
    });
    expect(synchronized.statusCode).toBe(200);
    expect(synchronized.json()).toMatchObject({
      origins: [{ exactOrigin: 'https://keep.customer.example' }],
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/sdk-installations',
      headers: memberHeaders,
    });
    expect(
      listed.json<{ installations: Array<{ origins: Array<{ exactOrigin: string }> }> }>()
        .installations[0]?.origins,
    ).toEqual([expect.objectContaining({ exactOrigin: 'https://keep.customer.example' })]);
    const staleBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: 'https://stale.customer.example' },
      payload: { installationId },
    });
    expect(staleBootstrap.statusCode).toBe(403);
    await app.close();
  });
});

function createPublicSdkRepository(seed: InMemoryControlPlaneSeed) {
  return createInMemoryControlPlaneRepository({
    ...seed,
    workspaceMemberships: seed.workspaceMemberships ?? [
      {
        workspaceId: 'wk_public_sdk',
        userId: 'user_public_sdk',
        role: 'owner',
        createdAt: '2026-08-07T00:00:00.000Z',
      },
      {
        workspaceId: 'wk_public_sdk',
        userId: 'user_public_sdk_member',
        role: 'member',
        createdAt: '2026-08-07T00:00:00.000Z',
      },
      {
        workspaceId: 'wk_public_sdk',
        userId: 'user_public_sdk_viewer',
        role: 'viewer',
        createdAt: '2026-08-07T00:00:00.000Z',
      },
    ],
  });
}

async function createInstallation(
  app: ReturnType<typeof createApiApp>,
  name: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/sdk-installations',
    headers: authHeaders,
    payload: { name },
  });
  expect(response.statusCode).toBe(201);
  const body = response.json<{
    installation: { installationId: string };
    sdkSnippet: string;
  }>();
  expect(body.installation.installationId).toMatch(/^ins_pub_/);
  expect(body.sdkSnippet).toContain(`data-installation="${body.installation.installationId}"`);
  expect(body.sdkSnippet).toContain('lodariq-public-bootstrap.js');
  expect(body.sdkSnippet).not.toContain('lodariq-loader.js');
  expect(body.sdkSnippet).not.toContain('data-lodariq-environment');
  expect(body.sdkSnippet).not.toContain('data-lodariq-token');
  expect(body.sdkSnippet).not.toContain('authoring-session');
  expect(body.sdkSnippet).not.toContain('lodariq-creator.js');
  return body.installation.installationId;
}

function environment(id: string, kind: WorkspaceEnvironment['kind']): WorkspaceEnvironment {
  const originAllowlist =
    kind === 'production'
      ? ['https://app.customer.example']
      : [
          'http://localhost:4173',
          'https://bounded.customer.example',
          'https://keep.customer.example',
          'https://shared.customer.example',
          'https://staging.customer.example',
          'https://stale.customer.example',
        ];
  return {
    id,
    workspaceId: 'wk_public_sdk',
    kind,
    name: kind,
    originAllowlist,
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  };
}

interface PublicManifestLocation {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  artifact: { contentHash: string; url: string };
}

interface ReviewedArtifact {
  id: string;
  contentHash: string;
}

function publicManifestPath(manifest: PublicManifestLocation): string {
  return `/v1/sdk/workspaces/${encodeURIComponent(manifest.workspaceId)}/environments/${encodeURIComponent(manifest.environmentId)}/documents/${encodeURIComponent(manifest.documentId)}/manifest`;
}

function readFirstManifest(value: unknown): PublicManifestLocation {
  const context = value as {
    delivery?: { state?: string; manifests?: PublicManifestLocation[] };
  };
  const manifest = context.delivery?.state === 'available' ? context.delivery.manifests?.[0] : null;
  if (!manifest) throw new Error('public delivery manifest missing');
  return manifest;
}
