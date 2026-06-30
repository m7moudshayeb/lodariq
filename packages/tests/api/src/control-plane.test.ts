import { describe, expect, it } from 'vitest';
import {
  createApiApp,
  createAuthProviderFromEnvironment,
  createClerkAuthProvider,
  createHeaderAuthProvider,
  type ClerkTokenVerifier,
} from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
  type IngestEventsInput,
} from '@lodariq/database';
import { CompiledDocument, validate, type LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const baseDocument = tourFixture as LodariqDocument;
const authHeaders = {
  'x-lodariq-workspace-id': 'wk_a',
  'x-lodariq-user-id': 'user_a',
};

describe('@lodariq/api control-plane routes', () => {
  it('exposes an OpenAPI document generated from the Fastify route schemas', async () => {
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository(),
      publicApiBaseUrl: 'https://api.lodariq.com',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json<{
      openapi: string;
      info: { title: string };
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    }>();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Lodariq Control API');
    expect(spec.servers).toEqual([{ url: 'https://api.lodariq.com' }]);
    expect(spec.paths).toHaveProperty('/v1/documents');
    expect(spec.paths).toHaveProperty('/v1/environment-tokens/{tokenId}/revoke');
    expect(spec.paths).toHaveProperty('/v1/sdk/bootstrap');
    expect(spec.paths).not.toHaveProperty('/openapi.json');
    expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');

    await app.close();
  });

  it('uses deployment URL environment variables for OpenAPI and SDK snippets', async () => {
    await withTemporaryEnvironment(
      {
        LODARIQ_PUBLIC_API_BASE_URL: 'https://staging-api.lodariq.com',
        LODARIQ_LOADER_SRC: 'https://cdn.lodariq.com/sdk/staging-loader.js',
        LODARIQ_AUTHORING_IFRAME_SRC: 'https://editor.lodariq.com/authoring.html',
      },
      async () => {
        const app = createApiApp({
          defaultWorkspaceId: 'wk_a',
        });

        const spec = await app.inject({
          method: 'GET',
          url: '/openapi.json',
        });
        expect(spec.json<{ servers: Array<{ url: string }> }>().servers).toEqual([
          { url: 'https://staging-api.lodariq.com' },
        ]);

        const token = await app.inject({
          method: 'POST',
          url: '/v1/environment-tokens',
          headers: authHeaders,
          payload: {
            environmentId: 'env_staging',
            name: 'Deployment config',
          },
        });
        expect(token.statusCode).toBe(201);
        const body = token.json<{ sdkSnippet: string }>();
        expect(body.sdkSnippet).toContain('https://cdn.lodariq.com/sdk/staging-loader.js');
        expect(body.sdkSnippet).toContain('data-lodariq-api="https://staging-api.lodariq.com"');

        await app.close();
      },
    );
  });

  it('validates canonical documents, compiles server-side, and scopes list results', async () => {
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository(),
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const document = withWorkspace(baseDocument, 'wk_a');

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<{
      latestArtifact?: { contentHash: string; compiled: unknown };
    }>();
    expect(created.latestArtifact?.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/);
    const validation = validate(CompiledDocument, created.latestArtifact?.compiled);
    expect(validation.valid).toBe(true);

    const sameWorkspaceList = await app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: authHeaders,
    });
    expect(sameWorkspaceList.json<{ documents: unknown[] }>().documents).toHaveLength(1);

    const otherWorkspaceList = await app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: {
        'x-lodariq-workspace-id': 'wk_b',
        'x-lodariq-user-id': 'user_b',
      },
    });
    expect(otherWorkspaceList.json<{ documents: unknown[] }>().documents).toHaveLength(0);

    await app.close();
  });

  it('does not expose direct document ID routes across workspace scopes', async () => {
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository(),
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const document = withWorkspace(baseDocument, 'wk_a');
    const otherWorkspaceHeaders = {
      'x-lodariq-workspace-id': 'wk_b',
      'x-lodariq-user-id': 'user_b',
    };

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createResponse.statusCode).toBe(201);

    const directRead = await app.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}`,
      headers: otherWorkspaceHeaders,
    });
    expect(directRead.statusCode).toBe(404);

    const debugRead = await app.inject({
      method: 'GET',
      url: `/v1/debug/documents/${document.id}`,
      headers: otherWorkspaceHeaders,
    });
    expect(debugRead.statusCode).toBe(404);

    const compile = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/compile`,
      headers: otherWorkspaceHeaders,
    });
    expect(compile.statusCode).toBe(404);

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publish`,
      headers: otherWorkspaceHeaders,
      payload: {
        environmentId: 'env_staging',
      },
    });
    expect(publish.statusCode).toBe(404);

    const mismatchedSave = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: otherWorkspaceHeaders,
      payload: document,
    });
    expect(mismatchedSave.statusCode).toBe(403);
    expect(mismatchedSave.json<{ error: string }>().error).toBe('workspace_mismatch');

    await app.close();
  });

  it('exposes internal document version history only to writable workspace members', async () => {
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository(),
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const document = withWorkspace(baseDocument, 'wk_a');
    const revisedDocument = { ...document, title: 'Welcome tour revised' };

    const firstSave = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(firstSave.statusCode).toBe(201);

    const secondSave = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: revisedDocument,
    });
    expect(secondSave.statusCode).toBe(201);

    const debug = await app.inject({
      method: 'GET',
      url: `/v1/debug/documents/${document.id}`,
      headers: authHeaders,
    });
    expect(debug.statusCode).toBe(200);
    const body = debug.json<{
      canonical: { title: string };
      latestArtifact: { documentVersionId: string | null; contentHash: string } | null;
      versions: Array<{
        id: string;
        workspaceId: string;
        documentId: string;
        version: number;
        canonical: { title: string };
        createdByUserId: string | null;
      }>;
    }>();

    expect(body.canonical.title).toBe('Welcome tour revised');
    expect(body.versions.map((version) => version.version)).toEqual([2, 1]);
    expect(body.versions[0]).toMatchObject({
      workspaceId: 'wk_a',
      documentId: document.id,
      canonical: { title: 'Welcome tour revised' },
      createdByUserId: 'user_a',
    });
    expect(body.latestArtifact?.documentVersionId).toBe(body.versions[0]?.id);

    const viewerDebug = await app.inject({
      method: 'GET',
      url: `/v1/debug/documents/${document.id}`,
      headers: {
        ...authHeaders,
        'x-lodariq-role': 'viewer',
      },
    });
    expect(viewerDebug.statusCode).toBe(403);

    await app.close();
  });

  it('publishes current artifacts through a member-only server route and blocks incomplete documents', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const document = withWorkspace(baseDocument, 'wk_a');

    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);

    const viewerPublish = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publish`,
      headers: {
        ...authHeaders,
        'x-lodariq-role': 'viewer',
      },
      payload: {
        environmentId: 'env_staging',
      },
    });
    expect(viewerPublish.statusCode).toBe(403);

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publish`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
      },
    });
    expect(publish.statusCode).toBe(201);
    const publication = publish.json<{
      publication: {
        workspaceId: string;
        correlationId: string;
        environmentId: string;
        environment: string;
        documentId: string;
        contentHash: string;
        artifact: { contentHash: string };
      };
    }>().publication;
    expect(publication).toMatchObject({
      workspaceId: 'wk_a',
      environmentId: 'env_staging',
      environment: 'staging',
      documentId: document.id,
    });
    expect(publication.correlationId).toMatch(/^corr_publish_/);
    expect(publication.contentHash).toMatch(/^sha256-/);
    expect(publication.artifact.contentHash).toBe(publication.contentHash);
    expect(JSON.stringify(publication)).not.toContain('"steps"');

    const incompleteDocument = makeIncompleteButtonDocument(document);
    const createIncomplete = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: incompleteDocument,
    });
    expect(createIncomplete.statusCode).toBe(201);

    const blockedPublish = await app.inject({
      method: 'POST',
      url: `/v1/documents/${incompleteDocument.id}/publish`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
      },
    });
    expect(blockedPublish.statusCode).toBe(409);
    expect(blockedPublish.json<{ error: string }>().error).toBe('publish_blocked');

    await app.close();
  });

  it('rejects arbitrary props in canonical block JSON at the HTTP boundary', async () => {
    const app = createApiApp({ repository: createInMemoryControlPlaneRepository() });
    const document = withWorkspace(baseDocument, 'wk_a') as LodariqDocument & {
      blocks: Array<{ props: Record<string, unknown> }>;
    };
    document.blocks[0]!.props.rawHtml = '<script>alert(1)</script>';

    const response = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('creates staging environment tokens and returns the intended SDK snippet only on creation', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
      loaderSrc: 'https://cdn.lodariq.com/sdk/lodariq-loader.js',
      creatorLoaderSrc: 'https://cdn.lodariq.com/sdk/lodariq-creator.js',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Fixture host',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      clientToken: string;
      sdkSnippet: string;
      token: { id: string; revokedAt?: string | null };
    }>();
    expect(body.token.revokedAt).toBeNull();
    expect(body.clientToken).toMatch(/^lod_staging_/);
    expect(body.sdkSnippet).toContain('<script type="module" async crossorigin="anonymous"');
    expect(body.sdkSnippet).toContain('https://cdn.lodariq.com/sdk/lodariq-loader.js');
    expect(body.sdkSnippet).toContain('data-lodariq-loader');
    expect(body.sdkSnippet).toContain('data-lodariq-token="lod_staging_');
    expect(body.sdkSnippet).toContain('data-lodariq-api="https://api.lodariq.com"');

    const tokenList = await app.inject({
      method: 'GET',
      url: '/v1/environment-tokens',
      headers: authHeaders,
    });
    expect(tokenList.body).not.toContain(body.clientToken);

    const sdkEvent = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${body.clientToken}` },
      payload: {
        events: [
          {
            name: 'sdk_loaded',
            sdkVersion: '0.0.0-test',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    expect(sdkEvent.statusCode).toBe(202);

    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/environment-tokens/${body.token.id}/revoke`,
      headers: authHeaders,
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json<{ token: { revokedAt?: string | null } }>().token.revokedAt).toEqual(
      expect.any(String),
    );
    expect(revoked.body).not.toContain(body.clientToken);

    const revokedAgain = await app.inject({
      method: 'POST',
      url: `/v1/environment-tokens/${body.token.id}/revoke`,
      headers: authHeaders,
    });
    expect(revokedAgain.statusCode).toBe(200);

    const revokedList = await app.inject({
      method: 'GET',
      url: '/v1/environment-tokens',
      headers: authHeaders,
    });
    const revokedListBody = revokedList.json<{
      tokens: Array<{ id: string; revokedAt?: string | null }>;
    }>();
    expect(revokedListBody.tokens[0]?.revokedAt).toEqual(expect.any(String));

    const rejectedSdkEvent = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${body.clientToken}` },
      payload: {
        events: [
          {
            name: 'sdk_loaded',
            sdkVersion: '0.0.0-test',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    expect(rejectedSdkEvent.statusCode).toBe(401);

    await app.close();
  });

  it('redacts sensitive event payload fields before persistence', async () => {
    const capturedEvents: IngestEventsInput[] = [];
    const repository = captureIngestedEvents(
      createInMemoryControlPlaneRepository({
        environments: [
          {
            id: 'env_staging',
            workspaceId: 'wk_a',
            kind: 'staging',
            name: 'Staging',
            originAllowlist: ['https://staging.lodariq.com'],
            createdAt: '2026-06-30T00:00:00.000Z',
            updatedAt: '2026-06-30T00:00:00.000Z',
          },
        ],
      }),
      capturedEvents,
    );
    const app = createApiApp({
      repository,
      defaultWorkspaceId: 'wk_a',
    });

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Sanitized event token',
      },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const { clientToken } = tokenResponse.json<{ clientToken: string }>();

    const sensitiveProps = {
      token: 'lod_staging_secret_token',
      nested: {
        authorization: 'Bearer live.session.jwt',
        email: 'owner@example.com',
        callback: 'https://api.lodariq.com/v1/sdk/current-document?token=lod_staging_secret',
        safe: 'kept',
      },
    };
    const sdkEvents = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {
        events: [
          {
            name: 'sdk_loaded',
            sdkVersion: '0.0.0-test',
            timestamp: new Date().toISOString(),
            props: sensitiveProps,
          },
        ],
      },
    });
    expect(sdkEvents.statusCode).toBe(202);

    const controlPlaneEvents = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: authHeaders,
      payload: {
        events: [
          {
            name: 'dashboard_opened',
            sdkVersion: '0.0.0-test',
            timestamp: new Date().toISOString(),
            props: sensitiveProps,
          },
        ],
      },
    });
    expect(controlPlaneEvents.statusCode).toBe(202);

    expect(capturedEvents).toHaveLength(2);
    expect(capturedEvents.every((eventBatch) => eventBatch.workspaceId === 'wk_a')).toBe(true);
    const sdkProps = capturedEvents[0]?.events[0]?.props as Record<string, unknown>;
    const nested = sdkProps['nested'] as Record<string, unknown>;
    expect(sdkProps['token']).toBe('<redacted>');
    expect(nested['authorization']).toBe('<redacted>');
    expect(nested['email']).toBe('<email>');
    expect(nested['callback']).toBe('https://api.lodariq.com/v1/sdk/current-document');
    expect(nested['safe']).toBe('kept');

    const persistedText = JSON.stringify(capturedEvents);
    expect(persistedText).not.toContain('lod_staging_secret_token');
    expect(persistedText).not.toContain('live.session.jwt');
    expect(persistedText).not.toContain('owner@example.com');
    expect(persistedText).not.toContain('?token=');

    await app.close();
  });

  it('creates short-lived authoring launch snippets scoped to a staging document', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
      loaderSrc: 'https://cdn.lodariq.com/sdk/lodariq-loader.js',
    });
    const document = withWorkspace(baseDocument, 'wk_a');

    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Creator launch',
        authoringDocumentId: document.id,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      clientToken: string;
      authoringSessionToken: string;
      bootstrapHeaderName: string;
      authoringSdkSnippet: string;
      authoringSession: {
        documentId: string;
        environment: string;
        expiresAt: string;
        correlationId: string;
      };
      publication: {
        documentId: string;
        environmentId: string;
        contentHash: string;
        correlationId: string;
      };
      sdkSnippet: string;
    }>();
    expect(body.clientToken).toMatch(/^lod_staging_/);
    expect(body.authoringSessionToken).toMatch(/^lod_authoring_/);
    expect(body.bootstrapHeaderName).toBe('x-lodariq-authoring-session');
    expect(body.authoringSession).toMatchObject({
      documentId: document.id,
      environment: 'staging',
    });
    expect(body.publication).toMatchObject({
      documentId: document.id,
      environmentId: 'env_staging',
    });
    expect(body.publication.contentHash).toMatch(/^sha256-/);
    expect(body.publication.correlationId).toMatch(/^corr_publish_/);
    expect(body.authoringSession.correlationId).toMatch(/^corr_authoring_/);
    expect(Date.parse(body.authoringSession.expiresAt)).toBeGreaterThan(Date.now());
    expect(body.authoringSdkSnippet).toContain('data-lodariq-token="lod_staging_');
    expect(body.authoringSdkSnippet).toContain('data-lodariq-authoring-session="lod_authoring_');
    expect(body.authoringSdkSnippet).toContain(
      'src="https://cdn.lodariq.com/sdk/lodariq-creator.js"',
    );
    expect(body.sdkSnippet).not.toContain('data-lodariq-authoring-session');
    expect(body.sdkSnippet).toContain('src="https://cdn.lodariq.com/sdk/lodariq-loader.js"');
    expect(body.sdkSnippet).not.toContain('lodariq-creator.js');

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        authorization: `Bearer ${body.clientToken}`,
        'x-lodariq-authoring-session': body.authoringSessionToken,
        origin: 'https://staging.lodariq.com',
      },
      payload: {
        environment: 'staging',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    const bootstrapContext = bootstrap.json<{
      authoring: {
        enabled: boolean;
        sessionId: string;
        documentUrl: string;
        saveDocumentUrl: string;
      };
    }>();
    expect(bootstrapContext.authoring.enabled).toBe(true);
    expect(bootstrapContext.authoring.documentUrl).toBe(
      'https://api.lodariq.com/v1/sdk/authoring/document',
    );
    expect(bootstrapContext.authoring.saveDocumentUrl).toBe(
      'https://api.lodariq.com/v1/sdk/authoring/document',
    );

    const loadFromCreatorFrame = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/document',
      headers: {
        authorization: `Bearer ${body.clientToken}`,
        'x-lodariq-authoring-session': body.authoringSessionToken,
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(loadFromCreatorFrame.statusCode).toBe(200);
    expect(loadFromCreatorFrame.json<{ document: { id: string } }>().document.id).toBe(document.id);

    const saveWithoutAuthoringSession = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: {
        authorization: `Bearer ${body.clientToken}`,
        origin: 'https://staging.lodariq.com',
      },
      payload: {
        document: { ...document, title: 'Rejected creator save' },
      },
    });
    expect(saveWithoutAuthoringSession.statusCode).toBe(401);

    const saveWithExtraTopLevelField = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: {
        authorization: `Bearer ${body.clientToken}`,
        'x-lodariq-authoring-session': body.authoringSessionToken,
        origin: 'https://staging.lodariq.com',
      },
      payload: {
        document,
        rawHtml: '<script>alert(1)</script>',
      },
    });
    expect(saveWithExtraTopLevelField.statusCode).toBe(400);

    const saveFromCreatorFrame = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: {
        authorization: `Bearer ${body.clientToken}`,
        'x-lodariq-authoring-session': body.authoringSessionToken,
        origin: 'https://staging.lodariq.com',
      },
      payload: {
        document: { ...document, title: 'Saved from creator frame' },
      },
    });
    expect(saveFromCreatorFrame.statusCode).toBe(200);
    expect(
      saveFromCreatorFrame.json<{ artifact: { contentHash: string } }>().artifact.contentHash,
    ).toMatch(/^sha256-/);

    const persistedAfterCreatorSave = await app.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}`,
      headers: authHeaders,
    });
    expect(persistedAfterCreatorSave.json<{ document: { title: string } }>().document.title).toBe(
      'Saved from creator frame',
    );

    const missingDocument = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Missing document',
        authoringDocumentId: 'doc_missing',
      },
    });
    expect(missingDocument.statusCode).toBe(404);

    await app.close();
  });

  it('lets a staging SDK token bootstrap, fetch compiled JSON, and ingest events in its workspace', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const document = withWorkspace(baseDocument, 'wk_a');

    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);

    const createToken = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'SDK install',
      },
    });
    const { clientToken } = createToken.json<{ clientToken: string }>();
    const sdkHeaders = {
      authorization: `Bearer ${clientToken}`,
      origin: 'https://staging.lodariq.com',
    };

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/sdk/bootstrap',
      headers: {
        origin: 'https://staging.lodariq.com',
        'access-control-request-method': 'POST',
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://staging.lodariq.com');

    const unpublishedBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: sdkHeaders,
      payload: {
        environment: 'staging',
        href: 'https://staging.lodariq.com/products',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(unpublishedBootstrap.statusCode).toBe(404);
    expect(unpublishedBootstrap.headers['access-control-allow-origin']).toBe(
      'https://staging.lodariq.com',
    );

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publish`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
      },
    });
    expect(publish.statusCode).toBe(201);

    const createDevelopmentToken = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_development',
        name: 'Development SDK install',
      },
    });
    const { clientToken: developmentClientToken } = createDevelopmentToken.json<{
      clientToken: string;
    }>();
    const unpublishedDevelopmentDocument = await app.inject({
      method: 'GET',
      url: '/v1/sdk/current-document',
      headers: {
        authorization: `Bearer ${developmentClientToken}`,
        origin: 'http://localhost:5173',
      },
    });
    expect(unpublishedDevelopmentDocument.statusCode).toBe(404);

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: sdkHeaders,
      payload: {
        environment: 'staging',
        href: 'https://staging.lodariq.com/products',
        origin: 'https://staging.lodariq.com',
      },
    });

    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.headers['access-control-allow-origin']).toBe('https://staging.lodariq.com');
    const context = bootstrap.json<{
      workspaceId: string;
      environment: string;
      correlationId: string;
      manifest: { documentId: string; currentVersion: string };
      currentDocumentUrl: string;
      ingestUrl: string;
      authoring: { enabled: boolean };
    }>();
    expect(context.workspaceId).toBe('wk_a');
    expect(context.environment).toBe('staging');
    expect(context.correlationId).toMatch(/^corr_publish_/);
    expect(context.manifest.documentId).toBe(document.id);
    expect(context.manifest.currentVersion).toMatch(/^sha256-/);
    expect(context.currentDocumentUrl).toBe('https://api.lodariq.com/v1/sdk/current-document');
    expect(context.ingestUrl).toBe('https://api.lodariq.com/v1/sdk/events');
    expect(context.authoring.enabled).toBe(false);

    const createAuthoringSession = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        documentId: document.id,
      },
    });
    expect(createAuthoringSession.statusCode).toBe(201);
    const authoringSession = createAuthoringSession.json<{
      authoringSessionToken: string;
      bootstrapHeaderName: string;
      authoringSession: {
        id: string;
        environment: string;
        documentId: string;
        correlationId: string;
        iframeSrc: string;
        expiresAt: string;
      };
    }>();
    expect(authoringSession.authoringSessionToken).toMatch(/^lod_authoring_/);
    expect(authoringSession.bootstrapHeaderName).toBe('x-lodariq-authoring-session');
    expect(authoringSession.authoringSession).toMatchObject({
      environment: 'staging',
      documentId: document.id,
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
    });
    expect(authoringSession.authoringSession.correlationId).toMatch(/^corr_authoring_/);
    expect(Date.parse(authoringSession.authoringSession.expiresAt)).toBeGreaterThan(Date.now());

    const authoringBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        ...sdkHeaders,
        'x-lodariq-authoring-session': authoringSession.authoringSessionToken,
      },
      payload: {
        environment: 'staging',
        href: 'https://staging.lodariq.com/products',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(authoringBootstrap.statusCode).toBe(200);
    const authoringContext = authoringBootstrap.json<{
      correlationId: string;
      authoring: { enabled: boolean; sessionId: string; correlationId: string };
    }>();
    expect(authoringContext.authoring.enabled).toBe(true);
    expect(authoringContext.correlationId).toBe(context.correlationId);
    expect(authoringContext.authoring.correlationId).toBe(
      authoringSession.authoringSession.correlationId,
    );

    const currentDocument = await app.inject({
      method: 'GET',
      url: '/v1/sdk/current-document',
      headers: sdkHeaders,
    });
    expect(currentDocument.statusCode).toBe(200);
    const compiled = currentDocument.json<{ documentId: string; steps: unknown[] }>();
    expect(compiled.documentId).toBe(document.id);
    expect(compiled.steps.length).toBeGreaterThan(0);

    const events = await app.inject({
      method: 'POST',
      url: '/v1/sdk/events',
      headers: sdkHeaders,
      payload: {
        events: [
          {
            name: 'tour_started',
            documentId: document.id,
            sdkVersion: '0.0.0-test',
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
    expect(events.statusCode).toBe(202);
    expect(events.headers['access-control-allow-origin']).toBe('https://staging.lodariq.com');
    expect(events.json<{ accepted: number }>().accepted).toBe(1);

    const forbiddenOrigin = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        authorization: `Bearer ${clientToken}`,
        origin: 'https://evil.example',
      },
      payload: {
        environment: 'staging',
      },
    });
    expect(forbiddenOrigin.statusCode).toBe(403);
    expect(forbiddenOrigin.headers['access-control-allow-origin']).toBeUndefined();

    const invalidAuthoringSession = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        ...sdkHeaders,
        'x-lodariq-authoring-session': 'lod_authoring_invalid',
      },
      payload: {
        environment: 'staging',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(invalidAuthoringSession.statusCode).toBe(401);
    expect(invalidAuthoringSession.headers['access-control-allow-origin']).toBe(
      'https://staging.lodariq.com',
    );

    await app.close();
  });

  it('rejects browser SDK requests when an environment has no explicit origin allowlist', async () => {
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository({
        environments: [
          {
            id: 'env_empty_origin',
            workspaceId: 'wk_a',
            kind: 'staging',
            name: 'Empty origin staging',
            originAllowlist: [],
            createdAt: '2026-06-30T00:00:00.000Z',
            updatedAt: '2026-06-30T00:00:00.000Z',
          },
        ],
      }),
      publicApiBaseUrl: 'https://api.lodariq.com',
    });

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_empty_origin',
        name: 'No browser origins',
      },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const { clientToken } = tokenResponse.json<{ clientToken: string }>();

    const browserBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        authorization: `Bearer ${clientToken}`,
        origin: 'https://staging.lodariq.com',
      },
      payload: { environment: 'staging' },
    });
    expect(browserBootstrap.statusCode).toBe(403);
    expect(browserBootstrap.headers['access-control-allow-origin']).toBeUndefined();

    const serverBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        authorization: `Bearer ${clientToken}`,
      },
      payload: { environment: 'staging' },
    });
    expect(serverBootstrap.statusCode).toBe(404);

    await app.close();
  });

  it('uses verified Clerk organization claims as the workspace scope', async () => {
    const verifyToken: ClerkTokenVerifier = async (token, options) => {
      expect(token).toBe('session.jwt');
      expect(options.jwtKey).toBe('test-jwt-key');
      expect(options.authorizedParties).toEqual(['https://app.lodariq.com']);
      return clerkClaims({
        sub: 'user_clerk',
        org_id: 'org_clerk_workspace',
        org_role: 'org:admin',
      });
    };
    const app = createApiApp({
      defaultWorkspaceId: 'org_clerk_workspace',
      authProvider: createClerkAuthProvider({
        jwtKey: 'test-jwt-key',
        authorizedParties: ['https://app.lodariq.com'],
        requireAuthorizedParties: true,
        verifyToken,
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/environments',
      headers: {
        authorization: 'Bearer session.jwt',
        'x-lodariq-workspace-id': 'wk_header_must_not_win',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(
      response
        .json<{ environments: Array<{ workspaceId: string }> }>()
        .environments.every((environment) => environment.workspaceId === 'org_clerk_workspace'),
    ).toBe(true);

    await app.close();
  });

  it('rejects Clerk sessions without an active organization', async () => {
    const app = createApiApp({
      authProvider: createClerkAuthProvider({
        jwtKey: 'test-jwt-key',
        requireAuthorizedParties: false,
        verifyToken: async () => clerkClaims({ sub: 'user_clerk' }),
      }),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: { authorization: 'Bearer session.jwt' },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('does not allow viewer sessions to create environment tokens', async () => {
    const app = createApiApp({ defaultWorkspaceId: 'wk_a' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: {
        ...authHeaders,
        'x-lodariq-role': 'viewer',
      },
      payload: {
        environmentId: 'env_staging',
        name: 'Read-only attempt',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('does not allow viewer sessions to revoke environment tokens', async () => {
    const app = createApiApp({ defaultWorkspaceId: 'wk_a' });

    const token = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Member-created token',
      },
    });
    expect(token.statusCode).toBe(201);
    const tokenId = token.json<{ token: { id: string } }>().token.id;

    const response = await app.inject({
      method: 'POST',
      url: `/v1/environment-tokens/${tokenId}/revoke`,
      headers: {
        ...authHeaders,
        'x-lodariq-role': 'viewer',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('does not allow production API auth to fall back to trusted headers', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.LODARIQ_AUTH_MODE = 'headers';

    try {
      expect(() => createAuthProviderFromEnvironment()).toThrow(/Header auth mode is not allowed/);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      delete process.env.LODARIQ_AUTH_MODE;
    }
  });

  it('rejects invalid API auth mode configuration instead of falling back to headers', () => {
    const previousAuthMode = process.env.LODARIQ_AUTH_MODE;
    process.env.LODARIQ_AUTH_MODE = 'header';

    try {
      expect(() => createAuthProviderFromEnvironment()).toThrow(/Invalid LODARIQ_AUTH_MODE/);
    } finally {
      if (previousAuthMode === undefined) delete process.env.LODARIQ_AUTH_MODE;
      else process.env.LODARIQ_AUTH_MODE = previousAuthMode;
    }
  });

  it('ignores invalid development role headers instead of casting them into privileges', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      authProvider: createHeaderAuthProvider({
        defaultWorkspaceId: 'wk_a',
        defaultUserId: 'user_a',
        defaultRole: 'viewer',
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: {
        'x-lodariq-role': 'superadmin',
      },
      payload: {
        environmentId: 'env_staging',
        name: 'Invalid role attempt',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('does not allow viewer sessions to create authoring sessions', async () => {
    const app = createApiApp({ defaultWorkspaceId: 'wk_a' });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: {
        ...authHeaders,
        'x-lodariq-role': 'viewer',
      },
      payload: {
        environmentId: 'env_staging',
        documentId: 'doc_tour_welcome',
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

function withWorkspace(document: LodariqDocument, workspaceId: string): LodariqDocument {
  return { ...structuredClone(document), workspaceId };
}

function makeIncompleteButtonDocument(document: LodariqDocument): LodariqDocument {
  const next = structuredClone(document);
  next.id = `${document.id}_incomplete`;
  const button = next.blocks[0]?.children[0]?.children.find((block) => block.type === 'button');
  if (!button) throw new Error('fixture button missing');
  delete button.props.action;
  button.status = 'incomplete';
  return next;
}

function captureIngestedEvents(
  repository: ControlPlaneRepository,
  capturedEvents: IngestEventsInput[],
): ControlPlaneRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === 'ingestEvents') {
        return async (input: IngestEventsInput) => {
          capturedEvents.push(structuredClone(input));
          return target.ingestEvents(input);
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function withTemporaryEnvironment<T>(
  updates: Record<string, string>,
  callback: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function clerkClaims(
  claims: Partial<Record<'sub' | 'org_id' | 'org_role', string>>,
): Awaited<ReturnType<ClerkTokenVerifier>> {
  return {
    iss: 'https://clerk.lodariq.test',
    sub: claims.sub ?? 'user_clerk',
    sid: 'sess_clerk',
    nbf: 0,
    exp: 4_102_444_800,
    iat: 1,
    ...(claims.org_id ? { org_id: claims.org_id } : {}),
    ...(claims.org_role ? { org_role: claims.org_role } : {}),
  } as Awaited<ReturnType<ClerkTokenVerifier>>;
}
