import { type LodariqDocument } from '@lodariq/schema';
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
  type AuthOutboxRecord,
  type AuthSessionRecord,
  type EmailVerificationChallengeRecord,
  type PasswordCredentialRecord,
  type SetPasswordChallengeRecord,
  type SetPasswordOutboxRecord,
  type UserRecord,
  type WorkspaceMembershipRecord,
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
import { InMemoryRepositoryAnalytics } from './in-memory/analytics';

export * from './domains/environments';
export * from './domains/themes';
export * from './domains/identity';
export * from './domains/sdk-authoring';
export * from './domains/releases';
export * from './domains/documents';
export * from './domains/analytics';
export * from './domains/control-plane-repository';
export * from './domains/release-recovery';
export * from './domains/authoring-policy';
export * from './domains/product-style';
export * from './domains/theme-policy';

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

class InMemoryControlPlaneRepository
  extends InMemoryRepositoryAnalytics
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
}
