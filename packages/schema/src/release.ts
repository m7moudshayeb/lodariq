import { Type, type Static, type TSchema } from '@sinclair/typebox';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
} from './version';

const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';
const INTEGRITY_PATTERN = '^sha256-[A-Za-z0-9+/]+={0,2}$';
const ARTIFACT_URL_PATTERN = '^(?:https://|/)\\S+$';
const IDEMPOTENCY_KEY_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$';
const CORRELATION_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$';
const EXACT_ORIGIN_PATTERN = '^https?://[^\\s/?#@]+$';
const ISO_TIMESTAMP_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$';

export const BROWSER_VERIFICATION_CHECK_CODES = [
  'artifact_integrity',
  'renderer_ready',
  'targets_resolved',
  'overflow',
  'primary_action_clipping',
  'target_collision',
  'font_fallback',
  'stacking_context',
  'responsive_widths',
  'dark_mode',
  'rtl',
  'reduced_motion',
  'zoom_200',
] as const;

export const BROWSER_VERIFICATION_STATUSES = ['passed', 'warning', 'failed'] as const;

export const PRODUCTION_PROMOTION_FAILURE_CODES = [
  'source_not_active',
  'source_not_verified',
  'artifact_changed',
  'approval_required',
  'approval_rejected',
  'capability_denied',
  'deployment_changed',
  'idempotency_conflict',
  'release_operation_in_progress',
  'environment_not_configured',
  'internal_error',
] as const;

/** Renderer recipe contract pinned into a compiled artifact and manifest. */
export const RendererContractVersion = Type.String({
  $id: 'RendererContractVersion',
  pattern: '^[1-9][0-9]*$',
});
export type RendererContractVersion = Static<typeof RendererContractVersion>;

/** Required guard carried by every document-scoped release mutation. */
export const ReleaseMutationGuard = Type.Object(
  {
    idempotencyKey: Type.String({
      minLength: 8,
      maxLength: 200,
      pattern: IDEMPOTENCY_KEY_PATTERN,
    }),
    requestHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    expectedGeneration: Type.Integer({ minimum: 0 }),
  },
  { $id: 'ReleaseMutationGuard', additionalProperties: false },
);
export type ReleaseMutationGuard = Static<typeof ReleaseMutationGuard>;

export const DeploymentState = Type.Union([Type.Literal('active'), Type.Literal('inactive')], {
  $id: 'DeploymentState',
});
export type DeploymentState = Static<typeof DeploymentState>;

export const ActiveDocumentDeployment = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1 }),
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    state: Type.Literal('active'),
    generation: Type.Integer({ minimum: 1 }),
    activePublicationId: Type.String({ minLength: 1 }),
    pendingReleaseOperationId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    updatedAt: Type.String({ minLength: 1 }),
  },
  { $id: 'ActiveDocumentDeployment', additionalProperties: false },
);
export type ActiveDocumentDeployment = Static<typeof ActiveDocumentDeployment>;

export const InactiveDocumentDeployment = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1 }),
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    state: Type.Literal('inactive'),
    generation: Type.Integer({ minimum: 0 }),
    activePublicationId: Type.Null(),
    pendingReleaseOperationId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    updatedAt: Type.String({ minLength: 1 }),
  },
  { $id: 'InactiveDocumentDeployment', additionalProperties: false },
);
export type InactiveDocumentDeployment = Static<typeof InactiveDocumentDeployment>;

export const DocumentDeployment = Type.Union(
  [ActiveDocumentDeployment, InactiveDocumentDeployment],
  { $id: 'DocumentDeployment' },
);
export type DocumentDeployment = Static<typeof DocumentDeployment>;

/** Existing Phase 1 artifact metadata retained for installed SDK compatibility. */
export const ManifestArtifactPointerV1 = Type.Object(
  {
    contentHash: Type.String(),
    compilerVersion: Type.String(),
    createdAt: Type.String(),
    documentVersionId: Type.Optional(Type.String()),
    storageKey: Type.Optional(Type.String()),
    storageUrl: Type.Optional(Type.String()),
  },
  { $id: 'ManifestArtifactPointerV1', additionalProperties: false },
);
export type ManifestArtifactPointerV1 = Static<typeof ManifestArtifactPointerV1>;

