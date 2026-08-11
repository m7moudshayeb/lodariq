import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Type } from '@sinclair/typebox';
import {
  canonicalJson,
  compileDocument,
  runBasicVisualPreflight,
  sha256Hex,
} from '@lodariq/compiler';
import {
  ANALYTICS_EVENT_LIMITS,
  AnalyticsAggregateResponse,
  AnalyticsEvent,
  AnalyticsEnvironmentQuery,
  AUTHORING_ACTIVATION_GRANT_HEADER,
  AUTHORING_ACTIVATION_PROTOCOL,
  AUTHORING_BOOTSTRAP_GRANT_HEADER,
  AUTHORING_SESSION_CAPABILITIES,
  AUTHORING_SESSION_HEADER,
  AuthoringAuthorizationContext,
  AuthoringAuthorizationRequest,
  AuthoringAuthorizationResult,
  AuthoringCodeExchangeRequest,
  AuthoringCodeExchangeResult,
  AuthoringDocumentPayload,
  AuthoringDocumentSessionResult,
  AuthoringBrandDriftCheckResult,
  AuthoringBrandThemeAcknowledgementRequest,
  AuthoringBrandThemeAcknowledgementResult,
  AuthoringProductMatchApplyResult,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringStagingVerificationRequest,
  AuthoringStagingVerificationResult,
  BROWSER_VERIFICATION_CHECK_CODES,
  BRAND_THEME_CONTRACT_VERSION,
  BrandDriftCheckRequest,
  BrandThemeDefinition,
  BrowserVerificationReport,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  CompiledDocument,
  ControlPlaneAuthContext,
  CreateAuthoringDocumentSessionRequest,
  CreatorModuleDescriptor,
  DEFAULT_EXPERIENCE_APPEARANCE,
  EnvironmentReleasePolicy,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  LODARIQ_STAGING_EDITOR_ORIGIN,
  LodariqDocument,
  MAX_ACTIVE_DOCUMENT_MANIFESTS,
  RENDERER_CONTRACT_VERSION,
  LODARIQ_APP_ORIGIN,
  LODARIQ_AUTHORING_ACTIVATION_URL,
  LODARIQ_STAGING_APP_ORIGIN,
  LODARIQ_STAGING_AUTHORING_ACTIVATION_URL,
  PublicSdkBootstrapContext,
  PublicSdkBootstrapRequest,
  ProductStyleProposal,
  PublicationVerification,
  ProductionPromotionRequest,
  ProductionPromotionResult,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
  QueryAuthoringDocumentsRequest,
  QueryAuthoringDocumentsResult,
  RevokeAuthoringActivationRequest,
  SdkBootstrapRequest,
  SdkInstallContext,
  ThemeBinding,
  basicVisualPreflightIssueLabel,
  evaluateEnvironmentReleasePolicy,
  publishReadinessIssueLabel,
  validate,
  validateTourPublishReadiness,
  type AuthoringAuthorizationRequest as AuthoringAuthorizationRequestType,
  type AnalyticsEnvironmentQuery as AnalyticsEnvironmentQueryType,
  type ActiveManifestPointerV2,
  type BrandThemeDefinition as BrandThemeDefinitionType,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
  type AuthoringCodeExchangeRequest as AuthoringCodeExchangeRequestType,
  type AuthoringDocumentPayload as AuthoringDocumentPayloadType,
  type AuthoringBrandThemeAcknowledgementRequest as AuthoringBrandThemeAcknowledgementRequestType,
  type AuthoringBrandThemeAcknowledgementResult as AuthoringBrandThemeAcknowledgementResultType,
  type BrandDriftCheckRequest as BrandDriftCheckRequestType,
  type AuthoringStagingPublicationResult as AuthoringStagingPublicationResultType,
  type AuthoringStagingReleaseState as AuthoringStagingReleaseStateType,
  type AuthoringStagingVerificationRequest as AuthoringStagingVerificationRequestType,
  type AuthoringStagingVerificationResult as AuthoringStagingVerificationResultType,
  type AuthoringSessionCapability,
  type CreateAuthoringDocumentSessionRequest as CreateAuthoringDocumentSessionRequestType,
  type CompiledDocument as CompiledDocumentType,
  type CreatorModuleDescriptor as CreatorModuleDescriptorType,
  type EnvironmentReleasePolicy as EnvironmentReleasePolicyType,
  type PublishReadinessIssue,
  type PublicSdkBootstrapContext as PublicSdkBootstrapContextType,
  type PublicSdkBootstrapRequest as PublicSdkBootstrapRequestType,
  type ProductStyleProposal as ProductStyleProposalType,
  type PublicationVerification as PublicationVerificationType,
  type ProductionPromotionRequest as ProductionPromotionRequestType,
  type ProductionPromotionResult as ProductionPromotionResultType,
  type ReleaseRecoveryRequest as ReleaseRecoveryRequestType,
  type ReleaseRecoveryResult as ReleaseRecoveryResultType,
  type ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseType,
  type QueryAuthoringDocumentsRequest as QueryAuthoringDocumentsRequestType,
  type RevokeAuthoringActivationRequest as RevokeAuthoringActivationRequestType,
  type SdkBootstrapRequest as SdkBootstrapRequestType,
  type SdkInstallContext as SdkInstallContextType,
  type ThemeBinding as ThemeBindingType,
  type WorkspaceEnvironmentPolicyRow,
} from '@lodariq/schema';
import {
  AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE,
  ActivePublicationChangedError,
  AmbiguousCurrentPublicationError,
  DeploymentChangedError,
  EnvironmentReleasePolicyChangedError,
  EnvironmentPolicyMutationForbiddenError,
  IdempotencyConflictError,
  ProductStyleProposalConflictError,
  PublicationVerificationRequiredError,
  ReleaseApprovalRejectedError,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  ReleaseRecoveryHistoryIntegrityError,
  ReleaseRecoveryHistoryLimitExceededError,
  ReleaseOperationInProgressError,
  WorkspaceThemeApprovalRequiredError,
  WorkspaceThemeChangedError,
  WorkspaceEnvironmentPolicyInvalidError,
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
  createAuthoringActivationGrant,
  createAuthoringAuthorizationCode,
  createAuthoringSessionToken,
  createEnvironmentClientToken,
  createPublicSdkBootstrapGrant,
  createPublicSdkInstallationId,
  getEnvironmentTokenPrefix,
  hashAuthoringSessionToken,
  hashAuthoringActivationGrant,
  hashAuthoringAuthorizationCode,
  hashAuthoringAuthorizationState,
  hashEnvironmentToken,
  hashPublicSdkBootstrapGrant,
  PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS,
  type AuthoringSessionRecord,
  type AuthoringAuthorizationRequestRecord,
  type ControlPlaneRepository,
  type DocumentSummary,
  type EnvironmentTokenRecord,
  type PersistedCompiledArtifact,
  type PersistedDocument,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type PublicationVerificationRecord,
  type ReleaseApprovalRecord,
  type ResolvedPublicSdkInstallation,
  type ResolvedEnvironmentToken,
  type StyleSourceRecord,
  type VisualCheckRunRecord,
  type WorkspaceThemeRecord,
  type WorkspaceEnvironment,
  normalizeReleaseApprovalReason,
  toWorkspaceEnvironmentPolicy,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthError, type AuthContext, type AuthProvider, type AuthRole } from '../auth';
import {
  createObservabilityEvent,
  type ObservabilityEvent,
  type ObservabilitySink,
} from '../observability';
import { renderPublicSdkInstallationSnippet, renderSdkInstallationSnippet } from '../snippets';
import { bootstrapClaimsMatchOrigin, parseExactBrowserOrigin } from '../sdk-origin';
import { promoteExactVerifiedPublication } from '../releases/promotion';
import {
  ReleaseRecoveryResponseValidationError,
  releaseRecoveryHttpStatus,
  validateReleaseRecoveryResult,
  validateReleaseRecoveryStateResponse,
} from '../releases/recovery';
import {
  resolveAuthoritativeAnalyticsBatch,
  type ResolvedAnalyticsPointer,
} from '../analytics/authoritative-events';
import { BrandDriftCheckError, checkAuthoringBrandDrift } from '../brand-drift';
import {
  BrandThemeAcknowledgementError,
  acknowledgeAuthoringBrandTheme,
} from '../brand-theme-acknowledgement';
import { mergeProductStyleTokensIntoDraft } from '../product-style-theme';

