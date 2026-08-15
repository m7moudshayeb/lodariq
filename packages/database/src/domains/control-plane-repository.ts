import type {
  AnalyticsEventAggregate,
  QueryAuthoringDocumentsResult,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import type {
  UpdateEnvironmentReleasePolicyInput,
  UpdateWorkspaceEnvironmentPolicyInput,
  WorkspaceEnvironment,
} from './environments';
import type {
  ApplyProductStyleProposalInput,
  ApproveWorkspaceThemeInput,
  BrandDriftRunRecord,
  CreateBrandDriftRunInput,
  CreateStyleSourceInput,
  CreateVisualCheckRunInput,
  CreateWorkspaceThemeInput,
  ProductStyleProposalApplicationResult,
  SetDefaultWorkspaceThemeInput,
  StyleSourceRecord,
  UpdateWorkspaceThemeDraftInput,
  VisualCheckRunRecord,
  WorkspaceThemeApprovalResult,
  WorkspaceThemeImpactRecord,
  WorkspaceThemeRecord,
  WorkspaceThemeVersionRecord,
} from './themes';
import type {
  IdentityRepository,
  WorkspaceAuthPolicyRecord,
  WorkspaceMembershipRecord,
} from './identity';
import type { TenantAdministrationRepository } from './tenant-administration';
import type { AccountManagementRepository } from './account-management';
import type { AssuranceRepository } from './assurance';
import type { OidcRepository } from './oidc';
import type { EnterpriseIdentityRepository } from './enterprise-identity';
import type {
  AcknowledgeDocumentThemeInput,
  ActivatedAuthoringDocumentSessionRecord,
  AuthoringActivationGrantRecord,
  AuthoringAuthorizationRequestRecord,
  AuthoringCodeExchangeRecord,
  AuthoringSessionRecord,
  EnvironmentTokenRecord,
  PublicSdkBootstrapGrantRecord,
  PublicSdkInstallationOriginRecord,
  PublicSdkInstallationRecord,
  PublicSdkInstallationWithOrigins,
  ResolvedAuthoringAuthorizationForUser,
  ResolvedPublicSdkInstallation,
} from './sdk-authoring';
import type {
  CreatePublicationVerificationInput,
  CreateReleaseApprovalInput,
  DocumentSummary,
  PersistedCompiledArtifact,
  PersistedDocumentDeployment,
  PersistedDocumentVersion,
  PersistedPublication,
  PersistedReleaseOperation,
  PromoteVerifiedPublicationInput,
  PromotionResult,
  PublicationVerificationRecord,
  RecoverDocumentReleaseInput,
  ReleaseApprovalRecord,
  ReleaseRecoveryScopeInput,
} from './releases';
import type {
  ActivateCompiledArtifactInput,
  ApproveAuthoringAuthorizationRequestInput,
  ConsumeAuthoringActivationGrantInput,
  ConsumePublicSdkBootstrapGrantInput,
  CreateAuthoringAuthorizationRequestInput,
  CreateAuthoringDocumentSessionFromActivationInput,
  CreateAuthoringSessionInput,
  CreateEnvironmentTokenInput,
  CreatePublicSdkBootstrapGrantInput,
  ExchangeAuthoringAuthorizationCodeInput,
  GetOrCreatePublicSdkInstallationInput,
  PersistedDocument,
  PublishCompiledArtifactInput,
  QueryAuthoringDocumentsFromActivationInput,
  ReleaseActivationResult,
  RevokeAuthoringSessionInput,
  SaveDocumentInput,
  SetPublicSdkInstallationOriginInput,
  SyncPublicSdkInstallationOriginsInput,
} from './documents';
import type {
  IngestAuthoritativeEventsInput,
  IngestEventsInput,
  PersistedAnalyticsEventRecord,
  QueryAnalyticsEventsInput,
  ResolvedEnvironmentToken,
} from './analytics';
import type {
  CreateAuthoringMediaAssetInput,
  PersistedAuthoringMediaAsset,
  SaveAuthoringResourcesInput,
} from './authoring-resources';
import type {
  AuthoringDraftCheckpointResource,
  AuthoringMediaAssetResource,
  AuthoringStepStyleRecipeResource,
} from '@lodariq/schema';

export interface ControlPlaneRepository
  extends
    IdentityRepository,
    TenantAdministrationRepository,
    AccountManagementRepository,
    AssuranceRepository,
    OidcRepository,
    EnterpriseIdentityRepository {
  listAuthoringStyleRecipes(workspaceId: string): Promise<AuthoringStepStyleRecipeResource[]>;
  listAuthoringDraftCheckpoints(
    workspaceId: string,
    documentId: string,
  ): Promise<AuthoringDraftCheckpointResource[]>;
  listAuthoringMediaAssets(workspaceId: string): Promise<AuthoringMediaAssetResource[]>;
  getAuthoringMediaAsset(
    workspaceId: string,
    assetId: string,
  ): Promise<PersistedAuthoringMediaAsset | null>;
  getPublishedMediaAsset(assetId: string): Promise<PersistedAuthoringMediaAsset | null>;
  publishAuthoringMediaAssets(workspaceId: string, assetIds: readonly string[]): Promise<void>;
  saveAuthoringResources(input: SaveAuthoringResourcesInput): Promise<void>;
  createAuthoringMediaAsset(
    input: CreateAuthoringMediaAssetInput,
  ): Promise<AuthoringMediaAssetResource>;
  /** Fail closed when the repository's required backing store is unavailable. */
  checkReadiness(): Promise<void>;
  /** Release backing-store resources owned by this repository. */
  close?(): Promise<void>;
  resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null>;
  getWorkspaceAuthPolicy(workspaceId: string): Promise<WorkspaceAuthPolicyRecord | null>;
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
