import { Type, type Static } from '@sinclair/typebox';
import { AuthoringDeliveryCapabilityMetadata } from './authoring-capabilities';
import {
  AuthoringDocumentIntent,
  AUTHORING_DRAFT_DOCUMENT_TYPES,
  ExistingAuthoringDocumentIntent,
  NewAuthoringDocumentIntent,
} from './authoring-workspace';
export {
  AuthoringDocumentIntent,
  ExistingAuthoringDocumentIntent,
  NewAuthoringDocumentIntent,
} from './authoring-workspace';
import { DocumentStatus, Environment } from './common';
import { LodariqDocument } from './document';
import {
  BrandDocumentThemeReviewState,
  BrandThemeSnapshot,
  PRODUCT_STYLE_MAX_SOURCES,
} from './brand';
import { AnalyticsDocumentPointer } from './events';
import { NarrationVoice } from './narration-generation';
import {
  ActiveManifestPointerV2,
  BrowserVerificationReport,
  ManifestPointer,
  PublicationVerification,
} from './release';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
} from './version';

const IDENTIFIER_OPTIONS = { minLength: 1, maxLength: 256 } as const;
const OPAQUE_CREDENTIAL_OPTIONS = { minLength: 32, maxLength: 2048 } as const;
const PKCE_VALUE_OPTIONS = {
  minLength: 43,
  maxLength: 128,
  pattern: '^[A-Za-z0-9._~-]+$',
} as const;
const EXACT_ORIGIN_PATTERN = '^https?://[^\\s/?#@]+$';
const PRODUCTION_ORIGIN_PATTERN = '^https://[^\\s/?#@]+$';
const CREATOR_MODULE_URL_PATTERN = '^https://(?:staging-)?cdn\\.lodariq\\.io/[^?#]+$';
const SUBRESOURCE_INTEGRITY_PATTERN = '^sha256-[A-Za-z0-9+/]+={0,2}$';
const PUBLIC_SDK_INSTALLATION_ID_OPTIONS = {
  minLength: 24,
  maxLength: 136,
  pattern: '^ins_pub_[A-Za-z0-9_-]{16,128}$',
} as const;
const AUTHORING_PAGE_CONTEXT_PROPERTIES = {
  pathname: Type.String({
    minLength: 1,
    maxLength: 2_048,
    pattern: '^/(?!/)[^\\u0000-\\u0020\\u007F?#\\\\]*$',
  }),
} as const;
const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';
const RELEASE_IDEMPOTENCY_KEY_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$';
const RELEASE_CORRELATION_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$';

export const MAX_ACTIVE_DOCUMENT_MANIFESTS = 100;

export const LODARIQ_APP_ORIGIN = 'https://app.lodariq.io' as const;
export const LODARIQ_STAGING_APP_ORIGIN = 'https://staging-app.lodariq.io' as const;
export const LODARIQ_API_ORIGIN = 'https://api.lodariq.io' as const;
export const LODARIQ_STAGING_API_ORIGIN = 'https://staging-api.lodariq.io' as const;
export const LODARIQ_EDITOR_ORIGIN = 'https://editor.lodariq.io' as const;
export const LODARIQ_STAGING_EDITOR_ORIGIN = 'https://staging-editor.lodariq.io' as const;
export const LODARIQ_AUTHORING_ACTIVATION_URL =
  'https://app.lodariq.io/authoring/activate' as const;
export const LODARIQ_STAGING_AUTHORING_ACTIVATION_URL =
  'https://staging-app.lodariq.io/authoring/activate' as const;
export const AUTHORING_ACTIVATION_PROTOCOL = 'lodariq.authoring.activation.v1' as const;
export const AUTHORING_PKCE_CHALLENGE_METHOD = 'S256' as const;
export const AUTHORING_BOOTSTRAP_GRANT_HEADER = 'x-lodariq-bootstrap-grant' as const;
export const AUTHORING_ACTIVATION_GRANT_HEADER = 'x-lodariq-activation-grant' as const;
export const AUTHORING_SESSION_HEADER = 'x-lodariq-authoring-session' as const;

export const AUTHORING_ACTIVATION_CAPABILITIES = {
  CREATE_DOCUMENT: 'documents:create',
  LIST_DOCUMENTS: 'documents:list',
  SELECT_DOCUMENT: 'documents:select',
} as const;

export const AUTHORING_SESSION_CAPABILITIES = {
  APPROVE_PRODUCTION: 'document:approve-production',
  PREVIEW_DOCUMENT: 'document:preview',
  PROMOTE_PRODUCTION: 'document:promote-production',
  PUBLISH_STAGING: 'document:publish-staging',
  READ_DOCUMENT: 'document:read',
  READ_RELEASE_STATE: 'document:read-release-state',
  ROLLBACK_RELEASE: 'document:rollback',
  SCHEDULE_RELEASE: 'document:schedule-release',
  SAMPLE_PRODUCT_STYLE: 'brand:sample-product-style',
  SELECT_TARGET: 'target:select',
  UNPUBLISH_RELEASE: 'document:unpublish',
  VERIFY_STAGING: 'document:verify-staging',
  WRITE_DOCUMENT: 'document:write',
} as const;

const PublicSdkInstallationIdValue = Type.String(PUBLIC_SDK_INSTALLATION_ID_OPTIONS);
export const PublicSdkInstallationId = Type.String({
  ...PUBLIC_SDK_INSTALLATION_ID_OPTIONS,
  $id: 'PublicSdkInstallationId',
});
export type PublicSdkInstallationId = Static<typeof PublicSdkInstallationId>;

