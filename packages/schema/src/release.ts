import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { PUBLIC_MANIFEST_SCHEMA_VERSION, SUPPORTED_DELIVERY_CONTRACTS } from './version';
import { AudienceDefinition, TriggerDefinition } from './document';
import { AdaptiveDecisionContext, EXPERIMENT_ARM_IDS } from './measurement';
import {
  RELEASE_RECOVERY_ACTIONS,
  RELEASE_RECOVERY_FAILURE_CODES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
} from './release-recovery-constants';

export {
  RELEASE_RECOVERY_ACTIONS,
  RELEASE_RECOVERY_FAILURE_CODES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
} from './release-recovery-constants';

const CONTENT_HASH_PATTERN = '^sha256-[0-9a-f]{64}$';
const INTEGRITY_PATTERN = '^sha256-[A-Za-z0-9+/]+={0,2}$';
const ARTIFACT_URL_PATTERN = '^(?:https://|/)\\S+$';
const IDEMPOTENCY_KEY_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$';
const CORRELATION_ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$';
const RELEASE_IDENTIFIER_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$';
const EXACT_ORIGIN_PATTERN = '^https?://[^\\s/?#@]+$';
const ISO_TIMESTAMP_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$';
const TRIMMED_RELEASE_REASON_PATTERN = '^\\S(?:[\\s\\S]{0,498}\\S)?$';

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
  'keyboard_navigation',
  'focus_restoration',
] as const;

export const BROWSER_VERIFICATION_STATUSES = ['passed', 'warning', 'failed'] as const;

export const PRODUCTION_PROMOTION_FAILURE_CODES = [
  'source_not_active',
  'source_not_verified',
  'accessibility_sweep_blocked',
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

export const RELEASE_HISTORY_ACTIONS = ['publish', 'promote', 'rollback', 'unpublish'] as const;

/** Phase 2 serves one complete, non-paginated recovery history read. */
export const RELEASE_RECOVERY_HISTORY_MAX_ITEMS = 500;
export const RELEASE_RECOVERY_ROLLBACK_TARGET_MAX_ITEMS = RELEASE_RECOVERY_HISTORY_MAX_ITEMS;

/** Renderer recipe contract pinned into a compiled artifact and manifest. */
export const RendererContractVersion = Type.String({
  $id: 'RendererContractVersion',
  minLength: 1,
  maxLength: 32,
  pattern: '^[1-9][0-9]*$',
});
export type RendererContractVersion = Static<typeof RendererContractVersion>;

const PersistedArtifactSchemaVersion = Type.String({
  minLength: 1,
  maxLength: 32,
  pattern: '^[1-9][0-9]*$',
});
const PersistedCompilerVersion = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern:
    '^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$',
});
const PersistedThemeContractVersion = Type.String({
  minLength: 1,
  maxLength: 32,
  pattern: '^[1-9][0-9]*$',
});

const SupportedArtifactSchemaVersion = Type.Union(
  SUPPORTED_DELIVERY_CONTRACTS.map((contract) => Type.Literal(contract.artifactSchemaVersion)),
);

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
  [Type.Ref(ActiveDocumentDeployment), Type.Ref(InactiveDocumentDeployment)],
  { $id: 'DocumentDeployment' },
);
export type DocumentDeployment = Static<typeof DocumentDeployment>;

const ReleaseIdentifier = Type.String({
  minLength: 1,
  maxLength: 256,
  pattern: RELEASE_IDENTIFIER_PATTERN,
});
const ReleaseTimestamp = Type.String({
  minLength: 20,
  maxLength: 64,
  pattern: ISO_TIMESTAMP_PATTERN,
});
const ReleaseIdempotencyKey = Type.String({
  minLength: 8,
  maxLength: 200,
  pattern: IDEMPOTENCY_KEY_PATTERN,
});
const ReleaseCorrelationId = Type.String({
  minLength: 8,
  maxLength: 256,
  pattern: CORRELATION_ID_PATTERN,
});

/** Human recovery intent is mandatory and must already be trimmed. */
export const ReleaseReason = Type.String({
  $id: 'ReleaseReason',
  minLength: 1,
  maxLength: 500,
  pattern: TRIMMED_RELEASE_REASON_PATTERN,
});
export type ReleaseReason = Static<typeof ReleaseReason>;

