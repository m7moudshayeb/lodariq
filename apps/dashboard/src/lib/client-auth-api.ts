'use client';

import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import {
  parseEmailVerificationRequiredResponse,
  parseAuthOnboardingSnapshot,
  parseEmailVerificationResendAcceptedResponse,
  parseAuthSessionSnapshot,
  parsePasswordRecoveryAcceptedResponse,
  parseSetPasswordInput,
  parseSetPasswordResponse,
  parseVerifyEmailInput,
  parseAccountDeletionResponse,
  parseAccountExportResponse,
  parseAuthIdentityListResponse,
  parseAuthSessionListResponse,
  parseEmailChangeSnapshot,
  type AuthSessionSnapshot,
  type AuthOnboardingSnapshot,
  type EmailVerificationRequiredResponse,
  type EmailVerificationResendAcceptedResponse,
  type PasswordRecoveryAcceptedResponse,
  type AccountDeletionResponse,
  type AccountExportResponse,
  type AuthIdentityListResponse,
  type AuthSessionListResponse,
  type EmailChangeSnapshot,
} from './auth-contract';

export interface SignInInput {
  identifier: string;
  password: string;
  rememberMe: boolean;
}

export interface SignUpInput {
  email: string;
  name: string;
  workspaceName: string;
}

export class ClientAuthError extends Error {
  readonly code?: string;
  readonly statusCode: number;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'ClientAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function userFacingClientError(error: unknown, fallback: string): string {
  return error instanceof ClientAuthError && error.message.trim() ? error.message : fallback;
}

export function signIn(input: SignInInput): Promise<AuthSessionSnapshot> {
  return authMutation('/api/auth/sign-in', input);
}

export async function beginOidcAuthentication(input: {
  provider: 'google' | 'microsoft';
  action: 'sign_in' | 'sign_up' | 'link';
  returnTo: string;
  workspaceName?: string;
  rememberMe?: boolean;
}): Promise<string> {
  const response = await jsonMutation(`/api/auth/oidc/${input.provider}/begin`, 'POST', input);
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { authorizationUrl?: unknown };
  if (typeof payload.authorizationUrl !== 'string') throw invalidAccountResponse();
  const authorizationUrl = new URL(payload.authorizationUrl);
  const expectedHost = input.provider === 'google' ? 'accounts.google.com' : 'login.microsoftonline.com';
  if (authorizationUrl.protocol !== 'https:' || authorizationUrl.hostname !== expectedHost) {
    throw invalidAccountResponse();
  }
  return authorizationUrl.toString();
}

export async function beginEnterpriseOidcAuthentication(input: {
  email: string;
  returnTo: string;
}): Promise<string> {
  const discoveryResponse = await jsonMutation('/api/auth/enterprise/discover', 'POST', {
    email: input.email,
  });
  if (!discoveryResponse.ok) throw await clientAuthError(discoveryResponse);
  const discovery = (await discoveryResponse.json()) as Record<string, unknown>;
  if (discovery.available !== true || typeof discovery.connectionId !== 'string') {
    throw new ClientAuthError(
      404,
      'Enterprise sign-in is not configured for this company email.',
      'enterprise_sso_unavailable',
    );
  }
  if (discovery.protocol !== 'oidc') {
    throw new ClientAuthError(
      409,
      'This organization uses an enterprise sign-in method that is not available here.',
      'enterprise_sso_unavailable',
    );
  }
  const response = await jsonMutation('/api/auth/enterprise/oidc/begin', 'POST', {
    connectionId: discovery.connectionId,
    returnTo: input.returnTo,
  });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { authorizationUrl?: unknown };
  if (typeof payload.authorizationUrl !== 'string') throw invalidAccountResponse();
  const authorizationUrl = new URL(payload.authorizationUrl);
  if (
    authorizationUrl.protocol !== 'https:' ||
    authorizationUrl.username ||
    authorizationUrl.password ||
    authorizationUrl.hostname === 'localhost' ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(authorizationUrl.hostname) ||
    authorizationUrl.hostname.includes(':')
  ) {
    throw invalidAccountResponse();
  }
  return authorizationUrl.toString();
}

