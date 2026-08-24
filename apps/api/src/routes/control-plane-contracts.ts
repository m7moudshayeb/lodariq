import { Type } from '@sinclair/typebox';
import {
  ANALYTICS_EVENT_LIMITS,
  AnalyticsEvent,
  AuthoringStagingVerificationResult,
  BrandThemeDefinition,
  BrowserVerificationReport,
  EnvironmentReleasePolicy,
  EnvironmentGovernanceCapabilitySet,
  ProductStyleProposal,
  ReleaseRecoveryResult,
  ThemeBinding,
  ExperimentAssignmentKey,
} from '@lodariq/schema';

export const DocumentParams = Type.Object(
  { documentId: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export const SdkDocumentParams = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    documentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const SdkDocumentArtifactParams = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    documentId: Type.String({ minLength: 1 }),
    contentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

export const SDK_DOCUMENT_PATH =
  '/v1/sdk/workspaces/:workspaceId/environments/:environmentId/documents/:documentId';
export const SDK_DOCUMENT_MANIFEST_PATH = `${SDK_DOCUMENT_PATH}/manifest`;
export const SDK_DOCUMENT_ARTIFACT_PATH = `${SDK_DOCUMENT_PATH}/artifacts/:contentHash`;

export const ThemeParams = Type.Object(
  { themeId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const EnvironmentParams = Type.Object(
  { environmentId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const DocumentEnvironmentParams = Type.Object(
  {
    documentId: Type.String({ minLength: 1, maxLength: 256 }),
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);

export const DIRECT_RELEASE_RECOVERY_PATH =
  '/v1/sdk/authoring/environments/:environmentId/release-recovery';
export const HOSTED_RELEASE_RECOVERY_PATH =
  '/v1/authoring/environments/:environmentId/release-recovery';
export const DASHBOARD_RELEASE_RECOVERY_PATH =
  '/v1/documents/:documentId/environments/:environmentId/release-recovery';
export const HOSTED_AUTHORING_TRANSLATION_PATH = '/v1/authoring/document/translation';

export const UpdateWorkspaceEnvironmentPolicyBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120, pattern: '^\\S(?:[\\s\\S]*\\S)?$' }),
    originAllowlist: Type.Array(Type.String({ minLength: 1, maxLength: 2048 }), {
      maxItems: 100,
      uniqueItems: true,
    }),
    enabled: Type.Boolean(),
    pipelinePosition: Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)]),
    authoringEnabled: Type.Boolean(),
    governanceCapabilities: Type.Optional(EnvironmentGovernanceCapabilitySet),
    promotionSourceEnvironmentId: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
    releasePolicy: EnvironmentReleasePolicy,
    expectedUpdatedAt: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

export const PublicationParams = Type.Object(
  { publicationId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const ReleaseOperationParams = Type.Object(
  { operationId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const EnvironmentTokenParams = Type.Object(
  { tokenId: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export const CreateEnvironmentTokenBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
);

export const CreatePublicSdkInstallationBody = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  { additionalProperties: false },
);

export const PublicSdkInstallationParams = Type.Object(
  { installationId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const AuthoringAuthorizationRequestParams = Type.Object(
  { requestId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const AuthoringSessionParams = Type.Object(
  { sessionId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export const ApproveAuthoringAuthorizationRequestBody = Type.Object(
  { state: Type.String({ minLength: 32, maxLength: 2048 }) },
  { additionalProperties: false },
);

export const ConfigurePublicSdkInstallationOriginBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    origin: Type.String({ minLength: 1, maxLength: 2048 }),
    authoringEnabled: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const SyncPublicSdkInstallationOriginsBody = Type.Object(
  { origins: Type.Array(ConfigurePublicSdkInstallationOriginBody, { maxItems: 100 }) },
  { additionalProperties: false },
);

export const PublicSdkInstallationOriginResponse = Type.Object(
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

export const PublicSdkInstallationResponse = Type.Object(
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

export const ListPublicSdkInstallationsResponse = Type.Object(
  { installations: Type.Array(PublicSdkInstallationResponse) },
  { additionalProperties: false },
);

export const ApiErrorResponse = Type.Object(
  {
    error: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const ReleaseRecoveryForbiddenResponse = Type.Union([
  ReleaseRecoveryResult,
  ApiErrorResponse,
]);

export const CreateAuthoringSessionBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    environmentClientToken: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const CreateStagingPublicationBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    expectedGeneration: Type.Integer({ minimum: 0 }),
    expectedArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    expectedContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

export const CreateAuthoringStagingPublicationBody = Type.Object(
  {
    expectedGeneration: Type.Integer({ minimum: 0 }),
    expectedArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    expectedContentHash: Type.String({ pattern: '^sha256-[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

export const CreateDashboardStyleSourceBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    proposal: ProductStyleProposal,
  },
  { additionalProperties: false },
);

export const CreateAuthoringStyleSourceBody = Type.Object(
  { proposal: ProductStyleProposal },
  { additionalProperties: false },
);

export const AuthoringStagingVerificationHttpSuccess = Type.Object(
  { ok: Type.Literal(true), verification: Type.Unknown() },
  { additionalProperties: false },
);

export const AuthoringStagingVerificationHttpError = Type.Union([
  ApiErrorResponse,
  Type.Extract(AuthoringStagingVerificationResult, Type.Object({ ok: Type.Literal(false) })),
]);

export const CreateDashboardPublicationVerificationBody = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    report: BrowserVerificationReport,
  },
  { additionalProperties: false },
);

export const CreateReleaseApprovalBody = Type.Object(
  {
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  },
  { additionalProperties: false },
);

export const UpdateEnvironmentReleasePolicyBody = Type.Object(
  {
    requiredApprovalCount: Type.Union([Type.Literal(0), Type.Literal(1)]),
    expectedUpdatedAt: Type.String({ minLength: 20, maxLength: 64 }),
  },
  { additionalProperties: false },
);

export const WorkspaceThemeMutationGuardBody = Type.Object(
  {
    expectedRevision: Type.Integer({ minimum: 1 }),
    expectedUpdatedAt: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

export const CreateWorkspaceThemeBody = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    draft: BrandThemeDefinition,
  },
  { additionalProperties: false },
);

export const UpdateWorkspaceThemeBody = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    draft: BrandThemeDefinition,
    expectedRevision: Type.Integer({ minimum: 1 }),
    expectedUpdatedAt: Type.String({ minLength: 1, maxLength: 64 }),
  },
  { additionalProperties: false },
);

export const SetDocumentThemeBindingBody = Type.Object(
  { binding: ThemeBinding },
  { additionalProperties: false },
);

export const IngestEventsBody = Type.Object(
  { events: Type.Array(AnalyticsEvent, { minItems: 1, maxItems: 100 }) },
  { additionalProperties: false },
);

export const SdkIngestEventsBody = Type.Object(
  {
    assignmentKey: Type.Optional(Type.Ref(ExperimentAssignmentKey)),
    events: Type.Array(Type.Unknown(), {
      minItems: 1,
      maxItems: ANALYTICS_EVENT_LIMITS.batchSize,
    }),
  },
  { additionalProperties: false },
);

export const SdkAuthoringDocumentBody = Type.Object(
  {
    document: Type.Unknown(),
    // Optional in the schema so authentication still answers first; the handler
    // requires it. An omitted precondition is a silent last-writer-wins save.
    expectedDocumentUpdatedAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { additionalProperties: false },
);
