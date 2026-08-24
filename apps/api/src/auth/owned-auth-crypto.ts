import { createHash, createHmac, randomBytes } from 'node:crypto';
import { argon2id, hash as hashArgon2, verify as verifyArgon2 } from 'argon2';
import type { AuthSessionRecord, PasswordCredentialRecord } from '@lodariq/database';
import {
  type AuthAssuranceLevel,
  type AuthenticationMethod,
  type AuthSessionDurationPolicy,
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  isAuthPassword,
} from '@lodariq/schema';

export const OWNED_PASSWORD_ALGORITHM = 'argon2id-v1' as const;
export const AUTH_SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTH_SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_STANDARD_SESSION_IDLE_TTL_MS = 12 * 60 * 60 * 1000;
export const AUTH_STANDARD_SESSION_ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
export const AUTH_MANAGED_SESSION_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
export const AUTH_MANAGED_SESSION_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
export const AUTH_SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const WORKSPACE_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthRateBucketPurpose =
  | 'sign-in'
  | 'sign-up'
  | 'verification-resend'
  | 'password-recovery-request'
  | 'password-recovery-complete'
  | 'username-change'
  | 'tenant-mutation'
  | 'enterprise-discovery'
  | 'enterprise-mutation';

/**
 * Argon2id cost. Production values are the default. The suite creates users and
 * signs in constantly, and 64 MiB x 3 passes per call across parallel workers is
 * what makes a full run time out rather than fail, so it runs a reduced profile.
 */
const ARGON2ID_PRODUCTION_COST = Object.freeze({
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
});
const ARGON2ID_TEST_COST = Object.freeze({ memoryCost: 8_192, timeCost: 2, parallelism: 1 });
const ARGON2ID_COST = process.env.VITEST ? ARGON2ID_TEST_COST : ARGON2ID_PRODUCTION_COST;

/** The parameters actually in force, and the ones production must ship. */
export const PASSWORD_HASH_PARAMETERS = ARGON2ID_COST;
export const PASSWORD_HASH_PRODUCTION_PARAMETERS = ARGON2ID_PRODUCTION_COST;

const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: ARGON2ID_COST.memoryCost,
  timeCost: ARGON2ID_COST.timeCost,
  parallelism: ARGON2ID_COST.parallelism,
  hashLength: 32,
});
// Shape only. Cost is checked against ARGON2ID_COST so the two cannot drift.
const ARGON2ID_HASH_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),p=(\d+),t=(\d+)\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/u;
const DUMMY_SALT = Buffer.from('LodariqAuthDummy', 'utf8');

export interface CreatedAuthSession {
  rawToken: string;
  record: AuthSessionRecord;
}

export function normalizeAuthEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function hashAuthEmailLookup(emailNormalized: string): string {
  return sha256Hex(emailNormalized);
}

export function hashAuthSessionToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function hashEmailVerificationToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function createEmailVerificationToken(challengeId: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(`lodariq-email-v1\0${challengeId}`).digest();
  return `lq_verify_${digest.toString('base64url')}`;
}

export function hashPasswordResetToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function createWorkspaceInvitationToken(invitationId: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`lodariq-workspace-invitation-v1\0${invitationId}`)
    .digest();
  return `lq_invite_${digest.toString('base64url')}`;
}

export function hashWorkspaceInvitationToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function createAccountEmailChangeToken(
  challengeId: string,
  proof: 'current_email' | 'new_email',
  secret: string,
): string {
  const digest = createHmac('sha256', secret)
    .update(`lodariq-account-email-change-v1\0${challengeId}\0${proof}`)
    .digest();
  return `lq_email_change_${digest.toString('base64url')}`;
}

export function hashAccountEmailChangeToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function createPasswordResetToken(challengeId: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`lodariq-password-reset-v1\0${challengeId}`)
    .digest();
  return `lq_reset_${digest.toString('base64url')}`;
}

export function hashAuthRateBucket(
  purpose: AuthRateBucketPurpose,
  dimension: 'challenge' | 'email' | 'identifier' | 'source' | 'user',
  value: string,
): string {
  return sha256Hex(`lodariq-rate-v1\0${purpose}\0${dimension}\0${value}`);
}

