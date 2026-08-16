import type {
  AuthIdentityRecord,
  AuthSessionRecord,
  IdentityOnboardingStateRecord,
  UserEmailRecord,
  UserRecord,
  WorkspaceMembershipRecord,
} from './identity';
import type { WorkspaceEnvironment } from './environments';

export const OIDC_AUTHORIZATION_ACTIONS = ['sign_in', 'sign_up', 'link'] as const;
export type OidcAuthorizationAction = (typeof OIDC_AUTHORIZATION_ACTIONS)[number];

export interface OidcAuthorizationAttemptRecord {
  id: string;
  providerId: string;
  action: OidcAuthorizationAction;
  userId: string | null;
  stateHash: string;
  encryptedVerifier: string;
  nonceHash: string;
  returnTo: string;
  workspaceName: string | null;
  durationPolicy: 'standard' | 'remembered';
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface RegisterExternalIdentityAccountInput {
  user: UserRecord;
  userEmail: UserEmailRecord;
  identity: AuthIdentityRecord;
  onboarding: IdentityOnboardingStateRecord;
  session: AuthSessionRecord;
  workspace: { id: string; name: string; createdAt: string; updatedAt: string };
  membership: WorkspaceMembershipRecord;
  environments: WorkspaceEnvironment[];
}

export interface CreateExternalIdentitySessionInput {
  identityId: string;
  issuer: string;
  subject: string;
  authenticatedAt: string;
  session: AuthSessionRecord;
}

export interface OidcRepository {
  createOidcAuthorizationAttempt(attempt: OidcAuthorizationAttemptRecord): Promise<boolean>;
  getOidcAuthorizationAttempt(
    stateHash: string,
    now: string,
  ): Promise<OidcAuthorizationAttemptRecord | null>;
  consumeOidcAuthorizationAttempt(
    attemptId: string,
    stateHash: string,
    consumedAt: string,
  ): Promise<boolean>;
  registerExternalIdentityAccount(input: RegisterExternalIdentityAccountInput): Promise<boolean>;
  createExternalIdentitySession(
    input: CreateExternalIdentitySessionInput,
  ): Promise<AuthSessionRecord | null>;
}

export function validOidcAuthorizationAttempt(record: OidcAuthorizationAttemptRecord): boolean {
  const createdAt = Date.parse(record.createdAt);
  const expiresAt = Date.parse(record.expiresAt);
  return (
    /^oidcattempt_[A-Za-z0-9_-]{20,}$/u.test(record.id) &&
    /^[a-z][a-z0-9_-]{1,63}$/u.test(record.providerId) &&
    OIDC_AUTHORIZATION_ACTIONS.includes(record.action) &&
    (record.action === 'link' ? Boolean(record.userId) : record.userId === null) &&
    (record.action === 'sign_up'
      ? Boolean(record.workspaceName?.trim()) && record.workspaceName!.length <= 120
      : record.workspaceName === null) &&
    (record.durationPolicy === 'standard' || record.durationPolicy === 'remembered') &&
    /^[0-9a-f]{64}$/u.test(record.stateHash) &&
    record.encryptedVerifier.length >= 64 &&
    record.encryptedVerifier.length <= 4096 &&
    /^[A-Za-z0-9_-]+$/u.test(record.encryptedVerifier) &&
    /^[0-9a-f]{64}$/u.test(record.nonceHash) &&
    isSafeReturnPath(record.returnTo) &&
    Number.isFinite(createdAt) &&
    Number.isFinite(expiresAt) &&
    createdAt < expiresAt &&
    record.consumedAt === null
  );
}

function isSafeReturnPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && value.length <= 2048;
}
