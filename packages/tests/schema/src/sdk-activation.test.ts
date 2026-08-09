import { describe, expect, it } from 'vitest';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  AUTHORING_ACTIVATION_GRANT_HEADER,
  AUTHORING_ACTIVATION_PROTOCOL,
  AUTHORING_BOOTSTRAP_GRANT_HEADER,
  AUTHORING_PKCE_CHALLENGE_METHOD,
  AUTHORING_SESSION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  AuthoringActivationGrantContext,
  AuthoringActivationGrantHeaders,
  AuthoringAuthorizationContext,
  AuthoringAuthorizationRequest,
  AuthoringAuthorizationResult,
  AuthoringBootstrapGrantHeaders,
  AuthoringCodeExchangeRequest,
  AuthoringCodeExchangeResult,
  AuthoringDocumentSessionResult,
  AuthoringDocumentPayload,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringPageContext,
  AuthoringPageDocumentSummary,
  AuthoringSessionContext,
  AvailableAuthoringActivationDescriptor,
  CreateAuthoringDocumentSessionRequest,
  CreatorModuleDescriptor,
  DocumentScopedSdkDeliveryDescriptor,
  LODARIQ_APP_ORIGIN,
  LODARIQ_AUTHORING_ACTIVATION_URL,
  LODARIQ_EDITOR_ORIGIN,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  PublicSdkBootstrapContext,
  PublicSdkBootstrapRequest,
  QueryAuthoringDocumentsRequest,
  QueryAuthoringDocumentsResult,
  RENDERER_CONTRACT_VERSION,
  RevokeAuthoringActivationRequest,
  SdkBootstrapRequest,
  SdkAuthoringReleaseDescriptor,
  SdkInstallContext,
  validate,
} from '@lodariq/schema';

const INSTALLATION_ID = 'ins_pub_application_1234';
const CUSTOMER_ORIGIN = 'https://staging.customer.example';
const BOOTSTRAP_GRANT = 'bootstrap-grant-'.padEnd(48, 'b');
const ACTIVATION_GRANT = 'activation-grant-'.padEnd(48, 'a');
const SESSION_TOKEN = 'authoring-session-'.padEnd(48, 's');
const AUTHORIZATION_CODE = 'authorization-code-'.padEnd(48, 'c');
const STATE = 'state-'.padEnd(48, 's');
const CODE_CHALLENGE = 'challenge-'.padEnd(48, 'c');
const CODE_VERIFIER = 'verifier-'.padEnd(48, 'v');
const EXPIRES_AT = '2026-08-07T12:02:00.000Z';

const activationCapabilities = [
  AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS,
  AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT,
] as const;

const sessionCapabilities = [
  AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
  AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
  AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
  AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET,
] as const;

const availableActivation = {
  state: 'available' as const,
  appOrigin: LODARIQ_APP_ORIGIN,
  activationUrl: LODARIQ_AUTHORING_ACTIVATION_URL,
  authorizationRequestUrl: 'https://api.lodariq.com/v1/sdk/authoring/authorization-requests',
  exchangeUrl: 'https://api.lodariq.com/v1/sdk/authoring/exchange',
  bootstrapGrant: BOOTSTRAP_GRANT,
  bootstrapGrantExpiresAt: EXPIRES_AT,
};

const creatorModule = {
  url: `https://cdn.lodariq.com/creator/sha256-${'a'.repeat(64)}/creator.js`,
  version: '1.0.0',
  integrity: 'sha256-YWJjZA==',
};

const bootstrapBase = {
  installationId: INSTALLATION_ID,
  environmentId: 'env_staging',
  customerOrigin: CUSTOMER_ORIGIN,
  correlationId: 'bootstrap_123',
  delivery: { state: 'unavailable' as const },
};

const activeManifest = (documentId: string, suffix: string) => ({
  schemaVersion: '2' as const,
  workspaceId: 'workspace_123',
  environmentId: 'env_staging',
  documentId,
  state: 'active' as const,
  generation: 2,
  publicationId: `publication_${suffix}`,
  activatedAt: '2026-08-07T12:00:00.000Z',
  artifact: {
    artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    contentHash: `sha256-${suffix.repeat(64)}`,
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: 'theme_version_123',
    themeContentHash: `sha256-${'a'.repeat(64)}`,
    url: `https://api.lodariq.com/v1/sdk/workspaces/workspace_123/environments/env_staging/documents/${documentId}/artifacts/sha256-${suffix.repeat(64)}`,
    integrity: `sha256-${'A'.repeat(43)}=`,
  },
});

