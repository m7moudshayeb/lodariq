import { createHash, randomUUID } from 'node:crypto';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  AUTHORING_SESSION_CAPABILITIES,
  ANALYTICS_EVENT_LIMITS,
  ANALYTICS_FORBIDDEN_PAYLOAD_KEYS,
  ANALYTICS_RESERVED_IDENTITY_KEYS,
  ANALYTICS_TARGET_RESOLUTION_STATUSES,
  AuthoringPageContext as AuthoringPageContextSchema,
  AuthoringProductMatchApplyResult as AuthoringProductMatchApplyResultSchema,
  AnalyticsEnvironmentQuery as AnalyticsEnvironmentQuerySchema,
  AuthoritativeAnalyticsEvent as AuthoritativeAnalyticsEventSchema,
  AuthoringDocumentIntent as AuthoringDocumentIntentSchema,
  BasicVisualPreflightReport as BasicVisualPreflightReportSchema,
  BrowserVerificationReport as BrowserVerificationReportSchema,
  BrandDriftAuditReport as BrandDriftAuditReportSchema,
  BrandThemeDefinition as BrandThemeDefinitionSchema,
  BrandThemeSnapshot as BrandThemeSnapshotSchema,
  BRAND_THEME_CONTRACT_VERSION,
  BRAND_THEME_SCHEMA_VERSION,
  COMPILER_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  ENVIRONMENT_PIPELINE_POSITION_BY_KIND,
  EnvironmentReleasePolicy as EnvironmentReleasePolicySchema,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  LodariqDocument as LodariqDocumentSchema,
  ProductStyleProposal as ProductStyleProposalSchema,
  ProductStyleSource as ProductStyleSourceSchema,
  RENDERER_CONTRACT_VERSION,
  RELEASE_RECOVERY_FAILURE_CODES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  RELEASE_RECOVERY_HISTORY_MAX_ITEMS,
  ReleaseRecoveryRequest as ReleaseRecoveryRequestSchema,
  ReleaseMutationGuard,
  WorkspaceEnvironmentPolicy as WorkspaceEnvironmentPolicySchema,
  createDefaultEnvironmentReleasePolicy,
  evaluateEnvironmentReleasePolicy,
  evaluateReleaseRecovery,
  validate,
  validateWorkspaceEnvironmentPolicy,
  type AnalyticsEvent,
  type AnalyticsEventAggregate,
  type AnalyticsEnvironmentQuery,
  type AnalyticsTargetResolutionStatus,
  type AuthoritativeAnalyticsEvent,
  type AuthoringActivationCapability,
  type AuthoringDocumentIntent,
  type AuthoringEnvironment,
  type AuthoringPageContext,
  type AuthoringPageDocumentSummary,
  type AuthoringProductMatchSourceReceipt,
  type AuthoringDocumentQueryScope,
  type AuthoringSessionCapability,
  type BasicVisualPreflightReport,
  type BrowserVerificationReport,
  type BrandDriftAuditReport,
  type BrandThemeDefinition,
  type BrandThemeSnapshot,
  type CompiledDocument,
  type ControlPlaneRole,
  type DocumentDeployment,
  type Environment,
  type EnvironmentPolicyValidationIssue,
  type EnvironmentReleasePolicy,
  type LodariqDocument,
  type QueryAuthoringDocumentsResult,
  type ProductStyleProposal,
  type ProductStyleSource,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryFailure,
  type ReleaseRecoveryFailureCode,
  type ReleaseRecoveryOperationSnapshot,
  type ReleaseRecoveryPublicationSnapshot,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
  type WorkspaceEnvironmentPolicy,
  type WorkspaceEnvironmentPolicyRow,
} from '@lodariq/schema';
import { isValidAuthoringSessionCapabilitySet } from './authoring-session-capabilities';
import {
  extractHistoricalReleaseArtifactPins,
  isReleaseArtifactCurrentlyDeployable,
} from './release-artifact-compatibility';
import { assertWorkspaceScope } from './rls';
import { verifyAuthoringPkceS256Challenge } from './tokens';

/*
 * Keep repository contracts structural and schema-backed. Release routes may
 * evolve, but every pointer mutation must carry the same canonical guard.
 */

export interface WorkspaceEnvironment {
  id: string;
  workspaceId: string;
  kind: Environment;
  name: string;
  originAllowlist: string[];
  /** Defaults to zero for pre-policy seeds and persisted rows. */
  requiredApprovalCount?: 0 | 1;
  /** Additive policy fields. Legacy fixtures are normalized to safe defaults. */
  enabled?: boolean;
  pipelinePosition?: number;
  authoringEnabled?: boolean;
  promotionSourceEnvironmentId?: string;
  releasePolicy?: EnvironmentReleasePolicy;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateEnvironmentReleasePolicyInput {
  workspaceId: string;
  environmentId: string;
  requiredApprovalCount: 0 | 1;
  expectedUpdatedAt: string;
  actorUserId: string;
}

export interface UpdateWorkspaceEnvironmentPolicyInput {
  workspaceId: string;
  environmentId: string;
  name: string;
  originAllowlist: string[];
  enabled: boolean;
  pipelinePosition: 0 | 1 | 2;
  authoringEnabled: boolean;
  promotionSourceEnvironmentId?: string;
  releasePolicy: EnvironmentReleasePolicy;
  expectedUpdatedAt: string;
  actorUserId: string;
}

export const ENVIRONMENT_RELEASE_POLICY_CHANGED_ERROR_CODE =
  'environment_release_policy_changed' as const;

export class EnvironmentReleasePolicyChangedError extends Error {
  readonly code = ENVIRONMENT_RELEASE_POLICY_CHANGED_ERROR_CODE;

  constructor(
    readonly expectedUpdatedAt: string,
    readonly actualUpdatedAt: string,
  ) {
    super('environment release policy changed before this update');
    this.name = 'EnvironmentReleasePolicyChangedError';
  }
}

export const WORKSPACE_ENVIRONMENT_POLICY_INVALID_ERROR_CODE =
  'workspace_environment_policy_invalid' as const;

export class WorkspaceEnvironmentPolicyInvalidError extends Error {
  readonly code = WORKSPACE_ENVIRONMENT_POLICY_INVALID_ERROR_CODE;

  constructor(readonly issues: EnvironmentPolicyValidationIssue[]) {
    super('workspace environment policy is invalid');
    this.name = 'WorkspaceEnvironmentPolicyInvalidError';
  }
}

export class EnvironmentPolicyMutationForbiddenError extends Error {
  readonly code = 'environment_policy_forbidden' as const;

  constructor(
    readonly decisionCode:
      | 'environment_disabled'
      | 'direct_publish_forbidden'
      | 'promotion_source_mismatch'
      | 'role_forbidden'
      | 'separation_of_duties_required',
  ) {
    super('the current environment policy forbids this release mutation');
    this.name = 'EnvironmentPolicyMutationForbiddenError';
  }
}

export type NormalizedWorkspaceEnvironment = WorkspaceEnvironment & {
  requiredApprovalCount: 0 | 1;
  enabled: boolean;
  pipelinePosition: 0 | 1 | 2;
  authoringEnabled: boolean;
  releasePolicy: EnvironmentReleasePolicy;
};

/**
 * Compatibility adapter for legacy fixtures and the additive persisted fields.
 * Production rows always resolve to the real opaque staging ID in this workspace.
 */
export function normalizeWorkspaceEnvironments(
  environments: readonly WorkspaceEnvironment[],
): NormalizedWorkspaceEnvironment[] {
  const stagingIds = environments
    .filter((environment) => environment.kind === 'staging')
    .map((environment) => environment.id)
    .sort();
  const defaultPromotionSourceEnvironmentId = stagingIds.length === 1 ? stagingIds[0] : undefined;

  return environments
    .map((environment): NormalizedWorkspaceEnvironment => {
      const defaultReleasePolicy = createDefaultEnvironmentReleasePolicy(environment.kind);
      if (
        environment.requiredApprovalCount !== undefined &&
        environment.releasePolicy !== undefined &&
        environment.requiredApprovalCount !== environment.releasePolicy.requiredApprovalCount
      ) {
        throw new WorkspaceEnvironmentPolicyInvalidError([
          {
            code: 'contract_invalid',
            field: 'requiredApprovalCount',
            environmentId: environment.id,
          },
        ]);
      }
      const requiredApprovalCount = normalizeEnvironmentApprovalCount(
        environment.requiredApprovalCount ?? environment.releasePolicy?.requiredApprovalCount ?? 0,
        environment.id,
      );
      const releasePolicyCandidate = environment.releasePolicy
        ? clone(environment.releasePolicy)
        : { ...defaultReleasePolicy, requiredApprovalCount };
      const releasePolicyValidation = validate(
        EnvironmentReleasePolicySchema,
        releasePolicyCandidate,
      );
      if (!releasePolicyValidation.valid) {
        throw new WorkspaceEnvironmentPolicyInvalidError([
          { code: 'contract_invalid', field: 'releasePolicy', environmentId: environment.id },
        ]);
      }
      const releasePolicy = releasePolicyValidation.value;
      const originAllowlist = normalizeEnvironmentOriginAllowlist(
        environment.originAllowlist,
        environment.kind,
        environment.id,
      );
      const promotionSourceEnvironmentId =
        environment.promotionSourceEnvironmentId ??
        (environment.kind === 'production' ? defaultPromotionSourceEnvironmentId : undefined);

      return {
        ...clone(environment),
        originAllowlist,
        requiredApprovalCount,
        enabled: environment.enabled ?? true,
        pipelinePosition: normalizeEnvironmentPipelinePosition(
          environment.pipelinePosition,
          environment.kind,
          environment.id,
        ),
        authoringEnabled: environment.authoringEnabled ?? environment.kind !== 'production',
        ...(promotionSourceEnvironmentId ? { promotionSourceEnvironmentId } : {}),
        releasePolicy,
      };
    })
    .sort(compareWorkspaceEnvironmentsByPipeline);
}

export function toWorkspaceEnvironmentPolicyRow(
  environment: WorkspaceEnvironment,
): WorkspaceEnvironmentPolicyRow {
  const normalized = normalizeWorkspaceEnvironments([environment])[0];
  if (!normalized) throw new Error('environment policy row is unavailable');
  return {
    id: normalized.id,
    workspaceId: normalized.workspaceId,
    kind: normalized.kind,
    displayName: normalized.name,
    enabled: normalized.enabled,
    pipelinePosition: normalized.pipelinePosition,
    allowedOrigins: [...normalized.originAllowlist],
    authoringEnabled: normalized.authoringEnabled,
    ...(normalized.promotionSourceEnvironmentId
      ? { promotionSourceEnvironmentId: normalized.promotionSourceEnvironmentId }
      : {}),
    releasePolicy: clone(normalized.releasePolicy),
  };
}

export function toWorkspaceEnvironmentPolicy(
  workspaceId: string,
  environments: readonly WorkspaceEnvironment[],
): WorkspaceEnvironmentPolicy {
  const normalized = normalizeWorkspaceEnvironments(environments);
  return {
    schemaVersion: '1',
    workspaceId,
    environments: normalized.map((environment) => ({
      id: environment.id,
      workspaceId: environment.workspaceId,
      kind: environment.kind,
      displayName: environment.name,
      enabled: environment.enabled,
      pipelinePosition: environment.pipelinePosition,
      allowedOrigins: [...environment.originAllowlist],
      authoringEnabled: environment.authoringEnabled,
      ...(environment.promotionSourceEnvironmentId
        ? { promotionSourceEnvironmentId: environment.promotionSourceEnvironmentId }
        : {}),
      releasePolicy: clone(environment.releasePolicy),
    })),
  };
}

export function assertValidWorkspaceEnvironmentPolicy(
  workspaceId: string,
  environments: readonly WorkspaceEnvironment[],
): WorkspaceEnvironmentPolicy {
  const policy = toWorkspaceEnvironmentPolicy(workspaceId, environments);
  const contract = validate(WorkspaceEnvironmentPolicySchema, policy);
  if (!contract.valid) {
    throw new WorkspaceEnvironmentPolicyInvalidError([
      { code: 'contract_invalid', field: 'policy' },
    ]);
  }
  const result = validateWorkspaceEnvironmentPolicy(contract.value);
  if (!result.valid) throw new WorkspaceEnvironmentPolicyInvalidError(result.issues);
  return contract.value;
}

export function assertEnvironmentPolicyMutationAllowed(
  environment: WorkspaceEnvironment,
  input: {
    action: 'direct-publish' | 'promote';
    expectedUpdatedAt: string;
    sourceEnvironmentId?: string;
  },
): NormalizedWorkspaceEnvironment {
  const normalized = assertEnvironmentPolicySnapshot(environment, input.expectedUpdatedAt);
  if (!normalized.enabled) {
    throw new EnvironmentPolicyMutationForbiddenError('environment_disabled');
  }
  if (input.action === 'direct-publish' && !normalized.releasePolicy.allowDirectPublish) {
    throw new EnvironmentPolicyMutationForbiddenError('direct_publish_forbidden');
  }
  if (
    input.action === 'promote' &&
    (!input.sourceEnvironmentId ||
      normalized.promotionSourceEnvironmentId !== input.sourceEnvironmentId)
  ) {
    throw new EnvironmentPolicyMutationForbiddenError('promotion_source_mismatch');
  }
  return normalized;
}

export function assertEnvironmentPolicySnapshot(
  environment: WorkspaceEnvironment,
  expectedUpdatedAtInput: string,
): NormalizedWorkspaceEnvironment {
  const normalized = normalizeWorkspaceEnvironments([environment])[0];
  if (!normalized) throw new Error('environment policy row is unavailable');
  const expectedUpdatedAt = normalizeIsoTimestamp(
    expectedUpdatedAtInput,
    'environment policy expectedUpdatedAt',
  );
  if (normalized.updatedAt !== expectedUpdatedAt) {
    throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, normalized.updatedAt);
  }
  return normalized;
}

function normalizeEnvironmentApprovalCount(value: number, environmentId: string): 0 | 1 {
  if (value === 0 || value === 1) return value;
  throw new WorkspaceEnvironmentPolicyInvalidError([
    { code: 'contract_invalid', field: 'requiredApprovalCount', environmentId },
  ]);
}

function normalizeEnvironmentPipelinePosition(
  value: number | undefined,
  kind: WorkspaceEnvironment['kind'],
  environmentId: string,
): 0 | 1 | 2 {
  if (value === undefined) return ENVIRONMENT_PIPELINE_POSITION_BY_KIND[kind];
  if (value === 0 || value === 1 || value === 2) return value;
  throw new WorkspaceEnvironmentPolicyInvalidError([
    { code: 'contract_invalid', field: 'pipelinePosition', environmentId },
  ]);
}

function compareWorkspaceEnvironmentsByPipeline(
  left: NormalizedWorkspaceEnvironment,
  right: NormalizedWorkspaceEnvironment,
): number {
  const pipelineDifference = left.pipelinePosition - right.pipelinePosition;
  return pipelineDifference || left.id.localeCompare(right.id);
}

export interface StyleSourceRecord {
  id: string;
  workspaceId: string;
  themeId: string;
  environmentId: string;
  proposalId: string;
  proposalHash: string;
  sourceOrdinal: number;
  sourceCount: number;
  appliedThemeRevision: number;
  draftChanged: boolean;
  source: ProductStyleSource;
  sourceHash: string;
  createdByUserId: string;
  createdAt: string;
}

export interface CreateStyleSourceInput {
  workspaceId: string;
  themeId: string;
  environmentId: string;
  source: ProductStyleSource;
  actorUserId: string;
}

export interface ApplyProductStyleProposalInput extends WorkspaceThemeMutationGuard {
  workspaceId: string;
  themeId: string;
  environmentId: string;
  proposal: ProductStyleProposal;
  draft: BrandThemeDefinition;
  actorUserId: string;
}

/**
 * Immutable server-owned Product Match receipt. `replayed` is deliberately not
 * persisted because it describes the current response, not the original
 * application. Every other canonical response field is frozen here.
 */
export interface ProductStyleApplicationReceipt {
  proposalId: string;
  draftRevision: number;
  draftUpdatedAt: string;
  previewTheme: BrandThemeSnapshot;
  sources: AuthoringProductMatchSourceReceipt[];
  draftChanged: boolean;
}

export interface ProductStyleApplicationRecord {
  id: string;
  workspaceId: string;
  themeId: string;
  environmentId: string;
  requestHash: string;
  sourceSetHash: string;
  receipt: ProductStyleApplicationReceipt;
  createdByUserId: string;
  createdAt: string;
}

export interface ProductStyleProposalApplicationResult {
  theme: WorkspaceThemeRecord;
  sources: StyleSourceRecord[];
  application: ProductStyleApplicationRecord;
  draftChanged: boolean;
  replayed: boolean;
}

export const PRODUCT_STYLE_PROPOSAL_CONFLICT_ERROR_CODE =
  'product_style_proposal_conflict' as const;

export class ProductStyleProposalConflictError extends Error {
  readonly code = PRODUCT_STYLE_PROPOSAL_CONFLICT_ERROR_CODE;

  constructor(readonly proposalId: string) {
    super('Product match proposal identity was already used for a different request');
    this.name = 'ProductStyleProposalConflictError';
  }
}

export interface WorkspaceThemeVersionRecord {
  id: string;
  workspaceId: string;
  themeId: string;
  version: number;
  schemaVersion: BrandThemeSnapshot['schemaVersion'];
  contractVersion: BrandThemeSnapshot['contractVersion'];
  snapshot: BrandThemeSnapshot;
  contentHash: string;
  approvedByUserId: string | null;
  approvedAt: string;
  createdAt: string;
}

export interface WorkspaceThemeRecord {
  id: string;
  workspaceId: string;
  name: string;
  draft: BrandThemeDefinition;
  revision: number;
  isDefault: boolean;
  activeVersionId: string | null;
  activeVersion: WorkspaceThemeVersionRecord | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceThemeInput {
  workspaceId: string;
  name: string;
  draft: BrandThemeDefinition;
  actorUserId: string;
}

export interface WorkspaceThemeMutationGuard {
  expectedRevision: number;
  expectedUpdatedAt: string;
}

export interface UpdateWorkspaceThemeDraftInput extends WorkspaceThemeMutationGuard {
  workspaceId: string;
  themeId: string;
  name?: string;
  draft: BrandThemeDefinition;
  actorUserId: string;
}

export interface ApproveWorkspaceThemeInput extends WorkspaceThemeMutationGuard {
  workspaceId: string;
  themeId: string;
  actorUserId: string;
}

export interface SetDefaultWorkspaceThemeInput extends WorkspaceThemeMutationGuard {
  workspaceId: string;
  themeId: string;
  actorUserId: string;
}

export interface WorkspaceThemeApprovalResult {
  theme: WorkspaceThemeRecord;
  approvedVersion: WorkspaceThemeVersionRecord;
}

export interface WorkspaceThemeImpactRecord {
  documentId: string;
  title: string;
  status: LodariqDocument['status'];
  bindingPolicy: 'workspace-current' | 'pinned' | 'legacy';
  acknowledgedThemeVersionId: string | null;
  pinnedThemeVersionId: string | null;
  latestArtifactThemeVersionId: string | null;
  activeEnvironmentIds: string[];
}

export interface VisualCheckRunRecord {
  id: string;
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  compiledArtifactId: string;
  themeVersionId: string;
  environmentId: string;
  contentHash: string;
  report: BasicVisualPreflightReport;
  status: BasicVisualPreflightReport['status'];
  createdByUserId: string | null;
  createdAt: string;
}

export interface CreateVisualCheckRunInput {
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  compiledArtifactId: string;
  themeVersionId: string;
  environmentId: string;
  contentHash: string;
  report: BasicVisualPreflightReport;
  actorUserId: string;
}

export interface BrandDriftRunRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  themeId: string;
  baselineThemeVersionId: string;
  trigger: BrandDriftAuditReport['trigger'];
  classification: BrandDriftAuditReport['classification'];
  confidence: number;
  report: BrandDriftAuditReport;
  createdByUserId: string;
  createdAt: string;
}

export interface CreateBrandDriftRunInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  themeId: string;
  baselineThemeVersionId: string;
  report: BrandDriftAuditReport;
  actorUserId: string;
}

export const WORKSPACE_THEME_CHANGED_ERROR_CODE = 'workspace_theme_changed' as const;

export class WorkspaceThemeChangedError extends Error {
  readonly code = WORKSPACE_THEME_CHANGED_ERROR_CODE;

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
    readonly expectedUpdatedAt: string,
    readonly actualUpdatedAt: string,
  ) {
    super(`workspace theme changed from revision ${expectedRevision} to ${actualRevision}`);
    this.name = 'WorkspaceThemeChangedError';
  }
}

export const WORKSPACE_THEME_APPROVAL_REQUIRED_ERROR_CODE =
  'workspace_theme_approval_required' as const;

export class WorkspaceThemeApprovalRequiredError extends Error {
  readonly code = WORKSPACE_THEME_APPROVAL_REQUIRED_ERROR_CODE;

  constructor(readonly themeId: string) {
    super('Only an approved Brand theme can become the workspace default');
    this.name = 'WorkspaceThemeApprovalRequiredError';
  }
}

export interface PublicSdkInstallationRecord {
  installationId: string;
  workspaceId: string;
  name: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface PublicSdkInstallationOriginRecord {
  installationId: string;
  workspaceId: string;
  environmentId: string;
  exactOrigin: string;
  authoringEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSdkInstallationWithOrigins extends PublicSdkInstallationRecord {
  origins: PublicSdkInstallationOriginRecord[];
}

export interface ResolvedPublicSdkInstallation {
  installation: PublicSdkInstallationRecord;
  environment: WorkspaceEnvironment;
  exactOrigin: string;
  authoringEnabled: boolean;
}

export interface PublicSdkBootstrapGrantRecord {
  id: string;
  installationId: string;
  workspaceId: string;
  environmentId: string;
  exactOrigin: string;
  /** A SHA-256 digest. The raw bootstrap grant must never be persisted. */
  grantHash: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

export const PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS = 5 * 60 * 1_000;

export interface AuthoringAuthorizationRequestRecord {
  requestId: string;
  bootstrapGrantId: string;
  installationId: string;
  workspaceId: string;
  environmentId: string;
  environment: AuthoringEnvironment;
  exactOrigin: string;
  /** A SHA-256 digest. The raw browser state must never be persisted. */
  stateHash: string;
  /** The consumed bootstrap grant hash bound to this request and its exchange. */
  bootstrapGrantHash: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  requestedCapabilities: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  creatorId: string | null;
  /** A SHA-256 digest. The raw authorization code must never be persisted. */
  authorizationCodeHash: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  authorizationCodeExpiresAt: string | null;
  authorizationCodeUsedAt: string | null;
}

export interface ResolvedAuthoringAuthorizationForUser {
  request: AuthoringAuthorizationRequestRecord;
  membership: WorkspaceMembershipRecord;
}

export interface AuthoringActivationGrantRecord {
  grantId: string;
  requestId: string;
  installationId: string;
  workspaceId: string;
  environmentId: string;
  environment: AuthoringEnvironment;
  exactOrigin: string;
  creatorId: string;
  capabilities: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  /** A SHA-256 digest. The raw activation grant must never be persisted. */
  grantHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}

export interface AuthoringCodeExchangeRecord {
  authorizationRequest: AuthoringAuthorizationRequestRecord;
  activationGrant: AuthoringActivationGrantRecord;
}

export const AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS = 10 * 60 * 1_000;
export const AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS = 60 * 1_000;
export const AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS = 120 * 1_000;
export const AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS = 5 * 60 * 1_000;
export const AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS = 15 * 60 * 1_000;
export const AUTHORING_TOUR_DRAFT_TITLE = 'Untitled tour';

export interface EnvironmentTokenRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: Environment;
  name: string;
  tokenHash?: string;
  tokenPrefix: string;
  clientToken?: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface AuthoringSessionRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: Environment;
  documentId: string;
  correlationId: string;
  tokenHash?: string;
  iframeSrc: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  installationId?: string | null;
  activationGrantId?: string | null;
  customerOrigin?: string | null;
  capabilities?: AuthoringSessionCapability[] | null;
  compilerVersion?: string | null;
  rendererContractVersion?: string | null;
  themeContractVersion?: string | null;
  themeVersionId?: string | null;
}

export interface AuthoringDocumentSessionRecord {
  sessionId: string;
  correlationId: string;
  installationId: string;
  activationGrantId: string;
  workspaceId: string;
  environmentId: string;
  environment: AuthoringEnvironment;
  documentId: string;
  customerOrigin: string;
  creatorId: string;
  capabilities: AuthoringSessionCapability[];
  compilerVersion: typeof COMPILER_VERSION;
  rendererContractVersion: typeof RENDERER_CONTRACT_VERSION;
  themeContractVersion: typeof BRAND_THEME_CONTRACT_VERSION;
  themeVersionId: string;
  /** A SHA-256 digest. The raw session bearer must never be persisted. */
  tokenHash: string;
  iframeSrc: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AuthoringSessionCompatibilityPins {
  compilerVersion: typeof COMPILER_VERSION;
  rendererContractVersion: typeof RENDERER_CONTRACT_VERSION;
  themeContractVersion: typeof BRAND_THEME_CONTRACT_VERSION;
  themeVersionId: string;
}

export interface AuthoringSessionThemeReference {
  source: 'fallback' | 'workspace';
  themeId: string;
  themeVersionId: string;
}

export interface AcknowledgeDocumentThemeInput {
  workspaceId: string;
  sessionId: string;
  documentId: string;
  actorUserId: string;
  expectedDocumentUpdatedAt: string;
  expectedThemeVersionId: string;
  reviewedThemeVersionId: string;
  document: LodariqDocument;
  artifact: CompiledDocument;
}

export interface ActivatedAuthoringDocumentSessionRecord {
  activationGrant: AuthoringActivationGrantRecord;
  session: AuthoringDocumentSessionRecord;
  documentCreated: boolean;
}

export interface UserRecord {
  id: string;
  /** Nullable rollback-only identifier from the retired external provider. */
  legacyIdentityId: string | null;
  email: string;
  name?: string | null;
  emailVerifiedAt?: string | null;
  createdAt: string;
}

export interface EmailVerificationChallengeRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

/** A password-enrollment/reset challenge. Raw lq_reset tokens are never persisted. */
export interface SetPasswordChallengeRecord {
  id: string;
  userId: string;
  tokenHash: string;
  emailNormalized: string;
  emailLookupHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AuthOutboxRecord {
  id: string;
  type: 'email_verification';
  userId: string;
  recipientEmail: string;
  payload: { challengeId: string; verificationPath: string };
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion?: number;
  lastError: string | null;
  terminalAt?: string | null;
  createdAt: string;
}

export interface SetPasswordOutboxRecord {
  id: string;
  type: 'set_password';
  userId: string;
  recipientEmail: string;
  payload: {
    purpose: 'set_password';
    challengeId: string;
    resetPath: string;
  };
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion?: number;
  lastError: string | null;
  terminalAt?: string | null;
  createdAt: string;
}

export type AuthEmailPurpose = 'email_verification' | 'set_password';

export interface ClaimedAuthEmailOutboxRow {
  id: string;
  recipientEmail: string;
  purpose: AuthEmailPurpose;
  challengeId: string;
  attempt: number;
  leaseVersion: number;
}

export interface ClaimDueAuthEmailRowsInput {
  now: string;
  limit: number;
  leaseDurationMs: number;
}

export interface AcknowledgeAuthEmailRowInput {
  id: string;
  purpose: AuthEmailPurpose;
  leaseVersion: number;
  processedAt: string;
}

export interface RetryAuthEmailRowInput {
  id: string;
  purpose: AuthEmailPurpose;
  leaseVersion: number;
  failureCode: string;
  availableAt: string | null;
  terminal: boolean;
}

export interface AuthEmailOutboxQueue {
  claimDue(input: ClaimDueAuthEmailRowsInput): Promise<readonly ClaimedAuthEmailOutboxRow[]>;
  acknowledge(input: AcknowledgeAuthEmailRowInput): Promise<boolean>;
  retry(input: RetryAuthEmailRowInput): Promise<boolean>;
}

export interface NormalizedAuthEmailClaimInput {
  now: string;
  limit: number;
  leaseExpiresAt: string;
}

const AUTH_EMAIL_OUTBOX_MAX_BATCH_SIZE = 25;
const AUTH_EMAIL_OUTBOX_MIN_LEASE_MS = 5_000;
const AUTH_EMAIL_OUTBOX_MAX_LEASE_MS = 5 * 60_000;

export function normalizeAuthEmailClaimInput(
  input: ClaimDueAuthEmailRowsInput,
): NormalizedAuthEmailClaimInput | null {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(input.limit)) return null;
  const limit = Math.max(0, Math.min(Math.trunc(input.limit), AUTH_EMAIL_OUTBOX_MAX_BATCH_SIZE));
  if (limit === 0 || !Number.isFinite(input.leaseDurationMs)) return null;
  const leaseDurationMs = Math.max(
    AUTH_EMAIL_OUTBOX_MIN_LEASE_MS,
    Math.min(Math.trunc(input.leaseDurationMs), AUTH_EMAIL_OUTBOX_MAX_LEASE_MS),
  );
  return {
    now: new Date(nowMs).toISOString(),
    limit,
    leaseExpiresAt: new Date(nowMs + leaseDurationMs).toISOString(),
  };
}

export function sanitizeAuthEmailFailureCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '_')
    .replace(/^[-_]+|[-_]+$/gu, '')
    .slice(0, 64);
  return normalized || 'delivery_failed';
}

export interface ConsumeAuthRateLimitInput {
  bucketHash: string;
  scope: 'sign-in' | 'sign-up';
  now: string;
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
}

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface PasswordCredentialRecord {
  userId: string;
  emailNormalized: string;
  emailLookupHash: string;
  algorithm: 'argon2id-v1';
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  activeWorkspaceId: string | null;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
}

export interface IdentityWorkspaceRecord {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export interface CreateIdentityAccountInput {
  user: UserRecord;
  credential: PasswordCredentialRecord;
  workspace: { id: string; name: string; createdAt: string; updatedAt: string };
  membership: WorkspaceMembershipRecord;
  environments: WorkspaceEnvironment[];
  session?: AuthSessionRecord;
  emailVerificationChallenge: EmailVerificationChallengeRecord;
  outboxMessage: AuthOutboxRecord;
}

export interface CreateIdentityWorkspaceInput {
  userId: string;
  workspace: { id: string; name: string; createdAt: string; updatedAt: string };
  membership: WorkspaceMembershipRecord;
  environments: WorkspaceEnvironment[];
}

export interface RotateAuthSessionInput {
  currentTokenHash: string;
  nextSession: AuthSessionRecord;
}

export interface CreateCredentialBoundAuthSessionInput {
  session: AuthSessionRecord;
  expectedPasswordHash: string;
}

export interface ResolvedEmailVerificationChallenge {
  userId: string;
  emailNormalized: string;
}

export interface ConsumeEmailVerificationChallengeInput {
  challengeId: string;
  tokenHash: string;
  usedAt: string;
  credential: SetPasswordCredentialMaterial;
}

export interface RequestSetPasswordChallengeInput {
  emailNormalized: string;
  emailLookupHash: string;
  challenge: Omit<SetPasswordChallengeRecord, 'userId'>;
  outboxMessage: Omit<SetPasswordOutboxRecord, 'userId' | 'recipientEmail'>;
}

export interface ResolvedSetPasswordChallenge {
  userId: string;
  emailNormalized: string;
}

export type SetPasswordCredentialMaterial = Omit<
  PasswordCredentialRecord,
  'userId' | 'emailNormalized' | 'emailLookupHash'
>;

export interface ConsumeSetPasswordChallengeInput {
  challengeId: string;
  tokenHash: string;
  usedAt: string;
  credential: SetPasswordCredentialMaterial;
}

export interface IdentityRepository extends AuthEmailOutboxQueue {
  findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null>;
  getIdentityUser(userId: string): Promise<UserRecord | null>;
  createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean>;
  resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null>;
  consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null>;
  requestSetPasswordChallenge(input: RequestSetPasswordChallengeInput): Promise<boolean>;
  resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null>;
  consumeSetPasswordChallenge(input: ConsumeSetPasswordChallengeInput): Promise<UserRecord | null>;
  consumeAuthRateLimit(input: ConsumeAuthRateLimitInput): Promise<AuthRateLimitResult>;
  pruneAuthRateLimits(before: string, limit: number): Promise<number>;
  createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord>;
  createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null>;
  resolveAuthSession(tokenHash: string, now: string): Promise<AuthSessionRecord | null>;
  touchAuthSession(
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): Promise<AuthSessionRecord | null>;
  rotateAuthSession(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null>;
  revokeAuthSession(tokenHash: string, revokedAt: string): Promise<boolean>;
  listIdentityWorkspaces(userId: string): Promise<IdentityWorkspaceRecord[]>;
  createIdentityWorkspace(input: CreateIdentityWorkspaceInput): Promise<boolean>;
}

export interface WorkspaceMembershipRecord {
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export interface DocumentSummary {
  id: string;
  workspaceId: string;
  type: LodariqDocument['type'];
  status: LodariqDocument['status'];
  title: string;
  schemaVersion: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  latestContentHash?: string;
  publications: DocumentPublicationSummary[];
}

export interface DocumentPublicationSummary {
  environmentId: string;
  environment: Environment;
  contentHash: string;
  publishedAt: string;
}

export interface PersistedDocumentVersion {
  id: string;
  workspaceId: string;
  documentId: string;
  version: number;
  canonical: LodariqDocument;
  createdByUserId: string | null;
  createdAt: string;
}

export interface PersistedCompiledArtifact {
  id: string;
  workspaceId: string;
  documentId: string;
  documentVersionId?: string | null;
  contentHash: string;
  compilerVersion: string;
  themeVersionId?: string | null;
  themeContentHash?: string | null;
  rendererContractVersion?: string | null;
  compiled: CompiledDocument;
  createdAt: string;
}

export const PUBLICATION_ACTIONS = ['publish', 'promote', 'rollback'] as const;
export type PublicationAction = (typeof PUBLICATION_ACTIONS)[number];

export interface PersistedPublication {
  id: string;
  workspaceId: string;
  correlationId: string;
  environmentId: string;
  environment: Environment;
  documentId: string;
  documentVersionId?: string | null;
  compiledArtifactId: string;
  contentHash: string;
  action: PublicationAction | null;
  sourcePublicationId: string | null;
  previousPublicationId: string | null;
  releaseOperationId: string | null;
  publishedByUserId: string | null;
  publishedAt: string;
  artifact: PersistedCompiledArtifact;
}

export interface PersistedReleaseOperation {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  action: 'publish' | 'promote' | 'rollback' | 'unpublish';
  requestedArtifactId: string | null;
  /** Raw caller-selected rollback target. Audit-only and deliberately has no FK. */
  requestedSourcePublicationId: string | null;
  /** Raw caller CAS assertion. Audit-only and deliberately has no FK. */
  requestedActivePublicationId: string | null;
  /** Server-resolved active publication at evaluation time, exact-scope FK-backed in SQL. */
  actualActivePublicationId: string | null;
  sourcePublicationId: string | null;
  expectedGeneration: number;
  resultGeneration: number | null;
  idempotencyKey: string;
  requestHash: string;
  status: 'awaiting_approval' | 'activating' | 'completed' | 'failed';
  correlationId: string;
  requestedByUserId: string | null;
  resultPublicationId: string | null;
  /** Required, already-trimmed human intent for rollback/unpublish; null otherwise. */
  reason: string | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ReleaseRecoveryScopeInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  actorUserId: string;
}

export interface RecoverDocumentReleaseInput extends ReleaseRecoveryScopeInput {
  request: ReleaseRecoveryRequest;
}

interface ReleaseRecoveryPublicationMaterial {
  publication: PersistedPublication;
  operation: PersistedReleaseOperation;
  snapshot: ReleaseRecoveryPublicationSnapshot;
}

export const RELEASE_RECOVERY_HISTORY_LIMIT_EXCEEDED_ERROR_CODE =
  'release_recovery_history_limit_exceeded' as const;

export class ReleaseRecoveryHistoryLimitExceededError extends Error {
  readonly code = RELEASE_RECOVERY_HISTORY_LIMIT_EXCEEDED_ERROR_CODE;