/** Immutable artifact and renderer inputs reused by recovery without compilation. */
export const ReleaseArtifactPins = Type.Object(
  {
    compiledArtifactId: Type.String({ minLength: 1, maxLength: 512 }),
    artifactSchemaVersion: PersistedArtifactSchemaVersion,
    contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
    compilerVersion: PersistedCompilerVersion,
    rendererContractVersion: Type.Ref(RendererContractVersion),
    themeContractVersion: PersistedThemeContractVersion,
    themeVersionId: ReleaseIdentifier,
    themeContentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
  },
  { $id: 'ReleaseArtifactPins', additionalProperties: false },
);
export type ReleaseArtifactPins = Static<typeof ReleaseArtifactPins>;

const RecoveryMutationFields = {
  reason: Type.Ref(ReleaseReason),
  expectedGeneration: Type.Integer({ minimum: 1 }),
  expectedActivePublicationId: Type.Optional(ReleaseIdentifier),
  idempotencyKey: ReleaseIdempotencyKey,
  correlationId: ReleaseCorrelationId,
} as const;

/** Rollback selects one exact earlier successful publication, never artifact bytes. */
export const RollbackReleaseRequest = Type.Object(
  {
    action: Type.Literal('rollback'),
    targetPublicationId: ReleaseIdentifier,
    ...RecoveryMutationFields,
  },
  { $id: 'RollbackReleaseRequest', additionalProperties: false },
);
export type RollbackReleaseRequest = Static<typeof RollbackReleaseRequest>;

/** Unpublish deactivates the current pointer without deleting immutable releases. */
export const UnpublishReleaseRequest = Type.Object(
  {
    action: Type.Literal('unpublish'),
    ...RecoveryMutationFields,
  },
  { $id: 'UnpublishReleaseRequest', additionalProperties: false },
);
export type UnpublishReleaseRequest = Static<typeof UnpublishReleaseRequest>;

export const ReleaseRecoveryRequest = Type.Union(
  [Type.Ref(RollbackReleaseRequest), Type.Ref(UnpublishReleaseRequest)],
  { $id: 'ReleaseRecoveryRequest' },
);
export type ReleaseRecoveryRequest = Static<typeof ReleaseRecoveryRequest>;

export const ReleaseRecoveryFailureCode = Type.Union(
  RELEASE_RECOVERY_FAILURE_CODES.map((code) => Type.Literal(code)),
  { $id: 'ReleaseRecoveryFailureCode' },
);
export type ReleaseRecoveryFailureCode = Static<typeof ReleaseRecoveryFailureCode>;

export const ReleaseRecoveryFailureDetail = Type.Union(
  RELEASE_RECOVERY_FAILURE_CODES.map((code) =>
    Type.Object(
      {
        code: Type.Literal(code),
        message: Type.Literal(RELEASE_RECOVERY_FAILURE_MESSAGES[code]),
      },
      { additionalProperties: false },
    ),
  ),
  { $id: 'ReleaseRecoveryFailureDetail' },
);
export type ReleaseRecoveryFailureDetail = Static<typeof ReleaseRecoveryFailureDetail>;

export const RollbackReleaseSuccess = Type.Object(
  {
    ok: Type.Literal(true),
    action: Type.Literal('rollback'),
    state: Type.Literal('active'),
    replayed: Type.Boolean(),
    releaseOperationId: ReleaseIdentifier,
    publicationId: ReleaseIdentifier,
    targetPublicationId: ReleaseIdentifier,
    previousPublicationId: ReleaseIdentifier,
    generation: Type.Integer({ minimum: 2 }),
    artifact: Type.Ref(ReleaseArtifactPins),
    completedAt: ReleaseTimestamp,
  },
  { $id: 'RollbackReleaseSuccess', additionalProperties: false },
);
export type RollbackReleaseSuccess = Static<typeof RollbackReleaseSuccess>;

