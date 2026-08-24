import { createHash, randomUUID } from 'node:crypto';
import {
  CommercialEntitlementError,
  type AiCreditLedgerRecord,
  type WorkspaceEntitlementSnapshotRecord,
  type WorkspaceSubscriptionRecord,
  type WorkspaceUsageLedgerRecord,
} from '../domains/commercial-entitlements';
import type {
  BillingAccountRecord,
  BillingInvoiceRecord,
  BillingMeterBatchRecord,
  BillingProviderEventRecord,
} from '../domains/commercial-billing';
import {
  COMMERCIAL_PLAN_VERSION,
  resolveCommercialEntitlements,
  type AnalyticsEvent,
  type CommercialPlanId,
  type DataCatalogEntry,
  type DeliveryTransitionHistoryEntry,
} from '@lodariq/schema';
import type {
  PersistedDeliveryScheduleJob,
  PersistedDeploymentSchedule,
} from '../domains/delivery-orchestration';
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
  AnalyticsExportAuditEventRecord,
  PersistedAnalyticsExportJob,
} from '../domains/analytics-exports';
import {
  type AuthoringPresenceRecord,
  type ExperienceCommentRecord,
  type ExperienceCommentAuditEventRecord,
  type ExperienceExperimentRecord,
  type ExperienceExperimentAllocationRecord,
  type ExperienceExperimentAssignmentRecord,
  type ExperienceFormResponseRecord,
  type ExperienceMeasurementRecord,
  type ExperienceStepLockRecord,
  type WorkspaceApplicationRecord,
} from '../domains/experience-measurement';
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
import type {
  GovernanceCapabilityProfileAssignmentRecord,
  GovernanceCapabilityProfileRecord,
  WorkspaceGovernanceCapabilityProfileAssignmentRecord,
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
  WebhookEventRecord,
  DataResidencyMigrationRecord,
  WorkspaceDataPlacementRecord,
} from '../domains/governance';
import type { AuthoringCopyRecord, AuthoringRoadmapRecord } from '../domains/authoring-roadmap';
import type {
  DataResidencyMigrationEvidenceRecord,
  DataResidencyMigrationExecutionRecord,
} from '../domains/data-residency';
import type {
  AnalyticsWarehouseDestinationRecord,
  AnalyticsWarehouseSyncRunRecord,
} from '../domains/analytics-warehouse';
import type {
  AccessibilityFinding,
  AccessibilitySweep,
} from '@lodariq/schema/accessibility-governance';

export interface AccessibilityFindingEventRecord {
  id: string;
  workspaceId: string;
  findingId: string;
  eventType: 'opened' | 'resolved';
  actorUserId: string;
  findingRevision: number;
  occurredAt: string;
}

export class InMemoryRepositoryState {
  protected readonly governanceCapabilityProfiles = new Map<
    string,
    GovernanceCapabilityProfileRecord
  >();

  protected readonly governanceCapabilityProfileAssignments = new Map<
    string,
    GovernanceCapabilityProfileAssignmentRecord
  >();

  protected readonly workspaceGovernanceCapabilityProfileAssignments = new Map<
    string,
    WorkspaceGovernanceCapabilityProfileAssignmentRecord
  >();

  protected readonly webhookEndpoints = new Map<string, WebhookEndpointRecord>();

  protected readonly webhookEvents = new Map<string, WebhookEventRecord>();

  protected readonly webhookDeliveries = new Map<
    string,
    WebhookDeliveryRecord & { leaseOwner: string | null; leasedUntil: string | null }
  >();

  protected readonly workspaceDataPlacements = new Map<string, WorkspaceDataPlacementRecord>();

  protected readonly dataResidencyMigrations = new Map<string, DataResidencyMigrationRecord>();

  protected readonly dataResidencyMigrationExecutions = new Map<
    string,
    DataResidencyMigrationExecutionRecord
  >();

  protected readonly dataResidencyMigrationEvidence = new Map<
    string,
    DataResidencyMigrationEvidenceRecord
  >();

  protected readonly dataResidencyMigrationHistory = new Map<
    string,
    {
      id: string;
      workspaceId: string;
      migrationId: string;
      previousStatus: DataResidencyMigrationRecord['status'] | null;
      nextStatus: DataResidencyMigrationRecord['status'];
      actorId: string;
      failureCode: string | null;
      occurredAt: string;
    }
  >();

  protected readonly authoringRoadmapRecords = new Map<string, AuthoringRoadmapRecord>();

  protected readonly authoringCopyRecords = new Map<string, AuthoringCopyRecord>();

  protected readonly deploymentSchedules = new Map<string, PersistedDeploymentSchedule>();

  protected readonly deliveryScheduleJobs = new Map<string, PersistedDeliveryScheduleJob>();

  protected readonly deliveryTransitionHistory: DeliveryTransitionHistoryEntry[] = [];

  protected readonly workspaceDataCatalogEntries = new Map<
    string,
    DataCatalogEntry & { workspaceId: string; environmentId: string; catalogVersion: number }
  >();

  protected readonly workspaceDataCatalogVersions = new Map<string, number>();

  protected readonly workspaceSubscriptions = new Map<string, WorkspaceSubscriptionRecord>();