  constructor(readonly count: number) {
    super(`release recovery history has ${count} entries, exceeding the complete response limit`);
    this.name = 'ReleaseRecoveryHistoryLimitExceededError';
  }
}

export class ReleaseRecoveryHistoryIntegrityError extends Error {
  readonly code = 'release_recovery_history_integrity_error' as const;

  constructor(readonly releaseOperationId: string) {
    super(`terminal release operation ${releaseOperationId} cannot be represented truthfully`);
    this.name = 'ReleaseRecoveryHistoryIntegrityError';
  }
}

export interface PublicationVerificationRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  documentId: string;
  publicationId: string;
  result: 'passed' | 'failed';
  report: BrowserVerificationReport;
  verifiedOrigin: string;
  verifiedByUserId: string;
  createdAt: string;
}

export interface CreatePublicationVerificationInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  /** CAS guard: verification is rejected unless this is still the active publication. */
  expectedPublicationId: string;
  report: BrowserVerificationReport;
  /** Server-observed origin, stored separately from the untrusted report body. */
  verifiedOrigin: string;
  actorUserId: string;
}

export interface ReleaseApprovalRecord {
  id: string;
  workspaceId: string;
  releaseOperationId: string;
  decision: 'approved' | 'rejected';
  reason: string | null;
  decidedByUserId: string;
  createdAt: string;
}

export interface CreateReleaseApprovalInput {
  workspaceId: string;
  releaseOperationId: string;
  decision: ReleaseApprovalRecord['decision'];
  reason?: string | null;
  actorUserId: string;
  /** CAS pin for the policy reviewed before recording an immutable decision. */
  expectedEnvironmentPolicyUpdatedAt: string;
}

export interface PromoteVerifiedPublicationInput {
  workspaceId: string;
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  documentId: string;
  /** Explicit source pointer guard; artifact identity is resolved internally. */
  expectedSourcePublicationId: string;
  correlationId: string;
  actorUserId: string;
  idempotencyKey: string;
  requestHash: string;
  expectedGeneration: number;
  /** CAS pin for the server-authorized target policy read. */
  expectedEnvironmentPolicyUpdatedAt: string;
}

export interface PromotionResult {
  operation: PersistedReleaseOperation;
  sourcePublication: PersistedPublication;
  publication: PersistedPublication | null;
  deployment: PersistedDocumentDeployment | null;
  approvalCount: number;
  requiredApprovalCount: number;
  replayed: boolean;
}

export type PersistedDocumentDeployment = DocumentDeployment;

export const AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE = 'AMBIGUOUS_CURRENT_PUBLICATION' as const;

export class AmbiguousCurrentPublicationError extends Error {
  readonly code = AMBIGUOUS_CURRENT_PUBLICATION_ERROR_CODE;
  readonly documentIds: string[];

  constructor(
    readonly workspaceId: string,
    readonly environmentId: string,
    documentIds: string[],
  ) {
    const stableDocumentIds = [...new Set(documentIds)].sort();
    super(`environment has multiple active document publications: ${stableDocumentIds.join(', ')}`);
    this.name = 'AmbiguousCurrentPublicationError';
    this.documentIds = stableDocumentIds;
  }
}

export const IDEMPOTENCY_CONFLICT_ERROR_CODE = 'idempotency_conflict' as const;
export const DEPLOYMENT_CHANGED_ERROR_CODE = 'deployment_changed' as const;
export const RELEASE_OPERATION_IN_PROGRESS_ERROR_CODE = 'release_operation_in_progress' as const;
export const ACTIVE_PUBLICATION_CHANGED_ERROR_CODE = 'active_publication_changed' as const;
export const PUBLICATION_VERIFICATION_REQUIRED_ERROR_CODE =
  'publication_verification_required' as const;
export const RELEASE_APPROVAL_REJECTED_ERROR_CODE = 'release_approval_rejected' as const;

export class IdempotencyConflictError extends Error {
  readonly code = IDEMPOTENCY_CONFLICT_ERROR_CODE;

  constructor(readonly idempotencyKey: string) {
    super('idempotency key was already used with a different request');
    this.name = 'IdempotencyConflictError';
  }
}

export class DeploymentChangedError extends Error {
  readonly code = DEPLOYMENT_CHANGED_ERROR_CODE;

  constructor(
    readonly expectedGeneration: number,
    readonly actualGeneration: number,
  ) {
    super(
      `document deployment changed from generation ${expectedGeneration} to ${actualGeneration}`,
    );
    this.name = 'DeploymentChangedError';
  }
}

export class ReleaseOperationInProgressError extends Error {
  readonly code = RELEASE_OPERATION_IN_PROGRESS_ERROR_CODE;

  constructor(readonly idempotencyKey: string) {
    super('release operation is already in progress');
    this.name = 'ReleaseOperationInProgressError';
  }
}

export class ActivePublicationChangedError extends Error {
  readonly code = ACTIVE_PUBLICATION_CHANGED_ERROR_CODE;

  constructor(
    readonly expectedPublicationId: string,
    readonly actualPublicationId: string | null,
  ) {
    super('active publication changed before the guarded operation completed');
    this.name = 'ActivePublicationChangedError';
  }
}

export class PublicationVerificationRequiredError extends Error {
  readonly code = PUBLICATION_VERIFICATION_REQUIRED_ERROR_CODE;

  constructor(readonly publicationId: string) {
    super('the exact active staging publication must have a passing browser verification');
    this.name = 'PublicationVerificationRequiredError';
  }
}

export class ReleaseApprovalRejectedError extends Error {
  readonly code = RELEASE_APPROVAL_REJECTED_ERROR_CODE;

