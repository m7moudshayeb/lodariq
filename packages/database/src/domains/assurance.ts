import type { AccountSecurityEventRecord } from './account-management';
import type { AuthIdentityRecord, AuthSessionRecord, NormalizedAuthIdentifier } from './identity';

export const WEBAUTHN_CHALLENGE_PURPOSES = [
  'passkey_registration',
  'passkey_authentication',
  'passkey_step_up',
] as const;
export type WebAuthnChallengePurpose = (typeof WEBAUTHN_CHALLENGE_PURPOSES)[number];

export interface WebAuthnChallengeRecord {
  id: string;
  purpose: WebAuthnChallengePurpose;
  userId: string | null;
  challengeHash: string;
  rpId: string;
  origin: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface PasskeyCredentialRecord {
  id: string;
  userId: string;
  identityId: string;
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  aaguid: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CompletePasskeyRegistrationInput {
  challengeId: string;
  challengeHash: string;
  userId: string;
  consumedAt: string;
  credential: PasskeyCredentialRecord;
  identity: AuthIdentityRecord;
  event: AccountSecurityEventRecord;
}

export interface CompletePasskeyAuthenticationInput {
  challengeId: string;
  challengeHash: string;
  credentialId: string;
  expectedCounter: number;
  nextCounter: number;
  authenticatedAt: string;
  nextSession: AuthSessionRecord;
  currentSessionTokenHash: string | null;
  event: AccountSecurityEventRecord;
}

export interface RecoveryCodeSetRecord {
  id: string;
  userId: string;
  confirmedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface RecoveryCodeRecord {
  id: string;
  setId: string;
  userId: string;
  codeHash: string;
  usedAt: string | null;
  createdAt: string;
}

export interface CreateRecoveryCodeSetInput {
  set: RecoveryCodeSetRecord;
  codes: RecoveryCodeRecord[];
  event: AccountSecurityEventRecord;
}

export interface ConsumeRecoveryCodeInput {
  userId: string;
  codeHash: string;
  usedAt: string;
  session: AuthSessionRecord;
  event: AccountSecurityEventRecord;
}

export interface RecoveryCodeStatusRecord {
  setId: string;
  confirmed: boolean;
  remaining: number;
  createdAt: string;
}

export interface AssuranceRepository {
  createWebAuthnChallenge(challenge: WebAuthnChallengeRecord): Promise<boolean>;
  getWebAuthnChallenge(challengeId: string, now: string): Promise<WebAuthnChallengeRecord | null>;
  completePasskeyRegistration(input: CompletePasskeyRegistrationInput): Promise<boolean>;
  findPasskeyCredential(credentialId: string): Promise<PasskeyCredentialRecord | null>;
  listPasskeyCredentials(userId: string): Promise<PasskeyCredentialRecord[]>;
  completePasskeyAuthentication(
    input: CompletePasskeyAuthenticationInput,
  ): Promise<AuthSessionRecord | null>;
  findIdentityUserByIdentifier(
    identifier: NormalizedAuthIdentifier,
    emailLookupHash: string | null,
  ): Promise<{ id: string } | null>;
  createRecoveryCodeSet(input: CreateRecoveryCodeSetInput): Promise<boolean>;
  getRecoveryCodeStatus(userId: string): Promise<RecoveryCodeStatusRecord | null>;
  confirmRecoveryCodeSet(
    userId: string,
    setId: string,
    codeHash: string,
    confirmedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean>;
  consumeRecoveryCode(input: ConsumeRecoveryCodeInput): Promise<AuthSessionRecord | null>;
  revokeRecoveryCodeSet(
    userId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean>;
}

export function validWebAuthnChallenge(record: WebAuthnChallengeRecord): boolean {
  return (
    /^authchal_[A-Za-z0-9_-]{20,}$/u.test(record.id) &&
    WEBAUTHN_CHALLENGE_PURPOSES.includes(record.purpose) &&
    /^[0-9a-f]{64}$/u.test(record.challengeHash) &&
    record.rpId.length >= 1 &&
    record.rpId.length <= 253 &&
    isExactOrigin(record.origin) &&
    Date.parse(record.createdAt) < Date.parse(record.expiresAt) &&
    record.consumedAt === null
  );
}

export function validPasskeyCredential(record: PasskeyCredentialRecord): boolean {
  return (
    /^passkey_[A-Za-z0-9_-]{20,}$/u.test(record.id) &&
    /^ident_[A-Za-z0-9_-]{20,}$/u.test(record.identityId) &&
    /^[A-Za-z0-9_-]{16,2048}$/u.test(record.credentialId) &&
    record.publicKey.byteLength >= 16 &&
    record.publicKey.byteLength <= 4096 &&
    Number.isSafeInteger(record.counter) &&
    record.counter >= 0 &&
    record.transports.length <= 8 &&
    record.transports.every((transport) => /^[a-z-]{2,32}$/u.test(transport)) &&
    record.name.trim().length >= 1 &&
    record.name.length <= 120 &&
    Number.isFinite(Date.parse(record.createdAt))
  );
}

function isExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}