export const UnpublishReleaseSuccess = Type.Object(
  {
    ok: Type.Literal(true),
    action: Type.Literal('unpublish'),
    state: Type.Literal('inactive'),
    replayed: Type.Boolean(),
    releaseOperationId: ReleaseIdentifier,
    previousPublicationId: ReleaseIdentifier,
    generation: Type.Integer({ minimum: 2 }),
    deactivatedArtifact: Type.Ref(ReleaseArtifactPins),
    completedAt: ReleaseTimestamp,
  },
  { $id: 'UnpublishReleaseSuccess', additionalProperties: false },
);
export type UnpublishReleaseSuccess = Static<typeof UnpublishReleaseSuccess>;

export const ReleaseRecoveryFailure = Type.Union(
  RELEASE_RECOVERY_FAILURE_CODES.map((code) =>
    Type.Object(
      {
        ok: Type.Literal(false),
        action: Type.Union(RELEASE_RECOVERY_ACTIONS.map((action) => Type.Literal(action))),
        state: Type.Literal('failed'),
        replayed: Type.Boolean(),
        code: Type.Literal(code),
        message: Type.Literal(RELEASE_RECOVERY_FAILURE_MESSAGES[code]),
        releaseOperationId: Type.Optional(ReleaseIdentifier),
        expectedGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
        actualGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
        expectedActivePublicationId: Type.Optional(ReleaseIdentifier),
        actualActivePublicationId: Type.Optional(Type.Union([ReleaseIdentifier, Type.Null()])),
      },
      { additionalProperties: false },
    ),
  ),
  { $id: 'ReleaseRecoveryFailure' },
);
export type ReleaseRecoveryFailure = Static<typeof ReleaseRecoveryFailure>;

export const ReleaseRecoveryResult = Type.Union(
  [
    Type.Ref(RollbackReleaseSuccess),
    Type.Ref(UnpublishReleaseSuccess),
    Type.Ref(ReleaseRecoveryFailure),
  ],
  { $id: 'ReleaseRecoveryResult' },
);
export type ReleaseRecoveryResult = Static<typeof ReleaseRecoveryResult>;

const ReleaseHistoryIdentity = {
  id: ReleaseIdentifier,
  workspaceId: ReleaseIdentifier,
  environmentId: ReleaseIdentifier,
  documentId: ReleaseIdentifier,
  releaseOperationId: ReleaseIdentifier,
  generation: Type.Integer({ minimum: 1 }),
  idempotencyKey: ReleaseIdempotencyKey,
  correlationId: ReleaseCorrelationId,
  actorUserId: Type.Union([ReleaseIdentifier, Type.Null()]),
  occurredAt: ReleaseTimestamp,
} as const;

export const PublishReleaseHistoryEntry = Type.Object(
  {
    ...ReleaseHistoryIdentity,
    action: Type.Literal('publish'),
    state: Type.Literal('active'),
    publicationId: ReleaseIdentifier,
    previousPublicationId: Type.Union([ReleaseIdentifier, Type.Null()]),
    artifact: Type.Ref(ReleaseArtifactPins),
  },
  { $id: 'PublishReleaseHistoryEntry', additionalProperties: false },
);
export type PublishReleaseHistoryEntry = Static<typeof PublishReleaseHistoryEntry>;

export const PromoteReleaseHistoryEntry = Type.Object(
  {
    ...ReleaseHistoryIdentity,
    action: Type.Literal('promote'),
    state: Type.Literal('active'),
    publicationId: ReleaseIdentifier,
    sourcePublicationId: ReleaseIdentifier,
    previousPublicationId: Type.Union([ReleaseIdentifier, Type.Null()]),
    artifact: Type.Ref(ReleaseArtifactPins),
  },
  { $id: 'PromoteReleaseHistoryEntry', additionalProperties: false },
);
export type PromoteReleaseHistoryEntry = Static<typeof PromoteReleaseHistoryEntry>;

export const RollbackReleaseHistoryEntry = Type.Object(
  {
    ...ReleaseHistoryIdentity,
    action: Type.Literal('rollback'),
    state: Type.Literal('active'),
    publicationId: ReleaseIdentifier,
    targetPublicationId: ReleaseIdentifier,
    previousPublicationId: ReleaseIdentifier,
    reason: Type.Ref(ReleaseReason),
    artifact: Type.Ref(ReleaseArtifactPins),
  },
  { $id: 'RollbackReleaseHistoryEntry', additionalProperties: false },
);
export type RollbackReleaseHistoryEntry = Static<typeof RollbackReleaseHistoryEntry>;