/** Anonymous browser seed used only for stable experiment assignment. */
export const ExperimentAssignmentKey = Type.String({
  $id: 'ExperimentAssignmentKey',
  minLength: 36,
  maxLength: 36,
  pattern: '^lqv_[0-9a-f]{32}$',
});
export type ExperimentAssignmentKey = Static<typeof ExperimentAssignmentKey>;

export const AuthoringEnvironment = Type.Union(
  [Type.Literal('development'), Type.Literal('staging')],
  { $id: 'AuthoringEnvironment' },
);
export type AuthoringEnvironment = Static<typeof AuthoringEnvironment>;

export const AuthoringActivationCapability = Type.Union(
  [
    Type.Literal(AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT),
    Type.Literal(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS),
    Type.Literal(AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT),
  ],
  { $id: 'AuthoringActivationCapability' },
);
export type AuthoringActivationCapability = Static<typeof AuthoringActivationCapability>;

export const AuthoringActivationCapabilitySet = Type.Array(AuthoringActivationCapability, {
  $id: 'AuthoringActivationCapabilitySet',
  minItems: 1,
  maxItems: Object.keys(AUTHORING_ACTIVATION_CAPABILITIES).length,
  uniqueItems: true,
});
export type AuthoringActivationCapabilitySet = Static<typeof AuthoringActivationCapabilitySet>;

export const AuthoringSessionCapability = Type.Union(
  [
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.SCHEDULE_RELEASE),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING),
    Type.Literal(AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT),
  ],
  { $id: 'AuthoringSessionCapability' },
);
export type AuthoringSessionCapability = Static<typeof AuthoringSessionCapability>;

export const AuthoringSessionCapabilitySet = Type.Array(AuthoringSessionCapability, {
  $id: 'AuthoringSessionCapabilitySet',
  minItems: 1,
  maxItems: Object.keys(AUTHORING_SESSION_CAPABILITIES).length,
  uniqueItems: true,
});
export type AuthoringSessionCapabilitySet = Static<typeof AuthoringSessionCapabilitySet>;

/**
 * Why authoring is unavailable, as a closed set (§14.4). A dead end that explains
 * itself converts; a bare `disabled` churns. The reason is an enum rather than a
 * message so no server text crosses the boundary and the SDK owns the wording.
 */
export const AUTHORING_DISABLED_REASONS = ['production_environment', 'not_enabled'] as const;
export const AuthoringDisabledReason = Type.Union(
  AUTHORING_DISABLED_REASONS.map((value) => Type.Literal(value)),
  { $id: 'AuthoringDisabledReason' },
);
export type AuthoringDisabledReason = Static<typeof AuthoringDisabledReason>;

export const DisabledAuthoringActivationDescriptor = Type.Object(
  {
    state: Type.Literal('disabled'),
    /** Optional so a pre-existing payload stays valid. */
    reason: Type.Optional(Type.Ref(AuthoringDisabledReason)),
  },
  { $id: 'DisabledAuthoringActivationDescriptor', additionalProperties: false },
);
export type DisabledAuthoringActivationDescriptor = Static<
  typeof DisabledAuthoringActivationDescriptor
>;

export const AvailableAuthoringActivationDescriptor = Type.Object(
  {
    state: Type.Literal('available'),
    appOrigin: Type.Union([
      Type.Literal(LODARIQ_APP_ORIGIN),
      Type.Literal(LODARIQ_STAGING_APP_ORIGIN),
    ]),
    activationUrl: Type.Union([
      Type.Literal(LODARIQ_AUTHORING_ACTIVATION_URL),
      Type.Literal(LODARIQ_STAGING_AUTHORING_ACTIVATION_URL),
    ]),
    authorizationRequestUrl: Type.String({ minLength: 1 }),
    exchangeUrl: Type.String({ minLength: 1 }),
    bootstrapGrant: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    bootstrapGrantExpiresAt: Type.String({ minLength: 1 }),
  },
  { $id: 'AvailableAuthoringActivationDescriptor', additionalProperties: false },
);
export type AvailableAuthoringActivationDescriptor = Static<
  typeof AvailableAuthoringActivationDescriptor
>;

/**
 * The production branch is deliberately data-free. Creator, app-auth, and
 * editor metadata cannot be smuggled into it because both union branches are
 * closed objects.
 */
export const AuthoringActivationDescriptor = Type.Union(
  [DisabledAuthoringActivationDescriptor, AvailableAuthoringActivationDescriptor],
  { $id: 'AuthoringActivationDescriptor' },
);
export type AuthoringActivationDescriptor = Static<typeof AuthoringActivationDescriptor>;

export const CreatorModuleDescriptor = Type.Object(
  {
    url: Type.String({ minLength: 1, pattern: CREATOR_MODULE_URL_PATTERN }),
    version: Type.String({ minLength: 1, maxLength: 128 }),
    integrity: Type.String({ pattern: SUBRESOURCE_INTEGRITY_PATTERN }),
  },
  { $id: 'CreatorModuleDescriptor', additionalProperties: false },
);
export type CreatorModuleDescriptor = Static<typeof CreatorModuleDescriptor>;

/**
 * Canonical one-install bootstrap request. `href` and `origin` are untrusted
 * page intent only; the server resolves scope from the request Origin and the
 * public installation ID, never from a client-selected environment.
 */
