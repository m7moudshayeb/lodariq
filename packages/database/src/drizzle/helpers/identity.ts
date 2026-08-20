import { and, eq, isNull } from 'drizzle-orm';
import {
  BRAND_THEME_CONTRACT_VERSION,
  COMPILER_VERSION,
  RENDERER_CONTRACT_VERSION,
} from '@lodariq/schema';
import {
  type AuthoringActivationGrantRecord,
  type AuthoringAuthorizationRequestRecord,
  type AuthoringDocumentSessionRecord,
  type AuthSessionRecord,
  type AuthIdentityRecord,
  type AuthSecurityEventRecord,
  type ClaimedAuthEmailOutboxRow,
  type IdentityWorkspaceRecord,
  type IdentityOnboardingStateRecord,
  type PublicSdkBootstrapGrantRecord,
  type PublicSdkInstallationOriginRecord,
  type PublicSdkInstallationRecord,
  type WorkspaceEnvironment,
  type PasswordCredentialRecord,
  type UserRecord,
  type UsernameRecord,
  normalizeWorkspaceEnvironments,
} from '../../repository';
import type {
  authoringActivationGrants,
  authoringAuthorizationRequests,
  authSessions,
  authIdentities,
  authSecurityEvents,
  authoringSessions,
  passwordCredentials,
  publicSdkBootstrapGrants,
  publicSdkInstallationOrigins,
  publicSdkInstallations,
  users,
  usernames,
  identityOnboardingStates,
} from '../../schema';
import { workspaceMemberships, workspaces } from '../../schema';
import type { LodariqTransaction, AuthEmailOutboxCandidate } from '../types';
import { toIsoString } from './persistence';

export function passwordCredentialValues(credential: PasswordCredentialRecord) {
  return {
    userId: credential.userId,
    emailNormalized: credential.emailNormalized,
    emailLookupHash: credential.emailLookupHash,
    algorithm: credential.algorithm,
    passwordHash: credential.passwordHash,
    createdAt: new Date(credential.createdAt),
    updatedAt: new Date(credential.updatedAt),
  };
}

export function compareAuthEmailCandidates(
  left: AuthEmailOutboxCandidate,
  right: AuthEmailOutboxCandidate,
): number {
  return (
    left.availableAt.getTime() - right.availableAt.getTime() ||
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.purpose.localeCompare(right.purpose) ||
    left.id.localeCompare(right.id)
  );
}

export function authEmailOutboxKey(
  purpose: ClaimedAuthEmailOutboxRow['purpose'],
  id: string,
): string {
  return `${purpose}\0${id}`;
}

export function isValidAuthEmailLeaseMutation(
  id: string,
  purpose: ClaimedAuthEmailOutboxRow['purpose'],
  leaseVersion: number,
  timestamp?: Date,
): boolean {
  return (
    /^outbox_[A-Za-z0-9_-]{20,200}$/u.test(id) &&
    (purpose === 'email_verification' ||
      purpose === 'set_password' ||
      purpose === 'workspace_invitation' ||
      purpose === 'account_email_change_current' ||
      purpose === 'account_email_change_new') &&
    Number.isSafeInteger(leaseVersion) &&
    leaseVersion >= 1 &&
    leaseVersion < 2_147_483_647 &&
    (!timestamp || Number.isFinite(timestamp.getTime()))
  );
}

export function authSessionValues(session: AuthSessionRecord) {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    activeWorkspaceId: session.activeWorkspaceId,
    identityId: session.identityId,
    authenticationMethod: session.authenticationMethod,
    assuranceLevel: session.assuranceLevel,
    authenticatedAt: new Date(session.authenticatedAt),
    durationPolicy: session.durationPolicy,
    deviceLabel: session.deviceLabel ?? 'Unknown device',
    createdAt: new Date(session.createdAt),
    lastSeenAt: new Date(session.lastSeenAt),
    idleExpiresAt: new Date(session.idleExpiresAt),
    absoluteExpiresAt: new Date(session.absoluteExpiresAt),
    revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
  };
}

export function environmentValues(environment: WorkspaceEnvironment) {
  const normalized = normalizeWorkspaceEnvironments([environment])[0];
  if (!normalized) throw new Error('environment values are unavailable');
  return {
    id: normalized.id,
    workspaceId: normalized.workspaceId,
    kind: normalized.kind,
    name: normalized.name,
    originAllowlist: normalized.originAllowlist,
    requiredApprovalCount: normalized.requiredApprovalCount,
    enabled: normalized.enabled,
    pipelinePosition: normalized.pipelinePosition,
    authoringEnabled: normalized.authoringEnabled,
    promotionSourceEnvironmentId: normalized.promotionSourceEnvironmentId ?? null,
    releasePolicy: normalized.releasePolicy,
    createdAt: new Date(normalized.createdAt),
    updatedAt: new Date(normalized.updatedAt),
  };
}