const DocumentParams = Type.Object(
  {
    documentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const SdkDocumentParams = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    documentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const SdkDocumentArtifactParams = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    documentId: Type.String({ minLength: 1 }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

const SDK_DOCUMENT_PATH =
  '/v1/sdk/workspaces/:workspaceId/environments/:environmentId/documents/:documentId';
const SDK_DOCUMENT_MANIFEST_PATH = `${SDK_DOCUMENT_PATH}/manifest`;
const SDK_DOCUMENT_ARTIFACT_PATH = `${SDK_DOCUMENT_PATH}/artifacts/:contentHash`;

const ThemeParams = Type.Object(
  {
    themeId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);

const EnvironmentParams = Type.Object(
  { environmentId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

const DocumentEnvironmentParams = Type.Object(
  {
    documentId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);

const DIRECT_RELEASE_RECOVERY_PATH =
  '/v1/sdk/authoring/environments/:environmentId/release-recovery';
const HOSTED_RELEASE_RECOVERY_PATH = '/v1/authoring/environments/:environmentId/release-recovery';
const DASHBOARD_RELEASE_RECOVERY_PATH =
  '/v1/documents/:documentId/environments/:environmentId/release-recovery';

const UpdateWorkspaceEnvironmentPolicyBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120, pattern: '^\\S(?:[\\s\\S]*\\S)?$' }),
    originAllowlist: Type.Array(Type.String({ minLength: 1, maxLength: 2048 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
    enabled: Type.Boolean(),
    pipelinePosition: Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)]),
    authoringEnabled: Type.Boolean(),
    promotionSourceEnvironmentId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    releasePolicy: EnvironmentReleasePolicy,
    expectedUpdatedAt: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const PublicationParams = Type.Object(
  { publicationId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

const ReleaseOperationParams = Type.Object(
  { operationId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

const EnvironmentTokenParams = Type.Object(
  {
    tokenId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const CreateEnvironmentTokenBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
);

const CreatePublicSdkInstallationBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
);

const PublicSdkInstallationParams = Type.Object(
  {
    installationId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);

const AuthoringAuthorizationRequestParams = Type.Object(
  {
    requestId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);

const AuthoringSessionParams = Type.Object(
  {
    sessionId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);

const ApproveAuthoringAuthorizationRequestBody = Type.Object(
  {
    state: Type.String({ minLength: 32, maxLength: 2048 }),
  },
  { additionalProperties: false },
);

const ConfigurePublicSdkInstallationOriginBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    origin: Type.String({ minLength: 1, maxLength: 2048 }),
    authoringEnabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

const SyncPublicSdkInstallationOriginsBody = Type.Object(
  {
    origins: Type.Array(ConfigurePublicSdkInstallationOriginBody, { maxItems: 100 }),
  },
  { additionalProperties: false },
);

const PublicSdkInstallationOriginResponse = Type.Object(
  {
    installationId: Type.String({ minLength: 1 }),
    workspaceId: Type.String({ minLength: 1 }),
    environmentId: Type.String({ minLength: 1 }),
    exactOrigin: Type.String({ minLength: 1 }),
    authoringEnabled: Type.Boolean(),
    createdAt: Type.String({ minLength: 1 }),
    updatedAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const PublicSdkInstallationResponse = Type.Object(
  {
    installationId: Type.String({ minLength: 1 }),
    workspaceId: Type.String({ minLength: 1 }),
    name: Type.String(),
    createdByUserId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    createdAt: Type.String({ minLength: 1 }),
    updatedAt: Type.String({ minLength: 1 }),
    revokedAt: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    origins: Type.Array(PublicSdkInstallationOriginResponse),
    sdkSnippet: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const ListPublicSdkInstallationsResponse = Type.Object(
  { installations: Type.Array(PublicSdkInstallationResponse) },
  { additionalProperties: false },
);

const ApiErrorResponse = Type.Object(
  {
    error: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const CreateAuthoringSessionBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    environmentClientToken: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const CreateStagingPublicationBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    expectedGeneration: Type.Integer({ minimum: 0 }),
    expectedArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    expectedContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

const CreateAuthoringStagingPublicationBody = Type.Object(
  {
    expectedGeneration: Type.Integer({ minimum: 0 }),
    expectedArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    expectedContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

const CreateDashboardStyleSourceBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    proposal: ProductStyleProposal,
  },
  { additionalProperties: false },
);

const CreateAuthoringStyleSourceBody = Type.Object(
  { proposal: ProductStyleProposal },
  { additionalProperties: false },
);

// Fastify's serializer cannot compile the nested discriminated unions in the
// canonical success schema. The handler validates the complete canonical
// result before sending it; this transport schema only controls serialization.
const AuthoringStagingVerificationHttpSuccess = Type.Object(
  {
    ok: Type.Literal(true),
    verification: Type.Unknown(),
  },
  { additionalProperties: false },
);

const AuthoringStagingVerificationHttpError = Type.Union([
  ApiErrorResponse,
  Type.Extract(AuthoringStagingVerificationResult, Type.Object({ ok: Type.Literal(false) })),
]);

const CreateDashboardPublicationVerificationBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    report: BrowserVerificationReport,
  },
  { additionalProperties: false },
);

const CreateReleaseApprovalBody = Type.Object(
  {
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  },
  { additionalProperties: false },
);

const UpdateEnvironmentReleasePolicyBody = Type.Object(
  {
    requiredApprovalCount: Type.Union([Type.Literal(0), Type.Literal(1)]),
    expectedUpdatedAt: Type.String({ minLength: 20, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const WorkspaceThemeMutationGuardBody = Type.Object(
  {
    expectedRevision: Type.Integer({ minimum: 1 }),
    expectedUpdatedAt: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const CreateWorkspaceThemeBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    draft: BrandThemeDefinition,
  },
  { additionalProperties: false },
);

const UpdateWorkspaceThemeBody = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    draft: BrandThemeDefinition,
    expectedRevision: Type.Integer({ minimum: 1 }),
    expectedUpdatedAt: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

const SetDocumentThemeBindingBody = Type.Object(
  { binding: ThemeBinding },
  { additionalProperties: false },
);

const IngestEventsBody = Type.Object(
  {
    events: Type.Array(AnalyticsEvent, { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: false },
);

const SdkIngestEventsBody = Type.Object(
  {
    events: Type.Array(Type.Unknown(), {
      minItems: 1,
      maxItems: ANALYTICS_EVENT_LIMITS.batchSize,
    }),
  },
  { additionalProperties: false },
);

const SdkAuthoringDocumentBody = Type.Object(
  {
    document: Type.Unknown(),
  },
  { additionalProperties: false },
);

interface RegisterControlPlaneRoutesOptions {
  repository: ControlPlaneRepository;
  authProvider: AuthProvider;
  publicApiBaseUrl: string;
  loaderSrc?: string;
  publicLoaderSrc?: string;
  creatorLoaderSrc?: string;
  creatorModule?: CreatorModuleDescriptorType;
  authoringIframeSrc: string;
  observability: ObservabilitySink;
}

const PUBLIC_SDK_INSTALLATION_HEADER = 'x-lodariq-installation-id';
const SDK_DELIVERY_RETRY_ATTEMPT_HEADER = 'x-lodariq-retry-attempt';
const SDK_DELIVERY_MAX_OBSERVED_DURATION_MS = 60_000;
const AUTHORING_SESSION_TTL_MS = 15 * 60 * 1000;
const AUTHORING_AUTHORIZATION_REQUEST_TTL_MS = Math.min(
  110 * 1000,
  AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS,
);
const AUTHORING_AUTHORIZATION_CODE_TTL_MS = Math.max(
  AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
  Math.min(75 * 1000, AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS),
);
const AUTHORING_ACTIVATION_GRANT_TTL_MS = Math.min(
  2 * 60 * 1000,
  AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS,
);
const PUBLIC_SDK_BOOTSTRAP_GRANT_TTL_MS = Math.min(
  2 * 60 * 1000,
  PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS,
);
const CREATOR_MODULE_CONTENT_ADDRESS_PATTERN = /\/sha256-[0-9a-f]{64}(?:\/|$)/u;
const DOCUMENT_SPECIFIC_DELIVERY_REQUIRED_ERROR = 'document_specific_delivery_required';
const DOCUMENT_RELEASE_MIGRATION_REQUIRED_ERROR = 'document_release_migration_required';
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const RELEASE_CORRELATION_ID_HEADER = 'x-lodariq-correlation-id';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u;
const RELEASE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/u;

type EnvironmentTokenResponse = Omit<EnvironmentTokenRecord, 'clientToken' | 'tokenHash'>;
type CompiledArtifactResponse = Omit<PersistedCompiledArtifact, 'compiled'>;
type PublicationResponse = Omit<PersistedPublication, 'artifact'> & {
  artifact: CompiledArtifactResponse;
};
type AuthoringSessionResponse = Omit<AuthoringSessionRecord, 'tokenHash'>;

export function registerControlPlaneRoutes(
  fastify: FastifyInstance,
  options: RegisterControlPlaneRoutesOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const requireFirstPartyAppOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedFirstPartyAppOrigin(request, reply, deploymentOrigins.app);
  const requireEditorOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor);
  const setEditorCorsHeaders = (reply: FastifyReply): void =>
    setExpectedEditorCorsHeaders(reply, deploymentOrigins.editor);

  fastify.get('/healthz', async () => ({ ok: true }));

  fastify.get('/readyz', async (_request, reply) => {
    try {
      await options.repository.checkReadiness();
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  fastify.get(
    '/v1/auth/context',
    { schema: { response: { 200: ControlPlaneAuthContext } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      return {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        role: auth.role,
      };
    },
  );

  for (const path of [
    '/v1/sdk/bootstrap',
    '/v1/sdk/current-document',
    SDK_DOCUMENT_PATH,
    SDK_DOCUMENT_MANIFEST_PATH,
    SDK_DOCUMENT_ARTIFACT_PATH,
    '/v1/sdk/events',
    '/v1/sdk/authoring/authorization-requests',
    '/v1/sdk/authoring/exchange',
    '/v1/sdk/authoring/document',
    '/v1/sdk/authoring/release-state',
    DIRECT_RELEASE_RECOVERY_PATH,
    '/v1/sdk/authoring/publications',
    '/v1/sdk/authoring/brand-drift',
    '/v1/sdk/authoring/brand-theme-acknowledgement',
    '/v1/sdk/authoring/style-sources',
    '/v1/sdk/authoring/verifications',
    '/v1/sdk/authoring/promotions',
    '/v1/sdk/authoring/release-operations/:operationId/approvals',
  ]) {
    fastify.options(path, async (request, reply) => {
      setSdkPreflightCorsHeaders(request, reply);
      return reply.code(204).send();
    });
  }

  for (const path of [
    '/v1/authoring/authorization-requests/:requestId',
    '/v1/authoring/authorization-requests/:requestId/approve',
  ]) {
    fastify.options(path, async (request, reply) => {
      if (!requireFirstPartyAppOrigin(request, reply)) return;
      return reply.code(204).send();
    });
  }

  fastify.options('/v1/authoring/sessions', async (request, reply) => {
    if (parseExactBrowserOrigin(request.headers.origin) === LODARIQ_EDITOR_ORIGIN) {
      setEditorCorsHeaders(reply);
      return reply.code(204).send();
    }
    if (!requireFirstPartyAppOrigin(request, reply)) return;
    return reply.code(204).send();
  });

  for (const path of [
    '/v1/authoring/document',
    '/v1/authoring/documents/query',
    '/v1/authoring/activation/revoke',
    '/v1/authoring/release-state',
    HOSTED_RELEASE_RECOVERY_PATH,
    '/v1/authoring/publications',
    '/v1/authoring/brand-drift',
    '/v1/authoring/brand-theme-acknowledgement',
    '/v1/authoring/style-sources',
    '/v1/authoring/verifications',
    '/v1/authoring/promotions',
    '/v1/authoring/release-operations/:operationId/approvals',
    '/v1/authoring/sessions/:sessionId/revoke',
  ]) {
    fastify.options(path, async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      return reply.code(204).send();
    });
  }

  fastify.options(DASHBOARD_RELEASE_RECOVERY_PATH, async (request, reply) => {
    if (!requireFirstPartyAppOrigin(request, reply)) return;
    return reply.code(204).send();
  });

  fastify.post(
    '/v1/sdk/bootstrap',
    { schema: { body: Type.Union([PublicSdkBootstrapRequest, SdkBootstrapRequest]) } },
    async (request, reply) => {
      const body = request.body as PublicSdkBootstrapRequestType | SdkBootstrapRequestType;
      if ('installationId' in body) {
        return bootstrapPublicSdkInstallation(options, body, request, reply);
      }

      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      if (body.environment !== token.environment) {
        return reply.code(403).send({
          error: 'environment_mismatch',
          message: 'SDK token is not valid for the requested environment',
        });
      }

      if (readHeader(request, AUTHORING_SESSION_HEADER)) {
        const authoringSession = await authenticateAuthoringSessionForToken(
          options.repository,
          token,
          request,
          reply,
        );
        if (!authoringSession) return;

        const record = await options.repository.getDocument(
          token.workspaceId,
          authoringSession.documentId,
        );
        if (!record) {
          return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
        }

        return createAuthoringSdkInstallContext(
          options.repository,
          options.publicApiBaseUrl,
          token,
          record,
          authoringSession,
          reply,
        );
      }

      const publication = await getLegacyCurrentPublication(
        options.repository,
        token.workspaceId,
        token.environmentId,
        reply,
      );
      if (reply.sent) return;
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No published tour artifact is available for this environment',
        });
      }

      const deployment = await options.repository.getDocumentDeployment(
        token.workspaceId,
        token.environmentId,
        publication.documentId,
      );
      return createViewerSdkInstallContext(
        options.publicApiBaseUrl,
        token,
        publication,
        deployment,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/authorization-requests',
    { schema: { body: AuthoringAuthorizationRequest } },
    async (request, reply) => {
      const body = request.body as AuthoringAuthorizationRequestType;
      const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
      const bootstrapGrant = readHeader(request, AUTHORING_BOOTSTRAP_GRANT_HEADER);
      if (!exactOrigin || !bootstrapGrant) {
        return reply.code(400).send({
          error: 'authoring_activation_scope_required',
          message: 'Authoring activation requires a canonical browser Origin and bootstrap grant',
        });
      }
      if (body.customerOrigin !== exactOrigin) {
        return reply.code(403).send({
          error: 'origin_claim_mismatch',
          message: 'Authorization request origin does not match the browser Origin',
        });
      }

      const resolved = await requirePublicAuthoringScope(
        options.repository,
        body.installationId,
        exactOrigin,
        reply,
      );
      if (!resolved) return;
      setAllowedSdkCorsHeaders(exactOrigin, reply);

      const expiresAt = new Date(Date.now() + AUTHORING_AUTHORIZATION_REQUEST_TTL_MS).toISOString();
      const authorizationRequest = await options.repository.createAuthoringAuthorizationRequest({
        installationId: body.installationId,
        exactOrigin,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(body.state),
        codeChallenge: body.codeChallenge,
        requestedCapabilities: [...body.requestedCapabilities],
        ...(body.documentIntent ? { documentIntent: body.documentIntent } : {}),
        expiresAt,
      });
      if (!authorizationRequest) {
        return reply.code(403).send({
          error: 'authoring_authorization_rejected',
          message: 'Authoring authorization request is invalid, expired, or outside policy',
        });
      }

      const context = validateAuthoringAuthorizationContext({
        requestId: authorizationRequest.requestId,
        installationId: authorizationRequest.installationId,
        workspaceId: authorizationRequest.workspaceId,
        environmentId: authorizationRequest.environmentId,
        environment: authorizationRequest.environment,
        customerOrigin: authorizationRequest.exactOrigin,
        state: body.state,
        codeChallenge: authorizationRequest.codeChallenge,
        codeChallengeMethod: authorizationRequest.codeChallengeMethod,
        requestedCapabilities: authorizationRequest.requestedCapabilities,
        ...(authorizationRequest.documentIntent
          ? { documentIntent: authorizationRequest.documentIntent }
          : {}),
        expiresAt: authorizationRequest.expiresAt,
      });
      setCredentialResponseHeaders(reply);
      return reply.code(201).send(context);
    },
  );

  fastify.get(
    '/v1/authoring/authorization-requests/:requestId',
    { schema: { params: AuthoringAuthorizationRequestParams } },
    async (request, reply) => {
      if (!requireFirstPartyAppOrigin(request, reply)) return;
      const { requestId } = request.params as { requestId: string };
      const resolved = await authenticateAuthoringAuthorizationRequest(
        options.repository,
        options.authProvider,
        request,
        reply,
        requestId,
      );
      if (!resolved) return;
      const authorizationRequest = resolved.request;
      if (authorizationRequest.approvedAt || authorizationRequest.authorizationCodeHash) {
        return reply.code(409).send({
          error: 'authorization_request_not_pending',
          message: 'Authoring authorization request is no longer pending',
        });
      }

      return {
        requestId: authorizationRequest.requestId,
        installationId: authorizationRequest.installationId,
        environmentId: authorizationRequest.environmentId,
        environment: authorizationRequest.environment,
        customerOrigin: authorizationRequest.exactOrigin,
        requestedCapabilities: authorizationRequest.requestedCapabilities,
        ...(authorizationRequest.documentIntent
          ? { documentIntent: authorizationRequest.documentIntent }
          : {}),
        expiresAt: authorizationRequest.expiresAt,
      };
    },
  );

  fastify.post(
    '/v1/authoring/authorization-requests/:requestId/approve',
    {
      schema: {
        params: AuthoringAuthorizationRequestParams,
        body: ApproveAuthoringAuthorizationRequestBody,
      },
    },
    async (request, reply) => {
      if (!requireFirstPartyAppOrigin(request, reply)) return;
      const { requestId } = request.params as { requestId: string };
      const resolved = await authenticateAuthoringAuthorizationRequest(
        options.repository,
        options.authProvider,
        request,
        reply,
        requestId,
      );
      if (!resolved) return;
      const body = request.body as { state: string };
      const authorizationCode = createAuthoringAuthorizationCode();
      const authorizationCodeExpiresAt = new Date(
        Date.now() + AUTHORING_AUTHORIZATION_CODE_TTL_MS,
      ).toISOString();
      const approved = await options.repository.approveAuthoringAuthorizationRequest({
        workspaceId: resolved.request.workspaceId,
        requestId,
        stateHash: hashAuthoringAuthorizationState(body.state),
        creatorId: resolved.auth.userId,
        authorizationCodeHash: hashAuthoringAuthorizationCode(authorizationCode),
        authorizationCodeExpiresAt,
      });
      if (!approved) {
        return reply.code(409).send({
          error: 'authorization_request_not_approvable',
          message: 'Authoring authorization request is invalid, expired, or no longer pending',
        });
      }

      const result = validateAuthoringAuthorizationResult({
        protocol: AUTHORING_ACTIVATION_PROTOCOL,
        type: 'authoring.authorization.result',
        requestId: approved.requestId,
        state: body.state,
        authorizationCode,
        expiresAt: approved.authorizationCodeExpiresAt,
      });
      setCredentialResponseHeaders(reply);
      return reply.send(result);
    },
  );

  fastify.post(
    '/v1/sdk/authoring/exchange',
    { schema: { body: AuthoringCodeExchangeRequest } },
    async (request, reply) => {
      const body = request.body as AuthoringCodeExchangeRequestType;
      const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
      const bootstrapGrant = readHeader(request, AUTHORING_BOOTSTRAP_GRANT_HEADER);
      if (!exactOrigin || !bootstrapGrant) {
        return reply.code(400).send({
          error: 'authoring_activation_scope_required',
          message: 'Authoring exchange requires a canonical browser Origin and bootstrap grant',
        });
      }
      if (body.customerOrigin !== exactOrigin) {
        return reply.code(403).send({
          error: 'origin_claim_mismatch',
          message: 'Authorization exchange origin does not match the browser Origin',
        });
      }

      const resolved = await requirePublicAuthoringScope(
        options.repository,
        body.installationId,
        exactOrigin,
        reply,
      );
      if (!resolved) return;
      setAllowedSdkCorsHeaders(exactOrigin, reply);

      const creatorModule = resolveCreatorModule(options.creatorModule);
      if (!creatorModule) {
        return reply.code(503).send({
          error: 'creator_module_unavailable',
          message: 'The hosted creator module is not configured',
        });
      }

      const activationGrant = createAuthoringActivationGrant();
      const activationGrantExpiresAt = new Date(
        Date.now() + AUTHORING_ACTIVATION_GRANT_TTL_MS,
      ).toISOString();
      const exchanged = await options.repository.exchangeAuthoringAuthorizationCode({
        installationId: body.installationId,
        exactOrigin,
        requestId: body.requestId,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(body.state),
        authorizationCodeHash: hashAuthoringAuthorizationCode(body.authorizationCode),
        codeVerifier: body.codeVerifier,
        activationGrantHash: hashAuthoringActivationGrant(activationGrant),
        activationGrantExpiresAt,
      });
      if (!exchanged) {
        return reply.code(403).send({
          error: 'authoring_exchange_rejected',
          message: 'Authorization exchange is invalid, expired, or already used',
        });
      }

      const grant = exchanged.activationGrant;
      const result = validateAuthoringCodeExchangeResult({
        activationGrant,
        context: {
          grantId: grant.grantId,
          requestId: grant.requestId,
          installationId: grant.installationId,
          workspaceId: grant.workspaceId,
          environmentId: grant.environmentId,
          environment: grant.environment,
          customerOrigin: grant.exactOrigin,
          editorOrigin: deploymentOrigins.editor,
          creatorId: grant.creatorId,
          capabilities: grant.capabilities,
          ...(grant.documentIntent ? { documentIntent: grant.documentIntent } : {}),
          expiresAt: grant.expiresAt,
        },
        creatorModule,
      });
      setCredentialResponseHeaders(reply);
      return reply.send(result);
    },
  );

  fastify.get('/v1/sdk/current-document', async (request, reply) => {
    // This compatibility endpoint is selected by a credential-bearing header,
    // so a shared cache must never reuse one tenant's response for another.
    setPrivateDocumentResponseHeaders(reply);
    if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
      const resolved = await resolvePublicSdkRequest(options.repository, request, reply);
      if (!resolved) return;
      const publication = await getLegacyCurrentPublication(
        options.repository,
        resolved.installation.workspaceId,
        resolved.environment.id,
        reply,
      );
      if (reply.sent) return;
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No published tour artifact is available for this environment',
        });
      }
      return publication.artifact.compiled;
    }

    const token = await authenticateEnvironmentToken(options.repository, request, reply);
    if (!token) return;
    if (!requireSdkOrigin(token, request, reply)) return;

    const publication = await getLegacyCurrentPublication(
      options.repository,
      token.workspaceId,
      token.environmentId,
      reply,
    );
    if (reply.sent) return;
    const artifact = publication?.artifact ?? null;
    if (!artifact) {
      return reply.code(404).send({
        error: 'artifact_not_found',
        message: 'No published tour artifact is available for this environment',
      });
    }

    return artifact.compiled;
  });

  fastify.get(
    SDK_DOCUMENT_MANIFEST_PATH,
    { schema: { params: SdkDocumentParams } },
    async (request, reply) => {
      const scope = await resolveSdkDeliveryScope(options.repository, request, reply);
      if (!scope) return;
      const params = request.params as SdkDocumentPathParams;
      if (!requireSdkDeliveryPathScope(scope, params, reply)) return;
      const { documentId } = params;
      const observation = beginSdkDeliveryObservation(request);
      try {
        const deployment = await options.repository.getDocumentDeployment(
          scope.workspaceId,
          scope.environmentId,
          documentId,
        );
        if (!deployment) {
          emitSdkDeliveryResolution(options.observability, observation, scope, {
            resource: 'manifest',
            outcome: 'not_found',
            statusCode: 404,
            cacheOutcome: 'not_applicable',
          });
          return reply.code(404).send({
            error: 'manifest_not_found',
            message: 'No document deployment exists for this environment',
          });
        }

        const manifest =
          deployment.state === 'active'
            ? await createActiveManifestPointer(
                options.repository,
                options.publicApiBaseUrl,
                deployment,
              )
            : {
                schemaVersion: '2' as const,
                workspaceId: deployment.workspaceId,
                environmentId: deployment.environmentId,
                documentId: deployment.documentId,
                state: 'inactive' as const,
                generation: deployment.generation,
                deactivatedAt: deployment.updatedAt,
              };
        if (!manifest) {
          emitSdkDeliveryResolution(options.observability, observation, scope, {
            resource: 'manifest',
            outcome: 'inconsistent',
            statusCode: 409,
            cacheOutcome: 'not_applicable',
          });
          return reply.code(409).send({
            error: 'deployment_publication_missing',
            message: 'The active deployment does not resolve to an immutable publication',
          });
        }

        const body = canonicalJson(manifest);
        const etag = createJsonEtag(body);
        const notModified = requestMatchesEtag(request, etag);
        setManifestResponseHeaders(reply, etag);
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'manifest',
          outcome: manifest.state,
          statusCode: notModified ? 304 : 200,
          cacheOutcome: notModified ? 'not_modified' : 'served',
        });
        if (notModified) return reply.code(304).send();
        return reply.type('application/json; charset=utf-8').send(body);
      } catch (error) {
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'manifest',
          outcome: 'error',
          statusCode: 500,
          cacheOutcome: 'not_applicable',
        });
        throw error;
      }
    },
  );

  fastify.get(
    SDK_DOCUMENT_ARTIFACT_PATH,
    { schema: { params: SdkDocumentArtifactParams } },
    async (request, reply) => {
      const scope = await resolveSdkDeliveryScope(options.repository, request, reply);
      if (!scope) return;
      const params = request.params as SdkDocumentArtifactPathParams;
      if (!requireSdkDeliveryPathScope(scope, params, reply)) return;
      const { documentId, contentHash } = params;
      const observation = beginSdkDeliveryObservation(request);
      try {
        const publication = (
          await options.repository.listDocumentPublications(scope.workspaceId, documentId)
        ).find(
          (candidate) =>
            candidate.environmentId === scope.environmentId &&
            candidate.contentHash === contentHash,
        );
        if (!publication) {
          emitSdkDeliveryResolution(options.observability, observation, scope, {
            resource: 'artifact',
            outcome: 'not_found',
            statusCode: 404,
            cacheOutcome: 'not_applicable',
          });
          return reply.code(404).send({
            error: 'artifact_not_found',
            message:
              'The requested immutable document artifact was not published to this environment',
          });
        }

        const body = canonicalJson(publication.artifact.compiled);
        const etag = `"${contentHash}"`;
        const notModified = requestMatchesEtag(request, etag);
        setImmutableArtifactResponseHeaders(reply, etag);
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'artifact',
          outcome: 'found',
          statusCode: notModified ? 304 : 200,
          cacheOutcome: notModified ? 'not_modified' : 'served',
        });
        if (notModified) return reply.code(304).send();
        return reply.type('application/json; charset=utf-8').send(body);
      } catch (error) {
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'artifact',
          outcome: 'error',
          statusCode: 500,
          cacheOutcome: 'not_applicable',
        });
        throw error;
      }
    },
  );

  fastify.get(
    SDK_DOCUMENT_PATH,
    { schema: { params: SdkDocumentParams } },
    async (request, reply) => {
      const scope = await resolveSdkDeliveryScope(options.repository, request, reply);
      if (!scope) return;
      const params = request.params as SdkDocumentPathParams;
      if (!requireSdkDeliveryPathScope(scope, params, reply)) return;
      const { documentId } = params;
      const publication = await options.repository.getCurrentPublicationForDocument(
        scope.workspaceId,
        scope.environmentId,
        documentId,
      );
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No active artifact exists for this document in this environment',
        });
      }

      const body = canonicalJson(publication.artifact.compiled);
      const etag = `"${publication.contentHash}"`;
      setManifestResponseHeaders(reply, etag);
      if (requestMatchesEtag(request, etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  fastify.post(
    '/v1/sdk/events',
    { schema: { body: SdkIngestEventsBody } },
    async (request, reply) => {
      if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
        const resolved = await resolvePublicSdkRequest(options.repository, request, reply);
        if (!resolved) return;
        const body = request.body as { events: unknown[] };
        return ingestAuthoritativeSdkEvents(
          options.repository,
          {
            workspaceId: resolved.installation.workspaceId,
            environmentId: resolved.environment.id,
          },
          body.events,
          reply,
        );
      }

      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      const body = request.body as { events: unknown[] };
      return ingestAuthoritativeSdkEvents(
        options.repository,
        { workspaceId: token.workspaceId, environmentId: token.environmentId },
        body.events,
        reply,
      );
    },
  );

  fastify.get(
    '/v1/sdk/authoring/document',
    {
      schema: {
        response: {
          200: AuthoringDocumentPayload,
          401: ApiErrorResponse,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const authoringSession = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!authoringSession) return;
      setCredentialResponseHeaders(reply);

      const record = await options.repository.getDocument(
        token.workspaceId,
        authoringSession.documentId,
      );
      if (!record) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const theme = await resolveDocumentTheme(options.repository, record.document);
      if (!authoringSessionThemeMatches(authoringSession, theme)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }

      return validateAuthoringDocumentPayload({ document: record.document, theme });
    },
  );

  fastify.post(
    '/v1/sdk/authoring/document',
    { schema: { body: SdkAuthoringDocumentBody } },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const authoringSession = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!authoringSession) return;
      setCredentialResponseHeaders(reply);

      const body = request.body as { document: unknown };
      const canonical = validate(LodariqDocument, body.document);
      if (!canonical.valid) {
        return reply.code(400).send({
          error: 'invalid_document',
          message: 'Request body must contain canonical Lodariq block JSON',
          issues: canonical.errors,
        });
      }

      const document = canonical.value;
      if (document.workspaceId !== token.workspaceId) {
        return reply.code(403).send({
          error: 'workspace_mismatch',
          message: 'Document workspaceId must match the SDK token workspace',
        });
      }

      if (document.id !== authoringSession.documentId) {
        return reply.code(403).send({
          error: 'authoring_session_mismatch',
          message: 'Authoring session does not match the document being saved',
        });
      }

      const compiled = await compileAndValidate(options.repository, document);
      if (!authoringSessionArtifactMatches(authoringSession, compiled)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'compile.completed',
          correlationId: authoringSession.correlationId,
          workspaceId: token.workspaceId,
          documentId: document.id,
          environmentId: authoringSession.environmentId,
          userId: authoringSession.createdByUserId,
          attributes: { source: 'creator-save', contentHash: compiled.contentHash },
        }),
      );
      const saved = await options.repository.saveDocument({
        workspaceId: token.workspaceId,
        actorUserId: authoringSession.createdByUserId,
        document,
        artifact: compiled,
      });
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'authoring.save.completed',
          correlationId: authoringSession.correlationId,
          workspaceId: token.workspaceId,
          documentId: document.id,
          environmentId: authoringSession.environmentId,
          userId: authoringSession.createdByUserId,
          attributes: { contentHash: saved.latestArtifact?.contentHash },
        }),
      );

      return reply.code(200).send({
        document: {
          id: saved.document.id,
          workspaceId: saved.document.workspaceId,
          title: saved.document.title,
          updatedAt: saved.updatedAt,
          latestContentHash: saved.latestArtifact?.contentHash,
        },
        artifact: saved.latestArtifact
          ? {
              id: saved.latestArtifact.id,
              contentHash: saved.latestArtifact.contentHash,
              compilerVersion: saved.latestArtifact.compilerVersion,
              createdAt: saved.latestArtifact.createdAt,
            }
          : null,
      });
    },
  );

  fastify.get(
    '/v1/sdk/authoring/release-state',
    { schema: { response: { 200: AuthoringStagingReleaseState } } },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      if (!(await requireDirectSdkReleaseStateCapability(options.repository, session, reply))) {
        return;
      }

      setCredentialResponseHeaders(reply);
      return handleAuthoringReleaseState(options, session, reply, 'direct-sdk');
    },
  );

  fastify.get(
    DIRECT_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        response: {
          200: ReleaseRecoveryStateResponse,
          404: ApiErrorResponse,
          500: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;
      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      if (!(await requireDirectSdkReleaseStateCapability(options.repository, session, reply))) {
        return;
      }
      const { environmentId } = request.params as { environmentId: string };
      setCredentialResponseHeaders(reply);
      return handleReleaseRecoveryState(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        reply,
        authoringRecoveryPermissionIntersection(session),
      );
    },
  );

  fastify.post(
    DIRECT_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        body: ReleaseRecoveryRequest,
        response: {
          200: ReleaseRecoveryResult,
          201: ReleaseRecoveryResult,
          403: ReleaseRecoveryResult,
          404: ReleaseRecoveryResult,
          409: ReleaseRecoveryResult,
          500: ReleaseRecoveryResult,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;
      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      const recoveryRequest = request.body as ReleaseRecoveryRequestType;
      const { environmentId } = request.params as { environmentId: string };
      if (
        !(await requireDirectReleaseRecoveryCapability(
          options.repository,
          session,
          recoveryRequest,
          reply,
        ))
      ) {
        return;
      }
      setCredentialResponseHeaders(reply);
      return handleReleaseRecoveryMutation(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        recoveryRequest,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/publications',
    {
      schema: {
        body: CreateAuthoringStagingPublicationBody,
        response: {
          200: AuthoringStagingPublicationResult,
          201: AuthoringStagingPublicationResult,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      if (
        !(await requireDirectSdkStagingPublicationCapability(options.repository, session, reply))
      ) {
        return;
      }

      setCredentialResponseHeaders(reply);
      return handleAuthoringStagingPublication(options, session, request, reply, 'direct-sdk');
    },
  );

  fastify.post(
    '/v1/sdk/authoring/style-sources',
    { schema: { body: CreateAuthoringStyleSourceBody } },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        'sample-product-style',
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleAuthoringStyleSource(
        options.repository,
        scoped.session,
        (request.body as { proposal: ProductStyleProposalType }).proposal,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/brand-drift',
    {
      schema: {
        body: BrandDriftCheckRequest,
        response: { 200: AuthoringBrandDriftCheckResult },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        'sample-product-style',
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleAuthoringBrandDriftCheck(
        options.repository,
        scoped.session,
        request.body as BrandDriftCheckRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/brand-theme-acknowledgement',
    {
      schema: {
        body: AuthoringBrandThemeAcknowledgementRequest,
        response: { 200: AuthoringBrandThemeAcknowledgementResult },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringDocumentWrite(
        options.repository,
        request,
        reply,
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleAuthoringBrandThemeAcknowledgement(
        options.repository,
        scoped.session,
        request.body as AuthoringBrandThemeAcknowledgementRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/verifications',
    {
      schema: {
        body: AuthoringStagingVerificationRequest,
        response: {
          201: AuthoringStagingVerificationHttpSuccess,
          403: AuthoringStagingVerificationHttpError,
        },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
        'verify-staging',
      );
      if (!scoped) return;
      const verifiedOrigin = parseExactBrowserOrigin(request.headers.origin);
      if (!verifiedOrigin || !scoped.token.originAllowlist.includes(verifiedOrigin)) {
        return reply.code(403).send({
          ok: false,
          code: 'origin_mismatch',
          message: 'Verification must run on the exact allowlisted staging Origin',
        } satisfies AuthoringStagingVerificationResultType);
      }
      setCredentialResponseHeaders(reply);
      return createAuthoringPublicationVerification(
        options.repository,
        scoped.session,
        request.body as AuthoringStagingVerificationRequestType,
        verifiedOrigin,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/promotions',
    {
      schema: {
        body: ProductionPromotionRequest,
        response: {
          200: ProductionPromotionResult,
          201: ProductionPromotionResult,
          202: ProductionPromotionResult,
        },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
        'promote-production',
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleProductionPromotion(
        options,
        {
          workspaceId: scoped.session.workspaceId,
          documentId: scoped.session.documentId,
          actorUserId: scoped.session.createdByUserId,
          request: request.body as ProductionPromotionRequestType,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/release-operations/:operationId/approvals',
    { schema: { params: ReleaseOperationParams, body: CreateReleaseApprovalBody } },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
        'approve-production',
      );
      if (!scoped) return;
      const { operationId } = request.params as { operationId: string };
      const body = request.body as { decision: 'approved' | 'rejected'; reason?: string };
      setCredentialResponseHeaders(reply);
      return handleReleaseApproval(
        options,
        {
          workspaceId: scoped.session.workspaceId,
          documentId: scoped.session.documentId,
          operationId,
          actorUserId: scoped.session.createdByUserId,
          decision: body.decision,
          reason: body.reason,
        },
        reply,
      );
    },
  );

  fastify.get('/v1/documents', async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    return {
      documents: await listDocumentSummariesWithReadiness(options.repository, auth.workspaceId),
    };
  });

  fastify.get(
    '/v1/documents/:documentId',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      return record;
    },
  );

  fastify.post(
    '/v1/documents/:documentId/theme-binding',
    { schema: { params: DocumentParams, body: SetDocumentThemeBindingBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const { binding } = request.body as { binding: ThemeBindingType };
      const [record, theme] = await Promise.all([
        options.repository.getDocument(auth.workspaceId, documentId),
        options.repository.getWorkspaceTheme(auth.workspaceId, binding.themeId),
      ]);
      if (!record) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      }
      const versionId =
        binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId;
      const versions = await options.repository.listWorkspaceThemeVersions(
        auth.workspaceId,
        binding.themeId,
      );
      if (!versions.some((version) => version.id === versionId)) {
        return reply.code(409).send({
          error: 'theme_version_unavailable',
          message: 'Choose an approved Brand theme version',
        });
      }
      if (
        binding.policy === 'workspace-current' &&
        theme.activeVersionId !== binding.acknowledgedThemeVersionId
      ) {
        return reply.code(409).send({
          error: 'theme_version_changed',
          message: 'Reload Brand impact before acknowledging the current approved version',
          activeThemeVersionId: theme.activeVersionId,
        });
      }

      const document = structuredClone(record.document);
      delete document.themeRef;
      document.themeBinding = binding;
      const compiled = await compileAndValidate(options.repository, document);
      const saved = await options.repository.saveDocument({
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        document,
        artifact: compiled,
      });
      return { document: saved.document, latestArtifact: saved.latestArtifact ?? null };
    },
  );

  fastify.get(
    DASHBOARD_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: DocumentEnvironmentParams,
        response: {
          200: ReleaseRecoveryStateResponse,
          404: ApiErrorResponse,
          500: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId, environmentId } = request.params as {
        documentId: string;
        environmentId: string;
      };
      return handleReleaseRecoveryState(
        options.repository,
        {
          workspaceId: auth.workspaceId,
          environmentId,
          documentId,
          actorUserId: auth.userId,
        },
        reply,
      );
    },
  );

  fastify.post(
    DASHBOARD_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: DocumentEnvironmentParams,
        body: ReleaseRecoveryRequest,
        response: {
          200: ReleaseRecoveryResult,
          201: ReleaseRecoveryResult,
          403: ReleaseRecoveryResult,
          404: ReleaseRecoveryResult,
          409: ReleaseRecoveryResult,
          500: ReleaseRecoveryResult,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const recoveryRequest = request.body as ReleaseRecoveryRequestType;
      const requiredCapability: ReleaseCapability =
        recoveryRequest.action === 'rollback' ? 'rollback-release' : 'unpublish-release';
      if (!releaseRoleHasCapability(auth.role, requiredCapability)) {
        return sendReleaseRecoveryCapabilityDenied(recoveryRequest, reply);
      }
      const { documentId, environmentId } = request.params as {
        documentId: string;
        environmentId: string;
      };
      return handleReleaseRecoveryMutation(
        options.repository,
        {
          workspaceId: auth.workspaceId,
          environmentId,
          documentId,
          actorUserId: auth.userId,
        },
        recoveryRequest,
        reply,
      );
    },
  );

  fastify.post('/v1/documents', { schema: { body: Type.Unknown() } }, async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    if (!requireRole(auth, 'member', reply)) return;
    const canonical = validate(LodariqDocument, request.body);
    if (!canonical.valid) {
      return reply.code(400).send({
        error: 'invalid_document',
        message: 'Request body must be canonical Lodariq block JSON',
        issues: canonical.errors,
      });
    }
    let document = canonical.value;
    if (document.workspaceId !== auth.workspaceId) {
      return reply.code(403).send({
        error: 'workspace_mismatch',
        message: 'Document workspaceId must match the authenticated workspace',
      });
    }
    const existing = await options.repository.getDocument(auth.workspaceId, document.id);
    if (!existing && !document.themeBinding && !document.themeRef) {
      document = await bindNewDocumentToDefaultTheme(options.repository, document);
    }

    const compileCorrelationId = createCorrelationId('compile');
    const compiled = await compileAndValidate(options.repository, document);
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: 'compile.completed',
        correlationId: compileCorrelationId,
        workspaceId: auth.workspaceId,
        documentId: document.id,
        userId: auth.userId,
        attributes: { source: 'control-plane-save', contentHash: compiled.contentHash },
      }),
    );
    const saved = await options.repository.saveDocument({
      workspaceId: auth.workspaceId,
      actorUserId: auth.userId,
      document,
      artifact: compiled,
    });

    return reply.code(201).send(saved);
  });

  fastify.post(
    '/v1/documents/:documentId/compile',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });

      const compileCorrelationId = createCorrelationId('compile');
      const compiled = await compileAndValidate(options.repository, record.document);
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'compile.completed',
          correlationId: compileCorrelationId,
          workspaceId: auth.workspaceId,
          documentId,
          userId: auth.userId,
          attributes: { source: 'control-plane-compile', contentHash: compiled.contentHash },
        }),
      );
      const saved = await options.repository.saveDocument({
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        document: record.document,
        artifact: compiled,
      });

      return { artifact: saved.latestArtifact };
    },
  );

  fastify.post(
    '/v1/documents/:documentId/publish',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      return reply.code(409).send({
        error: DOCUMENT_RELEASE_MIGRATION_REQUIRED_ERROR,
        message:
          'Legacy direct publishing is disabled; review an immutable artifact and use the document-scoped release API',
      });
    },
  );

  fastify.post(
    '/v1/documents/:documentId/publications',
    { schema: { params: DocumentParams, body: CreateStagingPublicationBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'publish-staging', reply)) return;

      const idempotencyKey = readHeader(request, IDEMPOTENCY_KEY_HEADER);
      if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        return reply.code(400).send({
          error: 'invalid_idempotency_key',
          message: 'A valid Idempotency-Key header is required for staging publication',
        });
      }
      const correlationId = readHeader(request, RELEASE_CORRELATION_ID_HEADER);
      if (!correlationId || !RELEASE_CORRELATION_ID_PATTERN.test(correlationId)) {
        return reply.code(400).send({
          error: 'invalid_correlation_id',
          message: `A valid ${RELEASE_CORRELATION_ID_HEADER} header is required`,
        });
      }

      const { documentId } = request.params as { documentId: string };
      const body = request.body as {
        environmentId: string;
        expectedGeneration: number;
        expectedArtifactId: string;
        expectedContentHash: string;
      };
      const [record, environment] = await Promise.all([
        options.repository.getDocument(auth.workspaceId, documentId),
        findEnvironment(options.repository, auth.workspaceId, body.environmentId),
      ]);
      if (!record) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.kind !== 'staging') {
        return reply.code(409).send({
          error: 'staging_environment_required',
          message: 'This Phase 2 publication path accepts the configured staging environment only',
        });
      }
      const environmentPolicy = await findEnvironmentPolicyRow(
        options.repository,
        auth.workspaceId,
        environment.id,
      );
      if (
        !environmentPolicy ||
        !requireDirectPublishEnvironmentPolicy(
          environmentPolicy,
          { role: auth.role, userId: auth.userId },
          reply,
        )
      ) {
        return;
      }

      const requestHash = await createStagingPublicationRequestHash({
        workspaceId: auth.workspaceId,
        documentId,
        environmentId: environment.id,
        artifactId: body.expectedArtifactId,
        contentHash: body.expectedContentHash,
        expectedGeneration: body.expectedGeneration,
      });
      const existingOperation = await options.repository.getReleaseOperation(
        auth.workspaceId,
        environment.id,
        documentId,
        idempotencyKey,
      );
      let artifact: PersistedCompiledArtifact;
      let visualCheck: VisualCheckRunRecord | null;
      if (existingOperation) {
        if (!existingOperation.requestedArtifactId) {
          return reply.code(409).send({
            error: 'idempotency_conflict',
            message: 'The idempotency key belongs to another release action',
          });
        }
        const existingArtifact = await options.repository.getCompiledArtifact(
          auth.workspaceId,
          documentId,
          existingOperation.requestedArtifactId,
        );
        if (!existingArtifact) {
          throw new Error('release operation references an unavailable compiled artifact');
        }
        artifact = existingArtifact;
        visualCheck = await findVisualCheckForArtifact(
          options.repository,
          auth.workspaceId,
          documentId,
          environment.id,
          artifact,
        );
      } else {
        const reviewed = await loadReviewedReleaseArtifact(
          options.repository,
          auth.workspaceId,
          documentId,
          body.expectedArtifactId,
          body.expectedContentHash,
        );
        if (!reviewed) {
          return reply.code(409).send({
            error: 'reviewed_artifact_unavailable',
            message:
              'The reviewed artifact changed or is no longer available; review staging again',
          });
        }
        const publishIssues = validateTourPublishReadiness(reviewed.document);
        if (publishIssues.length) {
          return reply.code(409).send({
            error: 'publish_blocked',
            message: publishIssues[0]?.message ?? 'Document is not ready to publish',
            issues: publishIssues.map(toPublishReadinessIssueResponse),
          });
        }
        if (hasLegacyThemeReference(reviewed.document)) {
          return reply.code(409).send({
            error: 'theme_migration_required',
            message: 'Choose an approved Brand theme before publishing this legacy draft',
          });
        }
        const themeReview = await getThemeReleaseReview(options.repository, reviewed.document);
        if (themeReview) {
          return reply.code(409).send({
            error: 'theme_review_required',
            message: 'Review the latest approved Brand theme before publishing this draft',
            ...themeReview,
          });
        }
        artifact = reviewed.artifact;
        visualCheck = await runAndPersistVisualPreflight({
          repository: options.repository,
          workspaceId: auth.workspaceId,
          documentId,
          environmentId: environment.id,
          artifact,
          actorUserId: auth.userId,
        });
        if (visualCheck.status === 'blocked') {
          return reply.code(409).send({
            error: 'visual_preflight_blocked',
            message: 'Brand and layout preflight found issues that must be fixed before staging',
            visualCheck,
          });
        }
      }

      try {
        const result = await options.repository.activateCompiledArtifact({
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          correlationId,
          artifact,
          actorUserId: auth.userId,
          idempotencyKey,
          requestHash,
          expectedGeneration: body.expectedGeneration,
          expectedEnvironmentPolicyUpdatedAt: environment.updatedAt,
        });
        emitObservability(
          options.observability,
          createObservabilityEvent({
            name: result.replayed ? 'publish.replayed' : 'publish.completed',
            correlationId,
            workspaceId: auth.workspaceId,
            documentId,
            environmentId: environment.id,
            userId: auth.userId,
            attributes: {
              contentHash: result.publication.contentHash,
              generation: result.deployment.generation,
            },
          }),
        );
        return reply.code(result.replayed ? 200 : 201).send({
          replayed: result.replayed,
          operation: result.operation,
          deployment: result.deployment,
          publication: toPublicationResponse(result.publication),
          visualCheck,
        });
      } catch (error) {
        if (error instanceof EnvironmentReleasePolicyChangedError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        if (error instanceof EnvironmentPolicyMutationForbiddenError) {
          return reply.code(409).send({
            error: error.code,
            code: error.decisionCode,
            message: error.message,
          });
        }
        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        if (error instanceof DeploymentChangedError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            expectedGeneration: error.expectedGeneration,
            actualGeneration: error.actualGeneration,
          });
        }
        if (error instanceof ReleaseOperationInProgressError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );

  fastify.post(
    '/v1/publications/:publicationId/verifications',
    { schema: { params: PublicationParams, body: CreateDashboardPublicationVerificationBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'verify-staging', reply)) return;
      const { publicationId } = request.params as { publicationId: string };
      const body = request.body as {
        environmentId: string;
        report: AuthoringStagingVerificationRequestType['report'];
      };
      const environment = await findEnvironment(
        options.repository,
        auth.workspaceId,
        body.environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.enabled === false) {
        return reply.code(409).send({
          error: 'environment_policy_forbidden',
          code: 'environment_disabled',
          message: 'The release environment is disabled',
        });
      }
      const verifiedOrigin = requireVerificationOrigin(environment, request, reply);
      if (!verifiedOrigin) return;
      return createExactPublicationVerification(
        options.repository,
        {
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          publicationId,
          report: body.report,
          verifiedOrigin,
          actorUserId: auth.userId,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/documents/:documentId/promotions',
    { schema: { params: DocumentParams, body: ProductionPromotionRequest } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'promote-production', reply)) return;
      const { documentId } = request.params as { documentId: string };
      return handleProductionPromotion(
        options,
        {
          workspaceId: auth.workspaceId,
          documentId,
          actorUserId: auth.userId,
          request: request.body as ProductionPromotionRequestType,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/release-operations/:operationId/approvals',
    { schema: { params: ReleaseOperationParams, body: CreateReleaseApprovalBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'approve-production', reply)) return;
      const { operationId } = request.params as { operationId: string };
      const body = request.body as { decision: 'approved' | 'rejected'; reason?: string };
      return handleReleaseApproval(
        options,
        {
          workspaceId: auth.workspaceId,
          operationId,
          actorUserId: auth.userId,
          decision: body.decision,
          reason: body.reason,
        },
        reply,
      );
    },
  );

  fastify.get(
    '/v1/documents/:documentId/deployments',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const deployments = await options.repository.listDocumentDeployments(auth.workspaceId);
      return {
        deployments: deployments.filter((deployment) => deployment.documentId === documentId),
      };
    },
  );

  fastify.get(
    '/v1/documents/:documentId/publications',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const publications = await options.repository.listDocumentPublications(
        auth.workspaceId,
        documentId,
      );
      return { publications: publications.map(toPublicationResponse) };
    },
  );

  fastify.get(
    '/v1/documents/:documentId/visual-checks',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      return {
        visualChecks: await options.repository.listVisualCheckRuns(auth.workspaceId, documentId),
      };
    },
  );

  fastify.get(
    '/v1/debug/documents/:documentId',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      const versions = await options.repository.listDocumentVersions(auth.workspaceId, documentId);
      return {
        canonical: record.document,
        latestArtifact: record.latestArtifact ?? null,
        publishReadinessIssues: validateTourPublishReadiness(record.document).map(
          toPublishReadinessIssueResponse,
        ),
        versions,
      };
    },
  );

  fastify.get('/v1/themes', async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    const [themes, sources] = await Promise.all([
      options.repository.listWorkspaceThemes(auth.workspaceId),
      options.repository.listStyleSources(auth.workspaceId),
    ]);
    return {
      themes: themes.map((theme) =>
        withLatestStyleSource(theme, sources.find((source) => source.themeId === theme.id) ?? null),
      ),
    };
  });

  fastify.post(
    '/v1/themes',
    { schema: { body: CreateWorkspaceThemeBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const body = request.body as {
        name: string;
        draft: BrandThemeDefinitionType;
      };
      const theme = await options.repository.createWorkspaceTheme({
        workspaceId: auth.workspaceId,
        name: body.name,
        draft: body.draft,
        actorUserId: auth.userId,
      });
      return reply.code(201).send({ theme });
    },
  );

  fastify.get(
    '/v1/themes/:themeId',
    { schema: { params: ThemeParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { themeId } = request.params as { themeId: string };
      const theme = await options.repository.getWorkspaceTheme(auth.workspaceId, themeId);
      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      }
      const [versions, impact] = await Promise.all([
        options.repository.listWorkspaceThemeVersions(auth.workspaceId, themeId),
        options.repository.listWorkspaceThemeImpact(auth.workspaceId, themeId),
      ]);
      const [latestStyleSource] = await options.repository.listStyleSources(
        auth.workspaceId,
        themeId,
      );
      return {
        theme: withLatestStyleSource(theme, latestStyleSource ?? null),
        versions,
        impact,
      };
    },
  );

  fastify.get(
    '/v1/themes/:themeId/style-sources',
    { schema: { params: ThemeParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { themeId } = request.params as { themeId: string };
      const theme = await options.repository.getWorkspaceTheme(auth.workspaceId, themeId);
      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      }
      return { sources: await options.repository.listStyleSources(auth.workspaceId, themeId) };
    },
  );

  fastify.post(
    '/v1/themes/:themeId/style-sources',
    { schema: { params: ThemeParams, body: CreateDashboardStyleSourceBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'sample-product-style', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as {
        environmentId: string;
        proposal: ProductStyleProposalType;
      };
      const environment = await findEnvironment(
        options.repository,
        auth.workspaceId,
        body.environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.kind === 'production') {
        return reply.code(409).send({
          error: 'authoring_environment_required',
          message: 'Product styles can be sampled only from development or staging',
        });
      }
      const theme = await options.repository.getWorkspaceTheme(auth.workspaceId, themeId);
      if (!theme) {
        return reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      }
      try {
        const applied = await applyProductStyleProposal({
          repository: options.repository,
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          theme,
          proposal: body.proposal,
          actorUserId: auth.userId,
        });
        return reply.code(201).send(applied);
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  fastify.patch(
    '/v1/themes/:themeId',
    { schema: { params: ThemeParams, body: UpdateWorkspaceThemeBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as {
        name?: string;
        draft: BrandThemeDefinitionType;
        expectedRevision: number;
        expectedUpdatedAt: string;
      };
      try {
        const theme = await options.repository.updateWorkspaceThemeDraft({
          workspaceId: auth.workspaceId,
          themeId,
          draft: body.draft,
          expectedRevision: body.expectedRevision,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
          ...(body.name === undefined ? {} : { name: body.name }),
        });
        return theme
          ? { theme }
          : reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  fastify.post(
    '/v1/themes/:themeId/approve',
    { schema: { params: ThemeParams, body: WorkspaceThemeMutationGuardBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as { expectedRevision: number; expectedUpdatedAt: string };
      try {
        const approved = await options.repository.approveWorkspaceTheme({
          workspaceId: auth.workspaceId,
          themeId,
          expectedRevision: body.expectedRevision,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return approved
          ? { theme: approved.theme, approvedVersion: approved.approvedVersion }
          : reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  fastify.post(
    '/v1/themes/:themeId/default',
    { schema: { params: ThemeParams, body: WorkspaceThemeMutationGuardBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { themeId } = request.params as { themeId: string };
      const body = request.body as { expectedRevision: number; expectedUpdatedAt: string };
      try {
        const theme = await options.repository.setDefaultWorkspaceTheme({
          workspaceId: auth.workspaceId,
          themeId,
          expectedRevision: body.expectedRevision,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return theme
          ? { theme }
          : reply.code(404).send({ error: 'not_found', message: 'Brand theme not found' });
      } catch (error) {
        return sendWorkspaceThemeMutationError(error, reply);
      }
    },
  );

  fastify.get('/v1/environments', async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    return { environments: await options.repository.listEnvironments(auth.workspaceId) };
  });

  fastify.patch(
    '/v1/environments/:environmentId/release-policy',
    { schema: { params: EnvironmentParams, body: UpdateEnvironmentReleasePolicyBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'manage-release-policy', reply)) return;
      const { environmentId } = request.params as { environmentId: string };
      const body = request.body as { requiredApprovalCount: 0 | 1; expectedUpdatedAt: string };
      const environment = await findEnvironment(
        options.repository,
        auth.workspaceId,
        environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.kind !== 'production') {
        return reply.code(409).send({
          error: 'production_environment_required',
          message: 'Release approval policy applies only to production',
        });
      }
      try {
        const updated = await options.repository.updateEnvironmentReleasePolicy({
          workspaceId: auth.workspaceId,
          environmentId,
          requiredApprovalCount: body.requiredApprovalCount,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return updated
          ? { environment: updated }
          : reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      } catch (error) {
        if (error instanceof EnvironmentReleasePolicyChangedError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            expectedUpdatedAt: error.expectedUpdatedAt,
            actualUpdatedAt: error.actualUpdatedAt,
          });
        }
        throw error;
      }
    },
  );

  fastify.patch(
    '/v1/environments/:environmentId/policy',
    { schema: { params: EnvironmentParams, body: UpdateWorkspaceEnvironmentPolicyBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'manage-release-policy', reply)) return;
      const { environmentId } = request.params as { environmentId: string };
      const body = request.body as {
        name: string;
        originAllowlist: string[];
        enabled: boolean;
        pipelinePosition: 0 | 1 | 2;
        authoringEnabled: boolean;
        promotionSourceEnvironmentId?: string;
        releasePolicy: EnvironmentReleasePolicyType;
        expectedUpdatedAt: string;
      };
      try {
        const updated = await options.repository.updateWorkspaceEnvironmentPolicy({
          workspaceId: auth.workspaceId,
          environmentId,
          name: body.name,
          originAllowlist: body.originAllowlist,
          enabled: body.enabled,
          pipelinePosition: body.pipelinePosition,
          authoringEnabled: body.authoringEnabled,
          ...(body.promotionSourceEnvironmentId
            ? { promotionSourceEnvironmentId: body.promotionSourceEnvironmentId }
            : {}),
          releasePolicy: body.releasePolicy,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return updated
          ? { environment: updated }
          : reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      } catch (error) {
        if (error instanceof EnvironmentReleasePolicyChangedError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            expectedUpdatedAt: error.expectedUpdatedAt,
            actualUpdatedAt: error.actualUpdatedAt,
          });
        }
        if (error instanceof WorkspaceEnvironmentPolicyInvalidError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            issues: error.issues,
          });
        }
        throw error;
      }
    },
  );

  fastify.get(
    '/v1/sdk-installations',
    { schema: { response: { 200: ListPublicSdkInstallationsResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;

      const installations = await options.repository.listPublicSdkInstallations(auth.workspaceId);
      return {
        installations: installations.map((installation) => ({
          ...installation,
          sdkSnippet: renderPublicSdkInstallationSnippet({
            installationId: installation.installationId,
            loaderSrc: options.publicLoaderSrc,
          }),
        })),
      };
    },
  );

  fastify.post(
    '/v1/sdk-installations',
    { schema: { body: CreatePublicSdkInstallationBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;

      const body = request.body as { name: string };
      const installation = await options.repository.getOrCreatePublicSdkInstallation({
        workspaceId: auth.workspaceId,
        installationId: createPublicSdkInstallationId(),
        name: body.name,
        actorUserId: auth.userId,
      });

      return reply.code(201).send({
        installation,
        sdkSnippet: renderPublicSdkInstallationSnippet({
          installationId: installation.installationId,
          loaderSrc: options.publicLoaderSrc,
        }),
      });
    },
  );

  fastify.put(
    '/v1/sdk-installations/:installationId/origins',
    {
      schema: {
        params: PublicSdkInstallationParams,
        body: ConfigurePublicSdkInstallationOriginBody,
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;

      const { installationId } = request.params as { installationId: string };
      const body = request.body as {
        environmentId: string;
        origin: string;
        authoringEnabled: boolean;
      };
      const exactOrigin = parseExactBrowserOrigin(body.origin);
      if (!exactOrigin) {
        return reply.code(400).send({
          error: 'invalid_origin',
          message: 'Origin must be a canonical HTTP(S) browser origin without a path',
        });
      }

      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === body.environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.kind === 'production' && !exactOrigin.startsWith('https://')) {
        return reply.code(400).send({
          error: 'production_https_required',
          message: 'Production origins must use HTTPS',
        });
      }
      if (environment.kind === 'production' && body.authoringEnabled) {
        return reply.code(403).send({
          error: 'production_authoring_forbidden',
          message: 'Production origins cannot enable authoring',
        });
      }

      try {
        const mapping = await options.repository.setPublicSdkInstallationOrigin({
          workspaceId: auth.workspaceId,
          installationId,
          environmentId: environment.id,
          origin: exactOrigin,
          authoringEnabled: body.authoringEnabled,
        });
        return { mapping };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'active public SDK installation not found in workspace'
        ) {
          return reply.code(404).send({ error: 'not_found', message: 'Installation not found' });
        }
        if (
          error instanceof Error &&
          error.message === 'public SDK origin is not allowlisted for the environment'
        ) {
          return reply.code(409).send({
            error: 'environment_policy_forbidden',
            message: 'Origin is not present in the environment origin allowlist',
          });
        }
        if (
          error instanceof Error &&
          (error.message === 'environment is disabled' ||
            error.message === 'authoring is disabled for the environment')
        ) {
          return reply.code(409).send({
            error: 'environment_policy_forbidden',
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  fastify.put(
    '/v1/sdk-installations/:installationId/origins/sync',
    {
      schema: {
        params: PublicSdkInstallationParams,
        body: SyncPublicSdkInstallationOriginsBody,
        response: {
          200: Type.Object(
            { origins: Type.Array(PublicSdkInstallationOriginResponse) },
            { additionalProperties: false },
          ),
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;

      const { installationId } = request.params as { installationId: string };
      const body = request.body as {
        origins: Array<{
          environmentId: string;
          origin: string;
          authoringEnabled: boolean;
        }>;
      };
      try {
        const origins = await options.repository.syncPublicSdkInstallationOrigins({
          workspaceId: auth.workspaceId,
          installationId,
          origins: body.origins,
        });
        return { origins };
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (error.message === 'active public SDK installation not found in workspace') {
          return reply.code(404).send({ error: 'not_found', message: 'Installation not found' });
        }
        if (error.message === 'authoring cannot be enabled for a production environment') {
          return reply.code(403).send({
            error: 'production_authoring_forbidden',
            message: 'Production origins cannot enable authoring',
          });
        }
        if (error.message === 'public SDK origin is not allowlisted for the environment') {
          return reply.code(409).send({
            error: 'environment_policy_forbidden',
            message: 'Origin is not present in the environment origin allowlist',
          });
        }
        if (
          error.message === 'environment is disabled' ||
          error.message === 'authoring is disabled for the environment'
        ) {
          return reply.code(409).send({
            error: 'environment_policy_forbidden',
            message: error.message,
          });
        }
        return reply.code(400).send({
          error: 'invalid_origin_sync',
          message: error.message,
        });
      }
    },
  );

  fastify.post(
    '/v1/sdk-installations/:installationId/revoke',
    { schema: { params: PublicSdkInstallationParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;

      const { installationId } = request.params as { installationId: string };
      const installation = await options.repository.revokePublicSdkInstallation(
        auth.workspaceId,
        installationId,
        auth.userId,
      );
      if (!installation) {
        return reply.code(404).send({ error: 'not_found', message: 'Installation not found' });
      }
      return { installation };
    },
  );

  fastify.get('/v1/environment-tokens', async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    if (!requireRole(auth, 'member', reply)) return;
    const tokens = await options.repository.listEnvironmentTokens(auth.workspaceId);
    return { tokens: tokens.map(toTokenResponse) };
  });

  fastify.post(
    '/v1/environment-tokens',
    { schema: { body: CreateEnvironmentTokenBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const body = request.body as { environmentId: string; name: string };
      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === body.environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }

      const clientToken = createEnvironmentClientToken(environment.kind);
      const token = await options.repository.createEnvironmentToken({
        workspaceId: auth.workspaceId,
        environmentId: environment.id,
        name: body.name,
        tokenHash: hashEnvironmentToken(clientToken),
        tokenPrefix: getEnvironmentTokenPrefix(clientToken),
        clientToken,
        actorUserId: auth.userId,
      });

      return reply.code(201).send({
        token: toTokenResponse(token),
        clientToken,
        sdkSnippet: renderSdkInstallationSnippet({
          clientToken,
          environment: environment.kind,
          apiBaseUrl: options.publicApiBaseUrl,
          loaderSrc: options.loaderSrc,
        }),
      });
    },
  );

  fastify.post(
    '/v1/environment-tokens/:tokenId/revoke',
    { schema: { params: EnvironmentTokenParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;

      const { tokenId } = request.params as { tokenId: string };
      const token = await options.repository.revokeEnvironmentToken(
        auth.workspaceId,
        tokenId,
        auth.userId,
      );
      if (!token) {
        return reply.code(404).send({ error: 'not_found', message: 'Token not found' });
      }

      return { token: toTokenResponse(token) };
    },
  );

  fastify.post(
    '/v1/authoring/documents/query',
    {
      schema: {
        body: QueryAuthoringDocumentsRequest,
        response: {
          200: QueryAuthoringDocumentsResult,
          400: ApiErrorResponse,
          401: ApiErrorResponse,
          403: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const activationGrant = readHeader(request, AUTHORING_ACTIVATION_GRANT_HEADER);
      if (!activationGrant) {
        return reply.code(401).send({
          error: 'activation_grant_required',
          message: 'The hosted editor must present an authoring activation grant',
        });
      }

      const body = request.body as QueryAuthoringDocumentsRequestType;
      const exactCustomerOrigin = parseExactBrowserOrigin(body.customerOrigin);
      if (!exactCustomerOrigin || exactCustomerOrigin !== body.customerOrigin) {
        return reply.code(400).send({
          error: 'invalid_customer_origin',
          message: 'Customer origin must be one canonical HTTP(S) browser origin',
        });
      }

      const result = await options.repository.queryAuthoringDocumentsFromActivation({
        installationId: body.installationId,
        exactOrigin: exactCustomerOrigin,
        activationGrantHash: hashAuthoringActivationGrant(activationGrant),
        scope: body.scope,
        pageContext: body.pageContext,
      });
      if (!result) {
        return reply.code(403).send({
          error: 'authoring_query_rejected',
          message: 'The authoring activation scope is invalid or expired',
        });
      }
      return result;
    },
  );

  fastify.post(
    '/v1/authoring/activation/revoke',
    { schema: { body: RevokeAuthoringActivationRequest } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const activationGrant = readHeader(request, AUTHORING_ACTIVATION_GRANT_HEADER);
      if (!activationGrant) {
        return reply.code(401).send({
          error: 'activation_grant_required',
          message: 'The hosted editor must present an authoring activation grant',
        });
      }

      const body = request.body as RevokeAuthoringActivationRequestType;
      const exactCustomerOrigin = parseExactBrowserOrigin(body.customerOrigin);
      if (exactCustomerOrigin && exactCustomerOrigin === body.customerOrigin) {
        await options.repository.revokeAuthoringActivationGrant({
          installationId: body.installationId,
          exactOrigin: exactCustomerOrigin,
          grantHash: hashAuthoringActivationGrant(activationGrant),
        });
      }
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/v1/authoring/sessions/:sessionId/revoke',
    { schema: { params: AuthoringSessionParams } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const authoringSession = readHeader(request, AUTHORING_SESSION_HEADER);
      if (!authoringSession) {
        return reply.code(401).send({
          error: 'authoring_session_required',
          message: 'The hosted editor must present its authoring session bearer',
        });
      }

      const { sessionId } = request.params as { sessionId: string };
      await options.repository.revokeAuthoringSession({
        sessionId,
        tokenHash: hashAuthoringSessionToken(authoringSession),
      });
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/v1/authoring/sessions',
    {
      schema: {
        body: Type.Union([CreateAuthoringSessionBody, CreateAuthoringDocumentSessionRequest]),
      },
    },
    async (request, reply) => {
      const activationGrant = readHeader(request, AUTHORING_ACTIVATION_GRANT_HEADER);
      if (activationGrant) {
        return createActivatedAuthoringDocumentSession(options, request, reply, activationGrant);
      }
      if (validate(CreateAuthoringDocumentSessionRequest, request.body).valid) {
        if (!requireEditorOrigin(request, reply)) return;
        return reply.code(401).send({
          error: 'activation_grant_required',
          message: 'The editor must present a valid authoring activation grant',
        });
      }
      if (!requireFirstPartyAppOrigin(request, reply)) return;

      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;

      const body = request.body as {
        environmentId: string;
        documentId: string;
        environmentClientToken?: string;
      };
      const [environment, document] = await Promise.all([
        options.repository
          .listEnvironments(auth.workspaceId)
          .then((items) => items.find((candidate) => candidate.id === body.environmentId)),
        options.repository.getDocument(auth.workspaceId, body.documentId),
      ]);

      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (environment.kind === 'production') {
        return reply.code(403).send({
          error: 'production_authoring_forbidden',
          message: 'Production environments cannot create authoring sessions',
        });
      }
      if (environment.enabled === false || environment.authoringEnabled === false) {
        return reply.code(403).send({
          error: 'authoring_environment_disabled',
          message: 'Authoring is disabled for this environment',
        });
      }
      try {
        await resolveDocumentTheme(options.repository, document.document);
      } catch (error) {
        if (error instanceof DocumentThemeResolutionError) {
          return reply.code(error.statusCode).send({ error: error.code, message: error.message });
        }
        throw error;
      }

      if (body.environmentClientToken) {
        const environmentToken = await options.repository.resolveEnvironmentToken(
          hashEnvironmentToken(body.environmentClientToken),
        );
        const tokenMatchesAuthoringScope =
          environmentToken?.workspaceId === auth.workspaceId &&
          environmentToken.environmentId === environment.id &&
          environmentToken.environment === environment.kind;
        if (!tokenMatchesAuthoringScope) {
          return reply.code(403).send({
            error: 'environment_token_mismatch',
            message: 'Environment token does not match the authoring workspace or environment',
          });
        }
      }

      const sessionToken = createAuthoringSessionToken();
      const correlationId = createCorrelationId('authoring');
      let session: AuthoringSessionRecord;
      try {
        session = await options.repository.createAuthoringSession({
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          documentId: body.documentId,
          correlationId,
          tokenHash: hashAuthoringSessionToken(sessionToken),
          iframeSrc: options.authoringIframeSrc,
          expiresAt: new Date(Date.now() + AUTHORING_SESSION_TTL_MS).toISOString(),
          actorUserId: auth.userId,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'authoring session creator is not an active workspace member'
        ) {
          return reply.code(403).send({
            error: 'authoring_membership_required',
            message: 'An active authoring workspace membership is required',
          });
        }
        if (error instanceof Error && error.message === 'environment not found in workspace') {
          return reply.code(403).send({
            error: 'authoring_environment_disabled',
            message: 'Authoring is disabled for this environment',
          });
        }
        throw error;
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'authoring.session.created',
          correlationId,
          workspaceId: auth.workspaceId,
          documentId: body.documentId,
          environmentId: environment.id,
          userId: auth.userId,
        }),
      );

      const authoringSdkSnippet = body.environmentClientToken
        ? renderSdkInstallationSnippet({
            clientToken: body.environmentClientToken,
            environment: environment.kind,
            apiBaseUrl: options.publicApiBaseUrl,
            loaderSrc: options.loaderSrc,
            creatorLoaderSrc: options.creatorLoaderSrc,
            authoringSessionToken: sessionToken,
          })
        : undefined;

      setCredentialResponseHeaders(reply);
      return reply.code(201).send({
        authoringSession: toAuthoringSessionResponse(session),
        authoringSessionToken: sessionToken,
        bootstrapHeaderName: AUTHORING_SESSION_HEADER,
        ...(authoringSdkSnippet ? { authoringSdkSnippet } : {}),
      });
    },
  );

  fastify.get('/v1/authoring/document', async (request, reply) => {
    if (!requireEditorOrigin(request, reply)) return;
    setCredentialResponseHeaders(reply);
    const session = await authenticateHostedEditorSession(options.repository, request, reply);
    if (!session) return;
    if (
      !requireAuthoringSessionCapability(
        session,
        AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
        reply,
      )
    ) {
      return;
    }

    const record = await options.repository.getDocument(session.workspaceId, session.documentId);
    if (!record) {
      return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
    }
    const theme = await resolveDocumentTheme(options.repository, record.document);
    if (!authoringSessionThemeMatches(session, theme)) {
      return sendAuthoringSessionCompatibilityChanged(reply);
    }
    return validateAuthoringDocumentPayload({
      document: record.document,
      theme,
    });
  });

  fastify.post(
    '/v1/authoring/document',
    { schema: { body: SdkAuthoringDocumentBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !requireAuthoringSessionCapability(
          session,
          AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
          reply,
        )
      ) {
        return;
      }

      const body = request.body as { document: unknown };
      const payload = validate(LodariqDocument, body.document);
      if (!payload.valid) {
        return reply.code(400).send({
          error: 'invalid_document',
          message: 'Request body must contain canonical Lodariq block JSON',
          issues: payload.errors,
        });
      }
      const document = payload.value;
      if (document.workspaceId !== session.workspaceId || document.id !== session.documentId) {
        return reply.code(403).send({
          error: 'authoring_session_mismatch',
          message: 'Authoring session does not match the document being saved',
        });
      }

      const compiled = await compileAndValidate(options.repository, document);
      if (!authoringSessionArtifactMatches(session, compiled)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'compile.completed',
          correlationId: session.correlationId,
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          environmentId: session.environmentId,
          userId: session.createdByUserId,
          attributes: { source: 'hosted-editor-save', contentHash: compiled.contentHash },
        }),
      );
      const saved = await options.repository.saveDocument({
        workspaceId: session.workspaceId,
        actorUserId: session.createdByUserId,
        document,
        artifact: compiled,
      });
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'authoring.save.completed',
          correlationId: session.correlationId,
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          environmentId: session.environmentId,
          userId: session.createdByUserId,
          attributes: {
            source: 'hosted-editor',
            contentHash: saved.latestArtifact?.contentHash,
          },
        }),
      );
      return validateAuthoringDocumentPayload({
        document: saved.document,
        theme: await resolveDocumentTheme(options.repository, saved.document),
      });
    },
  );

  fastify.get('/v1/authoring/release-state', async (request, reply) => {
    if (!requireEditorOrigin(request, reply)) return;
    setCredentialResponseHeaders(reply);
    const session = await authenticateHostedEditorSession(options.repository, request, reply);
    if (!session) return;
    if (!(await requireHostedReleaseStateCapability(options.repository, session, reply))) return;
    return handleAuthoringReleaseState(options, session, reply, 'hosted-editor');
  });

  fastify.get(
    HOSTED_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        response: {
          200: ReleaseRecoveryStateResponse,
          404: ApiErrorResponse,
          500: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (!(await requireHostedReleaseStateCapability(options.repository, session, reply))) return;
      const { environmentId } = request.params as { environmentId: string };
      return handleReleaseRecoveryState(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        reply,
        authoringRecoveryPermissionIntersection(session),
      );
    },
  );

  fastify.post(
    HOSTED_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        body: ReleaseRecoveryRequest,
        response: {
          200: ReleaseRecoveryResult,
          201: ReleaseRecoveryResult,
          403: ReleaseRecoveryResult,
          404: ReleaseRecoveryResult,
          409: ReleaseRecoveryResult,
          500: ReleaseRecoveryResult,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      const recoveryRequest = request.body as ReleaseRecoveryRequestType;
      const { environmentId } = request.params as { environmentId: string };
      if (
        !(await requireHostedReleaseRecoveryCapability(
          options.repository,
          session,
          recoveryRequest,
          reply,
        ))
      ) {
        return;
      }
      return handleReleaseRecoveryMutation(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        recoveryRequest,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/publications',
    { schema: { body: CreateAuthoringStagingPublicationBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (!(await requireHostedStagingPublicationCapability(options.repository, session, reply))) {
        return;
      }
      return handleAuthoringStagingPublication(options, session, request, reply, 'hosted-editor');
    },
  );

  fastify.post(
    '/v1/authoring/style-sources',
    { schema: { body: CreateAuthoringStyleSourceBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          'sample-product-style',
          reply,
        ))
      ) {
        return;
      }
      return handleAuthoringStyleSource(
        options.repository,
        session,
        (request.body as { proposal: ProductStyleProposalType }).proposal,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/brand-drift',
    {
      schema: {
        body: BrandDriftCheckRequest,
        response: { 200: AuthoringBrandDriftCheckResult },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          'sample-product-style',
          reply,
        ))
      ) {
        return;
      }
      return handleAuthoringBrandDriftCheck(
        options.repository,
        session,
        request.body as BrandDriftCheckRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/brand-theme-acknowledgement',
    {
      schema: {
        body: AuthoringBrandThemeAcknowledgementRequest,
        response: { 200: AuthoringBrandThemeAcknowledgementResult },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (!(await requireAuthoringDocumentWrite(options.repository, session, reply))) return;
      return handleAuthoringBrandThemeAcknowledgement(
        options.repository,
        session,
        request.body as AuthoringBrandThemeAcknowledgementRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/verifications',
    {
      schema: {
        body: AuthoringStagingVerificationRequest,
        response: {
          201: AuthoringStagingVerificationHttpSuccess,
          409: AuthoringStagingVerificationHttpError,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
          'verify-staging',
          reply,
        ))
      ) {
        return;
      }
      const verifiedOrigin = parseExactBrowserOrigin(session.customerOrigin ?? undefined);
      if (!verifiedOrigin) {
        return reply.code(409).send({
          ok: false,
          code: 'origin_mismatch',
          message: 'Authoring session is missing its exact customer Origin',
        } satisfies AuthoringStagingVerificationResultType);
      }
      return createAuthoringPublicationVerification(
        options.repository,
        session,
        request.body as AuthoringStagingVerificationRequestType,
        verifiedOrigin,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/promotions',
    {
      schema: {
        body: ProductionPromotionRequest,
        response: {
          200: ProductionPromotionResult,
          201: ProductionPromotionResult,
          202: ProductionPromotionResult,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
          'promote-production',
          reply,
        ))
      ) {
        return;
      }
      return handleProductionPromotion(
        options,
        {
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
          request: request.body as ProductionPromotionRequestType,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/release-operations/:operationId/approvals',
    { schema: { params: ReleaseOperationParams, body: CreateReleaseApprovalBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
          'approve-production',
          reply,
        ))
      ) {
        return;
      }
      const { operationId } = request.params as { operationId: string };
      const body = request.body as { decision: 'approved' | 'rejected'; reason?: string };
      return handleReleaseApproval(
        options,
        {
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          operationId,
          actorUserId: session.createdByUserId,
          decision: body.decision,
          reason: body.reason,
        },
        reply,
      );
    },
  );

  fastify.post('/v1/events', { schema: { body: IngestEventsBody } }, async (request, reply) => {
    const auth = await authenticate(options.repository, options.authProvider, request, reply);
    if (!auth) return;
    const body = request.body as { events: AnalyticsEvent[] };
    const accepted = await options.repository.ingestEvents({
      workspaceId: auth.workspaceId,
      events: sanitizeAnalyticsEvents(body.events),
    });
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: 'sdk.events.ingested',
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        attributes: { accepted },
      }),
    );
    return reply.code(202).send({ accepted });
  });

  fastify.get(
    '/v1/analytics/events',
    { schema: { querystring: AnalyticsEnvironmentQuery } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const query = request.query as AnalyticsEnvironmentQueryType;
      if (
        !(await requireAnalyticsEnvironment(options.repository, auth.workspaceId, query, reply))
      ) {
        return;
      }
      const events = await options.repository.listAnalyticsEvents({
        workspaceId: auth.workspaceId,
        query,
      });
      return reply.send({ events });
    },
  );

  fastify.get(
    '/v1/analytics/aggregate',
    {
      schema: {
        querystring: AnalyticsEnvironmentQuery,
        response: { 200: AnalyticsAggregateResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const query = request.query as AnalyticsEnvironmentQueryType;
      if (
        !(await requireAnalyticsEnvironment(options.repository, auth.workspaceId, query, reply))
      ) {
        return;
      }
      const aggregates = await options.repository.aggregateAnalyticsEvents({
        workspaceId: auth.workspaceId,
        query,
      });
      return reply.send({ aggregates });
    },
  );
}

interface ReleaseRecoveryHttpScope {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  actorUserId: string;
}

async function handleReleaseRecoveryState(
  repository: ControlPlaneRepository,
  scope: ReleaseRecoveryHttpScope,
  reply: FastifyReply,
  permissionIntersection?: { rollback: boolean; unpublish: boolean },
) {
  let validated: ReleaseRecoveryStateResponseType;
  try {
    const state = await repository.getReleaseRecoveryState(scope);
    if (!state) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Release recovery scope was not found',
      });
    }
    const repositoryState = validateReleaseRecoveryStateResponse(state, scope);
    const response = permissionIntersection
      ? {
          ...repositoryState,
          permissions: {
            rollback: repositoryState.permissions.rollback && permissionIntersection.rollback,
            unpublish: repositoryState.permissions.unpublish && permissionIntersection.unpublish,
          },
        }
      : repositoryState;
    validated = validateReleaseRecoveryStateResponse(response, scope);
  } catch (error) {
    if (!isReleaseRecoveryReadBoundaryError(error)) throw error;
    return reply.code(500).send({
      error: 'release_recovery_history_unavailable',
      message: 'Complete release recovery history is temporarily unavailable',
    });
  }
  return reply.code(200).send(validated);
}

function authoringRecoveryPermissionIntersection(session: AuthoringSessionRecord) {
  const staging = session.environment === 'staging';
  return {
    rollback:
      staging &&
      session.capabilities?.includes(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE) === true,
    unpublish:
      staging &&
      session.capabilities?.includes(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE) === true,
  };
}

async function handleReleaseRecoveryMutation(
  repository: ControlPlaneRepository,
  scope: ReleaseRecoveryHttpScope,
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
) {
  let validated: ReleaseRecoveryResultType;
  try {
    const result = await repository.recoverDocumentRelease({ ...scope, request });
    if (!result) return sendMissingReleaseRecoveryScope(request, reply);
    validated = validateReleaseRecoveryResult(result);
  } catch (error) {
    if (!isReleaseRecoveryReadBoundaryError(error)) throw error;
    return reply
      .code(500)
      .send(
        validateReleaseRecoveryResult(releaseRecoveryGatewayFailure(request, 'internal_error')),
      );
  }
  return reply.code(releaseRecoveryHttpStatus(validated)).send(validated);
}

function releaseRecoveryGatewayFailure(
  request: ReleaseRecoveryRequestType,
  code: 'capability_denied' | 'document_not_found' | 'internal_error',
): ReleaseRecoveryResultType {
  return {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    expectedGeneration: request.expectedGeneration,
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
  };
}

function isReleaseRecoveryReadBoundaryError(error: unknown): boolean {
  return (
    error instanceof ReleaseRecoveryHistoryIntegrityError ||
    error instanceof ReleaseRecoveryHistoryLimitExceededError ||
    error instanceof ReleaseRecoveryResponseValidationError
  );
}

function sendReleaseRecoveryCapabilityDenied(
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
) {
  return reply
    .code(403)
    .send(
      validateReleaseRecoveryResult(releaseRecoveryGatewayFailure(request, 'capability_denied')),
    );
}

function sendMissingReleaseRecoveryScope(request: ReleaseRecoveryRequestType, reply: FastifyReply) {
  return reply
    .code(404)
    .send(
      validateReleaseRecoveryResult(releaseRecoveryGatewayFailure(request, 'document_not_found')),
    );
}

type AuthoringReleaseClient = 'hosted-editor' | 'direct-sdk';

async function handleAuthoringReleaseState(
  options: RegisterControlPlaneRoutesOptions,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
  client: AuthoringReleaseClient,
) {
  const record = await options.repository.getDocument(session.workspaceId, session.documentId);
  if (!record) {
    return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
  }
  const deployment = await options.repository.getDocumentDeployment(
    session.workspaceId,
    session.environmentId,
    session.documentId,
  );
  const activePublication = await options.repository.getCurrentPublicationForDocument(
    session.workspaceId,
    session.environmentId,
    session.documentId,
  );
  const latestArtifactCandidate = record.latestArtifact ?? null;
  if (
    latestArtifactCandidate &&
    !authoringSessionArtifactMatches(session, latestArtifactCandidate.compiled)
  ) {
    return sendAuthoringSessionCompatibilityChanged(reply);
  }
  const latestArtifact = latestArtifactCandidate;
  const visualChecks = latestArtifact
    ? await options.repository.listVisualCheckRuns(session.workspaceId, session.documentId)
    : [];
  const visualCheck =
    visualChecks.find(
      (run) =>
        run.environmentId === session.environmentId &&
        run.compiledArtifactId === latestArtifact?.id &&
        run.contentHash === latestArtifact?.contentHash,
    ) ?? null;
  const publishIssues = validateTourPublishReadiness(record.document);
  const themeMigrationRequired = hasLegacyThemeReference(record.document);
  const themeReview = themeMigrationRequired
    ? null
    : await getThemeReleaseReview(options.repository, record.document);
  const visualReport =
    visualCheck?.report ??
    (latestArtifact?.compiled.artifactSchemaVersion === '2'
      ? await runBasicVisualPreflight(latestArtifact.compiled, new Date().toISOString())
      : null);
  const findings = [
    ...publishIssues.map((issue) => ({
      code: issue.code,
      severity: 'blocker' as const,
      label: issue.message,
    })),
    ...(themeMigrationRequired
      ? [
          {
            code: 'theme_migration_required',
            severity: 'blocker' as const,
            label: 'Choose an approved Brand theme before publishing this legacy draft.',
          },
        ]
      : []),
    ...(themeReview
      ? [
          {
            code: 'theme_review_required',
            severity: 'blocker' as const,
            label: 'Review the latest approved Brand theme before publishing this draft.',
          },
        ]
      : []),
    ...(visualReport?.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      label: basicVisualPreflightIssueLabel(issue.code),
    })) ?? []),
  ];
  let state: 'open_in_staging' | 'no_saved_artifact' | 'ready' | 'current';
  if (session.environment !== 'staging') {
    state = 'open_in_staging';
  } else if (!latestArtifact) {
    state = 'no_saved_artifact';
  } else if (activePublication?.contentHash === latestArtifact.contentHash) {
    state = 'current';
  } else {
    state = 'ready';
  }
  const pipeline = await buildAuthoringReleasePipeline(
    options.repository,
    session.workspaceId,
    session.documentId,
    latestArtifact,
    findings.some((finding) => finding.severity === 'blocker'),
  );
  const releaseState = {
    available: session.environment === 'staging',
    environment: session.environment,
    environmentId: session.environmentId,
    documentId: session.documentId,
    expectedGeneration: deployment?.generation ?? 0,
    draftArtifactId: latestArtifact?.id ?? null,
    draftContentHash: latestArtifact?.contentHash ?? null,
    activeContentHash: activePublication?.contentHash ?? null,
    state,
    findings,
    ...(pipeline ? { pipeline } : {}),
  };
  if (client === 'direct-sdk') {
    return validateAuthoringStagingReleaseState(releaseState);
  }
  return { ...releaseState, visualCheck };
}

async function buildAuthoringReleasePipeline(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  draftArtifact: PersistedCompiledArtifact | null,
  hasBlockers: boolean,
) {
  const environments = await repository.listEnvironments(workspaceId);
  const stagingEnvironment = environments.find((environment) => environment.kind === 'staging');
  const productionEnvironment = environments.find(
    (environment) => environment.kind === 'production',
  );
  if (!stagingEnvironment || !productionEnvironment) return null;

  const [stagingDeployment, productionDeployment, stagingPublication, productionPublication] =
    await Promise.all([
      repository.getDocumentDeployment(workspaceId, stagingEnvironment.id, documentId),
      repository.getDocumentDeployment(workspaceId, productionEnvironment.id, documentId),
      repository.getCurrentPublicationForDocument(workspaceId, stagingEnvironment.id, documentId),
      repository.getCurrentPublicationForDocument(
        workspaceId,
        productionEnvironment.id,
        documentId,
      ),
    ]);
  const verifications = stagingPublication
    ? await repository.listPublicationVerifications(workspaceId, stagingPublication.id)
    : [];
  const latestVerification = verifications[0] ?? null;
  const pendingOperation = productionDeployment?.pendingReleaseOperationId
    ? await repository.getReleaseOperationById(
        workspaceId,
        productionDeployment.pendingReleaseOperationId,
      )
    : null;
  const approvals = pendingOperation
    ? await repository.listReleaseApprovals(workspaceId, pendingOperation.id)
    : [];
  const approvedCount = Math.min(
    approvals.filter((approval) => approval.decision === 'approved').length,
    1,
  );
  const rejected = approvals.some((approval) => approval.decision === 'rejected');
  const presentation = deriveAuthoringReleasePipelinePresentation({
    hasBlockers,
    hasDraft: Boolean(draftArtifact),
    stagingIsCurrent:
      Boolean(draftArtifact) &&
      stagingPublication?.compiledArtifactId === draftArtifact?.id &&
      stagingPublication?.contentHash === draftArtifact?.contentHash,
    stagingPublished: Boolean(stagingPublication),
    verificationStatus: latestVerification?.result ?? null,
    productionIsCurrent:
      Boolean(stagingPublication) &&
      productionPublication?.compiledArtifactId === stagingPublication?.compiledArtifactId &&
      productionPublication?.contentHash === stagingPublication?.contentHash,
    promotionStatus: pendingOperation?.status ?? null,
    rejected,
  });
  return {
    state: presentation.state,
    nextAction: presentation.nextAction,
    staging: {
      environmentId: stagingEnvironment.id,
      generation: stagingDeployment?.generation ?? 0,
      publicationId: stagingPublication?.id ?? null,
      sourcePublicationId: stagingPublication?.id ?? null,
      compiledArtifactId: stagingPublication?.compiledArtifactId ?? null,
      contentHash: stagingPublication?.contentHash ?? null,
      verification: {
        state: latestVerification?.result ?? 'not_run',
        ...(latestVerification
          ? {
              verificationId: latestVerification.id,
              verifiedAt: latestVerification.createdAt,
            }
          : {}),
      },
    },
    production: {
      environmentId: productionEnvironment.id,
      generation: productionDeployment?.generation ?? 0,
      publicationId: productionPublication?.id ?? null,
      compiledArtifactId: productionPublication?.compiledArtifactId ?? null,
      contentHash: productionPublication?.contentHash ?? null,
    },
    approvals: {
      operationId: pendingOperation?.id ?? null,
      requiredCount: productionEnvironment.requiredApprovalCount ?? 0,
      approvedCount,
      rejected,
    },
  };
}

interface ReleasePipelinePresentationInput {
  hasBlockers: boolean;
  hasDraft: boolean;
  stagingIsCurrent: boolean;
  stagingPublished: boolean;
  verificationStatus: 'passed' | 'failed' | null;
  productionIsCurrent: boolean;
  promotionStatus: PersistedReleaseOperation['status'] | null;
  rejected: boolean;
}

function deriveAuthoringReleasePipelinePresentation(input: ReleasePipelinePresentationInput): {
  state:
    | 'not_published'
    | 'active_unverified'
    | 'verified'
    | 'update_available'
    | 'awaiting_approval'
    | 'failed';
  nextAction:
    | 'review_blockers'
    | 'publish_staging'
    | 'verify_staging'
    | 'request_approval'
    | 'promote_production'
    | 'live_in_production';
} {
  if (input.hasBlockers) {
    return { state: 'failed', nextAction: 'review_blockers' };
  }
  if (!input.hasDraft || !input.stagingPublished) {
    return { state: 'not_published', nextAction: 'publish_staging' };
  }
  if (!input.stagingIsCurrent) {
    return { state: 'update_available', nextAction: 'publish_staging' };
  }
  if (input.verificationStatus === null || input.verificationStatus === 'failed') {
    return {
      state: input.verificationStatus === 'failed' ? 'failed' : 'active_unverified',
      nextAction: 'verify_staging',
    };
  }
  if (input.rejected || input.promotionStatus === 'failed') {
    return { state: 'failed', nextAction: 'promote_production' };
  }
  if (input.promotionStatus === 'awaiting_approval') {
    return { state: 'awaiting_approval', nextAction: 'request_approval' };
  }
  if (!input.productionIsCurrent) {
    return { state: 'verified', nextAction: 'promote_production' };
  }
  return { state: 'verified', nextAction: 'live_in_production' };
}

async function handleAuthoringStagingPublication(
  options: RegisterControlPlaneRoutesOptions,
  session: AuthoringSessionRecord,
  request: FastifyRequest,
  reply: FastifyReply,
  client: AuthoringReleaseClient,
) {
  if (session.environment !== 'staging') {
    return reply.code(409).send({
      error: 'staging_authoring_session_required',
      message: 'Open Lodariq on the configured staging origin to publish this draft',
    });
  }
  const [environmentPolicyScope, actorRole] = await Promise.all([
    findEnvironmentPolicyScope(options.repository, session.workspaceId, session.environmentId),
    resolveCurrentAuthoringMembershipRole(options.repository, session),
  ]);
  if (!environmentPolicyScope || !actorRole) {
    return reply.code(403).send({
      error: 'environment_policy_forbidden',
      message: 'An active configured staging policy and workspace membership are required',
    });
  }
  if (
    !requireDirectPublishEnvironmentPolicy(
      environmentPolicyScope.policy,
      { role: actorRole, userId: session.createdByUserId },
      reply,
    )
  ) {
    return;
  }

  const idempotencyKey = readHeader(request, IDEMPOTENCY_KEY_HEADER);
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return reply.code(400).send({
      error: 'invalid_idempotency_key',
      message: 'A valid Idempotency-Key header is required for staging publication',
    });
  }
  const correlationId = readHeader(request, RELEASE_CORRELATION_ID_HEADER);
  if (!correlationId || !RELEASE_CORRELATION_ID_PATTERN.test(correlationId)) {
    return reply.code(400).send({
      error: 'invalid_correlation_id',
      message: `A valid ${RELEASE_CORRELATION_ID_HEADER} header is required`,
    });
  }

  const record = await options.repository.getDocument(session.workspaceId, session.documentId);
  if (!record) {
    return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
  }
  const { expectedGeneration, expectedArtifactId, expectedContentHash } = request.body as {
    expectedGeneration: number;
    expectedArtifactId: string;
    expectedContentHash: string;
  };
  const requestHash = await createStagingPublicationRequestHash({
    workspaceId: session.workspaceId,
    documentId: session.documentId,
    environmentId: session.environmentId,
    artifactId: expectedArtifactId,
    contentHash: expectedContentHash,
    expectedGeneration,
  });
  const existingOperation = await options.repository.getReleaseOperation(
    session.workspaceId,
    session.environmentId,
    session.documentId,
    idempotencyKey,
  );
  let artifact: PersistedCompiledArtifact;
  let visualCheck: VisualCheckRunRecord | null;
  if (existingOperation) {
    if (!existingOperation.requestedArtifactId) {
      return reply.code(409).send({
        error: 'idempotency_conflict',
        message: 'The idempotency key belongs to another release action',
      });
    }
    const existingArtifact = await options.repository.getCompiledArtifact(
      session.workspaceId,
      session.documentId,
      existingOperation.requestedArtifactId,
    );
    if (!existingArtifact) {
      throw new Error('release operation references an unavailable compiled artifact');
    }
    artifact = existingArtifact;
    if (!authoringSessionArtifactMatches(session, artifact.compiled)) {
      return sendAuthoringSessionCompatibilityChanged(reply);
    }
    visualCheck = await findVisualCheckForArtifact(
      options.repository,
      session.workspaceId,
      session.documentId,
      session.environmentId,
      artifact,
    );
  } else {
    const reviewed = await loadReviewedReleaseArtifact(
      options.repository,
      session.workspaceId,
      session.documentId,
      expectedArtifactId,
      expectedContentHash,
    );
    if (!reviewed) {
      return reply.code(409).send({
        error: 'reviewed_artifact_unavailable',
        message: 'The reviewed artifact changed or is no longer available; review staging again',
      });
    }
    const publishIssues = validateTourPublishReadiness(reviewed.document);
    if (publishIssues.length) {
      return reply.code(409).send({
        error: 'publish_blocked',
        message: publishIssues[0]?.message ?? 'Document is not ready to publish',
        issues: publishIssues.map(toPublishReadinessIssueResponse),
      });
    }
    if (hasLegacyThemeReference(reviewed.document)) {
      return reply.code(409).send({
        error: 'theme_migration_required',
        message: 'Choose an approved Brand theme before publishing this legacy draft',
      });
    }
    const themeReview = await getThemeReleaseReview(options.repository, reviewed.document);
    if (themeReview) {
      return reply.code(409).send({
        error: 'theme_review_required',
        message: 'Review the latest approved Brand theme before publishing this draft',
        ...themeReview,
      });
    }
    artifact = reviewed.artifact;
    if (!authoringSessionArtifactMatches(session, artifact.compiled)) {
      return sendAuthoringSessionCompatibilityChanged(reply);
    }
    visualCheck = await runAndPersistVisualPreflight({
      repository: options.repository,
      workspaceId: session.workspaceId,
      documentId: session.documentId,
      environmentId: session.environmentId,
      artifact,
      actorUserId: session.createdByUserId,
    });
    if (visualCheck.status === 'blocked') {
      return reply.code(409).send({
        error: 'visual_preflight_blocked',
        message: 'Brand and layout preflight found issues that must be fixed before staging',
        visualCheck,
      });
    }
  }
  try {
    const result = await options.repository.activateCompiledArtifact({
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      correlationId,
      artifact,
      actorUserId: session.createdByUserId,
      idempotencyKey,
      requestHash,
      expectedGeneration,
      expectedEnvironmentPolicyUpdatedAt: environmentPolicyScope.environment.updatedAt,
    });
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: result.replayed ? 'publish.replayed' : 'publish.completed',
        correlationId,
        workspaceId: session.workspaceId,
        documentId: session.documentId,
        environmentId: session.environmentId,
        userId: session.createdByUserId,
        attributes: {
          source: client,
          contentHash: result.publication.contentHash,
          generation: result.deployment.generation,
        },
      }),
    );
    const statusCode = result.replayed ? 200 : 201;
    if (client === 'direct-sdk') {
      const publicationResult = validateAuthoringStagingPublicationResult({
        ok: true,
        replayed: result.replayed,
        generation: result.deployment.generation,
        findings:
          visualCheck?.report.issues.map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            label: basicVisualPreflightIssueLabel(issue.code),
          })) ?? [],
      });
      return reply.code(statusCode).send(publicationResult);
    }
    return reply.code(statusCode).send({
      replayed: result.replayed,
      operation: result.operation,
      deployment: result.deployment,
      publication: toPublicationResponse(result.publication),
      visualCheck,
    });
  } catch (error) {
    if (error instanceof EnvironmentReleasePolicyChangedError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnvironmentPolicyMutationForbiddenError) {
      return reply.code(409).send({
        error: error.code,
        code: error.decisionCode,
        message: error.message,
      });
    }
    if (error instanceof IdempotencyConflictError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof DeploymentChangedError) {
      return reply.code(409).send({
        error: error.code,
        message: error.message,
        expectedGeneration: error.expectedGeneration,
        actualGeneration: error.actualGeneration,
      });
    }
    if (error instanceof ReleaseOperationInProgressError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    throw error;
  }
}

async function handleAuthoringStyleSource(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  proposal: ProductStyleProposalType,
  reply: FastifyReply,
) {
  const record = await repository.getDocument(session.workspaceId, session.documentId);
  if (!record) {
    return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
  }
  const resolvedTheme = await resolveDocumentTheme(repository, record.document);
  const theme = await repository.getWorkspaceTheme(session.workspaceId, resolvedTheme.themeId);
  if (!theme) {
    return reply.code(409).send({
      error: 'workspace_theme_required',
      message: 'Choose or create a workspace Brand theme before applying Product match',
    });
  }
  try {
    const applied = await applyProductStyleProposal({
      repository,
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      theme,
      proposal,
      actorUserId: session.createdByUserId,
    });
    return reply.code(201).send(applied);
  } catch (error) {
    return sendWorkspaceThemeMutationError(error, reply);
  }
}

async function handleAuthoringBrandDriftCheck(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: BrandDriftCheckRequestType,
  reply: FastifyReply,
) {
  try {
    return await checkAuthoringBrandDrift({ repository, session, request });
  } catch (error) {
    if (error instanceof BrandDriftCheckError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    throw error;
  }
}

async function handleAuthoringBrandThemeAcknowledgement(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: AuthoringBrandThemeAcknowledgementRequestType,
  reply: FastifyReply,
): Promise<AuthoringBrandThemeAcknowledgementResultType | FastifyReply> {
  try {
    return await acknowledgeAuthoringBrandTheme({
      repository,
      session,
      request,
      compile: (document) => compileAndValidate(repository, document),
    });
  } catch (error) {
    if (error instanceof BrandThemeAcknowledgementError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    throw error;
  }
}

interface ApplyProductStyleProposalInput {
  repository: ControlPlaneRepository;
  workspaceId: string;
  environmentId: string;
  theme: WorkspaceThemeRecord;
  proposal: ProductStyleProposalType;
  actorUserId: string;
}

/**
 * Applying Product match updates only the mutable workspace-theme draft. The
 * approved version and every compiled/live artifact remain immutable until a
 * later explicit approval and publication.
 */
async function applyProductStyleProposal(input: ApplyProductStyleProposalInput) {
  const nextDraft = mergeProductStyleTokensIntoDraft(input.theme.draft, input.proposal);
  const applied = await input.repository.applyProductStyleProposal({
    workspaceId: input.workspaceId,
    themeId: input.theme.id,
    environmentId: input.environmentId,
    proposal: input.proposal,
    draft: nextDraft,
    expectedRevision: input.theme.revision,
    expectedUpdatedAt: input.theme.updatedAt,
    actorUserId: input.actorUserId,
  });
  if (!applied) throw new Error('workspace Brand theme disappeared during Product match');
  const source = applied.sources[0];
  if (!source) throw new Error('Product match did not persist a provenance source');
  const receipt = applied.application.receipt;
  const previewTheme = receipt.previewTheme;
  const productMatchCandidate = {
    ...receipt,
    replayed: applied.replayed,
  };
  const productMatchValidation = validate(AuthoringProductMatchApplyResult, productMatchCandidate);
  if (!productMatchValidation.valid) {
    throw new Error('persisted Product match result failed canonical schema validation');
  }
  const productMatch = productMatchValidation.value;
  return {
    source,
    sources: applied.sources,
    // Legacy callers receive the truthful current mutable theme. The canonical
    // Product Match receipt and preview above always remain the exact original
    // application, even after later draft mutations.
    theme: withLatestStyleSource(applied.theme, source),
    previewTheme,
    draftChanged: receipt.draftChanged,
    replayed: applied.replayed,
    productMatch,
  };
}

function withLatestStyleSource(theme: WorkspaceThemeRecord, record: StyleSourceRecord | null) {
  return {
    ...theme,
    latestStyleSource: record
      ? {
          ...record.source,
          recordId: record.id,
          sourceHash: record.sourceHash,
          environmentId: record.environmentId,
          recordedAt: record.createdAt,
        }
      : null,
  };
}

interface ExactPublicationVerificationInput {
  workspaceId: string;
  environmentId: string;
  publicationId: string;
  report: AuthoringStagingVerificationRequestType['report'];
  verifiedOrigin: string;
  actorUserId: string;
}

async function createExactPublicationVerification(
  repository: ControlPlaneRepository,
  input: ExactPublicationVerificationInput,
  reply: FastifyReply,
) {
  try {
    const verification = await persistExactPublicationVerification(repository, input);
    return reply.code(201).send({ verification });
  } catch (error) {
    if (error instanceof InvalidBrowserVerificationReportError) {
      return reply.code(400).send({ error: 'invalid_report', message: error.message });
    }
    if (error instanceof ActivePublicationChangedError) {
      return reply.code(409).send({
        error: 'publication_not_active',
        message: error.message,
        expectedPublicationId: error.expectedPublicationId,
        actualPublicationId: error.actualPublicationId,
      });
    }
    throw error;
  }
}

async function createAuthoringPublicationVerification(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: AuthoringStagingVerificationRequestType,
  verifiedOrigin: string,
  reply: FastifyReply,
) {
  if (session.environment !== 'staging') {
    return reply.code(409).send({
      ok: false,
      code: 'origin_mismatch',
      message: 'Verification must run in the configured staging environment',
    } satisfies AuthoringStagingVerificationResultType);
  }
  try {
    const verification = await persistExactPublicationVerification(repository, {
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      publicationId: request.publicationId,
      report: request.report,
      verifiedOrigin,
      actorUserId: session.createdByUserId,
    });
    return reply
      .code(201)
      .send(validateAuthoringStagingVerificationResult({ ok: true, verification }));
  } catch (error) {
    if (error instanceof InvalidBrowserVerificationReportError) {
      return reply.code(400).send(
        validateAuthoringStagingVerificationResult({
          ok: false,
          code: 'invalid_report',
          message: error.message,
        }),
      );
    }
    if (error instanceof ActivePublicationChangedError) {
      return reply.code(409).send(
        validateAuthoringStagingVerificationResult({
          ok: false,
          code: 'publication_not_active',
          message: error.message,
        }),
      );
    }
    throw error;
  }
}

async function persistExactPublicationVerification(
  repository: ControlPlaneRepository,
  input: ExactPublicationVerificationInput,
): Promise<PublicationVerificationType> {
  assertCompleteBrowserVerificationReport(input.report);
  const [environment, publication] = await Promise.all([
    findEnvironment(repository, input.workspaceId, input.environmentId),
    repository.getPublicationById(input.workspaceId, input.publicationId),
  ]);
  if (!environment || environment.kind !== 'staging') {
    throw new Error('publication verification requires a configured staging environment');
  }
  if (!environment.originAllowlist.includes(input.verifiedOrigin)) {
    throw new Error('verification Origin is not allowlisted for the staging environment');
  }
  if (
    !publication ||
    publication.environmentId !== environment.id ||
    publication.workspaceId !== input.workspaceId
  ) {
    throw new ActivePublicationChangedError(input.publicationId, null);
  }
  const compiled = publication.artifact.compiled;
  if (compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION) {
    throw new Error('browser verification requires a Phase 2 compiled artifact');
  }
  const record = await repository.createPublicationVerification({
    workspaceId: input.workspaceId,
    environmentId: environment.id,
    documentId: publication.documentId,
    expectedPublicationId: publication.id,
    report: input.report,
    verifiedOrigin: input.verifiedOrigin,
    actorUserId: input.actorUserId,
  });
  return toPublicationVerification(record, publication);
}

class InvalidBrowserVerificationReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBrowserVerificationReportError';
  }
}

function assertCompleteBrowserVerificationReport(
  report: AuthoringStagingVerificationRequestType['report'],
): void {
  const seen = new Set(report.checks.map((check) => check.code));
  const hasEveryRequiredCheck = BROWSER_VERIFICATION_CHECK_CODES.every((code) => seen.has(code));
  if (
    report.checks.length !== BROWSER_VERIFICATION_CHECK_CODES.length ||
    seen.size !== BROWSER_VERIFICATION_CHECK_CODES.length ||
    !hasEveryRequiredCheck
  ) {
    throw new InvalidBrowserVerificationReportError(
      'Browser verification must report each required check exactly once',
    );
  }

  let expectedStatus: AuthoringStagingVerificationRequestType['report']['status'] = 'passed';
  if (report.checks.some((check) => check.status === 'failed')) expectedStatus = 'failed';
  else if (report.checks.some((check) => check.status === 'warning')) expectedStatus = 'warning';
  if (report.status !== expectedStatus) {
    throw new InvalidBrowserVerificationReportError(
      'Browser verification status must match its individual check results',
    );
  }
}

function toPublicationVerification(
  record: PublicationVerificationRecord,
  publication: PersistedPublication,
): PublicationVerificationType {
  const reportValidation = validate(BrowserVerificationReport, record.report);
  const compiled = publication.artifact.compiled;
  if (
    !reportValidation.valid ||
    compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION
  ) {
    throw new Error('stored browser verification no longer matches its canonical contract');
  }
  const value = {
    id: record.id,
    workspaceId: record.workspaceId,
    environmentId: record.environmentId,
    documentId: record.documentId,
    publicationId: record.publicationId,
    compiledArtifactId: publication.compiledArtifactId,
    artifactSchemaVersion: compiled.artifactSchemaVersion,
    contentHash: publication.contentHash,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    verifiedOrigin: record.verifiedOrigin,
    verifiedByUserId: record.verifiedByUserId,
    createdAt: record.createdAt,
    result: record.result,
    report: reportValidation.value,
  };
  const validation = validate(PublicationVerification, value);
  if (!validation.valid) {
    throw new Error(
      `Publication verification response failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

interface ProductionPromotionScope {
  workspaceId: string;
  documentId: string;
  actorUserId: string;
  request: ProductionPromotionRequestType;
}

async function handleProductionPromotion(
  options: RegisterControlPlaneRoutesOptions,
  scope: ProductionPromotionScope,
  reply: FastifyReply,
) {
  const [document, sourcePublication, targetEnvironment] = await Promise.all([
    options.repository.getDocument(scope.workspaceId, scope.documentId),
    options.repository.getPublicationById(scope.workspaceId, scope.request.sourcePublicationId),
    findEnvironment(options.repository, scope.workspaceId, scope.request.productionEnvironmentId),
  ]);
  if (!document || !sourcePublication || sourcePublication.documentId !== scope.documentId) {
    return sendProductionPromotionFailure(
      reply,
      404,
      'source_not_active',
      'Staging publication not found',
    );
  }
  const sourceEnvironment = await findEnvironment(
    options.repository,
    scope.workspaceId,
    sourcePublication.environmentId,
  );
  if (!sourceEnvironment || sourceEnvironment.kind !== 'staging') {
    return sendProductionPromotionFailure(
      reply,
      409,
      'source_not_active',
      'Production promotion requires an active staging publication',
    );
  }
  if (!targetEnvironment || targetEnvironment.kind !== 'production') {
    return sendProductionPromotionFailure(
      reply,
      409,
      'environment_not_configured',
      'Choose a configured production environment',
    );
  }
  const [membership, verifications, existingOperation] = await Promise.all([
    options.repository.resolveWorkspaceMembership(scope.workspaceId, scope.actorUserId),
    options.repository.listPublicationVerifications(scope.workspaceId, sourcePublication.id),
    options.repository.getReleaseOperation(
      scope.workspaceId,
      targetEnvironment.id,
      scope.documentId,
      scope.request.idempotencyKey,
    ),
  ]);
  const actorRole = membership ? authRoleFromMembership(membership.role) : null;
  const targetPolicy = await findEnvironmentPolicyRow(
    options.repository,
    scope.workspaceId,
    targetEnvironment.id,
  );
  if (!actorRole || !targetPolicy) {
    return sendProductionPromotionFailure(
      reply,
      403,
      'environment_not_configured',
      'An active production policy and workspace membership are required',
    );
  }
  const passedVerification = verifications
    .filter((verification) => verification.result === 'passed')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const approvals = existingOperation
    ? await options.repository.listReleaseApprovals(scope.workspaceId, existingOperation.id)
    : [];
  const policyDecision = evaluateEnvironmentReleasePolicy({
    environment: targetPolicy,
    action: 'promote',
    sourceEnvironmentId: sourceEnvironment.id,
    actorRole,
    actorUserId: scope.actorUserId,
    sourceVerified: Boolean(passedVerification),
    ...(passedVerification ? { sourceVerifiedByUserId: passedVerification.verifiedByUserId } : {}),
    approvedByUserIds: approvals
      .filter((approval) => approval.decision === 'approved')
      .map((approval) => approval.decidedByUserId),
  });
  if (!policyDecision.allowed && policyDecision.code !== 'approval_required') {
    return sendEnvironmentPolicyDecision(policyDecision, reply);
  }
  try {
    const result = await promoteExactVerifiedPublication(options.repository, {
      workspaceId: scope.workspaceId,
      sourceEnvironmentId: sourceEnvironment.id,
      targetEnvironmentId: targetEnvironment.id,
      documentId: scope.documentId,
      expectedSourcePublicationId: sourcePublication.id,
      correlationId: scope.request.correlationId,
      actorUserId: scope.actorUserId,
      idempotencyKey: scope.request.idempotencyKey,
      expectedGeneration: scope.request.expectedGeneration,
      expectedEnvironmentPolicyUpdatedAt: targetEnvironment.updatedAt,
    });
    const response = validateProductionPromotionResult(toProductionPromotionResult(result));
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: productionPromotionEventName(result.operation, result.replayed),
        correlationId: scope.request.correlationId,
        workspaceId: scope.workspaceId,
        documentId: scope.documentId,
        environmentId: targetEnvironment.id,
        userId: scope.actorUserId,
        attributes: {
          sourcePublicationId: sourcePublication.id,
          contentHash: sourcePublication.contentHash,
        },
      }),
    );
    let statusCode = 201;
    if (response.state === 'awaiting_approval') statusCode = 202;
    else if (result.replayed) statusCode = 200;
    return reply.code(statusCode).send(response);
  } catch (error) {
    if (error instanceof EnvironmentReleasePolicyChangedError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnvironmentPolicyMutationForbiddenError) {
      return reply.code(409).send({
        error: error.code,
        code: error.decisionCode,
        message: error.message,
      });
    }
    return sendProductionPromotionError(error, reply);
  }
}

function productionPromotionEventName(
  operation: PersistedReleaseOperation,
  replayed: boolean,
): 'promote.awaiting_approval' | 'promote.replayed' | 'promote.completed' {
  if (operation.status === 'awaiting_approval') return 'promote.awaiting_approval';
  return replayed ? 'promote.replayed' : 'promote.completed';
}

function toProductionPromotionResult(
  result: Awaited<ReturnType<ControlPlaneRepository['promoteVerifiedPublication']>>,
): ProductionPromotionResultType {
  if (result.operation.status === 'awaiting_approval') {
    return {
      ok: true,
      state: 'awaiting_approval',
      replayed: result.replayed,
      releaseOperationId: result.operation.id,
      requiredApprovalCount: Math.max(1, Math.min(result.requiredApprovalCount, 1)),
      approvalCount: Math.min(result.approvalCount, 1),
    };
  }
  const publication = result.publication;
  if (!publication || !result.deployment) {
    throw new Error('completed promotion is missing its exact publication result');
  }
  const compiled = publication.artifact.compiled;
  if (
    compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION ||
    compiled.rendererContractVersion !== RENDERER_CONTRACT_VERSION
  ) {
    throw new Error('production promotion requires a Phase 2 compiled artifact');
  }
  return {
    ok: true,
    state: 'completed',
    replayed: result.replayed,
    releaseOperationId: result.operation.id,
    publicationId: publication.id,
    generation: result.deployment.generation,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
  };
}

function validateProductionPromotionResult(value: unknown): ProductionPromotionResultType {
  const validation = validate(ProductionPromotionResult, value);
  if (!validation.valid) {
    throw new Error(
      `Production promotion response failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function sendProductionPromotionFailure(
  reply: FastifyReply,
  statusCode: number,
  code: Extract<ProductionPromotionResultType, { ok: false }>['code'],
  message: string,
  generation?: { expectedGeneration: number; actualGeneration: number },
) {
  return reply.code(statusCode).send(
    validateProductionPromotionResult({
      ok: false,
      state: 'failed',
      code,
      message,
      ...(generation ?? {}),
    }),
  );
}

function sendProductionPromotionError(error: unknown, reply: FastifyReply) {
  const failure = productionPromotionFailureForError(error);
  if (failure) {
    return sendProductionPromotionFailure(
      reply,
      failure.statusCode,
      failure.code,
      failure.message,
      failure.generation,
    );
  }
  throw error;
}

interface ProductionPromotionFailureDetails {
  statusCode: number;
  code: Extract<ProductionPromotionResultType, { ok: false }>['code'];
  message: string;
  generation?: { expectedGeneration: number; actualGeneration: number };
}

function productionPromotionFailureForError(
  error: unknown,
): ProductionPromotionFailureDetails | null {
  if (error instanceof ActivePublicationChangedError) {
    return { statusCode: 409, code: 'source_not_active', message: error.message };
  }
  if (error instanceof PublicationVerificationRequiredError) {
    return { statusCode: 409, code: 'source_not_verified', message: error.message };
  }
  if (error instanceof ReleaseApprovalRejectedError) {
    return { statusCode: 409, code: 'approval_rejected', message: error.message };
  }
  if (error instanceof DeploymentChangedError) {
    return {
      statusCode: 409,
      code: 'deployment_changed',
      message: error.message,
      generation: {
        expectedGeneration: error.expectedGeneration,
        actualGeneration: error.actualGeneration,
      },
    };
  }
  if (error instanceof IdempotencyConflictError) {
    return { statusCode: 409, code: 'idempotency_conflict', message: error.message };
  }
  if (error instanceof ReleaseOperationInProgressError) {
    return {
      statusCode: 409,
      code: 'release_operation_in_progress',
      message: error.message,
    };
  }
  return null;
}

interface ReleaseApprovalScope {
  workspaceId: string;
  documentId?: string;
  operationId: string;
  actorUserId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

async function handleReleaseApproval(
  options: RegisterControlPlaneRoutesOptions,
  scope: ReleaseApprovalScope,
  reply: FastifyReply,
) {
  const operation = await options.repository.getReleaseOperationById(
    scope.workspaceId,
    scope.operationId,
  );
  if (
    !operation ||
    operation.action !== 'promote' ||
    (scope.documentId && operation.documentId !== scope.documentId)
  ) {
    return reply.code(404).send({
      error: 'not_found',
      message: 'Pending production release operation not found',
    });
  }
  if (operation.status !== 'awaiting_approval') {
    if (
      scope.decision === 'rejected' &&
      operation.status === 'failed' &&
      operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE
    ) {
      const existingApprovals = await options.repository.listReleaseApprovals(
        scope.workspaceId,
        operation.id,
      );
      const reason = normalizeReleaseApprovalReason(scope.reason);
      const existing = existingApprovals.find(
        (candidate) =>
          candidate.decidedByUserId === scope.actorUserId &&
          candidate.decision === 'rejected' &&
          candidate.reason === reason,
      );
      if (existing) {
        return reply.code(201).send({
          approval: toReleaseApproval(existing),
          promotion: validateProductionPromotionResult({
            ok: false,
            state: 'failed',
            code: 'approval_rejected',
            message: 'Production promotion was rejected',
          }),
        });
      }
    }
    return reply.code(409).send({
      error: 'release_not_awaiting_approval',
      message: 'This production release operation is no longer awaiting approval',
    });
  }
  if (!operation.sourcePublicationId) {
    throw new Error('promotion operation is missing staging publication provenance');
  }
  if (scope.decision === 'approved' && !operation.requestedByUserId) {
    return reply.code(409).send({
      error: 'environment_policy_forbidden',
      message: 'The production request is missing its original releaser identity',
    });
  }
  const requestedByUserId = operation.requestedByUserId;
  const [sourcePublication, targetPolicyScope, requesterMembership, verifications, priorApprovals] =
    await Promise.all([
      options.repository.getPublicationById(scope.workspaceId, operation.sourcePublicationId),
      findEnvironmentPolicyScope(options.repository, scope.workspaceId, operation.environmentId),
      requestedByUserId
        ? options.repository.resolveWorkspaceMembership(scope.workspaceId, requestedByUserId)
        : Promise.resolve(null),
      options.repository.listPublicationVerifications(
        scope.workspaceId,
        operation.sourcePublicationId,
      ),
      options.repository.listReleaseApprovals(scope.workspaceId, operation.id),
    ]);
  if (!sourcePublication) {
    throw new Error('promotion operation source publication is unavailable');
  }
  if (!targetPolicyScope || (scope.decision === 'approved' && !requesterMembership)) {
    return reply.code(403).send({
      error: 'environment_policy_forbidden',
      message: 'The original releaser no longer has an active production policy scope',
    });
  }
  if (scope.decision === 'approved') {
    if (!requestedByUserId || !requesterMembership) {
      throw new Error('approved release decision is missing its original requester scope');
    }
    const passedVerification = verifications
      .filter((verification) => verification.result === 'passed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    const approvedByUserIds = [
      ...new Set([
        ...priorApprovals
          .filter((approval) => approval.decision === 'approved')
          .map((approval) => approval.decidedByUserId),
        scope.actorUserId,
      ]),
    ];
    const policyDecision = evaluateEnvironmentReleasePolicy({
      environment: targetPolicyScope.policy,
      action: 'promote',
      sourceEnvironmentId: sourcePublication.environmentId,
      actorRole: authRoleFromMembership(requesterMembership.role),
      actorUserId: requestedByUserId,
      sourceVerified: Boolean(passedVerification),
      ...(passedVerification
        ? { sourceVerifiedByUserId: passedVerification.verifiedByUserId }
        : {}),
      approvedByUserIds,
    });
    if (!policyDecision.allowed) return sendEnvironmentPolicyDecision(policyDecision, reply);
  }
  let approval: ReleaseApprovalRecord;
  try {
    approval = await options.repository.createReleaseApproval({
      workspaceId: scope.workspaceId,
      releaseOperationId: operation.id,
      decision: scope.decision,
      reason: scope.reason,
      actorUserId: scope.actorUserId,
      expectedEnvironmentPolicyUpdatedAt: targetPolicyScope.environment.updatedAt,
    });
  } catch (error) {
    if (isImmutableReleaseApprovalConflict(error)) {
      return reply.code(409).send({
        error: 'release_approval_already_recorded',
        message: 'This approver already recorded an immutable decision',
      });
    }
    if (isReleaseOperationNoLongerAwaitingApproval(error)) {
      return reply.code(409).send({
        error: 'release_not_awaiting_approval',
        message: 'This production release operation is no longer awaiting approval',
      });
    }
    if (error instanceof EnvironmentReleasePolicyChangedError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnvironmentPolicyMutationForbiddenError) {
      return reply.code(409).send({
        error: error.code,
        code: error.decisionCode,
        message: error.message,
      });
    }
    throw error;
  }
  let promotion: ProductionPromotionResultType;
  if (scope.decision === 'rejected') {
    promotion = validateProductionPromotionResult({
      ok: false,
      state: 'failed',
      code: 'approval_rejected',
      message: 'Production promotion was rejected',
    });
    return reply.code(201).send({
      approval: toReleaseApproval(approval),
      promotion,
    });
  }
  try {
    const result = await promoteExactVerifiedPublication(options.repository, {
      workspaceId: scope.workspaceId,
      sourceEnvironmentId: sourcePublication.environmentId,
      targetEnvironmentId: operation.environmentId,
      documentId: operation.documentId,
      expectedSourcePublicationId: sourcePublication.id,
      correlationId: operation.correlationId,
      actorUserId: requestedByUserId!,
      idempotencyKey: operation.idempotencyKey,
      expectedGeneration: operation.expectedGeneration,
      expectedEnvironmentPolicyUpdatedAt: targetPolicyScope.environment.updatedAt,
    });
    promotion = validateProductionPromotionResult(toProductionPromotionResult(result));
  } catch (error) {
    if (error instanceof EnvironmentReleasePolicyChangedError) {
      return reply.code(409).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnvironmentPolicyMutationForbiddenError) {
      return reply.code(409).send({
        error: error.code,
        code: error.decisionCode,
        message: error.message,
      });
    }
    const failure = productionPromotionFailureForError(error);
    if (failure) {
      promotion = validateProductionPromotionResult({
        ok: false,
        state: 'failed',
        code: failure.code,
        message: failure.message,
        ...(failure.generation ?? {}),
      });
    } else {
      throw error;
    }
  }
  return reply.code(promotion.ok ? 200 : 201).send({
    approval: toReleaseApproval(approval),
    promotion,
  });
}

function isImmutableReleaseApprovalConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === 'release approver already recorded an immutable decision'
  );
}

function isReleaseOperationNoLongerAwaitingApproval(error: unknown): boolean {
  return error instanceof Error && error.message === 'release operation is not awaiting approval';
}

function toReleaseApproval(record: ReleaseApprovalRecord) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    releaseOperationId: record.releaseOperationId,
    decision: record.decision,
    ...(record.reason ? { reason: record.reason } : {}),
    decidedByUserId: record.decidedByUserId,
    createdAt: record.createdAt,
  };
}

function requireVerificationOrigin(
  environment: WorkspaceEnvironment,
  request: FastifyRequest,
  reply: FastifyReply,
): string | null {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (exactOrigin && environment.originAllowlist.includes(exactOrigin)) return exactOrigin;
  void reply.code(403).send({
    error: 'origin_mismatch',
    message: 'Browser verification must run on the exact allowlisted staging Origin',
  });
  return null;
}

async function authenticateHostedEditorSession(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthoringSessionRecord | null> {
  const rawToken = readHeader(request, AUTHORING_SESSION_HEADER);
  if (!rawToken) {
    await reply.code(401).send({
      error: 'authoring_session_required',
      message: 'A valid hosted-editor authoring session is required',
    });
    return null;
  }

  const session = await repository.resolveAuthoringSessionByTokenHash(
    hashAuthoringSessionToken(rawToken),
  );
  if (!session) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Authoring session is invalid, expired, or revoked',
    });
    return null;
  }
  const isActivatedHostedSession =
    session.environment !== 'production' &&
    Boolean(session.installationId) &&
    Boolean(session.activationGrantId) &&
    Boolean(session.customerOrigin) &&
    Array.isArray(session.capabilities) &&
    session.compilerVersion === COMPILER_VERSION &&
    session.rendererContractVersion === RENDERER_CONTRACT_VERSION &&
    session.themeContractVersion === BRAND_THEME_CONTRACT_VERSION &&
    Boolean(session.themeVersionId) &&
    isExactEditorIframeSource(session.iframeSrc);
  if (!isActivatedHostedSession) {
    await reply.code(403).send({
      error: 'authoring_session_scope_forbidden',
      message: 'Authoring session is not valid for the hosted editor',
    });
    return null;
  }
  return session;
}

function authoringSessionThemeMatches(
  session: AuthoringSessionRecord,
  theme: BrandThemeSnapshotType,
): boolean {
  return (
    session.themeContractVersion === theme.contractVersion &&
    session.themeVersionId === theme.themeVersionId
  );
}

function authoringSessionArtifactMatches(
  session: AuthoringSessionRecord,
  compiled: CompiledDocumentType,
): boolean {
  return (
    'theme' in compiled &&
    'rendererContractVersion' in compiled &&
    session.compilerVersion === compiled.compilerVersion &&
    session.rendererContractVersion === compiled.rendererContractVersion &&
    authoringSessionThemeMatches(session, compiled.theme)
  );
}

function sendAuthoringSessionCompatibilityChanged(reply: FastifyReply) {
  return reply.code(409).send({
    error: 'authoring_session_compatibility_changed',
    message: 'The document compatibility contract changed; reopen Lodariq authoring to continue',
  });
}

function requireAuthoringSessionCapability(
  session: AuthoringSessionRecord,
  capability: AuthoringSessionCapability,
  reply: FastifyReply,
): boolean {
  if (session.capabilities?.includes(capability)) return true;
  void reply.code(403).send({
    error: 'authoring_capability_forbidden',
    message: 'Authoring session does not grant this document operation',
  });
  return false;
}

async function requireHostedStagingPublicationCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    !requireAuthoringSessionCapability(
      session,
      AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
      reply,
    )
  ) {
    return false;
  }
  if (await currentAuthoringMemberCanPublishToStaging(repository, session)) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'This workspace membership cannot publish to staging',
  });
  return false;
}

async function requireHostedReleaseStateCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    !requireAuthoringSessionCapability(
      session,
      AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
      reply,
    )
  ) {
    return false;
  }
  if ((await resolveCurrentAuthoringMembershipRole(repository, session)) !== null) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'An active workspace membership is required to read release state',
  });
  return false;
}

async function requireDirectSdkStagingPublicationCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (await directSdkSessionCanPublishToStaging(repository, session)) return true;
  void reply.code(403).send({
    error: 'authoring_capability_forbidden',
    message: 'This authoring session cannot publish to staging',
  });
  return false;
}

async function requireDirectSdkReleaseStateCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (await directSdkSessionCanReadReleaseState(repository, session)) return true;
  void reply.code(403).send({
    error: 'authoring_capability_forbidden',
    message: 'This authoring session cannot read document release state',
  });
  return false;
}

async function requireDirectReleaseRecoveryCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
): Promise<boolean> {
  const sessionCapability =
    request.action === 'rollback'
      ? AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE
      : AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE;
  const releaseCapability: ReleaseCapability =
    request.action === 'rollback' ? 'rollback-release' : 'unpublish-release';
  if (
    session.environment === 'staging' &&
    directSdkSessionHasExplicitCapability(session, sessionCapability) &&
    (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability))
  ) {
    return true;
  }
  void sendReleaseRecoveryCapabilityDenied(request, reply);
  return false;
}

async function requireHostedReleaseRecoveryCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
): Promise<boolean> {
  const sessionCapability =
    request.action === 'rollback'
      ? AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE
      : AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE;
  const releaseCapability: ReleaseCapability =
    request.action === 'rollback' ? 'rollback-release' : 'unpublish-release';
  if (
    session.environment === 'staging' &&
    session.capabilities?.includes(sessionCapability) &&
    (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability))
  ) {
    return true;
  }
  void sendReleaseRecoveryCapabilityDenied(request, reply);
  return false;
}

async function directSdkSessionCanReadReleaseState(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<boolean> {
  if (session.environment === 'production') return false;
  if (!directSdkSessionHasCapability(session, AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE)) {
    return false;
  }
  return (await resolveCurrentAuthoringMembershipRole(repository, session)) !== null;
}

async function directSdkSessionCanPublishToStaging(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<boolean> {
  if (session.environment !== 'staging') return false;
  if (!directSdkSessionHasCapability(session, AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING)) {
    return false;
  }
  return currentAuthoringMemberCanPublishToStaging(repository, session);
}

function directSdkSessionHasCapability(
  session: AuthoringSessionRecord,
  capability: AuthoringSessionCapability,
): boolean {
  return !Array.isArray(session.capabilities) || session.capabilities.includes(capability);
}

function directSdkSessionHasExplicitCapability(
  session: AuthoringSessionRecord,
  capability: AuthoringSessionCapability,
): boolean {
  return Array.isArray(session.capabilities) && session.capabilities.includes(capability);
}

async function currentAuthoringMemberCanPublishToStaging(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<boolean> {
  return currentAuthoringMemberHasReleaseCapability(repository, session, 'publish-staging');
}

async function currentAuthoringMemberHasReleaseCapability(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  capability: ReleaseCapability,
): Promise<boolean> {
  const [role, environment] = await Promise.all([
    resolveCurrentAuthoringMembershipRole(repository, session),
    findEnvironment(repository, session.workspaceId, session.environmentId),
  ]);
  if (!role) return false;
  if (
    !environment ||
    environment.enabled === false ||
    environment.authoringEnabled === false ||
    environment.kind === 'production'
  ) {
    return false;
  }
  const capabilities: readonly ReleaseCapability[] = RELEASE_CAPABILITIES_BY_ROLE[role];
  return capabilities.includes(capability);
}

async function requireHostedAuthoringOperation(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  sessionCapability: AuthoringSessionCapability,
  releaseCapability: ReleaseCapability,
  reply: FastifyReply,
): Promise<boolean> {
  if (!requireAuthoringSessionCapability(session, sessionCapability, reply)) return false;
  if (releaseCapability !== 'sample-product-style' && session.environment !== 'staging') {
    void reply.code(409).send({
      error: 'staging_authoring_session_required',
      message: 'Open Lodariq on the configured staging Origin for this release action',
    });
    return false;
  }
  if (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability)) {
    return true;
  }
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[releaseCapability],
  });
  return false;
}

async function requireDirectAuthoringOperation(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  sessionCapability: AuthoringSessionCapability,
  releaseCapability: ReleaseCapability,
  reply: FastifyReply,
): Promise<boolean> {
  if (!directSdkSessionHasCapability(session, sessionCapability)) {
    void reply.code(403).send({
      error: 'authoring_capability_forbidden',
      message: 'Authoring session does not grant this document operation',
    });
    return false;
  }
  if (releaseCapability !== 'sample-product-style' && session.environment !== 'staging') {
    void reply.code(409).send({
      error: 'staging_authoring_session_required',
      message: 'Open Lodariq on the configured staging Origin for this release action',
    });
    return false;
  }
  if (await currentAuthoringMemberHasReleaseCapability(repository, session, releaseCapability)) {
    return true;
  }
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[releaseCapability],
  });
  return false;
}

