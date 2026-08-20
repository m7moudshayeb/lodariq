import { type LodariqDocument } from '@lodariq/schema';
export * from './domains/experience-measurement';
export * from './domains/experience-measurement-repository';
export * from './domains/experience-sessions';
import { normalizeWorkspaceEnvironments, type WorkspaceEnvironment } from './domains/environments';
import {
  type BrandDriftRunRecord,
  type ProductStyleApplicationRecord,
  type StyleSourceRecord,
  type VisualCheckRunRecord,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
} from './domains/themes';
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
} from './domains/identity';
import {
  type AuthoringActivationGrantRecord,
  type AuthoringAuthorizationRequestRecord,
  type AuthoringSessionRecord,
  type EnvironmentTokenRecord,
  type PublicSdkBootstrapGrantRecord,
  type PublicSdkInstallationOriginRecord,
  type PublicSdkInstallationRecord,
} from './domains/sdk-authoring';
import {
  type PersistedCompiledArtifact,
  type PersistedDocumentDeployment,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type PublicationVerificationRecord,
  type ReleaseApprovalRecord,
} from './domains/releases';
import {
  assertAuthoritativeAnalyticsEvent,
  type PersistedAnalyticsEventRecord,
} from './domains/analytics';
import type { ControlPlaneRepository } from './domains/control-plane-repository';
import {
  assertProductStyleApplicationIntegrity,
  compareStyleSourceOrdinal,
} from './domains/product-style';
import { clone } from './domains/in-memory-helpers';
import { InMemoryRepositoryExperienceMeasurement } from './in-memory/experience-measurement';
import type {
  TenantAuditEventRecord,
  TenantWorkspaceRecord,
} from './domains/tenant-administration';
import type {
  AccountEmailChangeOutboxRecord,
  AccountEmailChangeRecord,
  AccountSecurityEventRecord,
} from './domains/account-management';
import type {
  PasskeyCredentialRecord,
  RecoveryCodeRecord,
  RecoveryCodeSetRecord,
  WebAuthnChallengeRecord,
} from './domains/assurance';
import type { OidcAuthorizationAttemptRecord } from './domains/oidc';
import type {
  EnterpriseAuditEventRecord,
  EnterpriseBreakGlassRecord,
  EnterpriseGroupRoleMappingRecord,
  EnterprisePrincipalRecord,
  EnterpriseScimConnectionRecord,
  EnterpriseSsoConnectionRecord,
  EnterpriseValidationEvidenceRecord,
  EnterpriseVerifiedDomainRecord,
} from './domains/enterprise-identity';

export * from './domains/environments';
export * from './domains/themes';
export * from './domains/identity';
export * from './domains/tenant-administration';
export * from './domains/account-management';
export * from './domains/sdk-authoring';
export * from './domains/releases';
export * from './domains/documents';
export * from './domains/analytics';
export * from './domains/authoring-resources';
export * from './domains/control-plane-repository';
export * from './domains/release-recovery';
export * from './domains/authoring-policy';
export * from './domains/product-style';
export * from './domains/theme-policy';
export * from './domains/oidc';
export * from './domains/enterprise-identity';

