import {
  AuthOnboardingSnapshot as AuthOnboardingSnapshotSchema,
  AuthSessionSnapshot as AuthSessionSnapshotSchema,
  EmailVerificationRequiredResponse as EmailVerificationRequiredResponseSchema,
  EmailVerificationResendAcceptedResponse as EmailVerificationResendAcceptedResponseSchema,
  PasswordRecoveryAcceptedResponse as PasswordRecoveryAcceptedResponseSchema,
  SetPasswordRequest as SetPasswordRequestSchema,
  SetPasswordResponse as SetPasswordResponseSchema,
  VerifyEmailRequest as VerifyEmailRequestSchema,
  VerifyEmailChangeRequest as VerifyEmailChangeRequestSchema,
  AcceptWorkspaceInvitationRequest as AcceptWorkspaceInvitationRequestSchema,
  AccountDeletionResponse as AccountDeletionResponseSchema,
  AccountExportResponse as AccountExportResponseSchema,
  AuthIdentityListResponse as AuthIdentityListResponseSchema,
  AuthSessionListResponse as AuthSessionListResponseSchema,
  EmailChangeSnapshot as EmailChangeSnapshotSchema,
  isValid,
  type AuthSessionSnapshot as AuthSessionSnapshotValue,
  type AuthOnboardingSnapshot as AuthOnboardingSnapshotValue,
  type AuthWorkspaceSummary,
  type EmailVerificationRequiredResponse as EmailVerificationRequiredResponseValue,
  type EmailVerificationResendAcceptedResponse as EmailVerificationResendAcceptedResponseValue,
  type PasswordRecoveryAcceptedResponse as PasswordRecoveryAcceptedResponseValue,
  type SetPasswordRequest as SetPasswordRequestValue,
  type SetPasswordResponse as SetPasswordResponseValue,
  type VerifyEmailRequest as VerifyEmailRequestValue,
  type AccountDeletionResponse as AccountDeletionResponseValue,
  type AccountExportResponse as AccountExportResponseValue,
  type AuthIdentityListResponse as AuthIdentityListResponseValue,
  type AuthSessionListResponse as AuthSessionListResponseValue,
  type EmailChangeSnapshot as EmailChangeSnapshotValue,
} from '@lodariq/schema';

export const PRODUCTION_AUTH_COOKIE_NAME = '__Host-lodariq_session';
export const LOCAL_AUTH_COOKIE_NAME = 'lodariq_session_dev';
const DASHBOARD_RETURN_TO_PATHS = new Set(['/', '/account', '/authoring/activate']);

export type AuthSessionSnapshot = AuthSessionSnapshotValue;
export type AuthOnboardingSnapshot = AuthOnboardingSnapshotValue;
export type WorkspaceMembership = AuthWorkspaceSummary;
export type EmailVerificationRequiredResponse = EmailVerificationRequiredResponseValue;
export type EmailVerificationResendAcceptedResponse = EmailVerificationResendAcceptedResponseValue;
export type PasswordRecoveryAcceptedResponse = PasswordRecoveryAcceptedResponseValue;
export type SetPasswordInput = SetPasswordRequestValue;
export type SetPasswordResponse = SetPasswordResponseValue;
export type VerifyEmailInput = VerifyEmailRequestValue;
export type AccountDeletionResponse = AccountDeletionResponseValue;
export type AccountExportResponse = AccountExportResponseValue;
export type AuthIdentityListResponse = AuthIdentityListResponseValue;
export type AuthSessionListResponse = AuthSessionListResponseValue;
export type EmailChangeSnapshot = EmailChangeSnapshotValue;

export function parseAuthSessionSnapshot(value: unknown): AuthSessionSnapshot | null {
  return isValid(AuthSessionSnapshotSchema, value) ? value : null;
}

export function parseAuthOnboardingSnapshot(value: unknown): AuthOnboardingSnapshot | null {
  return isValid(AuthOnboardingSnapshotSchema, value) ? value : null;
}

export function parseEmailVerificationRequiredResponse(
  value: unknown,
): EmailVerificationRequiredResponse | null {
  return isValid(EmailVerificationRequiredResponseSchema, value) ? value : null;
}

export function parseEmailVerificationResendAcceptedResponse(
  value: unknown,
): EmailVerificationResendAcceptedResponse | null {
  return isValid(EmailVerificationResendAcceptedResponseSchema, value) ? value : null;
}

