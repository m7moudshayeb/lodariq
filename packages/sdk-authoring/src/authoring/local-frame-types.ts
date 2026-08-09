import {
  AUTHORING_STAGING_RELEASE_STATES,
  type AuthoringReleaseFinding,
  type AuthoringStagingPublicationRequest,
  type AuthoringStagingPublicationResult,
  type AuthoringStagingReleaseState,
  type AuthoringStagingReleaseStateName,
  type LodariqDocument,
  type ProductStyleProposal,
} from '@lodariq/schema';

export { AUTHORING_STAGING_RELEASE_STATES };
export type {
  AuthoringReleaseFinding,
  AuthoringStagingPublicationRequest,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringStagingReleaseStateName,
};

export type LocalAuthoringFrameMetricName =
  | 'authoring.opened'
  | 'block.inserted'
  | 'target.pick.started'
  | 'target.pick.succeeded'
  | 'target.pick.failed'
  | 'target.pick.canceled'
  | 'preview.opened'
  | 'document.exported'
  | 'document.imported';

export const AUTHORING_BRAND_SOURCE_KINDS = [
  'approved-theme',
  'registered-tokens',
  'sampled-element',
  'accessible-fallback',
] as const;
export type AuthoringBrandSourceKind = (typeof AUTHORING_BRAND_SOURCE_KINDS)[number];

export interface AuthoringBrandSourceDescriptor {
  kind: AuthoringBrandSourceKind;
  label: string;
  detail: string;
  revision?: string;
}

export const AUTHORING_BRAND_STATUSES = [
  'approved',
  'draft',
  'waiting-approval',
  'fallback',
] as const;
export type AuthoringBrandStatus = (typeof AUTHORING_BRAND_STATUSES)[number];

export interface AuthoringBrandWorkspaceState {
  themeId?: string;
  themeName: string;
  version?: number;
  status: AuthoringBrandStatus;
  source: AuthoringBrandSourceDescriptor;
  canEdit: boolean;
  canApprove: boolean;
}

export const AUTHORING_BRAND_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type AuthoringBrandConfidence = (typeof AUTHORING_BRAND_CONFIDENCE_LEVELS)[number];

export const AUTHORING_BRAND_SEMANTIC_ROLES = [
  'accent',
  'surface',
  'text',
  'font',
  'radius',
] as const;
export type AuthoringBrandSemanticRole = (typeof AUTHORING_BRAND_SEMANTIC_ROLES)[number];

export interface AuthoringBrandRoleChange {
  role: AuthoringBrandSemanticRole;
  label: string;
  before: string;
  after: string;
  consequence?: string;
}

export interface AuthoringBrandMatchProposal {
  id: string;
  source: AuthoringBrandSourceDescriptor;
  confidence: AuthoringBrandConfidence;
  confidenceReason: string;
  requiresConfirmation: boolean;
  changes: AuthoringBrandRoleChange[];
  /** Canonical privacy-safe evidence retained for the apply boundary. */
  evidence: ProductStyleProposal;
}

export interface AuthoringBrandMatchRequest {
  documentId: string;
  targetId?: string;
  strategy: 'current-target' | 'select-element';
}

export interface AuthoringBrandMatchApplyResult {
  brand: AuthoringBrandWorkspaceState;
  savedAs: 'draft' | 'unchanged';
}

export const AUTHORING_RELEASE_CHECK_STATUSES = ['passed', 'warning', 'failed'] as const;
export type AuthoringReleaseCheckStatus = (typeof AUTHORING_RELEASE_CHECK_STATUSES)[number];

export interface AuthoringReleaseCheck {
  id: string;
  label: string;
  status: AuthoringReleaseCheckStatus;
  detail: string;
}

export const AUTHORING_VERIFICATION_STATES = ['not-run', 'running', 'passed', 'failed'] as const;
export type AuthoringVerificationState = (typeof AUTHORING_VERIFICATION_STATES)[number];

export interface AuthoringReleaseVerification {
  state: AuthoringVerificationState;
  verifiedAt?: string;
  exactOrigin?: string;
  checks: AuthoringReleaseCheck[];
}

export interface AuthoringReleaseArtifactState {
  version?: number;
  publicationId?: string;
  environmentId?: string;
  generation?: number;
  artifactId: string;
  contentHash: string;
  exactOrigin?: string;
  changedAt?: string;
}

export interface AuthoringStagingArtifactState extends AuthoringReleaseArtifactState {
  verification: AuthoringReleaseVerification;
}