  constructor(readonly releaseOperationId: string) {
    super('the production promotion has an immutable rejection decision');
    this.name = 'ReleaseApprovalRejectedError';
  }
}

export interface PersistedDocument {
  document: LodariqDocument;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  latestArtifact?: PersistedCompiledArtifact;
}

export interface SaveDocumentInput {
  workspaceId: string;
  document: LodariqDocument;
  actorUserId: string;
  artifact?: CompiledDocument;
}

export interface CreateEnvironmentTokenInput {
  workspaceId: string;
  environmentId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  clientToken?: string;
  actorUserId: string;
}

export interface GetOrCreatePublicSdkInstallationInput {
  workspaceId: string;
  installationId: string;
  name: string;
  actorUserId: string;
}

export interface SetPublicSdkInstallationOriginInput {
  workspaceId: string;
  installationId: string;
  environmentId: string;
  origin: string;
  authoringEnabled: boolean;
}

export interface SyncPublicSdkInstallationOriginsInput {
  workspaceId: string;
  installationId: string;
  origins: Array<{
    environmentId: string;
    origin: string;
    authoringEnabled: boolean;
  }>;
}

export interface CreatePublicSdkBootstrapGrantInput {
  workspaceId: string;
  installationId: string;
  environmentId: string;
  exactOrigin: string;
  grantHash: string;
  expiresAt: string;
}

export interface ConsumePublicSdkBootstrapGrantInput {
  installationId: string;
  exactOrigin: string;
  grantHash: string;
}

export interface CreateAuthoringAuthorizationRequestInput {
  installationId: string;
  exactOrigin: string;
  bootstrapGrantHash: string;
  stateHash: string;
  codeChallenge: string;
  requestedCapabilities: AuthoringActivationCapability[];
  documentIntent?: AuthoringDocumentIntent;
  expiresAt: string;
}

export interface ApproveAuthoringAuthorizationRequestInput {
  workspaceId: string;
  requestId: string;
  stateHash: string;
  creatorId: string;
  authorizationCodeHash: string;
  authorizationCodeExpiresAt: string;
}

export interface ExchangeAuthoringAuthorizationCodeInput {
  installationId: string;
  exactOrigin: string;
  requestId: string;
  bootstrapGrantHash: string;
  stateHash: string;
  authorizationCodeHash: string;
  codeVerifier: string;
  activationGrantHash: string;
  activationGrantExpiresAt: string;
}

export interface ConsumeAuthoringActivationGrantInput {
  installationId: string;
  exactOrigin: string;
  grantHash: string;
}

export interface CreateAuthoringDocumentSessionFromActivationInput {
  installationId: string;
  exactOrigin: string;
  activationGrantHash: string;
  pageContext: AuthoringPageContext;
  selectionScope: AuthoringDocumentQueryScope;
  documentIntent: AuthoringDocumentIntent;
  correlationId: string;
  sessionTokenHash: string;
  iframeSrc: string;
  expiresAt: string;
}

export interface QueryAuthoringDocumentsFromActivationInput {
  installationId: string;
  exactOrigin: string;
  activationGrantHash: string;
  scope: AuthoringDocumentQueryScope;
  pageContext: AuthoringPageContext;
}

export interface RevokeAuthoringSessionInput {
  sessionId: string;
  tokenHash: string;
}

export interface CreateAuthoringSessionInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  correlationId: string;
  tokenHash: string;
  iframeSrc: string;
  expiresAt: string;
  actorUserId: string;
}

export interface PublishCompiledArtifactInput {
  workspaceId: string;
  environmentId: string;
  correlationId: string;
  artifact: PersistedCompiledArtifact;
  actorUserId: string;
}

type PublicationProvenance = Pick<
  PersistedPublication,
  'action' | 'sourcePublicationId' | 'previousPublicationId' | 'releaseOperationId'
>;

const LEGACY_PUBLICATION_PROVENANCE: PublicationProvenance = {
  action: 'publish',
  sourcePublicationId: null,
  previousPublicationId: null,
  releaseOperationId: null,
};

export interface ActivateCompiledArtifactInput extends PublishCompiledArtifactInput {
  /** Defaults to `publish`; promotion always reuses the source publication artifact. */
  action?: 'publish' | 'promote';
  sourcePublicationId?: string | null;
  idempotencyKey: string;
  requestHash: string;
  expectedGeneration: number;
  /** CAS pin for the server-authorized environment policy read. */
  expectedEnvironmentPolicyUpdatedAt: string;
}

export interface ReleaseActivationResult {
  operation: PersistedReleaseOperation;
  publication: PersistedPublication;
  deployment: PersistedDocumentDeployment;
  replayed: boolean;
}

export interface IngestEventsInput {
  workspaceId: string;
  events: AnalyticsEvent[];
}

/**
 * A server-authoritative SDK analytics batch. The duplicated scope is
 * intentional: repositories reject any event whose server-owned envelope does
 * not match the transaction scope before writing any part of the batch.
 */
export interface IngestAuthoritativeEventsInput {
  workspaceId: string;
  environmentId: string;
  events: AuthoritativeAnalyticsEvent[];
}

export interface PersistedAnalyticsEventRecord extends AuthoritativeAnalyticsEvent {
  id: string;
  ingestedAt: string;
}

export interface QueryAnalyticsEventsInput {
  workspaceId: string;
  query: AnalyticsEnvironmentQuery;
}

/**
 * Aggregates retain every immutable delivery dimension. This prevents events
 * before and after a rollback from being silently attributed to one release.
 */
export const DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT = 100;

export function assertAuthoritativeAnalyticsBatch(input: IngestAuthoritativeEventsInput): void {
  if (input.events.length > ANALYTICS_EVENT_LIMITS.batchSize) {
    throw new Error('authoritative analytics batch exceeds the event limit');
  }
  for (const event of input.events) {
    assertAuthoritativeAnalyticsEvent(event, input.workspaceId, input.environmentId);
  }
}

export interface ResolvedEnvironmentToken extends EnvironmentTokenRecord {
  originAllowlist: string[];
}

export interface ControlPlaneRepository extends IdentityRepository {
  /** Fail closed when the repository's required backing store is unavailable. */
  checkReadiness(): Promise<void>;
  resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null>;
  listWorkspaceThemes(workspaceId: string): Promise<WorkspaceThemeRecord[]>;
  getWorkspaceTheme(workspaceId: string, themeId: string): Promise<WorkspaceThemeRecord | null>;
  getDefaultWorkspaceTheme(workspaceId: string): Promise<WorkspaceThemeRecord | null>;
  listWorkspaceThemeVersions(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeVersionRecord[]>;
  createWorkspaceTheme(input: CreateWorkspaceThemeInput): Promise<WorkspaceThemeRecord>;
  updateWorkspaceThemeDraft(
    input: UpdateWorkspaceThemeDraftInput,
  ): Promise<WorkspaceThemeRecord | null>;
  applyProductStyleProposal(
    input: ApplyProductStyleProposalInput,
  ): Promise<ProductStyleProposalApplicationResult | null>;
  approveWorkspaceTheme(
    input: ApproveWorkspaceThemeInput,
  ): Promise<WorkspaceThemeApprovalResult | null>;
  setDefaultWorkspaceTheme(
    input: SetDefaultWorkspaceThemeInput,
  ): Promise<WorkspaceThemeRecord | null>;
  listWorkspaceThemeImpact(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeImpactRecord[]>;
  createStyleSource(input: CreateStyleSourceInput): Promise<StyleSourceRecord>;
  listStyleSources(workspaceId: string, themeId?: string): Promise<StyleSourceRecord[]>;
  createBrandDriftRun(input: CreateBrandDriftRunInput): Promise<BrandDriftRunRecord>;
  listBrandDriftRuns(workspaceId: string, documentId: string): Promise<BrandDriftRunRecord[]>;
  listDocuments(workspaceId: string): Promise<DocumentSummary[]>;
  getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null>;
  listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]>;
  getDocumentVersion(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<PersistedDocumentVersion | null>;
  saveDocument(input: SaveDocumentInput): Promise<PersistedDocument>;
  getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null>;
  getCompiledArtifact(
    workspaceId: string,
    documentId: string,
    artifactId: string,
  ): Promise<PersistedCompiledArtifact | null>;
  getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null>;
  getDocumentDeployment(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDocumentDeployment | null>;
  listDocumentDeployments(
    workspaceId: string,
    environmentId?: string,
  ): Promise<PersistedDocumentDeployment[]>;
  listDocumentPublications(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedPublication[]>;
  getPublicationById(
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null>;
  getCurrentPublicationForDocument(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedPublication | null>;
  getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null>;
  getReleaseOperation(
    workspaceId: string,
    environmentId: string,
    documentId: string,
    idempotencyKey: string,
  ): Promise<PersistedReleaseOperation | null>;
  getReleaseOperationById(
    workspaceId: string,
    operationId: string,
  ): Promise<PersistedReleaseOperation | null>;
  getReleaseRecoveryState(
    input: ReleaseRecoveryScopeInput,
  ): Promise<ReleaseRecoveryStateResponse | null>;
  recoverDocumentRelease(input: RecoverDocumentReleaseInput): Promise<ReleaseRecoveryResult | null>;
  publishCompiledArtifact(input: PublishCompiledArtifactInput): Promise<PersistedPublication>;
  activateCompiledArtifact(input: ActivateCompiledArtifactInput): Promise<ReleaseActivationResult>;
  createPublicationVerification(
    input: CreatePublicationVerificationInput,
  ): Promise<PublicationVerificationRecord>;
  listPublicationVerifications(
    workspaceId: string,
    publicationId: string,
  ): Promise<PublicationVerificationRecord[]>;
  createReleaseApproval(input: CreateReleaseApprovalInput): Promise<ReleaseApprovalRecord>;
  listReleaseApprovals(
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<ReleaseApprovalRecord[]>;
  promoteVerifiedPublication(input: PromoteVerifiedPublicationInput): Promise<PromotionResult>;
  listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]>;
  updateEnvironmentReleasePolicy(
    input: UpdateEnvironmentReleasePolicyInput,
  ): Promise<WorkspaceEnvironment | null>;
  updateWorkspaceEnvironmentPolicy(
    input: UpdateWorkspaceEnvironmentPolicyInput,
  ): Promise<WorkspaceEnvironment | null>;
  listPublicSdkInstallations(workspaceId: string): Promise<PublicSdkInstallationWithOrigins[]>;
  getOrCreatePublicSdkInstallation(
    input: GetOrCreatePublicSdkInstallationInput,
  ): Promise<PublicSdkInstallationRecord>;
  setPublicSdkInstallationOrigin(
    input: SetPublicSdkInstallationOriginInput,
  ): Promise<PublicSdkInstallationOriginRecord>;
  syncPublicSdkInstallationOrigins(
    input: SyncPublicSdkInstallationOriginsInput,
  ): Promise<PublicSdkInstallationOriginRecord[]>;
  resolvePublicSdkInstallation(
    installationId: string,
    origin: string,
  ): Promise<ResolvedPublicSdkInstallation | null>;
  revokePublicSdkInstallation(
    workspaceId: string,
    installationId: string,
    actorUserId: string,
  ): Promise<PublicSdkInstallationRecord | null>;
  createPublicSdkBootstrapGrant(
    input: CreatePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord>;
  consumePublicSdkBootstrapGrant(
    input: ConsumePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord | null>;
  createAuthoringAuthorizationRequest(
    input: CreateAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null>;
  getAuthoringAuthorizationRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<AuthoringAuthorizationRequestRecord | null>;
  getAuthoringAuthorizationRequestForUser(
    userId: string,
    requestId: string,
  ): Promise<ResolvedAuthoringAuthorizationForUser | null>;
  approveAuthoringAuthorizationRequest(
    input: ApproveAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null>;
  exchangeAuthoringAuthorizationCode(
    input: ExchangeAuthoringAuthorizationCodeInput,
  ): Promise<AuthoringCodeExchangeRecord | null>;
  consumeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null>;
  revokeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null>;
  queryAuthoringDocumentsFromActivation(
    input: QueryAuthoringDocumentsFromActivationInput,
  ): Promise<QueryAuthoringDocumentsResult | null>;
  createAuthoringDocumentSessionFromActivation(
    input: CreateAuthoringDocumentSessionFromActivationInput,
  ): Promise<ActivatedAuthoringDocumentSessionRecord | null>;
  listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]>;
  resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null>;
  createEnvironmentToken(input: CreateEnvironmentTokenInput): Promise<EnvironmentTokenRecord>;
  revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null>;
  createAuthoringSession(input: CreateAuthoringSessionInput): Promise<AuthoringSessionRecord>;
  resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null>;
  resolveAuthoringSessionByTokenHash(tokenHash: string): Promise<AuthoringSessionRecord | null>;
  acknowledgeDocumentTheme(input: AcknowledgeDocumentThemeInput): Promise<PersistedDocument | null>;
  revokeAuthoringSession(
    input: RevokeAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord | null>;
  createVisualCheckRun(input: CreateVisualCheckRunInput): Promise<VisualCheckRunRecord>;
  listVisualCheckRuns(workspaceId: string, documentId: string): Promise<VisualCheckRunRecord[]>;
  ingestAuthoritativeEvents(input: IngestAuthoritativeEventsInput): Promise<number>;
  listAnalyticsEvents(input: QueryAnalyticsEventsInput): Promise<PersistedAnalyticsEventRecord[]>;
  aggregateAnalyticsEvents(input: QueryAnalyticsEventsInput): Promise<AnalyticsEventAggregate[]>;
  ingestEvents(input: IngestEventsInput): Promise<number>;
}

export interface InMemoryControlPlaneSeed {
  users?: UserRecord[];
  workspaces?: Array<{ id: string; name: string; createdAt: string; updatedAt: string }>;
  workspaceMemberships?: WorkspaceMembershipRecord[];
  passwordCredentials?: PasswordCredentialRecord[];
  authSessions?: AuthSessionRecord[];
  emailVerificationChallenges?: EmailVerificationChallengeRecord[];
  authOutbox?: AuthOutboxRecord[];
  setPasswordChallenges?: SetPasswordChallengeRecord[];
  setPasswordOutbox?: SetPasswordOutboxRecord[];
  documents?: LodariqDocument[];
  environments?: WorkspaceEnvironment[];
  publicSdkInstallations?: PublicSdkInstallationRecord[];
  publicSdkInstallationOrigins?: PublicSdkInstallationOriginRecord[];
  publicSdkBootstrapGrants?: PublicSdkBootstrapGrantRecord[];
  authoringAuthorizationRequests?: AuthoringAuthorizationRequestRecord[];
  authoringActivationGrants?: AuthoringActivationGrantRecord[];
  environmentTokens?: EnvironmentTokenRecord[];
  authoringSessions?: AuthoringSessionRecord[];
  documentVersions?: PersistedDocumentVersion[];
  compiledArtifacts?: PersistedCompiledArtifact[];
  publications?: PersistedPublication[];
  documentDeployments?: PersistedDocumentDeployment[];
  releaseOperations?: PersistedReleaseOperation[];
  themes?: WorkspaceThemeRecord[];
  themeVersions?: WorkspaceThemeVersionRecord[];
  visualCheckRuns?: VisualCheckRunRecord[];
  styleSources?: StyleSourceRecord[];
  productStyleApplications?: ProductStyleApplicationRecord[];
  brandDriftRuns?: BrandDriftRunRecord[];
  publicationVerifications?: PublicationVerificationRecord[];
  releaseApprovals?: ReleaseApprovalRecord[];
  analyticsEvents?: PersistedAnalyticsEventRecord[];
}

export function createInMemoryControlPlaneRepository(
  seed: InMemoryControlPlaneSeed = {},
): ControlPlaneRepository {
  return new InMemoryControlPlaneRepository(seed);
}

class InMemoryControlPlaneRepository implements ControlPlaneRepository {
  private readonly documents = new Map<string, PersistedDocument>();
  private readonly documentVersions = new Map<string, PersistedDocumentVersion[]>();
  private readonly environments = new Map<string, WorkspaceEnvironment>();
  private readonly publicSdkInstallations = new Map<string, PublicSdkInstallationRecord>();
  private readonly publicSdkInstallationOrigins: PublicSdkInstallationOriginRecord[] = [];
  private readonly publicSdkBootstrapGrants = new Map<string, PublicSdkBootstrapGrantRecord>();
  private readonly authoringAuthorizationRequests = new Map<
    string,
    AuthoringAuthorizationRequestRecord
  >();
  private readonly authoringActivationGrants = new Map<string, AuthoringActivationGrantRecord>();
  private readonly environmentTokens = new Map<string, EnvironmentTokenRecord>();
  private readonly authoringSessions = new Map<string, AuthoringSessionRecord>();
  private readonly users = new Map<string, UserRecord>();
  private readonly workspaces = new Map<
    string,
    { id: string; name: string; createdAt: string; updatedAt: string }
  >();
  private readonly workspaceMemberships = new Map<string, WorkspaceMembershipRecord>();
  private readonly passwordCredentials = new Map<string, PasswordCredentialRecord>();
  private readonly identitySessions = new Map<string, AuthSessionRecord>();
  private readonly emailVerificationChallenges = new Map<
    string,
    EmailVerificationChallengeRecord
  >();
  private readonly authOutbox = new Map<string, AuthOutboxRecord>();
  private readonly setPasswordChallenges = new Map<string, SetPasswordChallengeRecord>();
  private readonly setPasswordOutbox = new Map<string, SetPasswordOutboxRecord>();
  private readonly authRateLimits = new Map<
    string,
    { windowStartedAt: string; attempts: number; blockedUntil: string | null }
  >();
  private readonly themes = new Map<string, WorkspaceThemeRecord>();
  private readonly themeVersions = new Map<string, WorkspaceThemeVersionRecord[]>();
  private readonly visualCheckRuns = new Map<string, VisualCheckRunRecord[]>();
  private readonly styleSources = new Map<string, StyleSourceRecord[]>();
  private readonly productStyleApplications = new Map<string, ProductStyleApplicationRecord>();
  private readonly brandDriftRuns = new Map<string, BrandDriftRunRecord[]>();
  private readonly publicationVerifications = new Map<string, PublicationVerificationRecord[]>();
  private readonly releaseApprovals = new Map<string, ReleaseApprovalRecord[]>();
  private readonly publications = new Map<string, PersistedPublication[]>();
  private readonly compiledArtifactsByIdentity = new Map<string, PersistedCompiledArtifact>();
  private readonly compiledArtifactsById = new Map<string, PersistedCompiledArtifact>();
  private readonly documentDeployments = new Map<string, PersistedDocumentDeployment>();
  private readonly releaseOperations = new Map<string, PersistedReleaseOperation>();
  private readonly analyticsEvents: PersistedAnalyticsEventRecord[] = [];
  private readonly events: Array<{ workspaceId: string; event: AnalyticsEvent }> = [];

  constructor(seed: InMemoryControlPlaneSeed) {
    for (const environment of normalizeWorkspaceEnvironments(seed.environments ?? [])) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    for (const installation of seed.publicSdkInstallations ?? []) {
      this.publicSdkInstallations.set(installation.installationId, clone(installation));
    }
    for (const origin of seed.publicSdkInstallationOrigins ?? []) {
      this.publicSdkInstallationOrigins.push(clone(origin));
    }
    for (const grant of seed.publicSdkBootstrapGrants ?? []) {
      this.publicSdkBootstrapGrants.set(grant.id, clone(grant));
    }
    for (const request of seed.authoringAuthorizationRequests ?? []) {
      this.authoringAuthorizationRequests.set(request.requestId, clone(request));
    }
    for (const grant of seed.authoringActivationGrants ?? []) {
      this.authoringActivationGrants.set(grant.grantId, clone(grant));
    }
    for (const user of seed.users ?? []) {
      this.users.set(user.id, clone(user));
    }
    for (const workspace of seed.workspaces ?? []) {
      this.workspaces.set(workspace.id, clone(workspace));
    }
    for (const membership of seed.workspaceMemberships ?? []) {
      this.workspaceMemberships.set(
        this.key(membership.workspaceId, membership.userId),
        clone(membership),
      );
    }
    for (const credential of seed.passwordCredentials ?? []) {
      this.passwordCredentials.set(credential.emailNormalized, clone(credential));
    }
    for (const session of seed.authSessions ?? []) {
      this.identitySessions.set(session.tokenHash, clone(session));
    }
    for (const challenge of seed.emailVerificationChallenges ?? []) {
      this.emailVerificationChallenges.set(challenge.id, clone(challenge));
    }
    for (const message of seed.authOutbox ?? []) {
      this.authOutbox.set(message.id, clone(message));
    }
    for (const challenge of seed.setPasswordChallenges ?? []) {
      this.setPasswordChallenges.set(challenge.id, clone(challenge));
    }
    for (const message of seed.setPasswordOutbox ?? []) {
      this.setPasswordOutbox.set(message.id, clone(message));
    }
    for (const token of seed.environmentTokens ?? []) {
      this.environmentTokens.set(this.key(token.workspaceId, token.id), clone(token));
    }
    for (const session of seed.authoringSessions ?? []) {
      this.authoringSessions.set(this.key(session.workspaceId, session.id), clone(session));
    }
    for (const version of seed.themeVersions ?? []) {
      this.appendThemeVersion(version);
    }
    for (const theme of seed.themes ?? []) {
      this.themes.set(this.key(theme.workspaceId, theme.id), {
        ...clone(theme),
        activeVersion: this.findThemeVersion(theme.workspaceId, theme.id, theme.activeVersionId),
      });
    }
    for (const run of seed.visualCheckRuns ?? []) {
      this.appendVisualCheckRun(run);
    }
    for (const source of seed.styleSources ?? []) {
      this.appendStyleSource(source);
    }
    for (const application of seed.productStyleApplications ?? []) {
      const sources = (
        this.styleSources.get(this.key(application.workspaceId, application.themeId)) ?? []
      )
        .filter((source) => source.proposalId === application.receipt.proposalId)
        .sort(compareStyleSourceOrdinal);
      assertProductStyleApplicationIntegrity(application, sources);
      this.productStyleApplications.set(
        this.productStyleApplicationKey(
          application.workspaceId,
          application.themeId,
          application.receipt.proposalId,
        ),
        clone(application),
      );
    }
    for (const run of seed.brandDriftRuns ?? []) {
      this.appendBrandDriftRun(run);
    }
    for (const artifact of seed.compiledArtifacts ?? []) {
      this.rememberSeedArtifact(artifact);
    }
    for (const publication of seed.publications ?? []) {
      this.rememberSeedArtifact(publication.artifact);
      this.appendPublication(publication);
    }
    for (const deployment of seed.documentDeployments ?? []) {
      this.documentDeployments.set(
        this.key(deployment.workspaceId, deployment.environmentId, deployment.documentId),
        clone(deployment),
      );
    }
    for (const operation of seed.releaseOperations ?? []) {
      this.releaseOperations.set(this.releaseOperationKey(operation), clone(operation));
    }
    for (const verification of seed.publicationVerifications ?? []) {
      this.appendPublicationVerification(verification);
    }
    for (const approval of seed.releaseApprovals ?? []) {
      this.appendReleaseApproval(approval);
    }
    for (const event of seed.analyticsEvents ?? []) {
      const { id: _id, ingestedAt: _ingestedAt, ...authoritativeEvent } = event;
      assertAuthoritativeAnalyticsEvent(authoritativeEvent, event.workspaceId, event.environmentId);
      this.analyticsEvents.push(clone(event));
    }
    for (const version of seed.documentVersions ?? []) {
      this.appendDocumentVersion(version);
    }
    for (const document of seed.documents ?? []) {
      const documentKey = this.key(document.workspaceId, document.id);
      if (!this.documentVersions.has(documentKey)) {
        this.appendDocumentVersion({
          id: `${document.id}_v_1`,
          workspaceId: document.workspaceId,
          documentId: document.id,
          version: 1,
          canonical: clone(document),
          createdByUserId: null,
          createdAt: new Date().toISOString(),
        });
      }
      const latestArtifact = [...this.compiledArtifactsByIdentity.values()]
        .filter(
          (artifact) =>
            artifact.workspaceId === document.workspaceId && artifact.documentId === document.id,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      this.documents.set(this.key(document.workspaceId, document.id), {
        document: clone(document),
        createdByUserId: null,
        updatedByUserId: null,
        updatedAt: new Date().toISOString(),
        ...(latestArtifact ? { latestArtifact: clone(latestArtifact) } : {}),
      });
    }
  }

  async checkReadiness(): Promise<void> {
    // Construction is the readiness boundary for this dependency-free adapter.
  }

  async findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null> {
    const credential = this.passwordCredentials.get(emailNormalized);
    if (!credential || credential.emailLookupHash !== emailLookupHash) return null;
    return clone(credential);
  }

  async getIdentityUser(userId: string): Promise<UserRecord | null> {
    const user = this.users.get(userId);
    return user ? clone(user) : null;
  }

  async createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return false;
      throw error;
    }
    if (
      this.users.has(input.user.id) ||
      [...this.users.values()].some(
        (user) => normalizeIdentityEmail(user.email) === input.credential.emailNormalized,
      ) ||
      this.workspaces.has(input.workspace.id) ||
      this.passwordCredentials.has(input.credential.emailNormalized) ||
      [...this.passwordCredentials.values()].some(
        (credential) => credential.emailLookupHash === input.credential.emailLookupHash,
      ) ||
      (input.session ? this.identitySessions.has(input.session.tokenHash) : false) ||
      this.emailVerificationChallenges.has(input.emailVerificationChallenge.id) ||
      [...this.emailVerificationChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.emailVerificationChallenge.tokenHash,
      ) ||
      this.authOutbox.has(input.outboxMessage.id) ||
      input.membership.userId !== input.user.id ||
      input.membership.workspaceId !== input.workspace.id ||
      (input.session
        ? input.session.userId !== input.user.id ||
          input.session.activeWorkspaceId !== input.workspace.id
        : false) ||
      input.emailVerificationChallenge.userId !== input.user.id ||
      input.outboxMessage.userId !== input.user.id ||
      input.outboxMessage.payload.challengeId !== input.emailVerificationChallenge.id ||
      input.environments.some(
        (environment) =>
          environment.workspaceId !== input.workspace.id ||
          this.environments.has(this.key(environment.workspaceId, environment.id)),
      )
    ) {
      return false;
    }

    this.users.set(input.user.id, clone(input.user));
    this.workspaces.set(input.workspace.id, clone(input.workspace));
    this.passwordCredentials.set(input.credential.emailNormalized, clone(input.credential));
    this.workspaceMemberships.set(
      this.key(input.membership.workspaceId, input.membership.userId),
      clone(input.membership),
    );
    for (const environment of normalizeWorkspaceEnvironments(input.environments)) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    this.emailVerificationChallenges.set(
      input.emailVerificationChallenge.id,
      clone(input.emailVerificationChallenge),
    );
    this.authOutbox.set(input.outboxMessage.id, clone(input.outboxMessage));
    if (input.session) this.identitySessions.set(input.session.tokenHash, clone(input.session));
    return true;
  }

  async resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null> {
    const challenge = this.emailVerificationChallenges.get(challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== tokenHash ||
      challenge.usedAt ||
      challenge.expiresAt <= now
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || user.emailVerifiedAt) return null;
    return {
      userId: user.id,
      emailNormalized: normalizeIdentityEmail(user.email),
    };
  }

  async consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null> {
    const challenge = this.emailVerificationChallenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== input.tokenHash ||
      challenge.usedAt ||
      challenge.expiresAt <= input.usedAt
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || user.emailVerifiedAt) return null;
    const emailNormalized = normalizeIdentityEmail(user.email);
    const pendingCredential = [...this.passwordCredentials.values()].find(
      (credential) => credential.userId === user.id,
    );
    if (
      !pendingCredential ||
      pendingCredential.emailNormalized !== emailNormalized ||
      pendingCredential.emailLookupHash !== hashIdentityEmailLookup(emailNormalized)
    ) {
      return null;
    }

    const replacementCredential: PasswordCredentialRecord = {
      ...clone(input.credential),
      userId: user.id,
      emailNormalized,
      emailLookupHash: pendingCredential.emailLookupHash,
      createdAt: pendingCredential.createdAt,
    };
    this.emailVerificationChallenges.set(challenge.id, { ...challenge, usedAt: input.usedAt });
    this.passwordCredentials.set(emailNormalized, replacementCredential);
    const verifiedUser = { ...user, emailVerifiedAt: input.usedAt };
    this.users.set(user.id, verifiedUser);
    for (const [tokenHash, session] of this.identitySessions) {
      if (session.userId === user.id && session.revokedAt === null) {
        this.identitySessions.set(tokenHash, { ...session, revokedAt: input.usedAt });
      }
    }
    return clone(verifiedUser);
  }

  async requestSetPasswordChallenge(input: RequestSetPasswordChallengeInput): Promise<boolean> {
    if (
      input.emailNormalized !== normalizeIdentityEmail(input.emailNormalized) ||
      input.challenge.emailNormalized !== input.emailNormalized ||
      input.challenge.emailLookupHash !== input.emailLookupHash ||
      input.challenge.usedAt !== null ||
      input.outboxMessage.type !== 'set_password' ||
      input.outboxMessage.payload.purpose !== 'set_password' ||
      input.outboxMessage.payload.challengeId !== input.challenge.id ||
      this.setPasswordChallenges.has(input.challenge.id) ||
      [...this.setPasswordChallenges.values()].some(
        (challenge) => challenge.tokenHash === input.challenge.tokenHash,
      ) ||
      this.setPasswordOutbox.has(input.outboxMessage.id)
    ) {
      return false;
    }

    const matchingUsers = [...this.users.values()].filter(
      (user) => normalizeIdentityEmail(user.email) === input.emailNormalized,
    );
    // Legacy identities may contain duplicate normalized addresses. Never pick
    // one arbitrarily: a recovery request for anything but one exact match is a
    // generic no-op at the HTTP boundary.
    if (matchingUsers.length !== 1) return false;
    const [user] = matchingUsers;
    if (!user) return false;

    for (const [messageId, message] of this.setPasswordOutbox) {
      if (
        message.userId === user.id &&
        message.processedAt === null &&
        (message.terminalAt ?? null) === null
      ) {
        this.setPasswordOutbox.set(messageId, {
          ...message,
          terminalAt: input.challenge.createdAt,
          lastError: 'superseded',
        });
      }
    }
    for (const [challengeId, challenge] of this.setPasswordChallenges) {
      if (challenge.userId === user.id && challenge.usedAt === null) {
        this.setPasswordChallenges.set(challengeId, {
          ...challenge,
          usedAt: input.challenge.createdAt,
        });
      }
    }
    this.setPasswordChallenges.set(input.challenge.id, {
      ...clone(input.challenge),
      userId: user.id,
    });
    this.setPasswordOutbox.set(input.outboxMessage.id, {
      ...clone(input.outboxMessage),
      userId: user.id,
      recipientEmail: input.emailNormalized,
    });
    return true;
  }

  async resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null> {
    const challenge = this.setPasswordChallenges.get(challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== tokenHash ||
      challenge.usedAt !== null ||
      Date.parse(challenge.expiresAt) <= Date.parse(now)
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || normalizeIdentityEmail(user.email) !== challenge.emailNormalized) return null;
    return { userId: user.id, emailNormalized: challenge.emailNormalized };
  }

  async consumeSetPasswordChallenge(
    input: ConsumeSetPasswordChallengeInput,
  ): Promise<UserRecord | null> {
    const challenge = this.setPasswordChallenges.get(input.challengeId);
    if (
      !challenge ||
      challenge.tokenHash !== input.tokenHash ||
      challenge.usedAt !== null ||
      Date.parse(challenge.expiresAt) <= Date.parse(input.usedAt)
    ) {
      return null;
    }
    const user = this.users.get(challenge.userId);
    if (!user || normalizeIdentityEmail(user.email) !== challenge.emailNormalized) return null;

    const conflictingCredential = this.passwordCredentials.get(challenge.emailNormalized);
    const conflictingLookup = [...this.passwordCredentials.values()].find(
      (credential) => credential.emailLookupHash === challenge.emailLookupHash,
    );
    if (
      (conflictingCredential && conflictingCredential.userId !== user.id) ||
      (conflictingLookup && conflictingLookup.userId !== user.id)
    ) {
      return null;
    }

    const previousCredential = [...this.passwordCredentials.values()].find(
      (credential) => credential.userId === user.id,
    );
    const nextCredential: PasswordCredentialRecord = {
      ...clone(input.credential),
      userId: user.id,
      emailNormalized: challenge.emailNormalized,
      emailLookupHash: challenge.emailLookupHash,
      createdAt: previousCredential?.createdAt ?? input.credential.createdAt,
    };

    if (previousCredential) {
      this.passwordCredentials.delete(previousCredential.emailNormalized);
    }
    this.passwordCredentials.set(nextCredential.emailNormalized, nextCredential);

    const verifiedUser: UserRecord = {
      ...user,
      emailVerifiedAt: user.emailVerifiedAt ?? input.usedAt,
    };
    this.users.set(user.id, verifiedUser);

    for (const [tokenHash, session] of this.identitySessions) {
      if (session.userId === user.id && session.revokedAt === null) {
        this.identitySessions.set(tokenHash, { ...session, revokedAt: input.usedAt });
      }
    }
    for (const [challengeId, emailChallenge] of this.emailVerificationChallenges) {
      if (emailChallenge.userId === user.id && emailChallenge.usedAt === null) {
        this.emailVerificationChallenges.set(challengeId, {
          ...emailChallenge,
          usedAt: input.usedAt,
        });
      }
    }
    for (const [challengeId, passwordChallenge] of this.setPasswordChallenges) {
      if (passwordChallenge.userId === user.id && passwordChallenge.usedAt === null) {
        this.setPasswordChallenges.set(challengeId, {
          ...passwordChallenge,
          usedAt: input.usedAt,
        });
      }
    }
    for (const [messageId, message] of this.authOutbox) {
      if (
        message.userId === user.id &&
        message.processedAt === null &&
        (message.terminalAt ?? null) === null
      ) {
        this.authOutbox.set(messageId, {
          ...message,
          terminalAt: input.usedAt,
          lastError: 'challenge_consumed',
        });
      }
    }
    for (const [messageId, message] of this.setPasswordOutbox) {
      if (
        message.userId === user.id &&
        message.processedAt === null &&
        (message.terminalAt ?? null) === null
      ) {
        this.setPasswordOutbox.set(messageId, {
          ...message,
          terminalAt: input.usedAt,
          lastError: 'challenge_consumed',
        });
      }
    }
    return clone(verifiedUser);
  }

  async claimDue(input: ClaimDueAuthEmailRowsInput): Promise<readonly ClaimedAuthEmailOutboxRow[]> {
    const normalized = normalizeAuthEmailClaimInput(input);
    if (!normalized) return [];
    const dueRows = [
      ...[...this.authOutbox.values()].map((record) => ({
        purpose: 'email_verification' as const,
        record,
      })),
      ...[...this.setPasswordOutbox.values()].map((record) => ({
        purpose: 'set_password' as const,
        record,
      })),
    ]
      .filter(({ record }) => {
        const leaseVersion = record.leaseVersion ?? 0;
        return (
          record.processedAt === null &&
          (record.terminalAt ?? null) === null &&
          record.attempts < 20 &&
          leaseVersion < 2_147_483_647 &&
          Date.parse(record.availableAt) <= Date.parse(normalized.now)
        );
      })
      .sort((left, right) => compareInMemoryAuthEmailRows(left, right))
      .slice(0, normalized.limit);

    return dueRows.map((row) => {
      if (row.purpose === 'email_verification') {
        const claimed: AuthOutboxRecord & { leaseVersion: number } = {
          ...row.record,
          attempts: row.record.attempts + 1,
          leaseVersion: (row.record.leaseVersion ?? 0) + 1,
          availableAt: normalized.leaseExpiresAt,
        };
        this.authOutbox.set(claimed.id, claimed);
        return {
          id: claimed.id,
          recipientEmail: claimed.recipientEmail,
          purpose: row.purpose,
          challengeId: claimed.payload.challengeId,
          attempt: claimed.attempts,
          leaseVersion: claimed.leaseVersion,
        };
      }
      const claimed: SetPasswordOutboxRecord & { leaseVersion: number } = {
        ...row.record,
        attempts: row.record.attempts + 1,
        leaseVersion: (row.record.leaseVersion ?? 0) + 1,
        availableAt: normalized.leaseExpiresAt,
      };
      this.setPasswordOutbox.set(claimed.id, claimed);
      return {
        id: claimed.id,
        recipientEmail: claimed.recipientEmail,
        purpose: row.purpose,
        challengeId: claimed.payload.challengeId,
        attempt: claimed.attempts,
        leaseVersion: claimed.leaseVersion,
      };
    });
  }

  async acknowledge(input: AcknowledgeAuthEmailRowInput): Promise<boolean> {
    const processedAtMs = Date.parse(input.processedAt);
    if (!isValidAuthEmailLeaseMutation(input, processedAtMs)) return false;
    if (input.purpose === 'email_verification') {
      const record = this.authOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
      this.authOutbox.set(input.id, { ...record, processedAt: input.processedAt });
      return true;
    }
    const record = this.setPasswordOutbox.get(input.id);
    if (!isCurrentAuthEmailLease(record, input.leaseVersion, processedAtMs)) return false;
    this.setPasswordOutbox.set(input.id, { ...record, processedAt: input.processedAt });
    return true;
  }

  async retry(input: RetryAuthEmailRowInput): Promise<boolean> {
    const availableAtMs = input.availableAt ? Date.parse(input.availableAt) : null;
    if (
      !isValidAuthEmailLeaseMutation(input) ||
      input.terminal !== (input.availableAt === null) ||
      (availableAtMs !== null && !Number.isFinite(availableAtMs))
    ) {
      return false;
    }
    const failureCode = sanitizeAuthEmailFailureCode(input.failureCode);
    if (input.purpose === 'email_verification') {
      const record = this.authOutbox.get(input.id);
      if (!isCurrentAuthEmailLease(record, input.leaseVersion)) return false;
      this.authOutbox.set(input.id, {
        ...record,
        leaseVersion: input.leaseVersion + 1,
        lastError: failureCode,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
        terminalAt: input.terminal ? new Date().toISOString() : null,
      });
      return true;
    }
    const record = this.setPasswordOutbox.get(input.id);
    if (!isCurrentAuthEmailLease(record, input.leaseVersion)) return false;
    this.setPasswordOutbox.set(input.id, {
      ...record,
      leaseVersion: input.leaseVersion + 1,
      lastError: failureCode,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      terminalAt: input.terminal ? new Date().toISOString() : null,
    });
    return true;
  }

  async consumeAuthRateLimit(input: ConsumeAuthRateLimitInput): Promise<AuthRateLimitResult> {
    const current = this.authRateLimits.get(input.bucketHash);
    const nowMs = Date.parse(input.now);
    if (current?.blockedUntil && Date.parse(current.blockedUntil) > nowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((Date.parse(current.blockedUntil) - nowMs) / 1_000),
        ),
      };
    }
    const windowExpired = !current || Date.parse(current.windowStartedAt) + input.windowMs <= nowMs;
    const attempts = windowExpired ? 1 : current.attempts + 1;
    const blockedUntil =
      attempts > input.maxAttempts ? new Date(nowMs + input.blockMs).toISOString() : null;
    this.authRateLimits.set(input.bucketHash, {
      windowStartedAt: windowExpired ? input.now : current.windowStartedAt,
      attempts,
      blockedUntil,
    });
    return {
      allowed: blockedUntil === null,
      retryAfterSeconds: blockedUntil ? Math.max(1, Math.ceil(input.blockMs / 1_000)) : 0,
    };
  }

  async pruneAuthRateLimits(before: string, limit: number): Promise<number> {
    const candidates = [...this.authRateLimits.entries()]
      .filter(([, record]) => {
        const lastRelevantAt = record.blockedUntil ?? record.windowStartedAt;
        return lastRelevantAt < before;
      })
      .sort(([, left], [, right]) => left.windowStartedAt.localeCompare(right.windowStartedAt))
      .slice(0, Math.max(0, Math.min(limit, 100)));
    for (const [bucketHash] of candidates) this.authRateLimits.delete(bucketHash);
    return candidates.length;
  }

  async createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord> {
    if (!this.users.has(session.userId) || this.identitySessions.has(session.tokenHash)) {
      throw new Error('Unable to create auth session');
    }
    if (
      session.activeWorkspaceId &&
      !this.workspaceMemberships.has(this.key(session.activeWorkspaceId, session.userId))
    ) {
      throw new Error('Auth session active workspace requires membership');
    }
    this.identitySessions.set(session.tokenHash, clone(session));
    return clone(session);
  }

  async createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null> {
    const credential = [...this.passwordCredentials.values()].find(
      (candidate) => candidate.userId === input.session.userId,
    );
    const user = this.users.get(input.session.userId);
    if (
      !credential ||
      credential.algorithm !== 'argon2id-v1' ||
      credential.passwordHash !== input.expectedPasswordHash ||
      !user?.emailVerifiedAt
    ) {
      return null;
    }
    if (
      input.session.activeWorkspaceId &&
      !this.workspaceMemberships.has(
        this.key(input.session.activeWorkspaceId, input.session.userId),
      )
    ) {
      return null;
    }
    return this.createAuthSession(input.session);
  }

  async resolveAuthSession(tokenHash: string, now: string): Promise<AuthSessionRecord | null> {
    const session = this.identitySessions.get(tokenHash);
    if (
      !session ||
      session.revokedAt ||
      session.idleExpiresAt <= now ||
      session.absoluteExpiresAt <= now
    ) {
      return null;
    }
    return clone(session);
  }

  async touchAuthSession(
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): Promise<AuthSessionRecord | null> {
    const session = await this.resolveAuthSession(tokenHash, now);
    if (!session) return null;
    const next = {
      ...session,
      lastSeenAt: now,
      idleExpiresAt:
        idleExpiresAt < session.absoluteExpiresAt ? idleExpiresAt : session.absoluteExpiresAt,
    };
    this.identitySessions.set(tokenHash, next);
    return clone(next);
  }

  async rotateAuthSession(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null> {
    const current = this.identitySessions.get(input.currentTokenHash);
    if (
      !current ||
      current.revokedAt ||
      current.userId !== input.nextSession.userId ||
      current.idleExpiresAt <= input.nextSession.createdAt ||
      current.absoluteExpiresAt <= input.nextSession.createdAt
    ) {
      return null;
    }
    if (
      input.nextSession.activeWorkspaceId &&
      !this.workspaceMemberships.has(
        this.key(input.nextSession.activeWorkspaceId, input.nextSession.userId),
      )
    ) {
      return null;
    }
    const revokedAt = input.nextSession.createdAt;
    this.identitySessions.set(input.currentTokenHash, { ...current, revokedAt });
    this.identitySessions.set(input.nextSession.tokenHash, clone(input.nextSession));
    return clone(input.nextSession);
  }

  async revokeAuthSession(tokenHash: string, revokedAt: string): Promise<boolean> {
    const session = this.identitySessions.get(tokenHash);
    if (!session || session.revokedAt) return false;
    this.identitySessions.set(tokenHash, { ...session, revokedAt });
    return true;
  }

  async listIdentityWorkspaces(userId: string): Promise<IdentityWorkspaceRecord[]> {
    return [...this.workspaceMemberships.values()]
      .filter((membership) => membership.userId === userId)
      .flatMap((membership) => {
        const workspace = this.workspaces.get(membership.workspaceId);
        const role = identityWorkspaceRole(membership.role);
        return workspace && role
          ? [
              {
                id: workspace.id,
                name: workspace.name,
                role,
                createdAt: workspace.createdAt,
              },
            ]
          : [];
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createIdentityWorkspace(input: CreateIdentityWorkspaceInput): Promise<boolean> {
    try {
      assertValidWorkspaceEnvironmentPolicy(input.workspace.id, input.environments);
    } catch (error) {
      if (error instanceof WorkspaceEnvironmentPolicyInvalidError) return false;
      throw error;
    }
    if (
      !this.users.has(input.userId) ||
      this.workspaces.has(input.workspace.id) ||
      input.membership.userId !== input.userId ||
      input.membership.workspaceId !== input.workspace.id ||
      input.environments.some(
        (environment) =>
          environment.workspaceId !== input.workspace.id ||
          this.environments.has(this.key(environment.workspaceId, environment.id)),
      )
    ) {
      return false;
    }
    this.workspaces.set(input.workspace.id, clone(input.workspace));
    this.workspaceMemberships.set(
      this.key(input.membership.workspaceId, input.membership.userId),
      clone(input.membership),
    );
    for (const environment of normalizeWorkspaceEnvironments(input.environments)) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    return true;
  }

  async resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    const direct = this.workspaceMemberships.get(this.key(workspaceId, userId));
    return direct ? clone(direct) : null;
  }

  async listWorkspaceThemes(workspaceId: string): Promise<WorkspaceThemeRecord[]> {
    return [...this.themes.values()]
      .filter((theme) => theme.workspaceId === workspaceId)
      .map((theme) => this.hydrateTheme(theme))
      .sort(compareWorkspaceThemes);
  }

  async getWorkspaceTheme(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeRecord | null> {
    const theme = this.themes.get(this.key(workspaceId, themeId));
    return theme ? this.hydrateTheme(theme) : null;
  }

  async getDefaultWorkspaceTheme(workspaceId: string): Promise<WorkspaceThemeRecord | null> {
    const theme = [...this.themes.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.isDefault &&
        candidate.activeVersionId !== null,
    );
    return theme ? this.hydrateTheme(theme) : null;
  }

  async listWorkspaceThemeVersions(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeVersionRecord[]> {
    return (this.themeVersions.get(this.key(workspaceId, themeId)) ?? [])
      .map((version) => clone(version))
      .sort((left, right) => right.version - left.version);
  }

  async createWorkspaceTheme(input: CreateWorkspaceThemeInput): Promise<WorkspaceThemeRecord> {
    const name = normalizeWorkspaceThemeName(input.name);
    assertWorkspaceThemeDraft(input.draft);
    const now = new Date().toISOString();
    const theme: WorkspaceThemeRecord = {
      id: `theme_${randomUUID()}`,
      workspaceId: input.workspaceId,
      name,
      draft: clone(input.draft),
      revision: 1,
      isDefault: false,
      activeVersionId: null,
      activeVersion: null,
      createdByUserId: input.actorUserId,
      updatedByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.themes.set(this.key(input.workspaceId, theme.id), theme);
    return clone(theme);
  }

  async updateWorkspaceThemeDraft(
    input: UpdateWorkspaceThemeDraftInput,
  ): Promise<WorkspaceThemeRecord | null> {
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const key = this.key(input.workspaceId, input.themeId);
    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    const updated: WorkspaceThemeRecord = {
      ...current,
      name: input.name === undefined ? current.name : normalizeWorkspaceThemeName(input.name),
      draft: clone(input.draft),
      revision: current.revision + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: new Date().toISOString(),
    };
    this.themes.set(key, updated);
    return this.hydrateTheme(updated);
  }

  async applyProductStyleProposal(
    input: ApplyProductStyleProposalInput,
  ): Promise<ProductStyleProposalApplicationResult | null> {
    assertSafeProductStyleProposal(input.proposal);
    assertWorkspaceThemeDraft(input.draft);
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const proposalHash = productStyleProposalRequestHash(input);
    const key = this.key(input.workspaceId, input.themeId);
    const applicationKey = this.productStyleApplicationKey(
      input.workspaceId,
      input.themeId,
      input.proposal.proposalId,
    );
    const existingApplication = this.productStyleApplications.get(applicationKey);
    if (existingApplication) {
      const existingSources = (this.styleSources.get(key) ?? [])
        .filter((source) => source.proposalId === input.proposal.proposalId)
        .sort(compareStyleSourceOrdinal);
      assertProductStyleProposalReplay(input, proposalHash, existingApplication, existingSources);
      const current = this.themes.get(key);
      if (!current) return null;
      return {
        theme: this.hydrateTheme(current),
        sources: existingSources.map((source) => clone(source)),
        application: clone(existingApplication),
        draftChanged: existingApplication.receipt.draftChanged,
        replayed: true,
      };
    }

    const orphanedSources = (this.styleSources.get(key) ?? []).some(
      (source) => source.proposalId === input.proposal.proposalId,
    );
    if (orphanedSources) {
      throw new Error('Product match provenance exists without its canonical application receipt');
    }

    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    if (!this.workspaceMemberships.has(this.key(input.workspaceId, input.actorUserId))) {
      throw new Error('Product match actor is not a workspace member');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('environment not found in workspace');
    }

    const draftChanged = hashCanonicalJson(current.draft) !== hashCanonicalJson(input.draft);
    const now = new Date().toISOString();
    const appliedTheme: WorkspaceThemeRecord = draftChanged
      ? {
          ...current,
          draft: clone(input.draft),
          revision: current.revision + 1,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        }
      : current;
    const appliedThemeRevision = appliedTheme.revision;
    const sourceCount = input.proposal.sources.length;
    const sources = input.proposal.sources.map((source, sourceOrdinal): StyleSourceRecord => ({
      id: `style_source_${randomUUID()}`,
      workspaceId: input.workspaceId,
      themeId: input.themeId,
      environmentId: input.environmentId,
      proposalId: input.proposal.proposalId,
      proposalHash,
      sourceOrdinal,
      sourceCount,
      appliedThemeRevision,
      draftChanged,
      source: clone(source),
      sourceHash: hashCanonicalJson(source),
      createdByUserId: input.actorUserId,
      createdAt: now,
    }));
    const application = createProductStyleApplicationRecord({
      id: `product_style_application_${randomUUID()}`,
      input,
      requestHash: proposalHash,
      appliedTheme,
      sources,
      createdAt: now,
    });

    // Build every next collection before committing any map. This mirrors the
    // theme -> receipt -> provenance PostgreSQL transaction while keeping the
    // in-memory implementation all-or-nothing.
    const nextSources = [
      ...(this.styleSources.get(key) ?? []).map((source) => clone(source)),
      ...sources.map((source) => clone(source)),
    ];
    if (draftChanged) this.themes.set(key, appliedTheme);
    this.productStyleApplications.set(applicationKey, clone(application));
    this.styleSources.set(key, nextSources);
    return {
      theme: this.hydrateTheme(appliedTheme),
      sources: sources.map((source) => clone(source)),
      application: clone(application),
      draftChanged,
      replayed: false,
    };
  }

  async approveWorkspaceTheme(
    input: ApproveWorkspaceThemeInput,
  ): Promise<WorkspaceThemeApprovalResult | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const key = this.key(input.workspaceId, input.themeId);
    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    const versions = this.themeVersions.get(key) ?? [];
    const nextVersion = Math.max(0, ...versions.map((version) => version.version)) + 1;
    const now = new Date().toISOString();
    const approvedVersion = createWorkspaceThemeVersion(
      current,
      nextVersion,
      input.actorUserId,
      now,
    );
    this.appendThemeVersion(approvedVersion);
    const hasApprovedDefault = [...this.themes.values()].some(
      (theme) =>
        theme.workspaceId === input.workspaceId &&
        theme.isDefault &&
        theme.activeVersionId !== null,
    );
    const makeDefault = !hasApprovedDefault;
    if (makeDefault) {
      this.clearWorkspaceThemeDefault(input.workspaceId, input.actorUserId, now);
    }
    const updated: WorkspaceThemeRecord = {
      ...current,
      isDefault: makeDefault || current.isDefault,
      activeVersionId: approvedVersion.id,
      activeVersion: clone(approvedVersion),
      revision: current.revision + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.themes.set(key, updated);
    return { theme: clone(updated), approvedVersion: clone(approvedVersion) };
  }

  async setDefaultWorkspaceTheme(
    input: SetDefaultWorkspaceThemeInput,
  ): Promise<WorkspaceThemeRecord | null> {
    const expectedUpdatedAt = normalizeThemeGuardUpdatedAt(input);
    const key = this.key(input.workspaceId, input.themeId);
    const current = this.themes.get(key);
    if (!current) return null;
    assertWorkspaceThemeMutationGuard(current, input.expectedRevision, expectedUpdatedAt);
    if (!current.activeVersionId) {
      throw new WorkspaceThemeApprovalRequiredError(current.id);
    }
    if (current.isDefault) return this.hydrateTheme(current);

    const now = new Date().toISOString();
    this.clearWorkspaceThemeDefault(input.workspaceId, input.actorUserId, now);
    const updated: WorkspaceThemeRecord = {
      ...current,
      isDefault: true,
      revision: current.revision + 1,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    };
    this.themes.set(key, updated);
    return this.hydrateTheme(updated);
  }

  async listWorkspaceThemeImpact(
    workspaceId: string,
    themeId: string,
  ): Promise<WorkspaceThemeImpactRecord[]> {
    const impacts: WorkspaceThemeImpactRecord[] = [];
    for (const entry of this.documents.values()) {
      if (entry.document.workspaceId !== workspaceId) continue;
      const binding = themeImpactBinding(entry.document, themeId);
      if (!binding) continue;
      const activeEnvironmentIds = [...this.documentDeployments.values()]
        .filter(
          (deployment) =>
            deployment.workspaceId === workspaceId &&
            deployment.documentId === entry.document.id &&
            deployment.state === 'active',
        )
        .map((deployment) => deployment.environmentId)
        .sort();
      impacts.push({
        documentId: entry.document.id,
        title: entry.document.title,
        status: entry.document.status,
        ...binding,
        latestArtifactThemeVersionId: entry.latestArtifact?.themeVersionId ?? null,
        activeEnvironmentIds,
      });
    }
    return impacts.sort(compareWorkspaceThemeImpact);
  }

  async createStyleSource(input: CreateStyleSourceInput): Promise<StyleSourceRecord> {
    assertSafeStyleSource(input.source);
    if (!this.workspaceMemberships.has(this.key(input.workspaceId, input.actorUserId))) {
      throw new Error('style source creator is not a workspace member');
    }
    if (!this.themes.has(this.key(input.workspaceId, input.themeId))) {
      throw new Error('theme not found in workspace');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('environment not found in workspace');
    }
    const id = `style_source_${randomUUID()}`;
    const source: StyleSourceRecord = {
      id,
      workspaceId: input.workspaceId,
      themeId: input.themeId,
      environmentId: input.environmentId,
      proposalId: `standalone.${id}`,
      proposalHash: hashCanonicalJson({
        themeId: input.themeId,
        environmentId: input.environmentId,
        source: input.source,
      }),
      sourceOrdinal: 0,
      sourceCount: 1,
      appliedThemeRevision:
        this.themes.get(this.key(input.workspaceId, input.themeId))?.revision ?? 1,
      draftChanged: false,
      source: clone(input.source),
      sourceHash: hashCanonicalJson(input.source),
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendStyleSource(source);
    return clone(source);
  }

  async listStyleSources(workspaceId: string, themeId?: string): Promise<StyleSourceRecord[]> {
    return [...this.styleSources.values()]
      .flat()
      .filter(
        (source) => source.workspaceId === workspaceId && (!themeId || source.themeId === themeId),
      )
      .map((source) => clone(source))
      .sort(compareStyleSourceHistory);
  }

  async createBrandDriftRun(input: CreateBrandDriftRunInput): Promise<BrandDriftRunRecord> {
    assertBrandDriftReport(input.report);
    if (
      input.report.themeId !== input.themeId ||
      input.report.baselineThemeVersionId !== input.baselineThemeVersionId
    ) {
      throw new Error('Brand drift report theme identity does not match its persistence scope');
    }
    if (!this.workspaceMemberships.has(this.key(input.workspaceId, input.actorUserId))) {
      throw new Error('Brand drift creator is not a workspace member');
    }
    if (!this.documents.has(this.key(input.workspaceId, input.documentId))) {
      throw new Error('Brand drift document not found in workspace');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('Brand drift environment not found in workspace');
    }
    if (!this.findThemeVersion(input.workspaceId, input.themeId, input.baselineThemeVersionId)) {
      throw new Error('Brand drift baseline theme version not found in workspace');
    }
    const existing = (
      this.brandDriftRuns.get(this.key(input.workspaceId, input.documentId)) ?? []
    ).find((run) => run.id === input.report.checkId);
    if (existing) throw new Error('Brand drift check identity already exists');
    const run: BrandDriftRunRecord = {
      id: input.report.checkId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      themeId: input.themeId,
      baselineThemeVersionId: input.baselineThemeVersionId,
      trigger: input.report.trigger,
      classification: input.report.classification,
      confidence: input.report.confidence,
      report: clone(input.report),
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendBrandDriftRun(run);
    return clone(run);
  }

  async listBrandDriftRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<BrandDriftRunRecord[]> {
    return (this.brandDriftRuns.get(this.key(workspaceId, documentId)) ?? [])
      .map((run) => clone(run))
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    return [...this.documents.values()]
      .filter((entry) => entry.document.workspaceId === workspaceId)
      .map((entry) => ({
        id: entry.document.id,
        workspaceId: entry.document.workspaceId,
        type: entry.document.type,
        status: entry.document.status,
        title: entry.document.title,
        schemaVersion: entry.document.schemaVersion,
        createdByUserId: entry.createdByUserId,
        updatedByUserId: entry.updatedByUserId,
        updatedAt: entry.updatedAt,
        ...(entry.latestArtifact?.contentHash
          ? { latestContentHash: entry.latestArtifact.contentHash }
          : {}),
        publications: this.listDocumentPublicationSummaries(
          entry.document.workspaceId,
          entry.document.id,
        ),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null> {
    const entry = this.documents.get(this.key(workspaceId, documentId));
    return entry ? clone(entry) : null;
  }

  async listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]> {
    return (this.documentVersions.get(this.key(workspaceId, documentId)) ?? [])
      .map((version) => clone(version))
      .sort((a, b) => b.version - a.version);
  }

  async getDocumentVersion(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<PersistedDocumentVersion | null> {
    const version = (this.documentVersions.get(this.key(workspaceId, documentId)) ?? []).find(
      (candidate) => candidate.id === documentVersionId,
    );
    return version ? clone(version) : null;
  }

  async saveDocument(input: SaveDocumentInput): Promise<PersistedDocument> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);
    const now = new Date().toISOString();
    const existing = this.documents.get(this.key(input.workspaceId, input.document.id));
    const documentVersion = this.createDocumentVersion(input, now);
    const latestArtifact = input.artifact
      ? this.persistCompiledArtifact(
          input.workspaceId,
          input.document.id,
          documentVersion.id,
          input.artifact,
          now,
        )
      : existing?.latestArtifact;
    const next: PersistedDocument = {
      document: clone(input.document),
      createdByUserId: existing?.createdByUserId ?? input.actorUserId,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      ...(latestArtifact ? { latestArtifact: clone(latestArtifact) } : {}),
    };
    this.documents.set(this.key(input.workspaceId, input.document.id), next);
    return clone(next);
  }

  async getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null> {
    const artifacts = [...this.compiledArtifactsByIdentity.values()]
      .filter((artifact) => artifact.workspaceId === workspaceId)
      .sort(compareArtifactsNewestFirst);
    return artifacts[0] ? clone(artifacts[0]) : null;
  }

  async getCompiledArtifact(
    workspaceId: string,
    documentId: string,
    artifactId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const artifact = this.compiledArtifactsById.get(this.key(workspaceId, artifactId));
    return artifact?.documentId === documentId ? clone(artifact) : null;
  }

  async getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null> {
    const deployments = await this.listDocumentDeployments(workspaceId, environmentId);
    if (deployments.length === 0) {
      const latestLegacyPublication = this.getLatestLegacyPublication(workspaceId, environmentId);
      return latestLegacyPublication ? clone(latestLegacyPublication) : null;
    }

    const activeDeployments = deployments.filter((deployment) => deployment.state === 'active');
    if (activeDeployments.length === 0) return null;
    if (activeDeployments.length > 1) {
      throw new AmbiguousCurrentPublicationError(
        workspaceId,
        environmentId,
        activeDeployments.map((deployment) => deployment.documentId),
      );
    }

    const [activeDeployment] = activeDeployments;
    return activeDeployment ? this.requireDeploymentPublication(activeDeployment) : null;
  }

  async getDocumentDeployment(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDocumentDeployment | null> {
    const deployment = this.documentDeployments.get(
      this.key(workspaceId, environmentId, documentId),
    );
    return deployment ? clone(deployment) : null;
  }

  async listDocumentDeployments(
    workspaceId: string,
    environmentId?: string,
  ): Promise<PersistedDocumentDeployment[]> {
    return [...this.documentDeployments.values()]
      .filter(
        (deployment) =>
          deployment.workspaceId === workspaceId &&
          (environmentId === undefined || deployment.environmentId === environmentId),
      )
      .map((deployment) => clone(deployment))
      .sort(compareDeployments);
  }

  async listDocumentPublications(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedPublication[]> {
    return [...this.publications.values()]
      .flat()
      .filter(
        (publication) =>
          publication.workspaceId === workspaceId && publication.documentId === documentId,
      )
      .map((publication) => clone(publication))
      .sort(comparePublicationsNewestFirst);
  }

  async getPublicationById(
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null> {
    return this.findPublicationById(workspaceId, publicationId);
  }

  async getCurrentPublicationForDocument(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedPublication | null> {
    const deployment = await this.getDocumentDeployment(workspaceId, environmentId, documentId);
    if (!deployment || deployment.state === 'inactive') return null;
    return this.requireDeploymentPublication(deployment);
  }

  async getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const publication = await this.getCurrentPublication(workspaceId, environmentId);
    return publication ? clone(publication.artifact) : null;
  }

  async getReleaseOperation(
    workspaceId: string,
    environmentId: string,
    documentId: string,
    idempotencyKey: string,
  ): Promise<PersistedReleaseOperation | null> {
    const operation = this.releaseOperations.get(
      this.key(workspaceId, environmentId, documentId, idempotencyKey),
    );
    return operation ? clone(operation) : null;
  }

  async getReleaseOperationById(
    workspaceId: string,
    operationId: string,
  ): Promise<PersistedReleaseOperation | null> {
    const operation = [...this.releaseOperations.values()].find(
      (candidate) => candidate.workspaceId === workspaceId && candidate.id === operationId,
    );
    return operation ? clone(operation) : null;
  }

  async getReleaseRecoveryState(
    input: ReleaseRecoveryScopeInput,
  ): Promise<ReleaseRecoveryStateResponse | null> {
    const scope = this.resolveReleaseRecoveryScope(input);
    if (!scope) return null;

    const deployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.environmentId, input.documentId),
    );
    const history = this.buildReleaseRecoveryHistory(input);
    if (history.length > RELEASE_RECOVERY_HISTORY_MAX_ITEMS) {
      throw new ReleaseRecoveryHistoryLimitExceededError(history.length);
    }
    const snapshots = this.buildReleaseRecoveryPublicationSnapshots(input);
    const rollbackTargetPublicationIds = snapshots
      .filter(
        ({ publication, operation }) =>
          operation.status === 'completed' &&
          operation.resultGeneration !== null &&
          deployment?.state === 'active' &&
          operation.resultGeneration < deployment.generation &&
          publication.id !== deployment.activePublicationId &&
          isReleaseArtifactCurrentlyDeployable(publication.artifact),
      )
      .map(({ publication }) => publication.id)
      .sort();

    return clone({
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      permissions: releaseRecoveryPermissions(scope.environment, scope.membershipRole),
      deployment: deployment ?? null,
      history,
      rollbackTargetPublicationIds: [...new Set(rollbackTargetPublicationIds)],
    });
  }

  async recoverDocumentRelease(
    input: RecoverDocumentReleaseInput,
  ): Promise<ReleaseRecoveryResult | null> {
    const requestContract = validate(ReleaseRecoveryRequestSchema, input.request);
    if (!requestContract.valid) throw new Error('release recovery request is invalid');
    const request = requestContract.value;
    const scope = this.resolveReleaseRecoveryScope(input);
    if (!scope) return null;

    const operationKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.documentId,
      request.idempotencyKey,
    );
    const requestHash = createReleaseRecoveryRequestHash(input, request);
    const existingOperation = this.releaseOperations.get(operationKey);
    if (existingOperation) {
      if (!releaseRecoveryOperationMatchesRequest(existingOperation, input, request, requestHash)) {
        return createNonPersistingRecoveryFailure(request, 'idempotency_conflict');
      }
      if (
        existingOperation.status === 'activating' ||
        existingOperation.status === 'awaiting_approval'
      ) {
        return createNonPersistingRecoveryFailure(
          request,
          'release_operation_in_progress',
          existingOperation.id,
        );
      }
      const replay = this.releaseRecoveryResultFromOperation(existingOperation, true);
      return replay ?? createNonPersistingRecoveryFailure(request, 'internal_error');
    }

    const deploymentKey = this.key(input.workspaceId, input.environmentId, input.documentId);
    const deployment = this.documentDeployments.get(deploymentKey) ?? null;
    const occurredAt = new Date().toISOString();
    const newReleaseOperationId = `relop_${randomUUID()}`;
    const newPublicationId = request.action === 'rollback' ? `pub_${randomUUID()}` : undefined;
    const policyFailure = releaseRecoveryPolicyFailure(
      scope.environment,
      scope.membershipRole,
      input.actorUserId,
      request.action,
    );
    if (policyFailure) {
      const result = createPersistedRecoveryFailure(
        request,
        policyFailure,
        newReleaseOperationId,
        deployment,
      );
      this.persistFailedRecoveryOperation(
        input,
        request,
        requestHash,
        newReleaseOperationId,
        occurredAt,
        result,
      );
      return clone(result);
    }

    const publicationMaterials = this.buildReleaseRecoveryPublicationSnapshots(input);
    const publicationSnapshots = publicationMaterials.map(({ snapshot }) => snapshot);
    const operationSnapshots = this.buildReleaseRecoveryOperationSnapshots(input);
    const deployableRollbackTargetPublicationIds = new Set(
      publicationMaterials
        .filter(({ publication }) => isReleaseArtifactCurrentlyDeployable(publication.artifact))
        .map(({ publication }) => publication.id),
    );
    const decision =
      request.action === 'rollback'
        ? evaluateReleaseRecovery({
            workspaceId: input.workspaceId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            actorUserId: input.actorUserId,
            deployment,
            publications: publicationSnapshots,
            operations: operationSnapshots,
            request,
            newReleaseOperationId,
            newPublicationId: newPublicationId!,
            occurredAt,
            deployableRollbackTargetPublicationIds,
          })
        : evaluateReleaseRecovery({
            workspaceId: input.workspaceId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            actorUserId: input.actorUserId,
            deployment,
            publications: publicationSnapshots,
            operations: operationSnapshots,
            request,
            newReleaseOperationId,
            occurredAt,
          });

    if (decision.kind === 'replay') return clone(decision.result);
    if (decision.kind === 'reject') {
      if (decision.persistFailure) {
        this.persistFailedRecoveryOperation(
          input,
          request,
          requestHash,
          newReleaseOperationId,
          occurredAt,
          decision.result,
        );
      }
      return clone(decision.result);
    }

    const activePublicationId =
      deployment?.state === 'active' ? deployment.activePublicationId : null;
    if (!activePublicationId) {
      return createNonPersistingRecoveryFailure(request, 'internal_error');
    }
    if (decision.action === 'rollback') {
      const targetMaterial = publicationMaterials.find(
        ({ publication }) => publication.id === decision.publication.sourcePublicationId,
      );
      if (
        !targetMaterial ||
        targetMaterial.publication.compiledArtifactId !==
          decision.result.artifact.compiledArtifactId
      ) {
        return createNonPersistingRecoveryFailure(request, 'internal_error');
      }
      const publication: PersistedPublication = {
        id: decision.publication.id,
        workspaceId: input.workspaceId,
        correlationId: request.correlationId,
        environmentId: input.environmentId,
        environment: scope.environment.kind,
        documentId: input.documentId,
        documentVersionId: targetMaterial.publication.documentVersionId,
        compiledArtifactId: targetMaterial.publication.compiledArtifactId,
        contentHash: targetMaterial.publication.contentHash,
        action: 'rollback',
        sourcePublicationId: targetMaterial.publication.id,
        previousPublicationId: activePublicationId,
        releaseOperationId: newReleaseOperationId,
        publishedByUserId: input.actorUserId,
        publishedAt: occurredAt,
        artifact: clone(targetMaterial.publication.artifact),
      };
      this.appendPublication(publication);
    }
    this.documentDeployments.set(deploymentKey, clone(decision.deployment));
    this.releaseOperations.set(
      operationKey,
      createCompletedRecoveryOperation(input, request, requestHash, decision.result, occurredAt),
    );
    return clone(decision.result);
  }

  async publishCompiledArtifact(
    input: PublishCompiledArtifactInput,
  ): Promise<PersistedPublication> {
    return this.createPublication(input, LEGACY_PUBLICATION_PROVENANCE);
  }

  async activateCompiledArtifact(
    input: ActivateCompiledArtifactInput,
  ): Promise<ReleaseActivationResult> {
    assertReleaseMutationGuardInput(input);
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);
    const operationKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.artifact.documentId,
      input.idempotencyKey,
    );
    const existingOperation = this.releaseOperations.get(operationKey);
    if (existingOperation) {
      return this.resolveExistingReleaseOperation(input, existingOperation);
    }
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) throw new Error('environment not found in workspace');
    const environmentPolicy = assertEnvironmentPolicyMutationAllowed(environment, {
      action: 'direct-publish',
      expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
    });
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !membership ||
      !environmentPolicy.releasePolicy.publisherRoles.some((role) => role === membership.role)
    ) {
      throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
    }

    const createdAt = new Date().toISOString();
    const action = input.action ?? 'publish';
    const sourcePublicationId = input.sourcePublicationId ?? null;
    const operation: PersistedReleaseOperation = {
      id: `relop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.artifact.documentId,
      action,
      requestedArtifactId: input.artifact.id,
      requestedSourcePublicationId: null,
      requestedActivePublicationId: null,
      actualActivePublicationId: null,
      sourcePublicationId,
      expectedGeneration: input.expectedGeneration,
      resultGeneration: null,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      status: 'activating',
      correlationId: input.correlationId,
      requestedByUserId: input.actorUserId,
      resultPublicationId: null,
      reason: null,
      errorCode: null,
      createdAt,
      completedAt: null,
    };
    this.releaseOperations.set(operationKey, operation);

    const deploymentKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.artifact.documentId,
    );
    const currentDeployment = this.documentDeployments.get(deploymentKey);
    const actualGeneration = currentDeployment?.generation ?? 0;
    if (actualGeneration !== input.expectedGeneration) {
      const failedOperation = {
        ...operation,
        status: 'failed' as const,
        errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
        resultGeneration: actualGeneration,
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      throw new DeploymentChangedError(input.expectedGeneration, actualGeneration);
    }

    try {
      const previousPublicationId =
        currentDeployment?.state === 'active' ? currentDeployment.activePublicationId : null;
      const publication = this.createPublication(input, {
        action,
        sourcePublicationId,
        previousPublicationId,
        releaseOperationId: operation.id,
      });
      const deployment: PersistedDocumentDeployment = {
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: publication.documentId,
        state: 'active',
        activePublicationId: publication.id,
        pendingReleaseOperationId: null,
        generation: actualGeneration + 1,
        updatedAt: publication.publishedAt,
      };
      this.documentDeployments.set(deploymentKey, deployment);
      const completedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'completed',
        resultGeneration: deployment.generation,
        resultPublicationId: publication.id,
        completedAt: publication.publishedAt,
      };
      this.releaseOperations.set(operationKey, completedOperation);
      return {
        operation: clone(completedOperation),
        publication,
        deployment: clone(deployment),
        replayed: false,
      };
    } catch (error) {
      const failedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'failed',
        errorCode: 'release_activation_failed',
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      throw error;
    }
  }

  async createPublicationVerification(
    input: CreatePublicationVerificationInput,
  ): Promise<PublicationVerificationRecord> {
    assertBrowserVerificationReport(input.report);
    const verifiedOrigin = requireExactHttpOrigin(input.verifiedOrigin);
    const verifierMembership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (!verifierMembership || !hasAuthoringWorkspaceRole(verifierMembership.role)) {
      throw new Error('publication verifier is not a workspace member');
    }
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment || environment.enabled === false || environment.kind !== 'staging') {
      throw new Error('publication verification requires a staging environment');
    }
    if (!environment.originAllowlist.includes(verifiedOrigin)) {
      throw new Error('publication verification origin is not allowlisted for the environment');
    }
    const deployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.environmentId, input.documentId),
    );
    const actualPublicationId =
      deployment?.state === 'active' ? deployment.activePublicationId : null;
    if (actualPublicationId !== input.expectedPublicationId) {
      throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
    }
    const publication = deployment ? this.requireDeploymentPublication(deployment) : null;
    if (!publication || publication.id !== input.expectedPublicationId) {
      throw new ActivePublicationChangedError(input.expectedPublicationId, actualPublicationId);
    }

    const verification: PublicationVerificationRecord = {
      id: `pubverify_${randomUUID()}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
      publicationId: publication.id,
      result: input.report.status === 'failed' ? 'failed' : 'passed',
      report: clone(input.report),
      verifiedOrigin,
      verifiedByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendPublicationVerification(verification);
    return clone(verification);
  }

  async listPublicationVerifications(
    workspaceId: string,
    publicationId: string,
  ): Promise<PublicationVerificationRecord[]> {
    return (this.publicationVerifications.get(this.key(workspaceId, publicationId)) ?? [])
      .map((verification) => clone(verification))
      .sort(compareAppendOnlyRecordsNewestFirst);
  }

  async createReleaseApproval(input: CreateReleaseApprovalInput): Promise<ReleaseApprovalRecord> {
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
      throw new Error('release approval decision must be approved or rejected');
    }
    const reason = normalizeReleaseApprovalReason(input.reason);
    const operation = [...this.releaseOperations.values()].find(
      (candidate) =>
        candidate.workspaceId === input.workspaceId && candidate.id === input.releaseOperationId,
    );
    if (!operation || operation.action !== 'promote') {
      throw new Error('promotion release operation not found in workspace');
    }
    const existing = (
      this.releaseApprovals.get(this.key(input.workspaceId, operation.id)) ?? []
    ).find((approval) => approval.decidedByUserId === input.actorUserId);
    if (
      operation.status === 'failed' &&
      operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE &&
      existing?.decision === input.decision &&
      existing.reason === reason
    ) {
      return clone(existing);
    }
    if (operation.status !== 'awaiting_approval') {
      throw new Error('release operation is not awaiting approval');
    }
    const approverMembership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !approverMembership ||
      (approverMembership.role !== 'owner' && approverMembership.role !== 'admin')
    ) {
      throw new Error('release approver is not a workspace member');
    }
    const targetEnvironment = this.environments.get(
      this.key(input.workspaceId, operation.environmentId),
    );
    if (!targetEnvironment) throw new Error('promotion target environment not found');
    let targetPolicy = assertEnvironmentPolicySnapshot(
      targetEnvironment,
      input.expectedEnvironmentPolicyUpdatedAt,
    );
    if (input.decision === 'approved') {
      if (!operation.requestedByUserId || !operation.sourcePublicationId) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }
      const sourcePublication = this.findPublicationById(
        input.workspaceId,
        operation.sourcePublicationId,
      );
      const sourceEnvironment = sourcePublication
        ? this.environments.get(this.key(input.workspaceId, sourcePublication.environmentId))
        : null;
      if (!sourcePublication || !sourceEnvironment || sourceEnvironment.enabled === false) {
        throw new EnvironmentPolicyMutationForbiddenError('promotion_source_mismatch');
      }
      targetPolicy = assertEnvironmentPolicyMutationAllowed(targetEnvironment, {
        action: 'promote',
        sourceEnvironmentId: sourcePublication.environmentId,
        expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
      });
      const requesterMembership = operation.requestedByUserId
        ? this.workspaceMemberships.get(this.key(input.workspaceId, operation.requestedByUserId))
        : null;
      if (
        !requesterMembership ||
        !targetPolicy.releasePolicy.publisherRoles.some((role) => role === requesterMembership.role)
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }
      if (
        targetPolicy.releasePolicy.separationOfDuties.requireSeparateApprover &&
        input.actorUserId === operation.requestedByUserId
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('separation_of_duties_required');
      }
    }
    if (existing) {
      if (existing.decision === input.decision && existing.reason === reason) {
        return clone(existing);
      }
      throw new Error('release approver already recorded an immutable decision');
    }
    const approval: ReleaseApprovalRecord = {
      id: `relapproval_${randomUUID()}`,
      workspaceId: input.workspaceId,
      releaseOperationId: operation.id,
      decision: input.decision,
      reason,
      decidedByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendReleaseApproval(approval);
    if (input.decision === 'rejected') {
      this.failPromotionOperation(
        this.releaseOperationKey(operation),
        operation,
        RELEASE_APPROVAL_REJECTED_ERROR_CODE,
      );
    }
    return clone(approval);
  }

  async listReleaseApprovals(
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<ReleaseApprovalRecord[]> {
    return (this.releaseApprovals.get(this.key(workspaceId, releaseOperationId)) ?? [])
      .map((approval) => clone(approval))
      .sort(compareAppendOnlyRecordsNewestFirst);
  }

  async promoteVerifiedPublication(
    input: PromoteVerifiedPublicationInput,
  ): Promise<PromotionResult> {
    assertReleaseMutationGuardInput(input);
    if (!input.expectedSourcePublicationId.trim()) {
      throw new Error('promotion requires an expected source publication');
    }
    const sourceEnvironment = this.environments.get(
      this.key(input.workspaceId, input.sourceEnvironmentId),
    );
    const targetEnvironment = this.environments.get(
      this.key(input.workspaceId, input.targetEnvironmentId),
    );
    if (!sourceEnvironment || sourceEnvironment.kind !== 'staging') {
      throw new Error('production promotion source must be staging');
    }
    if (!targetEnvironment || targetEnvironment.kind !== 'production') {
      throw new Error('production promotion target must be production');
    }
    const operationKey = this.key(
      input.workspaceId,
      input.targetEnvironmentId,
      input.documentId,
      input.idempotencyKey,
    );
    let operation = this.releaseOperations.get(operationKey);
    const replayedRequest = Boolean(operation);
    if (operation) {
      this.assertMatchingPromotionRequest(input, operation);
      if (operation.status === 'completed') {
        return this.replayCompletedPromotion(
          operation,
          targetEnvironment.requiredApprovalCount ?? 0,
        );
      }
      if (operation.status === 'activating') {
        throw new ReleaseOperationInProgressError(input.idempotencyKey);
      }
      if (operation.status === 'failed') {
        if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
          throw new DeploymentChangedError(
            operation.expectedGeneration,
            operation.resultGeneration ?? 0,
          );
        }
        if (operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE) {
          throw new ReleaseApprovalRejectedError(operation.id);
        }
        if (operation.errorCode === ACTIVE_PUBLICATION_CHANGED_ERROR_CODE) {
          const deployment = this.documentDeployments.get(
            this.key(input.workspaceId, input.sourceEnvironmentId, input.documentId),
          );
          throw new ActivePublicationChangedError(
            input.expectedSourcePublicationId,
            deployment?.state === 'active' ? deployment.activePublicationId : null,
          );
        }
        throw new Error(operation.errorCode ?? 'promotion operation failed');
      }
    }

    const sourcePolicy = normalizeWorkspaceEnvironments([sourceEnvironment])[0];
    if (!sourcePolicy?.enabled) {
      throw new EnvironmentPolicyMutationForbiddenError('environment_disabled');
    }
    const targetPolicy = assertEnvironmentPolicyMutationAllowed(targetEnvironment, {
      action: 'promote',
      sourceEnvironmentId: input.sourceEnvironmentId,
      expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
    });
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !membership ||
      !targetPolicy.releasePolicy.publisherRoles.some((role) => role === membership.role)
    ) {
      throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
    }

    const sourceDeployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.sourceEnvironmentId, input.documentId),
    );
    const activeSourcePublicationId =
      sourceDeployment?.state === 'active' ? sourceDeployment.activePublicationId : null;
    if (activeSourcePublicationId !== input.expectedSourcePublicationId) {
      if (operation) {
        this.failPromotionOperation(operationKey, operation, ACTIVE_PUBLICATION_CHANGED_ERROR_CODE);
      }
      throw new ActivePublicationChangedError(
        input.expectedSourcePublicationId,
        activeSourcePublicationId,
      );
    }
    const sourcePublication = sourceDeployment
      ? this.requireDeploymentPublication(sourceDeployment)
      : null;
    if (!sourcePublication || sourcePublication.id !== input.expectedSourcePublicationId) {
      if (operation) {
        this.failPromotionOperation(operationKey, operation, ACTIVE_PUBLICATION_CHANGED_ERROR_CODE);
      }
      throw new ActivePublicationChangedError(
        input.expectedSourcePublicationId,
        activeSourcePublicationId,
      );
    }
    if (operation && operation.requestedArtifactId !== sourcePublication.compiledArtifactId) {
      this.failPromotionOperation(operationKey, operation, 'promotion_artifact_pin_mismatch');
      throw new Error('promotion operation artifact pin does not match its source publication');
    }
    const latestVerification = [
      ...(this.publicationVerifications.get(this.key(input.workspaceId, sourcePublication.id)) ??
        []),
    ].sort(compareAppendOnlyRecordsNewestFirst)[0];
    if (!latestVerification || latestVerification.result !== 'passed') {
      throw new PublicationVerificationRequiredError(sourcePublication.id);
    }

    const deploymentKey = this.key(input.workspaceId, input.targetEnvironmentId, input.documentId);
    const targetDeployment = this.documentDeployments.get(deploymentKey);
    const actualGeneration = targetDeployment?.generation ?? 0;
    const requiredApprovalCount = targetEnvironment.requiredApprovalCount ?? 0;
    if (!operation && targetDeployment?.pendingReleaseOperationId) {
      const pendingOperation = [...this.releaseOperations.values()].find(
        (candidate) =>
          candidate.workspaceId === input.workspaceId &&
          candidate.id === targetDeployment.pendingReleaseOperationId,
      );
      const staleSource =
        pendingOperation?.status === 'awaiting_approval' &&
        pendingOperation.sourcePublicationId !== sourcePublication.id;
      if (!pendingOperation || !staleSource) {
        throw new ReleaseOperationInProgressError(input.idempotencyKey);
      }
      this.failPromotionOperation(
        this.releaseOperationKey(pendingOperation),
        pendingOperation,
        ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
      );
    }
    if (!operation) {
      const createdAt = new Date().toISOString();
      const deploymentChanged = actualGeneration !== input.expectedGeneration;
      let status: PersistedReleaseOperation['status'] = 'activating';
      if (deploymentChanged) status = 'failed';
      else if (requiredApprovalCount > 0) status = 'awaiting_approval';
      operation = {
        id: `relop_${randomUUID()}`,
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        documentId: input.documentId,
        action: 'promote',
        requestedArtifactId: sourcePublication.compiledArtifactId,
        requestedSourcePublicationId: null,
        requestedActivePublicationId: null,
        actualActivePublicationId: null,
        sourcePublicationId: sourcePublication.id,
        expectedGeneration: input.expectedGeneration,
        resultGeneration: deploymentChanged ? actualGeneration : null,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        status,
        correlationId: input.correlationId,
        requestedByUserId: input.actorUserId,
        resultPublicationId: null,
        reason: null,
        errorCode: deploymentChanged ? DEPLOYMENT_CHANGED_ERROR_CODE : null,
        createdAt,
        completedAt: deploymentChanged ? createdAt : null,
      };
      this.releaseOperations.set(operationKey, operation);
      if (deploymentChanged) {
        throw new DeploymentChangedError(input.expectedGeneration, actualGeneration);
      }
    }

    const approvals = this.releaseApprovals.get(this.key(input.workspaceId, operation.id)) ?? [];
    if (approvals.some((approval) => approval.decision === 'rejected')) {
      const failedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'failed',
        errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      const pendingDeployment = this.documentDeployments.get(deploymentKey);
      if (pendingDeployment?.pendingReleaseOperationId === operation.id) {
        this.documentDeployments.set(deploymentKey, {
          ...pendingDeployment,
          pendingReleaseOperationId: null,
          updatedAt: failedOperation.completedAt ?? pendingDeployment.updatedAt,
        });
      }
      throw new ReleaseApprovalRejectedError(operation.id);
    }
    const approvalCount = approvals.filter((approval) => approval.decision === 'approved').length;
    if (approvalCount < requiredApprovalCount) {
      const awaitingOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'awaiting_approval',
      };
      this.releaseOperations.set(operationKey, awaitingOperation);
      const updatedAt = new Date().toISOString();
      const pendingDeployment: PersistedDocumentDeployment =
        targetDeployment?.state === 'active'
          ? {
              workspaceId: input.workspaceId,
              environmentId: input.targetEnvironmentId,
              documentId: input.documentId,
              state: 'active',
              activePublicationId: targetDeployment.activePublicationId,
              pendingReleaseOperationId: awaitingOperation.id,
              generation: actualGeneration,
              updatedAt,
            }
          : {
              workspaceId: input.workspaceId,
              environmentId: input.targetEnvironmentId,
              documentId: input.documentId,
              state: 'inactive',
              activePublicationId: null,
              pendingReleaseOperationId: awaitingOperation.id,
              generation: actualGeneration,
              updatedAt,
            };
      this.documentDeployments.set(deploymentKey, pendingDeployment);
      return {
        operation: clone(awaitingOperation),
        sourcePublication,
        publication: null,
        deployment: null,
        approvalCount,
        requiredApprovalCount,
        replayed: replayedRequest,
      };
    }

    const currentTargetDeployment = this.documentDeployments.get(deploymentKey);
    const currentGeneration = currentTargetDeployment?.generation ?? 0;
    if (currentGeneration !== input.expectedGeneration) {
      const failedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'failed',
        resultGeneration: currentGeneration,
        errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      throw new DeploymentChangedError(input.expectedGeneration, currentGeneration);
    }
    const activatingOperation: PersistedReleaseOperation = {
      ...operation,
      status: 'activating',
    };
    this.releaseOperations.set(operationKey, activatingOperation);
    const publication = this.createPublication(
      {
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        correlationId: input.correlationId,
        artifact: sourcePublication.artifact,
        actorUserId: input.actorUserId,
      },
      {
        action: 'promote',
        sourcePublicationId: sourcePublication.id,
        previousPublicationId:
          currentTargetDeployment?.state === 'active'
            ? currentTargetDeployment.activePublicationId
            : null,
        releaseOperationId: activatingOperation.id,
      },
    );
    const deployment: PersistedDocumentDeployment = {
      workspaceId: input.workspaceId,
      environmentId: input.targetEnvironmentId,
      documentId: input.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: currentGeneration + 1,
      updatedAt: publication.publishedAt,
    };
    this.documentDeployments.set(deploymentKey, deployment);
    const completedOperation: PersistedReleaseOperation = {
      ...activatingOperation,
      status: 'completed',
      resultGeneration: deployment.generation,
      resultPublicationId: publication.id,
      errorCode: null,
      completedAt: publication.publishedAt,
    };
    this.releaseOperations.set(operationKey, completedOperation);
    return {
      operation: clone(completedOperation),
      sourcePublication,
      publication,
      deployment: clone(deployment),
      approvalCount,
      requiredApprovalCount,
      replayed: false,
    };
  }

  async listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]> {
    const normalized = normalizeWorkspaceEnvironments(
      [...this.environments.values()].filter(
        (environment) => environment.workspaceId === workspaceId,
      ),
    );
    if (normalized.length > 0 && this.workspaces.has(workspaceId)) {
      assertValidWorkspaceEnvironmentPolicy(workspaceId, normalized);
    }
    return normalized.map((environment) => clone(environment));
  }

  async updateEnvironmentReleasePolicy(
    input: UpdateEnvironmentReleasePolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    assertRequiredApprovalCount(input.requiredApprovalCount);
    const key = this.key(input.workspaceId, input.environmentId);
    const current = this.environments.get(key);
    if (!current) return null;
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'environment release policy expectedUpdatedAt',
    );
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, current.updatedAt);
    }
    const updated: WorkspaceEnvironment = {
      ...current,
      requiredApprovalCount: input.requiredApprovalCount,
      releasePolicy: {
        ...(current.releasePolicy ?? createDefaultEnvironmentReleasePolicy(current.kind)),
        requiredApprovalCount: input.requiredApprovalCount,
      },
      updatedAt: new Date().toISOString(),
    };
    this.environments.set(key, updated);
    return (
      normalizeWorkspaceEnvironments([updated]).map((environment) => clone(environment))[0] ?? null
    );
  }

  async updateWorkspaceEnvironmentPolicy(
    input: UpdateWorkspaceEnvironmentPolicyInput,
  ): Promise<WorkspaceEnvironment | null> {
    const key = this.key(input.workspaceId, input.environmentId);
    const current = this.environments.get(key);
    if (!current) return null;
    const expectedUpdatedAt = normalizeIsoTimestamp(
      input.expectedUpdatedAt,
      'workspace environment policy expectedUpdatedAt',
    );
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new EnvironmentReleasePolicyChangedError(expectedUpdatedAt, current.updatedAt);
    }
    const candidate: WorkspaceEnvironment = {
      ...current,
      name: input.name,
      originAllowlist: [...input.originAllowlist],
      requiredApprovalCount: input.releasePolicy.requiredApprovalCount,
      enabled: input.enabled,
      pipelinePosition: input.pipelinePosition,
      authoringEnabled: input.authoringEnabled,
      releasePolicy: clone(input.releasePolicy),
      updatedAt: new Date().toISOString(),
    };
    if (input.promotionSourceEnvironmentId) {
      candidate.promotionSourceEnvironmentId = input.promotionSourceEnvironmentId;
    } else {
      delete candidate.promotionSourceEnvironmentId;
    }
    const workspaceRows = [...this.environments.values()].filter(
      (environment) => environment.workspaceId === input.workspaceId,
    );
    const candidates = workspaceRows.map((environment) =>
      environment.id === input.environmentId ? candidate : environment,
    );
    assertValidWorkspaceEnvironmentPolicy(input.workspaceId, candidates);
    this.environments.set(key, candidate);
    return (
      normalizeWorkspaceEnvironments(candidates)
        .filter((environment) => environment.id === input.environmentId)
        .map((environment) => clone(environment))[0] ?? null
    );
  }

  async listPublicSdkInstallations(
    workspaceId: string,
  ): Promise<PublicSdkInstallationWithOrigins[]> {
    return [...this.publicSdkInstallations.values()]
      .filter((installation) => installation.workspaceId === workspaceId)
      .map((installation) => ({
        ...clone(installation),
        origins: this.publicSdkInstallationOrigins
          .filter(
            (origin) =>
              origin.workspaceId === workspaceId &&
              origin.installationId === installation.installationId,
          )
          .map((origin) => clone(origin))
          .sort(comparePublicSdkInstallationOrigins),
      }))
      .sort(comparePublicSdkInstallations);
  }

  async getOrCreatePublicSdkInstallation(
    input: GetOrCreatePublicSdkInstallationInput,
  ): Promise<PublicSdkInstallationRecord> {
    assertPublicSdkInstallationId(input.installationId);
    const existing = this.publicSdkInstallations.get(input.installationId);
    if (existing?.workspaceId === input.workspaceId && !existing.revokedAt) {
      return clone(existing);
    }
    if (existing) {
      throw new Error('public SDK installation id already exists');
    }

    const now = new Date().toISOString();
    const installation: PublicSdkInstallationRecord = {
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      name: input.name,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    };
    this.publicSdkInstallations.set(installation.installationId, installation);
    return clone(installation);
  }

  async setPublicSdkInstallationOrigin(
    input: SetPublicSdkInstallationOriginInput,
  ): Promise<PublicSdkInstallationOriginRecord> {
    const installation = this.publicSdkInstallations.get(input.installationId);
    if (!installation || installation.workspaceId !== input.workspaceId || installation.revokedAt) {
      throw new Error('active public SDK installation not found in workspace');
    }
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) throw new Error('environment not found in workspace');
    assertPublicSdkInstallationEnvironmentPolicy(environment, input.authoringEnabled);
    const exactOrigin = requireExactHttpOrigin(input.origin);
    assertPublicSdkInstallationOriginPolicy(environment.kind, exactOrigin, input.authoringEnabled);
    assertPublicSdkInstallationEnvironmentOrigin(environment, exactOrigin);
    const now = new Date().toISOString();
    const existingIndex = this.publicSdkInstallationOrigins.findIndex(
      (candidate) =>
        candidate.installationId === input.installationId && candidate.exactOrigin === exactOrigin,
    );
    const existing = this.publicSdkInstallationOrigins[existingIndex];
    if (
      existing &&
      (existing.environmentId !== input.environmentId ||
        existing.authoringEnabled !== input.authoringEnabled)
    ) {
      this.invalidateAuthoringSessionsForInstallationOrigin(
        input.workspaceId,
        input.installationId,
        exactOrigin,
      );
    }
    const mapping: PublicSdkInstallationOriginRecord = {
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      exactOrigin,
      authoringEnabled: input.authoringEnabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existingIndex === -1) {
      this.publicSdkInstallationOrigins.push(mapping);
    } else {
      this.publicSdkInstallationOrigins.splice(existingIndex, 1, mapping);
    }
    return clone(mapping);
  }

  async syncPublicSdkInstallationOrigins(
    input: SyncPublicSdkInstallationOriginsInput,
  ): Promise<PublicSdkInstallationOriginRecord[]> {
    if (input.origins.length > 100) {
      throw new Error('public SDK installation origin sync exceeds the maximum mapping count');
    }
    const installation = this.publicSdkInstallations.get(input.installationId);
    if (!installation || installation.workspaceId !== input.workspaceId || installation.revokedAt) {
      throw new Error('active public SDK installation not found in workspace');
    }

    const now = new Date().toISOString();
    const existingOrigins = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.workspaceId === input.workspaceId &&
        candidate.installationId === input.installationId,
    );
    const existingByOrigin = new Map(
      existingOrigins.map((candidate) => [candidate.exactOrigin, candidate] as const),
    );
    const desiredOrigins: PublicSdkInstallationOriginRecord[] = [];
    const seenOrigins = new Set<string>();
    for (const candidate of input.origins) {
      const environment = this.environments.get(
        this.key(input.workspaceId, candidate.environmentId),
      );
      if (!environment) throw new Error('environment not found in workspace');
      assertPublicSdkInstallationEnvironmentPolicy(environment, candidate.authoringEnabled);
      const exactOrigin = requireExactHttpOrigin(candidate.origin);
      assertPublicSdkInstallationOriginPolicy(
        environment.kind,
        exactOrigin,
        candidate.authoringEnabled,
      );
      assertPublicSdkInstallationEnvironmentOrigin(environment, exactOrigin);
      if (seenOrigins.has(exactOrigin)) {
        throw new Error('public SDK origin mappings must use unique exact origins');
      }
      seenOrigins.add(exactOrigin);
      desiredOrigins.push({
        installationId: input.installationId,
        workspaceId: input.workspaceId,
        environmentId: candidate.environmentId,
        exactOrigin,
        authoringEnabled: candidate.authoringEnabled,
        createdAt: existingByOrigin.get(exactOrigin)?.createdAt ?? now,
        updatedAt: now,
      });
    }

    const desiredByOrigin = new Map(
      desiredOrigins.map((candidate) => [candidate.exactOrigin, candidate] as const),
    );
    for (const existing of existingOrigins) {
      const replacement = desiredByOrigin.get(existing.exactOrigin);
      if (
        replacement?.environmentId === existing.environmentId &&
        replacement.authoringEnabled === existing.authoringEnabled
      ) {
        continue;
      }
      this.invalidateAuthoringSessionsForInstallationOrigin(
        input.workspaceId,
        input.installationId,
        existing.exactOrigin,
      );
    }

    const retainedOrigins = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.workspaceId !== input.workspaceId ||
        candidate.installationId !== input.installationId,
    );
    this.publicSdkInstallationOrigins.splice(
      0,
      this.publicSdkInstallationOrigins.length,
      ...retainedOrigins,
      ...desiredOrigins,
    );
    return desiredOrigins.map((origin) => clone(origin)).sort(comparePublicSdkInstallationOrigins);
  }

