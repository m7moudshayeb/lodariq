import { describe, expect, it, vi } from 'vitest';
import { createApiApp } from '@lodariq/api';
import {
  createInMemoryControlPlaneRepository,
  deriveAuthoringPkceS256Challenge,
  hashAuthoringActivationGrant,
  hashAuthoringAuthorizationCode,
  hashAuthoringAuthorizationState,
  hashAuthoringSessionToken,
  hashPublicSdkBootstrapGrant,
  type ControlPlaneRepository,
  type WorkspaceEnvironment,
} from '@lodariq/database';
import {
  AUTHORING_ACTIVATION_GRANT_HEADER,
  AUTHORING_ACTIVATION_CAPABILITIES,
  AUTHORING_ACTIVATION_PROTOCOL,
  AUTHORING_BOOTSTRAP_GRANT_HEADER,
  AUTHORING_SESSION_CAPABILITIES,
  AUTHORING_SESSION_HEADER,
  BRAND_THEME_CONTRACT_VERSION,
  COMMERCIAL_PLAN_VERSION,
  COMPILER_VERSION,
  AuthoringCodeExchangeResult,
  AuthoringDocumentPayload,
  AuthoringDocumentSessionResult,
  QueryAuthoringDocumentsResult,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  SCHEMA_VERSION,
  validate,
  type AuthoringActivationCapability,
  type AuthoringDocumentIntent,
  type CreatorModuleDescriptor,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';

const WORKSPACE_ID = 'wk_authoring_activation';
const CREATOR_ID = 'user_authoring_activation';
const AUTHENTICATED_USER_ID = CREATOR_ID;
const CUSTOMER_ORIGIN = 'https://staging.customer.example';
const STATE = `state-${'s'.repeat(43)}`;
const OTHER_STATE = `state-${'x'.repeat(43)}`;
const CODE_VERIFIER = `verifier-${'v'.repeat(44)}`;
const OTHER_CODE_VERIFIER = `verifier-${'x'.repeat(44)}`;
const baseDocument = tourFixture as LodariqDocument;

const authHeaders = {
  'x-lodariq-workspace-id': WORKSPACE_ID,
  'x-lodariq-user-id': AUTHENTICATED_USER_ID,
};

const creatorModule: CreatorModuleDescriptor = {
  url: `https://cdn.lodariq.io/creator/sha256-${'a'.repeat(64)}/creator.js`,
  version: '1.0.0',
  integrity: 'sha256-YWJjZA==',
};

describe('hosted authoring activation API', () => {
  it('creates, approves, and exchanges one exact-origin request without persisting raw credentials', async () => {
    const repository = createRepository();
    const app = createApiApp({
      repository,
      publicApiBaseUrl: 'https://api.lodariq.io',
      creatorModule,
    });
    const { installationId, bootstrapGrant } = await bootstrapAuthoring(app);

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/sdk/authoring/authorization-requests',
      headers: {
        origin: CUSTOMER_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': `content-type,${AUTHORING_BOOTSTRAP_GRANT_HEADER}`,
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe(CUSTOMER_ORIGIN);
    expect(preflight.headers['access-control-allow-headers']).toContain(
      AUTHORING_BOOTSTRAP_GRANT_HEADER,
    );

    const created = await createAuthorizationRequest(app, {
      installationId,
      bootstrapGrant,
    });
    expect(created.statusCode).toBe(201);
    const authorization = created.json<{
      requestId: string;
      workspaceId: string;
      environment: string;
      state: string;
      expiresAt: string;
    }>();
    expect(authorization).toMatchObject({
      workspaceId: WORKSPACE_ID,
      environment: 'staging',
      state: STATE,
    });

    const storedBeforeApproval = await repository.getAuthoringAuthorizationRequest(
      WORKSPACE_ID,
      authorization.requestId,
    );
    expect(storedBeforeApproval).toMatchObject({
      stateHash: hashAuthoringAuthorizationState(STATE),
      bootstrapGrantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
      authorizationCodeHash: null,
    });
    expect(JSON.stringify(storedBeforeApproval)).not.toContain(STATE);
    expect(JSON.stringify(storedBeforeApproval)).not.toContain(bootstrapGrant);

    const pending = await app.inject({
      method: 'GET',
      url: `/v1/authoring/authorization-requests/${authorization.requestId}`,
      headers: { ...authHeaders, origin: 'https://app.lodariq.io' },
    });
    expect(pending.statusCode).toBe(200);
    expect(pending.headers['access-control-allow-origin']).toBe('https://app.lodariq.io');
    expect(pending.json()).toMatchObject({
      requestId: authorization.requestId,
      installationId,
      environmentId: 'env_staging',
      environment: 'staging',
      customerOrigin: CUSTOMER_ORIGIN,
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS],
    });
    expect(JSON.stringify(pending.json())).not.toMatch(
      /state|challenge|bootstrap|authorizationCode|Hash|workspaceId/i,
    );
    expect(Object.keys(pending.json<Record<string, unknown>>()).sort()).toEqual(
      [
        'customerOrigin',
        'environment',
        'environmentId',
        'expiresAt',
        'installationId',
        'requestId',
        'requestedCapabilities',
      ].sort(),
    );

    const approved = await app.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${authorization.requestId}/approve`,
      headers: authHeaders,
      payload: { state: STATE },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.headers['cache-control']).toBe('no-store');
    const result = approved.json<{
      protocol: string;
      requestId: string;
      state: string;
      authorizationCode: string;
    }>();
    expect(result).toMatchObject({
      protocol: AUTHORING_ACTIVATION_PROTOCOL,
      requestId: authorization.requestId,
      state: STATE,
    });

    const storedAfterApproval = await repository.getAuthoringAuthorizationRequest(
      WORKSPACE_ID,
      authorization.requestId,
    );
    expect(storedAfterApproval?.authorizationCodeHash).toBe(
      hashAuthoringAuthorizationCode(result.authorizationCode),
    );
    expect(JSON.stringify(storedAfterApproval)).not.toContain(result.authorizationCode);

    const exchanged = await exchange(app, {
      installationId,
      bootstrapGrant,
      requestId: authorization.requestId,
      authorizationCode: result.authorizationCode,
    });
    expect(exchanged.statusCode).toBe(200);
    expect(exchanged.headers['cache-control']).toBe('no-store');
    const exchangeResult = exchanged.json<{
      activationGrant: string;
      context: {
        creatorId: string;
        environment: string;
        customerOrigin: string;
        capabilities: string[];
      };
      creatorModule: CreatorModuleDescriptor;
    }>();
    expect(validate(AuthoringCodeExchangeResult, exchangeResult).valid).toBe(true);
    expect(exchangeResult).toMatchObject({
      context: {
        creatorId: CREATOR_ID,
        environment: 'staging',
        customerOrigin: CUSTOMER_ORIGIN,
        capabilities: [AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS],
      },
      creatorModule,
    });

    const storedGrant = await repository.consumeAuthoringActivationGrant({
      installationId,
      exactOrigin: CUSTOMER_ORIGIN,
      grantHash: hashAuthoringActivationGrant(exchangeResult.activationGrant),
    });
    expect(storedGrant?.grantHash).toBe(
      hashAuthoringActivationGrant(exchangeResult.activationGrant),
    );
    expect(JSON.stringify(storedGrant)).not.toContain(exchangeResult.activationGrant);
    expect(JSON.stringify(storedGrant)).not.toContain(result.authorizationCode);
    expect(JSON.stringify(storedGrant)).not.toContain(bootstrapGrant);

    await app.close();
  });

  it('fails closed for wrong origin, grant, state, verifier, duplicate approval, and replay', async () => {
    const app = createApiApp({
      repository: createRepository(),
      publicApiBaseUrl: 'https://api.lodariq.io',
      creatorModule,
    });
    const { installationId, bootstrapGrant } = await bootstrapAuthoring(app);

    const wrongOrigin = await createAuthorizationRequest(app, {
      installationId,
      bootstrapGrant,
      origin: 'https://other.customer.example',
      customerOrigin: 'https://other.customer.example',
    });
    expect(wrongOrigin.statusCode).toBe(403);

    const wrongBootstrapGrant = `lod_bootstrap_${'x'.repeat(40)}`;
    const wrongGrant = await createAuthorizationRequest(app, {
      installationId,
      bootstrapGrant: wrongBootstrapGrant,
    });
    expect(wrongGrant.statusCode).toBe(403);
    expect(wrongGrant.body).not.toContain(wrongBootstrapGrant);

    const created = await createAuthorizationRequest(app, {
      installationId,
      bootstrapGrant,
    });
    expect(created.statusCode).toBe(201);
    const { requestId } = created.json<{ requestId: string }>();

    const wrongApprovalState = await app.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${requestId}/approve`,
      headers: authHeaders,
      payload: { state: OTHER_STATE },
    });
    expect(wrongApprovalState.statusCode).toBe(409);
    expect(wrongApprovalState.body).not.toContain(OTHER_STATE);

    const approved = await app.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${requestId}/approve`,
      headers: authHeaders,
      payload: { state: STATE },
    });
    expect(approved.statusCode).toBe(200);
    const { authorizationCode } = approved.json<{ authorizationCode: string }>();

    const duplicateApproval = await app.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${requestId}/approve`,
      headers: authHeaders,
      payload: { state: STATE },
    });
    expect(duplicateApproval.statusCode).toBe(409);

    const exchangeBase = {
      installationId,
      bootstrapGrant,
      requestId,
      authorizationCode,
    };
    const exchangeWrongGrantValue = `lod_bootstrap_${'y'.repeat(40)}`;
    const exchangeWrongGrant = await exchange(app, {
      ...exchangeBase,
      bootstrapGrant: exchangeWrongGrantValue,
    });
    expect(exchangeWrongGrant.statusCode).toBe(403);
    expect(exchangeWrongGrant.body).not.toContain(exchangeWrongGrantValue);

    const exchangeWrongState = await exchange(app, { ...exchangeBase, state: OTHER_STATE });
    expect(exchangeWrongState.statusCode).toBe(403);
    expect(exchangeWrongState.body).not.toContain(OTHER_STATE);

    const exchangeWrongVerifier = await exchange(app, {
      ...exchangeBase,
      codeVerifier: OTHER_CODE_VERIFIER,
    });
    expect(exchangeWrongVerifier.statusCode).toBe(403);
    expect(exchangeWrongVerifier.body).not.toContain(OTHER_CODE_VERIFIER);
    expect(exchangeWrongVerifier.body).not.toContain(authorizationCode);

    const concurrent = await Promise.all([
      exchange(app, exchangeBase),
      exchange(app, exchangeBase),
    ]);
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([200, 403]);
    const replay = await exchange(app, exchangeBase);
    expect(replay.statusCode).toBe(403);

    await app.close();
  });

  it('rejects production authoring even when corrupt persisted policy claims it is enabled', async () => {
    const installationId = `ins_pub_${'p'.repeat(24)}`;
    const bootstrapGrant = `lod_bootstrap_${'p'.repeat(40)}`;
    const now = new Date().toISOString();
    const repository = createRepository({
      environment: environment('env_production', 'production'),
      publicSdkInstallations: [
        {
          installationId,
          workspaceId: WORKSPACE_ID,
          name: 'Production',
          createdByUserId: CREATOR_ID,
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
          suspendedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId,
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_production',
          exactOrigin: 'https://app.customer.example',
          authoringEnabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      publicSdkBootstrapGrants: [
        {
          id: 'sdkboot_production_corrupt',
          installationId,
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_production',
          exactOrigin: 'https://app.customer.example',
          grantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
          createdAt: now,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          consumedAt: null,
          revokedAt: null,
        },
      ],
    });
    const app = createApiApp({ repository, creatorModule });

    const response = await createAuthorizationRequest(app, {
      installationId,
      bootstrapGrant,
      origin: 'https://app.customer.example',
      customerOrigin: 'https://app.customer.example',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json<{ error: string }>().error).toBe('authoring_origin_forbidden');

    await app.close();
  });

  it('keeps viewer memberships from approving or loading creator authoring', async () => {
    const installationId = `ins_pub_${'v'.repeat(24)}`;
    const now = '2026-08-07T00:00:00.000Z';
    const repository = createRepository({
      workspaceMemberships: [
        {
          workspaceId: WORKSPACE_ID,
          userId: CREATOR_ID,
          role: 'viewer',
          createdAt: now,
        },
      ],
      publicSdkInstallations: [
        {
          installationId,
          workspaceId: WORKSPACE_ID,
          name: 'Viewer-gated staging app',
          createdByUserId: CREATOR_ID,
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
          suspendedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId,
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_staging',
          exactOrigin: CUSTOMER_ORIGIN,
          authoringEnabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const app = createApiApp({ repository, creatorModule });
    const bootstrap = await app.inject({
      method: 'POST',
      url: '/v1/sdk/bootstrap',
      headers: { origin: CUSTOMER_ORIGIN },
      payload: { installationId },
    });
    expect(bootstrap.statusCode).toBe(200);
    const bootstrapGrant = bootstrap.json<{
      authoring: { state: string; bootstrapGrant: string };
    }>().authoring.bootstrapGrant;
    const created = await createAuthorizationRequest(app, { installationId, bootstrapGrant });
    expect(created.statusCode).toBe(201);
    const { requestId } = created.json<{ requestId: string }>();

    const approval = await app.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${requestId}/approve`,
      headers: authHeaders,
      payload: { state: STATE },
    });

    expect(approval.statusCode).toBe(404);
    expect(approval.body).not.toContain('creatorModule');
    await app.close();
  });

  it('fails with 503 before exchange consumption when the creator descriptor is unavailable', async () => {
    const repository = createRepository();
    const configuredApp = createApiApp({ repository, creatorModule });
    const { installationId, bootstrapGrant } = await bootstrapAuthoring(configuredApp);
    const created = await createAuthorizationRequest(configuredApp, {
      installationId,
      bootstrapGrant,
    });
    const { requestId } = created.json<{ requestId: string }>();
    const approved = await configuredApp.inject({
      method: 'POST',
      url: `/v1/authoring/authorization-requests/${requestId}/approve`,
      headers: authHeaders,
      payload: { state: STATE },
    });
    const { authorizationCode } = approved.json<{ authorizationCode: string }>();
    await configuredApp.close();

    const unavailableApp = createApiApp({ repository });
    const unavailable = await exchange(unavailableApp, {
      installationId,
      bootstrapGrant,
      requestId,
      authorizationCode,
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json<{ error: string }>().error).toBe('creator_module_unavailable');
    await unavailableApp.close();

    const invalidDescriptorApp = createApiApp({
      repository,
      creatorModule: {
        ...creatorModule,
        url: 'https://cdn.lodariq.io/creator/creator.js',
      },
    });
    const invalidDescriptor = await exchange(invalidDescriptorApp, {
      installationId,
      bootstrapGrant,
      requestId,
      authorizationCode,
    });
    expect(invalidDescriptor.statusCode).toBe(503);
    await invalidDescriptorApp.close();

    const recoveredApp = createApiApp({ repository, creatorModule });
    const recovered = await exchange(recoveredApp, {
      installationId,
      bootstrapGrant,
      requestId,
      authorizationCode,
    });
    expect(recovered.statusCode).toBe(200);
    await recoveredApp.close();
    /*
     * No per-test timeout. This built four Fastify apps — each registering the
     * whole control plane and its OpenAPI document — under a 10s cap, while the
     * suite's own default is 30s. Nothing it asserts is about timing, so the
     * cap only decided whether a full-suite run was green: it was the single
     * failure in a 2,539-test run, and passed alone every time.
     */
  });

  it('loads the content-addressed creator descriptor from deployment environment values', async () => {
    await withTemporaryEnvironment(
      {
        LODARIQ_CREATOR_MODULE_URL: creatorModule.url,
        LODARIQ_CREATOR_MODULE_VERSION: creatorModule.version,
        LODARIQ_CREATOR_MODULE_INTEGRITY: creatorModule.integrity,
      },
      async () => {
        const app = createApiApp({ repository: createRepository() });
        const { installationId, bootstrapGrant } = await bootstrapAuthoring(app);
        const created = await createAuthorizationRequest(app, {
          installationId,
          bootstrapGrant,
        });
        const { requestId } = created.json<{ requestId: string }>();
        const approved = await app.inject({
          method: 'POST',
          url: `/v1/authoring/authorization-requests/${requestId}/approve`,
          headers: authHeaders,
          payload: { state: STATE },
        });
        const { authorizationCode } = approved.json<{ authorizationCode: string }>();

        const exchanged = await exchange(app, {
          installationId,
          bootstrapGrant,
          requestId,
          authorizationCode,
        });
        expect(exchanged.statusCode).toBe(200);
        expect(exchanged.json<{ creatorModule: CreatorModuleDescriptor }>().creatorModule).toEqual(
          creatorModule,
        );
        await app.close();
      },
    );
  });
});

describe('activation grant document sessions', () => {
  it('creates one server-owned Tour draft and returns its hash-only session bearer only to the editor', async () => {
    const repository = createRepository();
    const app = createApiApp({ repository, creatorModule });
    const documentIntent = { kind: 'new-draft', documentType: 'tour' } as const;
    const activation = await issueActivationGrant(app, {
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
      documentIntent,
    });

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/authoring/sessions',
      headers: {
        origin: 'https://editor.lodariq.io',
        'access-control-request-method': 'POST',
        'access-control-request-headers': `content-type,${AUTHORING_ACTIVATION_GRANT_HEADER}`,
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://editor.lodariq.io');
    expect(preflight.headers['access-control-allow-headers']).toContain(
      AUTHORING_ACTIVATION_GRANT_HEADER,
    );

    const created = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent,
    });
    expect(created.statusCode).toBe(201);
    expect(created.headers['access-control-allow-origin']).toBe('https://editor.lodariq.io');
    expect(created.headers['cache-control']).toBe('no-store');
    const result = created.json<{
      authoringSessionToken: string;
      context: {
        sessionId: string;
        documentId: string;
        workspaceId: string;
        environmentId: string;
        environment: string;
        customerOrigin: string;
        editorOrigin: string;
        creatorId: string;
        capabilities: string[];
        compilerVersion: string;
        rendererContractVersion: string;
        themeContractVersion: string;
        themeVersionId: string;
      };
    }>();
    expect(validate(AuthoringDocumentSessionResult, result).valid).toBe(true);
    expect(result.context).toMatchObject({
      workspaceId: WORKSPACE_ID,
      environmentId: 'env_staging',
      environment: 'staging',
      customerOrigin: CUSTOMER_ORIGIN,
      editorOrigin: 'https://editor.lodariq.io',
      creatorId: CREATOR_ID,
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    });
    expect(result.context.capabilities).toHaveLength(
      Object.keys(AUTHORING_SESSION_CAPABILITIES).length,
    );
    expect(result.context.capabilities).toEqual(
      expect.arrayContaining(Object.values(AUTHORING_SESSION_CAPABILITIES)),
    );

    const document = await repository.getDocument(WORKSPACE_ID, result.context.documentId);
    expect(document?.document).toMatchObject({
      id: result.context.documentId,
      workspaceId: WORKSPACE_ID,
      type: 'tour',
      status: 'draft',
      title: 'Untitled tour',
      schemaVersion: SCHEMA_VERSION,
      trigger: {
        type: 'urlMatch',
        config: { pattern: `${CUSTOMER_ORIGIN}/projects/123`, mode: 'exact' },
      },
    });
    expect(document?.document.blocks).toEqual([]);
    expect(document?.document.targets).toEqual([]);

    const persistedSession = await repository.resolveAuthoringSession(
      WORKSPACE_ID,
      hashAuthoringSessionToken(result.authoringSessionToken),
    );
    expect(persistedSession).toMatchObject({
      id: result.context.sessionId,
      documentId: result.context.documentId,
      tokenHash: hashAuthoringSessionToken(result.authoringSessionToken),
      installationId: activation.installationId,
      customerOrigin: CUSTOMER_ORIGIN,
    });
    expect(JSON.stringify(persistedSession)).not.toContain(result.authoringSessionToken);
    expect(JSON.stringify(persistedSession)).not.toContain(activation.activationGrant);

    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/authoring/sessions/${result.context.sessionId}/revoke`,
      headers: {
        origin: 'https://editor.lodariq.io',
        [AUTHORING_SESSION_HEADER]: result.authoringSessionToken,
      },
    });
    expect(revoked.statusCode).toBe(204);
    const repeatedRevoke = await app.inject({
      method: 'POST',
      url: `/v1/authoring/sessions/${result.context.sessionId}/revoke`,
      headers: {
        origin: 'https://editor.lodariq.io',
        [AUTHORING_SESSION_HEADER]: result.authoringSessionToken,
      },
    });
    expect(repeatedRevoke.statusCode).toBe(204);
    await expect(
      repository.resolveAuthoringSessionByTokenHash(
        hashAuthoringSessionToken(result.authoringSessionToken),
      ),
    ).resolves.toBeNull();

    const replay = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent,
    });
    expect(replay.statusCode).toBe(403);
    expect(replay.body).not.toContain(activation.activationGrant);
    expect(
      (await repository.listDocuments(WORKSPACE_ID)).filter((item) => item.type === 'tour'),
    ).toHaveLength(1);

    await app.close();
  });

  it.each(['announcement', 'hotspot', 'survey', 'checklist'] as const)(
    'creates a tenant-scoped hosted %s draft through the same activation exchange',
    async (documentType) => {
      const repository = createRepository();
      const app = createApiApp({ repository, creatorModule });
      const documentIntent = { kind: 'new-draft', documentType } as const;
      const activation = await issueActivationGrant(app, {
        requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
        documentIntent,
      });
      const created = await createActivatedSession(app, {
        installationId: activation.installationId,
        activationGrant: activation.activationGrant,
        documentIntent,
      });

      expect(created.statusCode).toBe(201);
      const result = created.json<{ context: { documentId: string } }>();
      const persisted = await repository.getDocument(WORKSPACE_ID, result.context.documentId);
      expect(persisted?.document).toMatchObject({
        workspaceId: WORKSPACE_ID,
        type: documentType,
        status: 'draft',
        experience: { type: documentType },
      });
      expect(await repository.getDocument('wk_other_tenant', result.context.documentId)).toBeNull();
      await app.close();
    },
  );

  it('queries page and workspace experience summaries without consuming the activation grant', async () => {
    const pageDocument: LodariqDocument = {
      ...existingDocument('doc_page'),
      title: 'Page tour',
      trigger: {
        type: 'urlMatch',
        config: { pattern: `${CUSTOMER_ORIGIN}/projects/123`, mode: 'exact' },
      },
    };
    const globalDocument: LodariqDocument = {
      ...existingDocument('doc_global'),
      title: 'Global tour',
      trigger: { type: 'pageLoad' },
    };
    const manualDocument: LodariqDocument = {
      ...existingDocument('doc_manual'),
      title: 'Manual tour',
    };
    const pageAnnouncement: LodariqDocument = {
      ...existingDocument('doc_page_announcement'),
      type: 'announcement',
      title: 'Page announcement',
      experience: {
        type: 'announcement',
        frequency: 'session',
        dismissible: true,
      },
      surfaceForm: 'banner',
      blocks: [],
      trigger: {
        type: 'urlMatch',
        config: { pattern: `${CUSTOMER_ORIGIN}/projects/123`, mode: 'exact' },
      },
    };
    const repository = createRepository({
      documents: [pageDocument, pageAnnouncement, globalDocument, manualDocument],
    });
    const app = createApiApp({ repository, creatorModule });
    const activation = await issueActivationGrant(app, {
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS],
    });
    const request = async (scope: 'page' | 'workspace') =>
      app.inject({
        method: 'POST',
        url: '/v1/authoring/documents/query',
        headers: {
          origin: 'https://editor.lodariq.io',
          [AUTHORING_ACTIVATION_GRANT_HEADER]: activation.activationGrant,
        },
        payload: {
          installationId: activation.installationId,
          customerOrigin: CUSTOMER_ORIGIN,
          scope,
          pageContext: { pathname: '/projects/123' },
        },
      });

    const page = await request('page');
    expect(page.statusCode).toBe(200);
    const pageResult = page.json();
    expect(validate(QueryAuthoringDocumentsResult, pageResult).valid).toBe(true);
    expect(pageResult.documents.map((document: { id: string }) => document.id)).toEqual(
      expect.arrayContaining([pageDocument.id, globalDocument.id]),
    );
    expect(pageResult.documents).toContainEqual(
      expect.objectContaining({ id: pageAnnouncement.id, type: 'announcement' }),
    );
    expect(pageResult.documents.map((document: { id: string }) => document.id)).not.toContain(
      manualDocument.id,
    );

    const workspace = await request('workspace');
    expect(workspace.statusCode).toBe(200);
    expect(
      workspace.json<{ documents: Array<{ id: string }> }>().documents.map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining([
        pageDocument.id,
        pageAnnouncement.id,
        globalDocument.id,
        manualDocument.id,
      ]),
    );
    await app.close();
  });

  it('revokes an unused activation grant without revealing whether cleanup was replayed', async () => {
    const repository = createRepository();
    const app = createApiApp({ repository, creatorModule });
    const documentIntent = { kind: 'new-draft', documentType: 'tour' } as const;
    const activation = await issueActivationGrant(app, {
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
      documentIntent,
    });
    const revoke = () =>
      app.inject({
        method: 'POST',
        url: '/v1/authoring/activation/revoke',
        headers: {
          origin: 'https://editor.lodariq.io',
          [AUTHORING_ACTIVATION_GRANT_HEADER]: activation.activationGrant,
        },
        payload: {
          installationId: activation.installationId,
          customerOrigin: CUSTOMER_ORIGIN,
        },
      });

    expect((await revoke()).statusCode).toBe(204);
    expect((await revoke()).statusCode).toBe(204);
    const rejected = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent,
    });
    expect(rejected.statusCode).toBe(403);
    await app.close();
  });

  it('rejects wrong editor origins and mismatched document scope without burning the grant', async () => {
    const targetDocument = existingDocument('doc_target');
    const otherDocument = existingDocument('doc_other');
    const repository = createRepository({ documents: [targetDocument, otherDocument] });
    const app = createApiApp({ repository, creatorModule });
    const targetIntent = {
      kind: 'existing',
      documentId: targetDocument.id,
      workspace: 'flowMap',
      focusBlockId: 'step_target',
    } as const;
    const activation = await issueActivationGrant(app, {
      requestedCapabilities: [
        AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS,
        AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT,
      ],
      documentIntent: targetIntent,
    });

    const missingGrant = await app.inject({
      method: 'POST',
      url: '/v1/authoring/sessions',
      headers: { origin: 'https://editor.lodariq.io' },
      payload: {
        installationId: activation.installationId,
        customerOrigin: CUSTOMER_ORIGIN,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'workspace',
        documentIntent: targetIntent,
      },
    });
    expect(missingGrant.statusCode).toBe(401);
    expect(missingGrant.headers['access-control-allow-origin']).toBe('https://editor.lodariq.io');

    const wrongOrigin = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent: targetIntent,
      editorOrigin: CUSTOMER_ORIGIN,
    });
    expect(wrongOrigin.statusCode).toBe(403);
    expect(wrongOrigin.headers['access-control-allow-origin']).toBeUndefined();

    const missingOrigin = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent: targetIntent,
      editorOrigin: null,
    });
    expect(missingOrigin.statusCode).toBe(403);

    const wrongScope = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent: { kind: 'existing', documentId: otherDocument.id },
    });
    expect(wrongScope.statusCode).toBe(403);
    expect(wrongScope.body).not.toContain(activation.activationGrant);

    const strippedWorkspace = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent: { kind: 'existing', documentId: targetDocument.id },
    });
    expect(strippedWorkspace.statusCode).toBe(403);

    const valid = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent: targetIntent,
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json<{ context: { documentId: string } }>().context.documentId).toBe(
      targetDocument.id,
    );

    const replay = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent: targetIntent,
    });
    expect(replay.statusCode).toBe(403);

    await app.close();
  });

  it('rejects a corrupt production-scoped activation grant without creating a document or session', async () => {
    const installationId = `ins_pub_${'q'.repeat(24)}`;
    const activationGrant = `lod_activation_${'q'.repeat(40)}`;
    const productionOrigin = 'https://app.customer.example';
    const now = new Date().toISOString();
    const repository = createRepository({
      environment: environment('env_production', 'production'),
      publicSdkInstallations: [
        {
          installationId,
          workspaceId: WORKSPACE_ID,
          name: 'Corrupt production installation',
          createdByUserId: CREATOR_ID,
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
          suspendedAt: null,
        },
      ],
      publicSdkInstallationOrigins: [
        {
          installationId,
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_production',
          exactOrigin: productionOrigin,
          authoringEnabled: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      authoringActivationGrants: [
        {
          grantId: 'authgrant_corrupt_production',
          requestId: 'authreq_corrupt_production',
          installationId,
          workspaceId: WORKSPACE_ID,
          environmentId: 'env_production',
          environment: 'staging',
          exactOrigin: productionOrigin,
          creatorId: CREATOR_ID,
          capabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
          documentIntent: { kind: 'new-draft', documentType: 'tour' },
          grantHash: hashAuthoringActivationGrant(activationGrant),
          createdAt: now,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          usedAt: null,
          revokedAt: null,
        },
      ],
    });
    const app = createApiApp({ repository, creatorModule });

    const response = await createActivatedSession(app, {
      installationId,
      activationGrant,
      customerOrigin: productionOrigin,
      documentIntent: { kind: 'new-draft', documentType: 'tour' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.body).not.toContain(activationGrant);
    expect(await repository.listDocuments(WORKSPACE_ID)).toHaveLength(0);

    await app.close();
  });

  it('loads and saves the activated draft with only the editor-owned session bearer', async () => {
    const repository = createRepository();
    const translateTexts = vi.fn(async ({ texts }: { texts: readonly string[] }) => ({
      texts: texts.map((text) => `FR:${text}`),
      usage: {
        provider: 'test-translator',
        usageUnit: 'characters' as const,
        inputUnits: texts.reduce((total, text) => total + text.length, 0),
        outputUnits: texts.reduce((total, text) => total + text.length + 3, 0),
        providerCostMicros: 400,
      },
    }));
    const app = createApiApp({
      repository,
      creatorModule,
      authoringTranslationProvider: { translateTexts },
      observability: {
        emit: () => {
          throw new Error('telemetry unavailable');
        },
      },
    });
    const documentIntent = { kind: 'new-draft', documentType: 'tour' } as const;
    const activation = await issueActivationGrant(app, {
      requestedCapabilities: [AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT],
      documentIntent,
    });
    const created = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent,
    });
    const session = created.json<{
      authoringSessionToken: string;
      context: { sessionId: string; documentId: string; translation?: { state: string } };
    }>();
    expect(session.context.translation).toEqual({ state: 'available' });
    const editorHeaders = {
      origin: 'https://editor.lodariq.io',
      [AUTHORING_SESSION_HEADER]: session.authoringSessionToken,
    };

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/v1/authoring/document',
      headers: {
        origin: 'https://editor.lodariq.io',
        'access-control-request-method': 'POST',
        'access-control-request-headers': `content-type,${AUTHORING_SESSION_HEADER}`,
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://editor.lodariq.io');
    expect(preflight.headers['access-control-allow-headers']).toContain(AUTHORING_SESSION_HEADER);

    const loaded = await app.inject({
      method: 'GET',
      url: '/v1/authoring/document',
      headers: editorHeaders,
    });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.headers['cache-control']).toBe('no-store');
    const payload = loaded.json<{ document: LodariqDocument }>();
    expect(validate(AuthoringDocumentPayload, payload).valid).toBe(true);
    expect(payload.document.id).toBe(session.context.documentId);

    const emptyResources = await app.inject({
      method: 'GET',
      url: '/v1/authoring/resources',
      headers: editorHeaders,
    });
    expect(emptyResources.statusCode).toBe(200);
    expect(emptyResources.json()).toEqual({ recipes: [], checkpoints: [], assets: [] });

    const uploadedAsset = await app.inject({
      method: 'POST',
      url: '/v1/authoring/media-assets',
      headers: editorHeaders,
      payload: {
        kind: 'image',
        filename: 'preview.gif',
        contentType: 'image/gif',
        contentBase64: Buffer.from('GIF89a', 'ascii').toString('base64'),
        savedToLibrary: true,
      },
    });
    expect(uploadedAsset.statusCode, uploadedAsset.body).toBe(201);
    const asset = uploadedAsset.json<{
      id: string;
      downloadPath: string;
      savedToLibrary: boolean;
    }>();
    expect(asset).toMatchObject({
      downloadPath: `/v1/authoring/media-assets/${asset.id}`,
      savedToLibrary: true,
    });

    const authoringAsset = await app.inject({
      method: 'GET',
      url: asset.downloadPath,
      headers: editorHeaders,
    });
    expect(authoringAsset.statusCode).toBe(200);
    expect(authoringAsset.headers['content-type']).toContain('image/gif');

    const unpublishedAsset = await app.inject({
      method: 'GET',
      url: `/v1/sdk/media-assets/${asset.id}`,
    });
    expect(unpublishedAsset.statusCode).toBe(404);

    await repository.publishAuthoringMediaAssets(WORKSPACE_ID, [asset.id]);
    const publishedAsset = await app.inject({
      method: 'GET',
      url: `/v1/sdk/media-assets/${asset.id}`,
    });
    expect(publishedAsset.statusCode).toBe(200);
    expect(publishedAsset.headers['cache-control']).toContain('immutable');

    const savedResources = await app.inject({
      method: 'PUT',
      url: '/v1/authoring/resources',
      headers: editorHeaders,
      payload: {
        recipes: [],
        checkpoints: [
          {
            id: 'checkpoint-hosted-api',
            name: 'Before hosted edit',
            createdAt: '2026-08-14T10:00:00.000Z',
            document: payload.document,
          },
        ],
      },
    });
    expect(savedResources.statusCode, savedResources.body).toBe(200);
    expect(savedResources.json()).toMatchObject({
      checkpoints: [{ id: 'checkpoint-hosted-api', name: 'Before hosted edit' }],
      assets: [{ id: asset.id, kind: 'image', savedToLibrary: true }],
    });

    const updatedDocument = {
      ...payload.document,
      title: 'Persisted from the hosted editor',
      targets: structuredClone(baseDocument.targets),
      blocks: structuredClone(baseDocument.blocks),
    };
    const saved = await app.inject({
      method: 'POST',
      url: '/v1/authoring/document',
      headers: editorHeaders,
      payload: { document: updatedDocument },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.headers['cache-control']).toBe('no-store');
    expect(saved.json<{ document: LodariqDocument }>().document.title).toBe(
      'Persisted from the hosted editor',
    );
    expect(saved.body).not.toContain(session.authoringSessionToken);

    const lockedDocument = structuredClone(updatedDocument);
    const lockedHeading = (
      lockedDocument.blocks[0] as {
        children: Array<{ children: Array<{ content?: string }> }>;
      }
    ).children[0]?.children[0];
    if (!lockedHeading) throw new Error('hosted fixture heading missing');
    lockedHeading.content = 'A conflicting edit';
    await repository.claimExperienceStepLock({
      workspaceId: WORKSPACE_ID,
      documentId: session.context.documentId,
      stepId: lockedDocument.blocks[0]!.id,
      holderUserId: 'user_other_creator',
      holderName: 'Another creator',
      sessionId: 'authsess_other_editor',
    });
    const lockedSave = await app.inject({
      method: 'POST',
      url: '/v1/authoring/document',
      headers: editorHeaders,
      payload: { document: lockedDocument },
    });
    expect(lockedSave.statusCode).toBe(409);
    expect(lockedSave.json()).toMatchObject({
      error: 'step_lock_conflict',
      stepId: lockedDocument.blocks[0]!.id,
      holderName: 'Another creator',
    });
    await repository.releaseExperienceStepLock({
      workspaceId: WORKSPACE_ID,
      documentId: session.context.documentId,
      stepId: lockedDocument.blocks[0]!.id,
      holderUserId: 'user_other_creator',
      holderName: '',
      sessionId: 'authsess_other_editor',
    });

    const translated = await app.inject({
      method: 'POST',
      url: '/v1/authoring/document/translation',
      headers: editorHeaders,
      payload: {
        operationId: `aiop_${'l'.repeat(20)}`,
        document: updatedDocument,
        targetLocale: 'fr',
        mode: 'missing',
      },
    });
    expect(translated.statusCode, translated.body).toBe(200);
    expect(translated.json<{ document: LodariqDocument }>().document.localization).toMatchObject({
      defaultLocale: 'en',
      variants: [{ locale: 'fr', title: 'FR:Persisted from the hosted editor' }],
    });
    expect(translateTexts).toHaveBeenCalledOnce();
    await expect(repository.readWorkspaceCommercialUsage(WORKSPACE_ID)).resolves.toMatchObject({
      aiCredits: { used: 1, limit: 15_000 },
    });

    const reloaded = await app.inject({
      method: 'GET',
      url: '/v1/authoring/document',
      headers: editorHeaders,
    });
    expect(reloaded.json<{ document: LodariqDocument }>().document.title).toBe(
      'Persisted from the hosted editor',
    );
    await expect(
      repository.getDocument(WORKSPACE_ID, session.context.documentId),
    ).resolves.toMatchObject({ document: { title: 'Persisted from the hosted editor' } });

    const alternateTheme = await repository.createWorkspaceTheme({
      workspaceId: WORKSPACE_ID,
      name: 'Alternate approved theme',
      draft: structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.definition),
      actorUserId: CREATOR_ID,
    });
    const alternateApproval = await repository.approveWorkspaceTheme({
      workspaceId: WORKSPACE_ID,
      themeId: alternateTheme.id,
      actorUserId: CREATOR_ID,
      expectedRevision: alternateTheme.revision,
      expectedUpdatedAt: alternateTheme.updatedAt,
    });
    if (!alternateApproval) throw new Error('alternate theme approval failed');
    const incompatibleSave = await app.inject({
      method: 'POST',
      url: '/v1/authoring/document',
      headers: editorHeaders,
      payload: {
        document: {
          ...updatedDocument,
          title: 'Must not persist across a compatibility change',
          themeBinding: {
            policy: 'pinned',
            themeId: alternateTheme.id,
            themeVersionId: alternateApproval.approvedVersion.id,
          },
        },
      },
    });
    expect(incompatibleSave.statusCode).toBe(409);
    expect(incompatibleSave.json()).toMatchObject({
      error: 'authoring_session_compatibility_changed',
    });
    await expect(
      repository.getDocument(WORKSPACE_ID, session.context.documentId),
    ).resolves.toMatchObject({ document: { title: 'Persisted from the hosted editor' } });

    const wrongOrigin = await app.inject({
      method: 'GET',
      url: '/v1/authoring/document',
      headers: { ...editorHeaders, origin: CUSTOMER_ORIGIN },
    });
    expect(wrongOrigin.statusCode).toBe(403);
    const wrongToken = await app.inject({
      method: 'GET',
      url: '/v1/authoring/document',
      headers: {
        origin: 'https://editor.lodariq.io',
        [AUTHORING_SESSION_HEADER]: `lod_authoring_${'x'.repeat(48)}`,
      },
    });
    expect(wrongToken.statusCode).toBe(401);

    await app.close();
  });

  it('publishes the saved hosted draft to staging without leaving the editor', async () => {
    const document = existingDocument('doc_hosted_release');
    const repository = createRepository({ documents: [document] });
    const app = createApiApp({ repository, creatorModule });
    const documentIntent = { kind: 'existing', documentId: document.id } as const;
    const activation = await issueActivationGrant(app, {
      requestedCapabilities: [
        AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS,
        AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT,
      ],
      documentIntent,
    });
    const created = await createActivatedSession(app, {
      installationId: activation.installationId,
      activationGrant: activation.activationGrant,
      documentIntent,
    });
    expect(created.statusCode, created.body).toBe(201);
    const session = created.json<{
      authoringSessionToken: string;
      context: { capabilities: string[] };
    }>();
    expect(session.context.capabilities).toContain(AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING);
    expect(session.context.capabilities).toContain(
      AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
    );
    expect(session.context.capabilities).toContain('document:publish-staging');
    const editorHeaders = {
      origin: 'https://editor.lodariq.io',
      [AUTHORING_SESSION_HEADER]: session.authoringSessionToken,
    };

    const saved = await app.inject({
      method: 'POST',
      url: '/v1/authoring/document',
      headers: editorHeaders,
      payload: { document },
    });
    expect(saved.statusCode).toBe(200);
    const before = await app.inject({
      method: 'GET',
      url: '/v1/authoring/release-state',
      headers: editorHeaders,
    });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({
      available: true,
      documentId: document.id,
      expectedGeneration: 0,
      state: 'ready',
      activeContentHash: null,
    });
    const reviewedState = before.json<{
      expectedGeneration: number;
      draftArtifactId: string | null;
      draftContentHash: string | null;
    }>();
    const reviewedArtifactId = reviewedState.draftArtifactId;
    const reviewedContentHash = reviewedState.draftContentHash;
    if (!reviewedArtifactId || !reviewedContentHash) {
      throw new Error('Hosted release state has no reviewed artifact');
    }

    const editedAfterReview = withParagraphContent(
      document,
      'This draft changed after the creator reviewed the staging release state.',
    );
    const editedSave = await app.inject({
      method: 'POST',
      url: '/v1/authoring/document',
      headers: editorHeaders,
      payload: { document: editedAfterReview },
    });
    expect(editedSave.statusCode).toBe(200);

    const published = await app.inject({
      method: 'POST',
      url: '/v1/authoring/publications',
      headers: {
        ...editorHeaders,
        'idempotency-key': 'release:hosted-editor:1',
        'x-lodariq-correlation-id': 'corr_hosted_editor_release_1',
      },
      payload: {
        expectedGeneration: reviewedState.expectedGeneration,
        expectedArtifactId: reviewedArtifactId,
        expectedContentHash: reviewedContentHash,
      },
    });
    expect(published.statusCode).toBe(201);
    expect(published.json()).toMatchObject({
      replayed: false,
      deployment: { documentId: document.id, generation: 1, state: 'active' },
      publication: {
        documentId: document.id,
        compiledArtifactId: reviewedArtifactId,
        contentHash: reviewedContentHash,
        action: 'publish',
      },
      visualCheck: { status: expect.stringMatching(/^(passed|warnings)$/) },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/v1/authoring/release-state',
      headers: editorHeaders,
    });
    expect(after.statusCode).toBe(200);
    const afterState = after.json<{
      expectedGeneration: number;
      draftContentHash: string;
      activeContentHash: string;
      state: string;
    }>();
    expect(afterState).toMatchObject({
      expectedGeneration: 1,
      state: 'ready',
      activeContentHash: reviewedContentHash,
    });
    expect(afterState.draftContentHash).not.toBe(reviewedContentHash);
    await app.close();
  });
});

