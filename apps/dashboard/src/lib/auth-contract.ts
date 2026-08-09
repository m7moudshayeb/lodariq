import {
  AuthSessionSnapshot as AuthSessionSnapshotSchema,
  EmailVerificationRequiredResponse as EmailVerificationRequiredResponseSchema,
  PasswordRecoveryAcceptedResponse as PasswordRecoveryAcceptedResponseSchema,
  SetPasswordRequest as SetPasswordRequestSchema,
  SetPasswordResponse as SetPasswordResponseSchema,
  VerifyEmailRequest as VerifyEmailRequestSchema,
  isValid,
  type AuthSessionSnapshot as AuthSessionSnapshotValue,
  type AuthWorkspaceSummary,
  type EmailVerificationRequiredResponse as EmailVerificationRequiredResponseValue,
  type PasswordRecoveryAcceptedResponse as PasswordRecoveryAcceptedResponseValue,
  type SetPasswordRequest as SetPasswordRequestValue,
  type SetPasswordResponse as SetPasswordResponseValue,
  type VerifyEmailRequest as VerifyEmailRequestValue,
} from '@lodariq/schema';

export const PRODUCTION_AUTH_COOKIE_NAME = '__Host-lodariq_session';
export const LOCAL_AUTH_COOKIE_NAME = 'lodariq_session_dev';
const DASHBOARD_RETURN_TO_PATHS = new Set(['/', '/authoring/activate']);

export type AuthSessionSnapshot = AuthSessionSnapshotValue;
export type WorkspaceMembership = AuthWorkspaceSummary;
export type EmailVerificationRequiredResponse = EmailVerificationRequiredResponseValue;
export type PasswordRecoveryAcceptedResponse = PasswordRecoveryAcceptedResponseValue;
export type SetPasswordInput = SetPasswordRequestValue;
export type SetPasswordResponse = SetPasswordResponseValue;
export type VerifyEmailInput = VerifyEmailRequestValue;

export function parseAuthSessionSnapshot(value: unknown): AuthSessionSnapshot | null {
  return isValid(AuthSessionSnapshotSchema, value) ? value : null;
}

export function parseEmailVerificationRequiredResponse(
  value: unknown,
): EmailVerificationRequiredResponse | null {
  return isValid(EmailVerificationRequiredResponseSchema, value) ? value : null;
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

export function parseVerificationChallengeId(value: unknown): string | null {
  const parsed = parseVerifyEmailInput(value, `lq_verify_${'x'.repeat(43)}`, 'x'.repeat(12));
  return parsed?.challengeId ?? null;
}

export function parseSetPasswordChallengeId(value: unknown): string | null {
  const parsed = parseSetPasswordInput(value, `lq_reset_${'x'.repeat(43)}`, 'x'.repeat(12));
  return parsed?.challengeId ?? null;
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
    const url = new URL(candidate, 'https://app.lodariq.com');
    return url.origin === 'https://app.lodariq.com' && DASHBOARD_RETURN_TO_PATHS.has(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}