export async function hashOwnedPassword(
  userId: string,
  emailNormalized: string,
  password: string,
  now = new Date(),
): Promise<PasswordCredentialRecord> {
  assertPasswordInput(password);
  const passwordHash = await hashArgon2(password, PASSWORD_HASH_OPTIONS);
  const timestamp = now.toISOString();
  return {
    userId,
    emailNormalized,
    emailLookupHash: hashAuthEmailLookup(emailNormalized),
    algorithm: OWNED_PASSWORD_ALGORITHM,
    passwordHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Unknown accounts intentionally run the same asynchronous Argon2id workload as
 * known accounts. This keeps the public sign-in boundary from becoming an
 * email-enumeration timing oracle.
 */
export async function verifyOwnedPassword(
  password: string,
  credential: PasswordCredentialRecord | null,
): Promise<boolean> {
  if (!isSupportedCredential(credential)) {
    await hashArgon2(password, { ...PASSWORD_HASH_OPTIONS, salt: DUMMY_SALT });
    return false;
  }
  try {
    return await verifyArgon2(credential.passwordHash, password);
  } catch {
    return false;
  }
}

export function createOwnedAuthSession(
  userId: string,
  activeWorkspaceId: string | null,
  options: {
    now?: Date;
    absoluteExpiresAt?: string;
    identityId?: string | null;
    authenticationMethod?: AuthenticationMethod;
    assuranceLevel?: AuthAssuranceLevel;
    authenticatedAt?: string;
    durationPolicy?: AuthSessionDurationPolicy;
    deviceLabel?: string;
  } = {},
): CreatedAuthSession {
  const now = options.now ?? new Date();
  const durationPolicy = options.durationPolicy ?? 'standard';
  const duration = authSessionDuration(durationPolicy);
  const absoluteExpiresAt = options.absoluteExpiresAt
    ? new Date(options.absoluteExpiresAt)
    : new Date(now.getTime() + duration.absoluteTtlMs);
  const idleExpiresAt = new Date(
    Math.min(now.getTime() + duration.idleTtlMs, absoluteExpiresAt.getTime()),
  );
  if (
    !Number.isFinite(absoluteExpiresAt.getTime()) ||
    absoluteExpiresAt.getTime() <= now.getTime()
  ) {
    throw new Error('Cannot create an already-expired auth session');
  }

  const rawToken = `lq_sess_${randomBytes(32).toString('base64url')}`;
  const timestamp = now.toISOString();
  return {
    rawToken,
    record: {
      id: `authsess_${randomBytes(18).toString('base64url')}`,
      userId,
      tokenHash: hashAuthSessionToken(rawToken),
      activeWorkspaceId,
      identityId: options.identityId ?? null,
      authenticationMethod: options.authenticationMethod ?? 'password',
      assuranceLevel: options.assuranceLevel ?? 'aal1',
      authenticatedAt: options.authenticatedAt ?? timestamp,
      durationPolicy,
      deviceLabel: normalizeDeviceLabel(options.deviceLabel),
      createdAt: timestamp,
      lastSeenAt: timestamp,
      idleExpiresAt: idleExpiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      revokedAt: null,
    },
  };
}

export function authSessionIdleTtlMs(policy: AuthSessionDurationPolicy): number {
  return authSessionDuration(policy).idleTtlMs;
}

export function describeAuthDevice(userAgent: string | undefined): string {
  if (!userAgent?.trim()) return 'Unknown device';
  const browser = /Edg\//u.test(userAgent)
    ? 'Edge'
    : /Firefox\//u.test(userAgent)
      ? 'Firefox'
      : /Chrome\//u.test(userAgent)
        ? 'Chrome'
        : /Safari\//u.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const platform = /iPhone|iPad/u.test(userAgent)
    ? 'iOS'
    : /Android/u.test(userAgent)
      ? 'Android'
      : /Mac OS X/u.test(userAgent)
        ? 'macOS'
        : /Windows/u.test(userAgent)
          ? 'Windows'
          : /Linux/u.test(userAgent)
            ? 'Linux'
            : 'unknown platform';
  return `${browser} on ${platform}`;
}

function authSessionDuration(policy: AuthSessionDurationPolicy): {
  idleTtlMs: number;
  absoluteTtlMs: number;
} {
  if (policy === 'remembered') {
    return {
      idleTtlMs: AUTH_SESSION_IDLE_TTL_MS,
      absoluteTtlMs: AUTH_SESSION_ABSOLUTE_TTL_MS,
    };
  }
  if (policy === 'managed') {
    return {
      idleTtlMs: AUTH_MANAGED_SESSION_IDLE_TTL_MS,
      absoluteTtlMs: AUTH_MANAGED_SESSION_ABSOLUTE_TTL_MS,
    };
  }
  return {
    idleTtlMs: AUTH_STANDARD_SESSION_IDLE_TTL_MS,
    absoluteTtlMs: AUTH_STANDARD_SESSION_ABSOLUTE_TTL_MS,
  };
}

function normalizeDeviceLabel(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length <= 120 ? normalized : 'Unknown device';
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// Cost is a floor, not an exact match: a credential hashed at a higher cost than
// the one in force is still valid. Raising the production cost still needs a
// rehash-on-verify path before it can ship.
function isSupportedCredential(
  credential: PasswordCredentialRecord | null,
): credential is PasswordCredentialRecord {
  if (!credential || credential.algorithm !== OWNED_PASSWORD_ALGORITHM) return false;
  const encoded = ARGON2ID_HASH_PATTERN.exec(credential.passwordHash);
  if (!encoded) return false;
  const [, memoryCost, parallelism, timeCost] = encoded;
  return (
    Number(memoryCost) >= ARGON2ID_COST.memoryCost &&
    Number(timeCost) >= ARGON2ID_COST.timeCost &&
    Number(parallelism) === ARGON2ID_COST.parallelism
  );
}

function assertPasswordInput(password: string): void {
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (!isAuthPassword(password) || byteLength > 512) {
    throw new Error(
      `Password must be between ${AUTH_PASSWORD_MIN_LENGTH} and ${AUTH_PASSWORD_MAX_LENGTH} characters`,
    );
  }
}