/** Existing environment-global manifest retained during the document-pointer migration. */
export const ManifestPointerV1 = Type.Object(
  {
    /** Prevent unsupported versioned pointers from falling through this legacy branch. */
    schemaVersion: Type.Optional(Type.Never()),
    documentId: Type.String(),
    currentVersion: Type.String(),
    artifact: Type.Optional(ManifestArtifactPointerV1),
  },
  { $id: 'ManifestPointerV1' },
);
export type ManifestPointerV1 = Static<typeof ManifestPointerV1>;

// Preserve the existing public names until the SDK loader migrates to V2.
export const ManifestArtifactPointer = ManifestArtifactPointerV1;
export type ManifestArtifactPointer = ManifestArtifactPointerV1;
export const ManifestPointer = ManifestPointerV1;
export type ManifestPointer = ManifestPointerV1;

export const ManifestArtifactPointerV2 = Type.Object(
  {
    artifactSchemaVersion: Type.Literal(COMPILED_ARTIFACT_SCHEMA_VERSION),
    contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    compilerVersion: Type.Literal(COMPILER_VERSION),
    rendererContractVersion: Type.Literal(RENDERER_CONTRACT_VERSION),
    themeContractVersion: Type.Literal(BRAND_THEME_CONTRACT_VERSION),
    themeVersionId: Type.String({ minLength: 1 }),
    themeContentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    url: Type.String({ pattern: ARTIFACT_URL_PATTERN }),
    integrity: Type.String({ pattern: INTEGRITY_PATTERN }),
  },
  { $id: 'ManifestArtifactPointerV2', additionalProperties: false },
);
export type ManifestArtifactPointerV2 = Static<typeof ManifestArtifactPointerV2>;

export const ActiveManifestPointerV2 = Type.Object(
  {
    schemaVersion: Type.Literal(COMPILED_ARTIFACT_SCHEMA_VERSION),
    workspaceId: Type.String({ minLength: 1 }),
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    state: Type.Literal('active'),
    generation: Type.Integer({ minimum: 1 }),
    publicationId: Type.String({ minLength: 1 }),
    activatedAt: Type.String({ minLength: 1 }),
    artifact: ManifestArtifactPointerV2,
  },
  { $id: 'ActiveManifestPointerV2', additionalProperties: false },
);
export type ActiveManifestPointerV2 = Static<typeof ActiveManifestPointerV2>;

export const InactiveManifestPointerV2 = Type.Object(
  {
    schemaVersion: Type.Literal(COMPILED_ARTIFACT_SCHEMA_VERSION),
    workspaceId: Type.String({ minLength: 1 }),
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    state: Type.Literal('inactive'),
    generation: Type.Integer({ minimum: 0 }),
    deactivatedAt: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: 'InactiveManifestPointerV2', additionalProperties: false },
);
export type InactiveManifestPointerV2 = Static<typeof InactiveManifestPointerV2>;

export const ManifestPointerV2 = Type.Union([ActiveManifestPointerV2, InactiveManifestPointerV2], {
  $id: 'ManifestPointerV2',
});
export type ManifestPointerV2 = Static<typeof ManifestPointerV2>;

/** Read contract while Phase 1 manifests and Phase 2 pointers coexist. */
export const VersionedManifestPointer = Type.Union([ManifestPointerV1, ManifestPointerV2], {
  $id: 'VersionedManifestPointer',
});
export type VersionedManifestPointer = Static<typeof VersionedManifestPointer>;

export const BrowserVerificationCheckCode = Type.Union(
  BROWSER_VERIFICATION_CHECK_CODES.map((value) => Type.Literal(value)),
  { $id: 'BrowserVerificationCheckCode' },
);
export type BrowserVerificationCheckCode = Static<typeof BrowserVerificationCheckCode>;

export const BrowserVerificationStatus = Type.Union(
  BROWSER_VERIFICATION_STATUSES.map((value) => Type.Literal(value)),
  { $id: 'BrowserVerificationStatus' },
);
export type BrowserVerificationStatus = Static<typeof BrowserVerificationStatus>;

/**
 * One privacy-safe browser assertion. A check intentionally carries no URL,
 * selector, DOM snapshot, screenshot, coordinates, or arbitrary message.
 */