type RepositorySeed = Parameters<typeof createInMemoryControlPlaneRepository>[0];

function createRepository(
  additions: Partial<RepositorySeed> & { environment?: WorkspaceEnvironment } = {},
): ControlPlaneRepository {
  const now = '2026-08-07T00:00:00.000Z';
  const { environment: selectedEnvironment, ...seedAdditions } = additions;
  return createInMemoryControlPlaneRepository({
    users: [
      {
        id: CREATOR_ID,
        legacyIdentityId: null,
        email: 'creator@lodariq.test',
        createdAt: now,
      },
    ],
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
        createdAt: now,
        updatedAt: now,
      },
    ],
    workspaceMemberships: [
      {
        workspaceId: WORKSPACE_ID,
        userId: CREATOR_ID,
        role: 'admin',
        createdAt: now,
      },
    ],
    environments: [environment('env_staging', 'staging')],
    ...seedAdditions,
    ...(selectedEnvironment ? { environments: [selectedEnvironment] } : {}),
  });
}

async function bootstrapAuthoring(app: ReturnType<typeof createApiApp>): Promise<{
  installationId: string;
  bootstrapGrant: string;
}> {
  const installation = await app.inject({
    method: 'POST',
    url: '/v1/sdk-installations',
    headers: authHeaders,
    payload: { name: 'Customer app' },
  });
  expect(installation.statusCode).toBe(201);
  const installationId = installation.json<{
    installation: { installationId: string };
  }>().installation.installationId;

  const mapping = await app.inject({
    method: 'PUT',
    url: `/v1/sdk-installations/${installationId}/origins`,
    headers: authHeaders,
    payload: {
      environmentId: 'env_staging',
      origin: CUSTOMER_ORIGIN,
      authoringEnabled: true,
    },
  });
  expect(mapping.statusCode, mapping.body).toBe(200);

  const bootstrap = await app.inject({
    method: 'POST',
    url: '/v1/sdk/bootstrap',
    headers: { origin: CUSTOMER_ORIGIN },
    payload: { installationId },
  });
  expect(bootstrap.statusCode).toBe(200);
  expect(bootstrap.headers['cache-control']).toBe('no-store');
  const body = bootstrap.json<{
    authoring: { state: string; bootstrapGrant: string };
  }>();
  expect(body.authoring.state).toBe('available');
  return { installationId, bootstrapGrant: body.authoring.bootstrapGrant };
}