const authorizationContext = {
  requestId: 'authorization_request_123',
  installationId: INSTALLATION_ID,
  workspaceId: 'workspace_123',
  environmentId: 'env_staging',
  environment: 'staging' as const,
  customerOrigin: CUSTOMER_ORIGIN,
  state: STATE,
  codeChallenge: CODE_CHALLENGE,
  codeChallengeMethod: AUTHORING_PKCE_CHALLENGE_METHOD,
  requestedCapabilities: activationCapabilities,
  documentIntent: { kind: 'existing' as const, documentId: 'document_123' },
  expiresAt: EXPIRES_AT,
};

const activationGrantContext = {
  grantId: 'activation_grant_123',
  requestId: 'authorization_request_123',
  installationId: INSTALLATION_ID,
  workspaceId: 'workspace_123',
  environmentId: 'env_staging',
  environment: 'staging' as const,
  customerOrigin: CUSTOMER_ORIGIN,
  editorOrigin: LODARIQ_EDITOR_ORIGIN,
  creatorId: 'creator_123',
  capabilities: activationCapabilities,
  documentIntent: { kind: 'existing' as const, documentId: 'document_123' },
  expiresAt: EXPIRES_AT,
};

const sessionContext = {
  sessionId: 'authoring_session_123',
  correlationId: 'authoring_123',
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
  themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
  workspaceId: 'workspace_123',
  environmentId: 'env_staging',
  environment: 'staging' as const,
  documentId: 'document_123',
  customerOrigin: CUSTOMER_ORIGIN,
  editorOrigin: LODARIQ_EDITOR_ORIGIN,
  creatorId: 'creator_123',
  capabilities: sessionCapabilities,
  expiresAt: '2026-08-07T12:15:00.000Z',
};

describe('permanent SDK bootstrap activation contracts', () => {
  it('accepts public installation identity and page intent without a client environment selector', () => {
    expect(
      validate(PublicSdkBootstrapRequest, {
        installationId: INSTALLATION_ID,
        href: `${CUSTOMER_ORIGIN}/projects/123`,
        origin: CUSTOMER_ORIGIN,
      }).valid,
    ).toBe(true);

    expect(
      validate(PublicSdkBootstrapRequest, {
        installationId: INSTALLATION_ID,
        environment: 'staging',
      }).valid,
    ).toBe(false);
    expect(
      validate(PublicSdkBootstrapRequest, {
        installationId: 'workspace_123',
      }).valid,
    ).toBe(false);
  });

  it('keeps delivery independent so an unpublished staging origin can authorize a first draft', () => {
    expect(
      validate(PublicSdkBootstrapContext, {
        ...bootstrapBase,
        environment: 'staging',
        authoring: availableActivation,
      }).valid,
    ).toBe(true);

    expect(
      validate(PublicSdkBootstrapContext, {
        ...bootstrapBase,
        environment: 'staging',
        delivery: {
          state: 'available',
          manifest: {
            schemaVersion: '2',
            workspaceId: 'workspace_123',
            environmentId: 'env_staging',
            documentId: 'document_123',
            state: 'inactive',
            generation: 0,
          },
          currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
        },
        authoring: availableActivation,
      }).valid,
    ).toBe(false);

    expect(
      validate(PublicSdkBootstrapContext, {
        ...bootstrapBase,
        environment: 'staging',
        delivery: {
          state: 'available',
          manifest: {
            documentId: 'document_123',
            currentVersion: `sha256-${'d'.repeat(64)}`,
          },
          currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
          ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
        },
        authoring: { state: 'disabled' },
      }).valid,
    ).toBe(true);
  });

  it('carries multiple active document-scoped pointers in one closed delivery index', () => {
    const delivery = {
      state: 'available' as const,
      mode: 'document-scoped-v2' as const,
      manifests: [activeManifest('document_welcome', 'b'), activeManifest('document_upgrade', 'c')],
      defaultDocumentId: 'document_welcome',
      ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
    };

    expect(validate(DocumentScopedSdkDeliveryDescriptor, delivery).valid).toBe(true);
    expect(
      validate(PublicSdkBootstrapContext, {
        ...bootstrapBase,
        environment: 'staging',
        delivery,
        authoring: { state: 'disabled' },
      }).valid,
    ).toBe(true);
    expect(
      validate(DocumentScopedSdkDeliveryDescriptor, {
        ...delivery,
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
      }).valid,
    ).toBe(false);
    expect(
      validate(DocumentScopedSdkDeliveryDescriptor, {
        ...delivery,
        manifests: [
          {
            ...activeManifest('document_welcome', 'b'),
            state: 'inactive',
          },
        ],
      }).valid,
    ).toBe(false);
  });

  it('makes production structurally incapable of carrying activation or creator metadata', () => {
    const production = {
      ...bootstrapBase,
      environmentId: 'env_production',
      environment: 'production' as const,
      customerOrigin: 'https://customer.example',
      authoring: { state: 'disabled' as const },
    };

    expect(validate(PublicSdkBootstrapContext, production).valid).toBe(true);
    expect(
      validate(PublicSdkBootstrapContext, {
        ...production,
        authoring: availableActivation,
      }).valid,
    ).toBe(false);
    expect(
      validate(PublicSdkBootstrapContext, {
        ...production,
        authoring: {
          state: 'disabled',
          activationUrl: LODARIQ_AUTHORING_ACTIVATION_URL,
        },
      }).valid,
    ).toBe(false);
    expect(
      validate(PublicSdkBootstrapContext, {
        ...production,
        creatorModule,
      }).valid,
    ).toBe(false);
    expect(
      validate(PublicSdkBootstrapContext, {
        ...production,
        editorUrl: 'https://editor.lodariq.com',
      }).valid,
    ).toBe(false);
  });

  it('closes the available activation descriptor and pins its first-party route', () => {
    expect(validate(AvailableAuthoringActivationDescriptor, availableActivation).valid).toBe(true);
    expect(
      validate(AvailableAuthoringActivationDescriptor, {
        ...availableActivation,
        activationUrl: 'https://customer.example/sign-in',
      }).valid,
    ).toBe(false);
    expect(
      validate(AvailableAuthoringActivationDescriptor, {
        ...availableActivation,
        creatorModule,
      }).valid,
    ).toBe(false);
  });

  it('allows only a closed, integrity-pinned creator module on the CDN origin', () => {
    expect(validate(CreatorModuleDescriptor, creatorModule).valid).toBe(true);
    expect(
      validate(CreatorModuleDescriptor, {
        ...creatorModule,
        url: 'https://customer.example/creator.js',
      }).valid,
    ).toBe(false);
    expect(
      validate(CreatorModuleDescriptor, {
        ...creatorModule,
        integrity: 'sha384-unsupported',
      }).valid,
    ).toBe(false);
  });
});

