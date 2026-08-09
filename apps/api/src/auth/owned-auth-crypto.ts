import { createHash, createHmac, randomBytes } from 'node:crypto';
import { argon2id, hash as hashArgon2, verify as verifyArgon2 } from 'argon2';
import type { AuthSessionRecord, PasswordCredentialRecord } from '@lodariq/database';
import {
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  isAuthPassword,
} from '@lodariq/schema';

export const OWNED_PASSWORD_ALGORITHM = 'argon2id-v1' as const;
export const AUTH_SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const AUTH_SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_SESSION_TOUCH_INTERVAL_MS = 15 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export type AuthRateBucketPurpose =
  'sign-in' | 'sign-up' | 'password-recovery-request' | 'password-recovery-complete';

const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});
const ARGON2ID_HASH_PATTERN =
  /^\$argon2id\$v=19\$m=65536,p=1,t=3\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/u;
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

export function createPasswordResetToken(challengeId: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`lodariq-password-reset-v1\0${challengeId}`)
    .digest();
  return `lq_reset_${digest.toString('base64url')}`;
}

export function hashAuthRateBucket(
  purpose: AuthRateBucketPurpose,
  dimension: 'challenge' | 'email' | 'source',
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
  options: { now?: Date; absoluteExpiresAt?: string } = {},
): CreatedAuthSession {
  const now = options.now ?? new Date();
  const absoluteExpiresAt = options.absoluteExpiresAt
    ? new Date(options.absoluteExpiresAt)
    : new Date(now.getTime() + AUTH_SESSION_ABSOLUTE_TTL_MS);
  const idleExpiresAt = new Date(
    Math.min(now.getTime() + AUTH_SESSION_IDLE_TTL_MS, absoluteExpiresAt.getTime()),
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
      createdAt: timestamp,
      lastSeenAt: timestamp,
      idleExpiresAt: idleExpiresAt.toISOString(),
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
      revokedAt: null,
    },
  };
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isSupportedCredential(
  credential: PasswordCredentialRecord | null,
): credential is PasswordCredentialRecord {
  return Boolean(
    credential &&
    credential.algorithm === OWNED_PASSWORD_ALGORITHM &&
    ARGON2ID_HASH_PATTERN.test(credential.passwordHash),
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
