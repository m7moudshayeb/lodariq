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
  type AuthOutboxRecord,
  type AuthSessionRecord,
  type EmailVerificationChallengeRecord,
  type PasswordCredentialRecord,
  type SetPasswordChallengeRecord,
  type SetPasswordOutboxRecord,
  type UserRecord,
  type WorkspaceMembershipRecord,
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
import { type PersistedAnalyticsEventRecord } from '../domains/analytics';

export class InMemoryRepositoryState {
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

  protected readonly workspaces = new Map<
    string,
    { id: string; name: string; createdAt: string; updatedAt: string }
  >();

  protected readonly workspaceMemberships = new Map<string, WorkspaceMembershipRecord>();

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
