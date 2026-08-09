import { describe, expect, it } from 'vitest';
import {
  createApiApp,
  createAuthProviderFromEnvironment,
  createHeaderAuthProvider,
} from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  type ControlPlaneRepository,
  type IngestEventsInput,
} from '@lodariq/database';
import {
  BROWSER_VERIFICATION_CHECK_CODES,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  CompiledDocument,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  validate,
  type BrandThemeSnapshot,
  type LodariqDocument,
} from '@lodariq/schema';
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

  it('versions the workspace Brand theme and requires explicit document review before staging', async () => {
    const app = createApiApp({
      repository: createInMemoryControlPlaneRepository({
        environments: [
          {
            id: 'env_staging',
            workspaceId: 'wk_a',
            kind: 'staging',
            name: 'Staging',
            originAllowlist: ['https://staging.lodariq.com'],
            createdAt: '2026-08-07T00:00:00.000Z',
            updatedAt: '2026-08-07T00:00:00.000Z',
          },
        ],
      }),
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const adminHeaders = { ...authHeaders, 'x-lodariq-role': 'admin' };
    const definition = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition);
    const createdTheme = await app.inject({
      method: 'POST',
      url: '/v1/themes',
      headers: authHeaders,
      payload: { name: 'Product Brand', draft: definition },
    });
    expect(createdTheme.statusCode).toBe(201);
    let theme = createdTheme.json<{
      theme: {
        id: string;
        revision: number;
        updatedAt: string;
        activeVersionId: string | null;
      };
    }>().theme;
    expect(theme.activeVersionId).toBeNull();

    const unapprovedDefault = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/default`,
      headers: adminHeaders,
      payload: { expectedRevision: theme.revision, expectedUpdatedAt: theme.updatedAt },
    });
    expect(unapprovedDefault.statusCode).toBe(409);
    expect(unapprovedDefault.json()).toMatchObject({
      error: 'workspace_theme_approval_required',
      themeId: theme.id,
    });

    const memberApproval = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/approve`,
      headers: { ...authHeaders, 'x-lodariq-role': 'member' },
      payload: { expectedRevision: theme.revision, expectedUpdatedAt: theme.updatedAt },
    });
    expect(memberApproval.statusCode).toBe(403);
    const firstApproval = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/approve`,
      headers: adminHeaders,
      payload: { expectedRevision: theme.revision, expectedUpdatedAt: theme.updatedAt },
    });
    expect(firstApproval.statusCode).toBe(200);
    const firstApproved = firstApproval.json<{
      theme: typeof theme;
      approvedVersion: { id: string; contentHash: string };
    }>();
    theme = firstApproved.theme;
    expect(firstApproved.approvedVersion.contentHash).toMatch(/^sha256-[0-9a-f]{64}$/);

    const document = withWorkspace(baseDocument, 'wk_a');
    document.id = 'doc_brand_bound';
    const savedDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(savedDocument.statusCode).toBe(201);
    const savedDocumentBody = savedDocument.json<{
      document: LodariqDocument;
      latestArtifact: ReviewedArtifact | null;
    }>();
    const savedBrandArtifact = savedDocumentBody.latestArtifact;
    if (!savedBrandArtifact) throw new Error('Brand-bound artifact missing');
    expect(savedDocumentBody.document.themeBinding).toEqual({
      policy: 'workspace-current',
      themeId: theme.id,
      acknowledgedThemeVersionId: firstApproved.approvedVersion.id,
    });

    const nextDefinition = structuredClone(definition);
    nextDefinition.tokens.modes.light.colors.accent = '#0b6655';
    const updatedDraft = await app.inject({
      method: 'PATCH',
      url: `/v1/themes/${theme.id}`,
      headers: authHeaders,
      payload: {
        draft: nextDefinition,
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      },
    });
    expect(updatedDraft.statusCode).toBe(200);
    theme = updatedDraft.json<{ theme: typeof theme }>().theme;
    const staleUpdate = await app.inject({
      method: 'PATCH',
      url: `/v1/themes/${theme.id}`,
      headers: authHeaders,
      payload: {
        draft: definition,
        expectedRevision: theme.revision - 1,
        expectedUpdatedAt: firstApproved.theme.updatedAt,
      },
    });
    expect(staleUpdate.statusCode).toBe(409);
    expect(staleUpdate.json<{ error: string }>().error).toBe('workspace_theme_changed');

    const secondApproval = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/approve`,
      headers: adminHeaders,
      payload: { expectedRevision: theme.revision, expectedUpdatedAt: theme.updatedAt },
    });
    expect(secondApproval.statusCode).toBe(200);
    const secondApproved = secondApproval.json<{
      theme: typeof theme;
      approvedVersion: { id: string };
    }>();
    theme = secondApproved.theme;

    const blockedRelease = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:brand-review:1',
        'x-lodariq-correlation-id': 'corr_brand_review_1',
      },
      payload: {
        environmentId: 'env_staging',
        expectedGeneration: 0,
        expectedArtifactId: savedBrandArtifact.id,
        expectedContentHash: savedBrandArtifact.contentHash,
      },
    });
    expect(blockedRelease.statusCode).toBe(409);
    expect(blockedRelease.json()).toMatchObject({
      error: 'theme_review_required',
      acknowledgedThemeVersionId: firstApproved.approvedVersion.id,
      activeThemeVersionId: secondApproved.approvedVersion.id,
    });

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/theme-binding`,
      headers: authHeaders,
      payload: {
        binding: {
          policy: 'workspace-current',
          themeId: theme.id,
          acknowledgedThemeVersionId: secondApproved.approvedVersion.id,
        },
      },
    });
    expect(acknowledged.statusCode).toBe(200);
    const acknowledgedArtifact = acknowledged.json<{
      latestArtifact: (ReviewedArtifact & { themeVersionId: string }) | null;
    }>().latestArtifact;
    if (!acknowledgedArtifact) throw new Error('Acknowledged Brand artifact missing');
    expect(acknowledgedArtifact.themeVersionId).toBe(secondApproved.approvedVersion.id);

    const published = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:brand-review:2',
        'x-lodariq-correlation-id': 'corr_brand_review_2',
      },
      payload: {
        environmentId: 'env_staging',
        expectedGeneration: 0,
        expectedArtifactId: acknowledgedArtifact.id,
        expectedContentHash: acknowledgedArtifact.contentHash,
      },
    });
    expect(published.statusCode).toBe(201);
    expect(published.json()).toMatchObject({
      publication: { artifact: { themeVersionId: secondApproved.approvedVersion.id } },
    });
    await app.close();
  });

  it('applies Product match tokens only to the mutable theme draft and exposes provenance', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      defaultUserId: 'user_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const originalDefinition = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition);
    const createdTheme = await app.inject({
      method: 'POST',
      url: '/v1/themes',
      headers: authHeaders,
      payload: { name: 'Matched product Brand', draft: originalDefinition },
    });
    expect(createdTheme.statusCode).toBe(201);
    const theme = createdTheme.json<{
      theme: { id: string; revision: number; updatedAt: string };
    }>().theme;
    const approval = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/approve`,
      headers: authHeaders,
      payload: { expectedRevision: theme.revision, expectedUpdatedAt: theme.updatedAt },
    });
    expect(approval.statusCode).toBe(200);
    const approvedTheme = approval.json<{
      theme: { revision: number; updatedAt: string; activeVersionId: string };
      approvedVersion: { id: string };
    }>();
    const capturedAt = '2026-08-08T09:00:00.000Z';
    const productMatch = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/style-sources`,
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        proposal: {
          schemaVersion: '1',
          proposalId: 'proposal.api.product-match.1',
          sources: [
            {
              sourceId: 'selected.primary',
              kind: 'selected_element',
              confidence: 92,
              fingerprintHash: `sha256-${'a'.repeat(64)}`,
              capturedAt,
            },
            {
              sourceId: 'page.fallback',
              kind: 'page_typography',
              confidence: 70,
              fingerprintHash: `sha256-${'b'.repeat(64)}`,
              capturedAt,
            },
          ],
          samples: [],
          tokens: {
            modes: { light: { colors: { accent: '#2457ff', onAccent: '#ffffff' } } },
            radii: { md: 12 },
          },
          confidence: 92,
          requiresConfirmation: false,
          createdAt: capturedAt,
        },
      },
    });
    expect(productMatch.statusCode).toBe(201);
    expect(productMatch.json()).toMatchObject({
      draftChanged: true,
      source: { source: { sourceId: 'selected.primary' } },
      theme: {
        activeVersionId: approvedTheme.approvedVersion.id,
        draft: {
          tokens: {
            modes: { light: { colors: { accent: '#2457ff', onAccent: '#ffffff' } } },
            radii: { md: 12 },
          },
        },
        latestStyleSource: {
          sourceId: 'selected.primary',
          kind: 'selected_element',
          confidence: 92,
          capturedAt,
        },
      },
    });

    const themeDetail = await app.inject({
      method: 'GET',
      url: `/v1/themes/${theme.id}`,
      headers: authHeaders,
    });
    expect(themeDetail.statusCode).toBe(200);
    expect(themeDetail.json()).toMatchObject({
      theme: {
        activeVersionId: approvedTheme.approvedVersion.id,
        activeVersion: {
          snapshot: {
            definition: {
              tokens: {
                modes: {
                  light: {
                    colors: { accent: originalDefinition.tokens.modes.light.colors.accent },
                  },
                },
              },
            },
          },
        },
        draft: {
          tokens: { modes: { light: { colors: { accent: '#2457ff' } } } },
        },
        latestStyleSource: { sourceId: 'selected.primary' },
      },
    });

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
    // The identical compiled hash resolves to the first immutable artifact.
    expect(body.latestArtifact?.documentVersionId).toBe(body.versions[1]?.id);

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

  it('keeps legacy direct publishing closed behind one stable migration response', async () => {
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
    expect(publish.statusCode).toBe(409);
    expect(publish.json<{ error: string; message: string }>()).toEqual({
      error: 'document_release_migration_required',
      message:
        'Legacy direct publishing is disabled; review an immutable artifact and use the document-scoped release API',
    });

    await app.close();
  });

  it('publishes to staging through server-hashed idempotent document releases', async () => {
    const repository = createInMemoryControlPlaneRepository({
      environments: [
        {
          id: 'env_staging',
          workspaceId: 'wk_a',
          kind: 'staging',
          name: 'Staging',
          originAllowlist: ['https://staging.lodariq.com'],
          createdAt: '2026-08-07T00:00:00.000Z',
          updatedAt: '2026-08-07T00:00:00.000Z',
        },
      ],
    });
    const app = createApiApp({ repository });
    const document = withWorkspace(baseDocument, 'wk_a');
    const save = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(save.statusCode).toBe(201);
    const savedDocument = save.json<{
      document: LodariqDocument;
      latestArtifact: ReviewedArtifact | null;
    }>();
    const reviewedArtifact = savedDocument.latestArtifact;
    if (!reviewedArtifact) throw new Error('Reviewed staging artifact missing');
    const reviewedIntent = {
      environmentId: 'env_staging',
      expectedGeneration: 0,
      expectedArtifactId: reviewedArtifact.id,
      expectedContentHash: reviewedArtifact.contentHash,
    };

    const missingGuard = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: authHeaders,
      payload: reviewedIntent,
    });
    expect(missingGuard.statusCode).toBe(400);
    expect(missingGuard.json<{ error: string }>().error).toBe('invalid_idempotency_key');

    const releaseHeaders = {
      ...authHeaders,
      'idempotency-key': 'release:staging:welcome:1',
      'x-lodariq-correlation-id': 'corr_release_welcome_1',
    };
    const first = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: releaseHeaders,
      payload: reviewedIntent,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      replayed: false,
      deployment: { documentId: document.id, generation: 1, state: 'active' },
      operation: {
        idempotencyKey: 'release:staging:welcome:1',
        requestHash: expect.stringMatching(/^sha256-[0-9a-f]{64}$/),
        status: 'completed',
      },
      publication: {
        documentId: document.id,
        compiledArtifactId: reviewedArtifact.id,
        contentHash: reviewedArtifact.contentHash,
        environment: 'staging',
        action: 'publish',
      },
      visualCheck: {
        contentHash: expect.stringMatching(/^sha256-[0-9a-f]{64}$/),
        status: expect.stringMatching(/^(passed|warnings)$/),
        report: { status: expect.stringMatching(/^(passed|warnings)$/) },
      },
    });

    const laterDraft = withParagraphContent(
      savedDocument.document,
      'This paragraph was edited after the reviewed artifact was released.',
    );
    const laterSave = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: laterDraft,
    });
    expect(laterSave.statusCode).toBe(201);
    const laterArtifact = laterSave.json<{ latestArtifact: ReviewedArtifact | null }>()
      .latestArtifact;
    if (!laterArtifact) throw new Error('Later draft artifact missing');
    expect(laterArtifact.contentHash).not.toBe(reviewedArtifact.contentHash);

    const replay = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: releaseHeaders,
      payload: reviewedIntent,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      replayed: true,
      publication: {
        compiledArtifactId: reviewedArtifact.id,
        contentHash: reviewedArtifact.contentHash,
      },
    });

    const alteredReplay = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: releaseHeaders,
      payload: {
        ...reviewedIntent,
        expectedArtifactId: laterArtifact.id,
        expectedContentHash: laterArtifact.contentHash,
      },
    });
    expect(alteredReplay.statusCode).toBe(409);
    expect(alteredReplay.json<{ error: string }>().error).toBe('idempotency_conflict');

    const staleWriter = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:staging:welcome:2',
        'x-lodariq-correlation-id': 'corr_release_welcome_2',
      },
      payload: {
        ...reviewedIntent,
        expectedArtifactId: laterArtifact.id,
        expectedContentHash: laterArtifact.contentHash,
      },
    });
    expect(staleWriter.statusCode).toBe(409);
    expect(staleWriter.json<{ error: string; actualGeneration: number }>()).toMatchObject({
      error: 'deployment_changed',
      actualGeneration: 1,
    });

    const deployments = await app.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}/deployments`,
      headers: authHeaders,
    });
    expect(deployments.json<{ deployments: unknown[] }>().deployments).toHaveLength(1);
    const publications = await app.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}/publications`,
      headers: authHeaders,
    });
    expect(publications.json<{ publications: unknown[] }>().publications).toHaveLength(1);
    const visualChecks = await app.inject({
      method: 'GET',
      url: `/v1/documents/${document.id}/visual-checks`,
      headers: authHeaders,
    });
    expect(visualChecks.json<{ visualChecks: unknown[] }>().visualChecks).toHaveLength(2);

    await app.close();
  });

  it('returns the stable release migration response for legacy direct production publishing', async () => {
    const repository = createInMemoryControlPlaneRepository({
      environments: [
        {
          id: 'env_production',
          workspaceId: 'wk_a',
          kind: 'production',
          name: 'Production',
          originAllowlist: ['https://app.example.com'],
          createdAt: '2026-08-06T00:00:00.000Z',
          updatedAt: '2026-08-06T00:00:00.000Z',
        },
      ],
    });
    const app = createApiApp({ repository });
    const document = withWorkspace(baseDocument, 'wk_a');
    const save = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(save.statusCode).toBe(201);

    for (const role of ['member', 'admin']) {
      const publish = await app.inject({
        method: 'POST',
        url: `/v1/documents/${document.id}/publish`,
        headers: { ...authHeaders, 'x-lodariq-role': role },
        payload: { environmentId: 'env_production' },
      });
      expect(publish.statusCode).toBe(409);
      expect(publish.json<{ error: string; message: string }>()).toEqual({
        error: 'document_release_migration_required',
        message:
          'Legacy direct publishing is disabled; review an immutable artifact and use the document-scoped release API',
      });
    }
    await expect(repository.getCurrentPublication('wk_a', 'env_production')).resolves.toBeNull();

    await app.close();
  });

  it('gates legacy publishing and returns a stable conflict when document pointers are active', async () => {
    const environment = {
      id: 'env_staging',
      workspaceId: 'wk_a',
      kind: 'staging' as const,
      name: 'Staging',
      originAllowlist: ['https://staging.lodariq.com'],
      createdAt: '2026-08-06T00:00:00.000Z',
      updatedAt: '2026-08-06T00:00:00.000Z',
    };
    const repository = createInMemoryControlPlaneRepository({ environments: [environment] });
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const documentA = withWorkspace(baseDocument, 'wk_a');
    documentA.id = 'doc_pointer_a';
    documentA.title = 'Pointer A';
    const documentB = structuredClone(documentA);
    documentB.id = 'doc_pointer_b';
    documentB.title = 'Pointer B';

    for (const document of [documentA, documentB]) {
      const save = await app.inject({
        method: 'POST',
        url: '/v1/documents',
        headers: authHeaders,
        payload: document,
      });
      expect(save.statusCode).toBe(201);
    }
    const [recordA, recordB] = await Promise.all([
      repository.getDocument('wk_a', documentA.id),
      repository.getDocument('wk_a', documentB.id),
    ]);
    if (!recordA?.latestArtifact || !recordB?.latestArtifact) {
      throw new Error('pointer test artifacts missing');
    }
    await repository.activateCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_pointer_a',
      artifact: recordA.latestArtifact,
      actorUserId: 'user_a',
      idempotencyKey: 'publish:pointer:a',
      requestHash: recordA.latestArtifact.contentHash,
      expectedGeneration: 0,
    });
    await repository.activateCompiledArtifact({
      workspaceId: 'wk_a',
      environmentId: environment.id,
      correlationId: 'corr_pointer_b',
      artifact: recordB.latestArtifact,
      actorUserId: 'user_a',
      idempotencyKey: 'publish:pointer:b',
      requestHash: recordB.latestArtifact.contentHash,
      expectedGeneration: 0,
    });

    const legacyPublish = await app.inject({
      method: 'POST',
      url: `/v1/documents/${documentA.id}/publish`,
      headers: authHeaders,
      payload: { environmentId: environment.id },
    });
    expect(legacyPublish.statusCode).toBe(409);
    expect(legacyPublish.json<{ error: string }>().error).toBe(
      'document_release_migration_required',
    );

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: { environmentId: environment.id, name: 'Pointer conflict SDK' },
    });
    const clientToken = tokenResponse.json<{ clientToken: string }>().clientToken;
    const sdkHeaders = {
      authorization: `Bearer ${clientToken}`,
      origin: 'https://staging.lodariq.com',
    };
    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: sdkHeaders,
      payload: { environment: 'staging' },
    });
    expect(bootstrap.statusCode).toBe(409);
    expect(bootstrap.json<{ error: string; code: string }>()).toMatchObject({
      error: 'document_specific_delivery_required',
      code: 'AMBIGUOUS_CURRENT_PUBLICATION',
    });

    const currentDocument = await app.inject({
      method: 'GET',
      url: '/v1/sdk/current-document',
      headers: sdkHeaders,
    });
    expect(currentDocument.statusCode).toBe(409);
    expect(currentDocument.json<{ error: string }>().error).toBe(
      'document_specific_delivery_required',
    );

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
      activationGrant: 'lod_activation_secret_grant',
      reconnectHint: 'retry lod_bootstrap_secret_grant',
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
    expect(sdkProps['activationGrant']).toBe('<redacted>');
    expect(sdkProps['reconnectHint']).toBe('retry lod_<redacted>');
    expect(nested['authorization']).toBe('<redacted>');
    expect(nested['email']).toBe('<email>');
    expect(nested['callback']).toBe('https://api.lodariq.com/v1/sdk/current-document');
    expect(nested['safe']).toBe('kept');

    const persistedText = JSON.stringify(capturedEvents);
    expect(persistedText).not.toContain('lod_staging_secret_token');
    expect(persistedText).not.toContain('lod_activation_secret_grant');
    expect(persistedText).not.toContain('lod_bootstrap_secret_grant');
    expect(persistedText).not.toContain('live.session.jwt');
    expect(persistedText).not.toContain('owner@example.com');
    expect(persistedText).not.toContain('?token=');

    await app.close();
  });

  it('launches and saves an incomplete unpublished draft without publishing it', async () => {
    const observabilityEvents: Array<{
      name: string;
      correlationId?: string;
      documentId?: string;
    }> = [];
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
      loaderSrc: 'https://cdn.lodariq.com/sdk/lodariq-loader.js',
      observability: { emit: (event) => observabilityEvents.push(event) },
    });
    const document = makeIncompleteButtonDocument(withWorkspace(baseDocument, 'wk_a'));

    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);
    observabilityEvents.length = 0;

    const rejectedCombinedToken = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Legacy creator launch',
        authoringDocumentId: document.id,
      },
    });
    expect(rejectedCombinedToken.statusCode).toBe(400);

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Creator launch',
      },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const token = tokenResponse.json<{
      clientToken: string;
      sdkSnippet: string;
      [key: string]: unknown;
    }>();
    expect(token.clientToken).toMatch(/^lod_staging_/);
    expect(token).not.toHaveProperty('authoringSession');
    expect(token).not.toHaveProperty('publication');
    expect(token.sdkSnippet).not.toContain('data-lodariq-authoring-session');
    expect(token.sdkSnippet).toContain('src="https://cdn.lodariq.com/sdk/lodariq-loader.js"');
    expect(token.sdkSnippet).not.toContain('lodariq-creator.js');

    const viewerBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        authorization: `Bearer ${token.clientToken}`,
        origin: 'https://staging.lodariq.com',
      },
      payload: {
        environment: 'staging',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(viewerBootstrap.statusCode).toBe(404);

    const documentsBeforeSession = await app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: authHeaders,
    });
    expect(
      documentsBeforeSession
        .json<{ documents: Array<{ id: string; publications: unknown[] }> }>()
        .documents.find((candidate) => candidate.id === document.id)?.publications,
    ).toEqual([]);

    const developmentTokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_development',
        name: 'Wrong authoring environment',
      },
    });
    expect(developmentTokenResponse.statusCode).toBe(201);
    const developmentClientToken = developmentTokenResponse.json<{ clientToken: string }>()
      .clientToken;
    const mismatchedSession = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        documentId: document.id,
        environmentClientToken: developmentClientToken,
      },
    });
    expect(mismatchedSession.statusCode).toBe(403);
    expect(mismatchedSession.json<{ error: string }>().error).toBe('environment_token_mismatch');

    const sessionResponse = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        documentId: document.id,
        environmentClientToken: token.clientToken,
      },
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{
      authoringSessionToken: string;
      bootstrapHeaderName: string;
      authoringSdkSnippet: string;
      authoringSession: {
        documentId: string;
        environment: string;
        expiresAt: string;
        correlationId: string;
        compilerVersion: string;
        rendererContractVersion: string;
        themeContractVersion: string;
        themeVersionId: string;
      };
    }>();
    expect(session.authoringSessionToken).toMatch(/^lod_authoring_/);
    expect(session.bootstrapHeaderName).toBe('x-lodariq-authoring-session');
    expect(session.authoringSession).toMatchObject({
      documentId: document.id,
      environment: 'staging',
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    });
    expect(session.authoringSession.correlationId).toMatch(/^corr_authoring_/);
    expect(observabilityEvents).toEqual([
      expect.objectContaining({
        name: 'authoring.session.created',
        correlationId: session.authoringSession.correlationId,
        documentId: document.id,
      }),
    ]);
    expect(observabilityEvents.some((event) => event.name === 'publish.completed')).toBe(false);
    expect(Date.parse(session.authoringSession.expiresAt)).toBeGreaterThan(Date.now());
    expect(session.authoringSdkSnippet).toContain('data-lodariq-token="lod_staging_');
    expect(session.authoringSdkSnippet).toContain('data-lodariq-authoring-session="lod_authoring_');
    expect(session.authoringSdkSnippet).toContain(
      'src="https://cdn.lodariq.com/sdk/lodariq-creator.js"',
    );

    const authoringSdkHeaders = {
      authorization: `Bearer ${token.clientToken}`,
      'x-lodariq-authoring-session': session.authoringSessionToken,
      origin: 'https://staging.lodariq.com',
    };

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: authoringSdkHeaders,
      payload: {
        environment: 'staging',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    const bootstrapContext = bootstrap.json<{
      correlationId: string;
      currentDocumentUrl: string;
      manifest: { documentId: string; currentVersion: string };
      authoring: {
        enabled: boolean;
        sessionId: string;
        documentUrl: string;
        saveDocumentUrl: string;
      };
    }>();
    expect(bootstrapContext.correlationId).toBe(session.authoringSession.correlationId);
    expect(bootstrapContext.currentDocumentUrl).toBe('');
    expect(bootstrapContext.manifest.documentId).toBe(document.id);
    expect(bootstrapContext.manifest.currentVersion).toMatch(/^sha256-/);
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
      headers: authoringSdkHeaders,
    });
    expect(loadFromCreatorFrame.statusCode).toBe(200);
    expect(loadFromCreatorFrame.json<{ document: LodariqDocument }>().document).toMatchObject({
      id: document.id,
      title: document.title,
    });

    const saveWithoutAuthoringSession = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: {
        authorization: `Bearer ${token.clientToken}`,
        origin: 'https://staging.lodariq.com',
      },
      payload: {
        document: { ...document, title: 'Rejected creator save' },
      },
    });
    expect(saveWithoutAuthoringSession.statusCode).toBe(401);

    const saveDifferentDocument = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: authoringSdkHeaders,
      payload: {
        document: { ...document, id: `${document.id}_other` },
      },
    });
    expect(saveDifferentDocument.statusCode).toBe(403);
    expect(saveDifferentDocument.json<{ error: string }>().error).toBe(
      'authoring_session_mismatch',
    );

    const saveWithExtraTopLevelField = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: authoringSdkHeaders,
      payload: {
        document,
        rawHtml: '<script>alert(1)</script>',
      },
    });
    expect(saveWithExtraTopLevelField.statusCode).toBe(400);

    const saveFromCreatorFrame = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: authoringSdkHeaders,
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

    const documentsAfterSave = await app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: authHeaders,
    });
    expect(
      documentsAfterSave
        .json<{ documents: Array<{ id: string; publications: unknown[] }> }>()
        .documents.find((candidate) => candidate.id === document.id)?.publications,
    ).toEqual([]);

    const viewerBootstrapAfterSave = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: {
        authorization: `Bearer ${token.clientToken}`,
        origin: 'https://staging.lodariq.com',
      },
      payload: { environment: 'staging' },
    });
    expect(viewerBootstrapAfterSave.statusCode).toBe(404);

    const alternateThemeResponse = await app.inject({
      method: 'POST',
      url: '/v1/themes',
      headers: authHeaders,
      payload: {
        name: 'Alternate session theme',
        draft: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition,
      },
    });
    const alternateTheme = alternateThemeResponse.json<{
      theme: { id: string; revision: number; updatedAt: string };
    }>().theme;
    const alternateApprovalResponse = await app.inject({
      method: 'POST',
      url: `/v1/themes/${alternateTheme.id}/approve`,
      headers: authHeaders,
      payload: {
        expectedRevision: alternateTheme.revision,
        expectedUpdatedAt: alternateTheme.updatedAt,
      },
    });
    const alternateApproval = alternateApprovalResponse.json<{
      approvedVersion: { id: string };
    }>();
    const incompatibleBinding = {
      policy: 'pinned' as const,
      themeId: alternateTheme.id,
      themeVersionId: alternateApproval.approvedVersion.id,
    };
    const rebound = await app.inject({
      method: 'POST',
      url: `/v1/documents/${document.id}/theme-binding`,
      headers: authHeaders,
      payload: { binding: incompatibleBinding },
    });
    expect(rebound.statusCode).toBe(200);

    const incompatibleBootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: authoringSdkHeaders,
      payload: { environment: 'staging', origin: 'https://staging.lodariq.com' },
    });
    expect(incompatibleBootstrap.statusCode).toBe(409);
    expect(incompatibleBootstrap.json()).toMatchObject({
      error: 'authoring_session_compatibility_changed',
    });
    const incompatibleCreatorLoad = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/document',
      headers: authoringSdkHeaders,
    });
    expect(incompatibleCreatorLoad.statusCode).toBe(409);
    const incompatibleCreatorSave = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/document',
      headers: authoringSdkHeaders,
      payload: {
        document: {
          ...document,
          title: 'Must not save across a compatibility change',
          themeBinding: incompatibleBinding,
        },
      },
    });
    expect(incompatibleCreatorSave.statusCode).toBe(409);

    const missingDocument = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        documentId: 'doc_missing',
      },
    });
    expect(missingDocument.statusCode).toBe(404);

    await app.close();
  });

  it('returns the canonical draft, exact approved theme, and read-only release state to direct development authoring', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      defaultUserId: 'user_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const definition = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition);
    definition.tokens.modes.light.colors.accent = '#0b6655';
    const createTheme = await app.inject({
      method: 'POST',
      url: '/v1/themes',
      headers: authHeaders,
      payload: { name: 'Direct authoring Brand', draft: definition },
    });
    expect(createTheme.statusCode).toBe(201);
    const theme = createTheme.json<{
      theme: { id: string; revision: number; updatedAt: string };
    }>().theme;
    const approveTheme = await app.inject({
      method: 'POST',
      url: `/v1/themes/${theme.id}/approve`,
      headers: { ...authHeaders, 'x-lodariq-role': 'admin' },
      payload: {
        expectedRevision: theme.revision,
        expectedUpdatedAt: theme.updatedAt,
      },
    });
    expect(approveTheme.statusCode).toBe(200);
    const approvedVersion = approveTheme.json<{
      approvedVersion: {
        id: string;
        snapshot: BrandThemeSnapshot;
      };
    }>().approvedVersion;
    const document = withWorkspace(baseDocument, 'wk_a');
    document.id = 'doc_direct_development_theme';
    document.themeBinding = {
      policy: 'pinned',
      themeId: theme.id,
      themeVersionId: approvedVersion.id,
    };
    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);
    const savedDocument = createDocument.json<{ document: LodariqDocument }>().document;

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_development',
        name: 'Direct development authoring',
      },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const { clientToken } = tokenResponse.json<{ clientToken: string }>();

    const sessionResponse = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_development',
        documentId: savedDocument.id,
        environmentClientToken: clientToken,
      },
    });
    expect(sessionResponse.statusCode).toBe(201);
    const { authoringSessionToken } = sessionResponse.json<{
      authoringSessionToken: string;
    }>();
    const directHeaders = {
      authorization: `Bearer ${clientToken}`,
      'x-lodariq-authoring-session': authoringSessionToken,
      origin: 'http://localhost:5175',
    };

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: directHeaders,
      payload: {
        environment: 'development',
        origin: 'http://localhost:5175',
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    const context = bootstrap.json<{
      authoring: {
        release: {
          releaseState: { capability: string; url: string };
          stagingPublication?: { capability: string; url: string };
        };
      };
    }>();
    expect(context.authoring.release.releaseState).toEqual({
      capability: 'document:read-release-state',
      url: 'https://api.lodariq.com/v1/sdk/authoring/release-state',
    });
    expect(context.authoring.release).not.toHaveProperty('stagingPublication');

    const draftResponse = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/document',
      headers: directHeaders,
    });
    expect(draftResponse.statusCode).toBe(200);
    expect(
      draftResponse.json<{
        document: LodariqDocument;
        theme: BrandThemeSnapshot;
      }>(),
    ).toEqual({
      document: savedDocument,
      theme: approvedVersion.snapshot,
    });

    const releaseState = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/release-state',
      headers: directHeaders,
    });
    expect(releaseState.statusCode).toBe(200);
    expect(releaseState.json()).toMatchObject({
      available: false,
      environment: 'development',
      environmentId: 'env_development',
      documentId: savedDocument.id,
      expectedGeneration: 0,
      activeContentHash: null,
      state: 'open_in_staging',
    });

    await app.close();
  });

  it('publishes direct staging authoring idempotently and rejects invalid origin or session credentials', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      defaultUserId: 'user_a',
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
    const saved = createDocument.json<{
      document: LodariqDocument;
      latestArtifact: ReviewedArtifact | null;
    }>();
    const reviewedArtifact = saved.latestArtifact;
    if (!reviewedArtifact) throw new Error('Direct staging artifact missing');

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        name: 'Direct staging authoring',
      },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const { clientToken } = tokenResponse.json<{ clientToken: string }>();
    const sessionResponse = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        documentId: saved.document.id,
        environmentClientToken: clientToken,
      },
    });
    expect(sessionResponse.statusCode).toBe(201);
    const { authoringSessionToken } = sessionResponse.json<{
      authoringSessionToken: string;
    }>();
    const directHeaders = {
      authorization: `Bearer ${clientToken}`,
      'x-lodariq-authoring-session': authoringSessionToken,
      origin: 'https://staging.lodariq.com',
    };
    const publicationIntent = {
      expectedGeneration: 0,
      expectedArtifactId: reviewedArtifact.id,
      expectedContentHash: reviewedArtifact.contentHash,
    };

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: directHeaders,
      payload: {
        environment: 'staging',
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toMatchObject({
      authoring: {
        release: {
          releaseState: {
            capability: 'document:read-release-state',
            url: 'https://api.lodariq.com/v1/sdk/authoring/release-state',
          },
          stagingPublication: {
            capability: 'document:publish-staging',
            url: 'https://api.lodariq.com/v1/sdk/authoring/publications',
          },
        },
      },
    });

    const missingOrigin = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/release-state',
      headers: {
        authorization: `Bearer ${clientToken}`,
        'x-lodariq-authoring-session': authoringSessionToken,
      },
    });
    expect(missingOrigin.statusCode).toBe(403);
    expect(missingOrigin.json<{ error: string }>().error).toBe('authoring_origin_forbidden');

    const wrongOrigin = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/publications',
      headers: {
        ...directHeaders,
        origin: 'https://attacker.example',
        'idempotency-key': 'direct:staging:rejected-origin',
        'x-lodariq-correlation-id': 'corr_direct_rejected_origin',
      },
      payload: publicationIntent,
    });
    expect(wrongOrigin.statusCode).toBe(403);
    expect(wrongOrigin.json<{ error: string }>().error).toBe('authoring_origin_forbidden');

    const missingSession = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/release-state',
      headers: {
        authorization: `Bearer ${clientToken}`,
        origin: 'https://staging.lodariq.com',
      },
    });
    expect(missingSession.statusCode).toBe(401);
    expect(missingSession.json<{ error: string }>().error).toBe('authoring_session_required');

    const wrongSession = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/publications',
      headers: {
        ...directHeaders,
        'x-lodariq-authoring-session': 'lod_authoring_wrong_session',
        'idempotency-key': 'direct:staging:rejected-session',
        'x-lodariq-correlation-id': 'corr_direct_rejected_session',
      },
      payload: publicationIntent,
    });
    expect(wrongSession.statusCode).toBe(401);
    expect(wrongSession.json<{ error: string }>().error).toBe('unauthorized');

    const beforePublish = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/release-state',
      headers: directHeaders,
    });
    expect(beforePublish.statusCode).toBe(200);
    expect(beforePublish.json()).toMatchObject({
      expectedGeneration: 0,
      draftArtifactId: reviewedArtifact.id,
      draftContentHash: reviewedArtifact.contentHash,
      activeContentHash: null,
      state: 'ready',
    });

    const releaseHeaders = {
      ...directHeaders,
      'idempotency-key': 'direct:staging:release:1',
      'x-lodariq-correlation-id': 'corr_direct_staging_release_1',
    };
    const firstPublication = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/publications',
      headers: releaseHeaders,
      payload: publicationIntent,
    });
    expect(firstPublication.statusCode).toBe(201);
    expect(firstPublication.json()).toMatchObject({
      ok: true,
      replayed: false,
      generation: 1,
      findings: expect.any(Array),
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/publications',
      headers: releaseHeaders,
      payload: publicationIntent,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      ok: true,
      replayed: true,
      generation: 1,
    });

    const currentState = await app.inject({
      method: 'GET',
      url: '/v1/sdk/authoring/release-state',
      headers: directHeaders,
    });
    expect(currentState.statusCode).toBe(200);
    expect(currentState.json()).toMatchObject({
      expectedGeneration: 1,
      draftArtifactId: reviewedArtifact.id,
      draftContentHash: reviewedArtifact.contentHash,
      activeContentHash: reviewedArtifact.contentHash,
      state: 'current',
    });

    await app.close();
  });

  it('verifies and promotes the exact staging artifact through a legacy direct SDK session', async () => {
    const now = '2026-08-08T00:00:00.000Z';
    const repository = createInMemoryControlPlaneRepository({
      workspaceMemberships: [
        {
          workspaceId: 'wk_a',
          userId: 'user_a',
          role: 'owner',
          createdAt: now,
        },
      ],
      environments: [
        {
          id: 'env_staging',
          workspaceId: 'wk_a',
          kind: 'staging',
          name: 'Staging',
          originAllowlist: ['https://staging.lodariq.com'],
          requiredApprovalCount: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'env_production',
          workspaceId: 'wk_a',
          kind: 'production',
          name: 'Production',
          originAllowlist: ['https://www.lodariq.com'],
          requiredApprovalCount: 1,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const app = createApiApp({
      repository,
      defaultWorkspaceId: 'wk_a',
      defaultUserId: 'user_a',
      publicApiBaseUrl: 'https://api.lodariq.com',
    });
    const document = withWorkspace(baseDocument, 'wk_a');
    document.id = 'doc_exact_direct_promotion';
    const createDocument = await app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers: authHeaders,
      payload: document,
    });
    expect(createDocument.statusCode).toBe(201);
    const saved = createDocument.json<{
      document: LodariqDocument;
      latestArtifact: ReviewedArtifact | null;
    }>();
    const reviewedArtifact = saved.latestArtifact;
    if (!reviewedArtifact) throw new Error('Exact promotion artifact missing');

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: authHeaders,
      payload: { environmentId: 'env_staging', name: 'Exact release token' },
    });
    expect(tokenResponse.statusCode).toBe(201);
    const { clientToken } = tokenResponse.json<{ clientToken: string }>();
    const sessionResponse = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: authHeaders,
      payload: {
        environmentId: 'env_staging',
        documentId: document.id,
        environmentClientToken: clientToken,
      },
    });
    expect(sessionResponse.statusCode).toBe(201);
    const { authoringSessionToken } = sessionResponse.json<{
      authoringSessionToken: string;
    }>();
    const directHeaders = {
      authorization: `Bearer ${clientToken}`,
      'x-lodariq-authoring-session': authoringSessionToken,
      origin: 'https://staging.lodariq.com',
    };

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: directHeaders,
      payload: { environment: 'staging', origin: 'https://staging.lodariq.com' },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toMatchObject({
      environmentId: 'env_staging',
      authoring: {
        release: {
          stagingVerification: { capability: 'document:verify-staging' },
          productionPromotion: { capability: 'document:promote-production' },
          productionApproval: { capability: 'document:approve-production' },
        },
      },
    });

    const stagingPublicationResponse = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/publications',
      headers: {
        ...directHeaders,
        'idempotency-key': 'exact:staging:release:1',
        'x-lodariq-correlation-id': 'corr_exact_staging_release_1',
      },
      payload: {
        expectedGeneration: 0,
        expectedArtifactId: reviewedArtifact.id,
        expectedContentHash: reviewedArtifact.contentHash,
      },
    });
    expect(stagingPublicationResponse.statusCode).toBe(201);
    const stagingPublication = await repository.getCurrentPublicationForDocument(
      'wk_a',
      'env_staging',
      document.id,
    );
    if (!stagingPublication) throw new Error('Active staging publication missing');

    const reportIdentity = {
      schemaVersion: '1',
      checkedAt: new Date().toISOString(),
      sdkVersion: 'test',
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      status: 'passed',
    } as const;
    const incompleteVerification = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/verifications',
      headers: directHeaders,
      payload: {
        publicationId: stagingPublication.id,
        report: {
          ...reportIdentity,
          checks: [{ code: BROWSER_VERIFICATION_CHECK_CODES[0], status: 'passed' }],
        },
      },
    });
    expect(incompleteVerification.statusCode, incompleteVerification.body).toBe(400);

    const verification = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/verifications',
      headers: directHeaders,
      payload: {
        publicationId: stagingPublication.id,
        report: {
          ...reportIdentity,
          checks: BROWSER_VERIFICATION_CHECK_CODES.map((code) => ({
            code,
            status: 'passed',
          })),
        },
      },
    });
    expect(verification.statusCode).toBe(201);
    expect(verification.json()).toMatchObject({
      ok: true,
      verification: {
        publicationId: stagingPublication.id,
        compiledArtifactId: stagingPublication.compiledArtifactId,
        contentHash: stagingPublication.contentHash,
        result: 'passed',
        verifiedOrigin: 'https://staging.lodariq.com',
      },
    });

    const promotionIntent = {
      sourcePublicationId: stagingPublication.id,
      productionEnvironmentId: 'env_production',
      expectedGeneration: 0,
      idempotencyKey: 'exact:production:promotion:1',
      correlationId: 'corr_exact_production_promotion_1',
    };
    const promotion = await app.inject({
      method: 'POST',
      url: '/v1/sdk/authoring/promotions',
      headers: directHeaders,
      payload: promotionIntent,
    });
    expect(promotion.statusCode).toBe(202);
    const pendingPromotion = promotion.json<{
      releaseOperationId: string;
      state: string;
    }>();
    expect(pendingPromotion.state).toBe('awaiting_approval');

    const approval = await app.inject({
      method: 'POST',
      url: `/v1/sdk/authoring/release-operations/${pendingPromotion.releaseOperationId}/approvals`,
      headers: directHeaders,
      payload: { decision: 'approved' },
    });
    expect(approval.statusCode).toBe(200);
    expect(approval.json()).toMatchObject({
      promotion: {
        ok: true,
        state: 'completed',
        compiledArtifactId: stagingPublication.compiledArtifactId,
        contentHash: stagingPublication.contentHash,
      },
    });

    const productionPublication = await repository.getCurrentPublicationForDocument(
      'wk_a',
      'env_production',
      document.id,
    );
    expect(productionPublication).toMatchObject({
      compiledArtifactId: stagingPublication.compiledArtifactId,
      contentHash: stagingPublication.contentHash,
      sourcePublicationId: stagingPublication.id,
    });

    const documentList = await app.inject({
      method: 'GET',
      url: '/v1/documents',
      headers: authHeaders,
    });
    const summary = documentList
      .json<{
        documents: Array<{
          id: string;
          deployments: Array<{ environmentId: string; state: string }>;
          publications: Array<{
            environment: string;
            compiledArtifactId: string;
            sourcePublicationId: string | null;
            active: boolean;
            verification: { status: string };
          }>;
        }>;
      }>()
      .documents.find((candidate) => candidate.id === document.id);
    expect(summary?.deployments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ environmentId: 'env_staging', state: 'active' }),
        expect.objectContaining({ environmentId: 'env_production', state: 'active' }),
      ]),
    );
    expect(summary?.publications.find((item) => item.environment === 'staging')).toMatchObject({
      compiledArtifactId: stagingPublication.compiledArtifactId,
      active: true,
      verification: { status: 'passed' },
    });
    expect(summary?.publications.find((item) => item.environment === 'production')).toMatchObject({
      compiledArtifactId: stagingPublication.compiledArtifactId,
      sourcePublicationId: stagingPublication.id,
      active: true,
    });

    const duplicateApproval = await app.inject({
      method: 'POST',
      url: `/v1/sdk/authoring/release-operations/${pendingPromotion.releaseOperationId}/approvals`,
      headers: directHeaders,
      payload: { decision: 'approved' },
    });
    expect(duplicateApproval.statusCode).toBe(409);
    expect(duplicateApproval.json()).toMatchObject({ error: 'release_not_awaiting_approval' });

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
    const sdkArtifact = createDocument.json<{ latestArtifact: ReviewedArtifact | null }>()
      .latestArtifact;
    if (!sdkArtifact) throw new Error('SDK delivery artifact missing');

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
      url: `/v1/documents/${document.id}/publications`,
      headers: {
        ...authHeaders,
        'idempotency-key': 'release:sdk-delivery:1',
        'x-lodariq-correlation-id': 'corr_publish_sdk_delivery_1',
      },
      payload: {
        environmentId: 'env_staging',
        expectedGeneration: 0,
        expectedArtifactId: sdkArtifact.id,
        expectedContentHash: sdkArtifact.contentHash,
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
        origin: 'http://localhost:5175',
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
      manifest: {
        documentId: string;
        currentVersion: string;
        artifact: { contentHash: string; compilerVersion: string; documentVersionId?: string };
      };
      currentDocumentUrl: string;
      ingestUrl: string;
      authoring: { enabled: boolean };
    }>();
    expect(context.workspaceId).toBe('wk_a');
    expect(context.environment).toBe('staging');
    expect(context.correlationId).toMatch(/^corr_publish_/);
    expect(context.manifest.documentId).toBe(document.id);
    expect(context.manifest.currentVersion).toMatch(/^sha256-/);
    expect(context.manifest.artifact).toMatchObject({
      contentHash: context.manifest.currentVersion,
      compilerVersion: expect.any(String),
    });
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
        compilerVersion: string;
        rendererContractVersion: string;
        themeContractVersion: string;
        themeVersionId: string;
      };
    }>();
    expect(authoringSession.authoringSessionToken).toMatch(/^lod_authoring_/);
    expect(authoringSession.bootstrapHeaderName).toBe('x-lodariq-authoring-session');
    expect(authoringSession.authoringSession).toMatchObject({
      environment: 'staging',
      documentId: document.id,
      iframeSrc: 'https://editor.lodariq.com/authoring.html',
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
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
    expect(authoringContext.correlationId).toBe(authoringSession.authoringSession.correlationId);
    expect(authoringContext.authoring.correlationId).toBe(
      authoringSession.authoringSession.correlationId,
    );

    const currentDocument = await app.inject({
      method: 'GET',
      url: '/v1/sdk/current-document',
      headers: sdkHeaders,
    });
    expect(currentDocument.statusCode).toBe(200);
    expect(currentDocument.headers['cache-control']).toContain('private');
    expect(currentDocument.headers['cache-control']).toContain('no-store');
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

  it('uses database membership roles instead of development role headers', async () => {
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      repository: membershipRepository({
        workspaceId: 'wk_a',
        userId: 'user_a',
        role: 'viewer',
      }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/environment-tokens',
      headers: {
        ...authHeaders,
        'x-lodariq-role': 'owner',
      },
      payload: {
        environmentId: 'env_staging',
        name: 'Header role should not win',
      },
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
    const app = createApiApp({
      defaultWorkspaceId: 'wk_a',
      authProvider: createHeaderAuthProvider(),
    });

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

interface ReviewedArtifact {
  id: string;
  contentHash: string;
}

function withParagraphContent(document: LodariqDocument, content: string): LodariqDocument {
  const next = structuredClone(document);
  const paragraph = next.blocks[0]?.children[0]?.children.find(
    (block) => block.type === 'paragraph',
  );
  if (!paragraph) throw new Error('fixture paragraph missing');
  paragraph.content = content;
  return next;
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

function membershipRepository({
  workspaceId,
  userId,
  role,
}: {
  workspaceId: string;
  userId: string;
  role: string;
}): ControlPlaneRepository {
  const now = '2026-06-30T00:00:00.000Z';
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: userId,
        legacyIdentityId: null,
        email: `${userId}@lodariq.test`,
        name: userId,
        createdAt: now,
      },
    ],
    workspaceMemberships: [
      {
        workspaceId,
        userId,
        role,
        createdAt: now,
      },
    ],
    environments: [
      {
        id: 'env_staging',
        workspaceId,
        kind: 'staging',
        name: 'Staging',
        originAllowlist: ['https://staging.lodariq.com'],
        createdAt: now,
        updatedAt: now,
      },
    ],
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
