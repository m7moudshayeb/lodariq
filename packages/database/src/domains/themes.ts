import type {
  AuthoringProductMatchSourceReceipt,
  BasicVisualPreflightReport,
  BrandDriftAuditReport,
  BrandThemeDefinition,
  BrandThemeSnapshot,
  LodariqDocument,
  ProductStyleProposal,
  ProductStyleSource,
} from '@lodariq/schema';

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