export function toPasswordCredentialRecord(
  credential: typeof passwordCredentials.$inferSelect,
): PasswordCredentialRecord {
  return {
    userId: credential.userId,
    emailNormalized: credential.emailNormalized,
    emailLookupHash: credential.emailLookupHash,
    algorithm: 'argon2id-v1',
    passwordHash: credential.passwordHash,
    createdAt: toIsoString(credential.createdAt),
    updatedAt: toIsoString(credential.updatedAt),
  };
}

export function toAuthSessionRecord(session: typeof authSessions.$inferSelect): AuthSessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    tokenHash: session.tokenHash,
    activeWorkspaceId: session.activeWorkspaceId,
    identityId: session.identityId,
    authenticationMethod: session.authenticationMethod as AuthSessionRecord['authenticationMethod'],
    assuranceLevel: session.assuranceLevel as AuthSessionRecord['assuranceLevel'],
    authenticatedAt: toIsoString(session.authenticatedAt),
    durationPolicy: session.durationPolicy as AuthSessionRecord['durationPolicy'],
    deviceLabel: session.deviceLabel,
    createdAt: toIsoString(session.createdAt),
    lastSeenAt: toIsoString(session.lastSeenAt),
    idleExpiresAt: toIsoString(session.idleExpiresAt),
    absoluteExpiresAt: toIsoString(session.absoluteExpiresAt),
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : null,
  };
}

export function toAuthIdentityRecord(
  identity: typeof authIdentities.$inferSelect,
): AuthIdentityRecord {
  return {
    id: identity.id,
    userId: identity.userId,
    kind: identity.kind as AuthIdentityRecord['kind'],
    issuer: identity.issuer,
    subject: identity.subject,
    providerTenantId: identity.providerTenantId,
    createdAt: toIsoString(identity.createdAt),
    lastAuthenticatedAt: identity.lastAuthenticatedAt
      ? toIsoString(identity.lastAuthenticatedAt)
      : null,
    disabledAt: identity.disabledAt ? toIsoString(identity.disabledAt) : null,
  };
}

export function toUsernameRecord(username: typeof usernames.$inferSelect): UsernameRecord {
  return {
    id: username.id,
    userId: username.userId,
    normalizedUsername: username.normalizedUsername,
    displayUsername: username.displayUsername,
    createdAt: toIsoString(username.createdAt),
    updatedAt: toIsoString(username.updatedAt),
  };
}

export function toIdentityOnboardingStateRecord(
  onboarding: typeof identityOnboardingStates.$inferSelect,
): IdentityOnboardingStateRecord {
  return {
    id: onboarding.id,
    userId: onboarding.userId,
    intent: onboarding.intent as IdentityOnboardingStateRecord['intent'],
    status: onboarding.status as IdentityOnboardingStateRecord['status'],
    targetWorkspaceId: onboarding.targetWorkspaceId,
    targetWorkspaceName: onboarding.targetWorkspaceName,
    invitationId: onboarding.invitationId,
    requestedWorkspaceId: onboarding.requestedWorkspaceId,
    completedWorkspaceId: onboarding.completedWorkspaceId,
    version: onboarding.version,
    expiresAt: toIsoString(onboarding.expiresAt),
    createdAt: toIsoString(onboarding.createdAt),
    updatedAt: toIsoString(onboarding.updatedAt),
  };
}

export function toAuthSecurityEventRecord(
  event: typeof authSecurityEvents.$inferSelect,
): AuthSecurityEventRecord {
  return {
    id: event.id,
    userId: event.userId,
    actorUserId: event.actorUserId,
    eventType: event.eventType as AuthSecurityEventRecord['eventType'],
    identityId: event.identityId,
    authorization: event.authorization as AuthSecurityEventRecord['authorization'],
    occurredAt: toIsoString(event.occurredAt),
  };
}

export function toUserRecord(user: typeof users.$inferSelect): UserRecord {
  return {
    id: user.id,
    legacyIdentityId: user.legacyIdentityId,
    email: user.email,
    name: user.name,
    emailVerifiedAt: user.emailVerifiedAt ? toIsoString(user.emailVerifiedAt) : null,
    deletedAt: user.deletedAt ? toIsoString(user.deletedAt) : null,
    retentionExpiresAt: user.retentionExpiresAt ? toIsoString(user.retentionExpiresAt) : null,
    createdAt: toIsoString(user.createdAt),
  };
}

export async function hasIdentityMembership(
  tx: LodariqTransaction,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const [membership] = await tx
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, userId),
        eq(workspaceMemberships.workspaceId, workspaceId),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(membership);
}

export function identityWorkspaceRole(role: string): IdentityWorkspaceRecord['role'] | null {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role;
  return null;
}

export function toPublicSdkInstallationRecord(
  installation: typeof publicSdkInstallations.$inferSelect,
): PublicSdkInstallationRecord {
  return {
    installationId: installation.id,
    workspaceId: installation.workspaceId,
    name: installation.name,
    createdByUserId: installation.createdByUserId,
    createdAt: toIsoString(installation.createdAt),
    updatedAt: toIsoString(installation.updatedAt),
    revokedAt: installation.revokedAt ? toIsoString(installation.revokedAt) : null,
    suspendedAt: installation.suspendedAt ? toIsoString(installation.suspendedAt) : null,
  };
}