export const UnpublishReleaseHistoryEntry = Type.Object(
  {
    ...ReleaseHistoryIdentity,
    action: Type.Literal('unpublish'),
    state: Type.Literal('inactive'),
    previousPublicationId: ReleaseIdentifier,
    reason: Type.Ref(ReleaseReason),
    deactivatedArtifact: Type.Ref(ReleaseArtifactPins),
  },
  { $id: 'UnpublishReleaseHistoryEntry', additionalProperties: false },
);
export type UnpublishReleaseHistoryEntry = Static<typeof UnpublishReleaseHistoryEntry>;

const FailedRecoveryHistoryIdentity = {
  id: ReleaseIdentifier,
  workspaceId: ReleaseIdentifier,
  environmentId: ReleaseIdentifier,
  documentId: ReleaseIdentifier,
  releaseOperationId: ReleaseIdentifier,
  idempotencyKey: ReleaseIdempotencyKey,
  correlationId: ReleaseCorrelationId,
  actorUserId: Type.Union([ReleaseIdentifier, Type.Null()]),
  occurredAt: ReleaseTimestamp,
  state: Type.Literal('failed'),
  reason: Type.Ref(ReleaseReason),
  expectedGeneration: Type.Integer({ minimum: 1 }),
  actualGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
  expectedActivePublicationId: Type.Optional(ReleaseIdentifier),
  actualActivePublicationId: Type.Optional(Type.Union([ReleaseIdentifier, Type.Null()])),
  failure: Type.Ref(ReleaseRecoveryFailureDetail),
} as const;

export const RollbackReleaseFailureHistoryEntry = Type.Object(
  {
    ...FailedRecoveryHistoryIdentity,
    action: Type.Literal('rollback'),
    targetPublicationId: ReleaseIdentifier,
  },
  { $id: 'RollbackReleaseFailureHistoryEntry', additionalProperties: false },
);
export type RollbackReleaseFailureHistoryEntry = Static<typeof RollbackReleaseFailureHistoryEntry>;

export const UnpublishReleaseFailureHistoryEntry = Type.Object(
  {
    ...FailedRecoveryHistoryIdentity,
    action: Type.Literal('unpublish'),
  },
  { $id: 'UnpublishReleaseFailureHistoryEntry', additionalProperties: false },
);
export type UnpublishReleaseFailureHistoryEntry = Static<
  typeof UnpublishReleaseFailureHistoryEntry
>;

export const ReleaseRecoveryFailureHistoryEntry = Type.Union(
  [Type.Ref(RollbackReleaseFailureHistoryEntry), Type.Ref(UnpublishReleaseFailureHistoryEntry)],
  { $id: 'ReleaseRecoveryFailureHistoryEntry' },
);
export type ReleaseRecoveryFailureHistoryEntry = Static<typeof ReleaseRecoveryFailureHistoryEntry>;

/** Append-only release truth across publication, promotion, rollback, and deactivation. */
export const ReleaseHistoryEntry = Type.Union(
  [
    Type.Ref(PublishReleaseHistoryEntry),
    Type.Ref(PromoteReleaseHistoryEntry),
    Type.Ref(RollbackReleaseHistoryEntry),
    Type.Ref(UnpublishReleaseHistoryEntry),
    Type.Ref(ReleaseRecoveryFailureHistoryEntry),
  ],
  { $id: 'ReleaseHistoryEntry' },
);
export type ReleaseHistoryEntry = Static<typeof ReleaseHistoryEntry>;

/** Server-vetted recovery authority for the current member and environment policy. */
export const ReleaseRecoveryPermissions = Type.Object(
  {
    rollback: Type.Boolean(),
    unpublish: Type.Boolean(),
  },
  { $id: 'ReleaseRecoveryPermissions', additionalProperties: false },
);
export type ReleaseRecoveryPermissions = Static<typeof ReleaseRecoveryPermissions>;