export const BrowserVerificationCheck = Type.Object(
  {
    code: Type.Ref(BrowserVerificationCheckCode),
    status: Type.Ref(BrowserVerificationStatus),
  },
  { $id: 'BrowserVerificationCheck', additionalProperties: false },
);
export type BrowserVerificationCheck = Static<typeof BrowserVerificationCheck>;

const BrowserVerificationReportIdentity = {
  schemaVersion: Type.Literal('1'),
  checkedAt: Type.String({
    minLength: 20,
    maxLength: 64,
    pattern: ISO_TIMESTAMP_PATTERN,
  }),
  sdkVersion: Type.String({
    minLength: 1,
    maxLength: 120,
    pattern: '^[A-Za-z0-9][A-Za-z0-9.+_-]{0,119}$',
  }),
  rendererContractVersion: Type.Literal(RENDERER_CONTRACT_VERSION),
} as const;

function completeBrowserVerificationChecks(
  allowedStatus: TSchema,
  requiredStatus?: BrowserVerificationStatus,
) {
  const check = Type.Object(
    {
      code: Type.Ref(BrowserVerificationCheckCode),
      status: allowedStatus,
    },
    { additionalProperties: false },
  );
  const coverage = BROWSER_VERIFICATION_CHECK_CODES.map((code) =>
    Type.Array(check, {
      contains: Type.Object({ code: Type.Literal(code) }, { additionalProperties: true }),
    }),
  );
  const required = requiredStatus
    ? [
        Type.Array(check, {
          contains: Type.Object(
            { status: Type.Literal(requiredStatus) },
            { additionalProperties: true },
          ),
        }),
      ]
    : [];
  return Type.Intersect([
    Type.Array(check, {
      minItems: BROWSER_VERIFICATION_CHECK_CODES.length,
      maxItems: BROWSER_VERIFICATION_CHECK_CODES.length,
    }),
    ...coverage,
    ...required,
  ]);
}

const PassedBrowserVerificationReport = Type.Object(
  {
    ...BrowserVerificationReportIdentity,
    status: Type.Literal('passed'),
    checks: completeBrowserVerificationChecks(Type.Literal('passed')),
  },
  { additionalProperties: false },
);

const WarningBrowserVerificationReport = Type.Object(
  {
    ...BrowserVerificationReportIdentity,
    status: Type.Literal('warning'),
    checks: completeBrowserVerificationChecks(
      Type.Union([Type.Literal('passed'), Type.Literal('warning')]),
      'warning',
    ),
  },
  { additionalProperties: false },
);

const FailedBrowserVerificationReport = Type.Object(
  {
    ...BrowserVerificationReportIdentity,
    status: Type.Literal('failed'),
    checks: completeBrowserVerificationChecks(Type.Ref(BrowserVerificationStatus), 'failed'),
  },
  { additionalProperties: false },
);

/**
 * Client-produced browser report. Publication, artifact, origin, workspace,
 * and actor identity are deliberately absent; the authenticated server stamps
 * those values from the active pointer and request context. Every closed check
 * code is required exactly once, and the aggregate status must agree with its
 * checks, so a partial or self-contradictory client report fails validation.
 */
export const BrowserVerificationReport = Type.Union(
  [
    PassedBrowserVerificationReport,
    WarningBrowserVerificationReport,
    FailedBrowserVerificationReport,
  ],
  { $id: 'BrowserVerificationReport' },
);
export type BrowserVerificationReport = Static<typeof BrowserVerificationReport>;

const PublicationVerificationIdentity = {
  id: Type.String({ minLength: 1, maxLength: 256 }),
  workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
  environmentId: Type.String({ minLength: 1, maxLength: 256 }),
  documentId: Type.String({ minLength: 1, maxLength: 256 }),
  publicationId: Type.String({ minLength: 1, maxLength: 256 }),
  compiledArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
  artifactSchemaVersion: Type.Literal(COMPILED_ARTIFACT_SCHEMA_VERSION),
  contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
  themeVersionId: Type.String({ minLength: 1, maxLength: 256 }),
  themeContentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
  verifiedOrigin: Type.String({ pattern: EXACT_ORIGIN_PATTERN }),
  verifiedByUserId: Type.String({ minLength: 1, maxLength: 256 }),
  createdAt: Type.String({
    minLength: 20,
    maxLength: 64,
    pattern: ISO_TIMESTAMP_PATTERN,
  }),
} as const;