export const PublicSdkBootstrapRequest = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    assignmentKey: Type.Optional(Type.Ref(ExperimentAssignmentKey)),
    href: Type.Optional(Type.String({ minLength: 1 })),
    origin: Type.Optional(Type.String({ pattern: EXACT_ORIGIN_PATTERN })),
  },
  { $id: 'PublicSdkBootstrapRequest', additionalProperties: false },
);
export type PublicSdkBootstrapRequest = Static<typeof PublicSdkBootstrapRequest>;

export const UnavailableSdkDeliveryDescriptor = Type.Object(
  { state: Type.Literal('unavailable') },
  { $id: 'UnavailableSdkDeliveryDescriptor', additionalProperties: false },
);
export type UnavailableSdkDeliveryDescriptor = Static<typeof UnavailableSdkDeliveryDescriptor>;

/** A published compatibility manifest or an active document-scoped V2 pointer. */
export const AvailableSdkManifestPointer = Type.Union([ManifestPointer, ActiveManifestPointerV2], {
  $id: 'AvailableSdkManifestPointer',
});
export type AvailableSdkManifestPointer = Static<typeof AvailableSdkManifestPointer>;

export const AvailableSdkDeliveryDescriptor = Type.Object(
  {
    state: Type.Literal('available'),
    manifest: AvailableSdkManifestPointer,
    currentDocumentUrl: Type.String({ minLength: 1 }),
    ingestUrl: Type.String({ minLength: 1 }),
    catalogUrl: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'AvailableSdkDeliveryDescriptor', additionalProperties: false },
);
export type AvailableSdkDeliveryDescriptor = Static<typeof AvailableSdkDeliveryDescriptor>;

/**
 * Canonical Phase 2 delivery index. The bootstrap can describe every active
 * Tour for the resolved environment without falling back to one
 * environment-global "current document". Artifact bytes remain
 * document-scoped and integrity-pinned by each V2 pointer.
 */
export const DocumentScopedSdkDeliveryDescriptor = Type.Object(
  {
    state: Type.Literal('available'),
    mode: Type.Literal('document-scoped-v2'),
    manifests: Type.Array(ActiveManifestPointerV2, {
      minItems: 1,
      maxItems: MAX_ACTIVE_DOCUMENT_MANIFESTS,
    }),
    defaultDocumentId: Type.String(IDENTIFIER_OPTIONS),
    ingestUrl: Type.String({ minLength: 1 }),
    catalogUrl: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'DocumentScopedSdkDeliveryDescriptor', additionalProperties: false },
);
export type DocumentScopedSdkDeliveryDescriptor = Static<
  typeof DocumentScopedSdkDeliveryDescriptor
>;

/** Delivery publication and creator activation are deliberately independent. */
export const SdkDeliveryDescriptor = Type.Union(
  [
    UnavailableSdkDeliveryDescriptor,
    AvailableSdkDeliveryDescriptor,
    DocumentScopedSdkDeliveryDescriptor,
  ],
  { $id: 'SdkDeliveryDescriptor' },
);
export type SdkDeliveryDescriptor = Static<typeof SdkDeliveryDescriptor>;

export const ProductionPublicSdkBootstrapContext = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    environment: Type.Literal('production'),
    customerOrigin: Type.String({ pattern: PRODUCTION_ORIGIN_PATTERN }),
    correlationId: Type.String(IDENTIFIER_OPTIONS),
    delivery: SdkDeliveryDescriptor,
    authoring: DisabledAuthoringActivationDescriptor,
  },
  { $id: 'ProductionPublicSdkBootstrapContext', additionalProperties: false },
);
export type ProductionPublicSdkBootstrapContext = Static<
  typeof ProductionPublicSdkBootstrapContext
>;

export const NonProductionPublicSdkBootstrapContext = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    environment: AuthoringEnvironment,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    correlationId: Type.String(IDENTIFIER_OPTIONS),
    delivery: SdkDeliveryDescriptor,
    authoring: AuthoringActivationDescriptor,
  },
  { $id: 'NonProductionPublicSdkBootstrapContext', additionalProperties: false },
);
export type NonProductionPublicSdkBootstrapContext = Static<
  typeof NonProductionPublicSdkBootstrapContext
>;

/** Public installation bootstrap with a structurally production-disabled branch. */
export const PublicSdkBootstrapContext = Type.Union(
  [ProductionPublicSdkBootstrapContext, NonProductionPublicSdkBootstrapContext],
  { $id: 'PublicSdkBootstrapContext' },
);
export type PublicSdkBootstrapContext = Static<typeof PublicSdkBootstrapContext>;

/** Credential transport for authorization-request and code-exchange calls. */
export const AuthoringBootstrapGrantHeaders = Type.Object(
  {
    [AUTHORING_BOOTSTRAP_GRANT_HEADER]: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
  },
  { $id: 'AuthoringBootstrapGrantHeaders', additionalProperties: false },
);
export type AuthoringBootstrapGrantHeaders = Static<typeof AuthoringBootstrapGrantHeaders>;

export const AuthoringAuthorizationRequest = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    state: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    codeChallenge: Type.String(PKCE_VALUE_OPTIONS),
    codeChallengeMethod: Type.Literal(AUTHORING_PKCE_CHALLENGE_METHOD),
    requestedCapabilities: AuthoringActivationCapabilitySet,
    documentIntent: Type.Optional(AuthoringDocumentIntent),
  },
  { $id: 'AuthoringAuthorizationRequest', additionalProperties: false },
);
export type AuthoringAuthorizationRequest = Static<typeof AuthoringAuthorizationRequest>;