function createAuthorizationRequest(
  app: ReturnType<typeof createApiApp>,
  input: {
    installationId: string;
    bootstrapGrant: string;
    origin?: string;
    customerOrigin?: string;
    requestedCapabilities?: AuthoringActivationCapability[];
    documentIntent?: AuthoringDocumentIntent;
  },
) {
  return app.inject({
    method: 'POST',
    url: '/v1/sdk/authoring/authorization-requests',
    headers: {
      origin: input.origin ?? CUSTOMER_ORIGIN,
      [AUTHORING_BOOTSTRAP_GRANT_HEADER]: input.bootstrapGrant,
    },
    payload: {
      installationId: input.installationId,
      customerOrigin: input.customerOrigin ?? CUSTOMER_ORIGIN,
      state: STATE,
      codeChallenge: deriveAuthoringPkceS256Challenge(CODE_VERIFIER),
      codeChallengeMethod: 'S256',
      requestedCapabilities: input.requestedCapabilities ?? [
        AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS,
      ],
      ...(input.documentIntent ? { documentIntent: input.documentIntent } : {}),
    },
  });
}

function exchange(
  app: ReturnType<typeof createApiApp>,
  input: {
    installationId: string;
    bootstrapGrant: string;
    requestId: string;
    authorizationCode: string;
    state?: string;
    codeVerifier?: string;
  },
) {
  return app.inject({
    method: 'POST',
    url: '/v1/sdk/authoring/exchange',
    headers: {
      origin: CUSTOMER_ORIGIN,
      [AUTHORING_BOOTSTRAP_GRANT_HEADER]: input.bootstrapGrant,
    },
    payload: {
      installationId: input.installationId,
      customerOrigin: CUSTOMER_ORIGIN,
      requestId: input.requestId,
      state: input.state ?? STATE,
      authorizationCode: input.authorizationCode,
      codeVerifier: input.codeVerifier ?? CODE_VERIFIER,
    },
  });
}

