import { type AnalyticsEvent } from '@lodariq/schema';
import { type WorkspaceEnvironment } from '../domains/environments';
import {
  type BrandDriftRunRecord,
  type ProductStyleApplicationRecord,
  type StyleSourceRecord,
  type VisualCheckRunRecord,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
} from '../domains/themes';
import {
  type AuthIdentityRecord,
  type AuthSecurityEventRecord,
  type AuthOutboxRecord,
  type AuthSessionRecord,
  type EmailVerificationChallengeRecord,
  type IdentityOnboardingStateRecord,
  type PasswordCredentialRecord,
  type SetPasswordChallengeRecord,
  type SetPasswordOutboxRecord,
  type UserRecord,
  type UserEmailRecord,
  type UsernameRecord,
  type WorkspaceMembershipRecord,
  type WorkspaceInvitationRecord,
  type WorkspaceInvitationOutboxRecord,
  type WorkspaceAuthPolicyRecord,
  type SsoConnectionRecord,
} from '../domains/identity';
import {
  type AuthoringActivationGrantRecord,
  type AuthoringAuthorizationRequestRecord,
  type AuthoringSessionRecord,
  type EnvironmentTokenRecord,
  type PublicSdkBootstrapGrantRecord,
  type PublicSdkInstallationOriginRecord,
  type PublicSdkInstallationRecord,
} from '../domains/sdk-authoring';
import {
  type PersistedCompiledArtifact,
  type PersistedDocumentDeployment,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type PublicationVerificationRecord,
  type ReleaseApprovalRecord,
} from '../domains/releases';
import { type PersistedDocument } from '../domains/documents';
import type { PersistedAuthoringMediaAsset } from '../domains/authoring-resources';
import type {
  AuthoringDraftCheckpointResource,
  AuthoringStepStyleRecipeResource,
} from '@lodariq/schema';
import { type PersistedAnalyticsEventRecord } from '../domains/analytics';
import type {
  TenantAuditEventRecord,
  TenantWorkspaceRecord,
} from '../domains/tenant-administration';
import type {
  AccountEmailChangeOutboxRecord,
  AccountEmailChangeRecord,
  AccountSecurityEventRecord,
} from '../domains/account-management';
import type {
  PasskeyCredentialRecord,
  RecoveryCodeRecord,
  RecoveryCodeSetRecord,
  WebAuthnChallengeRecord,
} from '../domains/assurance';
import type { OidcAuthorizationAttemptRecord } from '../domains/oidc';
import type {
  EnterpriseAuditEventRecord,
  EnterpriseBreakGlassRecord,
  EnterpriseGroupRoleMappingRecord,
  EnterprisePrincipalRecord,
  EnterpriseScimConnectionRecord,
  EnterpriseSsoConnectionRecord,
  EnterpriseValidationEvidenceRecord,
  EnterpriseVerifiedDomainRecord,
} from '../domains/enterprise-identity';

export class InMemoryRepositoryState {
  protected readonly authoringStyleRecipes = new Map<string, AuthoringStepStyleRecipeResource[]>();

  protected readonly authoringDraftCheckpoints = new Map<
    string,
    AuthoringDraftCheckpointResource[]
  >();

  protected readonly authoringMediaAssets = new Map<string, PersistedAuthoringMediaAsset>();
  protected readonly documents = new Map<string, PersistedDocument>();

  protected readonly documentVersions = new Map<string, PersistedDocumentVersion[]>();

  protected readonly environments = new Map<string, WorkspaceEnvironment>();

  protected readonly publicSdkInstallations = new Map<string, PublicSdkInstallationRecord>();

  protected readonly publicSdkInstallationOrigins: PublicSdkInstallationOriginRecord[] = [];

  protected readonly publicSdkBootstrapGrants = new Map<string, PublicSdkBootstrapGrantRecord>();

  protected readonly authoringAuthorizationRequests = new Map<
    string,
    AuthoringAuthorizationRequestRecord
  >();

  protected readonly authoringActivationGrants = new Map<string, AuthoringActivationGrantRecord>();

  protected readonly environmentTokens = new Map<string, EnvironmentTokenRecord>();

  protected readonly authoringSessions = new Map<string, AuthoringSessionRecord>();

  protected readonly users = new Map<string, UserRecord>();

  protected readonly userEmails = new Map<string, UserEmailRecord>();

  protected readonly usernames = new Map<string, UsernameRecord>();

  protected readonly authIdentities = new Map<string, AuthIdentityRecord>();

