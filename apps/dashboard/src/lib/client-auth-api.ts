'use client';

import {
  parseEmailVerificationRequiredResponse,
  parseAuthSessionSnapshot,
  parsePasswordRecoveryAcceptedResponse,
  parseSetPasswordInput,
  parseSetPasswordResponse,
  parseVerifyEmailInput,
  type AuthSessionSnapshot,
  type EmailVerificationRequiredResponse,
  type PasswordRecoveryAcceptedResponse,
} from './auth-contract';

interface SignInInput {
  email: string;
  password: string;
}

interface SignUpInput {
  email: string;
  name: string;
  workspaceName: string;
}

export class ClientAuthError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ClientAuthError';
    this.statusCode = statusCode;
  }
}

export function signIn(input: SignInInput): Promise<AuthSessionSnapshot> {
  return authMutation('/api/auth/sign-in', input);
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

export function createWorkspace(name: string): Promise<AuthSessionSnapshot> {
  return authMutation('/api/workspaces', { name });
}

export function selectWorkspace(workspaceId: string): Promise<AuthSessionSnapshot> {
  return authMutation(`/api/workspaces/${encodeURIComponent(workspaceId)}/select`, undefined);
}

async function authMutation(path: string, body: unknown): Promise<AuthSessionSnapshot> {
  const response = await sameOriginFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

async function clientAuthError(response: Response): Promise<ClientAuthError> {
  let message = response.status === 401 ? 'Email or password is incorrect.' : 'Please try again.';
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) message = payload.message;
  } catch {
    // The BFF intentionally redacts non-JSON upstream failures.
  }
  return new ClientAuthError(response.status, message);
}