async function issueActivationGrant(
  app: ReturnType<typeof createApiApp>,
  input: {
    requestedCapabilities: AuthoringActivationCapability[];
    documentIntent?: AuthoringDocumentIntent;
  },
): Promise<{ installationId: string; activationGrant: string }> {
  const { installationId, bootstrapGrant } = await bootstrapAuthoring(app);
  const created = await createAuthorizationRequest(app, {
    installationId,
    bootstrapGrant,
    requestedCapabilities: input.requestedCapabilities,
    ...(input.documentIntent ? { documentIntent: input.documentIntent } : {}),
  });
  expect(created.statusCode).toBe(201);
  const { requestId } = created.json<{ requestId: string }>();

  const approved = await app.inject({
    method: 'POST',
    url: `/v1/authoring/authorization-requests/${requestId}/approve`,
    headers: authHeaders,
    payload: { state: STATE },
  });
  expect(approved.statusCode).toBe(200);
  const { authorizationCode } = approved.json<{ authorizationCode: string }>();

  const exchanged = await exchange(app, {
    installationId,
    bootstrapGrant,
    requestId,
    authorizationCode,
  });
  expect(exchanged.statusCode).toBe(200);
  return {
    installationId,
    activationGrant: exchanged.json<{ activationGrant: string }>().activationGrant,
  };
}