/** Server-resolved, pre-approval scope; raw bootstrap credentials are omitted. */
export const AuthoringAuthorizationContext = Type.Object(
  {
    requestId: Type.String(IDENTIFIER_OPTIONS),
    installationId: PublicSdkInstallationId,
    workspaceId: Type.String(IDENTIFIER_OPTIONS),
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    environment: AuthoringEnvironment,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    state: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    codeChallenge: Type.String(PKCE_VALUE_OPTIONS),
    codeChallengeMethod: Type.Literal(AUTHORING_PKCE_CHALLENGE_METHOD),
    requestedCapabilities: AuthoringActivationCapabilitySet,
    documentIntent: Type.Optional(AuthoringDocumentIntent),
    expiresAt: Type.String({ minLength: 1 }),
  },
  { $id: 'AuthoringAuthorizationContext', additionalProperties: false },
);
export type AuthoringAuthorizationContext = Static<typeof AuthoringAuthorizationContext>;

/** Single-use popup result. The browser must also verify exact source/origin/state. */
export const AuthoringAuthorizationResult = Type.Object(
  {
    protocol: Type.Literal(AUTHORING_ACTIVATION_PROTOCOL),
    type: Type.Literal('authoring.authorization.result'),
    requestId: Type.String(IDENTIFIER_OPTIONS),
    state: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    authorizationCode: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    /** Non-secret dashboard UI preference forwarded to creator-only surfaces. */
    uiLocale: Type.Optional(Type.String({ minLength: 2, maxLength: 16 })),
    expiresAt: Type.String({ minLength: 1 }),
  },
  { $id: 'AuthoringAuthorizationResult', additionalProperties: false },
);
export type AuthoringAuthorizationResult = Static<typeof AuthoringAuthorizationResult>;

export const AuthoringCodeExchangeRequest = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    requestId: Type.String(IDENTIFIER_OPTIONS),
    state: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    authorizationCode: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    codeVerifier: Type.String(PKCE_VALUE_OPTIONS),
  },
  { $id: 'AuthoringCodeExchangeRequest', additionalProperties: false },
);
export type AuthoringCodeExchangeRequest = Static<typeof AuthoringCodeExchangeRequest>;

export const AuthoringActivationGrantContext = Type.Object(
  {
    grantId: Type.String(IDENTIFIER_OPTIONS),
    requestId: Type.String(IDENTIFIER_OPTIONS),
    installationId: PublicSdkInstallationId,
    workspaceId: Type.String(IDENTIFIER_OPTIONS),
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    environment: AuthoringEnvironment,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    editorOrigin: Type.Union([
      Type.Literal(LODARIQ_EDITOR_ORIGIN),
      Type.Literal(LODARIQ_STAGING_EDITOR_ORIGIN),
    ]),
    creatorId: Type.String(IDENTIFIER_OPTIONS),
    capabilities: AuthoringActivationCapabilitySet,
    documentIntent: Type.Optional(AuthoringDocumentIntent),
    expiresAt: Type.String({ minLength: 1 }),
  },
  { $id: 'AuthoringActivationGrantContext', additionalProperties: false },
);
export type AuthoringActivationGrantContext = Static<typeof AuthoringActivationGrantContext>;

/** The creator module descriptor exists only on the successful exchange boundary. */
export const AuthoringCodeExchangeResult = Type.Object(
  {
    activationGrant: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    context: AuthoringActivationGrantContext,
    creatorModule: CreatorModuleDescriptor,
  },
  { $id: 'AuthoringCodeExchangeResult', additionalProperties: false },
);
export type AuthoringCodeExchangeResult = Static<typeof AuthoringCodeExchangeResult>;

/** Credential transport used once by the exact-origin editor iframe. */
export const AuthoringActivationGrantHeaders = Type.Object(
  {
    [AUTHORING_ACTIVATION_GRANT_HEADER]: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
  },
  { $id: 'AuthoringActivationGrantHeaders', additionalProperties: false },
);
export type AuthoringActivationGrantHeaders = Static<typeof AuthoringActivationGrantHeaders>;

/** Route-only context supplied by the customer-page host. Never include a URL query or hash. */
const AuthoringPageContextValue = Type.Object(AUTHORING_PAGE_CONTEXT_PROPERTIES, {
  additionalProperties: false,
});
export const AuthoringPageContext = Type.Object(AUTHORING_PAGE_CONTEXT_PROPERTIES, {
  $id: 'AuthoringPageContext',
  additionalProperties: false,
});
export type AuthoringPageContext = Static<typeof AuthoringPageContext>;

export const AuthoringDocumentQueryScope = Type.Union(
  [Type.Literal('page'), Type.Literal('workspace')],
  { $id: 'AuthoringDocumentQueryScope' },
);
export type AuthoringDocumentQueryScope = Static<typeof AuthoringDocumentQueryScope>;

export const QueryAuthoringDocumentsRequest = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    scope: AuthoringDocumentQueryScope,
    pageContext: AuthoringPageContext,
  },
  { $id: 'QueryAuthoringDocumentsRequest', additionalProperties: false },
);
export type QueryAuthoringDocumentsRequest = Static<typeof QueryAuthoringDocumentsRequest>;

export const AuthoringPageDocumentReleaseSummary = Type.Object(
  {
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    environment: Environment,
    contentHash: Type.String({ minLength: 1, maxLength: 256 }),
    publishedAt: Type.String({ minLength: 1 }),
  },
  { $id: 'AuthoringPageDocumentReleaseSummary', additionalProperties: false },
);
export type AuthoringPageDocumentReleaseSummary = Static<
  typeof AuthoringPageDocumentReleaseSummary
>;

