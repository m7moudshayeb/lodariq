'use client';

const ACTIVATION_PROTOCOL = 'lodariq.authoring.activation.v1';

export interface PendingActivation {
  requestId: string;
  state: string;
  customerOrigin: string;
  environment: 'development' | 'staging';
  expiresAt: string;
  documentIntent?:
    | {
        kind: 'existing';
        documentId: string;
        workspace?: 'canvas' | 'flowMap' | 'reviewRecovery';
        focusBlockId?: string;
      }
    | {
        kind: 'new-draft';
        documentType: 'tour' | 'announcement' | 'hotspot' | 'survey' | 'checklist';
      };
}

export interface AuthorizationResult {
  protocol: typeof ACTIVATION_PROTOCOL;
  type: 'authoring.authorization.result';
  requestId: string;
  state: string;
  authorizationCode: string;
  expiresAt: string;
}

export async function inspectAuthoringActivation(input: {
  requestId: string;
  state: string;
  openerOrigin: string;
}): Promise<{ status: 'authentication' } | { status: 'ready'; request: PendingActivation }> {
  const response = await activationRequest({ action: 'inspect', requestId: input.requestId });
  if (response.status === 401) return { status: 'authentication' };
  if (!response.ok) throw new Error('Authoring request is unavailable');
  const context = (await response.json()) as Partial<PendingActivation>;
  if (
    context.requestId !== input.requestId ||
    context.customerOrigin !== input.openerOrigin ||
    (context.environment !== 'development' && context.environment !== 'staging') ||
    typeof context.expiresAt !== 'string'
  ) {
    throw new Error('Authoring request scope mismatch');
  }
  return {
    status: 'ready',
    request: {
      requestId: input.requestId,
      state: input.state,
      customerOrigin: input.openerOrigin,
      environment: context.environment,
      expiresAt: context.expiresAt,
      ...(context.documentIntent ? { documentIntent: context.documentIntent } : {}),
    },
  };
}

export async function approveAuthoringActivation(
  request: PendingActivation,
): Promise<AuthorizationResult> {
  const response = await activationRequest({
    action: 'approve',
    requestId: request.requestId,
    state: request.state,
  });
  if (!response.ok) throw new Error('Authoring approval failed');
  const result = (await response.json()) as unknown;
  if (!isAuthorizationResult(result, request)) throw new Error('Authoring approval failed');
  return result;
}

async function activationRequest(body: unknown): Promise<Response> {
  return fetch('/v1/authoring/activation', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
}

function isAuthorizationResult(
  value: unknown,
  request: PendingActivation,
): value is AuthorizationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<AuthorizationResult>;
  const exactKeys = ['protocol', 'type', 'requestId', 'state', 'authorizationCode', 'expiresAt'];
  return (
    Object.keys(value).every((key) => exactKeys.includes(key)) &&
    exactKeys.every((key) => key in value) &&
    result.protocol === ACTIVATION_PROTOCOL &&
    result.type === 'authoring.authorization.result' &&
    result.requestId === request.requestId &&
    result.state === request.state &&
    typeof result.authorizationCode === 'string' &&
    result.authorizationCode.length >= 32 &&
    typeof result.expiresAt === 'string'
  );
}