export interface PasskeySummary {
  id: string;
  identityId: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  const response = await sameOriginFetch('/api/auth/passkeys', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { passkeys?: unknown };
  if (!Array.isArray(payload.passkeys)) throw invalidAccountResponse();
  const passkeys = payload.passkeys.filter(isPasskeySummary);
  if (passkeys.length !== payload.passkeys.length) throw invalidAccountResponse();
  return passkeys;
}

export async function registerPasskey(name: string): Promise<void> {
  const optionsResponse = await jsonMutation(
    '/api/auth/passkeys/registration/options',
    'POST',
    { name },
  );
  if (!optionsResponse.ok) throw await clientAuthError(optionsResponse);
  const envelope = (await optionsResponse.json()) as {
    challengeId?: unknown;
    options?: unknown;
  };
  if (typeof envelope.challengeId !== 'string' || !isRecord(envelope.options)) {
    throw invalidAccountResponse();
  }
  const credential = await startRegistration({
    optionsJSON: envelope.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  const verification = await jsonMutation(
    '/api/auth/passkeys/registration/verify',
    'POST',
    { challengeId: envelope.challengeId, name, response: credential },
  );
  if (!verification.ok) throw await clientAuthError(verification);
}

export async function authenticateWithPasskey(
  purpose: 'sign_in' | 'step_up',
  rememberMe = false,
): Promise<AuthSessionSnapshot> {
  const optionsResponse = await jsonMutation(
    '/api/auth/passkeys/authentication/options',
    'POST',
    { purpose },
  );
  if (!optionsResponse.ok) throw await clientAuthError(optionsResponse);
  const envelope = (await optionsResponse.json()) as {
    challengeId?: unknown;
    options?: unknown;
  };
  if (typeof envelope.challengeId !== 'string' || !isRecord(envelope.options)) {
    throw invalidAccountResponse();
  }
  const credential = await startAuthentication({
    optionsJSON: envelope.options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  const response = await jsonMutation('/api/auth/passkeys/authentication/verify', 'POST', {
    challengeId: envelope.challengeId,
    purpose,
    rememberMe,
    response: credential,
  });
  if (!response.ok) throw await clientAuthError(response);
  const session = parseAuthSessionSnapshot(await response.json());
  if (!session) throw invalidAccountResponse();
  return session;
}

export interface RecoveryCodeStatus {
  setId: string;
  confirmed: boolean;
  remaining: number;
  createdAt: string;
}

export async function getRecoveryCodeStatus(): Promise<RecoveryCodeStatus | null> {
  const response = await sameOriginFetch('/api/auth/recovery-codes', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const payload: unknown = await response.json();
  return payload === null ? null : parseRecoveryCodeStatus(payload);
}

export async function generateRecoveryCodes(
  currentPassword?: string,
): Promise<{ setId: string; codes: string[] }> {
  const response = await jsonMutation('/api/auth/recovery-codes', 'POST', {
    ...(currentPassword ? { currentPassword } : {}),
  });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { setId?: unknown; codes?: unknown };
  if (
    typeof payload.setId !== 'string' ||
    !Array.isArray(payload.codes) ||
    payload.codes.length !== 10 ||
    !payload.codes.every((code) => typeof code === 'string')
  ) {
    throw invalidAccountResponse();
  }
  return { setId: payload.setId, codes: payload.codes as string[] };
}

export async function confirmRecoveryCodes(setId: string, code: string): Promise<void> {
  const response = await jsonMutation('/api/auth/recovery-codes/confirm', 'POST', {
    setId,
    code,
  });
  if (!response.ok) throw await clientAuthError(response);
}

export async function revokeRecoveryCodes(): Promise<void> {
  const response = await jsonMutation('/api/auth/recovery-codes', 'DELETE', {});
  if (!response.ok) throw await clientAuthError(response);
}

export function signInWithRecoveryCode(
  identifier: string,
  code: string,
  rememberMe: boolean,
): Promise<AuthSessionSnapshot> {
  return authMutation('/api/auth/recovery-code/sign-in', { identifier, code, rememberMe });
}

export async function signUp(input: SignUpInput): Promise<EmailVerificationRequiredResponse> {
  const response = await sameOriginFetch('/api/auth/sign-up', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await clientAuthError(response);

  const verification = parseEmailVerificationRequiredResponse(await response.json());
  if (!verification) {
    throw new ClientAuthError(502, 'Lodariq returned an invalid verification response.');
  }
  return verification;
}

export async function resendEmailVerification(
  email: string,
): Promise<EmailVerificationResendAcceptedResponse> {
  const response = await sameOriginFetch('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw await clientAuthError(response);

  const accepted = parseEmailVerificationResendAcceptedResponse(await response.json());
  if (!accepted) {
    throw new ClientAuthError(502, 'Lodariq returned an invalid verification response.');
  }
  return accepted;
}

export function verifyEmail(
  challengeId: string,
  token: string,
  password: string,
): Promise<AuthSessionSnapshot> {
  const input = parseVerifyEmailInput(challengeId, token, password);
  if (!input) throw new ClientAuthError(400, 'The verification link is invalid or expired.');
  return authMutation('/api/auth/verify-email', input);
}

export async function requestPasswordRecovery(
  email: string,
): Promise<PasswordRecoveryAcceptedResponse> {
  const response = await sameOriginFetch('/api/auth/password-recovery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw await clientAuthError(response);

  const accepted = parsePasswordRecoveryAcceptedResponse(await response.json());
  if (!accepted) {
    throw new ClientAuthError(502, 'Lodariq returned an invalid recovery response.');
  }
  return accepted;
}

export async function setPassword(
  challengeId: string,
  token: string,
  password: string,
): Promise<AuthSessionSnapshot> {
  const input = parseSetPasswordInput(challengeId, token, password);
  if (!input) throw new ClientAuthError(400, 'The password link is invalid or expired.');
  const response = await sameOriginFetch('/api/auth/set-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await clientAuthError(response);

  const updated = parseSetPasswordResponse(await response.json());
  if (!updated) throw new ClientAuthError(502, 'Lodariq returned an invalid session response.');
  return updated.session;
}

export async function signOut(): Promise<void> {
  const response = await sameOriginFetch('/api/auth/sign-out', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw await clientAuthError(response);
}

export async function listAccountSessions(): Promise<AuthSessionListResponse> {
  const response = await sameOriginFetch('/api/auth/sessions', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const sessions = parseAuthSessionListResponse(await response.json());
  if (!sessions) throw invalidAccountResponse();
  return sessions;
}

export async function revokeAccountSession(sessionId: string): Promise<void> {
  const response = await jsonMutation(
    `/api/auth/sessions/${encodeURIComponent(sessionId)}`,
    'DELETE',
    {},
  );
  if (!response.ok) throw await clientAuthError(response);
}

export async function signOutEverywhere(): Promise<void> {
  const response = await jsonMutation('/api/auth/sign-out-everywhere', 'POST', {});
  if (!response.ok) throw await clientAuthError(response);
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await jsonMutation('/api/auth/change-password', 'POST', {
    currentPassword,
    newPassword,
  });
  if (!response.ok) throw await clientAuthError(response);
}

export async function getEmailChange(): Promise<EmailChangeSnapshot | null> {
  const response = await sameOriginFetch('/api/auth/email-change', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const payload: unknown = await response.json();
  if (payload === null) return null;
  const change = parseEmailChangeSnapshot(payload);
  if (!change) throw invalidAccountResponse();
  return change;
}

export async function startEmailChange(
  newEmail: string,
  currentPassword: string,
): Promise<EmailChangeSnapshot> {
  const response = await jsonMutation('/api/auth/email-change', 'POST', {
    newEmail,
    currentPassword,
  });
  if (!response.ok) throw await clientAuthError(response);
  const change = parseEmailChangeSnapshot(await response.json());
  if (!change) throw invalidAccountResponse();
  return change;
}

export async function verifyEmailChange(
  challengeId: string,
  proof: 'current_email' | 'new_email',
  token: string,
): Promise<
  { status: 'completed'; email: string } | { status: 'proof_recorded'; change: EmailChangeSnapshot }
> {
  const response = await jsonMutation('/api/auth/email-change/verify', 'POST', {
    challengeId,
    proof,
    token,
  });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as {
    status?: unknown;
    email?: unknown;
    change?: unknown;
  };
  if (payload.status === 'completed' && typeof payload.email === 'string') {
    return { status: 'completed', email: payload.email };
  }
  const change = parseEmailChangeSnapshot(payload.change);
  if (payload.status === 'proof_recorded' && change) return { status: 'proof_recorded', change };
  throw invalidAccountResponse();
}

export async function listAuthIdentities(): Promise<AuthIdentityListResponse> {
  const response = await sameOriginFetch('/api/auth/identities', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const identities = parseAuthIdentityListResponse(await response.json());
  if (!identities) throw invalidAccountResponse();
  return identities;
}

export async function unlinkAuthIdentity(
  identityId: string,
  currentPassword?: string,
): Promise<void> {
  const response = await jsonMutation(
    `/api/auth/identities/${encodeURIComponent(identityId)}`,
    'DELETE',
    currentPassword ? { currentPassword } : {},
  );
  if (!response.ok) throw await clientAuthError(response);
}

export async function exportAccount(): Promise<AccountExportResponse> {
  const response = await sameOriginFetch('/api/auth/account-export', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const exported = parseAccountExportResponse(await response.json());
  if (!exported) throw invalidAccountResponse();
  return exported;
}

export async function deleteAccount(currentPassword: string): Promise<AccountDeletionResponse> {
  const response = await jsonMutation('/api/auth/account', 'DELETE', {
    currentPassword,
    confirmation: 'DELETE',
  });
  if (!response.ok) throw await clientAuthError(response);
  const deletion = parseAccountDeletionResponse(await response.json());
  if (!deletion) throw invalidAccountResponse();
  return deletion;
}

export async function getUsername(): Promise<string | null> {
  const response = await sameOriginFetch('/api/auth/username', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { username?: unknown };
  return typeof payload.username === 'string' || payload.username === null
    ? payload.username
    : null;
}

export async function getOnboarding(): Promise<AuthOnboardingSnapshot | null> {
  const response = await sameOriginFetch('/api/auth/onboarding', { method: 'GET' });
  if (!response.ok) throw await clientAuthError(response);
  const payload: unknown = await response.json();
  if (payload === null) return null;
  const onboarding = parseAuthOnboardingSnapshot(payload);
  if (!onboarding) {
    throw new ClientAuthError(502, 'Lodariq returned an invalid onboarding response.');
  }
  return onboarding;
}

export async function setUsername(username: string, password: string): Promise<string> {
  const response = await sameOriginFetch('/api/auth/username', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { username?: unknown };
  if (typeof payload.username !== 'string') {
    throw new ClientAuthError(502, 'Lodariq returned an invalid username response.');
  }
  return payload.username;
}

export function createWorkspace(name: string): Promise<AuthSessionSnapshot> {
  return authMutation('/api/workspaces', { name });
}

export function selectWorkspace(workspaceId: string): Promise<AuthSessionSnapshot> {
  return authMutation(`/api/workspaces/${encodeURIComponent(workspaceId)}/select`, undefined);
}

export async function acceptWorkspaceInvitation(
  invitationId: string,
  token: string,
): Promise<{ workspaceId: string; role: 'admin' | 'member' | 'viewer' }> {
  const response = await sameOriginFetch('/api/workspace-invitations/accept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invitationId, token }),
  });
  if (!response.ok) throw await clientAuthError(response);
  const payload = (await response.json()) as { workspaceId?: unknown; role?: unknown };
  if (
    typeof payload.workspaceId !== 'string' ||
    (payload.role !== 'admin' && payload.role !== 'member' && payload.role !== 'viewer')
  ) {
    throw new ClientAuthError(502, 'Lodariq returned an invalid invitation response.');
  }
  return { workspaceId: payload.workspaceId, role: payload.role };
}

async function authMutation(path: string, body: unknown): Promise<AuthSessionSnapshot> {
  const response = await sameOriginFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw await clientAuthError(response);

  const snapshot = parseAuthSessionSnapshot(await response.json());
  if (!snapshot) throw new ClientAuthError(502, 'Lodariq returned an invalid session response.');
  return snapshot;
}

async function sameOriginFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
  });
}

function jsonMutation(path: string, method: 'POST' | 'DELETE', body: unknown): Promise<Response> {
  return sameOriginFetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function invalidAccountResponse(): ClientAuthError {
  return new ClientAuthError(502, 'Lodariq returned an invalid account response.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPasskeySummary(value: unknown): value is PasskeySummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.identityId === 'string' &&
    typeof value.name === 'string' &&
    (value.deviceType === 'singleDevice' || value.deviceType === 'multiDevice') &&
    typeof value.backedUp === 'boolean' &&
    typeof value.createdAt === 'string' &&
    (value.lastUsedAt === null || typeof value.lastUsedAt === 'string')
  );
}

function parseRecoveryCodeStatus(value: unknown): RecoveryCodeStatus {
  if (
    !isRecord(value) ||
    typeof value.setId !== 'string' ||
    typeof value.confirmed !== 'boolean' ||
    typeof value.remaining !== 'number' ||
    !Number.isInteger(value.remaining) ||
    value.remaining < 0 ||
    value.remaining > 10 ||
    typeof value.createdAt !== 'string'
  ) {
    throw invalidAccountResponse();
  }
  return {
    setId: value.setId,
    confirmed: value.confirmed,
    remaining: value.remaining,
    createdAt: value.createdAt,
  };
}

async function clientAuthError(response: Response): Promise<ClientAuthError> {
  let message =
    response.status === 401 ? 'Email, username, or password is incorrect.' : 'Please try again.';
  let code: string | undefined;
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) message = payload.message;
    if (typeof payload.error === 'string' && payload.error.trim()) code = payload.error;
  } catch {
    // The BFF intentionally redacts non-JSON upstream failures.
  }
  return new ClientAuthError(response.status, message, code);
}