  async resolvePublicSdkInstallation(
    installationId: string,
    origin: string,
  ): Promise<ResolvedPublicSdkInstallation | null> {
    const exactOrigin = normalizeExactOrigin(origin);
    if (!exactOrigin) return null;
    const installation = this.publicSdkInstallations.get(installationId);
    if (!installation || installation.revokedAt) return null;

    const mappings = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.installationId === installationId &&
        candidate.workspaceId === installation.workspaceId &&
        candidate.exactOrigin === exactOrigin,
    );
    if (mappings.length !== 1) return null;
    const [mapping] = mappings;
    if (!mapping) return null;
    const environment = this.environments.get(this.key(mapping.workspaceId, mapping.environmentId));
    if (
      !environment ||
      environment.enabled === false ||
      !environment.originAllowlist.includes(exactOrigin)
    ) {
      return null;
    }

    return clone({
      installation,
      environment,
      exactOrigin,
      authoringEnabled:
        environment.kind === 'production'
          ? false
          : environment.authoringEnabled !== false && mapping.authoringEnabled,
    });
  }

  async revokePublicSdkInstallation(
    workspaceId: string,
    installationId: string,
    _actorUserId: string,
  ): Promise<PublicSdkInstallationRecord | null> {
    const installation = this.publicSdkInstallations.get(installationId);
    if (!installation || installation.workspaceId !== workspaceId) return null;
    const revokedInstallation: PublicSdkInstallationRecord = {
      ...installation,
      revokedAt: installation.revokedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.publicSdkInstallations.set(installationId, revokedInstallation);
    return clone(revokedInstallation);
  }

  async createPublicSdkBootstrapGrant(
    input: CreatePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord> {
    assertPublicSdkBootstrapGrantLifetime(input.expiresAt);
    assertPublicSdkBootstrapGrantHash(input.grantHash);
    if (
      [...this.publicSdkBootstrapGrants.values()].some(
        (candidate) => candidate.grantHash === input.grantHash,
      )
    ) {
      throw new Error('bootstrap grant hash already exists');
    }
    const resolved = await this.resolvePublicSdkInstallation(
      input.installationId,
      input.exactOrigin,
    );
    if (
      !resolved ||
      !resolved.authoringEnabled ||
      resolved.installation.workspaceId !== input.workspaceId ||
      resolved.environment.id !== input.environmentId
    ) {
      throw new Error('authoring-enabled public SDK installation origin not found');
    }

    const createdAt = new Date().toISOString();
    const grant: PublicSdkBootstrapGrantRecord = {
      id: `sdkboot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      installationId: input.installationId,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      exactOrigin: resolved.exactOrigin,
      grantHash: input.grantHash,
      createdAt,
      expiresAt: input.expiresAt,
      consumedAt: null,
      revokedAt: null,
    };
    this.publicSdkBootstrapGrants.set(grant.id, grant);
    return clone(grant);
  }

  async consumePublicSdkBootstrapGrant(
    input: ConsumePublicSdkBootstrapGrantInput,
  ): Promise<PublicSdkBootstrapGrantRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isPublicSdkBootstrapGrantHash(input.grantHash)) return null;
    const candidates = [...this.publicSdkBootstrapGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.grantHash &&
        !candidate.consumedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant) return null;
    const resolved = await this.resolvePublicSdkInstallation(input.installationId, exactOrigin);
    if (
      !resolved ||
      !resolved.authoringEnabled ||
      resolved.installation.workspaceId !== grant.workspaceId ||
      resolved.environment.id !== grant.environmentId
    ) {
      return null;
    }

    const consumedGrant = { ...grant, consumedAt: new Date().toISOString() };
    this.publicSdkBootstrapGrants.set(consumedGrant.id, consumedGrant);
    return clone(consumedGrant);
  }

  async createAuthoringAuthorizationRequest(
    input: CreateAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (
      !exactOrigin ||
      !isSha256Hash(input.bootstrapGrantHash) ||
      !isSha256Hash(input.stateHash) ||
      !isAuthoringPkceChallenge(input.codeChallenge) ||
      !isValidAuthoringCapabilities(input.requestedCapabilities) ||
      !isValidAuthoringDocumentIntent(input.documentIntent) ||
      !hasValidFutureTtl(input.expiresAt, AUTHORING_AUTHORIZATION_REQUEST_MAX_TTL_MS)
    ) {
      return null;
    }

    const matchingGrants = [...this.publicSdkBootstrapGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.bootstrapGrantHash &&
        !candidate.consumedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (matchingGrants.length !== 1) return null;
    const [bootstrapGrant] = matchingGrants;
    if (!bootstrapGrant) return null;

    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== bootstrapGrant.workspaceId ||
      scope.environment.id !== bootstrapGrant.environmentId
    ) {
      return null;
    }
    if (!this.isResolvedDocumentIntent(scope.installation.workspaceId, input.documentIntent)) {
      return null;
    }

    const now = new Date().toISOString();
    const consumedBootstrapGrant: PublicSdkBootstrapGrantRecord = {
      ...bootstrapGrant,
      consumedAt: now,
    };
    const request: AuthoringAuthorizationRequestRecord = {
      requestId: createOpaqueRecordId('authreq'),
      bootstrapGrantId: bootstrapGrant.id,
      installationId: input.installationId,
      workspaceId: scope.installation.workspaceId,
      environmentId: scope.environment.id,
      environment: scope.environment.kind,
      exactOrigin,
      stateHash: input.stateHash,
      bootstrapGrantHash: input.bootstrapGrantHash,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: 'S256',
      requestedCapabilities: [...input.requestedCapabilities],
      ...(input.documentIntent ? { documentIntent: clone(input.documentIntent) } : {}),
      creatorId: null,
      authorizationCodeHash: null,
      createdAt: now,
      expiresAt: input.expiresAt,
      approvedAt: null,
      authorizationCodeExpiresAt: null,
      authorizationCodeUsedAt: null,
    };

    // Both writes are synchronous and adjacent so two concurrent callers cannot
    // consume the same in-memory bootstrap grant.
    this.publicSdkBootstrapGrants.set(consumedBootstrapGrant.id, consumedBootstrapGrant);
    this.authoringAuthorizationRequests.set(request.requestId, request);
    return clone(request);
  }

  async getAuthoringAuthorizationRequest(
    workspaceId: string,
    requestId: string,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    const request = this.authoringAuthorizationRequests.get(requestId);
    if (
      !request ||
      request.workspaceId !== workspaceId ||
      Date.parse(request.expiresAt) <= Date.now()
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(request.installationId, request.exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== workspaceId ||
      scope.environment.id !== request.environmentId
    ) {
      return null;
    }
    return clone(request);
  }

  async getAuthoringAuthorizationRequestForUser(
    userId: string,
    requestId: string,
  ): Promise<ResolvedAuthoringAuthorizationForUser | null> {
    const request = this.authoringAuthorizationRequests.get(requestId);
    if (!request) return null;
    const membership = this.workspaceMemberships.get(this.key(request.workspaceId, userId));
    if (!membership || !hasAuthoringWorkspaceRole(membership.role)) return null;
    const validated = await this.getAuthoringAuthorizationRequest(request.workspaceId, requestId);
    return validated ? { request: validated, membership: clone(membership) } : null;
  }

  async approveAuthoringAuthorizationRequest(
    input: ApproveAuthoringAuthorizationRequestInput,
  ): Promise<AuthoringAuthorizationRequestRecord | null> {
    if (
      !isSha256Hash(input.stateHash) ||
      !isSha256Hash(input.authorizationCodeHash) ||
      !hasValidBoundedFutureTtl(
        input.authorizationCodeExpiresAt,
        AUTHORING_AUTHORIZATION_CODE_MIN_TTL_MS,
        AUTHORING_AUTHORIZATION_CODE_MAX_TTL_MS,
      )
    ) {
      return null;
    }
    const request = this.authoringAuthorizationRequests.get(input.requestId);
    if (
      !request ||
      request.workspaceId !== input.workspaceId ||
      request.stateHash !== input.stateHash ||
      request.approvedAt ||
      request.authorizationCodeHash ||
      Date.parse(request.expiresAt) <= Date.now() ||
      [...this.authoringAuthorizationRequests.values()].some(
        (candidate) => candidate.authorizationCodeHash === input.authorizationCodeHash,
      ) ||
      !this.hasAuthoringMembership(input.workspaceId, input.creatorId)
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(request.installationId, request.exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== input.workspaceId ||
      scope.environment.id !== request.environmentId
    ) {
      return null;
    }

    const approved: AuthoringAuthorizationRequestRecord = {
      ...request,
      creatorId: input.creatorId,
      authorizationCodeHash: input.authorizationCodeHash,
      approvedAt: new Date().toISOString(),
      authorizationCodeExpiresAt: input.authorizationCodeExpiresAt,
    };
    this.authoringAuthorizationRequests.set(approved.requestId, approved);
    return clone(approved);
  }

  async exchangeAuthoringAuthorizationCode(
    input: ExchangeAuthoringAuthorizationCodeInput,
  ): Promise<AuthoringCodeExchangeRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (
      !exactOrigin ||
      !isSha256Hash(input.bootstrapGrantHash) ||
      !isSha256Hash(input.stateHash) ||
      !isSha256Hash(input.authorizationCodeHash) ||
      !isSha256Hash(input.activationGrantHash) ||
      !hasValidFutureTtl(input.activationGrantExpiresAt, AUTHORING_ACTIVATION_GRANT_MAX_TTL_MS) ||
      [...this.authoringActivationGrants.values()].some(
        (candidate) => candidate.grantHash === input.activationGrantHash,
      )
    ) {
      return null;
    }
    const request = this.authoringAuthorizationRequests.get(input.requestId);
    if (
      !request ||
      request.installationId !== input.installationId ||
      request.exactOrigin !== exactOrigin ||
      request.bootstrapGrantHash !== input.bootstrapGrantHash ||
      request.stateHash !== input.stateHash ||
      request.authorizationCodeHash !== input.authorizationCodeHash ||
      !request.creatorId ||
      !request.approvedAt ||
      request.authorizationCodeUsedAt ||
      !request.authorizationCodeExpiresAt ||
      Date.parse(request.expiresAt) <= Date.now() ||
      Date.parse(request.authorizationCodeExpiresAt) <= Date.now() ||
      !verifyAuthoringPkceS256Challenge(input.codeVerifier, request.codeChallenge) ||
      !this.hasAuthoringMembership(request.workspaceId, request.creatorId)
    ) {
      return null;
    }
    const bootstrapGrant = this.publicSdkBootstrapGrants.get(request.bootstrapGrantId);
    if (
      !bootstrapGrant ||
      bootstrapGrant.grantHash !== input.bootstrapGrantHash ||
      !bootstrapGrant.consumedAt ||
      bootstrapGrant.revokedAt ||
      Date.parse(bootstrapGrant.expiresAt) <= Date.now()
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== request.workspaceId ||
      scope.environment.id !== request.environmentId
    ) {
      return null;
    }

    const now = new Date().toISOString();
    const consumedRequest: AuthoringAuthorizationRequestRecord = {
      ...request,
      authorizationCodeUsedAt: now,
    };
    const activationGrant: AuthoringActivationGrantRecord = {
      grantId: createOpaqueRecordId('authgrant'),
      requestId: request.requestId,
      installationId: request.installationId,
      workspaceId: request.workspaceId,
      environmentId: request.environmentId,
      environment: request.environment,
      exactOrigin: request.exactOrigin,
      creatorId: request.creatorId,
      capabilities: [...request.requestedCapabilities],
      ...(request.documentIntent ? { documentIntent: clone(request.documentIntent) } : {}),
      grantHash: input.activationGrantHash,
      createdAt: now,
      expiresAt: input.activationGrantExpiresAt,
      usedAt: null,
      revokedAt: null,
    };
    this.authoringAuthorizationRequests.set(consumedRequest.requestId, consumedRequest);
    this.authoringActivationGrants.set(activationGrant.grantId, activationGrant);
    return clone({ authorizationRequest: consumedRequest, activationGrant });
  }

  async consumeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null> {
    return this.mutateAuthoringActivationGrant(input, 'consume');
  }

  async revokeAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
  ): Promise<AuthoringActivationGrantRecord | null> {
    return this.mutateAuthoringActivationGrant(input, 'revoke');
  }

  async queryAuthoringDocumentsFromActivation(
    input: QueryAuthoringDocumentsFromActivationInput,
  ): Promise<QueryAuthoringDocumentsResult | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    const pathname = normalizeAuthoringPathname(input.pageContext?.pathname ?? '');
    if (
      !exactOrigin ||
      !pathname ||
      !isSha256Hash(input.activationGrantHash) ||
      !isAuthoringDocumentQueryScope(input.scope)
    ) {
      return null;
    }

    const candidates = [...this.authoringActivationGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.activationGrantHash &&
        !candidate.usedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant || !grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS)) {
      return null;
    }

    const authoringScope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !authoringScope ||
      authoringScope.installation.workspaceId !== grant.workspaceId ||
      authoringScope.environment.id !== grant.environmentId ||
      !this.hasAuthoringMembership(grant.workspaceId, grant.creatorId)
    ) {
      return null;
    }

    const pageContext = { pathname };
    const documents = [...this.documents.values()]
      .filter(
        (entry) =>
          entry.document.workspaceId === grant.workspaceId &&
          entry.document.type === 'tour' &&
          (input.scope === 'workspace' ||
            matchesAuthoringPageContext(entry.document, exactOrigin, pageContext)),
      )
      .map<AuthoringPageDocumentSummary>((entry) => ({
        id: entry.document.id,
        title: entry.document.title,
        type: 'tour',
        status: entry.document.status,
        updatedAt: entry.updatedAt,
        releases: this.listDocumentPublicationSummaries(grant.workspaceId, entry.document.id),
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return clone({ scope: input.scope, pageContext, documents });
  }

  async createAuthoringDocumentSessionFromActivation(
    input: CreateAuthoringDocumentSessionFromActivationInput,
  ): Promise<ActivatedAuthoringDocumentSessionRecord | null> {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    const pathname = normalizeAuthoringPathname(input.pageContext?.pathname ?? '');
    if (
      !exactOrigin ||
      !pathname ||
      !isAuthoringDocumentQueryScope(input.selectionScope) ||
      !input.documentIntent ||
      !isValidAuthoringDocumentIntent(input.documentIntent) ||
      (input.documentIntent.kind === 'new-draft' && input.selectionScope !== 'page') ||
      !isSha256Hash(input.activationGrantHash) ||
      !isSha256Hash(input.sessionTokenHash) ||
      !input.correlationId.trim() ||
      !isTrustedEditorIframeSrc(input.iframeSrc) ||
      !hasValidFutureTtl(input.expiresAt, AUTHORING_DOCUMENT_SESSION_MAX_TTL_MS) ||
      [...this.authoringSessions.values()].some(
        (candidate) => candidate.tokenHash === input.sessionTokenHash,
      )
    ) {
      return null;
    }

    const candidates = [...this.authoringActivationGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.activationGrantHash &&
        !candidate.usedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant || !canActivateDocumentIntent(grant, input.documentIntent)) return null;
    if (
      input.selectionScope === 'workspace' &&
      !grant.capabilities.includes(AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS)
    ) {
      return null;
    }
    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== grant.workspaceId ||
      scope.environment.id !== grant.environmentId ||
      !this.hasAuthoringMembership(grant.workspaceId, grant.creatorId)
    ) {
      return null;
    }

    const existingDocument =
      input.documentIntent.kind === 'existing'
        ? this.documents.get(this.key(grant.workspaceId, input.documentIntent.documentId))
        : null;
    if (input.documentIntent.kind === 'existing') {
      if (
        !existingDocument ||
        existingDocument.document.type !== 'tour' ||
        (input.selectionScope === 'page' &&
          !matchesAuthoringPageContext(existingDocument.document, exactOrigin, { pathname }))
      ) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const documentCreated = input.documentIntent.kind === 'new-draft';
    const defaultTheme = [...this.themes.values()].find(
      (theme) => theme.workspaceId === grant.workspaceId && theme.isDefault,
    );
    const document = documentCreated
      ? createServerOwnedTourDraft(
          grant.workspaceId,
          grant.environment,
          exactOrigin,
          { pathname },
          defaultTheme,
        )
      : existingDocument?.document;
    if (!document || !validate(LodariqDocumentSchema, document).valid) return null;
    const compatibility = this.resolveAuthoringSessionCompatibility(document);
    if (!compatibility) return null;

    const consumedGrant: AuthoringActivationGrantRecord = { ...grant, usedAt: now };
    const sessionId = createOpaqueRecordId('authsess');
    const capabilities = getAuthoringDocumentSessionCapabilities(grant.environment);
    const session: AuthoringDocumentSessionRecord = {
      sessionId,
      correlationId: input.correlationId,
      installationId: grant.installationId,
      activationGrantId: grant.grantId,
      workspaceId: grant.workspaceId,
      environmentId: grant.environmentId,
      environment: grant.environment,
      documentId: document.id,
      customerOrigin: grant.exactOrigin,
      creatorId: grant.creatorId,
      capabilities,
      ...compatibility,
      tokenHash: input.sessionTokenHash,
      iframeSrc: input.iframeSrc,
      createdAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    const storedSession: AuthoringSessionRecord = {
      id: session.sessionId,
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      environment: session.environment,
      documentId: session.documentId,
      correlationId: session.correlationId,
      tokenHash: session.tokenHash,
      iframeSrc: session.iframeSrc,
      createdByUserId: session.creatorId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: null,
      installationId: session.installationId,
      activationGrantId: session.activationGrantId,
      customerOrigin: session.customerOrigin,
      capabilities: [...session.capabilities],
      compilerVersion: session.compilerVersion,
      rendererContractVersion: session.rendererContractVersion,
      themeContractVersion: session.themeContractVersion,
      themeVersionId: session.themeVersionId,
    };

    this.authoringActivationGrants.set(consumedGrant.grantId, consumedGrant);
    if (documentCreated) {
      const persistedDocument: PersistedDocument = {
        document: clone(document),
        createdByUserId: grant.creatorId,
        updatedByUserId: grant.creatorId,
        updatedAt: now,
      };
      this.documents.set(this.key(grant.workspaceId, document.id), persistedDocument);
      this.appendDocumentVersion({
        id: `${document.id}_v_1`,
        workspaceId: grant.workspaceId,
        documentId: document.id,
        version: 1,
        canonical: clone(document),
        createdByUserId: grant.creatorId,
        createdAt: now,
      });
    }
    this.authoringSessions.set(this.key(session.workspaceId, session.sessionId), storedSession);
    return clone({ activationGrant: consumedGrant, session, documentCreated });
  }

  async listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]> {
    return [...this.environmentTokens.values()]
      .filter((token) => token.workspaceId === workspaceId)
      .map((token) => clone(token))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null> {
    const token = [...this.environmentTokens.values()].find(
      (candidate) => candidate.tokenHash === tokenHash && !candidate.revokedAt,
    );
    if (!token) return null;
    const environment = this.environments.get(this.key(token.workspaceId, token.environmentId));
    if (!environment || environment.enabled === false) return null;
    return clone({
      ...token,
      environment: environment.kind,
      originAllowlist: environment.originAllowlist,
    });
  }

  async createEnvironmentToken(
    input: CreateEnvironmentTokenInput,
  ): Promise<EnvironmentTokenRecord> {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment || environment.enabled === false) {
      throw new Error('environment not found in workspace');
    }
    const token: EnvironmentTokenRecord = {
      id: `envtok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: environment.kind,
      name: input.name,
      tokenHash: input.tokenHash,
      tokenPrefix: input.tokenPrefix,
      ...(input.clientToken ? { clientToken: input.clientToken } : {}),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.environmentTokens.set(this.key(token.workspaceId, token.id), token);
    return clone(token);
  }

  async revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    _actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null> {
    const key = this.key(workspaceId, tokenId);
    const token = this.environmentTokens.get(key);
    if (!token) return null;

    const revokedAt = token.revokedAt ?? new Date().toISOString();
    const revokedToken = { ...token, revokedAt };
    this.environmentTokens.set(key, revokedToken);
    return clone(revokedToken);
  }

  async createAuthoringSession(
    input: CreateAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord> {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (
      !environment ||
      environment.enabled === false ||
      environment.authoringEnabled === false ||
      environment.kind === 'production'
    ) {
      throw new Error('environment not found in workspace');
    }
    if (!this.hasAuthoringMembership(input.workspaceId, input.actorUserId)) {
      throw new Error('authoring session creator is not an active workspace member');
    }
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!document) {
      throw new Error('document not found in workspace');
    }
    const compatibility = this.resolveAuthoringSessionCompatibility(document.document);
    if (!compatibility) {
      throw new Error('document theme is unavailable for an authoring session');
    }
    const session: AuthoringSessionRecord = {
      id: `authsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: environment.kind,
      documentId: input.documentId,
      correlationId: input.correlationId,
      tokenHash: input.tokenHash,
      iframeSrc: input.iframeSrc,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      revokedAt: null,
      ...compatibility,
    };
    this.authoringSessions.set(this.key(session.workspaceId, session.id), session);
    return clone(session);
  }

  async resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (!session) return null;
    const environment = this.environments.get(this.key(session.workspaceId, session.environmentId));
    if (
      !environment ||
      environment.enabled === false ||
      environment.authoringEnabled === false ||
      environment.kind === 'production'
    ) {
      return null;
    }
    if (!this.hasAuthoringMembership(session.workspaceId, session.createdByUserId)) return null;
    return clone(session);
  }

  async resolveAuthoringSessionByTokenHash(
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    if (!isSha256Hash(tokenHash)) return null;
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (session) {
      const environment = this.environments.get(
        this.key(session.workspaceId, session.environmentId),
      );
      if (
        !environment ||
        environment.enabled === false ||
        environment.authoringEnabled === false ||
        environment.kind === 'production'
      ) {
        return null;
      }
      if (!this.hasAuthoringMembership(session.workspaceId, session.createdByUserId)) return null;
    }
    if (session?.installationId && session.customerOrigin) {
      const scope = this.resolveActiveAuthoringScope(
        session.installationId,
        session.customerOrigin,
      );
      if (
        !scope ||
        scope.installation.workspaceId !== session.workspaceId ||
        scope.environment.id !== session.environmentId
      ) {
        return null;
      }
    }
    return session ? clone(session) : null;
  }

  async acknowledgeDocumentTheme(
    input: AcknowledgeDocumentThemeInput,
  ): Promise<PersistedDocument | null> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);
    const key = this.key(input.workspaceId, input.sessionId);
    const session = this.authoringSessions.get(key);
    const documentKey = this.key(input.workspaceId, input.documentId);
    const current = this.documents.get(documentKey);
    const binding = current?.document.themeBinding;
    const nextBinding = input.document.themeBinding;
    const theme = binding
      ? this.themes.get(this.key(input.workspaceId, binding.themeId))
      : undefined;
    if (
      !session ||
      !current ||
      current.updatedAt !== input.expectedDocumentUpdatedAt ||
      !binding ||
      binding.policy !== 'workspace-current' ||
      binding.acknowledgedThemeVersionId !== input.expectedThemeVersionId ||
      !nextBinding ||
      nextBinding.policy !== 'workspace-current' ||
      nextBinding.themeId !== binding.themeId ||
      nextBinding.acknowledgedThemeVersionId !== input.reviewedThemeVersionId ||
      input.document.id !== input.documentId ||
      theme?.activeVersionId !== input.reviewedThemeVersionId ||
      session.documentId !== input.documentId ||
      session.createdByUserId !== input.actorUserId ||
      session.themeVersionId !== input.expectedThemeVersionId ||
      session.revokedAt ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      return null;
    }
    const now = new Date().toISOString();
    const documentVersion = this.createDocumentVersion(input, now);
    const latestArtifact = this.persistCompiledArtifact(
      input.workspaceId,
      input.documentId,
      documentVersion.id,
      input.artifact,
      now,
    );
    const saved: PersistedDocument = {
      document: clone(input.document),
      createdByUserId: current.createdByUserId,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      latestArtifact: clone(latestArtifact),
    };
    this.documents.set(documentKey, saved);
    this.authoringSessions.set(key, {
      ...session,
      themeVersionId: input.reviewedThemeVersionId,
    });
    return clone(saved);
  }

  async revokeAuthoringSession(
    input: RevokeAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord | null> {
    if (!input.sessionId.trim() || !isSha256Hash(input.tokenHash)) return null;
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.id === input.sessionId &&
        candidate.tokenHash === input.tokenHash &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (!session) return null;

    if (session.installationId && session.customerOrigin) {
      const scope = this.resolveActiveAuthoringScope(
        session.installationId,
        session.customerOrigin,
      );
      if (
        !scope ||
        scope.installation.workspaceId !== session.workspaceId ||
        scope.environment.id !== session.environmentId ||
        !this.hasAuthoringMembership(session.workspaceId, session.createdByUserId)
      ) {
        return null;
      }
    }

    const revoked = { ...session, revokedAt: session.revokedAt ?? new Date().toISOString() };
    this.authoringSessions.set(this.key(revoked.workspaceId, revoked.id), revoked);
    return clone(revoked);
  }

  async createVisualCheckRun(input: CreateVisualCheckRunInput): Promise<VisualCheckRunRecord> {
    assertVisualCheckReport(input.report);
    if (!/^sha256-[0-9a-f]{64}$/u.test(input.contentHash)) {
      throw new Error('visual check contentHash must be a SHA-256 content hash');
    }
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!document) throw new Error('visual check document not found in workspace');
    const documentVersion = (
      this.documentVersions.get(this.key(input.workspaceId, input.documentId)) ?? []
    ).find((version) => version.id === input.documentVersionId);
    if (!documentVersion) {
      throw new Error('visual check document version not found in workspace');
    }
    const artifact = this.compiledArtifactsById.get(
      this.key(input.workspaceId, input.compiledArtifactId),
    );
    if (
      !artifact ||
      artifact.documentId !== input.documentId ||
      artifact.documentVersionId !== input.documentVersionId ||
      artifact.contentHash !== input.contentHash
    ) {
      throw new Error('visual check compiled artifact identity mismatch');
    }
    if (artifact.themeVersionId !== input.themeVersionId) {
      throw new Error('visual check theme version does not match compiled artifact');
    }
    if (!this.environments.has(this.key(input.workspaceId, input.environmentId))) {
      throw new Error('visual check environment not found in workspace');
    }

    const run: VisualCheckRunRecord = {
      id: `vcheck_${randomUUID()}`,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      compiledArtifactId: input.compiledArtifactId,
      themeVersionId: input.themeVersionId,
      environmentId: input.environmentId,
      contentHash: input.contentHash,
      report: clone(input.report),
      status: input.report.status,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.appendVisualCheckRun(run);
    return clone(run);
  }

  async listVisualCheckRuns(
    workspaceId: string,
    documentId: string,
  ): Promise<VisualCheckRunRecord[]> {
    return (this.visualCheckRuns.get(this.key(workspaceId, documentId)) ?? [])
      .map((run) => clone(run))
      .sort(compareVisualCheckRuns);
  }

  async ingestEvents(input: IngestEventsInput): Promise<number> {
    for (const event of input.events) {
      this.events.push({ workspaceId: input.workspaceId, event: clone(event) });
    }
    return input.events.length;
  }

  async ingestAuthoritativeEvents(input: IngestAuthoritativeEventsInput): Promise<number> {
    assertAuthoritativeAnalyticsBatch(input);
    const ingestedAt = new Date().toISOString();
    const records = input.events.map((event) => {
      return {
        ...clone(event),
        id: `aevt_${randomUUID()}`,
        ingestedAt,
      } satisfies PersistedAnalyticsEventRecord;
    });

    this.analyticsEvents.push(...records);
    return records.length;
  }

  async listAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): Promise<PersistedAnalyticsEventRecord[]> {
    assertAnalyticsEnvironmentQuery(input.query);
    return this.matchingAnalyticsEvents(input)
      .sort(compareAnalyticsEventsNewestFirst)
      .slice(0, input.query.limit ?? DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT)
      .map((event) => clone(event));
  }

  async aggregateAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): Promise<AnalyticsEventAggregate[]> {
    assertAnalyticsEnvironmentQuery(input.query);
    const aggregates = new Map<string, AnalyticsEventAggregate>();
    for (const event of this.matchingAnalyticsEvents(input)) {
      const key = analyticsAggregateKey(event);
      const timestamp = new Date(event.timestamp).toISOString();
      const current = aggregates.get(key);
      if (current) {
        current.count += 1;
        if (timestamp < current.firstTimestamp) current.firstTimestamp = timestamp;
        if (timestamp > current.lastTimestamp) current.lastTimestamp = timestamp;
        continue;
      }
      const dimensions = {
        workspaceId: event.workspaceId,
        environmentId: event.environmentId,
        documentId: event.documentId,
        publicationId: event.publicationId,
        contentHash: event.contentHash,
        pointerGeneration: event.pointerGeneration,
        count: 1,
        firstTimestamp: timestamp,
        lastTimestamp: timestamp,
      };
      aggregates.set(
        key,
        event.name === 'target_resolution'
          ? {
              ...dimensions,
              name: 'target_resolution',
              targetResolutionStatus: analyticsTargetResolutionStatus(event),
            }
          : { ...dimensions, name: event.name },
      );
    }
    return [...aggregates.values()]
      .sort(compareAnalyticsAggregates)
      .slice(0, input.query.limit ?? DEFAULT_ANALYTICS_EVENT_QUERY_LIMIT)
      .map((aggregate) => clone(aggregate));
  }

  private matchingAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): PersistedAnalyticsEventRecord[] {
    const from = input.query.from ? Date.parse(input.query.from) : null;
    const to = input.query.to ? Date.parse(input.query.to) : null;
    return this.analyticsEvents.filter((event) => {
      if (event.workspaceId !== input.workspaceId) return false;
      if (event.environmentId !== input.query.environmentId) return false;
      if (input.query.documentId && event.documentId !== input.query.documentId) return false;
      if (input.query.publicationId && event.publicationId !== input.query.publicationId)
        return false;
      if (input.query.contentHash && event.contentHash !== input.query.contentHash) return false;
      const timestamp = Date.parse(event.timestamp);
      if (from !== null && timestamp < from) return false;
      if (to !== null && timestamp > to) return false;
      return true;
    });
  }

  private appendThemeVersion(version: WorkspaceThemeVersionRecord): void {
    const key = this.key(version.workspaceId, version.themeId);
    const versions = this.themeVersions.get(key) ?? [];
    versions.push(clone(version));
    this.themeVersions.set(key, versions);
  }

  private findThemeVersion(
    workspaceId: string,
    themeId: string,
    versionId: string | null,
  ): WorkspaceThemeVersionRecord | null {
    if (!versionId) return null;
    const candidates = this.themeVersions.get(this.key(workspaceId, themeId)) ?? [];
    const version = candidates.find((candidate) => candidate.id === versionId);
    return version ? clone(version) : null;
  }

  private resolveAuthoringSessionCompatibility(
    document: LodariqDocument,
  ): AuthoringSessionCompatibilityPins | null {
    const reference = authoringSessionThemeReference(document);
    if (!reference) return null;
    if (reference.source === 'fallback') {
      return createAuthoringSessionCompatibilityPins(reference.themeVersionId);
    }
    const version = this.findThemeVersion(
      document.workspaceId,
      reference.themeId,
      reference.themeVersionId,
    );
    if (!version || version.contractVersion !== BRAND_THEME_CONTRACT_VERSION) return null;
    return createAuthoringSessionCompatibilityPins(version.id);
  }

  private hydrateTheme(theme: WorkspaceThemeRecord): WorkspaceThemeRecord {
    return clone({
      ...theme,
      activeVersion: this.findThemeVersion(theme.workspaceId, theme.id, theme.activeVersionId),
    });
  }

  private clearWorkspaceThemeDefault(
    workspaceId: string,
    actorUserId: string,
    updatedAt: string,
  ): void {
    for (const [key, theme] of this.themes) {
      if (theme.workspaceId !== workspaceId || !theme.isDefault) continue;
      this.themes.set(key, {
        ...theme,
        isDefault: false,
        revision: theme.revision + 1,
        updatedByUserId: actorUserId,
        updatedAt,
      });
    }
  }

  private appendVisualCheckRun(run: VisualCheckRunRecord): void {
    const key = this.key(run.workspaceId, run.documentId);
    const runs = this.visualCheckRuns.get(key) ?? [];
    runs.push(clone(run));
    this.visualCheckRuns.set(key, runs);
  }

  private appendStyleSource(source: StyleSourceRecord): void {
    const key = this.key(source.workspaceId, source.themeId);
    const sources = this.styleSources.get(key) ?? [];
    sources.push(clone(source));
    this.styleSources.set(key, sources);
  }

  private appendBrandDriftRun(run: BrandDriftRunRecord): void {
    const key = this.key(run.workspaceId, run.documentId);
    const runs = this.brandDriftRuns.get(key) ?? [];
    runs.push(clone(run));
    this.brandDriftRuns.set(key, runs);
  }

  private appendPublicationVerification(verification: PublicationVerificationRecord): void {
    const key = this.key(verification.workspaceId, verification.publicationId);
    const verifications = this.publicationVerifications.get(key) ?? [];
    verifications.push(clone(verification));
    this.publicationVerifications.set(key, verifications);
  }

  private appendReleaseApproval(approval: ReleaseApprovalRecord): void {
    const key = this.key(approval.workspaceId, approval.releaseOperationId);
    const approvals = this.releaseApprovals.get(key) ?? [];
    approvals.push(clone(approval));
    this.releaseApprovals.set(key, approvals);
  }

  private createDocumentVersion(
    input: SaveDocumentInput,
    createdAt: string,
  ): PersistedDocumentVersion {
    const key = this.key(input.workspaceId, input.document.id);
    const existingVersions = this.documentVersions.get(key) ?? [];
    const version = Math.max(0, ...existingVersions.map((entry) => entry.version)) + 1;
    const documentVersion: PersistedDocumentVersion = {
      id: `${input.document.id}_v_${version}`,
      workspaceId: input.workspaceId,
      documentId: input.document.id,
      version,
      canonical: clone(input.document),
      createdByUserId: input.actorUserId,
      createdAt,
    };
    this.appendDocumentVersion(documentVersion);
    return documentVersion;
  }

  private appendDocumentVersion(version: PersistedDocumentVersion): void {
    const key = this.key(version.workspaceId, version.documentId);
    const versions = this.documentVersions.get(key) ?? [];
    versions.push(clone(version));
    this.documentVersions.set(key, versions);
  }

  private createPublication(
    input: PublishCompiledArtifactInput,
    provenance: PublicationProvenance,
  ): PersistedPublication {
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) {
      throw new Error('environment not found in workspace');
    }
    if (!this.documents.has(this.key(input.workspaceId, input.artifact.documentId))) {
      throw new Error('document not found in workspace');
    }
    const artifact = this.compiledArtifactsById.get(this.key(input.workspaceId, input.artifact.id));
    if (!artifact) {
      throw new Error('compiled artifact not found in workspace');
    }
    if (artifact.compiled.documentId !== artifact.documentId) {
      throw new Error('compiled artifact document mismatch');
    }

    const publication: PersistedPublication = {
      id: `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      correlationId: input.correlationId,
      environmentId: input.environmentId,
      environment: environment.kind,
      documentId: artifact.documentId,
      documentVersionId: artifact.documentVersionId,
      compiledArtifactId: artifact.id,
      contentHash: artifact.contentHash,
      ...provenance,
      publishedByUserId: input.actorUserId,
      publishedAt: new Date().toISOString(),
      artifact: clone(artifact),
    };
    this.appendPublication(publication);
    return clone(publication);
  }

  private appendPublication(publication: PersistedPublication): void {
    const key = this.key(publication.workspaceId, publication.environmentId);
    const publications = this.publications.get(key) ?? [];
    publications.push(clone(publication));
    this.publications.set(key, publications);
  }

  private requireDeploymentPublication(
    deployment: PersistedDocumentDeployment,
  ): PersistedPublication {
    if (deployment.state !== 'active') {
      throw new Error('inactive document deployment has no current publication');
    }
    const publication = (
      this.publications.get(this.key(deployment.workspaceId, deployment.environmentId)) ?? []
    ).find((candidate) => candidate.id === deployment.activePublicationId);
    if (!publication) {
      throw new Error('active document deployment publication not found in workspace');
    }
    if (publication.documentId !== deployment.documentId) {
      throw new Error('active document deployment publication document mismatch');
    }
    return clone(publication);
  }

  private getLatestLegacyPublication(
    workspaceId: string,
    environmentId: string,
  ): PersistedPublication | null {
    const [latest] = [...(this.publications.get(this.key(workspaceId, environmentId)) ?? [])].sort(
      comparePublicationsNewestFirst,
    );
    return latest ?? null;
  }

  private listDocumentPublicationSummaries(
    workspaceId: string,
    documentId: string,
  ): DocumentPublicationSummary[] {
    const latestByEnvironment = new Map<string, DocumentPublicationSummary>();
    for (const publication of [...this.publications.values()].flat()) {
      if (publication.workspaceId !== workspaceId || publication.documentId !== documentId) {
        continue;
      }
      const current = latestByEnvironment.get(publication.environmentId);
      if (current && current.publishedAt.localeCompare(publication.publishedAt) > 0) {
        continue;
      }
      latestByEnvironment.set(publication.environmentId, {
        environmentId: publication.environmentId,
        environment: publication.environment,
        contentHash: publication.contentHash,
        publishedAt: publication.publishedAt,
      });
    }

    return [...latestByEnvironment.values()].sort((a, b) =>
      a.environment.localeCompare(b.environment),
    );
  }

  private persistCompiledArtifact(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
    compiled: CompiledDocument,
    createdAt: string,
  ): PersistedCompiledArtifact {
    const identityKey = this.artifactIdentityKey(workspaceId, documentId, compiled.contentHash);
    const existing = this.compiledArtifactsByIdentity.get(identityKey);
    if (existing) return clone(existing);

    const artifact: PersistedCompiledArtifact = {
      id: `artifact_${documentId}_${compiled.contentHash.replace(/[^a-zA-Z0-9]/g, '_')}`,
      workspaceId,
      documentId,
      documentVersionId,
      contentHash: compiled.contentHash,
      compilerVersion: compiled.compilerVersion,
      ...compiledArtifactMetadata(compiled),
      compiled: clone(compiled),
      createdAt,
    };
    this.compiledArtifactsByIdentity.set(identityKey, artifact);
    this.compiledArtifactsById.set(this.key(workspaceId, artifact.id), artifact);
    return clone(artifact);
  }

  private rememberSeedArtifact(artifact: PersistedCompiledArtifact): void {
    const identityKey = this.artifactIdentityKey(
      artifact.workspaceId,
      artifact.documentId,
      artifact.contentHash,
    );
    if (this.compiledArtifactsByIdentity.has(identityKey)) return;
    const stored = clone(artifact);
    this.compiledArtifactsByIdentity.set(identityKey, stored);
    this.compiledArtifactsById.set(this.key(artifact.workspaceId, artifact.id), stored);
  }

  private assertMatchingPromotionRequest(
    input: PromoteVerifiedPublicationInput,
    operation: PersistedReleaseOperation,
  ): void {
    const requestChanged =
      operation.workspaceId !== input.workspaceId ||
      operation.environmentId !== input.targetEnvironmentId ||
      operation.documentId !== input.documentId ||
      operation.action !== 'promote' ||
      operation.sourcePublicationId !== input.expectedSourcePublicationId ||
      operation.expectedGeneration !== input.expectedGeneration ||
      operation.requestHash !== input.requestHash;
    if (requestChanged) throw new IdempotencyConflictError(input.idempotencyKey);
  }

  private failPromotionOperation(
    operationKey: string,
    operation: PersistedReleaseOperation,
    errorCode: string,
  ): void {
    const completedAt = new Date().toISOString();
    this.releaseOperations.set(operationKey, {
      ...operation,
      status: 'failed',
      errorCode,
      completedAt,
    });
    const deploymentKey = this.key(
      operation.workspaceId,
      operation.environmentId,
      operation.documentId,
    );
    const deployment = this.documentDeployments.get(deploymentKey);
    if (deployment?.pendingReleaseOperationId !== operation.id) return;
    this.documentDeployments.set(deploymentKey, {
      ...deployment,
      pendingReleaseOperationId: null,
      updatedAt: completedAt,
    });
  }

  private replayCompletedPromotion(
    operation: PersistedReleaseOperation,
    requiredApprovalCount: number,
  ): PromotionResult {
    if (!operation.sourcePublicationId || !operation.resultPublicationId) {
      throw new Error('completed promotion is missing publication provenance');
    }
    const sourcePublication = this.findPublicationById(
      operation.workspaceId,
      operation.sourcePublicationId,
    );
    const publication = this.findPublicationById(
      operation.workspaceId,
      operation.resultPublicationId,
    );
    if (
      !sourcePublication ||
      !publication ||
      operation.resultGeneration === null ||
      operation.requestedArtifactId !== sourcePublication.compiledArtifactId
    ) {
      throw new Error('completed promotion result is unavailable');
    }
    const deployment: PersistedDocumentDeployment = {
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: operation.resultGeneration,
      updatedAt: operation.completedAt ?? publication.publishedAt,
    };
    const approvals =
      this.releaseApprovals.get(this.key(operation.workspaceId, operation.id)) ?? [];
    return {
      operation: clone(operation),
      sourcePublication,
      publication,
      deployment,
      approvalCount: approvals.filter((approval) => approval.decision === 'approved').length,
      requiredApprovalCount,
      replayed: true,
    };
  }

  private resolveReleaseRecoveryScope(input: ReleaseRecoveryScopeInput): {
    environment: WorkspaceEnvironment;
    membershipRole: ControlPlaneRole | null;
  } | null {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!environment || !document) return null;
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    const membershipRole = toControlPlaneRole(membership?.role);
    if (!membershipRole) return null;
    return {
      environment: clone(environment),
      membershipRole,
    };
  }

  private buildReleaseRecoveryPublicationSnapshots(
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): ReleaseRecoveryPublicationMaterial[] {
    const publications =
      this.publications.get(this.key(input.workspaceId, input.environmentId)) ?? [];
    const publicationById = new Map(
      publications
        .filter((publication) => publication.documentId === input.documentId)
        .map((publication) => [publication.id, publication] as const),
    );
    const materials: ReleaseRecoveryPublicationMaterial[] = [];
    for (const operation of this.releaseOperations.values()) {
      if (
        operation.workspaceId !== input.workspaceId ||
        operation.environmentId !== input.environmentId ||
        operation.documentId !== input.documentId ||
        operation.status !== 'completed' ||
        operation.action === 'unpublish'
      ) {
        continue;
      }
      if (
        !operation.resultPublicationId ||
        operation.resultGeneration === null ||
        operation.resultGeneration < 1 ||
        !operation.completedAt
      ) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const publication = publicationById.get(operation.resultPublicationId);
      if (
        !publication ||
        publication.releaseOperationId !== operation.id ||
        publication.action !== operation.action ||
        publication.compiledArtifactId !== operation.requestedArtifactId ||
        ((operation.action === 'promote' || operation.action === 'rollback') &&
          (!operation.sourcePublicationId ||
            publication.sourcePublicationId !== operation.sourcePublicationId)) ||
        (operation.action === 'rollback' &&
          (!operation.actualActivePublicationId ||
            publication.previousPublicationId !== operation.actualActivePublicationId ||
            !operation.reason))
      ) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const artifact = extractHistoricalReleaseArtifactPins(publication.artifact);
      if (!artifact) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      materials.push({
        publication: clone(publication),
        operation: clone(operation),
        snapshot: {
          id: publication.id,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          generation: operation.resultGeneration,
          outcome: 'succeeded',
          artifact,
        },
      });
    }
    return materials.sort(
      (left, right) =>
        left.snapshot.generation - right.snapshot.generation ||
        left.publication.id.localeCompare(right.publication.id),
    );
  }

  private buildReleaseRecoveryOperationSnapshots(
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): ReleaseRecoveryOperationSnapshot[] {
    const snapshots: ReleaseRecoveryOperationSnapshot[] = [];
    for (const operation of this.releaseOperations.values()) {
      if (
        operation.workspaceId !== input.workspaceId ||
        operation.environmentId !== input.environmentId ||
        operation.documentId !== input.documentId ||
        (operation.action !== 'rollback' && operation.action !== 'unpublish') ||
        (operation.status !== 'completed' && operation.status !== 'failed')
      ) {
        continue;
      }
      const request = releaseRecoveryRequestFromOperation(operation);
      const result = this.releaseRecoveryResultFromOperation(operation, false);
      if (!request || !result) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      snapshots.push({
        id: operation.id,
        workspaceId: operation.workspaceId,
        environmentId: operation.environmentId,
        documentId: operation.documentId,
        request,
        result,
      });
    }
    return snapshots;
  }

  private buildReleaseRecoveryHistory(
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): ReleaseHistoryEntry[] {
    const history: ReleaseHistoryEntry[] = [];
    const successfulMaterials = this.buildReleaseRecoveryPublicationSnapshots(input);
    for (const { operation, publication, snapshot } of successfulMaterials) {
      if (!operation.completedAt || operation.resultGeneration === null) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const identity = {
        id: operation.id,
        workspaceId: operation.workspaceId,
        environmentId: operation.environmentId,
        documentId: operation.documentId,
        releaseOperationId: operation.id,
        generation: operation.resultGeneration,
        idempotencyKey: operation.idempotencyKey,
        correlationId: operation.correlationId,
        actorUserId: operation.requestedByUserId,
        occurredAt: operation.completedAt,
      };
      if (operation.action === 'publish') {
        history.push({
          ...identity,
          action: 'publish',
          state: 'active',
          publicationId: publication.id,
          previousPublicationId: publication.previousPublicationId,
          artifact: clone(snapshot.artifact),
        });
      } else if (operation.action === 'promote' && operation.sourcePublicationId) {
        history.push({
          ...identity,
          action: 'promote',
          state: 'active',
          publicationId: publication.id,
          sourcePublicationId: operation.sourcePublicationId,
          previousPublicationId: publication.previousPublicationId,
          artifact: clone(snapshot.artifact),
        });
      } else if (
        operation.action === 'rollback' &&
        operation.sourcePublicationId &&
        publication.previousPublicationId &&
        operation.reason
      ) {
        history.push({
          ...identity,
          action: 'rollback',
          state: 'active',
          publicationId: publication.id,
          targetPublicationId: operation.sourcePublicationId,
          previousPublicationId: publication.previousPublicationId,
          reason: operation.reason,
          artifact: clone(snapshot.artifact),
        });
      } else {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
    }

    for (const operation of this.releaseOperations.values()) {
      if (
        operation.workspaceId !== input.workspaceId ||
        operation.environmentId !== input.environmentId ||
        operation.documentId !== input.documentId ||
        (operation.action !== 'rollback' && operation.action !== 'unpublish') ||
        (operation.status !== 'completed' && operation.status !== 'failed')
      ) {
        continue;
      }
      if (!operation.completedAt || !operation.reason) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const request = releaseRecoveryRequestFromOperation(operation);
      const result = this.releaseRecoveryResultFromOperation(operation, false);
      if (!request || !result) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      if (result.ok && result.action === 'unpublish') {
        history.push({
          id: operation.id,
          workspaceId: operation.workspaceId,
          environmentId: operation.environmentId,
          documentId: operation.documentId,
          releaseOperationId: operation.id,
          generation: result.generation,
          idempotencyKey: operation.idempotencyKey,
          correlationId: operation.correlationId,
          actorUserId: operation.requestedByUserId,
          occurredAt: operation.completedAt,
          action: 'unpublish',
          state: 'inactive',
          previousPublicationId: result.previousPublicationId,
          reason: operation.reason,
          deactivatedArtifact: clone(result.deactivatedArtifact),
        });
      } else if (!result.ok) {
        const failureBase = {
          id: operation.id,
          workspaceId: operation.workspaceId,
          environmentId: operation.environmentId,
          documentId: operation.documentId,
          releaseOperationId: operation.id,
          idempotencyKey: operation.idempotencyKey,
          correlationId: operation.correlationId,
          actorUserId: operation.requestedByUserId,
          occurredAt: operation.completedAt,
          state: 'failed' as const,
          reason: operation.reason,
          expectedGeneration: operation.expectedGeneration,
          ...(result.actualGeneration !== undefined
            ? { actualGeneration: result.actualGeneration }
            : {}),
          ...(result.expectedActivePublicationId
            ? { expectedActivePublicationId: result.expectedActivePublicationId }
            : {}),
          ...(result.actualActivePublicationId !== undefined
            ? { actualActivePublicationId: result.actualActivePublicationId }
            : {}),
          failure: { code: result.code, message: result.message },
        };
        history.push(
          request.action === 'rollback'
            ? {
                ...failureBase,
                action: 'rollback',
                targetPublicationId: request.targetPublicationId,
              }
            : { ...failureBase, action: 'unpublish' },
        );
      }
    }
    return history.sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
    );
  }

  private releaseRecoveryResultFromOperation(
    operation: PersistedReleaseOperation,
    replayed: boolean,
  ): ReleaseRecoveryResult | null {
    if (operation.action !== 'rollback' && operation.action !== 'unpublish') return null;
    if (operation.status === 'failed') {
      if (!isReleaseRecoveryFailureCode(operation.errorCode)) return null;
      const result: ReleaseRecoveryFailure = {
        ok: false,
        action: operation.action,
        state: 'failed',
        replayed,
        code: operation.errorCode,
        message: RELEASE_RECOVERY_FAILURE_MESSAGES[operation.errorCode],
        releaseOperationId: operation.id,
        expectedGeneration: operation.expectedGeneration,
        ...(operation.resultGeneration !== null
          ? { actualGeneration: operation.resultGeneration }
          : {}),
        ...(operation.requestedActivePublicationId
          ? { expectedActivePublicationId: operation.requestedActivePublicationId }
          : {}),
        ...(operation.actualActivePublicationId
          ? { actualActivePublicationId: operation.actualActivePublicationId }
          : operation.errorCode === 'already_inactive'
            ? { actualActivePublicationId: null }
            : {}),
      };
      return result;
    }
    if (
      operation.status !== 'completed' ||
      operation.resultGeneration === null ||
      !operation.completedAt ||
      !operation.actualActivePublicationId
    ) {
      return null;
    }
    if (operation.action === 'rollback') {
      if (
        !operation.sourcePublicationId ||
        !operation.resultPublicationId ||
        !operation.requestedSourcePublicationId
      ) {
        return null;
      }
      const publication = this.findPublicationById(
        operation.workspaceId,
        operation.resultPublicationId,
      );
      const artifact = publication
        ? extractHistoricalReleaseArtifactPins(publication.artifact)
        : null;
      if (
        !publication ||
        !artifact ||
        publication.environmentId !== operation.environmentId ||
        publication.documentId !== operation.documentId ||
        publication.releaseOperationId !== operation.id ||
        publication.action !== 'rollback' ||
        publication.sourcePublicationId !== operation.sourcePublicationId ||
        publication.previousPublicationId !== operation.actualActivePublicationId ||
        publication.compiledArtifactId !== operation.requestedArtifactId
      ) {
        return null;
      }
      return {
        ok: true,
        action: 'rollback',
        state: 'active',
        replayed,
        releaseOperationId: operation.id,
        publicationId: publication.id,
        targetPublicationId: operation.sourcePublicationId,
        previousPublicationId: operation.actualActivePublicationId,
        generation: operation.resultGeneration,
        artifact,
        completedAt: operation.completedAt,
      };
    }
    const previousPublication = this.findPublicationById(
      operation.workspaceId,
      operation.actualActivePublicationId,
    );
    const deactivatedArtifact = previousPublication
      ? extractHistoricalReleaseArtifactPins(previousPublication.artifact)
      : null;
    if (
      !previousPublication ||
      !deactivatedArtifact ||
      previousPublication.environmentId !== operation.environmentId ||
      previousPublication.documentId !== operation.documentId
    ) {
      return null;
    }
    return {
      ok: true,
      action: 'unpublish',
      state: 'inactive',
      replayed,
      releaseOperationId: operation.id,
      previousPublicationId: operation.actualActivePublicationId,
      generation: operation.resultGeneration,
      deactivatedArtifact,
      completedAt: operation.completedAt,
    };
  }

  private persistFailedRecoveryOperation(
    input: ReleaseRecoveryScopeInput,
    request: ReleaseRecoveryRequest,
    requestHash: string,
    operationId: string,
    occurredAt: string,
    result: ReleaseRecoveryFailure,
  ): void {
    this.releaseOperations.set(
      this.key(input.workspaceId, input.environmentId, input.documentId, request.idempotencyKey),
      {
        id: operationId,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        action: request.action,
        requestedArtifactId: null,
        requestedSourcePublicationId:
          request.action === 'rollback' ? request.targetPublicationId : null,
        requestedActivePublicationId: request.expectedActivePublicationId ?? null,
        actualActivePublicationId:
          typeof result.actualActivePublicationId === 'string'
            ? result.actualActivePublicationId
            : null,
        sourcePublicationId: null,
        expectedGeneration: request.expectedGeneration,
        resultGeneration: result.actualGeneration ?? null,
        idempotencyKey: request.idempotencyKey,
        requestHash,
        status: 'failed',
        correlationId: request.correlationId,
        requestedByUserId: input.actorUserId,
        resultPublicationId: null,
        reason: request.reason,
        errorCode: result.code,
        createdAt: occurredAt,
        completedAt: occurredAt,
      },
    );
  }

  private findPublicationById(
    workspaceId: string,
    publicationId: string,
  ): PersistedPublication | null {
    const publication = [...this.publications.values()]
      .flat()
      .find((candidate) => candidate.workspaceId === workspaceId && candidate.id === publicationId);
    return publication ? clone(publication) : null;
  }

  private resolveExistingReleaseOperation(
    input: ActivateCompiledArtifactInput,
    operation: PersistedReleaseOperation,
  ): ReleaseActivationResult {
    const requestChanged =
      operation.requestHash !== input.requestHash ||
      operation.action !== (input.action ?? 'publish') ||
      operation.requestedArtifactId !== input.artifact.id ||
      operation.sourcePublicationId !== (input.sourcePublicationId ?? null) ||
      operation.expectedGeneration !== input.expectedGeneration;
    if (requestChanged) {
      throw new IdempotencyConflictError(input.idempotencyKey);
    }
    if (operation.status === 'activating' || operation.status === 'awaiting_approval') {
      throw new ReleaseOperationInProgressError(input.idempotencyKey);
    }
    if (operation.status === 'failed') {
      const currentDeployment = this.documentDeployments.get(
        this.key(operation.workspaceId, operation.environmentId, operation.documentId),
      );
      if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
        throw new DeploymentChangedError(
          operation.expectedGeneration,
          operation.resultGeneration ?? currentDeployment?.generation ?? 0,
        );
      }
      throw new Error(operation.errorCode ?? 'release operation failed');
    }
    if (!operation.resultPublicationId) {
      throw new Error('completed release operation has no result publication');
    }
    const publication = (
      this.publications.get(this.key(operation.workspaceId, operation.environmentId)) ?? []
    ).find((candidate) => candidate.id === operation.resultPublicationId);
    if (!publication) {
      throw new Error('release operation result publication not found');
    }
    const deployment: PersistedDocumentDeployment = {
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: operation.resultGeneration ?? operation.expectedGeneration + 1,
      updatedAt: operation.completedAt ?? publication.publishedAt,
    };
    return {
      operation: clone(operation),
      publication: clone(publication),
      deployment: clone(deployment),
      replayed: true,
    };
  }

  private releaseOperationKey(operation: PersistedReleaseOperation): string {
    return this.key(
      operation.workspaceId,
      operation.environmentId,
      operation.documentId,
      operation.idempotencyKey,
    );
  }

  private artifactIdentityKey(
    workspaceId: string,
    documentId: string,
    contentHash: string,
  ): string {
    return this.key(workspaceId, documentId, contentHash);
  }

  private productStyleApplicationKey(
    workspaceId: string,
    themeId: string,
    proposalId: string,
  ): string {
    return this.key(workspaceId, themeId, proposalId);
  }

  private key(...parts: string[]): string {
    return parts.join('\u0000');
  }

  private resolveActiveAuthoringScope(
    installationId: string,
    exactOrigin: string,
  ): {
    installation: PublicSdkInstallationRecord;
    environment: WorkspaceEnvironment & { kind: AuthoringEnvironment };
  } | null {
    const installation = this.publicSdkInstallations.get(installationId);
    if (!installation || installation.revokedAt) return null;
    const mappings = this.publicSdkInstallationOrigins.filter(
      (candidate) =>
        candidate.installationId === installationId &&
        candidate.workspaceId === installation.workspaceId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.authoringEnabled,
    );
    if (mappings.length !== 1) return null;
    const [mapping] = mappings;
    if (!mapping) return null;
    const environment = this.environments.get(this.key(mapping.workspaceId, mapping.environmentId));
    if (
      !environment ||
      environment.kind === 'production' ||
      environment.enabled === false ||
      environment.authoringEnabled === false ||
      !environment.originAllowlist.includes(exactOrigin)
    ) {
      return null;
    }
    return {
      installation,
      environment: environment as WorkspaceEnvironment & { kind: AuthoringEnvironment },
    };
  }

  private isResolvedDocumentIntent(
    workspaceId: string,
    documentIntent?: AuthoringDocumentIntent,
  ): boolean {
    if (!documentIntent || documentIntent.kind === 'new-draft') return true;
    const document = this.documents.get(this.key(workspaceId, documentIntent.documentId));
    return Boolean(document && document.document.type === 'tour');
  }

  private mutateAuthoringActivationGrant(
    input: ConsumeAuthoringActivationGrantInput,
    operation: 'consume' | 'revoke',
  ): AuthoringActivationGrantRecord | null {
    const exactOrigin = normalizeExactOrigin(input.exactOrigin);
    if (!exactOrigin || !isSha256Hash(input.grantHash)) return null;
    const candidates = [...this.authoringActivationGrants.values()].filter(
      (candidate) =>
        candidate.installationId === input.installationId &&
        candidate.exactOrigin === exactOrigin &&
        candidate.grantHash === input.grantHash &&
        !candidate.usedAt &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    if (candidates.length !== 1) return null;
    const [grant] = candidates;
    if (!grant) return null;
    const scope = this.resolveActiveAuthoringScope(input.installationId, exactOrigin);
    if (
      !scope ||
      scope.installation.workspaceId !== grant.workspaceId ||
      scope.environment.id !== grant.environmentId ||
      !this.hasAuthoringMembership(grant.workspaceId, grant.creatorId)
    ) {
      return null;
    }
    const now = new Date().toISOString();
    const mutated: AuthoringActivationGrantRecord = {
      ...grant,
      ...(operation === 'consume' ? { usedAt: now } : { revokedAt: now }),
    };
    this.authoringActivationGrants.set(mutated.grantId, mutated);
    return clone(mutated);
  }

  private hasAuthoringMembership(workspaceId: string, userId: string): boolean {
    const membership = this.workspaceMemberships.get(this.key(workspaceId, userId));
    return Boolean(membership && hasAuthoringWorkspaceRole(membership.role));
  }

  private invalidateAuthoringSessionsForInstallationOrigin(
    workspaceId: string,
    installationId: string,
    exactOrigin: string,
  ): void {
    const revokedAt = new Date().toISOString();
    for (const [key, session] of this.authoringSessions) {
      if (
        session.workspaceId !== workspaceId ||
        session.installationId !== installationId ||
        session.customerOrigin !== exactOrigin ||
        session.revokedAt
      ) {
        continue;
      }
      this.authoringSessions.set(key, { ...session, revokedAt });
    }
  }
}

export function createReleaseRecoveryRequestHash(
  input: Pick<
    ReleaseRecoveryScopeInput,
    'workspaceId' | 'environmentId' | 'documentId' | 'actorUserId'
  >,
  request: ReleaseRecoveryRequest,
): string {
  const canonicalRequest = {
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    actorUserId: input.actorUserId,
    action: request.action,
    reason: request.reason,
    expectedGeneration: request.expectedGeneration,
    expectedActivePublicationId: request.expectedActivePublicationId ?? null,
    targetPublicationId: request.action === 'rollback' ? request.targetPublicationId : null,
    idempotencyKey: request.idempotencyKey,
    correlationId: request.correlationId,
  };
  return `sha256-${createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex')}`;
}

function releaseRecoveryOperationMatchesRequest(
  operation: PersistedReleaseOperation,
  input: ReleaseRecoveryScopeInput,
  request: ReleaseRecoveryRequest,
  requestHash: string,
): boolean {
  return (
    operation.workspaceId === input.workspaceId &&
    operation.environmentId === input.environmentId &&
    operation.documentId === input.documentId &&
    operation.requestedByUserId === input.actorUserId &&
    operation.action === request.action &&
    operation.reason === request.reason &&
    operation.expectedGeneration === request.expectedGeneration &&
    operation.requestedActivePublicationId === (request.expectedActivePublicationId ?? null) &&
    operation.requestedSourcePublicationId ===
      (request.action === 'rollback' ? request.targetPublicationId : null) &&
    operation.idempotencyKey === request.idempotencyKey &&
    operation.correlationId === request.correlationId &&
    operation.requestHash === requestHash
  );
}

function releaseRecoveryRequestFromOperation(
  operation: PersistedReleaseOperation,
): ReleaseRecoveryRequest | null {
  if ((operation.action !== 'rollback' && operation.action !== 'unpublish') || !operation.reason) {
    return null;
  }
  const shared = {
    reason: operation.reason,
    expectedGeneration: operation.expectedGeneration,
    ...(operation.requestedActivePublicationId
      ? { expectedActivePublicationId: operation.requestedActivePublicationId }
      : {}),
    idempotencyKey: operation.idempotencyKey,
    correlationId: operation.correlationId,
  };
  if (operation.action === 'rollback') {
    if (!operation.requestedSourcePublicationId) return null;
    return {
      action: 'rollback',
      targetPublicationId: operation.requestedSourcePublicationId,
      ...shared,
    };
  }
  return { action: 'unpublish', ...shared };
}

function createCompletedRecoveryOperation(
  input: ReleaseRecoveryScopeInput,
  request: ReleaseRecoveryRequest,
  requestHash: string,
  result: Exclude<ReleaseRecoveryResult, ReleaseRecoveryFailure>,
  occurredAt: string,
): PersistedReleaseOperation {
  const rollback = result.action === 'rollback' ? result : null;
  return {
    id: result.releaseOperationId,
    workspaceId: input.workspaceId,
    environmentId: input.environmentId,
    documentId: input.documentId,
    action: request.action,
    requestedArtifactId: rollback?.artifact.compiledArtifactId ?? null,
    requestedSourcePublicationId:
      request.action === 'rollback' ? request.targetPublicationId : null,
    requestedActivePublicationId: request.expectedActivePublicationId ?? null,
    actualActivePublicationId: result.previousPublicationId,
    sourcePublicationId: rollback?.targetPublicationId ?? null,
    expectedGeneration: request.expectedGeneration,
    resultGeneration: result.generation,
    idempotencyKey: request.idempotencyKey,
    requestHash,
    status: 'completed',
    correlationId: request.correlationId,
    requestedByUserId: input.actorUserId,
    resultPublicationId: rollback?.publicationId ?? null,
    reason: request.reason,
    errorCode: null,
    createdAt: occurredAt,
    completedAt: occurredAt,
  };
}

function createPersistedRecoveryFailure(
  request: ReleaseRecoveryRequest,
  code: ReleaseRecoveryFailureCode,
  operationId: string,
  deployment: PersistedDocumentDeployment | null,
): ReleaseRecoveryFailure {
  return {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    releaseOperationId: operationId,
    expectedGeneration: request.expectedGeneration,
    ...(deployment ? { actualGeneration: deployment.generation } : {}),
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
    ...(deployment?.state === 'active'
      ? {
          actualActivePublicationId: deployment.activePublicationId,
        }
      : {}),
  };
}

function createNonPersistingRecoveryFailure(
  request: ReleaseRecoveryRequest,
  code: ReleaseRecoveryFailureCode,
  releaseOperationId?: string,
): ReleaseRecoveryFailure {
  return {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    ...(releaseOperationId ? { releaseOperationId } : {}),
    expectedGeneration: request.expectedGeneration,
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
  };
}

function releaseRecoveryPermissions(
  environment: WorkspaceEnvironment,
  membershipRole: ControlPlaneRole | null,
): ReleaseRecoveryStateResponse['permissions'] {
  if (!membershipRole) return { rollback: false, unpublish: false };
  return {
    rollback:
      releaseRecoveryPolicyFailure(environment, membershipRole, 'permissions', 'rollback') === null,
    unpublish:
      releaseRecoveryPolicyFailure(environment, membershipRole, 'permissions', 'unpublish') ===
      null,
  };
}

function releaseRecoveryPolicyFailure(
  environment: WorkspaceEnvironment,
  membershipRole: ControlPlaneRole | null,
  actorUserId: string,
  action: ReleaseRecoveryRequest['action'],
): ReleaseRecoveryFailureCode | null {
  if (!membershipRole) return 'capability_denied';
  const decision = evaluateEnvironmentReleasePolicy({
    environment: toWorkspaceEnvironmentPolicyRow(environment),
    actorRole: membershipRole,
    actorUserId,
    action,
  });
  if (decision.allowed) return null;
  return decision.code === 'environment_disabled'
    ? 'environment_not_configured'
    : 'capability_denied';
}

function toControlPlaneRole(role: string | undefined): ControlPlaneRole | null {
  return role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer'
    ? role
    : null;
}

function isReleaseRecoveryFailureCode(code: string | null): code is ReleaseRecoveryFailureCode {
  return Boolean(code && RELEASE_RECOVERY_FAILURE_CODES.some((candidate) => candidate === code));
}

function assertArtifactMatchesDocument(input: SaveDocumentInput): void {
  if (input.artifact && input.artifact.documentId !== input.document.id) {
    throw new Error('compiled artifact document mismatch');
  }
}

function createOpaqueRecordId(prefix: 'authreq' | 'authgrant' | 'authsess'): string {
  return `${prefix}_${randomUUID()}`;
}

export function isSha256Hash(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

export function isAuthoringPkceChallenge(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/u.test(value);
}

export function isValidAuthoringCapabilities(
  capabilities: AuthoringActivationCapability[],
): boolean {
  const allowedCapabilities = new Set<AuthoringActivationCapability>(
    Object.values(AUTHORING_ACTIVATION_CAPABILITIES),
  );
  return (
    capabilities.length > 0 &&
    capabilities.length <= allowedCapabilities.size &&
    new Set(capabilities).size === capabilities.length &&
    capabilities.every((capability) => allowedCapabilities.has(capability))
  );
}

export function isValidAuthoringDocumentIntent(documentIntent?: AuthoringDocumentIntent): boolean {
  if (!documentIntent) return true;
  return validate(AuthoringDocumentIntentSchema, documentIntent).valid;
}

export function canActivateDocumentIntent(
  grant: AuthoringActivationGrantRecord,
  requestedIntent: AuthoringDocumentIntent,
): boolean {
  const requiredCapability =
    requestedIntent.kind === 'new-draft'
      ? AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT
      : AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT;
  if (!grant.capabilities.includes(requiredCapability)) return false;
  if (!grant.documentIntent) return true;
  if (grant.documentIntent.kind !== requestedIntent.kind) return false;
  if (grant.documentIntent.kind === 'new-draft') {
    return requestedIntent.kind === 'new-draft' && requestedIntent.documentType === 'tour';
  }
  return (
    requestedIntent.kind === 'existing' &&
    grant.documentIntent.documentId === requestedIntent.documentId
  );
}

export function getAuthoringDocumentSessionCapabilities(
  environment: AuthoringEnvironment,
): AuthoringSessionCapability[] {
  const capabilities: AuthoringSessionCapability[] = [
    AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
    AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
    AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
    AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET,
    AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
  ];
  if (environment === 'staging') {
    capabilities.push(
      AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING,
      AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
      AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
      AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
      AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE,
      AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE,
    );
  }
  if (!isValidAuthoringSessionCapabilitySet(capabilities)) {
    throw new Error('canonical authoring-session capability set is invalid');
  }
  return capabilities;
}

export function createServerOwnedTourDraft(
  workspaceId: string,
  environment: AuthoringEnvironment,
  exactOrigin: string,
  pageContext: AuthoringPageContext,
  defaultTheme?: Pick<WorkspaceThemeRecord, 'id' | 'activeVersionId'> | null,
): LodariqDocument {
  const themeBinding = defaultTheme?.activeVersionId
    ? {
        policy: 'workspace-current' as const,
        themeId: defaultTheme.id,
        acknowledgedThemeVersionId: defaultTheme.activeVersionId,
      }
    : null;
  return {
    id: `doc_tour_${randomUUID()}`,
    workspaceId,
    type: 'tour',
    status: 'draft',
    title: AUTHORING_TOUR_DRAFT_TITLE,
    schemaVersion: '1.0.0',
    trigger: {
      type: 'urlMatch',
      config: { pattern: `${exactOrigin}${pageContext.pathname}`, mode: 'exact' },
    },
    audience: { environments: [environment] },
    ...(themeBinding ? { themeBinding } : {}),
    appearance: structuredClone(DEFAULT_EXPERIENCE_APPEARANCE),
    targets: [],
    blocks: [],
  };
}

export function authoringSessionThemeReference(
  document: LodariqDocument,
): AuthoringSessionThemeReference | null {
  const binding = document.themeBinding;
  if (!binding) {
    if (document.themeRef?.trim()) return null;
    return {
      source: 'fallback',
      themeId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeId,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
    };
  }
  return {
    source: 'workspace',
    themeId: binding.themeId,
    themeVersionId:
      binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId,
  };
}

export function createAuthoringSessionCompatibilityPins(
  themeVersionId: string,
): AuthoringSessionCompatibilityPins {
  if (!themeVersionId.trim()) {
    throw new Error('authoring session compatibility requires an exact theme version');
  }
  return {
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId,
  };
}

export function isTrustedEditorIframeSrc(value: string): boolean {
  try {
    return new URL(value).origin === LODARIQ_EDITOR_ORIGIN;
  } catch {
    return false;
  }
}

export function hasValidFutureTtl(expiresAt: string, maxTtlMs: number): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  const ttlMs = expiresAtMs - Date.now();
  return Number.isFinite(expiresAtMs) && ttlMs > 0 && ttlMs <= maxTtlMs;
}

export function hasValidBoundedFutureTtl(
  expiresAt: string,
  minTtlMs: number,
  maxTtlMs: number,
): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  const ttlMs = expiresAtMs - Date.now();
  return Number.isFinite(expiresAtMs) && ttlMs >= minTtlMs && ttlMs <= maxTtlMs;
}