  protected readonly effectiveEntitlementSnapshots = new Map<
    string,
    WorkspaceEntitlementSnapshotRecord[]
  >();

  protected readonly workspaceUsageLedger = new Map<string, WorkspaceUsageLedgerRecord>();

  protected readonly aiCreditLedger = new Map<string, AiCreditLedgerRecord>();

  protected readonly workspaceBillingAccounts = new Map<string, BillingAccountRecord>();

  protected readonly billingProviderEvents = new Map<string, BillingProviderEventRecord>();

  protected readonly billingInvoices = new Map<string, BillingInvoiceRecord>();

  protected readonly billingMeterBatches = new Map<string, BillingMeterBatchRecord>();

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

  /*
   * Which of those rows drizzle puts in `governance_audit_events` rather than
   * `tenant_audit_events`. Both tables share one record shape here, and
   * `listTenantAuditEvents` unions them on both sides — but change history
   * labels them by table, so without this the same event reads as
   * `tenant-governance` in tests and `platform-governance` in Postgres.
   */
  protected readonly platformGovernanceAuditEventIds = new Set<string>();

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

  protected readonly analyticsExportJobs = new Map<string, PersistedAnalyticsExportJob>();

  protected readonly analyticsExportAuditEvents: AnalyticsExportAuditEventRecord[] = [];

  protected readonly analyticsWarehouseDestinations = new Map<
    string,
    AnalyticsWarehouseDestinationRecord
  >();

  protected readonly analyticsWarehouseSyncRuns: AnalyticsWarehouseSyncRunRecord[] = [];

  protected readonly accessibilitySweeps = new Map<string, AccessibilitySweep>();

  protected readonly accessibilityFindings = new Map<string, AccessibilityFinding>();

  protected readonly accessibilityFindingEvents: AccessibilityFindingEventRecord[] = [];

  protected readonly events: Array<{ workspaceId: string; event: AnalyticsEvent }> = [];

  protected readonly experienceMeasurement = new Map<string, ExperienceMeasurementRecord>();

  protected readonly experienceExperiments = new Map<string, ExperienceExperimentRecord>();

  protected readonly experienceExperimentAllocations = new Map<
    string,
    ExperienceExperimentAllocationRecord[]
  >();

  protected readonly experienceExperimentAssignments = new Map<
    string,
    ExperienceExperimentAssignmentRecord
  >();

  protected readonly experienceFormResponses: ExperienceFormResponseRecord[] = [];

  protected readonly experienceComments = new Map<string, ExperienceCommentRecord>();

  protected readonly experienceCommentAuditEvents = new Map<
    string,
    ExperienceCommentAuditEventRecord
  >();

  protected readonly experienceStepLocks = new Map<string, ExperienceStepLockRecord>();

  protected readonly authoringPresence = new Map<string, AuthoringPresenceRecord>();

  protected readonly workspaceApplications = new Map<string, WorkspaceApplicationRecord>();

  protected resolveWorkspaceEntitlements(
    workspaceId: string,
    fallbackPlan: CommercialPlanId = 'free',
  ): WorkspaceEntitlementSnapshotRecord {
    let subscription = this.workspaceSubscriptions.get(workspaceId);
    if (!subscription) {
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      subscription = {
        workspaceId,
        planId: fallbackPlan,
        planVersion: COMMERCIAL_PLAN_VERSION,
        status: 'active',
        entitlementOverrides: {},
        currentPeriodStart: periodStart.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        revision: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      this.workspaceSubscriptions.set(workspaceId, subscription);
    }
    const snapshots = this.effectiveEntitlementSnapshots.get(workspaceId) ?? [];
    const current = snapshots.find(
      (snapshot) => snapshot.subscriptionRevision === subscription.revision,
    );
    if (current) return structuredClone(current);
    const entitlements = resolveCommercialEntitlements(
      subscription.planId,
      subscription.entitlementOverrides,
    );
    const createdAt = subscription.updatedAt;
    const snapshot: WorkspaceEntitlementSnapshotRecord = {
      id: `entsnap_${randomUUID()}`,
      workspaceId,
      subscriptionRevision: subscription.revision,
      planId: subscription.planId,
      planVersion: subscription.planVersion,
      entitlements,
      entitlementHash: `sha256-${createHash('sha256')
        .update(JSON.stringify(entitlements))
        .digest('hex')}`,
      reason: subscription.revision === 1 ? 'workspace_created' : 'plan_changed',
      changeActorId: 'system:repository',
      effectiveFrom: createdAt,
      createdAt,
    };
    snapshots.push(snapshot);
    this.effectiveEntitlementSnapshots.set(workspaceId, snapshots);
    return structuredClone(snapshot);
  }

  protected assertCreatorSeatAvailable(workspaceId: string): void {
    const limit = this.resolveWorkspaceEntitlements(workspaceId).entitlements.creatorSeats;
    if (limit === null) return;
    const used = [...this.workspaceMemberships.values()].filter(
      (membership) => membership.workspaceId === workspaceId && membership.role !== 'viewer',
    ).length;
    if (used + 1 > limit) {
      throw new CommercialEntitlementError('creator-seats', used, limit);
    }
  }
}