/**
 * Bounded Phase 2 recovery read. The server returns the complete history within
 * this contract's cap and must not silently truncate it. Historical entries stay
 * visible even when their artifact pins are no longer deployable; only IDs in
 * rollbackTargetPublicationIds have passed the server's current deployability
 * and scope checks and may be submitted as rollback targets.
 */
export const ReleaseRecoveryStateResponse = Type.Object(
  {
    workspaceId: ReleaseIdentifier,
    environmentId: ReleaseIdentifier,
    documentId: ReleaseIdentifier,
    permissions: Type.Ref(ReleaseRecoveryPermissions),
    deployment: Type.Union([Type.Ref(DocumentDeployment), Type.Null()]),
    history: Type.Array(Type.Ref(ReleaseHistoryEntry), {
      maxItems: RELEASE_RECOVERY_HISTORY_MAX_ITEMS,
    }),
    rollbackTargetPublicationIds: Type.Array(ReleaseIdentifier, {
      maxItems: RELEASE_RECOVERY_ROLLBACK_TARGET_MAX_ITEMS,
      uniqueItems: true,
    }),
  },
  { $id: 'ReleaseRecoveryStateResponse', additionalProperties: false },
);
export type ReleaseRecoveryStateResponse = Static<typeof ReleaseRecoveryStateResponse>;

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

export const ManifestArtifactPointerV2 = Type.Union(
  SUPPORTED_DELIVERY_CONTRACTS.map((contract) =>
    Type.Object(
      {
        artifactSchemaVersion: Type.Literal(contract.artifactSchemaVersion),
        contentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
        compilerVersion: PersistedCompilerVersion,
        rendererContractVersion: Type.Literal(contract.rendererContractVersion),
        themeContractVersion: Type.Literal(contract.themeContractVersion),
        themeVersionId: Type.String({ minLength: 1 }),
        themeContentHash: Type.String({ pattern: CONTENT_HASH_PATTERN }),
        url: Type.String({ pattern: ARTIFACT_URL_PATTERN }),
        integrity: Type.String({ pattern: INTEGRITY_PATTERN }),
      },
      { additionalProperties: false },
    ),
  ),
  { $id: 'ManifestArtifactPointerV2' },
);
export type ManifestArtifactPointerV2 = Static<typeof ManifestArtifactPointerV2>;

export const ActiveExperimentAssignment = Type.Object(
  {
    experimentId: Type.String({ minLength: 1, maxLength: 128 }),
    armId: Type.Union(EXPERIMENT_ARM_IDS.map((value) => Type.Literal(value))),
    allocationRevision: Type.Integer({ minimum: 1 }),
  },
  { $id: 'ActiveExperimentAssignment', additionalProperties: false },
);
export type ActiveExperimentAssignment = Static<typeof ActiveExperimentAssignment>;

export const ActiveManifestPointerV2 = Type.Object(
  {
    schemaVersion: Type.Literal(PUBLIC_MANIFEST_SCHEMA_VERSION),
    workspaceId: Type.String({ minLength: 1 }),
    environmentId: Type.String({ minLength: 1 }),
    documentId: Type.String({ minLength: 1 }),
    state: Type.Literal('active'),
    generation: Type.Integer({ minimum: 1 }),
    publicationId: Type.String({ minLength: 1 }),
    activatedAt: Type.String({ minLength: 1 }),
    activation: Type.Optional(
      Type.Object(
        { trigger: TriggerDefinition, audience: AudienceDefinition },
        { additionalProperties: false },
      ),
    ),
    experimentAssignment: Type.Optional(Type.Ref(ActiveExperimentAssignment)),
    adaptive: Type.Optional(Type.Ref(AdaptiveDecisionContext)),
    artifact: ManifestArtifactPointerV2,
  },
  { $id: 'ActiveManifestPointerV2', additionalProperties: false },
);
export type ActiveManifestPointerV2 = Static<typeof ActiveManifestPointerV2>;

export const InactiveManifestPointerV2 = Type.Object(
  {
    schemaVersion: Type.Literal(PUBLIC_MANIFEST_SCHEMA_VERSION),
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
  rendererContractVersion: Type.Ref(RendererContractVersion),
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
  artifactSchemaVersion: SupportedArtifactSchemaVersion,
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
    rendererContractVersion: Type.Ref(RendererContractVersion),
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