export function normalizeExactOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    const isOriginOnly = parsed.pathname === '/' && !parsed.search && !parsed.hash;
    const hasCredentials = Boolean(parsed.username || parsed.password);
    if (!isHttp || !isOriginOnly || hasCredentials || parsed.origin === 'null') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function assertPublicSdkInstallationOriginPolicy(
  environment: Environment,
  exactOrigin: string,
  authoringEnabled: boolean,
): void {
  if (environment !== 'production') return;
  if (!exactOrigin.startsWith('https://')) {
    throw new Error('production public SDK origins must use HTTPS');
  }
  if (authoringEnabled) {
    throw new Error('authoring cannot be enabled for a production environment');
  }
}

export function assertPublicSdkInstallationEnvironmentPolicy(
  environment: Pick<WorkspaceEnvironment, 'kind' | 'enabled' | 'authoringEnabled'>,
  mappingAuthoringEnabled: boolean,
): void {
  if (environment.enabled === false) {
    throw new Error('environment is disabled');
  }
  if (!mappingAuthoringEnabled) return;
  if (environment.kind === 'production') {
    throw new Error('authoring cannot be enabled for a production environment');
  }
  if (environment.authoringEnabled === false) {
    throw new Error('authoring is disabled for the environment');
  }
}

export function assertPublicSdkInstallationEnvironmentOrigin(
  environment: Pick<WorkspaceEnvironment, 'id' | 'kind' | 'originAllowlist'>,
  exactOrigin: string,
): void {
  const allowedOrigins = normalizeEnvironmentOriginAllowlist(
    environment.originAllowlist,
    environment.kind,
    environment.id,
  );
  if (!allowedOrigins.includes(exactOrigin)) {
    throw new Error('public SDK origin is not allowlisted for the environment');
  }
}