export const AuthoringPageDocumentSummary = Type.Object(
  {
    id: Type.String(IDENTIFIER_OPTIONS),
    title: Type.String(),
    type: Type.Union(
      AUTHORING_DRAFT_DOCUMENT_TYPES.map((documentType) => Type.Literal(documentType)),
    ),
    status: DocumentStatus,
    updatedAt: Type.String({ minLength: 1 }),
    releases: Type.Array(AuthoringPageDocumentReleaseSummary),
  },
  { $id: 'AuthoringPageDocumentSummary', additionalProperties: false },
);
export type AuthoringPageDocumentSummary = Static<typeof AuthoringPageDocumentSummary>;

export const QueryAuthoringDocumentsResult = Type.Object(
  {
    scope: AuthoringDocumentQueryScope,
    pageContext: AuthoringPageContext,
    documents: Type.Array(AuthoringPageDocumentSummary),
  },
  { $id: 'QueryAuthoringDocumentsResult', additionalProperties: false },
);
export type QueryAuthoringDocumentsResult = Static<typeof QueryAuthoringDocumentsResult>;

export const RevokeAuthoringActivationRequest = Type.Object(
  {
    installationId: PublicSdkInstallationId,
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
  },
  { $id: 'RevokeAuthoringActivationRequest', additionalProperties: false },
);
export type RevokeAuthoringActivationRequest = Static<typeof RevokeAuthoringActivationRequest>;