  protected readonly authSecurityEvents = new Map<string, AuthSecurityEventRecord>();

  protected readonly accountSecurityEvents = new Map<string, AccountSecurityEventRecord>();

  protected readonly accountEmailChangeChallenges = new Map<string, AccountEmailChangeRecord>();

  protected readonly accountEmailChangeOutbox = new Map<string, AccountEmailChangeOutboxRecord>();

  protected readonly webAuthnChallenges = new Map<string, WebAuthnChallengeRecord>();

  protected readonly passkeyCredentials = new Map<string, PasskeyCredentialRecord>();

  protected readonly recoveryCodeSets = new Map<string, RecoveryCodeSetRecord>();

  protected readonly recoveryCodes = new Map<string, RecoveryCodeRecord>();

  protected readonly oidcAuthorizationAttempts = new Map<string, OidcAuthorizationAttemptRecord>();

  protected readonly identityOnboardingStates = new Map<string, IdentityOnboardingStateRecord>();

  protected readonly workspaces = new Map<string, TenantWorkspaceRecord>();

  protected readonly workspaceMemberships = new Map<string, WorkspaceMembershipRecord>();

  protected readonly workspaceInvitations = new Map<string, WorkspaceInvitationRecord>();

  protected readonly workspaceInvitationOutbox = new Map<string, WorkspaceInvitationOutboxRecord>();

  protected readonly tenantAuditEvents = new Map<string, TenantAuditEventRecord>();

  protected readonly workspaceAuthPolicies = new Map<string, WorkspaceAuthPolicyRecord>();

  protected readonly ssoConnections = new Map<string, SsoConnectionRecord>();

  protected readonly enterpriseSsoConnections = new Map<string, EnterpriseSsoConnectionRecord>();

  protected readonly enterpriseValidationEvidence = new Map<
    string,
    EnterpriseValidationEvidenceRecord
  >();

  protected readonly enterpriseVerifiedDomains = new Map<string, EnterpriseVerifiedDomainRecord>();

  protected readonly enterpriseGroupRoleMappings = new Map<
    string,
    EnterpriseGroupRoleMappingRecord
  >();

  protected readonly enterpriseScimConnections = new Map<string, EnterpriseScimConnectionRecord>();

  protected readonly enterprisePrincipals = new Map<string, EnterprisePrincipalRecord>();

  protected readonly enterpriseAuditEvents = new Map<string, EnterpriseAuditEventRecord>();

  protected readonly enterpriseBreakGlassRequests = new Map<string, EnterpriseBreakGlassRecord>();

  protected readonly passwordCredentials = new Map<string, PasswordCredentialRecord>();

  protected readonly identitySessions = new Map<string, AuthSessionRecord>();

  protected readonly emailVerificationChallenges = new Map<
    string,
    EmailVerificationChallengeRecord
  >();

  protected readonly authOutbox = new Map<string, AuthOutboxRecord>();

  protected readonly setPasswordChallenges = new Map<string, SetPasswordChallengeRecord>();

  protected readonly setPasswordOutbox = new Map<string, SetPasswordOutboxRecord>();

  protected readonly authRateLimits = new Map<
    string,
    { windowStartedAt: string; attempts: number; blockedUntil: string | null }
  >();

  protected readonly themes = new Map<string, WorkspaceThemeRecord>();

  protected readonly themeVersions = new Map<string, WorkspaceThemeVersionRecord[]>();

  protected readonly visualCheckRuns = new Map<string, VisualCheckRunRecord[]>();

  protected readonly styleSources = new Map<string, StyleSourceRecord[]>();

  protected readonly productStyleApplications = new Map<string, ProductStyleApplicationRecord>();

  protected readonly brandDriftRuns = new Map<string, BrandDriftRunRecord[]>();

  protected readonly publicationVerifications = new Map<string, PublicationVerificationRecord[]>();

  protected readonly releaseApprovals = new Map<string, ReleaseApprovalRecord[]>();

  protected readonly publications = new Map<string, PersistedPublication[]>();

  protected readonly compiledArtifactsByIdentity = new Map<string, PersistedCompiledArtifact>();

  protected readonly compiledArtifactsById = new Map<string, PersistedCompiledArtifact>();

  protected readonly documentDeployments = new Map<string, PersistedDocumentDeployment>();

  protected readonly releaseOperations = new Map<string, PersistedReleaseOperation>();

  protected readonly analyticsEvents: PersistedAnalyticsEventRecord[] = [];

  protected readonly events: Array<{ workspaceId: string; event: AnalyticsEvent }> = [];
}
