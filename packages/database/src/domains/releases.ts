import type {
  BrowserVerificationReport,
  CompiledDocument,
  DocumentDeployment,
  Environment,
  LodariqDocument,
  ReleaseRecoveryPublicationSnapshot,
  ReleaseRecoveryRequest,
} from '@lodariq/schema';

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

export interface ReleaseRecoveryPublicationMaterial {
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