async function authenticateDirectAuthoringOperation(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  sessionCapability: AuthoringSessionCapability,
  releaseCapability: ReleaseCapability,
): Promise<{ token: ResolvedEnvironmentToken; session: AuthoringSessionRecord } | null> {
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return null;
  const session = await authenticateAuthoringSessionForToken(repository, token, request, reply);
  if (!session) return null;
  if (
    !(await requireDirectAuthoringOperation(
      repository,
      session,
      sessionCapability,
      releaseCapability,
      reply,
    ))
  ) {
    return null;
  }
  return { token, session };
}

async function requireAuthoringDocumentWrite(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    !requireAuthoringSessionCapability(
      session,
      AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
      reply,
    )
  ) {
    return false;
  }
  if ((await resolveCurrentAuthoringMembershipRole(repository, session)) !== null) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'An active workspace membership is required to acknowledge a Brand version',
  });
  return false;
}

async function authenticateDirectAuthoringDocumentWrite(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ token: ResolvedEnvironmentToken; session: AuthoringSessionRecord } | null> {
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return null;
  const session = await authenticateAuthoringSessionForToken(repository, token, request, reply);
  if (!session) return null;
  if (!(await requireAuthoringDocumentWrite(repository, session, reply))) return null;
  return { token, session };
}

async function resolveCurrentAuthoringMembershipRole(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<AuthRole | null> {
  const membership = await repository.resolveWorkspaceMembership(
    session.workspaceId,
    session.createdByUserId,
  );
  return membership ? authRoleFromMembership(membership.role) : null;
}

function authoringSessionCapabilitiesForRole(
  capabilities: readonly AuthoringSessionCapability[],
  role: AuthRole,
): AuthoringSessionCapability[] {
  const allowedReleaseCapabilities: readonly ReleaseCapability[] =
    RELEASE_CAPABILITIES_BY_ROLE[role];
  return capabilities.filter((capability) => {
    const releaseCapability = RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY[capability];
    return !releaseCapability || allowedReleaseCapabilities.includes(releaseCapability);
  });
}

function sendWorkspaceThemeMutationError(error: unknown, reply: FastifyReply) {
  if (error instanceof ProductStyleProposalConflictError) {
    return reply.code(409).send({
      error: error.code,
      message: error.message,
      proposalId: error.proposalId,
    });
  }
  if (error instanceof WorkspaceThemeApprovalRequiredError) {
    return reply.code(409).send({
      error: error.code,
      message: error.message,
      themeId: error.themeId,
    });
  }
  if (error instanceof WorkspaceThemeChangedError) {
    return reply.code(409).send({
      error: error.code,
      message: error.message,
      expectedRevision: error.expectedRevision,
      actualRevision: error.actualRevision,
      expectedUpdatedAt: error.expectedUpdatedAt,
      actualUpdatedAt: error.actualUpdatedAt,
    });
  }
  throw error;
}

function validateAuthoringDocumentPayload(value: unknown): AuthoringDocumentPayloadType {
  const result = validate(AuthoringDocumentPayload, value);
  if (!result.valid) {
    throw new Error(
      `Authoring document response failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

function validateAuthoringStagingReleaseState(value: unknown): AuthoringStagingReleaseStateType {
  const result = validate(AuthoringStagingReleaseState, value);
  if (!result.valid) {
    throw new Error(
      `Authoring staging release state failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

function validateAuthoringStagingPublicationResult(
  value: unknown,
): AuthoringStagingPublicationResultType {
  const result = validate(AuthoringStagingPublicationResult, value);
  if (!result.valid) {
    throw new Error(
      `Authoring staging publication result failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

function validateAuthoringStagingVerificationResult(
  value: unknown,
): AuthoringStagingVerificationResultType {
  const result = validate(AuthoringStagingVerificationResult, value);
  if (!result.valid) {
    throw new Error(
      `Authoring staging verification result failed schema validation: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.value;
}

async function createActivatedAuthoringDocumentSession(
  options: RegisterControlPlaneRoutesOptions,
  request: FastifyRequest,
  reply: FastifyReply,
  activationGrant: string,
) {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  if (!requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor)) return;

  const bodyValidation = validate(CreateAuthoringDocumentSessionRequest, request.body);
  if (!bodyValidation.valid) {
    return reply.code(400).send({
      error: 'invalid_authoring_session_request',
      message: 'Activation-grant sessions require one closed document intent',
    });
  }
  const body: CreateAuthoringDocumentSessionRequestType = bodyValidation.value;
  const exactCustomerOrigin = parseExactBrowserOrigin(body.customerOrigin);
  if (!exactCustomerOrigin || exactCustomerOrigin !== body.customerOrigin) {
    return reply.code(400).send({
      error: 'invalid_customer_origin',
      message: 'Customer origin must be one canonical HTTP(S) browser origin',
    });
  }
  if (!isExpectedEditorIframeSource(options.authoringIframeSrc, deploymentOrigins.editor)) {
    return reply.code(503).send({
      error: 'authoring_editor_unavailable',
      message: 'The hosted authoring editor is not configured',
    });
  }

  const authoringSessionToken = createAuthoringSessionToken();
  const correlationId = createCorrelationId('authoring');
  const activated = await options.repository.createAuthoringDocumentSessionFromActivation({
    installationId: body.installationId,
    exactOrigin: exactCustomerOrigin,
    activationGrantHash: hashAuthoringActivationGrant(activationGrant),
    pageContext: body.pageContext,
    selectionScope: body.selectionScope,
    documentIntent: body.documentIntent,
    correlationId,
    sessionTokenHash: hashAuthoringSessionToken(authoringSessionToken),
    iframeSrc: options.authoringIframeSrc,
    expiresAt: new Date(Date.now() + AUTHORING_SESSION_TTL_MS).toISOString(),
  });
  if (!activated) {
    return reply.code(403).send({
      error: 'authoring_session_rejected',
      message: 'Activation grant or requested document scope is invalid, expired, or already used',
    });
  }

  const session = activated.session;
  const membership = await options.repository.resolveWorkspaceMembership(
    session.workspaceId,
    session.creatorId,
  );
  const responseCapabilities = authoringSessionCapabilitiesForRole(
    session.capabilities,
    membership ? authRoleFromMembership(membership.role) : 'viewer',
  );
  emitObservability(
    options.observability,
    createObservabilityEvent({
      name: 'authoring.session.created',
      correlationId: session.correlationId,
      workspaceId: session.workspaceId,
      documentId: session.documentId,
      environmentId: session.environmentId,
      userId: session.creatorId,
      attributes: {
        source: 'activation-grant',
        documentCreated: activated.documentCreated,
      },
    }),
  );

  const result = validateAuthoringDocumentSessionResult({
    authoringSessionToken,
    context: {
      sessionId: session.sessionId,
      correlationId: session.correlationId,
      compilerVersion: session.compilerVersion,
      rendererContractVersion: session.rendererContractVersion,
      themeContractVersion: session.themeContractVersion,
      themeVersionId: session.themeVersionId,
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      environment: session.environment,
      documentId: session.documentId,
      customerOrigin: session.customerOrigin,
      editorOrigin: deploymentOrigins.editor,
      creatorId: session.creatorId,
      capabilities: responseCapabilities,
      expiresAt: session.expiresAt,
    },
  });
  setCredentialResponseHeaders(reply);
  return reply.code(201).send(result);
}

async function findEnvironment(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<WorkspaceEnvironment | null> {
  return (
    (await repository.listEnvironments(workspaceId)).find(
      (environment) => environment.id === environmentId,
    ) ?? null
  );
}

async function findEnvironmentPolicyRow(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<WorkspaceEnvironmentPolicyRow | null> {
  return (await findEnvironmentPolicyScope(repository, workspaceId, environmentId))?.policy ?? null;
}

async function findEnvironmentPolicyScope(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<{ environment: WorkspaceEnvironment; policy: WorkspaceEnvironmentPolicyRow } | null> {
  const environments = await repository.listEnvironments(workspaceId);
  const environment = environments.find((candidate) => candidate.id === environmentId);
  const policy = toWorkspaceEnvironmentPolicy(workspaceId, environments).environments.find(
    (candidate) => candidate.id === environmentId,
  );
  return environment && policy ? { environment, policy } : null;
}

function requireDirectPublishEnvironmentPolicy(
  environment: WorkspaceEnvironmentPolicyRow,
  actor: { role: AuthRole; userId: string },
  reply: FastifyReply,
): boolean {
  const decision = evaluateEnvironmentReleasePolicy({
    environment,
    action: 'direct-publish',
    actorRole: actor.role,
    actorUserId: actor.userId,
  });
  if (decision.allowed) return true;
  const statusCode = decision.code === 'role_forbidden' ? 403 : 409;
  void reply.code(statusCode).send({
    error: 'environment_policy_forbidden',
    code: decision.code,
    message: decision.message,
  });
  return false;
}

function sendEnvironmentPolicyDecision(
  decision: ReturnType<typeof evaluateEnvironmentReleasePolicy>,
  reply: FastifyReply,
) {
  const statusCode = decision.code === 'role_forbidden' ? 403 : 409;
  return reply.code(statusCode).send({
    error: 'environment_policy_forbidden',
    code: decision.code,
    message: decision.message,
  });
}

interface ReviewedReleaseArtifact {
  artifact: PersistedCompiledArtifact;
  document: PersistedDocument['document'];
}

async function loadReviewedReleaseArtifact(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  artifactId: string,
  contentHash: string,
): Promise<ReviewedReleaseArtifact | null> {
  const artifact = await repository.getCompiledArtifact(workspaceId, documentId, artifactId);
  if (!artifact || artifact.contentHash !== contentHash || !artifact.documentVersionId) {
    return null;
  }
  const version = await repository.getDocumentVersion(
    workspaceId,
    documentId,
    artifact.documentVersionId,
  );
  if (
    !version ||
    version.canonical.id !== documentId ||
    version.canonical.workspaceId !== workspaceId
  ) {
    return null;
  }
  return { artifact, document: version.canonical };
}

async function findVisualCheckForArtifact(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  environmentId: string,
  artifact: PersistedCompiledArtifact,
): Promise<VisualCheckRunRecord | null> {
  const runs = await repository.listVisualCheckRuns(workspaceId, documentId);
  return (
    runs.find(
      (run) =>
        run.environmentId === environmentId &&
        run.compiledArtifactId === artifact.id &&
        run.contentHash === artifact.contentHash,
    ) ?? null
  );
}

interface StagingPublicationHashInput {
  workspaceId: string;
  documentId: string;
  environmentId: string;
  artifactId: string;
  contentHash: string;
  expectedGeneration: number;
}

async function createStagingPublicationRequestHash(
  input: StagingPublicationHashInput,
): Promise<string> {
  const canonicalRequest = canonicalJson({
    action: 'publish',
    artifactId: input.artifactId,
    contentHash: input.contentHash,
    documentId: input.documentId,
    environmentId: input.environmentId,
    expectedGeneration: input.expectedGeneration,
    workspaceId: input.workspaceId,
  });
  return `sha256-${await sha256Hex(canonicalRequest)}`;
}

interface RunVisualPreflightInput {
  repository: ControlPlaneRepository;
  workspaceId: string;
  documentId: string;
  environmentId: string;
  artifact: PersistedCompiledArtifact;
  actorUserId: string;
}

async function runAndPersistVisualPreflight(input: RunVisualPreflightInput) {
  const existingRuns = await input.repository.listVisualCheckRuns(
    input.workspaceId,
    input.documentId,
  );
  const existing = existingRuns.find(
    (run) =>
      run.environmentId === input.environmentId &&
      run.compiledArtifactId === input.artifact.id &&
      run.contentHash === input.artifact.contentHash,
  );
  if (existing) return existing;

  const compiled = input.artifact.compiled;
  if (compiled.artifactSchemaVersion !== '2') {
    throw new Error('visual preflight requires a Phase 2 compiled artifact');
  }
  if (!input.artifact.documentVersionId) {
    throw new Error('visual preflight requires an immutable document version');
  }
  const report = await runBasicVisualPreflight(compiled, new Date().toISOString());
  return input.repository.createVisualCheckRun({
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    documentVersionId: input.artifact.documentVersionId,
    compiledArtifactId: input.artifact.id,
    themeVersionId: compiled.theme.themeVersionId,
    environmentId: input.environmentId,
    contentHash: input.artifact.contentHash,
    report,
    actorUserId: input.actorUserId,
  });
}

async function authenticateAuthoringSessionForToken(
  repository: ControlPlaneRepository,
  environmentToken: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthoringSessionRecord | null> {
  const sessionToken = readHeader(request, AUTHORING_SESSION_HEADER);
  if (!sessionToken) {
    await reply.code(401).send({
      error: 'authoring_session_required',
      message: 'A valid authoring session is required for SDK authoring',
    });
    return null;
  }

  const session = await repository.resolveAuthoringSession(
    environmentToken.workspaceId,
    hashAuthoringSessionToken(sessionToken),
  );
  if (!session) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Authoring session is invalid, expired, or revoked',
    });
    return null;
  }

  const matchesToken =
    session.workspaceId === environmentToken.workspaceId &&
    session.environmentId === environmentToken.environmentId &&
    session.environment === environmentToken.environment &&
    environmentToken.environment !== 'production';

  if (!matchesToken) {
    await reply.code(403).send({
      error: 'authoring_session_mismatch',
      message: 'Authoring session does not match the SDK environment',
    });
    return null;
  }

  return session;
}

async function authenticateEnvironmentToken(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ResolvedEnvironmentToken | null> {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Environment token bearer authorization is required',
    });
    return null;
  }

  const token = await repository.resolveEnvironmentToken(hashEnvironmentToken(bearerToken));
  if (!token) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Environment token is invalid or revoked',
    });
    return null;
  }

  return token;
}

function readBearerToken(request: FastifyRequest): string | null {
  const raw = request.headers.authorization;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  const token = match?.[1]?.trim();
  return token || null;
}

function readHeader(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

interface SdkDeliveryScope {
  workspaceId: string;
  environmentId: string;
}

interface SdkDocumentPathParams extends SdkDeliveryScope {
  documentId: string;
}

interface SdkDocumentArtifactPathParams extends SdkDocumentPathParams {
  contentHash: string;
}

function requireSdkDeliveryPathScope(
  scope: SdkDeliveryScope,
  params: SdkDocumentPathParams,
  reply: FastifyReply,
): boolean {
  if (scope.workspaceId === params.workspaceId && scope.environmentId === params.environmentId) {
    return true;
  }
  reply.code(403).send({
    error: 'delivery_scope_mismatch',
    message: 'The requested delivery path does not match the resolved SDK scope',
  });
  return false;
}

async function resolveSdkDeliveryScope(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SdkDeliveryScope | null> {
  if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
    const resolved = await resolvePublicSdkRequest(repository, request, reply);
    return resolved
      ? {
          workspaceId: resolved.installation.workspaceId,
          environmentId: resolved.environment.id,
        }
      : null;
  }

  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token || !requireSdkOrigin(token, request, reply)) return null;
  return { workspaceId: token.workspaceId, environmentId: token.environmentId };
}

async function resolvePublicSdkRequest(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ResolvedPublicSdkInstallation | null> {
  const installationId = readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER);
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (!installationId || !exactOrigin) {
    await reply.code(400).send({
      error: 'public_sdk_scope_required',
      message: 'Public SDK requests require an installation ID and canonical browser Origin',
    });
    return null;
  }

  const resolved = await repository.resolvePublicSdkInstallation(installationId, exactOrigin);
  if (!resolved) {
    await reply.code(403).send({
      error: 'installation_origin_forbidden',
      message: 'Installation is not configured for this Origin',
    });
    return null;
  }
  setAllowedSdkCorsHeaders(exactOrigin, reply);
  return resolved;
}

async function requirePublicAuthoringScope(
  repository: ControlPlaneRepository,
  installationId: string,
  exactOrigin: string,
  reply: FastifyReply,
): Promise<ResolvedPublicSdkInstallation | null> {
  const resolved = await repository.resolvePublicSdkInstallation(installationId, exactOrigin);
  const canAuthor =
    resolved?.authoringEnabled === true && resolved.environment.kind !== 'production';
  if (!resolved || !canAuthor) {
    await reply.code(403).send({
      error: 'authoring_origin_forbidden',
      message: 'Authoring is not enabled for this installation and Origin',
    });
    return null;
  }
  return resolved;
}

function requireSdkOrigin(
  token: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  if (token.originAllowlist.includes(origin)) {
    setAllowedSdkCorsHeaders(origin, reply);
    return true;
  }

  void reply.code(403).send({
    error: 'origin_forbidden',
    message: 'Origin is not allowed for this Lodariq environment token',
  });
  return false;
}

function requireDirectSdkAuthoringOrigin(
  token: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (exactOrigin && token.originAllowlist.includes(exactOrigin)) {
    setAllowedSdkCorsHeaders(exactOrigin, reply);
    return true;
  }

  void reply.code(403).send({
    error: 'authoring_origin_forbidden',
    message: 'SDK authoring requires an exact allowlisted browser Origin',
  });
  return false;
}

function requireExpectedFirstPartyAppOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedOrigin: string,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  const exactOrigin = parseExactBrowserOrigin(origin);
  if (exactOrigin === expectedOrigin) {
    reply.header('access-control-allow-origin', exactOrigin);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
    reply.header('access-control-allow-headers', 'authorization,content-type');
    reply.header('access-control-max-age', '600');
    return true;
  }

  void reply.code(403).send({
    error: 'origin_forbidden',
    message: 'Authoring approval is available only from the Lodariq app origin',
  });
  return false;
}

function requireExpectedEditorOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedOrigin: string,
): boolean {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (exactOrigin === expectedOrigin) {
    setExpectedEditorCorsHeaders(reply, expectedOrigin);
    return true;
  }

  void reply.code(403).send({
    error: 'editor_origin_forbidden',
    message: 'Activation-grant sessions are available only to the hosted Lodariq editor',
  });
  return false;
}

function setExpectedEditorCorsHeaders(reply: FastifyReply, expectedOrigin: string): void {
  reply.header('access-control-allow-origin', expectedOrigin);
  reply.header('vary', 'Origin');
  reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
  reply.header(
    'access-control-allow-headers',
    `content-type,${AUTHORING_ACTIVATION_GRANT_HEADER},${AUTHORING_SESSION_HEADER},${IDEMPOTENCY_KEY_HEADER},${RELEASE_CORRELATION_ID_HEADER}`,
  );
  reply.header('access-control-max-age', '600');
}

function setCredentialResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

function isExactEditorIframeSource(value: string): boolean {
  return (
    isExpectedEditorIframeSource(value, LODARIQ_EDITOR_ORIGIN) ||
    isExpectedEditorIframeSource(value, LODARIQ_STAGING_EDITOR_ORIGIN)
  );
}

function isExpectedEditorIframeSource(value: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === expectedOrigin &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function deploymentOriginsForApiBaseUrl(publicApiBaseUrl: string): {
  activation: typeof LODARIQ_AUTHORING_ACTIVATION_URL | typeof LODARIQ_STAGING_AUTHORING_ACTIVATION_URL;
  app: typeof LODARIQ_APP_ORIGIN | typeof LODARIQ_STAGING_APP_ORIGIN;
  editor: typeof LODARIQ_EDITOR_ORIGIN | typeof LODARIQ_STAGING_EDITOR_ORIGIN;
} {
  const apiOrigin = new URL(publicApiBaseUrl).origin;
  if (apiOrigin === 'https://staging-api.lodariq.io') {
    return {
      activation: LODARIQ_STAGING_AUTHORING_ACTIVATION_URL,
      app: LODARIQ_STAGING_APP_ORIGIN,
      editor: LODARIQ_STAGING_EDITOR_ORIGIN,
    };
  }
  return {
    activation: LODARIQ_AUTHORING_ACTIVATION_URL,
    app: LODARIQ_APP_ORIGIN,
    editor: LODARIQ_EDITOR_ORIGIN,
  };
}

async function bootstrapPublicSdkInstallation(
  options: RegisterControlPlaneRoutesOptions,
  body: PublicSdkBootstrapRequestType,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<PublicSdkBootstrapContextType | FastifyReply> {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (!exactOrigin) {
    return reply.code(400).send({
      error: 'origin_required',
      message: 'Public SDK bootstrap requires one canonical browser Origin',
    });
  }
  if (!bootstrapClaimsMatchOrigin(exactOrigin, body)) {
    return reply.code(403).send({
      error: 'origin_claim_mismatch',
      message: 'Bootstrap page intent does not match the request Origin',
    });
  }

  const resolved = await options.repository.resolvePublicSdkInstallation(
    body.installationId,
    exactOrigin,
  );
  if (!resolved) {
    return reply.code(403).send({
      error: 'installation_origin_forbidden',
      message: 'Installation is not configured for this Origin',
    });
  }
  setAllowedSdkCorsHeaders(exactOrigin, reply);

  const deployments = await options.repository.listDocumentDeployments(
    resolved.installation.workspaceId,
    resolved.environment.id,
  );
  let publication: PersistedPublication | null = null;
  let delivery: PublicSdkBootstrapContextType['delivery'];
  if (deployments.length > 0) {
    const activeDeployments = deployments
      .filter((deployment) => deployment.state === 'active')
      .sort((left, right) => left.documentId.localeCompare(right.documentId));
    if (activeDeployments.length > MAX_ACTIVE_DOCUMENT_MANIFESTS) {
      return reply.code(409).send({
        error: 'active_document_limit_exceeded',
        message: `This SDK installation has more than ${MAX_ACTIVE_DOCUMENT_MANIFESTS} active documents; deactivate documents before bootstrapping`,
        maximum: MAX_ACTIVE_DOCUMENT_MANIFESTS,
      });
    }
    const manifests = await Promise.all(
      activeDeployments.map((deployment) =>
        createActiveManifestPointer(options.repository, options.publicApiBaseUrl, deployment),
      ),
    );
    if (manifests.some((manifest) => manifest === null)) {
      return reply.code(409).send({
        error: 'deployment_publication_missing',
        message: 'An active document deployment does not resolve to an immutable publication',
      });
    }
    const activeManifests = manifests.filter(
      (manifest): manifest is ActiveManifestPointerV2 => manifest !== null,
    );
    delivery =
      activeManifests.length > 0
        ? {
            state: 'available',
            mode: 'document-scoped-v2',
            manifests: activeManifests,
            defaultDocumentId: activeManifests[0]!.documentId,
            ingestUrl: new URL('/v1/sdk/events', options.publicApiBaseUrl).toString(),
          }
        : { state: 'unavailable' };
  } else {
    publication = await getLegacyCurrentPublication(
      options.repository,
      resolved.installation.workspaceId,
      resolved.environment.id,
      reply,
    );
    if (reply.sent) return reply;
    delivery = publication
      ? {
          state: 'available',
          manifest: createManifestPointer(publication),
          currentDocumentUrl: new URL(
            '/v1/sdk/current-document',
            options.publicApiBaseUrl,
          ).toString(),
          ingestUrl: new URL('/v1/sdk/events', options.publicApiBaseUrl).toString(),
        }
      : { state: 'unavailable' };
  }

  let authoring: PublicSdkBootstrapContextType['authoring'] = { state: 'disabled' };
  const canAuthor =
    resolved.environment.kind !== 'production' && resolved.authoringEnabled === true;
  if (canAuthor) {
    const bootstrapGrant = createPublicSdkBootstrapGrant();
    const bootstrapGrantExpiresAt = new Date(
      Date.now() + PUBLIC_SDK_BOOTSTRAP_GRANT_TTL_MS,
    ).toISOString();
    await options.repository.createPublicSdkBootstrapGrant({
      workspaceId: resolved.installation.workspaceId,
      installationId: resolved.installation.installationId,
      environmentId: resolved.environment.id,
      exactOrigin,
      grantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
      expiresAt: bootstrapGrantExpiresAt,
    });
    authoring = {
      state: 'available',
      appOrigin: deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl).app,
      activationUrl: deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl).activation,
      authorizationRequestUrl: new URL(
        '/v1/sdk/authoring/authorization-requests',
        options.publicApiBaseUrl,
      ).toString(),
      exchangeUrl: new URL('/v1/sdk/authoring/exchange', options.publicApiBaseUrl).toString(),
      bootstrapGrant,
      bootstrapGrantExpiresAt,
    };
    setCredentialResponseHeaders(reply);
  }

  return validatePublicSdkBootstrapContext({
    installationId: resolved.installation.installationId,
    environmentId: resolved.environment.id,
    environment: resolved.environment.kind,
    customerOrigin: exactOrigin,
    correlationId: publication?.correlationId ?? createCorrelationId('bootstrap'),
    delivery,
    authoring,
  });
}

