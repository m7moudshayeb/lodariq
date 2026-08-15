import type {
  AuthAssuranceLevel,
  AuthOnboardingIntent,
  AuthOnboardingStatus,
  AuthenticationMethod,
  AuthIdentityKind,
  AuthIdentityMutationAuthorization,
  AuthSessionDurationPolicy,
  SsoConnectionStatus,
  SsoProtocol,
} from '@lodariq/schema';
import type { WorkspaceEnvironment } from './environments';

export const LODARIQ_IDENTITY_ISSUER = 'https://lodariq.io';

export interface UserEmailRecord {
  id: string;
  userId: string;
  normalizedEmail: string;
  isPrimary: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsernameRecord {
  id: string;
  userId: string;
  normalizedUsername: string;
  displayUsername: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthIdentityRecord {
  id: string;
  userId: string;
  kind: AuthIdentityKind;
  issuer: string;
  subject: string;
  providerTenantId: string | null;
  createdAt: string;
  lastAuthenticatedAt: string | null;
  disabledAt?: string | null;
}

export interface PasswordAuthenticationRecord {
  credential: PasswordCredentialRecord;
  identity: AuthIdentityRecord;
}

export interface WorkspaceAuthPolicyRecord {
  workspaceId: string;
  ssoRequired: boolean;
  minimumAssurance: AuthAssuranceLevel;
  passwordAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SsoConnectionRecord {
  id: string;
  workspaceId: string;
  protocol: SsoProtocol;
  issuer: string;
  status: SsoConnectionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IdentityOnboardingStateRecord {
  id: string;
  userId: string;
  intent: AuthOnboardingIntent;
  status: AuthOnboardingStatus;
  targetWorkspaceId: string | null;
  targetWorkspaceName: string | null;
  invitationId: string | null;
  requestedWorkspaceId: string | null;
  completedWorkspaceId: string | null;
  version: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export const AUTH_SECURITY_EVENT_TYPES = [
  'identity_linked',
  'identity_unlinked',
  'identity_unlink_rejected_final_method',
] as const;
export type AuthSecurityEventType = (typeof AUTH_SECURITY_EVENT_TYPES)[number];

export interface AuthSecurityEventRecord {
  id: string;
  userId: string;
  actorUserId: string;
  eventType: AuthSecurityEventType;
  identityId: string;
  authorization: AuthIdentityMutationAuthorization;
  occurredAt: string;
}

export interface LinkAuthIdentityInput {
  identity: AuthIdentityRecord;
  actorUserId: string;
  authorization: AuthSecurityEventRecord['authorization'];
  eventId: string;
  occurredAt: string;
}

export interface UnlinkAuthIdentityInput {
  userId: string;
  identityId: string;
  actorUserId: string;
  authorization: AuthSecurityEventRecord['authorization'];
  eventId: string;
  occurredAt: string;
}

export type UnlinkAuthIdentityResult = 'unlinked' | 'not_found' | 'final_method' | 'conflict';

export const AUTH_USERNAME_CHANGE_STATUSES = [
  'updated',
  'conflict',
  'rate_limited',
  'credential_changed',
  'invalid_input',
] as const;
export type AuthUsernameChangeStatus = (typeof AUTH_USERNAME_CHANGE_STATUSES)[number];

export interface SetAuthUsernameInput {
  userId: string;
  normalizedUsername: string;
  displayUsername: string;
  expectedPasswordHash: string;
  changedAt: string;
  minimumPreviousChangeAt: string;
  usernameId: string;
}

export interface SetAuthUsernameResult {
  status: AuthUsernameChangeStatus;
  username?: UsernameRecord;
}

export const RESERVED_AUTH_USERNAMES = new Set<string>([
  'account',
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'billing',
  'dashboard',
  'editor',
  'help',
  'lodariq',
  'login',
  'logout',
  'me',
  'oauth',
  'owner',
  'root',
  'security',
  'settings',
  'signin',
  'signup',
  'sso',
  'support',
  'system',
  'verify',
  'www',
]);

export type AuthUsernameValidationResult =
  | { valid: true; normalizedUsername: string; displayUsername: string }
  | { valid: false; reason: 'format' | 'reserved' | 'spoofing' };

export function validateAuthUsername(value: string): AuthUsernameValidationResult {
  const displayUsername = value.trim();
  const unicodeNormalized = displayUsername.normalize('NFKC');
  if (unicodeNormalized !== displayUsername || /[^\p{ASCII}]/u.test(displayUsername)) {
    return { valid: false, reason: 'spoofing' };
  }
  const normalizedUsername = unicodeNormalized.toLowerCase();
  if (
    normalizedUsername.length < 3 ||
    normalizedUsername.length > 32 ||
    !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(normalizedUsername) ||
    /[._-]{2}/u.test(normalizedUsername)
  ) {
    return { valid: false, reason: 'format' };
  }
  if (RESERVED_AUTH_USERNAMES.has(normalizedUsername)) {
    return { valid: false, reason: 'reserved' };
  }
  return { valid: true, normalizedUsername, displayUsername };
}

export type NormalizedAuthIdentifier =
  { kind: 'email'; value: string } | { kind: 'username'; value: string };

export function normalizeAuthIdentifier(value: string): NormalizedAuthIdentifier | null {
  const normalized = value.trim().normalize('NFKC').toLowerCase();
  if (!normalized || normalized.length > 320 || /\s/u.test(normalized)) return null;
  if (normalized.includes('@')) return { kind: 'email', value: normalized };
  const username = validateAuthUsername(normalized);
  return username.valid ? { kind: 'username', value: username.normalizedUsername } : null;
}

export interface UserRecord {
  id: string;
  /** Nullable rollback-only identifier from the retired external provider. */
  legacyIdentityId: string | null;
  email: string;
  name?: string | null;
  emailVerifiedAt?: string | null;
  deletedAt?: string | null;
  retentionExpiresAt?: string | null;
  createdAt: string;
}

export interface EmailVerificationChallengeRecord {
  id: string;
  userId: string;
  keyId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

/** A password-enrollment/reset challenge. Raw lq_reset tokens are never persisted. */
export interface SetPasswordChallengeRecord {
  id: string;
  userId: string;
  keyId: string;
  tokenHash: string;
  emailNormalized: string;
  emailLookupHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AuthOutboxRecord {
  id: string;
  type: 'email_verification';
  userId: string;
  recipientEmail: string;
  payload: { challengeId: string; verificationPath: string; keyId: string };
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion?: number;
  lastError: string | null;
  terminalAt?: string | null;
  createdAt: string;
}

export interface SetPasswordOutboxRecord {
  id: string;
  type: 'set_password';
  userId: string;
  recipientEmail: string;
  payload: {
    purpose: 'set_password';
    challengeId: string;
    resetPath: string;
    keyId: string;
  };
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion?: number;
  lastError: string | null;
  terminalAt?: string | null;
  createdAt: string;
}

export interface WorkspaceInvitationOutboxRecord {
  id: string;
  type: 'workspace_invitation';
  workspaceId: string;
  invitationId: string;
  recipientEmail: string;
  payload: {
    purpose: 'workspace_invitation';
    invitationId: string;
    acceptancePath: string;
    keyId: string;
  };
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion?: number;
  lastError: string | null;
  terminalAt?: string | null;
  createdAt: string;
}

export type AuthEmailPurpose =
  | 'email_verification'
  | 'set_password'
  | 'workspace_invitation'
  | 'account_email_change_current'
  | 'account_email_change_new';

const AUTH_EMAIL_TOKEN_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;

export function isAuthEmailTokenKeyId(value: string): boolean {
  return AUTH_EMAIL_TOKEN_KEY_ID_PATTERN.test(value);
}

export interface ClaimedAuthEmailOutboxRow {
  id: string;
  recipientEmail: string;
  purpose: AuthEmailPurpose;
  challengeId: string;
  keyId: string;
  attempt: number;
  leaseVersion: number;
  createdAt: string;
}

export interface ClaimDueAuthEmailRowsInput {
  now: string;
  limit: number;
  leaseDurationMs: number;
}

export interface AcknowledgeAuthEmailRowInput {
  id: string;
  purpose: AuthEmailPurpose;
  leaseVersion: number;
  processedAt: string;
}

export interface RetryAuthEmailRowInput {
  id: string;
  purpose: AuthEmailPurpose;
  leaseVersion: number;
  failureCode: string;
  availableAt: string | null;
  terminal: boolean;
}

export interface AuthEmailOutboxQueue {
  claimDue(input: ClaimDueAuthEmailRowsInput): Promise<readonly ClaimedAuthEmailOutboxRow[]>;
  acknowledge(input: AcknowledgeAuthEmailRowInput): Promise<boolean>;
  retry(input: RetryAuthEmailRowInput): Promise<boolean>;
}

export interface NormalizedAuthEmailClaimInput {
  now: string;
  limit: number;
  leaseExpiresAt: string;
}

const AUTH_EMAIL_OUTBOX_MAX_BATCH_SIZE = 25;
const AUTH_EMAIL_OUTBOX_MIN_LEASE_MS = 5_000;
const AUTH_EMAIL_OUTBOX_MAX_LEASE_MS = 5 * 60_000;

export function normalizeAuthEmailClaimInput(
  input: ClaimDueAuthEmailRowsInput,
): NormalizedAuthEmailClaimInput | null {
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(nowMs) || !Number.isFinite(input.limit)) return null;
  const limit = Math.max(0, Math.min(Math.trunc(input.limit), AUTH_EMAIL_OUTBOX_MAX_BATCH_SIZE));
  if (limit === 0 || !Number.isFinite(input.leaseDurationMs)) return null;
  const leaseDurationMs = Math.max(
    AUTH_EMAIL_OUTBOX_MIN_LEASE_MS,
    Math.min(Math.trunc(input.leaseDurationMs), AUTH_EMAIL_OUTBOX_MAX_LEASE_MS),
  );
  return {
    now: new Date(nowMs).toISOString(),
    limit,
    leaseExpiresAt: new Date(nowMs + leaseDurationMs).toISOString(),
  };
}

export function sanitizeAuthEmailFailureCode(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '_')
    .replace(/^[-_]+|[-_]+$/gu, '')
    .slice(0, 64);
  return normalized || 'delivery_failed';
}

export interface ConsumeAuthRateLimitInput {
  bucketHash: string;
  scope: 'sign-in' | 'sign-up';
  now: string;
  windowMs: number;
  maxAttempts: number;
  blockMs: number;
}

export const AUTH_DELIVERY_STATES = [
  'queued',
  'retry_scheduled',
  'provider_accepted',
  'terminal',
] as const;

export type AuthDeliveryState = (typeof AUTH_DELIVERY_STATES)[number];

export interface AuthDeliveryStatusRecord {
  outboxId: string;
  challengeId: string;
  keyId: string;
  purpose: AuthEmailPurpose;
  state: AuthDeliveryState;
  attempts: number;
  lastFailureCode: string | null;
  createdAt: string;
  nextAttemptAt: string | null;
  providerAcceptedAt: string | null;
  terminalAt: string | null;
}

export interface AuthLifecycleCleanupInput {
  now: string;
  abandonedUnverifiedBefore: string;
  challengeBefore: string;
  sessionBefore: string;
  rateLimitBefore: string;
  outboxBefore: string;
  limit: number;
}

export interface AuthLifecycleCleanupResult {
  deletedAccounts: number;
  abandonedUsers: number;
  emptyWorkspaces: number;
  verificationChallenges: number;
  setPasswordChallenges: number;
  sessions: number;
  rateLimitBuckets: number;
  verificationOutboxRows: number;
  setPasswordOutboxRows: number;
  workspaceInvitationOutboxRows: number;
  accountEmailChangeChallenges: number;
  accountEmailChangeOutboxRows: number;
}

export interface NormalizedAuthLifecycleCleanupInput extends AuthLifecycleCleanupInput {
  limit: number;
}

export function normalizeAuthLifecycleCleanupInput(
  input: AuthLifecycleCleanupInput,
): NormalizedAuthLifecycleCleanupInput | null {
  const timestamps = [
    input.now,
    input.abandonedUnverifiedBefore,
    input.challengeBefore,
    input.sessionBefore,
    input.rateLimitBefore,
    input.outboxBefore,
  ];
  if (timestamps.some((value) => !Number.isFinite(Date.parse(value)))) return null;
  const now = Date.parse(input.now);
  if (timestamps.slice(1).some((value) => Date.parse(value) > now)) return null;
  if (!Number.isFinite(input.limit)) return null;
  const limit = Math.max(0, Math.min(Math.trunc(input.limit), 100));
  if (limit === 0) return null;
  return { ...input, limit };
}

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface PasswordCredentialRecord {
  userId: string;
  emailNormalized: string;
  emailLookupHash: string;
  algorithm: 'argon2id-v1';
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  activeWorkspaceId: string | null;
  identityId: string | null;
  authenticationMethod: AuthenticationMethod;
  assuranceLevel: AuthAssuranceLevel;
  authenticatedAt: string;
  durationPolicy: AuthSessionDurationPolicy;
  deviceLabel?: string;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
}

export function isValidAuthSessionRecord(session: AuthSessionRecord): boolean {
  const authenticatedAt = Date.parse(session.authenticatedAt);
  const createdAt = Date.parse(session.createdAt);
  const lastSeenAt = Date.parse(session.lastSeenAt);
  const idleExpiresAt = Date.parse(session.idleExpiresAt);
  const absoluteExpiresAt = Date.parse(session.absoluteExpiresAt);
  return (
    /^authsess_[A-Za-z0-9_-]{20,}$/u.test(session.id) &&
    /^[0-9a-f]{64}$/u.test(session.tokenHash) &&
    [authenticatedAt, createdAt, lastSeenAt, idleExpiresAt, absoluteExpiresAt].every(
      Number.isFinite,
    ) &&
    authenticatedAt <= createdAt &&
    createdAt <= lastSeenAt &&
    lastSeenAt < idleExpiresAt &&
    idleExpiresAt <= absoluteExpiresAt &&
    (session.revokedAt === null || Number.isFinite(Date.parse(session.revokedAt)))
  );
}

export interface IdentityWorkspaceRecord {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export interface CreateIdentityAccountInput {
  user: UserRecord;
  userEmail: UserEmailRecord;
  passwordIdentity: AuthIdentityRecord;
  credential: PasswordCredentialRecord;
  workspace: { id: string; name: string; createdAt: string; updatedAt: string };
  membership: WorkspaceMembershipRecord;
  environments: WorkspaceEnvironment[];
  session?: AuthSessionRecord;
  emailVerificationChallenge: EmailVerificationChallengeRecord;
  outboxMessage: AuthOutboxRecord;
}

export interface RegisterIdentityAccountInput {
  user: UserRecord;
  userEmail: UserEmailRecord;
  passwordIdentity: AuthIdentityRecord;
  credential: PasswordCredentialRecord;
  onboarding: IdentityOnboardingStateRecord;
  emailVerificationChallenge: EmailVerificationChallengeRecord;
  outboxMessage: AuthOutboxRecord;
}

export function isValidAuthIdentityRecord(identity: AuthIdentityRecord): boolean {
  const firstParty = identity.kind === 'password' || identity.kind === 'passkey';
  const external = identity.kind === 'oidc' || identity.kind === 'saml';
  return (
    /^ident_[A-Za-z0-9_-]{20,}$/u.test(identity.id) &&
    identity.issuer.length >= 1 &&
    identity.issuer.length <= 2048 &&
    identity.subject.length >= 1 &&
    identity.subject.length <= 1024 &&
    Number.isFinite(Date.parse(identity.createdAt)) &&
    (identity.lastAuthenticatedAt === null ||
      Number.isFinite(Date.parse(identity.lastAuthenticatedAt))) &&
    (!identity.disabledAt || Number.isFinite(Date.parse(identity.disabledAt))) &&
    ((firstParty &&
      identity.issuer === LODARIQ_IDENTITY_ISSUER &&
      identity.providerTenantId === null) ||
      (external && Boolean(identity.providerTenantId?.trim())))
  );
}

export function isValidIdentityRegistrationInput(input: RegisterIdentityAccountInput): boolean {
  const normalizedEmail = input.user.email.trim().toLowerCase();
  const createdAt = Date.parse(input.onboarding.createdAt);
  const updatedAt = Date.parse(input.onboarding.updatedAt);
  const expiresAt = Date.parse(input.onboarding.expiresAt);
  const challengeCreatedAt = Date.parse(input.emailVerificationChallenge.createdAt);
  const challengeExpiresAt = Date.parse(input.emailVerificationChallenge.expiresAt);
  return (
    input.user.emailVerifiedAt == null &&
    normalizedEmail === input.userEmail.normalizedEmail &&
    normalizedEmail === input.credential.emailNormalized &&
    input.userEmail.userId === input.user.id &&
    input.userEmail.isPrimary &&
    input.userEmail.verifiedAt === null &&
    input.credential.userId === input.user.id &&
    input.passwordIdentity.userId === input.user.id &&
    input.passwordIdentity.kind === 'password' &&
    input.passwordIdentity.issuer === LODARIQ_IDENTITY_ISSUER &&
    input.passwordIdentity.subject === `user:${input.user.id}` &&
    input.passwordIdentity.providerTenantId === null &&
    input.passwordIdentity.disabledAt == null &&
    isValidAuthIdentityRecord(input.passwordIdentity) &&
    input.onboarding.userId === input.user.id &&
    input.onboarding.intent === 'create_workspace' &&
    input.onboarding.status === 'pending_identity' &&
    Boolean(input.onboarding.targetWorkspaceId) &&
    Boolean(input.onboarding.targetWorkspaceName?.trim()) &&
    input.onboarding.invitationId === null &&
    input.onboarding.requestedWorkspaceId === null &&
    input.onboarding.completedWorkspaceId === null &&
    input.onboarding.version === 1 &&
    [createdAt, updatedAt, expiresAt].every(Number.isFinite) &&
    createdAt === updatedAt &&
    createdAt < expiresAt &&
    input.emailVerificationChallenge.userId === input.user.id &&
    input.emailVerificationChallenge.usedAt === null &&
    isAuthEmailTokenKeyId(input.emailVerificationChallenge.keyId) &&
    /^[0-9a-f]{64}$/u.test(input.emailVerificationChallenge.tokenHash) &&
    [challengeCreatedAt, challengeExpiresAt].every(Number.isFinite) &&
    challengeCreatedAt < challengeExpiresAt &&
    input.outboxMessage.type === 'email_verification' &&
    input.outboxMessage.userId === input.user.id &&
    input.outboxMessage.recipientEmail === normalizedEmail &&
    input.outboxMessage.payload.challengeId === input.emailVerificationChallenge.id &&
    input.outboxMessage.payload.keyId === input.emailVerificationChallenge.keyId &&
    input.outboxMessage.processedAt === null &&
    input.outboxMessage.attempts === 0 &&
    input.outboxMessage.lastError === null &&
    input.outboxMessage.terminalAt == null
  );
}

export interface CompleteIdentityOnboardingInput {
  onboardingId: string;
  userId: string;
  targetWorkspaceId: string;
  environments: WorkspaceEnvironment[];
  completedAt: string;
}

export interface IdentityOnboardingCompletion {
  onboarding: IdentityOnboardingStateRecord;
  workspace: IdentityWorkspaceRecord;
}

export interface CreateIdentityWorkspaceInput {
  userId: string;
  workspace: { id: string; name: string; createdAt: string; updatedAt: string };
  membership: WorkspaceMembershipRecord;
  environments: WorkspaceEnvironment[];
}

export interface RotateAuthSessionInput {
  currentTokenHash: string;
  nextSession: AuthSessionRecord;
}

export interface CreateCredentialBoundAuthSessionInput {
  session: AuthSessionRecord;
  expectedPasswordHash: string;
}

export interface ResolvedEmailVerificationChallenge {
  userId: string;
  emailNormalized: string;
}

export interface ConsumeEmailVerificationChallengeInput {
  challengeId: string;
  tokenHash: string;
  usedAt: string;
  credential: SetPasswordCredentialMaterial;
}

export interface RequestEmailVerificationChallengeInput {
  emailNormalized: string;
  emailLookupHash: string;
  now: string;
  cooldownMs: number;
  challenge: Omit<EmailVerificationChallengeRecord, 'userId'>;
  outboxMessage: Omit<AuthOutboxRecord, 'userId' | 'recipientEmail'>;
}

export const EMAIL_VERIFICATION_CHALLENGE_REQUEST_STATUSES = [
  'queued',
  'cooldown',
  'no_match',
  'already_verified',
  'invalid_input',
  'persistence_conflict',
] as const;

export type EmailVerificationChallengeRequestStatus =
  (typeof EMAIL_VERIFICATION_CHALLENGE_REQUEST_STATUSES)[number];

/** Internal-only outcome; public resend responses remain enumeration-resistant. */
export interface EmailVerificationChallengeRequestResult {
  status: EmailVerificationChallengeRequestStatus;
}

export interface RequestSetPasswordChallengeInput {
  emailNormalized: string;
  emailLookupHash: string;
  challenge: Omit<SetPasswordChallengeRecord, 'userId'>;
  outboxMessage: Omit<SetPasswordOutboxRecord, 'userId' | 'recipientEmail'>;
}

export const SET_PASSWORD_CHALLENGE_REQUEST_STATUSES = [
  'queued',
  'no_match',
  'ambiguous_match',
  'invalid_input',
  'persistence_conflict',
] as const;

export type SetPasswordChallengeRequestStatus =
  (typeof SET_PASSWORD_CHALLENGE_REQUEST_STATUSES)[number];

/**
 * Internal-only recovery result. HTTP callers still receive the same generic
 * accepted response for every valid request so this status cannot become an
 * account-enumeration oracle.
 */
export interface SetPasswordChallengeRequestResult {
  status: SetPasswordChallengeRequestStatus;
}

export interface ResolvedSetPasswordChallenge {
  userId: string;
  emailNormalized: string;
}

export type SetPasswordCredentialMaterial = Omit<
  PasswordCredentialRecord,
  'userId' | 'emailNormalized' | 'emailLookupHash'
>;

export interface ConsumeSetPasswordChallengeInput {
  challengeId: string;
  tokenHash: string;
  usedAt: string;
  credential: SetPasswordCredentialMaterial;
  passwordIdentity: AuthIdentityRecord;
}

export interface IdentityRepository extends AuthEmailOutboxQueue {
  readDatabaseTime(): Promise<string>;
  findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null>;
  findPasswordAuthenticationByIdentifier(
    identifier: NormalizedAuthIdentifier,
    emailLookupHash: string | null,
  ): Promise<PasswordAuthenticationRecord | null>;
  findPasswordAuthenticationByUserId(userId: string): Promise<PasswordAuthenticationRecord | null>;
  findAuthIdentityByProviderSubject(
    issuer: string,
    subject: string,
  ): Promise<AuthIdentityRecord | null>;
  listAuthIdentities(userId: string): Promise<AuthIdentityRecord[]>;
  createAuthIdentity(identity: AuthIdentityRecord): Promise<boolean>;
  linkAuthIdentity(input: LinkAuthIdentityInput): Promise<boolean>;
  unlinkAuthIdentity(input: UnlinkAuthIdentityInput): Promise<UnlinkAuthIdentityResult>;
  listAuthSecurityEvents(userId: string): Promise<AuthSecurityEventRecord[]>;
  getAuthUsername(userId: string): Promise<UsernameRecord | null>;
  setAuthUsername(input: SetAuthUsernameInput): Promise<SetAuthUsernameResult>;
  getIdentityUser(userId: string): Promise<UserRecord | null>;
  createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean>;
  registerIdentityAccount(input: RegisterIdentityAccountInput): Promise<boolean>;
  getCurrentIdentityOnboarding(userId: string): Promise<IdentityOnboardingStateRecord | null>;
  completeIdentityOnboarding(
    input: CompleteIdentityOnboardingInput,
  ): Promise<IdentityOnboardingCompletion | null>;
  resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null>;
  consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null>;
  requestEmailVerificationChallenge(
    input: RequestEmailVerificationChallengeInput,
  ): Promise<EmailVerificationChallengeRequestResult>;
  requestSetPasswordChallenge(
    input: RequestSetPasswordChallengeInput,
  ): Promise<SetPasswordChallengeRequestResult>;
  resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null>;
  consumeSetPasswordChallenge(input: ConsumeSetPasswordChallengeInput): Promise<UserRecord | null>;
  consumeAuthRateLimit(input: ConsumeAuthRateLimitInput): Promise<AuthRateLimitResult>;
  pruneAuthRateLimits(before: string, limit: number): Promise<number>;
  getAuthDeliveryStatus(
    purpose: AuthEmailPurpose,
    outboxId: string,
  ): Promise<AuthDeliveryStatusRecord | null>;
  cleanupAuthLifecycle(input: AuthLifecycleCleanupInput): Promise<AuthLifecycleCleanupResult>;
  createAuthSession(session: AuthSessionRecord): Promise<AuthSessionRecord>;
  createCredentialBoundAuthSession(
    input: CreateCredentialBoundAuthSessionInput,
  ): Promise<AuthSessionRecord | null>;
  resolveAuthSession(tokenHash: string, now: string): Promise<AuthSessionRecord | null>;
  touchAuthSession(
    tokenHash: string,
    now: string,
    idleExpiresAt: string,
  ): Promise<AuthSessionRecord | null>;
  rotateAuthSession(input: RotateAuthSessionInput): Promise<AuthSessionRecord | null>;
  revokeAuthSession(tokenHash: string, revokedAt: string): Promise<boolean>;
  listIdentityWorkspaces(userId: string): Promise<IdentityWorkspaceRecord[]>;
  createIdentityWorkspace(input: CreateIdentityWorkspaceInput): Promise<boolean>;
}

export interface WorkspaceMembershipRecord {
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: string;
}

/**
 * Persistence groundwork for Phase 5. No invitation can be issued until the
 * capability-checked tenant administration API is implemented.
 */
export interface WorkspaceInvitationRecord {
  id: string;
  workspaceId: string;
  emailNormalized: string;
  emailLookupHash: string;
  tokenHash: string;
  role: 'admin' | 'member' | 'viewer';
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
