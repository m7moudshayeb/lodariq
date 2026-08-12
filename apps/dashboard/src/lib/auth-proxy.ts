import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { readSessionTokenFromCookieHeader } from './auth-contract';
import { isPasswordRecoveryEnabled } from './password-recovery-config';
import { isPublicSignupEnabled } from './signup-config';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { DASHBOARD_SERVER_MESSAGES } from '../i18n/messages';
import { serverMessage } from '../i18n/server-message';

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-language', 'retry-after'] as const;
const AUTH_CLIENT_SOURCE_HEADER = 'x-lodariq-auth-client-source';
const SOURCE_ID_CONTEXT = 'lodariq-auth-source-v1\0';
const SOURCE_ENVELOPE_CONTEXT = 'lodariq-auth-source-envelope-v1\0';
const SOURCE_RATE_LIMITED_PATHS = new Set([
  '/v1/auth/sign-up',
  '/v1/auth/sign-in',
  '/v1/auth/verify-email',
  '/v1/auth/password-recovery',
  '/v1/auth/set-password',
]);

export async function proxyOwnedAuthRequest(
  request: Request,
  upstreamPath: string,
): Promise<Response> {
  const rejectedRequest = await rejectUnsafeMutation(request);
  if (rejectedRequest) return rejectedRequest;
  const disabledCapability = await disabledPublicAuthCapability(upstreamPath);
  if (disabledCapability) return disabledCapability;

  try {
    const upstreamHeaders = new Headers({ accept: 'application/json' });
    const contentType = request.headers.get('content-type');
    if (contentType) upstreamHeaders.set('content-type', contentType);

    const clientSource = SOURCE_RATE_LIMITED_PATHS.has(upstreamPath)
      ? createAuthClientSource(request)
      : undefined;
    if (clientSource) upstreamHeaders.set(AUTH_CLIENT_SOURCE_HEADER, clientSource);

    const sessionToken = readSessionTokenFromCookieHeader(request.headers.get('cookie'));
    if (sessionToken) upstreamHeaders.set('authorization', `Bearer ${sessionToken}`);

    const upstream = await fetch(new URL(upstreamPath, apiBaseUrl()), {
      method: request.method,
      headers: upstreamHeaders,
      body: hasRequestBody(request.method) ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

    const responseHeaders = new Headers({ 'cache-control': 'no-store' });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    for (const cookie of responseCookies(upstream.headers)) {
      responseHeaders.append('set-cookie', cookie);
    }

    let responseBody: BodyInit | null = null;
    if (upstream.status !== 204) {
      responseBody =
        isAuthEndpoint(upstreamPath) && !upstream.ok
          ? JSON.stringify(await genericAuthFailure(upstream.status, upstreamPath))
          : await upstream.arrayBuffer();
    }
    if (typeof responseBody === 'string') responseHeaders.set('content-type', 'application/json');

    return new Response(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return authErrorResponse('auth_service_unavailable', 503);
  }
}

async function disabledPublicAuthCapability(path: string): Promise<Response | null> {
  if (path === '/v1/auth/sign-up' && !isPublicSignupEnabled()) {
    return authErrorResponse('signup_unavailable', 503);
  }
  if (path === '/v1/auth/password-recovery' && !isPasswordRecoveryEnabled()) {
    return authErrorResponse('password_recovery_unavailable', 503);
  }
  return null;
}

export function createAuthClientSource(
  request: Request,
  environment: Record<string, string | undefined> = process.env,
  now = Date.now(),
): string | undefined {
  const flyAppName = environment.FLY_APP_NAME?.trim();
  const secret = environment.LODARIQ_AUTH_BFF_SOURCE_SECRET?.trim();
  const clientIp = request.headers.get('fly-client-ip')?.trim();
  if (!flyAppName || !secret || Buffer.byteLength(secret) < 32 || !clientIp || !isIP(clientIp)) {
    return undefined;
  }

  const issued = Math.floor(now / 1_000);
  const sourceId = createHmac('sha256', secret)
    .update(`${SOURCE_ID_CONTEXT}${clientIp}`)
    .digest('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${SOURCE_ENVELOPE_CONTEXT}${issued}\0${sourceId}`)
    .digest('base64url');
  return `v1.${issued}.${sourceId}.${signature}`;
}

export async function rejectUnsafeMutation(request: Request): Promise<Response | null> {
  if (!hasRequestBody(request.method)) return null;

  const expectedOrigin = browserFacingRequestOrigin(request);
  if (!expectedOrigin) return invalidMutationResponse(403, 'cross_origin_request');

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin !== expectedOrigin || (fetchSite && fetchSite !== 'same-origin')) {
    return invalidMutationResponse(403, 'cross_origin_request');
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!/^application\/json(?:\s*;|$)/u.test(contentType)) {
    return invalidMutationResponse(415, 'json_required');
  }
  return null;
}

function browserFacingRequestOrigin(request: Request): string | null {
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return null;
  }

  const forwardedHost = firstForwardedHeader(request.headers.get('x-forwarded-host'));
  const host = forwardedHost || request.headers.get('host')?.trim();
  if (!host) return requestUrl.origin;

  const forwardedProtocol = firstForwardedHeader(request.headers.get('x-forwarded-proto'));
  const protocol = forwardedProtocol || requestUrl.protocol.replace(/:$/u, '');
  if (protocol !== 'http' && protocol !== 'https') return null;

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return null;
  }
}

function firstForwardedHeader(value: string | null): string | undefined {
  const firstValue = value?.split(',')[0]?.trim();
  return firstValue || undefined;
}

function apiBaseUrl(): string {
  return process.env.LODARIQ_API_BASE_URL ?? 'http://127.0.0.1:3001';
}

function hasRequestBody(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/v1/auth/');
}

async function genericAuthFailure(
  status: number,
  path: string,
): Promise<{ error: string; message: string }> {
  let error = 'auth_request_failed';
  if (status === 429) {
    error = 'rate_limited';
  } else if (status === 401) {
    error = 'invalid_credentials';
  } else if (path === '/v1/auth/verify-email') {
    error = 'verification_invalid';
  } else if (path === '/v1/auth/set-password') {
    error = 'password_reset_invalid';
  } else if (path === '/v1/auth/password-recovery' && status === 503) {
    error = 'password_recovery_unavailable';
  } else if (path === '/v1/auth/sign-up' && status === 503) {
    error = 'signup_unavailable';
  }
  return {
    error,
    message: await serverMessage(authErrorMessageDescriptor(error, status)),
  };
}

async function authErrorResponse(error: string, status: number): Promise<Response> {
  return Response.json(
    {
      error,
      message: await serverMessage(authErrorMessageDescriptor(error, status)),
    },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

async function invalidMutationResponse(status: number, error: string): Promise<Response> {
  return Response.json(
    { error, message: await serverMessage(DASHBOARD_SERVER_MESSAGES.requestRejected) },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export function responseCookies(headers: Headers): string[] {
  const withCookieReader = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withCookieReader.getSetCookie?.();
  if (cookies?.length) return cookies;

  const combined = headers.get('set-cookie');
  return combined ? combined.split(/,(?=\s*[^;,=]+=[^;,]*)/u).map((value) => value.trim()) : [];
}