export const CreateAuthoringDocumentSessionRequest = Type.Union(
  [
    Type.Object(
      {
        installationId: PublicSdkInstallationIdValue,
        customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
        pageContext: AuthoringPageContextValue,
        selectionScope: AuthoringDocumentQueryScope,
        documentIntent: ExistingAuthoringDocumentIntent,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        installationId: PublicSdkInstallationIdValue,
        customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
        pageContext: AuthoringPageContextValue,
        selectionScope: Type.Literal('page'),
        documentIntent: NewAuthoringDocumentIntent,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'CreateAuthoringDocumentSessionRequest' },
);
export type CreateAuthoringDocumentSessionRequest = Static<
  typeof CreateAuthoringDocumentSessionRequest
>;

export const AuthoringSessionContext = Type.Object(
  {
    sessionId: Type.String(IDENTIFIER_OPTIONS),
    correlationId: Type.String(IDENTIFIER_OPTIONS),
    compilerVersion: Type.Literal(COMPILER_VERSION),
    rendererContractVersion: Type.Literal(RENDERER_CONTRACT_VERSION),
    themeContractVersion: Type.Literal(BRAND_THEME_CONTRACT_VERSION),
    themeVersionId: Type.String({ minLength: 1, maxLength: 120 }),
    workspaceId: Type.String(IDENTIFIER_OPTIONS),
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    environment: AuthoringEnvironment,
    documentId: Type.String(IDENTIFIER_OPTIONS),
    customerOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
    editorOrigin: Type.Union([
      Type.Literal(LODARIQ_EDITOR_ORIGIN),
      Type.Literal(LODARIQ_STAGING_EDITOR_ORIGIN),
    ]),
    creatorId: Type.String(IDENTIFIER_OPTIONS),
    capabilities: AuthoringSessionCapabilitySet,
    deliveryCapabilities: Type.Optional(Type.Ref(AuthoringDeliveryCapabilityMetadata)),
    /** Optional authoring service availability, never a provider credential or runtime dependency. */
    translation: Type.Optional(
      Type.Object({ state: Type.Literal('available') }, { additionalProperties: false }),
    ),
    assist: Type.Optional(
      Type.Object({ state: Type.Literal('available') }, { additionalProperties: false }),
    ),
    narration: Type.Optional(
      Type.Object(
        {
          state: Type.Literal('available'),
          voices: Type.Array(Type.Ref(NarrationVoice), { maxItems: 200 }),
        },
        { additionalProperties: false },
      ),
    ),
    expiresAt: Type.String({ minLength: 1 }),
  },
  { $id: 'AuthoringSessionContext', additionalProperties: false },
);
export type AuthoringSessionContext = Static<typeof AuthoringSessionContext>;

/** Returned only to the editor iframe; the host receives the context, never this bearer. */
export const AuthoringDocumentSessionResult = Type.Object(
  {
    authoringSessionToken: Type.String(OPAQUE_CREDENTIAL_OPTIONS),
    context: AuthoringSessionContext,
  },
  { $id: 'AuthoringDocumentSessionResult', additionalProperties: false },
);
export type AuthoringDocumentSessionResult = Static<typeof AuthoringDocumentSessionResult>;

/** Canonical draft transfer for the session-owned hosted editor load/save API. */
export const AuthoringDocumentPayload = Type.Object(
  {
    document: Type.Ref(LodariqDocument),
    documentUpdatedAt: Type.String({ format: 'date-time' }),
    /** Exact approved snapshot used by both hosted preview and server compilation. */
    theme: Type.Ref(BrandThemeSnapshot),
  },
  { $id: 'AuthoringDocumentPayload', additionalProperties: false },
);
export type AuthoringDocumentPayload = Static<typeof AuthoringDocumentPayload>;

/** Exact creator-reviewed Brand/document guard for an explicit acknowledgement. */
export const AuthoringBrandThemeAcknowledgementRequest = Type.Object(
  {
    reviewedThemeVersionId: Type.String(IDENTIFIER_OPTIONS),
    expectedAcknowledgedThemeVersionId: Type.String(IDENTIFIER_OPTIONS),
    expectedDocumentUpdatedAt: Type.String({ format: 'date-time' }),
    document: Type.Ref(LodariqDocument),
  },
  { $id: 'AuthoringBrandThemeAcknowledgementRequest', additionalProperties: false },
);
export type AuthoringBrandThemeAcknowledgementRequest = Static<
  typeof AuthoringBrandThemeAcknowledgementRequest
>;

/**
 * The exact saved document and approved snapshot returned after acknowledgement.
 * Detection never reaches this contract; only an explicit creator action does.
 */
export const AuthoringBrandThemeAcknowledgementResult = Type.Object(
  {
    document: Type.Ref(LodariqDocument),
    theme: Type.Ref(BrandThemeSnapshot),
    documentThemeReview: Type.Ref(BrandDocumentThemeReviewState),
    documentUpdatedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'AuthoringBrandThemeAcknowledgementResult', additionalProperties: false },
);
export type AuthoringBrandThemeAcknowledgementResult = Static<
  typeof AuthoringBrandThemeAcknowledgementResult
>;

/**
 * Server-owned receipt for one privacy-safe Product Match provenance source.
 * The browser never chooses these persistence identities or hashes.
 */
export const AuthoringProductMatchSourceReceipt = Type.Object(
  {
    sourceId: Type.String(IDENTIFIER_OPTIONS),
    sourceHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
  },
  { $id: 'AuthoringProductMatchSourceReceipt', additionalProperties: false },
);
export type AuthoringProductMatchSourceReceipt = Static<typeof AuthoringProductMatchSourceReceipt>;

/**
 * Exact persisted mutable-theme result returned after Product Match. The
 * approved theme and live artifacts stay pinned separately; `previewTheme` is
 * a content-hashed browser-preview snapshot derived from this committed draft.
 */
export const AuthoringProductMatchApplyResult = Type.Object(
  {
    proposalId: Type.String(IDENTIFIER_OPTIONS),
    draftRevision: Type.Integer({ minimum: 1 }),
    draftUpdatedAt: Type.String({ minLength: 20, maxLength: 64 }),
    previewTheme: Type.Ref(BrandThemeSnapshot),
    sources: Type.Array(Type.Ref(AuthoringProductMatchSourceReceipt), {
      minItems: 1,
      maxItems: PRODUCT_STYLE_MAX_SOURCES,
    }),
    draftChanged: Type.Boolean(),
    replayed: Type.Boolean(),
  },
  { $id: 'AuthoringProductMatchApplyResult', additionalProperties: false },
);
export type AuthoringProductMatchApplyResult = Static<typeof AuthoringProductMatchApplyResult>;

export const AUTHORING_STAGING_RELEASE_STATES = [
  'open_in_staging',
  'no_saved_artifact',
  'ready',
  'current',
] as const;

export const AuthoringStagingReleaseStateName = Type.Union(
  [
    Type.Literal('open_in_staging'),
    Type.Literal('no_saved_artifact'),
    Type.Literal('ready'),
    Type.Literal('current'),
  ],
  { $id: 'AuthoringStagingReleaseStateName' },
);
export type AuthoringStagingReleaseStateName = Static<typeof AuthoringStagingReleaseStateName>;

export const AuthoringReleaseFinding = Type.Object(
  {
    code: Type.String({ minLength: 1, maxLength: 120 }),
    severity: Type.Union([Type.Literal('warning'), Type.Literal('blocker')]),
    label: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { $id: 'AuthoringReleaseFinding', additionalProperties: false },
);
export type AuthoringReleaseFinding = Static<typeof AuthoringReleaseFinding>;

export const AUTHORING_RELEASE_PIPELINE_STATES = [
  'not_published',
  'activating',
  'active_unverified',
  'verified',
  'update_available',
  'awaiting_approval',
  'failed',
  'inactive',
] as const;

export const AUTHORING_RELEASE_NEXT_ACTIONS = [
  'review_blockers',
  'publish_staging',
  'verify_staging',
  'request_approval',
  'promote_production',
  'live_in_production',
  'none',
] as const;

export const AuthoringReleasePipelineState = Type.Union(
  AUTHORING_RELEASE_PIPELINE_STATES.map((value) => Type.Literal(value)),
  { $id: 'AuthoringReleasePipelineState' },
);
export type AuthoringReleasePipelineState = Static<typeof AuthoringReleasePipelineState>;

export const AuthoringReleaseNextAction = Type.Union(
  AUTHORING_RELEASE_NEXT_ACTIONS.map((value) => Type.Literal(value)),
  { $id: 'AuthoringReleaseNextAction' },
);
export type AuthoringReleaseNextAction = Static<typeof AuthoringReleaseNextAction>;

export const AuthoringReleaseVerificationSummary = Type.Object(
  {
    state: Type.Union([Type.Literal('not_run'), Type.Literal('passed'), Type.Literal('failed')]),
    verificationId: Type.Optional(Type.String(IDENTIFIER_OPTIONS)),
    verifiedAt: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  },
  { $id: 'AuthoringReleaseVerificationSummary', additionalProperties: false },
);
export type AuthoringReleaseVerificationSummary = Static<
  typeof AuthoringReleaseVerificationSummary
>;

const AuthoringReleasePipelineArtifact = Type.Object(
  {
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    generation: Type.Integer({ minimum: 0 }),
    publicationId: Type.Union([Type.String(IDENTIFIER_OPTIONS), Type.Null()]),
    compiledArtifactId: Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()]),
    contentHash: Type.Union([Type.String({ pattern: CONTENT_HASH_PATTERN }), Type.Null()]),
  },
  { additionalProperties: false },
);

/** Complete document-scoped pipeline truth for one authoring top-bar action. */
export const AuthoringReleasePipeline = Type.Object(
  {
    state: Type.Ref(AuthoringReleasePipelineState),
    nextAction: Type.Ref(AuthoringReleaseNextAction),
    staging: Type.Object(
      {
        ...AuthoringReleasePipelineArtifact.properties,
        sourcePublicationId: Type.Union([Type.String(IDENTIFIER_OPTIONS), Type.Null()]),
        verification: Type.Ref(AuthoringReleaseVerificationSummary),
      },
      { additionalProperties: false },
    ),
    production: AuthoringReleasePipelineArtifact,
    approvals: Type.Object(
      {
        operationId: Type.Union([Type.String(IDENTIFIER_OPTIONS), Type.Null()]),
        requiredCount: Type.Integer({ minimum: 0, maximum: 1 }),
        approvedCount: Type.Integer({ minimum: 0, maximum: 1 }),
        rejected: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
  },
  { $id: 'AuthoringReleasePipeline', additionalProperties: false },
);
export type AuthoringReleasePipeline = Static<typeof AuthoringReleasePipeline>;

/** Normalized, document-scoped staging truth shared by hosted and direct authoring. */
export const AuthoringStagingReleaseState = Type.Object(
  {
    available: Type.Boolean(),
    environment: AuthoringEnvironment,
    environmentId: Type.String(IDENTIFIER_OPTIONS),
    documentId: Type.String(IDENTIFIER_OPTIONS),
    expectedGeneration: Type.Integer({ minimum: 0 }),
    draftArtifactId: Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()]),
    draftContentHash: Type.Union([Type.String({ pattern: CONTENT_HASH_PATTERN }), Type.Null()]),
    activeContentHash: Type.Union([Type.String({ pattern: CONTENT_HASH_PATTERN }), Type.Null()]),
    state: AuthoringStagingReleaseStateName,
    findings: Type.Array(Type.Ref(AuthoringReleaseFinding), { maxItems: 64 }),
    /** Additive Slice 3 truth; legacy Slice 2 clients can continue ignoring it. */
    pipeline: Type.Optional(Type.Ref(AuthoringReleasePipeline)),
  },
  { $id: 'AuthoringStagingReleaseState', additionalProperties: false },
);
export type AuthoringStagingReleaseState = Static<typeof AuthoringStagingReleaseState>;

export const AuthoringStagingPublicationRequest = Type.Object(
  {
    expectedGeneration: Type.Integer({ minimum: 0 }),
    expectedArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    expectedContentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    idempotencyKey: Type.String({
      minLength: 8,
      maxLength: 200,
      pattern: RELEASE_IDEMPOTENCY_KEY_PATTERN,
    }),
    correlationId: Type.String({
      minLength: 8,
      maxLength: 256,
      pattern: RELEASE_CORRELATION_ID_PATTERN,
    }),
  },
  { $id: 'AuthoringStagingPublicationRequest', additionalProperties: false },
);
export type AuthoringStagingPublicationRequest = Static<typeof AuthoringStagingPublicationRequest>;

const AuthoringStagingPublicationSuccess = Type.Object(
  {
    ok: Type.Literal(true),
    replayed: Type.Boolean(),
    generation: Type.Integer({ minimum: 1 }),
    findings: Type.Array(Type.Ref(AuthoringReleaseFinding), { maxItems: 64 }),
  },
  { additionalProperties: false },
);

const AuthoringStagingPublicationFailure = Type.Object(
  {
    ok: Type.Literal(false),
    code: Type.String({ minLength: 1, maxLength: 120 }),
    message: Type.String({ minLength: 1, maxLength: 512 }),
    expectedGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
    actualGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
    findings: Type.Array(Type.Ref(AuthoringReleaseFinding), { maxItems: 64 }),
  },
  { additionalProperties: false },
);

export const AuthoringStagingPublicationResult = Type.Union(
  [AuthoringStagingPublicationSuccess, AuthoringStagingPublicationFailure],
  { $id: 'AuthoringStagingPublicationResult' },
);
export type AuthoringStagingPublicationResult = Static<typeof AuthoringStagingPublicationResult>;

/** Identity-free browser evidence; the server resolves and stamps publication scope. */
export const AuthoringStagingVerificationRequest = Type.Object(
  {
    publicationId: Type.String(IDENTIFIER_OPTIONS),
    report: Type.Ref(BrowserVerificationReport),
  },
  { $id: 'AuthoringStagingVerificationRequest', additionalProperties: false },
);
export type AuthoringStagingVerificationRequest = Static<
  typeof AuthoringStagingVerificationRequest
>;

const AuthoringStagingVerificationSuccess = Type.Object(
  {
    ok: Type.Literal(true),
    verification: Type.Ref(PublicationVerification),
  },
  { additionalProperties: false },
);

const AuthoringStagingVerificationFailure = Type.Object(
  {
    ok: Type.Literal(false),
    code: Type.Union([
      Type.Literal('publication_not_active'),
      Type.Literal('artifact_changed'),
      Type.Literal('origin_mismatch'),
      Type.Literal('capability_denied'),
      Type.Literal('invalid_report'),
      Type.Literal('internal_error'),
    ]),
    message: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);

export const AuthoringStagingVerificationResult = Type.Union(
  [AuthoringStagingVerificationSuccess, AuthoringStagingVerificationFailure],
  { $id: 'AuthoringStagingVerificationResult' },
);
export type AuthoringStagingVerificationResult = Static<typeof AuthoringStagingVerificationResult>;

export const SdkAuthoringReleaseDescriptor = Type.Object(
  {
    releaseState: Type.Object(
      {
        capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE),
        url: Type.String({ minLength: 1, maxLength: 2_048 }),
      },
      { additionalProperties: false },
    ),
    recoveryState: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
    rollback: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
    unpublish: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
    stagingPublication: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
    stagingVerification: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
    productionApproval: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
    productionPromotion: Type.Optional(
      Type.Object(
        {
          capability: Type.Literal(AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION),
          url: Type.String({ minLength: 1, maxLength: 2_048 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'SdkAuthoringReleaseDescriptor', additionalProperties: false },
);
export type SdkAuthoringReleaseDescriptor = Static<typeof SdkAuthoringReleaseDescriptor>;

/**
 * Public SDK bootstrap contract used by the dashboard snippet and browser
 * loader. The environment token is transported in the Authorization header,
 * not in this payload, so it does not leak through URLs.
 */
export const SdkBootstrapRequest = Type.Object(
  {
    environment: Environment,
    href: Type.Optional(Type.String()),
    origin: Type.Optional(Type.String()),
  },
  { $id: 'SdkBootstrapRequest', additionalProperties: false },
);
export type SdkBootstrapRequest = Static<typeof SdkBootstrapRequest>;

export const SdkInstallContext = Type.Object(
  {
    workspaceId: Type.String(),
    environmentId: Type.Optional(Type.String(IDENTIFIER_OPTIONS)),
    environment: Environment,
    correlationId: Type.Optional(Type.String()),
    manifest: ManifestPointer,
    currentDocumentUrl: Type.String(),
    ingestUrl: Type.String(),
    analyticsPointers: Type.Optional(
      Type.Array(Type.Ref(AnalyticsDocumentPointer), {
        maxItems: MAX_ACTIVE_DOCUMENT_MANIFESTS,
        uniqueItems: true,
      }),
    ),
    authoring: Type.Optional(
      Type.Object(
        {
          enabled: Type.Boolean(),
          iframeSrc: Type.Optional(Type.String()),
          sessionId: Type.Optional(Type.String()),
          correlationId: Type.Optional(Type.String()),
          expiresAt: Type.Optional(Type.String()),
          documentUrl: Type.Optional(Type.String()),
          saveDocumentUrl: Type.Optional(Type.String()),
          release: Type.Optional(SdkAuthoringReleaseDescriptor),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: 'SdkInstallContext', additionalProperties: false },
);
export type SdkInstallContext = Static<typeof SdkInstallContext>;

/**
 * The pre-flight an installed page reads before it will talk to the control
 * plane at all (ADR-0027).
 *
 * The bootstrap POST cannot be cached — it is a POST, it carries page intent,
 * and it can mint a short-lived authoring grant. That makes it the wrong shape
 * for the question almost every page view actually asks, which is "is there
 * anything here for me?". The digest answers exactly that question with a
 * cacheable GET, so a visitor clicking through twenty pages of an application
 * that has one tour on one screen makes one network request, not twenty.
 *
 * It is deliberately not a security boundary. Everything in it is already
 * visible to anyone reading the installed page, and a page that fails to fetch
 * it proceeds to the bootstrap exactly as before.
 */
export const SDK_ELIGIBILITY_DIGEST_SCHEMA_VERSION = '1';

export const SdkEligibilityPagePattern = Type.Object(
  {
    pattern: Type.String({ minLength: 1, maxLength: 2_048 }),
    mode: Type.Union([Type.Literal('exact'), Type.Literal('prefix'), Type.Literal('contains')]),
  },
  { $id: 'SdkEligibilityPagePattern', additionalProperties: false },
);
export type SdkEligibilityPagePattern = Static<typeof SdkEligibilityPagePattern>;

/**
 * `none` — nothing is published, so no page is eligible.
 * `all` — at least one active experience can fire anywhere, so every page is.
 * `patterns` — only pages matching one of these are eligible.
 */
export const SdkEligibilityScope = Type.Union(
  [
    Type.Object({ kind: Type.Literal('none') }, { additionalProperties: false }),
    Type.Object({ kind: Type.Literal('all') }, { additionalProperties: false }),
    Type.Object(
      {
        kind: Type.Literal('patterns'),
        patterns: Type.Array(SdkEligibilityPagePattern, {
          minItems: 1,
          maxItems: MAX_ACTIVE_DOCUMENT_MANIFESTS,
        }),
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'SdkEligibilityScope' },
);
export type SdkEligibilityScope = Static<typeof SdkEligibilityScope>;

export const SdkEligibilityDigest = Type.Object(
  {
    schemaVersion: Type.Literal(SDK_ELIGIBILITY_DIGEST_SCHEMA_VERSION),
    installationId: PublicSdkInstallationId,
    /**
     * The kill switch. `false` stops the SDK before it loads any further
     * module, so a customer whose page is misbehaving can turn Lodariq off from
     * the dashboard without shipping a deploy or editing their markup.
     */
    enabled: Type.Boolean(),
    scope: SdkEligibilityScope,
  },
  { $id: 'SdkEligibilityDigest', additionalProperties: false },
);
export type SdkEligibilityDigest = Static<typeof SdkEligibilityDigest>;

/**
 * How long a visitor may reuse a cached digest, and how long an edge may serve
 * a stale one while revalidating. The freshness window is also the worst-case
 * delay on the kill switch, which is why it is minutes rather than hours.
 */
export const SDK_ELIGIBILITY_DIGEST_MAX_AGE_SECONDS = 300;
export const SDK_ELIGIBILITY_DIGEST_STALE_WHILE_REVALIDATE_SECONDS = 86_400;