function createActivatedSession(
  app: ReturnType<typeof createApiApp>,
  input: {
    installationId: string;
    activationGrant: string;
    documentIntent: AuthoringDocumentIntent;
    customerOrigin?: string;
    editorOrigin?: string | null;
    pageContext?: { pathname: string };
    selectionScope?: 'page' | 'workspace';
  },
) {
  const headers: Record<string, string> = {
    [AUTHORING_ACTIVATION_GRANT_HEADER]: input.activationGrant,
  };
  if (input.editorOrigin !== null) {
    headers.origin = input.editorOrigin ?? 'https://editor.lodariq.io';
  }

  return app.inject({
    method: 'POST',
    url: '/v1/authoring/sessions',
    headers,
    payload: {
      installationId: input.installationId,
      customerOrigin: input.customerOrigin ?? CUSTOMER_ORIGIN,
      pageContext: input.pageContext ?? { pathname: '/projects/123' },
      selectionScope:
        input.selectionScope ?? (input.documentIntent.kind === 'new-draft' ? 'page' : 'workspace'),
      documentIntent: input.documentIntent,
    },
  });
}

function existingDocument(documentId: string): LodariqDocument {
  return {
    ...structuredClone(baseDocument),
    id: documentId,
    workspaceId: WORKSPACE_ID,
    status: 'draft',
    audience: { environments: ['staging'] },
  };
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

function environment(id: string, kind: WorkspaceEnvironment['kind']): WorkspaceEnvironment {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    kind,
    name: kind,
    originAllowlist: [CUSTOMER_ORIGIN],
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  };
}

async function withTemporaryEnvironment(
  values: Record<string, string>,
  callback: () => Promise<void>,
): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