function setSdkPreflightCorsHeaders(request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  if (origin) {
    setAllowedSdkCorsHeaders(origin, reply);
  } else {
    setSdkCorsPolicyHeaders(reply);
  }
}

function setAllowedSdkCorsHeaders(origin: string, reply: FastifyReply): void {
  reply.header('access-control-allow-origin', origin);
  reply.header('vary', 'Origin');
  setSdkCorsPolicyHeaders(reply);
}

function setSdkCorsPolicyHeaders(reply: FastifyReply): void {
  reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
  reply.header(
    'access-control-allow-headers',
    `authorization,content-type,${AUTHORING_SESSION_HEADER},${PUBLIC_SDK_INSTALLATION_HEADER},${AUTHORING_BOOTSTRAP_GRANT_HEADER},${IDEMPOTENCY_KEY_HEADER},${RELEASE_CORRELATION_ID_HEADER},${SDK_DELIVERY_RETRY_ATTEMPT_HEADER}`,
  );
  reply.header('access-control-max-age', '600');
}

function resolveCreatorModule(
  configured: CreatorModuleDescriptorType | undefined,
): CreatorModuleDescriptorType | null {
  const validation = validate(CreatorModuleDescriptor, configured);
  if (!validation.valid) return null;

  try {
    const url = new URL(validation.value.url);
    if (!CREATOR_MODULE_CONTENT_ADDRESS_PATTERN.test(url.pathname)) return null;
  } catch {
    return null;
  }
  return validation.value;
}