export function toPublicSdkInstallationOriginRecord(
  origin: typeof publicSdkInstallationOrigins.$inferSelect,
): PublicSdkInstallationOriginRecord {
  return {
    installationId: origin.installationId,
    workspaceId: origin.workspaceId,
    environmentId: origin.environmentId,
    exactOrigin: origin.exactOrigin,
    authoringEnabled: origin.authoringEnabled,
    createdAt: toIsoString(origin.createdAt),
    updatedAt: toIsoString(origin.updatedAt),
  };
}

export function toPublicSdkBootstrapGrantRecord(
  grant: typeof publicSdkBootstrapGrants.$inferSelect,
): PublicSdkBootstrapGrantRecord {
  return {
    id: grant.id,
    installationId: grant.installationId,
    workspaceId: grant.workspaceId,
    environmentId: grant.environmentId,
    exactOrigin: grant.exactOrigin,
    grantHash: grant.grantHash,
    createdAt: toIsoString(grant.createdAt),
    expiresAt: toIsoString(grant.expiresAt),
    consumedAt: grant.consumedAt ? toIsoString(grant.consumedAt) : null,
    revokedAt: grant.revokedAt ? toIsoString(grant.revokedAt) : null,
  };
}

export function toAuthoringAuthorizationRequestRecord(
  request: typeof authoringAuthorizationRequests.$inferSelect,
  environment: 'development' | 'staging',
): AuthoringAuthorizationRequestRecord {
  return {
    requestId: request.id,
    bootstrapGrantId: request.bootstrapGrantId,
    installationId: request.installationId,
    workspaceId: request.workspaceId,
    environmentId: request.environmentId,
    environment,
    exactOrigin: request.exactOrigin,
    stateHash: request.stateHash,
    bootstrapGrantHash: request.bootstrapGrantHash,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: 'S256',
    requestedCapabilities: [...request.requestedCapabilities],
    ...(request.documentIntent ? { documentIntent: request.documentIntent } : {}),
    creatorId: request.creatorId,
    authorizationCodeHash: request.authorizationCodeHash,
    createdAt: toIsoString(request.createdAt),
    expiresAt: toIsoString(request.expiresAt),
    approvedAt: request.approvedAt ? toIsoString(request.approvedAt) : null,
    authorizationCodeExpiresAt: request.authorizationCodeExpiresAt
      ? toIsoString(request.authorizationCodeExpiresAt)
      : null,
    authorizationCodeUsedAt: request.authorizationCodeUsedAt
      ? toIsoString(request.authorizationCodeUsedAt)
      : null,
  };
}

export function toAuthoringActivationGrantRecord(
  grant: typeof authoringActivationGrants.$inferSelect,
  environment: 'development' | 'staging',
): AuthoringActivationGrantRecord {
  return {
    grantId: grant.id,
    requestId: grant.requestId,
    installationId: grant.installationId,
    workspaceId: grant.workspaceId,
    environmentId: grant.environmentId,
    environment,
    exactOrigin: grant.exactOrigin,
    creatorId: grant.creatorId,
    capabilities: [...grant.capabilities],
    ...(grant.documentIntent ? { documentIntent: grant.documentIntent } : {}),
    grantHash: grant.grantHash,
    createdAt: toIsoString(grant.createdAt),
    expiresAt: toIsoString(grant.expiresAt),
    usedAt: grant.usedAt ? toIsoString(grant.usedAt) : null,
    revokedAt: grant.revokedAt ? toIsoString(grant.revokedAt) : null,
  };
}

export function toAuthoringDocumentSessionRecord(
  session: typeof authoringSessions.$inferSelect,
  environment: 'development' | 'staging',
): AuthoringDocumentSessionRecord {
  if (
    !session.installationId ||
    !session.activationGrantId ||
    !session.customerOrigin ||
    !session.capabilities ||
    session.compilerVersion !== COMPILER_VERSION ||
    session.rendererContractVersion !== RENDERER_CONTRACT_VERSION ||
    session.themeContractVersion !== BRAND_THEME_CONTRACT_VERSION ||
    !session.themeVersionId
  ) {
    throw new Error('activated authoring session is missing its exact scope');
  }
  return {
    sessionId: session.id,
    correlationId: session.correlationId ?? `corr_${session.id}`,
    installationId: session.installationId,
    activationGrantId: session.activationGrantId,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment,
    documentId: session.documentId,
    customerOrigin: session.customerOrigin,
    creatorId: session.createdByUserId,
    capabilities: [...session.capabilities],
    compilerVersion: session.compilerVersion,
    rendererContractVersion: session.rendererContractVersion,
    themeContractVersion: session.themeContractVersion,
    themeVersionId: session.themeVersionId,
    tokenHash: session.tokenHash,
    iframeSrc: session.iframeSrc,
    createdAt: toIsoString(session.createdAt),
    expiresAt: toIsoString(session.expiresAt),
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : null,
  };
}

export function isAuthoringEnvironmentKind(
  environment: string,
): environment is 'development' | 'staging' {
  return environment === 'development' || environment === 'staging';
}
