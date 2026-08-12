import type { WorkspaceEnvironment } from './environments';

export interface UserRecord {
  id: string;
  /** Nullable rollback-only identifier from the retired external provider. */
  legacyIdentityId: string | null;
  email: string;
  name?: string | null;
  emailVerifiedAt?: string | null;
  createdAt: string;
}

export interface EmailVerificationChallengeRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

/** A password-enrollment/reset challenge. Raw lq_reset tokens are never persisted. */
export interface SetPasswordChallengeRecord {
  id: string;
  userId: string;
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
  payload: { challengeId: string; verificationPath: string };
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
  };
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion?: number;
  lastError: string | null;
  terminalAt?: string | null;
  createdAt: string;
}

export type AuthEmailPurpose = 'email_verification' | 'set_password';

export interface ClaimedAuthEmailOutboxRow {
  id: string;
  recipientEmail: string;
  purpose: AuthEmailPurpose;
  challengeId: string;
  attempt: number;
  leaseVersion: number;
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
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
}

export interface IdentityWorkspaceRecord {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export interface CreateIdentityAccountInput {
  user: UserRecord;
  credential: PasswordCredentialRecord;
  workspace: { id: string; name: string; createdAt: string; updatedAt: string };
  membership: WorkspaceMembershipRecord;
  environments: WorkspaceEnvironment[];
  session?: AuthSessionRecord;
  emailVerificationChallenge: EmailVerificationChallengeRecord;
  outboxMessage: AuthOutboxRecord;
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

export interface RequestSetPasswordChallengeInput {
  emailNormalized: string;
  emailLookupHash: string;
  challenge: Omit<SetPasswordChallengeRecord, 'userId'>;
  outboxMessage: Omit<SetPasswordOutboxRecord, 'userId' | 'recipientEmail'>;
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
}

export interface IdentityRepository extends AuthEmailOutboxQueue {
  findPasswordCredentialByEmail(
    emailNormalized: string,
    emailLookupHash: string,
  ): Promise<PasswordCredentialRecord | null>;
  getIdentityUser(userId: string): Promise<UserRecord | null>;
  createIdentityAccount(input: CreateIdentityAccountInput): Promise<boolean>;
  resolveEmailVerificationChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedEmailVerificationChallenge | null>;
  consumeEmailVerificationChallenge(
    input: ConsumeEmailVerificationChallengeInput,
  ): Promise<UserRecord | null>;
  requestSetPasswordChallenge(input: RequestSetPasswordChallengeInput): Promise<boolean>;
  resolveSetPasswordChallenge(
    challengeId: string,
    tokenHash: string,
    now: string,
  ): Promise<ResolvedSetPasswordChallenge | null>;
  consumeSetPasswordChallenge(input: ConsumeSetPasswordChallengeInput): Promise<UserRecord | null>;
  consumeAuthRateLimit(input: ConsumeAuthRateLimitInput): Promise<AuthRateLimitResult>;
  pruneAuthRateLimits(before: string, limit: number): Promise<number>;
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