describe('first-party authoring authorization and exchange contracts', () => {
  it('accepts only S256 requests and a closed activation capability set', () => {
    const request = {
      installationId: INSTALLATION_ID,
      customerOrigin: CUSTOMER_ORIGIN,
      state: STATE,
      codeChallenge: CODE_CHALLENGE,
      codeChallengeMethod: AUTHORING_PKCE_CHALLENGE_METHOD,
      requestedCapabilities: activationCapabilities,
      documentIntent: { kind: 'new-draft', documentType: 'tour' },
    };

    expect(validate(AuthoringAuthorizationRequest, request).valid).toBe(true);
    expect(
      validate(AuthoringBootstrapGrantHeaders, {
        [AUTHORING_BOOTSTRAP_GRANT_HEADER]: BOOTSTRAP_GRANT,
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthoringAuthorizationRequest, {
        ...request,
        bootstrapGrant: BOOTSTRAP_GRANT,
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringAuthorizationRequest, {
        ...request,
        codeChallengeMethod: 'plain',
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringAuthorizationRequest, {
        ...request,
        requestedCapabilities: ['documents:list', 'document:publish'],
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringAuthorizationRequest, {
        ...request,
        requestedCapabilities: ['documents:list', 'documents:list'],
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringAuthorizationRequest, {
        ...request,
        environment: 'staging',
      }).valid,
    ).toBe(false);
  });

  it('records a closed, non-production, server-resolved authorization scope', () => {
    expect(validate(AuthoringAuthorizationContext, authorizationContext).valid).toBe(true);
    expect(
      validate(AuthoringAuthorizationContext, {
        ...authorizationContext,
        environment: 'production',
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringAuthorizationContext, {
        ...authorizationContext,
        authorizationCode: AUTHORIZATION_CODE,
      }).valid,
    ).toBe(false);
  });

  it('keeps the popup result narrow and bound to protocol, request, and state', () => {
    const result = {
      protocol: AUTHORING_ACTIVATION_PROTOCOL,
      type: 'authoring.authorization.result',
      requestId: authorizationContext.requestId,
      state: STATE,
      authorizationCode: AUTHORIZATION_CODE,
      expiresAt: EXPIRES_AT,
    };

    expect(validate(AuthoringAuthorizationResult, result).valid).toBe(true);
    expect(
      validate(AuthoringAuthorizationResult, {
        ...result,
        protocol: 'lodariq.authoring.activation.v2',
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringAuthorizationResult, {
        ...result,
        creatorModule,
      }).valid,
    ).toBe(false);
  });

  it('requires the bootstrap grant, one-time code, state, request, and PKCE verifier at exchange', () => {
    const request = {
      installationId: INSTALLATION_ID,
      customerOrigin: CUSTOMER_ORIGIN,
      requestId: authorizationContext.requestId,
      state: STATE,
      authorizationCode: AUTHORIZATION_CODE,
      codeVerifier: CODE_VERIFIER,
    };

    expect(validate(AuthoringCodeExchangeRequest, request).valid).toBe(true);
    expect(
      validate(AuthoringBootstrapGrantHeaders, {
        [AUTHORING_BOOTSTRAP_GRANT_HEADER]: BOOTSTRAP_GRANT,
        authorization: `Bearer ${BOOTSTRAP_GRANT}`,
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringCodeExchangeRequest, {
        ...request,
        bootstrapGrant: BOOTSTRAP_GRANT,
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringCodeExchangeRequest, {
        ...request,
        codeVerifier: 'too-short',
      }).valid,
    ).toBe(false);
  });

  it('returns the creator module only with a successful scoped activation grant', () => {
    expect(validate(AuthoringActivationGrantContext, activationGrantContext).valid).toBe(true);
    expect(
      validate(AuthoringCodeExchangeResult, {
        activationGrant: ACTIVATION_GRANT,
        context: activationGrantContext,
        creatorModule,
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthoringCodeExchangeResult, {
        activationGrant: ACTIVATION_GRANT,
        context: activationGrantContext,
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringActivationGrantContext, {
        ...activationGrantContext,
        capabilities: ['documents:list', 'release:publish'],
      }).valid,
    ).toBe(false);
  });
});

describe('document-scoped authoring session contracts', () => {
  it('keeps the activation grant in a closed header and the request body credential-free', () => {
    expect(
      validate(CreateAuthoringDocumentSessionRequest, {
        installationId: INSTALLATION_ID,
        customerOrigin: CUSTOMER_ORIGIN,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'page',
        documentIntent: { kind: 'existing', documentId: 'document_123' },
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthoringActivationGrantHeaders, {
        [AUTHORING_ACTIVATION_GRANT_HEADER]: ACTIVATION_GRANT,
      }).valid,
    ).toBe(true);
    expect(
      validate(CreateAuthoringDocumentSessionRequest, {
        installationId: INSTALLATION_ID,
        customerOrigin: CUSTOMER_ORIGIN,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'page',
        activationGrant: ACTIVATION_GRANT,
        documentIntent: { kind: 'existing', documentId: 'document_123' },
      }).valid,
    ).toBe(false);
    expect(
      validate(CreateAuthoringDocumentSessionRequest, {
        installationId: INSTALLATION_ID,
        customerOrigin: CUSTOMER_ORIGIN,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'page',
        documentIntent: { kind: 'existing', documentId: 'document_123' },
        compilerVersion: COMPILER_VERSION,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
        themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
        themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
      }).valid,
    ).toBe(false);
    expect(
      validate(CreateAuthoringDocumentSessionRequest, {
        installationId: INSTALLATION_ID,
        customerOrigin: CUSTOMER_ORIGIN,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'page',
        documentIntent: {
          kind: 'existing',
          documentId: 'document_123',
          environmentId: 'env_other',
        },
      }).valid,
    ).toBe(false);
    expect(
      validate(CreateAuthoringDocumentSessionRequest, {
        installationId: INSTALLATION_ID,
        customerOrigin: CUSTOMER_ORIGIN,
        pageContext: { pathname: '/projects/123' },
        selectionScope: 'workspace',
        documentIntent: { kind: 'new-draft', documentType: 'tour' },
      }).valid,
    ).toBe(false);
  });

  it('keeps route browsing context pathname-only and returns closed release summaries', () => {
    expect(validate(AuthoringPageContext, { pathname: '/projects/123' }).valid).toBe(true);
    expect(validate(AuthoringPageContext, { pathname: '/projects/123?tab=details' }).valid).toBe(
      false,
    );
    expect(
      validate(AuthoringPageContext, { pathname: 'https://customer.example/projects' }).valid,
    ).toBe(false);

    const request = {
      installationId: INSTALLATION_ID,
      customerOrigin: CUSTOMER_ORIGIN,
      scope: 'page' as const,
      pageContext: { pathname: '/projects/123' },
    };
    expect(validate(QueryAuthoringDocumentsRequest, request).valid).toBe(true);
    expect(validate(QueryAuthoringDocumentsRequest, { ...request, scope: undefined }).valid).toBe(
      false,
    );

    const summary = {
      id: 'document_123',
      title: 'Project tour',
      type: 'tour' as const,
      status: 'draft' as const,
      updatedAt: EXPIRES_AT,
      releases: [
        {
          environmentId: 'env_staging',
          environment: 'staging' as const,
          contentHash: 'sha256-content',
          publishedAt: EXPIRES_AT,
        },
      ],
    };
    expect(validate(AuthoringPageDocumentSummary, summary).valid).toBe(true);
    expect(
      validate(QueryAuthoringDocumentsResult, {
        scope: request.scope,
        pageContext: request.pageContext,
        documents: [summary],
      }).valid,
    ).toBe(true);
    expect(
      validate(RevokeAuthoringActivationRequest, {
        installationId: INSTALLATION_ID,
        customerOrigin: CUSTOMER_ORIGIN,
      }).valid,
    ).toBe(true);
  });

  it('binds the session to non-production document scope and closed capabilities', () => {
    expect(validate(AuthoringSessionContext, sessionContext).valid).toBe(true);
    expect(
      validate(AuthoringSessionContext, {
        ...sessionContext,
        environment: 'production',
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringSessionContext, {
        ...sessionContext,
        rendererContractVersion: 'renderer-from-browser',
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringSessionContext, {
        ...sessionContext,
        capabilities: ['document:read', 'release:publish'],
      }).valid,
    ).toBe(false);
    expect(
      validate(AuthoringDocumentSessionResult, {
        authoringSessionToken: SESSION_TOKEN,
        context: sessionContext,
      }).valid,
    ).toBe(true);
  });
});

describe('legacy token-bootstrap compatibility', () => {
  it('keeps direct authoring document and release payloads closed', () => {
    const document = {
      id: 'document_123',
      workspaceId: 'workspace_123',
      type: 'tour',
      status: 'draft',
      title: 'Direct authoring',
      trigger: { type: 'manual' },
      audience: { environments: ['staging'] },
      schemaVersion: '1.0.0',
      targets: [],
      blocks: [],
    };
    const payload = { document, theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1 };
    expect(validate(AuthoringDocumentPayload, payload).valid).toBe(true);
    expect(validate(AuthoringDocumentPayload, { document }).valid).toBe(false);
    expect(validate(AuthoringDocumentPayload, { ...payload, selector: '#unsafe' }).valid).toBe(
      false,
    );

    const release = {
      releaseState: {
        capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        url: 'https://api.lodariq.com/v1/sdk/authoring/release-state',
      },
      stagingPublication: {
        capability: AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
        url: 'https://api.lodariq.com/v1/sdk/authoring/publications',
      },
    };
    expect(validate(SdkAuthoringReleaseDescriptor, release).valid).toBe(true);
    expect(
      validate(SdkAuthoringReleaseDescriptor, {
        ...release,
        stagingPublication: { ...release.stagingPublication, bearer: SESSION_TOKEN },
      }).valid,
    ).toBe(false);

    expect(
      validate(AuthoringStagingReleaseState, {
        available: false,
        environment: 'development',
        environmentId: 'environment_development',
        documentId: document.id,
        expectedGeneration: 0,
        draftArtifactId: null,
        draftContentHash: null,
        activeContentHash: null,
        state: 'open_in_staging',
        findings: [],
      }).valid,
    ).toBe(true);
    expect(
      validate(AuthoringStagingPublicationResult, {
        ok: true,
        replayed: false,
        generation: 1,
        findings: [],
      }).valid,
    ).toBe(true);
  });

  it('keeps the existing request and install context readable', () => {
    expect(
      validate(SdkBootstrapRequest, {
        environment: 'staging',
        href: `${CUSTOMER_ORIGIN}/projects/123`,
        origin: CUSTOMER_ORIGIN,
      }).valid,
    ).toBe(true);

    expect(
      validate(SdkInstallContext, {
        workspaceId: 'workspace_123',
        environment: 'staging',
        correlationId: 'bootstrap_123',
        manifest: {
          documentId: 'document_123',
          currentVersion: `sha256-${'d'.repeat(64)}`,
        },
        currentDocumentUrl: 'https://api.lodariq.com/v1/sdk/current-document',
        ingestUrl: 'https://api.lodariq.com/v1/sdk/events',
        authoring: { enabled: false },
      }).valid,
    ).toBe(true);
  });
});