const PassingBrowserVerificationReport = Type.Union([
  PassedBrowserVerificationReport,
  WarningBrowserVerificationReport,
]);

/** Server-bound verification evidence for one exact immutable publication. */
export const PublicationVerification = Type.Union(
  [
    Type.Object(
      {
        ...PublicationVerificationIdentity,
        result: Type.Literal('passed'),
        report: PassingBrowserVerificationReport,
      },
      { additionalProperties: false },
    ),
    Type.Object(
      {
        ...PublicationVerificationIdentity,
        result: Type.Literal('failed'),
        report: FailedBrowserVerificationReport,
      },
      { additionalProperties: false },
    ),
  ],
  { $id: 'PublicationVerification' },
);
export type PublicationVerification = Static<typeof PublicationVerification>;

/** Immutable one-person decision attached to one release operation. */
export const ReleaseApproval = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 256 }),
    workspaceId: Type.String({ minLength: 1, maxLength: 256 }),
    releaseOperationId: Type.String({ minLength: 1, maxLength: 256 }),
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
    decidedByUserId: Type.String({ minLength: 1, maxLength: 256 }),
    createdAt: Type.String({
      minLength: 20,
      maxLength: 64,
      pattern: ISO_TIMESTAMP_PATTERN,
    }),
  },
  { $id: 'ReleaseApproval', additionalProperties: false },
);
export type ReleaseApproval = Static<typeof ReleaseApproval>;

/**
 * The caller selects a verified staging publication, never artifact bytes.
 * The server derives and preserves its exact artifact/hash/theme pins.
 */
export const ProductionPromotionRequest = Type.Object(
  {
    sourcePublicationId: Type.String({ minLength: 1, maxLength: 256 }),
    productionEnvironmentId: Type.String({ minLength: 1, maxLength: 256 }),
    expectedGeneration: Type.Integer({ minimum: 0 }),
    idempotencyKey: Type.String({
      minLength: 8,
      maxLength: 200,
      pattern: IDEMPOTENCY_KEY_PATTERN,
    }),
    correlationId: Type.String({
      minLength: 8,
      maxLength: 256,
      pattern: CORRELATION_ID_PATTERN,
    }),
  },
  { $id: 'ProductionPromotionRequest', additionalProperties: false },
);
export type ProductionPromotionRequest = Static<typeof ProductionPromotionRequest>;

const ProductionPromotionAwaitingApproval = Type.Object(
  {
    ok: Type.Literal(true),
    state: Type.Literal('awaiting_approval'),
    replayed: Type.Boolean(),
    releaseOperationId: Type.String({ minLength: 1, maxLength: 256 }),
    requiredApprovalCount: Type.Integer({ minimum: 1, maximum: 1 }),
    approvalCount: Type.Integer({ minimum: 0, maximum: 1 }),
  },
  { additionalProperties: false },
);

const ProductionPromotionCompleted = Type.Object(
  {
    ok: Type.Literal(true),
    state: Type.Literal('completed'),
    replayed: Type.Boolean(),
    releaseOperationId: Type.String({ minLength: 1, maxLength: 256 }),
    publicationId: Type.String({ minLength: 1, maxLength: 256 }),
    generation: Type.Integer({ minimum: 1 }),
    compiledArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    themeVersionId: Type.String({ minLength: 1, maxLength: 256 }),
    themeContentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    rendererContractVersion: Type.Literal(RENDERER_CONTRACT_VERSION),
  },
  { additionalProperties: false },
);

const ProductionPromotionFailed = Type.Object(
  {
    ok: Type.Literal(false),
    state: Type.Literal('failed'),
    code: Type.Union(PRODUCTION_PROMOTION_FAILURE_CODES.map((value) => Type.Literal(value))),
    message: Type.String({ minLength: 1, maxLength: 512 }),
    expectedGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
    actualGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const ProductionPromotionResult = Type.Union(
  [ProductionPromotionAwaitingApproval, ProductionPromotionCompleted, ProductionPromotionFailed],
  { $id: 'ProductionPromotionResult' },
);
export type ProductionPromotionResult = Static<typeof ProductionPromotionResult>;