function validateAuthoringAuthorizationContext(context: unknown) {
  const validation = validate(AuthoringAuthorizationContext, context);
  if (!validation.valid) {
    throw new Error(
      `Authoring authorization context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function validateAuthoringAuthorizationResult(result: unknown) {
  const validation = validate(AuthoringAuthorizationResult, result);
  if (!validation.valid) {
    throw new Error(
      `Authoring authorization result failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function validateAuthoringCodeExchangeResult(result: unknown) {
  const validation = validate(AuthoringCodeExchangeResult, result);
  if (!validation.valid) {
    throw new Error(
      `Authoring code exchange result failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function validateAuthoringDocumentSessionResult(result: unknown) {
  const validation = validate(AuthoringDocumentSessionResult, result);
  if (!validation.valid) {
    throw new Error(
      `Authoring document session result failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function createViewerSdkInstallContext(
  publicApiBaseUrl: string,
  token: ResolvedEnvironmentToken,
  publication: PersistedPublication,
  deployment: PersistedDocumentDeployment | null,
): SdkInstallContextType {
  const analyticsPointers =
    deployment?.state === 'active' && deployment.activePublicationId === publication.id
      ? [
          {
            documentId: publication.documentId,
            generation: deployment.generation,
            publicationId: publication.id,
            contentHash: publication.contentHash,
          },
        ]
      : [];
  const context = {
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    correlationId: publication.correlationId,
    manifest: createManifestPointer(publication),
    currentDocumentUrl: new URL('/v1/sdk/current-document', publicApiBaseUrl).toString(),
    ingestUrl:
      analyticsPointers.length > 0 ? new URL('/v1/sdk/events', publicApiBaseUrl).toString() : '',
    ...(analyticsPointers.length > 0 ? { analyticsPointers } : {}),
    authoring: { enabled: false },
  };
  return validateSdkInstallContext(context);
}

function createManifestPointer(
  publication: PersistedPublication,
): SdkInstallContextType['manifest'] {
  return {
    documentId: publication.documentId,
    currentVersion: publication.contentHash,
    artifact: {
      contentHash: publication.artifact.contentHash,
      compilerVersion: publication.artifact.compilerVersion,
      createdAt: publication.artifact.createdAt,
      ...(publication.artifact.documentVersionId
        ? { documentVersionId: publication.artifact.documentVersionId }
        : {}),
    },
  };
}

async function createActiveManifestPointer(
  repository: ControlPlaneRepository,
  publicApiBaseUrl: string,
  deployment: PersistedDocumentDeployment,
): Promise<ActiveManifestPointerV2 | null> {
  if (deployment.state !== 'active') return null;
  const publication = await repository.getCurrentPublicationForDocument(
    deployment.workspaceId,
    deployment.environmentId,
    deployment.documentId,
  );
  return publication
    ? createActiveManifestPointerFromPublication(publicApiBaseUrl, deployment, publication)
    : null;
}

function createActiveManifestPointerFromPublication(
  publicApiBaseUrl: string,
  deployment: PersistedDocumentDeployment,
  publication: PersistedPublication,
): ActiveManifestPointerV2 | null {
  const compiled = publication.artifact.compiled;
  if (
    deployment.state !== 'active' ||
    compiled.artifactSchemaVersion !== COMPILED_ARTIFACT_SCHEMA_VERSION ||
    compiled.compilerVersion !== COMPILER_VERSION ||
    compiled.rendererContractVersion !== RENDERER_CONTRACT_VERSION ||
    compiled.theme.contractVersion !== BRAND_THEME_CONTRACT_VERSION ||
    publication.documentId !== deployment.documentId ||
    publication.id !== deployment.activePublicationId ||
    publication.contentHash !== compiled.contentHash
  ) {
    return null;
  }

  const encodedWorkspaceId = encodeURIComponent(deployment.workspaceId);
  const encodedEnvironmentId = encodeURIComponent(deployment.environmentId);
  const encodedDocumentId = encodeURIComponent(deployment.documentId);
  const encodedContentHash = encodeURIComponent(compiled.contentHash);
  const artifactUrl = new URL(
    `/v1/sdk/workspaces/${encodedWorkspaceId}/environments/${encodedEnvironmentId}/documents/${encodedDocumentId}/artifacts/${encodedContentHash}`,
    publicApiBaseUrl,
  ).toString();
  const canonicalArtifact = canonicalJson(compiled);
  return {
    schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
    workspaceId: deployment.workspaceId,
    environmentId: deployment.environmentId,
    documentId: deployment.documentId,
    state: 'active',
    generation: deployment.generation,
    publicationId: publication.id,
    activatedAt: publication.publishedAt,
    artifact: {
      artifactSchemaVersion: compiled.artifactSchemaVersion,
      contentHash: compiled.contentHash,
      compilerVersion: compiled.compilerVersion,
      rendererContractVersion: compiled.rendererContractVersion,
      themeContractVersion: compiled.theme.contractVersion,
      themeVersionId: compiled.theme.themeVersionId,
      themeContentHash: compiled.theme.contentHash,
      url: artifactUrl,
      integrity: `sha256-${createHash('sha256').update(canonicalArtifact).digest('base64')}`,
    },
  };
}

function createJsonEtag(body: string): string {
  return `"sha256-${createHash('sha256').update(body).digest('hex')}"`;
}

function requestMatchesEtag(request: FastifyRequest, etag: string): boolean {
  const header = readHeader(request, 'if-none-match');
  if (!header) return false;
  const normalized = etag.replace(/^W\//u, '');
  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//u, ''))
    .some((value) => value === '*' || value === normalized);
}

function setManifestResponseHeaders(reply: FastifyReply, etag: string): void {
  setPrivateDocumentResponseHeaders(reply);
  reply.header('etag', etag);
}

function setPrivateDocumentResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'private, no-store');
  reply.header('x-content-type-options', 'nosniff');
}

function setImmutableArtifactResponseHeaders(reply: FastifyReply, etag: string): void {
  reply.header('cache-control', 'public, max-age=31536000, immutable');
  reply.header('etag', etag);
  reply.header('x-content-type-options', 'nosniff');
}

async function createAuthoringSdkInstallContext(
  repository: ControlPlaneRepository,
  publicApiBaseUrl: string,
  token: ResolvedEnvironmentToken,
  record: PersistedDocument,
  authoringSession: AuthoringSessionRecord,
  reply: FastifyReply,
): Promise<SdkInstallContextType | FastifyReply> {
  if (
    record.latestArtifact &&
    !authoringSessionArtifactMatches(authoringSession, record.latestArtifact.compiled)
  ) {
    return sendAuthoringSessionCompatibilityChanged(reply);
  }
  const compiled =
    record.latestArtifact?.compiled ?? (await compileAndValidate(repository, record.document));
  if (!authoringSessionArtifactMatches(authoringSession, compiled)) {
    return sendAuthoringSessionCompatibilityChanged(reply);
  }
  const artifact = record.latestArtifact;
  const canReadReleaseState = await directSdkSessionCanReadReleaseState(
    repository,
    authoringSession,
  );
  const canPublishToStaging =
    canReadReleaseState &&
    (await directSdkSessionCanPublishToStaging(repository, authoringSession));
  const canVerifyStaging =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'verify-staging',
    ));
  const canPromoteProduction =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'promote-production',
    ));
  const canApproveProduction =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'approve-production',
    ));
  const canRollbackRelease =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasExplicitCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'rollback-release',
    ));
  const canUnpublishRelease =
    canReadReleaseState &&
    authoringSession.environment === 'staging' &&
    directSdkSessionHasExplicitCapability(
      authoringSession,
      AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
    ) &&
    (await currentAuthoringMemberHasReleaseCapability(
      repository,
      authoringSession,
      'unpublish-release',
    ));
  const recoveryUrl = new URL(
    '/v1/sdk/authoring/environments/:environmentId/release-recovery',
    publicApiBaseUrl,
  ).toString();
  const release = canReadReleaseState
    ? {
        releaseState: {
          capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          url: new URL('/v1/sdk/authoring/release-state', publicApiBaseUrl).toString(),
        },
        recoveryState: {
          capability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
          url: recoveryUrl,
        },
        ...(canRollbackRelease
          ? {
              rollback: {
                capability: AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
                url: recoveryUrl,
              },
            }
          : {}),
        ...(canUnpublishRelease
          ? {
              unpublish: {
                capability: AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
                url: recoveryUrl,
              },
            }
          : {}),
        ...(canPublishToStaging
          ? {
              stagingPublication: {
                capability: AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
                url: new URL('/v1/sdk/authoring/publications', publicApiBaseUrl).toString(),
              },
            }
          : {}),
        ...(canVerifyStaging
          ? {
              stagingVerification: {
                capability: AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
                url: new URL('/v1/sdk/authoring/verifications', publicApiBaseUrl).toString(),
              },
            }
          : {}),
        ...(canPromoteProduction
          ? {
              productionPromotion: {
                capability: AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
                url: new URL('/v1/sdk/authoring/promotions', publicApiBaseUrl).toString(),
              },
            }
          : {}),
        ...(canApproveProduction
          ? {
              productionApproval: {
                capability: AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
                url: new URL(
                  '/v1/sdk/authoring/release-operations/:operationId/approvals',
                  publicApiBaseUrl,
                ).toString(),
              },
            }
          : {}),
      }
    : null;
  const context = {
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    correlationId: authoringSession.correlationId,
    manifest: {
      documentId: authoringSession.documentId,
      currentVersion: compiled.contentHash,
      artifact: {
        contentHash: compiled.contentHash,
        compilerVersion: compiled.compilerVersion,
        createdAt: artifact?.createdAt ?? record.updatedAt,
        ...(artifact?.documentVersionId ? { documentVersionId: artifact.documentVersionId } : {}),
      },
    },
    currentDocumentUrl: '',
    ingestUrl: '',
    authoring: {
      enabled: true,
      iframeSrc: authoringSession.iframeSrc,
      sessionId: authoringSession.id,
      correlationId: authoringSession.correlationId,
      expiresAt: authoringSession.expiresAt,
      documentUrl: new URL('/v1/sdk/authoring/document', publicApiBaseUrl).toString(),
      saveDocumentUrl: new URL('/v1/sdk/authoring/document', publicApiBaseUrl).toString(),
      ...(release ? { release } : {}),
    },
  };
  return validateSdkInstallContext(context);
}

