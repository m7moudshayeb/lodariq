import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { AUTH_CORRELATION_HEADER } from '@lodariq/schema';
import { isDevelopmentHeaderAuthMode, readSessionTokenFromCookieHeader } from './auth-contract';
import { isPasswordRecoveryEnabled } from './password-recovery-config';
import { isPublicSignupEnabled } from './signup-config';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { DASHBOARD_SERVER_MESSAGES } from '../i18n/messages';
import { serverMessage } from '../i18n/server-message';

const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-language',
  'retry-after',
  AUTH_CORRELATION_HEADER,
] as const;
const AUTH_CLIENT_SOURCE_HEADER = 'x-lodariq-auth-client-source';
const SOURCE_ID_CONTEXT = 'lodariq-auth-source-v1\0';
const SOURCE_ENVELOPE_CONTEXT = 'lodariq-auth-source-envelope-v1\0';
const PUBLIC_AUTH_FAILURE_PATHS = new Set([
  '/v1/auth/sign-up',
  '/v1/auth/sign-in',
  '/v1/auth/verify-email',
  '/v1/auth/resend-verification',
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
    for (const name of ['x-lodariq-domain-verification', 'x-lodariq-break-glass-request-id']) {
      const value = request.headers.get(name);
      if (value) upstreamHeaders.set(name, value.slice(0, 512));
    }

    // Every BFF hop proves the dashboard, not a path allowlist. Production
    // credential-gateway routes 401 when this header is missing.
    const clientSource = createAuthClientSource(request);
    if (clientSource) upstreamHeaders.set(AUTH_CLIENT_SOURCE_HEADER, clientSource);

    const sessionToken = readSessionTokenFromCookieHeader(request.headers.get('cookie'));
    if (sessionToken) upstreamHeaders.set('authorization', `Bearer ${sessionToken}`);
    if (isDevelopmentHeaderAuthMode() && !sessionToken) {
      upstreamHeaders.set(
        'x-lodariq-workspace-id',
        process.env.LODARIQ_WORKSPACE_ID ?? 'wk_local_dev',
      );
      upstreamHeaders.set(
        'x-lodariq-user-id',
        process.env.LODARIQ_DASHBOARD_USER_ID ?? 'user_local_dev',
      );
    }

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
        PUBLIC_AUTH_FAILURE_PATHS.has(upstreamPath) && !upstream.ok
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

export async function proxyOidcCallback(request: Request, provider: string): Promise<Response> {
  if (provider !== 'google' && provider !== 'microsoft') return oidcFailureRedirect(request);
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');
  if (
    !state ||
    !/^[A-Za-z0-9_-]{43,256}$/u.test(state) ||
    Boolean(code) === Boolean(providerError)
  ) {
    return oidcFailureRedirect(request);
  }
  const description = url.searchParams.get('error_description');
  const body = code
    ? { state, code }
    : {
        state,
        error: providerError!.slice(0, 256),
        ...(description ? { errorDescription: description.slice(0, 1024) } : {}),
      };
  try {
    const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' });
    const source = createAuthClientSource(request);
    if (source) headers.set(AUTH_CLIENT_SOURCE_HEADER, source);
    const sessionToken = readSessionTokenFromCookieHeader(request.headers.get('cookie'));
    if (sessionToken) headers.set('authorization', `Bearer ${sessionToken}`);
    const upstream = await fetch(new URL(`/v1/auth/oidc/${provider}/callback`, apiBaseUrl()), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!upstream.ok) return oidcFailureRedirect(request);
    const payload = (await upstream.json()) as { returnTo?: unknown };
    const responseHeaders = new Headers({
      location: new URL(safeOidcReturnTo(payload.returnTo), request.url).toString(),
      'cache-control': 'no-store',
    });
    for (const cookie of responseCookies(upstream.headers))
      responseHeaders.append('set-cookie', cookie);
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch {
    return oidcFailureRedirect(request);
  }
}

export async function proxyEnterpriseOidcCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error');
  if (
    !state ||
    !/^[A-Za-z0-9_-]{43,256}$/u.test(state) ||
    Boolean(code) === Boolean(providerError)
  ) {
    return enterpriseOidcFailureRedirect(request);
  }
  const description = url.searchParams.get('error_description');
  const body = code
    ? { state, code: code.slice(0, 4096) }
    : {
        state,
        error: providerError!.slice(0, 256),
        ...(description ? { errorDescription: description.slice(0, 1024) } : {}),
      };
  try {
    const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' });
    const source = createAuthClientSource(request);
    if (source) headers.set(AUTH_CLIENT_SOURCE_HEADER, source);
    const upstream = await fetch(new URL('/v1/auth/enterprise/oidc/callback', apiBaseUrl()), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!upstream.ok) return enterpriseOidcFailureRedirect(request);
    const payload = (await upstream.json()) as { returnTo?: unknown };
    const responseHeaders = new Headers({
      location: new URL(safeOidcReturnTo(payload.returnTo), request.url).toString(),
      'cache-control': 'no-store',
    });
    for (const cookie of responseCookies(upstream.headers)) {
      responseHeaders.append('set-cookie', cookie);
    }
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch {
    return enterpriseOidcFailureRedirect(request);
  }
}

function safeOidcReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://app.lodariq.io');
    const allowed = new Set(['/', '/account', '/authoring/activate']);
    return url.origin === 'https://app.lodariq.io' && allowed.has(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : '/';
  } catch {
    return '/';
  }
}

function oidcFailureRedirect(request: Request): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL('/sign-in?oidc=failed', request.url).toString(),
      'cache-control': 'no-store',
    },
  });
}

function enterpriseOidcFailureRedirect(request: Request): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL('/sign-in?sso=failed', request.url).toString(),
      'cache-control': 'no-store',
    },
  });
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

async function genericAuthFailure(
  status: number,
  path: string,
): Promise<{ error: string; message: string }> {
  let error = 'auth_request_failed';
  if (status === 429) {
    error = 'rate_limited';
  } else if (status === 401) {
    error = 'invalid_credentials';
  } else if (status === 409) {
    error = 'onboarding_incomplete';
  } else if (path === '/v1/auth/verify-email') {
    error = 'verification_invalid';
  } else if (path === '/v1/auth/resend-verification' && status === 503) {
    error = 'signup_unavailable';
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
