import type {
  AuthAssuranceLevel,
  AuthenticationMethod,
  AuthIdentitySummary,
  AuthSessionDurationPolicy,
  AuthUserSummary,
  AuthWorkspaceSummary,
} from '@lodariq/schema';
import type {
  AuthIdentityRecord,
  AuthSessionRecord,
  PasswordCredentialRecord,
  UserEmailRecord,
} from './identity';

export const ACCOUNT_SECURITY_EVENT_TYPES = [
  'password_changed',
  'email_change_started',
  'email_change_current_verified',
  'email_change_new_verified',
  'email_changed',
  'session_revoked',
  'sessions_revoked_all',
  'account_deletion_scheduled',
  'passkey_registered',
  'passkey_authenticated',
  'recovery_codes_generated',
  'recovery_codes_confirmed',
  'recovery_code_used',
  'recovery_codes_revoked',
] as const;
export type AccountSecurityEventType = (typeof ACCOUNT_SECURITY_EVENT_TYPES)[number];

export interface AccountSecurityEventRecord {
  id: string;
  userId: string;
  actorUserId: string;
  eventType: AccountSecurityEventType;
  targetId: string | null;
  occurredAt: string;
}

export interface AccountSessionRecord {
  id: string;
  userId: string;
  deviceLabel: string;
  authenticationMethod: AuthenticationMethod;
  assuranceLevel: AuthAssuranceLevel;
  durationPolicy: AuthSessionDurationPolicy;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
}

export interface ChangeAccountPasswordInput {
  userId: string;
  currentSessionId: string;
  expectedPasswordHash: string;
  credential: Omit<PasswordCredentialRecord, 'userId' | 'emailNormalized' | 'emailLookupHash'>;
  nextSession: AuthSessionRecord;
  eventId: string;
  changedAt: string;
}

export type ChangeAccountPasswordResult =
  | { status: 'changed'; session: AuthSessionRecord }
  | { status: 'credential_changed' | 'invalid_input' };

export type AccountEmailChangeProof = 'current_email' | 'new_email';