export interface InMemoryControlPlaneSeed {
  users?: UserRecord[];
  userEmails?: UserEmailRecord[];
  usernames?: UsernameRecord[];
  authIdentities?: AuthIdentityRecord[];
  authSecurityEvents?: AuthSecurityEventRecord[];
  accountSecurityEvents?: AccountSecurityEventRecord[];
  accountEmailChangeChallenges?: AccountEmailChangeRecord[];
  accountEmailChangeOutbox?: AccountEmailChangeOutboxRecord[];
  webAuthnChallenges?: WebAuthnChallengeRecord[];
  passkeyCredentials?: PasskeyCredentialRecord[];
  recoveryCodeSets?: RecoveryCodeSetRecord[];
  recoveryCodes?: RecoveryCodeRecord[];
  oidcAuthorizationAttempts?: OidcAuthorizationAttemptRecord[];
  identityOnboardingStates?: IdentityOnboardingStateRecord[];
  workspaces?: Array<
    Omit<TenantWorkspaceRecord, 'deletedAt' | 'retentionExpiresAt'> &
      Partial<Pick<TenantWorkspaceRecord, 'deletedAt' | 'retentionExpiresAt'>>
  >;
  workspaceMemberships?: WorkspaceMembershipRecord[];
  workspaceInvitations?: WorkspaceInvitationRecord[];
  workspaceInvitationOutbox?: WorkspaceInvitationOutboxRecord[];
  tenantAuditEvents?: TenantAuditEventRecord[];
  workspaceAuthPolicies?: WorkspaceAuthPolicyRecord[];
  ssoConnections?: SsoConnectionRecord[];
  enterpriseSsoConnections?: EnterpriseSsoConnectionRecord[];
  enterpriseValidationEvidence?: EnterpriseValidationEvidenceRecord[];
  enterpriseVerifiedDomains?: EnterpriseVerifiedDomainRecord[];
  enterpriseGroupRoleMappings?: EnterpriseGroupRoleMappingRecord[];
  enterpriseScimConnections?: EnterpriseScimConnectionRecord[];
  enterprisePrincipals?: EnterprisePrincipalRecord[];
  enterpriseAuditEvents?: EnterpriseAuditEventRecord[];
  enterpriseBreakGlassRequests?: EnterpriseBreakGlassRecord[];
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

class InMemoryControlPlaneRepository
  extends InMemoryRepositoryExperienceMeasurement
  implements ControlPlaneRepository
{
  constructor(seed: InMemoryControlPlaneSeed) {
    super();
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
    for (const email of seed.userEmails ?? []) {
      this.userEmails.set(email.normalizedEmail, clone(email));
    }
    for (const username of seed.usernames ?? []) {
      this.usernames.set(username.normalizedUsername, clone(username));
    }
    for (const identity of seed.authIdentities ?? []) {
      this.authIdentities.set(identity.id, clone(identity));
    }
    for (const event of seed.authSecurityEvents ?? []) {
      this.authSecurityEvents.set(event.id, clone(event));
    }
    for (const event of seed.accountSecurityEvents ?? []) {
      this.accountSecurityEvents.set(event.id, clone(event));
    }
    for (const challenge of seed.accountEmailChangeChallenges ?? []) {
      this.accountEmailChangeChallenges.set(challenge.id, clone(challenge));
    }
    for (const message of seed.accountEmailChangeOutbox ?? []) {
      this.accountEmailChangeOutbox.set(message.id, clone(message));
    }
    for (const challenge of seed.webAuthnChallenges ?? []) {
      this.webAuthnChallenges.set(challenge.id, clone(challenge));
    }
    for (const credential of seed.passkeyCredentials ?? []) {
      this.passkeyCredentials.set(credential.id, clone(credential));
    }
    for (const set of seed.recoveryCodeSets ?? []) {
      this.recoveryCodeSets.set(set.id, clone(set));
    }
    for (const code of seed.recoveryCodes ?? []) {
      this.recoveryCodes.set(code.id, clone(code));
    }
    for (const attempt of seed.oidcAuthorizationAttempts ?? []) {
      this.oidcAuthorizationAttempts.set(attempt.id, clone(attempt));
    }
    for (const onboarding of seed.identityOnboardingStates ?? []) {
      this.identityOnboardingStates.set(onboarding.id, clone(onboarding));
    }
    for (const workspace of seed.workspaces ?? []) {
      this.workspaces.set(workspace.id, {
        ...clone(workspace),
        deletedAt: workspace.deletedAt ?? null,
        retentionExpiresAt: workspace.retentionExpiresAt ?? null,
      });
    }
    for (const membership of seed.workspaceMemberships ?? []) {
      this.workspaceMemberships.set(
        this.key(membership.workspaceId, membership.userId),
        clone(membership),
      );
    }
    for (const invitation of seed.workspaceInvitations ?? []) {
      this.workspaceInvitations.set(invitation.id, clone(invitation));
    }
    for (const event of seed.tenantAuditEvents ?? []) {
      this.tenantAuditEvents.set(event.id, clone(event));
    }
    for (const policy of seed.workspaceAuthPolicies ?? []) {
      this.workspaceAuthPolicies.set(policy.workspaceId, clone(policy));
    }
    for (const connection of seed.ssoConnections ?? []) {
      this.ssoConnections.set(connection.id, clone(connection));
    }
    for (const connection of seed.enterpriseSsoConnections ?? []) {
      this.enterpriseSsoConnections.set(connection.id, clone(connection));
    }
    for (const evidence of seed.enterpriseValidationEvidence ?? []) {
      this.enterpriseValidationEvidence.set(evidence.id, clone(evidence));
    }
    for (const domain of seed.enterpriseVerifiedDomains ?? []) {
      this.enterpriseVerifiedDomains.set(domain.id, clone(domain));
    }
    for (const mapping of seed.enterpriseGroupRoleMappings ?? []) {
      this.enterpriseGroupRoleMappings.set(mapping.id, clone(mapping));
    }
    for (const connection of seed.enterpriseScimConnections ?? []) {
      this.enterpriseScimConnections.set(connection.id, clone(connection));
    }
    for (const principal of seed.enterprisePrincipals ?? []) {
      this.enterprisePrincipals.set(principal.id, clone(principal));
    }
    for (const event of seed.enterpriseAuditEvents ?? []) {
      this.enterpriseAuditEvents.set(event.id, clone(event));
    }
    for (const request of seed.enterpriseBreakGlassRequests ?? []) {
      this.enterpriseBreakGlassRequests.set(request.id, clone(request));
    }
    for (const workspace of this.workspaces.values()) {
      if (!this.workspaceAuthPolicies.has(workspace.id)) {
        this.workspaceAuthPolicies.set(workspace.id, {
          workspaceId: workspace.id,
          ssoRequired: false,
          minimumAssurance: 'aal1',
          passwordAllowed: true,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        });
      }
    }
    for (const credential of seed.passwordCredentials ?? []) {
      this.passwordCredentials.set(credential.emailNormalized, clone(credential));
    }
    for (const user of this.users.values()) {
      const normalizedEmail = user.email.trim().toLowerCase();
      if (!this.userEmails.has(normalizedEmail)) {
        this.userEmails.set(normalizedEmail, {
          id: expansionRecordId('email', user.id),
          userId: user.id,
          normalizedEmail,
          isPrimary: true,
          verifiedAt: user.emailVerifiedAt ?? null,
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        });
      }
      const hasPassword = [...this.passwordCredentials.values()].some(
        (credential) => credential.userId === user.id,
      );
      const hasPasswordIdentity = [...this.authIdentities.values()].some(
        (identity) => identity.userId === user.id && identity.kind === 'password',
      );
      if (hasPassword && !hasPasswordIdentity) {
        const id = expansionRecordId('ident', user.id);
        this.authIdentities.set(id, {
          id,
          userId: user.id,
          kind: 'password',
          issuer: 'https://lodariq.io',
          subject: `user:${user.id}`,
          providerTenantId: null,
          createdAt: user.createdAt,
          lastAuthenticatedAt: null,
        });
      }
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
    for (const message of seed.workspaceInvitationOutbox ?? []) {
      this.workspaceInvitationOutbox.set(message.id, clone(message));
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
}

function expansionRecordId(prefix: 'email' | 'ident', userId: string): string {
  const safeUserId = userId.replace(/[^A-Za-z0-9_-]/gu, '_');
  return `${prefix}_phase3_${safeUserId}_${'x'.repeat(20)}`;
}