function validateSdkInstallContext(context: unknown): SdkInstallContextType {
  const validation = validate(SdkInstallContext, context);
  if (!validation.valid) {
    throw new Error(
      `SDK install context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

function validatePublicSdkBootstrapContext(context: unknown): PublicSdkBootstrapContextType {
  const validation = validate(PublicSdkBootstrapContext, context);
  if (!validation.valid) {
    throw new Error(
      `Public SDK bootstrap context failed schema validation: ${JSON.stringify(validation.errors)}`,
    );
  }
  return validation.value;
}

async function getLegacyCurrentPublication(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
  reply: FastifyReply,
): Promise<PersistedPublication | null> {
  try {
    return await repository.getCurrentPublication(workspaceId, environmentId);
  } catch (error) {
    if (!(error instanceof AmbiguousCurrentPublicationError)) throw error;
    await reply.code(409).send({
      error: DOCUMENT_SPECIFIC_DELIVERY_REQUIRED_ERROR,
      code: AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE,
      message:
        'Multiple documents are active in this environment; use document-specific SDK delivery',
      documentIds: error.documentIds,
    });
    return null;
  }
}

function createCorrelationId(scope: 'authoring' | 'bootstrap' | 'compile'): string {
  return `corr_${scope}_${randomUUID()}`;
}

type SdkDeliveryResource = 'artifact' | 'manifest';
type SdkDeliveryOutcome = 'active' | 'error' | 'found' | 'inactive' | 'inconsistent' | 'not_found';
type SdkDeliveryCacheOutcome = 'not_applicable' | 'not_modified' | 'served';
type SdkDeliveryRetryBucket = 'first_retry' | 'initial' | 'multiple_retries' | 'unknown';

interface SdkDeliveryObservation {
  startedAt: number;
  retryBucket: SdkDeliveryRetryBucket;
}

interface SdkDeliveryResolution {
  resource: SdkDeliveryResource;
  outcome: SdkDeliveryOutcome;
  statusCode: 200 | 304 | 404 | 409 | 500;
  cacheOutcome: SdkDeliveryCacheOutcome;
}

const SDK_DELIVERY_EVENT_NAMES = {
  artifact: 'sdk.delivery.artifact.resolved',
  manifest: 'sdk.delivery.manifest.resolved',
} as const satisfies Record<SdkDeliveryResource, string>;

function beginSdkDeliveryObservation(request: FastifyRequest): SdkDeliveryObservation {
  return {
    startedAt: performance.now(),
    retryBucket: sdkDeliveryRetryBucket(readHeader(request, SDK_DELIVERY_RETRY_ATTEMPT_HEADER)),
  };
}

function sdkDeliveryRetryBucket(rawAttempt: string | null): SdkDeliveryRetryBucket {
  if (rawAttempt === null || rawAttempt === '0') return 'initial';
  if (rawAttempt === '1') return 'first_retry';
  if (/^[2-9]$|^10$/u.test(rawAttempt)) return 'multiple_retries';
  return 'unknown';
}

function emitSdkDeliveryResolution(
  sink: ObservabilitySink,
  observation: SdkDeliveryObservation,
  scope: SdkDeliveryScope,
  resolution: SdkDeliveryResolution,
): void {
  emitObservability(
    sink,
    createObservabilityEvent({
      name: SDK_DELIVERY_EVENT_NAMES[resolution.resource],
      workspaceId: scope.workspaceId,
      environmentId: scope.environmentId,
      attributes: {
        outcome: resolution.outcome,
        statusCode: resolution.statusCode,
        durationMs: boundedSdkDeliveryDuration(performance.now() - observation.startedAt),
        cacheOutcome: resolution.cacheOutcome,
        retryBucket: observation.retryBucket,
      },
    }),
  );
}

function boundedSdkDeliveryDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return SDK_DELIVERY_MAX_OBSERVED_DURATION_MS;
  return Math.min(SDK_DELIVERY_MAX_OBSERVED_DURATION_MS, Math.max(0, Math.ceil(durationMs)));
}

function emitObservability(sink: ObservabilitySink, event: ObservabilityEvent): void {
  try {
    sink.emit(event);
  } catch {
    // Telemetry is deliberately non-blocking. A sink failure must never turn a
    // committed document/session/release operation into a misleading 500.
  }
}

function requireRole(auth: AuthContext, minimumRole: AuthRole, reply: FastifyReply): boolean {
  if (roleRank(auth.role) >= roleRank(minimumRole)) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: `Workspace role ${minimumRole} or higher is required`,
  });
  return false;
}

type ReleaseCapability =
  | 'approve-production'
  | 'manage-release-policy'
  | 'promote-production'
  | 'publish-staging'
  | 'rollback-release'
  | 'sample-product-style'
  | 'unpublish-release'
  | 'verify-staging';

const RELEASE_CAPABILITIES_BY_ROLE = {
  viewer: [],
  member: ['publish-staging', 'sample-product-style', 'verify-staging'],
  admin: [
    'approve-production',
    'manage-release-policy',
    'promote-production',
    'publish-staging',
    'rollback-release',
    'sample-product-style',
    'unpublish-release',
    'verify-staging',
  ],
  owner: [
    'approve-production',
    'manage-release-policy',
    'promote-production',
    'publish-staging',
    'rollback-release',
    'sample-product-style',
    'unpublish-release',
    'verify-staging',
  ],
} as const satisfies Readonly<Record<AuthRole, readonly ReleaseCapability[]>>;

const RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY: Partial<
  Readonly<Record<AuthoringSessionCapability, ReleaseCapability>>
> = {
  [AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION]: 'approve-production',
  [AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION]: 'promote-production',
  [AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING]: 'publish-staging',
  [AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE]: 'rollback-release',
  [AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE]: 'sample-product-style',
  [AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE]: 'unpublish-release',
  [AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING]: 'verify-staging',
};

const RELEASE_CAPABILITY_FORBIDDEN_MESSAGES = {
  'approve-production': 'This workspace membership cannot approve production releases',
  'manage-release-policy': 'This workspace membership cannot manage release policy',
  'promote-production': 'This workspace membership cannot promote to production',
  'publish-staging': 'This workspace membership cannot publish to staging',
  'rollback-release': 'This workspace membership cannot roll back releases',
  'sample-product-style': 'This workspace membership cannot save product style sources',
  'unpublish-release': 'This workspace membership cannot unpublish releases',
  'verify-staging': 'This workspace membership cannot verify staging releases',
} as const satisfies Record<ReleaseCapability, string>;

function requireReleaseCapability(
  auth: AuthContext,
  capability: ReleaseCapability,
  reply: FastifyReply,
): boolean {
  const capabilities: readonly ReleaseCapability[] = RELEASE_CAPABILITIES_BY_ROLE[auth.role];
  if (capabilities.includes(capability)) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[capability],
  });
  return false;
}

function releaseRoleHasCapability(role: AuthRole, capability: ReleaseCapability): boolean {
  const capabilities: readonly ReleaseCapability[] = RELEASE_CAPABILITIES_BY_ROLE[role];
  return capabilities.includes(capability);
}

const AUTH_ROLE_RANK = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} as const satisfies Record<AuthRole, number>;

function roleRank(role: AuthRole): number {
  return AUTH_ROLE_RANK[role];
}

async function requireAnalyticsEnvironment(
  repository: ControlPlaneRepository,
  workspaceId: string,
  query: AnalyticsEnvironmentQueryType,
  reply: FastifyReply,
): Promise<boolean> {
  const environments = await repository.listEnvironments(workspaceId);
  if (environments.some((environment) => environment.id === query.environmentId)) return true;
  await reply.code(404).send({
    error: 'not_found',
    message: 'Analytics environment not found',
  });
  return false;
}

async function ingestAuthoritativeSdkEvents(
  repository: ControlPlaneRepository,
  scope: { workspaceId: string; environmentId: string },
  candidates: readonly unknown[],
  reply: FastifyReply,
) {
  const pointerRequests = new Map<string, Promise<ResolvedAnalyticsPointer | null>>();
  const resolved = await resolveAuthoritativeAnalyticsBatch(scope, candidates, (documentId) => {
    let pending = pointerRequests.get(documentId);
    if (!pending) {
      pending = resolveAnalyticsPointer(repository, scope, documentId);
      pointerRequests.set(documentId, pending);
    }
    return pending;
  });

  const accepted = resolved.events.length
    ? await repository.ingestAuthoritativeEvents({
        workspaceId: scope.workspaceId,
        environmentId: scope.environmentId,
        events: resolved.events,
      })
    : 0;
  if (accepted !== resolved.events.length) {
    throw new Error('authoritative analytics persistence count mismatch');
  }
  return reply.code(202).send({ ...resolved.result, accepted });
}

async function resolveAnalyticsPointer(
  repository: ControlPlaneRepository,
  scope: { workspaceId: string; environmentId: string },
  documentId: string,
): Promise<ResolvedAnalyticsPointer | null> {
  const deployment = await repository.getDocumentDeployment(
    scope.workspaceId,
    scope.environmentId,
    documentId,
  );
  if (!deployment) return null;
  if (deployment.state === 'inactive') {
    return {
      state: 'inactive',
      workspaceId: deployment.workspaceId,
      environmentId: deployment.environmentId,
      documentId: deployment.documentId,
      generation: deployment.generation,
    };
  }

  const publication = await repository.getPublicationById(
    scope.workspaceId,
    deployment.activePublicationId,
  );
  if (!publication) return null;
  return {
    state: 'active',
    workspaceId: publication.workspaceId,
    environmentId: publication.environmentId,
    documentId: publication.documentId,
    generation: deployment.generation,
    publicationId: publication.id,
    contentHash: publication.contentHash,
  };
}

function sanitizeAnalyticsEvents(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.map((event) => ({
    ...event,
    name: sanitizeEventString(event.name),
    ...(event.documentId ? { documentId: sanitizeEventString(event.documentId) } : {}),
    ...(event.stepId ? { stepId: sanitizeEventString(event.stepId) } : {}),
    ...(event.correlationId ? { correlationId: sanitizeEventString(event.correlationId) } : {}),
    ...(event.props ? { props: sanitizeEventValue(event.props) as Record<string, unknown> } : {}),
  }));
}

function sanitizeEventValue(value: unknown, key = ''): unknown {
  if (isSensitiveEventKey(key)) return '<redacted>';
  if (typeof value === 'string') return sanitizeEventString(value);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeEventValue(item));

  const next: Record<string, unknown> = {};
  for (const [itemKey, itemValue] of Object.entries(value)) {
    next[itemKey] = sanitizeEventValue(itemValue, itemKey);
  }
  return next;
}

function sanitizeEventString(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/g, sanitizeEventUrl)
    .replace(/\bBearer\s+[\w.-]+/gi, 'Bearer <redacted>')
    .replace(
      /lod_(?:development|staging|production|authoring|activation|authorization|bootstrap)_[a-zA-Z0-9_-]+/g,
      'lod_<redacted>',
    )
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '<email>')
    .slice(0, 500);
}

function sanitizeEventUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.length > 120 ? `${url.pathname.slice(0, 120)}...` : url.pathname;
    return `${url.origin}${path}`;
  } catch {
    return '<url>';
  }
}

function isSensitiveEventKey(key: string): boolean {
  return /(authorization|bearer|bootstrap|cookie|grant|jwt|password|secret|session|token|api[-_]?key)/i.test(
    key,
  );
}

async function authenticate(
  repository: ControlPlaneRepository,
  authProvider: AuthProvider,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  try {
    const auth = await authProvider.authenticate(request);
    const membership = await repository.resolveWorkspaceMembership(auth.workspaceId, auth.userId);
    if (membership) {
      return {
        ...auth,
        userId: membership.userId,
        role: authRoleFromMembership(membership.role),
      };
    }
    if (canUseAuthProviderRoleFallback(auth)) return auth;
    await reply.code(403).send({
      error: 'forbidden',
      message: 'Workspace membership is required',
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      await reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
      return null;
    }
    throw error;
  }
}

async function authenticateAuthoringAuthorizationRequest(
  repository: ControlPlaneRepository,
  authProvider: AuthProvider,
  request: FastifyRequest,
  reply: FastifyReply,
  requestId: string,
): Promise<{ auth: AuthContext; request: AuthoringAuthorizationRequestRecord } | null> {
  setCredentialResponseHeaders(reply);
  try {
    const identity = await authProvider.authenticateIdentity(request);
    const resolved = await repository.getAuthoringAuthorizationRequestForUser(
      identity.userId,
      requestId,
    );
    if (!resolved) {
      await reply.code(404).send({
        error: 'not_found',
        message: 'Pending authoring authorization request not found',
      });
      return null;
    }
    return {
      auth: {
        userId: resolved.membership.userId,
        workspaceId: resolved.request.workspaceId,
        role: authRoleFromMembership(resolved.membership.role),
        provider: identity.provider,
      },
      request: resolved.request,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      await reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
      return null;
    }
    throw error;
  }
}

function authRoleFromMembership(role: string): AuthRole {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role;
  return 'viewer';
}

function canUseAuthProviderRoleFallback(auth: AuthContext): boolean {
  return auth.provider === 'headers' && process.env.NODE_ENV !== 'production';
}

class DocumentThemeResolutionError extends Error {
  readonly statusCode = 409;

  constructor(
    readonly code: 'theme_binding_unavailable' | 'theme_migration_required',
    message: string,
  ) {
    super(message);
    this.name = 'DocumentThemeResolutionError';
  }
}

function hasLegacyThemeReference(document: PersistedDocument['document']): boolean {
  return !document.themeBinding && Boolean(document.themeRef?.trim());
}

async function compileAndValidate(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<CompiledDocumentType> {
  const theme = await resolveDocumentTheme(repository, document);
  const compiled = await compileDocument({
    document,
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const result = validate(CompiledDocument, compiled);
  if (!result.valid) {
    throw new Error(`Compiled artifact failed schema validation: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

async function resolveDocumentTheme(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<BrandThemeSnapshotType> {
  const binding = document.themeBinding;
  if (!binding) {
    if (hasLegacyThemeReference(document)) {
      throw new DocumentThemeResolutionError(
        'theme_migration_required',
        'Choose an approved Brand theme before compiling this legacy draft',
      );
    }
    return LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1;
  }

  const theme = await repository.getWorkspaceTheme(document.workspaceId, binding.themeId);
  if (!theme) {
    throw new DocumentThemeResolutionError(
      'theme_binding_unavailable',
      'The document Brand theme no longer exists',
    );
  }
  const expectedVersionId =
    binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId;
  const versions = await repository.listWorkspaceThemeVersions(document.workspaceId, theme.id);
  const version = versions.find((candidate) => candidate.id === expectedVersionId);
  if (!version) {
    throw new DocumentThemeResolutionError(
      'theme_binding_unavailable',
      'The document Brand theme version is unavailable or has not been approved',
    );
  }
  return version.snapshot;
}

async function bindNewDocumentToDefaultTheme(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<LodariqDocument> {
  const next = structuredClone(document);
  next.appearance ??= structuredClone(DEFAULT_EXPERIENCE_APPEARANCE);
  const theme = await repository.getDefaultWorkspaceTheme(document.workspaceId);
  if (!theme?.activeVersionId) return next;
  next.themeBinding = {
    policy: 'workspace-current',
    themeId: theme.id,
    acknowledgedThemeVersionId: theme.activeVersionId,
  };
  return next;
}

async function getThemeReleaseReview(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<{
  themeId: string;
  acknowledgedThemeVersionId: string;
  activeThemeVersionId: string;
} | null> {
  const binding = document.themeBinding;
  if (!binding || binding.policy !== 'workspace-current') return null;
  const theme = await repository.getWorkspaceTheme(document.workspaceId, binding.themeId);
  const activeThemeVersionId = theme?.activeVersionId;
  if (!activeThemeVersionId || activeThemeVersionId === binding.acknowledgedThemeVersionId) {
    return null;
  }
  return {
    themeId: binding.themeId,
    acknowledgedThemeVersionId: binding.acknowledgedThemeVersionId,
    activeThemeVersionId,
  };
}

async function listDocumentSummariesWithReadiness(
  repository: ControlPlaneRepository,
  workspaceId: string,
): Promise<DocumentSummaryWithReleaseEvidence[]> {
  const [summaries, workspaceDeployments] = await Promise.all([
    repository.listDocuments(workspaceId),
    repository.listDocumentDeployments(workspaceId),
  ]);
  return Promise.all(
    summaries.map(async (summary) => {
      const [record, publicationRecords] = await Promise.all([
        repository.getDocument(workspaceId, summary.id),
        repository.listDocumentPublications(workspaceId, summary.id),
      ]);
      const issues = record ? validateTourPublishReadiness(record.document) : [];
      const deployments = workspaceDeployments.filter(
        (deployment) => deployment.documentId === summary.id,
      );
      const publications = await latestDocumentPublicationEvidence(
        repository,
        publicationRecords,
        deployments,
      );
      return {
        ...summary,
        publications,
        deployments,
        ...(record?.latestArtifact ? { latestCompiledArtifactId: record.latestArtifact.id } : {}),
        publishReadinessIssues: issues.map(toPublishReadinessIssueResponse),
      };
    }),
  );
}

interface DocumentSummaryWithReleaseEvidence extends Omit<DocumentSummary, 'publications'> {
  publications: DocumentPublicationEvidence[];
  deployments: PersistedDocumentDeployment[];
  latestCompiledArtifactId?: string;
  publishReadinessIssues: PublishReadinessIssueResponse[];
}

interface DocumentPublicationEvidence {
  id: string;
  publicationId: string;
  environmentId: string;
  environment: PersistedPublication['environment'];
  contentHash: string;
  publishedAt: string;
  compiledArtifactId: string;
  action: PersistedPublication['action'];
  sourcePublicationId: string | null;
  previousPublicationId: string | null;
  releaseOperationId: string | null;
  active: boolean;
  generation: number;
  rendererContractVersion?: string;
  themeVersionId?: string;
  themeContentHash?: string;
  verification:
    | { status: 'not-run' }
    | {
        status: PublicationVerificationRecord['result'];
        result: PublicationVerificationRecord['result'];
        verificationId: string;
        verifiedAt: string;
        createdAt: string;
      };
}

async function latestDocumentPublicationEvidence(
  repository: ControlPlaneRepository,
  publications: PersistedPublication[],
  deployments: PersistedDocumentDeployment[],
): Promise<DocumentPublicationEvidence[]> {
  const latestByEnvironment = new Map<string, PersistedPublication>();
  for (const publication of publications) {
    if (!latestByEnvironment.has(publication.environmentId)) {
      latestByEnvironment.set(publication.environmentId, publication);
    }
  }
  return Promise.all(
    [...latestByEnvironment.values()]
      .sort((left, right) => left.environment.localeCompare(right.environment))
      .map(async (publication) => {
        const deployment = deployments.find(
          (candidate) => candidate.environmentId === publication.environmentId,
        );
        const verifications =
          publication.environment === 'staging'
            ? await repository.listPublicationVerifications(publication.workspaceId, publication.id)
            : [];
        const verification = verifications[0];
        const compiled = publication.artifact.compiled;
        const exactThemeEvidence =
          compiled.artifactSchemaVersion === COMPILED_ARTIFACT_SCHEMA_VERSION
            ? {
                rendererContractVersion: compiled.rendererContractVersion,
                themeVersionId: compiled.theme.themeVersionId,
                themeContentHash: compiled.theme.contentHash,
              }
            : {};
        const isActive =
          deployment?.state === 'active' && deployment.activePublicationId === publication.id;
        return {
          id: publication.id,
          publicationId: publication.id,
          environmentId: publication.environmentId,
          environment: publication.environment,
          contentHash: publication.contentHash,
          publishedAt: publication.publishedAt,
          compiledArtifactId: publication.compiledArtifactId,
          action: publication.action,
          sourcePublicationId: publication.sourcePublicationId,
          previousPublicationId: publication.previousPublicationId,
          releaseOperationId: publication.releaseOperationId,
          active: isActive,
          generation: deployment?.generation ?? 0,
          ...exactThemeEvidence,
          verification: verification
            ? {
                status: verification.result,
                result: verification.result,
                verificationId: verification.id,
                verifiedAt: verification.createdAt,
                createdAt: verification.createdAt,
              }
            : { status: 'not-run' as const },
        };
      }),
  );
}

interface PublishReadinessIssueResponse extends PublishReadinessIssue {
  label: string;
}

function toPublishReadinessIssueResponse(
  issue: PublishReadinessIssue,
): PublishReadinessIssueResponse {
  return {
    ...issue,
    label: publishReadinessIssueLabel(issue.code),
  };
}

function toTokenResponse(token: EnvironmentTokenRecord): EnvironmentTokenResponse {
  const response: EnvironmentTokenResponse = {
    id: token.id,
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    createdAt: token.createdAt,
  };
  if (token.revokedAt !== undefined) response.revokedAt = token.revokedAt;
  return response;
}

function toPublicationResponse(publication: PersistedPublication): PublicationResponse {
  const artifact: CompiledArtifactResponse = {
    id: publication.artifact.id,
    workspaceId: publication.artifact.workspaceId,
    documentId: publication.artifact.documentId,
    contentHash: publication.artifact.contentHash,
    compilerVersion: publication.artifact.compilerVersion,
    createdAt: publication.artifact.createdAt,
  };
  if (publication.artifact.documentVersionId !== undefined) {
    artifact.documentVersionId = publication.artifact.documentVersionId;
  }
  if (publication.artifact.themeVersionId !== undefined) {
    artifact.themeVersionId = publication.artifact.themeVersionId;
  }
  if (publication.artifact.themeContentHash !== undefined) {
    artifact.themeContentHash = publication.artifact.themeContentHash;
  }
  if (publication.artifact.rendererContractVersion !== undefined) {
    artifact.rendererContractVersion = publication.artifact.rendererContractVersion;
  }

  const response: PublicationResponse = {
    id: publication.id,
    workspaceId: publication.workspaceId,
    correlationId: publication.correlationId,
    environmentId: publication.environmentId,
    environment: publication.environment,
    documentId: publication.documentId,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    action: publication.action,
    sourcePublicationId: publication.sourcePublicationId,
    previousPublicationId: publication.previousPublicationId,
    releaseOperationId: publication.releaseOperationId,
    publishedByUserId: publication.publishedByUserId,
    publishedAt: publication.publishedAt,
    artifact,
  };
  if (publication.documentVersionId !== undefined) {
    response.documentVersionId = publication.documentVersionId;
  }
  return response;
}

function toAuthoringSessionResponse(session: AuthoringSessionRecord): AuthoringSessionResponse {
  const response: AuthoringSessionResponse = {
    id: session.id,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment: session.environment,
    documentId: session.documentId,
    correlationId: session.correlationId,
    iframeSrc: session.iframeSrc,
    createdByUserId: session.createdByUserId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
  if (session.revokedAt !== undefined) response.revokedAt = session.revokedAt;
  if (session.compilerVersion !== undefined) response.compilerVersion = session.compilerVersion;
  if (session.rendererContractVersion !== undefined) {
    response.rendererContractVersion = session.rendererContractVersion;
  }
  if (session.themeContractVersion !== undefined) {
    response.themeContractVersion = session.themeContractVersion;
  }
  if (session.themeVersionId !== undefined) response.themeVersionId = session.themeVersionId;
  return response;
}