export function normalizeEnvironmentOriginAllowlist(
  value: unknown,
  kind: Environment,
  environmentId: string,
): string[] {
  const invalid = (): never => {
    throw new WorkspaceEnvironmentPolicyInvalidError([
      { code: 'origin_invalid', field: 'originAllowlist', environmentId },
    ]);
  };
  if (!Array.isArray(value) || value.length > 100) return invalid();
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (
      typeof candidate !== 'string' ||
      candidate.length < 1 ||
      candidate.length > 2048 ||
      normalizeExactOrigin(candidate) !== candidate ||
      seen.has(candidate)
    ) {
      return invalid();
    }
    const parsed = new URL(candidate);
    if (kind === 'production' && parsed.protocol !== 'https:') return invalid();
    if (
      parsed.protocol === 'http:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1' &&
      parsed.hostname !== '[::1]'
    ) {
      return invalid();
    }
    origins.push(candidate);
    seen.add(candidate);
  }
  return origins;
}

export function normalizeAuthoringPathname(value: string): string | null {
  const result = validate(AuthoringPageContextSchema, { pathname: value });
  return result.valid ? result.value.pathname : null;
}

export function isAuthoringDocumentQueryScope(value: string): value is AuthoringDocumentQueryScope {
  return value === 'page' || value === 'workspace';
}