export interface AuthoringReleaseWorkflowState {
  draft: {
    version?: number;
    contentHash?: string;
    dirty: boolean;
  };
  staging: AuthoringStagingArtifactState | null;
  production: AuthoringReleaseArtifactState | null;
  rendererVersion?: string;
  theme?: { name: string; version: number };
  changes?: string[];
  canVerify: boolean;
  canPromote: boolean;
  canApprove?: boolean;
  approvalOperationId?: string;
  approval: 'not-required' | 'required' | 'requested' | 'approved';
}

export interface AuthoringReleaseVerificationRequest {
  publicationId?: string;
  artifactId: string;
  contentHash: string;
}

export interface AuthoringReleaseVerificationResult {
  verification: AuthoringReleaseVerification;
}

export interface AuthoringExactArtifactPromotionRequest {
  sourcePublicationId?: string;
  productionEnvironmentId?: string;
  expectedGeneration?: number;
  artifactId: string;
  contentHash: string;
  expectedProductionArtifactId?: string;
}

export interface AuthoringExactArtifactPromotionResult {
  production: AuthoringReleaseArtifactState;
  replayed: boolean;
}

export interface AuthoringProductionApprovalRequest extends AuthoringExactArtifactPromotionRequest {
  operationId: string;
}

export interface LocalAuthoringFrameMetricEvent {
  sessionId: string;
  documentId: string;
  name: LocalAuthoringFrameMetricName;
}

export interface LocalAuthoringFrameServices {
  loadDocument: (id: string) => LodariqDocument | null;
  saveDocument: (doc: LodariqDocument) => void;
  /**
   * Optional durable save boundary. Local edits continue to use `saveDocument`
   * so typing and block operations never become network requests. Explicit
   * save requests await this service before reporting success to the host.
   */
  persistDocument?: (doc: LodariqDocument) => Promise<void>;
  /** Direct SDK hosts persist the save-result handoff after this frame replies. */
  persistDocumentOnSaveRequest?: boolean;
  exportDocument: (doc: LodariqDocument) => string;
  importDocument: (json: string) => LodariqDocument;
  resetDocuments: () => void;
  compilePreview: (doc: LodariqDocument) => Promise<unknown>;
  /** Hosted, authoring-session-scoped staging truth. Absent in local preview. */
  getReleaseState?: () => Promise<AuthoringStagingReleaseState>;
  /** Explains why release services are intentionally absent. */
  releaseUnavailableReason?: 'local-preview' | 'not-authorized';
  /**
   * Guarded staging publication. The hosted boundary owns HTTP headers and the
   * in-memory authoring-session bearer; creator UI receives normalized data.
   */
  publishToStaging?: (
    request: AuthoringStagingPublicationRequest,
  ) => Promise<AuthoringStagingPublicationResult>;
  /** Optional Slice 3 authoring-only Brand source and product-matching boundary. */
  getBrandWorkflowState?: () => Promise<AuthoringBrandWorkspaceState>;
  /**
   * For `select-element`, the host owns the modeless collapse/select/restore
   * interaction and returns only a privacy-safe semantic proposal.
   */
  sampleBrandStyle?: (request: AuthoringBrandMatchRequest) => Promise<AuthoringBrandMatchProposal>;
  applyBrandMatch?: (
    proposal: AuthoringBrandMatchProposal,
  ) => Promise<AuthoringBrandMatchApplyResult>;
  /** Consolidated exact-artifact release truth. The host keeps credentials out of this frame. */
  getReleaseWorkflowState?: () => Promise<AuthoringReleaseWorkflowState>;
  /** Host temporarily removes creator chrome while this exact-artifact check runs. */
  verifyStagingRelease?: (
    request: AuthoringReleaseVerificationRequest,
  ) => Promise<AuthoringReleaseVerificationResult>;
  promoteExactArtifact?: (
    request: AuthoringExactArtifactPromotionRequest,
  ) => Promise<AuthoringExactArtifactPromotionResult>;
  requestPromotionApproval?: (request: AuthoringExactArtifactPromotionRequest) => Promise<{
    approval: 'requested' | 'approved';
    operationId: string;
  }>;
  /** Explicit approver action; requesting approval must never invoke this implicitly. */
  approveAndPromoteExactArtifact?: (
    request: AuthoringProductionApprovalRequest,
  ) => Promise<AuthoringExactArtifactPromotionResult>;
  recordMetric: (event: LocalAuthoringFrameMetricEvent) => void;
  getMetricsSummary: (sessionId: string) => unknown;
  exportMetricsReport: (sessionId: string) => string;
}

export interface LocalAuthoringFrameOptions {
  root: HTMLElement;
  baseDocument: LodariqDocument;
  services: LocalAuthoringFrameServices;
  frameMode?: 'standalone' | 'panel';
  sessionId?: string;
  peerWindow?: Window;
  allowedOrigins?: string[];
  targetOrigin?: string;
  now?: () => number;
}