export function parseVerifyEmailInput(
  challengeId: unknown,
  token: unknown,
  password: unknown,
): VerifyEmailInput | null {
  const value = { challengeId, token, password };
  return isValid(VerifyEmailRequestSchema, value) ? value : null;
}

export function parsePasswordRecoveryAcceptedResponse(
  value: unknown,
): PasswordRecoveryAcceptedResponse | null {
  return isValid(PasswordRecoveryAcceptedResponseSchema, value) ? value : null;
}

export function parseSetPasswordInput(
  challengeId: unknown,
  token: unknown,
  password: unknown,
): SetPasswordInput | null {
  const value = { challengeId, token, password };
  return isValid(SetPasswordRequestSchema, value) ? value : null;
}

export function parseSetPasswordResponse(value: unknown): SetPasswordResponse | null {
  return isValid(SetPasswordResponseSchema, value) ? value : null;
}

export function parseAuthSessionListResponse(value: unknown): AuthSessionListResponse | null {
  return isValid(AuthSessionListResponseSchema, value) ? value : null;
}

export function parseAuthIdentityListResponse(value: unknown): AuthIdentityListResponse | null {
  return isValid(AuthIdentityListResponseSchema, value) ? value : null;
}

export function parseEmailChangeSnapshot(value: unknown): EmailChangeSnapshot | null {
  return isValid(EmailChangeSnapshotSchema, value) ? value : null;
}

export function parseAccountDeletionResponse(value: unknown): AccountDeletionResponse | null {
  return isValid(AccountDeletionResponseSchema, value) ? value : null;
}

export function parseAccountExportResponse(value: unknown): AccountExportResponse | null {
  return isValid(AccountExportResponseSchema, value) ? value : null;
}

export function parseVerificationChallengeId(value: unknown): string | null {
  const parsed = parseVerifyEmailInput(value, `lq_verify_${'x'.repeat(43)}`, 'x'.repeat(12));
  return parsed?.challengeId ?? null;
}

export function parseSetPasswordChallengeId(value: unknown): string | null {
  const parsed = parseSetPasswordInput(value, `lq_reset_${'x'.repeat(43)}`, 'x'.repeat(12));
  return parsed?.challengeId ?? null;
}

export function parseEmailChangeLink(
  challengeId: unknown,
  proof: unknown,
): { challengeId: string; proof: 'current_email' | 'new_email' } | null {
  const candidate = Array.isArray(challengeId) ? challengeId[0] : challengeId;
  const candidateProof = Array.isArray(proof) ? proof[0] : proof;
  const request = {
    challengeId: candidate,
    proof: candidateProof,
    token: `lq_email_change_${'x'.repeat(43)}`,
  };
  return isValid(VerifyEmailChangeRequestSchema, request)
    ? { challengeId: request.challengeId, proof: request.proof }
    : null;
}

export function parseWorkspaceInvitationId(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const request = { invitationId: candidate, token: `lq_invite_${'x'.repeat(43)}` };
  return isValid(AcceptWorkspaceInvitationRequestSchema, request) ? request.invitationId : null;
}

export function dashboardSessionCookieName(
  environment = process.env.NODE_ENV,
): typeof PRODUCTION_AUTH_COOKIE_NAME | typeof LOCAL_AUTH_COOKIE_NAME {
  return environment === 'production' ? PRODUCTION_AUTH_COOKIE_NAME : LOCAL_AUTH_COOKIE_NAME;
}

export function isDevelopmentHeaderAuthMode(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.LODARIQ_AUTH_MODE === 'headers';
}

export function readSessionTokenFromCookieHeader(
  cookieHeader: string | null,
  environment = process.env.NODE_ENV,
): string | undefined {
  if (!cookieHeader) return undefined;
  const expectedName = dashboardSessionCookieName(environment);

  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 1 || entry.slice(0, separator).trim() !== expectedName) continue;
    const rawValue = entry.slice(separator + 1).trim();
    if (!rawValue) return undefined;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function safeReturnTo(value: string | string[] | undefined, fallback = '/'): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return fallback;

  try {
    const url = new URL(candidate, 'https://app.lodariq.io');
    return url.origin === 'https://app.lodariq.io' && DASHBOARD_RETURN_TO_PATHS.has(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