/**
 * Route matching is deliberately literal and semantic. Coordinates and CSS
 * selectors are never used to decide whether a document belongs to a page.
 */
export function matchesAuthoringPageContext(
  document: LodariqDocument,
  customerOrigin: string,
  pageContext: AuthoringPageContext,
): boolean {
  const exactOrigin = normalizeExactOrigin(customerOrigin);
  const pathname = normalizeAuthoringPathname(pageContext.pathname);
  if (!exactOrigin || !pathname) return false;
  if (document.trigger.type === 'pageLoad') return true;
  if (document.trigger.type !== 'urlMatch') return false;

  const candidates = [pathname, `${exactOrigin}${pathname}`];
  const mode = document.trigger.config.mode ?? 'exact';
  const pattern = document.trigger.config.pattern;
  if (mode === 'prefix') return candidates.some((candidate) => candidate.startsWith(pattern));
  if (mode === 'contains') return candidates.some((candidate) => candidate.includes(pattern));
  return candidates.includes(pattern);
}

export function requireExactHttpOrigin(value: string): string {
  const exactOrigin = normalizeExactOrigin(value);
  if (!exactOrigin) {
    throw new Error('origin must be an origin-only HTTP(S) URL without credentials');
  }
  return exactOrigin;
}

export function assertPublicSdkInstallationId(installationId: string): void {
  if (!/^ins_pub_[A-Za-z0-9_-]{16,128}$/u.test(installationId)) {
    throw new Error('public SDK installation id must use the ins_pub_ format');
  }
}