export interface AccountEmailChangeRecord {
  id: string;
  userId: string;
  currentEmailNormalized: string;
  newEmailNormalized: string;
  newEmailLookupHash: string;
  currentTokenHash: string;
  newTokenHash: string;
  keyId: string;
  currentVerifiedAt: string | null;
  newVerifiedAt: string | null;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AccountEmailChangeOutboxRecord {
  id: string;
  type: 'account_email_change';
  userId: string;
  challengeId: string;
  recipientEmail: string;
  proof: AccountEmailChangeProof;
  keyId: string;
  changePath: string;
  availableAt: string;
  processedAt: string | null;
  attempts: number;
  leaseVersion: number;
  lastError: string | null;
  terminalAt: string | null;
  createdAt: string;
}

export interface BeginAccountEmailChangeInput {
  challenge: AccountEmailChangeRecord;
  outbox: readonly [AccountEmailChangeOutboxRecord, AccountEmailChangeOutboxRecord];
  expectedPasswordHash: string;
  event: AccountSecurityEventRecord;
}

export type BeginAccountEmailChangeResult =
  | { status: 'queued'; challenge: AccountEmailChangeRecord }
  | { status: 'email_conflict' | 'credential_changed' | 'invalid_input' };

export interface VerifyAccountEmailChangeInput {
  userId: string;
  currentSessionId: string;
  challengeId: string;
  proof: AccountEmailChangeProof;
  tokenHash: string;
  verifiedAt: string;
  eventId: string;
  completionEventId: string;
}

export type VerifyAccountEmailChangeResult =
  | { status: 'proof_recorded'; challenge: AccountEmailChangeRecord }
  | { status: 'completed'; email: string }
  | { status: 'invalid_or_expired' | 'email_conflict' };

export interface AccountDeletionRecord {
  deletedAt: string;
  retentionExpiresAt: string;
}

export interface ScheduleAccountDeletionInput {
  userId: string;
  currentSessionId: string;
  expectedPasswordHash: string;
  deletedAt: string;
  retentionExpiresAt: string;
  event: AccountSecurityEventRecord;
}

export type ScheduleAccountDeletionResult =
  | { status: 'scheduled'; deletion: AccountDeletionRecord }
  | { status: 'final_owner' | 'credential_changed' | 'conflict' };

export interface AccountExportRecord {
  profile: AuthUserSummary;
  emails: Array<{ email: string; primary: boolean; verifiedAt: string | null }>;
  identities: AuthIdentitySummary[];
  workspaces: AuthWorkspaceSummary[];
}

export interface AccountManagementRepository {
  listAccountSessions(userId: string, now: string): Promise<AccountSessionRecord[]>;
  revokeAccountSession(
    userId: string,
    sessionId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<boolean>;
  revokeAllAccountSessions(
    userId: string,
    revokedAt: string,
    event: AccountSecurityEventRecord,
  ): Promise<number>;
  changeAccountPassword(input: ChangeAccountPasswordInput): Promise<ChangeAccountPasswordResult>;
  getAccountEmailChange(userId: string, now: string): Promise<AccountEmailChangeRecord | null>;
  beginAccountEmailChange(
    input: BeginAccountEmailChangeInput,
  ): Promise<BeginAccountEmailChangeResult>;
  verifyAccountEmailChange(
    input: VerifyAccountEmailChangeInput,
  ): Promise<VerifyAccountEmailChangeResult>;
  scheduleAccountDeletion(
    input: ScheduleAccountDeletionInput,
  ): Promise<ScheduleAccountDeletionResult>;
  exportAccount(userId: string): Promise<AccountExportRecord | null>;
  listAccountSecurityEvents(userId: string): Promise<AccountSecurityEventRecord[]>;
}

export function validAccountSecurityEvent(event: AccountSecurityEventRecord): boolean {
  return (
    /^acctevt_[A-Za-z0-9_-]{20,}$/u.test(event.id) &&
    event.userId === event.actorUserId &&
    ACCOUNT_SECURITY_EVENT_TYPES.includes(event.eventType) &&
    Number.isFinite(Date.parse(event.occurredAt))
  );
}

export function validAccountEmailChange(change: AccountEmailChangeRecord): boolean {
  const createdAt = Date.parse(change.createdAt);
  const expiresAt = Date.parse(change.expiresAt);
  return (
    /^emailchange_[A-Za-z0-9_-]{20,}$/u.test(change.id) &&
    change.currentEmailNormalized === change.currentEmailNormalized.trim().toLowerCase() &&
    change.newEmailNormalized === change.newEmailNormalized.trim().toLowerCase() &&
    change.currentEmailNormalized !== change.newEmailNormalized &&
    /^[0-9a-f]{64}$/u.test(change.newEmailLookupHash) &&
    /^[0-9a-f]{64}$/u.test(change.currentTokenHash) &&
    /^[0-9a-f]{64}$/u.test(change.newTokenHash) &&
    /^[a-z0-9][a-z0-9_-]{0,31}$/u.test(change.keyId) &&
    Number.isFinite(createdAt) &&
    Number.isFinite(expiresAt) &&
    createdAt < expiresAt &&
    change.currentVerifiedAt === null &&
    change.newVerifiedAt === null &&
    change.consumedAt === null &&
    change.revokedAt === null
  );
}

export function toIdentitySummary(identity: AuthIdentityRecord): AuthIdentitySummary {
  return {
    id: identity.id,
    kind: identity.kind,
    issuer: identity.issuer,
    providerTenantId: identity.providerTenantId,
    createdAt: identity.createdAt,
    lastAuthenticatedAt: identity.lastAuthenticatedAt,
  };
}

export function toEmailExport(email: UserEmailRecord): {
  email: string;
  primary: boolean;
  verifiedAt: string | null;
} {
  return {
    email: email.normalizedEmail,
    primary: email.isPrimary,
    verifiedAt: email.verifiedAt,
  };
}