export function assertPublicSdkBootstrapGrantLifetime(expiresAt: string): void {
  const expiresAtMs = Date.parse(expiresAt);
  const ttlMs = expiresAtMs - Date.now();
  if (
    !Number.isFinite(expiresAtMs) ||
    ttlMs <= 0 ||
    ttlMs > PUBLIC_SDK_BOOTSTRAP_GRANT_MAX_TTL_MS
  ) {
    throw new Error('bootstrap grant expiry must be within the short-lived TTL');
  }
}

export function isPublicSdkBootstrapGrantHash(grantHash: string): boolean {
  return /^[0-9a-f]{64}$/u.test(grantHash);
}

export function assertPublicSdkBootstrapGrantHash(grantHash: string): void {
  if (!isPublicSdkBootstrapGrantHash(grantHash)) {
    throw new Error('bootstrap grant hash must be a SHA-256 hex digest');
  }
}

export function assertReleaseMutationGuardInput(
  input: Pick<
    ActivateCompiledArtifactInput,
    'idempotencyKey' | 'requestHash' | 'expectedGeneration'
  >,
): void {
  const guard = {
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    expectedGeneration: input.expectedGeneration,
  };
  if (!validate(ReleaseMutationGuard, guard).valid) {
    throw new Error(
      'release mutation requires a valid idempotency key, request hash, and generation',
    );
  }
}

const FORBIDDEN_STYLE_SOURCE_KEYS = new Set([
  'boundingRect',
  'className',
  'classNames',
  'coordinates',
  'css',
  'dom',
  'domSnapshot',
  'html',
  'rawCss',
  'selector',
  'selectors',
  'stylesheet',
  'stylesheetText',
  'url',
]);

export function assertSafeStyleSource(source: ProductStyleSource): void {
  if (!validate(ProductStyleSourceSchema, source).valid) {
    throw new Error('style source must match ProductStyleSource');
  }
  assertBoundedJsonObject(source, 'style source');
  visitJsonObject(source, (key) => {
    if (FORBIDDEN_STYLE_SOURCE_KEYS.has(key)) {
      throw new Error(`style source must not persist ${key}`);
    }
  });
}

export function assertSafeProductStyleProposal(proposal: ProductStyleProposal): void {
  const validation = validate(ProductStyleProposalSchema, proposal);
  if (!validation.valid) {
    throw new Error('Product match proposal must match ProductStyleProposal');
  }
  assertBoundedJsonObject(proposal, 'Product match proposal');
  const sourceIds = new Set<string>();
  for (const source of proposal.sources) {
    assertSafeStyleSource(source);
    if (sourceIds.has(source.sourceId)) {
      throw new Error('Product match proposal sourceId values must be unique');
    }
    sourceIds.add(source.sourceId);
  }
}

export function createWorkspaceThemeDraftPreviewSnapshot(
  theme: Pick<WorkspaceThemeRecord, 'id' | 'name' | 'draft' | 'revision'>,
): BrandThemeSnapshot {
  assertWorkspaceThemeDraft(theme.draft);
  if (!Number.isSafeInteger(theme.revision) || theme.revision < 1) {
    throw new Error('workspace theme revision must be a positive integer');
  }
  const identityHash = createHash('sha256')
    .update(`${theme.id}\0${theme.revision}`)
    .digest('hex')
    .slice(0, 24);
  const immutableContent = {
    schemaVersion: BRAND_THEME_SCHEMA_VERSION,
    contractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeId: theme.id,
    themeVersionId: `themev_draft_${identityHash}_r${theme.revision}`,
    version: theme.revision,
    name: normalizeWorkspaceThemeName(theme.name),
    definition: clone(theme.draft),
  };
  const contentHash = hashCanonicalJson(immutableContent);
  const snapshot: BrandThemeSnapshot = { ...immutableContent, contentHash };
  const validation = validate(BrandThemeSnapshotSchema, snapshot);
  if (!validation.valid) {
    throw new Error('workspace theme draft preview failed BrandThemeSnapshot validation');
  }
  return validation.value;
}

export function productStyleProposalRequestHash(
  input: Pick<ApplyProductStyleProposalInput, 'environmentId' | 'proposal'>,
): string {
  return hashCanonicalJson({ environmentId: input.environmentId, proposal: input.proposal });
}

export function createProductStyleApplicationRecord(input: {
  id: string;
  input: ApplyProductStyleProposalInput;
  requestHash: string;
  appliedTheme: WorkspaceThemeRecord;
  sources: readonly StyleSourceRecord[];
  createdAt: string;
}): ProductStyleApplicationRecord {
  const sourceReceipts = [...input.sources]
    .sort(compareStyleSourceOrdinal)
    .map((source) => ({ sourceId: source.id, sourceHash: source.sourceHash }));
  const application: ProductStyleApplicationRecord = {
    id: input.id,
    workspaceId: input.input.workspaceId,
    themeId: input.input.themeId,
    environmentId: input.input.environmentId,
    requestHash: input.requestHash,
    sourceSetHash: hashCanonicalJson(sourceReceipts),
    receipt: {
      proposalId: input.input.proposal.proposalId,
      draftRevision: input.appliedTheme.revision,
      draftUpdatedAt: input.appliedTheme.updatedAt,
      previewTheme: createWorkspaceThemeDraftPreviewSnapshot(input.appliedTheme),
      sources: sourceReceipts,
      draftChanged: input.sources[0]?.draftChanged ?? false,
    },
    createdByUserId: input.input.actorUserId,
    createdAt: input.createdAt,
  };
  assertProductStyleApplicationIntegrity(application, input.sources);
  return application;
}

export function assertProductStyleProposalReplay(
  input: Pick<
    ApplyProductStyleProposalInput,
    'workspaceId' | 'themeId' | 'environmentId' | 'proposal'
  >,
  proposalHash: string,
  application: ProductStyleApplicationRecord,
  sources: readonly StyleSourceRecord[],
): void {
  const requestMatches =
    application.workspaceId === input.workspaceId &&
    application.themeId === input.themeId &&
    application.environmentId === input.environmentId &&
    application.receipt.proposalId === input.proposal.proposalId &&
    application.requestHash === proposalHash;
  if (!requestMatches) throw new ProductStyleProposalConflictError(input.proposal.proposalId);
  assertProductStyleApplicationIntegrity(application, sources);
}

export function assertProductStyleApplicationIntegrity(
  application: ProductStyleApplicationRecord,
  sources?: readonly StyleSourceRecord[],
): void {
  const canonicalReceipt = validate(AuthoringProductMatchApplyResultSchema, {
    ...application.receipt,
    replayed: false,
  });
  const previewTheme = application.receipt.previewTheme;
  const { contentHash: _contentHash, ...previewThemeContent } = previewTheme;
  const receiptIsValid =
    canonicalReceipt.valid &&
    application.id.trim().length > 0 &&
    application.workspaceId.trim().length > 0 &&
    application.themeId.trim().length > 0 &&
    application.environmentId.trim().length > 0 &&
    application.createdByUserId.trim().length > 0 &&
    /^sha256-[0-9a-f]{64}$/u.test(application.requestHash) &&
    /^sha256-[0-9a-f]{64}$/u.test(application.sourceSetHash) &&
    previewTheme.themeId === application.themeId &&
    previewTheme.version === application.receipt.draftRevision &&
    previewTheme.contentHash === hashCanonicalJson(previewThemeContent) &&
    application.sourceSetHash === hashCanonicalJson(application.receipt.sources);
  if (!receiptIsValid) {
    throw new Error('persisted Product match application receipt failed integrity validation');
  }
  if (!sources) return;

  const orderedSources = [...sources].sort(compareStyleSourceOrdinal);
  const sourceSetIsValid =
    orderedSources.length === application.receipt.sources.length &&
    orderedSources.every((source, ordinal) => {
      const receipt = application.receipt.sources[ordinal];
      return (
        receipt !== undefined &&
        source.workspaceId === application.workspaceId &&
        source.themeId === application.themeId &&
        source.environmentId === application.environmentId &&
        source.proposalId === application.receipt.proposalId &&
        source.proposalHash === application.requestHash &&
        source.sourceOrdinal === ordinal &&
        source.sourceCount === orderedSources.length &&
        source.appliedThemeRevision === application.receipt.draftRevision &&
        source.draftChanged === application.receipt.draftChanged &&
        source.id === receipt.sourceId &&
        source.sourceHash === receipt.sourceHash &&
        source.sourceHash === hashCanonicalJson(source.source) &&
        source.createdByUserId === application.createdByUserId &&
        source.createdAt === application.createdAt
      );
    });
  if (!sourceSetIsValid) {
    throw new Error('persisted Product match source set does not match its application receipt');
  }
}

function compareStyleSourceOrdinal(left: StyleSourceRecord, right: StyleSourceRecord): number {
  return left.sourceOrdinal - right.sourceOrdinal || left.id.localeCompare(right.id);
}

function compareStyleSourceHistory(left: StyleSourceRecord, right: StyleSourceRecord): number {
  const created = right.createdAt.localeCompare(left.createdAt);
  if (created !== 0) return created;
  if (left.proposalId === right.proposalId) return compareStyleSourceOrdinal(left, right);
  return right.id.localeCompare(left.id);
}

export function hashCanonicalJson(value: unknown): string {
  return `sha256-${createHash('sha256').update(canonicalThemeJson(value)).digest('hex')}`;
}

export function assertBoundedJsonObject(value: unknown, label: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`${label} must be JSON serializable`);
  }
  if (!serialized) throw new Error(`${label} must be JSON serializable`);
  if (serialized.length > 64_000) {
    throw new Error(`${label} must not exceed 64KB`);
  }
}

export function assertBrowserVerificationReport(report: BrowserVerificationReport): void {
  if (!validate(BrowserVerificationReportSchema, report).valid) {
    throw new Error('publication verification report must match BrowserVerificationReport');
  }
}

function visitJsonObject(value: unknown, visitor: (key: string) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitJsonObject(item, visitor);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    visitor(key);
    visitJsonObject(nested, visitor);
  }
}

export function assertRequiredApprovalCount(value: number): asserts value is 0 | 1 {
  if (value !== 0 && value !== 1) {
    throw new Error('requiredApprovalCount must be 0 or 1');
  }
}

export function normalizeIsoTimestamp(value: string, label: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

export function normalizeReleaseApprovalReason(reason?: string | null): string | null {
  if (reason === undefined || reason === null) return null;
  const normalized = reason.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new Error('release approval reason must be between 1 and 500 characters');
  }
  return normalized;
}

export function normalizeWorkspaceThemeName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new Error('workspace theme name must be between 1 and 120 characters');
  }
  return normalized;
}

export function assertWorkspaceThemeDraft(draft: BrandThemeDefinition): void {
  if (!validate(BrandThemeDefinitionSchema, draft).valid) {
    throw new Error('workspace theme draft must match BrandThemeDefinition');
  }
}

export function normalizeThemeGuardUpdatedAt(guard: WorkspaceThemeMutationGuard): string {
  if (!Number.isSafeInteger(guard.expectedRevision) || guard.expectedRevision < 1) {
    throw new Error('workspace theme expectedRevision must be a positive integer');
  }
  const timestamp = Date.parse(guard.expectedUpdatedAt);
  if (!Number.isFinite(timestamp)) {
    throw new Error('workspace theme expectedUpdatedAt must be an ISO timestamp');
  }
  return new Date(timestamp).toISOString();
}

export function assertWorkspaceThemeMutationGuard(
  current: Pick<WorkspaceThemeRecord, 'revision' | 'updatedAt'>,
  expectedRevision: number,
  expectedUpdatedAt: string,
): void {
  if (current.revision === expectedRevision && current.updatedAt === expectedUpdatedAt) return;
  throw new WorkspaceThemeChangedError(
    expectedRevision,
    current.revision,
    expectedUpdatedAt,
    current.updatedAt,
  );
}

export function createWorkspaceThemeVersion(
  theme: Pick<WorkspaceThemeRecord, 'id' | 'workspaceId' | 'name' | 'draft'>,
  version: number,
  actorUserId: string,
  createdAt: string,
): WorkspaceThemeVersionRecord {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('workspace theme version must be a positive integer');
  }
  assertWorkspaceThemeDraft(theme.draft);
  const id = `themev_${randomUUID()}`;
  const immutableContent = {
    schemaVersion: BRAND_THEME_SCHEMA_VERSION,
    contractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeId: theme.id,
    themeVersionId: id,
    version,
    name: normalizeWorkspaceThemeName(theme.name),
    definition: clone(theme.draft),
  };
  const contentHash = `sha256-${createHash('sha256')
    .update(canonicalThemeJson(immutableContent))
    .digest('hex')}`;
  const snapshot: BrandThemeSnapshot = { ...immutableContent, contentHash };
  const validated = validate(BrandThemeSnapshotSchema, snapshot);
  if (!validated.valid) {
    throw new Error('approved workspace theme snapshot failed BrandThemeSnapshot validation');
  }
  return {
    id,
    workspaceId: theme.workspaceId,
    themeId: theme.id,
    version,
    schemaVersion: validated.value.schemaVersion,
    contractVersion: validated.value.contractVersion,
    snapshot: validated.value,
    contentHash,
    approvedByUserId: actorUserId,
    approvedAt: createdAt,
    createdAt,
  };
}

export function assertVisualCheckReport(report: BasicVisualPreflightReport): void {
  if (!validate(BasicVisualPreflightReportSchema, report).valid) {
    throw new Error('visual check report must match BasicVisualPreflightReport');
  }
}

export function assertBrandDriftReport(report: BrandDriftAuditReport): void {
  if (!validate(BrandDriftAuditReportSchema, report).valid) {
    throw new Error('Brand drift report must match the bounded canonical schema');
  }
}

function canonicalThemeJson(value: unknown): string {
  return JSON.stringify(sortThemeHashValue(value));
}

function sortThemeHashValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortThemeHashValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, sortThemeHashValue((value as Record<string, unknown>)[key])]),
  );
}

export function themeImpactBinding(
  document: LodariqDocument,
  themeId: string,
): Pick<
  WorkspaceThemeImpactRecord,
  'bindingPolicy' | 'acknowledgedThemeVersionId' | 'pinnedThemeVersionId'
> | null {
  const binding = document.themeBinding;
  if (binding?.themeId === themeId) {
    if (binding.policy === 'workspace-current') {
      return {
        bindingPolicy: binding.policy,
        acknowledgedThemeVersionId: binding.acknowledgedThemeVersionId,
        pinnedThemeVersionId: null,
      };
    }
    return {
      bindingPolicy: binding.policy,
      acknowledgedThemeVersionId: null,
      pinnedThemeVersionId: binding.themeVersionId,
    };
  }
  if (document.themeRef === themeId) {
    return {
      bindingPolicy: 'legacy',
      acknowledgedThemeVersionId: null,
      pinnedThemeVersionId: null,
    };
  }
  return null;
}

function compiledArtifactMetadata(
  compiled: CompiledDocument,
): Pick<
  PersistedCompiledArtifact,
  'themeVersionId' | 'themeContentHash' | 'rendererContractVersion'
> {
  if (compiled.artifactSchemaVersion !== '2') return {};
  return {
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
  };
}

function compareArtifactsNewestFirst(
  left: PersistedCompiledArtifact,
  right: PersistedCompiledArtifact,
): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function compareWorkspaceThemes(left: WorkspaceThemeRecord, right: WorkspaceThemeRecord): number {
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  return right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}

function compareWorkspaceThemeImpact(
  left: WorkspaceThemeImpactRecord,
  right: WorkspaceThemeImpactRecord,
): number {
  return left.title.localeCompare(right.title) || left.documentId.localeCompare(right.documentId);
}

function compareVisualCheckRuns(left: VisualCheckRunRecord, right: VisualCheckRunRecord): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function compareAppendOnlyRecordsNewestFirst(
  left: { id: string; createdAt: string },
  right: { id: string; createdAt: string },
): number {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

function comparePublicationsNewestFirst(
  left: PersistedPublication,
  right: PersistedPublication,
): number {
  return right.publishedAt.localeCompare(left.publishedAt) || right.id.localeCompare(left.id);
}

function compareDeployments(
  left: PersistedDocumentDeployment,
  right: PersistedDocumentDeployment,
): number {
  return (
    left.environmentId.localeCompare(right.environmentId) ||
    left.documentId.localeCompare(right.documentId)
  );
}

function comparePublicSdkInstallations(
  left: PublicSdkInstallationRecord,
  right: PublicSdkInstallationRecord,
): number {
  const updatedOrder = right.updatedAt.localeCompare(left.updatedAt);
  return updatedOrder || left.installationId.localeCompare(right.installationId);
}

function comparePublicSdkInstallationOrigins(
  left: PublicSdkInstallationOriginRecord,
  right: PublicSdkInstallationOriginRecord,
): number {
  const environmentOrder = left.environmentId.localeCompare(right.environmentId);
  return environmentOrder || left.exactOrigin.localeCompare(right.exactOrigin);
}

export function assertAuthoritativeAnalyticsEvent(
  event: AuthoritativeAnalyticsEvent,
  workspaceId: string,
  environmentId: string,
): void {
  const validation = validate(AuthoritativeAnalyticsEventSchema, event);
  if (!validation.valid) {
    throw new Error('authoritative analytics event must match AuthoritativeAnalyticsEvent');
  }
  assertWorkspaceScope(event.workspaceId, workspaceId);
  if (event.environmentId !== environmentId) {
    throw new Error('analytics environment scope mismatch');
  }
  if (event.props) assertSafeAnalyticsProperties(event.props);
}

export function assertAnalyticsEnvironmentQuery(query: AnalyticsEnvironmentQuery): void {
  if (!validate(AnalyticsEnvironmentQuerySchema, query).valid) {
    throw new Error('analytics query must select one valid environment');
  }
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
    throw new Error('analytics query from must not be after to');
  }
}

function compareAnalyticsEventsNewestFirst(
  left: PersistedAnalyticsEventRecord,
  right: PersistedAnalyticsEventRecord,
): number {
  return (
    Date.parse(right.timestamp) - Date.parse(left.timestamp) || right.id.localeCompare(left.id)
  );
}

const FORBIDDEN_ANALYTICS_PROPERTY_KEYS = new Set(
  [...ANALYTICS_RESERVED_IDENTITY_KEYS, ...ANALYTICS_FORBIDDEN_PAYLOAD_KEYS].map((key) =>
    normalizeAnalyticsPropertyKey(key),
  ),
);
const RAW_ANALYTICS_URL_PATTERN = /https?:\/\//iu;
const ANALYTICS_EMAIL_PATTERN = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/u;
const ANALYTICS_CREDENTIAL_PATTERN =
  /\bBearer\s+|lod_(?:development|staging|production|authoring|activation|authorization|bootstrap)_/iu;

function assertSafeAnalyticsProperties(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('analytics event properties must be a bounded object');
  }
  if (depth > ANALYTICS_EVENT_LIMITS.nestingDepth) {
    throw new Error('analytics event properties exceed the nesting depth limit');
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_ANALYTICS_PROPERTY_KEYS.has(normalizeAnalyticsPropertyKey(key))) {
      throw new Error('analytics event properties must not contain identity or raw host data');
    }
    assertSafeAnalyticsPropertyValue(nestedValue, depth + 1);
  }
}

function assertSafeAnalyticsPropertyValue(value: unknown, depth: number): void {
  if (depth > ANALYTICS_EVENT_LIMITS.nestingDepth) {
    throw new Error('analytics event properties exceed the nesting depth limit');
  }
  if (typeof value === 'string') {
    if (
      RAW_ANALYTICS_URL_PATTERN.test(value) ||
      ANALYTICS_EMAIL_PATTERN.test(value) ||
      ANALYTICS_CREDENTIAL_PATTERN.test(value)
    ) {
      throw new Error('analytics event properties must not contain raw host or credential data');
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeAnalyticsPropertyValue(item, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    assertSafeAnalyticsProperties(value, depth);
  }
}

function normalizeAnalyticsPropertyKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/gu, '').toLowerCase();
}

function analyticsAggregateKey(event: PersistedAnalyticsEventRecord): string {
  return [
    event.workspaceId,
    event.environmentId,
    event.documentId,
    event.publicationId,
    event.contentHash,
    event.pointerGeneration,
    event.name,
    event.name === 'target_resolution' ? analyticsTargetResolutionStatus(event) : '',
  ].join('\0');
}

function analyticsTargetResolutionStatus(
  event: PersistedAnalyticsEventRecord,
): AnalyticsTargetResolutionStatus {
  const result = event.props?.['result'];
  if (
    typeof result === 'string' &&
    (ANALYTICS_TARGET_RESOLUTION_STATUSES as readonly string[]).includes(result)
  ) {
    return result as AnalyticsTargetResolutionStatus;
  }
  return 'unknown';
}

function compareAnalyticsAggregates(
  left: AnalyticsEventAggregate,
  right: AnalyticsEventAggregate,
): number {
  return (
    right.count - left.count ||
    right.lastTimestamp.localeCompare(left.lastTimestamp) ||
    left.name.localeCompare(right.name) ||
    left.publicationId.localeCompare(right.publicationId) ||
    left.pointerGeneration - right.pointerGeneration
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeIdentityEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashIdentityEmailLookup(emailNormalized: string): string {
  return createHash('sha256').update(emailNormalized, 'utf8').digest('hex');
}

type InMemoryAuthEmailRow =
  | { purpose: 'email_verification'; record: AuthOutboxRecord }
  | { purpose: 'set_password'; record: SetPasswordOutboxRecord };

function compareInMemoryAuthEmailRows(
  left: InMemoryAuthEmailRow,
  right: InMemoryAuthEmailRow,
): number {
  return (
    Date.parse(left.record.availableAt) - Date.parse(right.record.availableAt) ||
    Date.parse(left.record.createdAt) - Date.parse(right.record.createdAt) ||
    left.purpose.localeCompare(right.purpose) ||
    left.record.id.localeCompare(right.record.id)
  );
}

function isValidAuthEmailLeaseMutation(
  input: Pick<AcknowledgeAuthEmailRowInput, 'id' | 'purpose' | 'leaseVersion'>,
  timestampMs?: number,
): boolean {
  return (
    /^outbox_[A-Za-z0-9_-]{20,200}$/u.test(input.id) &&
    (input.purpose === 'email_verification' || input.purpose === 'set_password') &&
    Number.isSafeInteger(input.leaseVersion) &&
    input.leaseVersion >= 1 &&
    input.leaseVersion < 2_147_483_647 &&
    (timestampMs === undefined || Number.isFinite(timestampMs))
  );
}

function isCurrentAuthEmailLease(
  record: AuthOutboxRecord | SetPasswordOutboxRecord | undefined,
  leaseVersion: number,
  mutationAtMs?: number,
): record is AuthOutboxRecord | SetPasswordOutboxRecord {
  return Boolean(
    record &&
    record.processedAt === null &&
    (record.terminalAt ?? null) === null &&
    (record.leaseVersion ?? 0) === leaseVersion &&
    (mutationAtMs === undefined || Date.parse(record.availableAt) > mutationAtMs),
  );
}

function hasAuthoringWorkspaceRole(role: string): boolean {
  return role === 'member' || role === 'admin' || role === 'owner';
}

function identityWorkspaceRole(role: string): IdentityWorkspaceRecord['role'] | null {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') {
    return role;
  }
  return null;
}
