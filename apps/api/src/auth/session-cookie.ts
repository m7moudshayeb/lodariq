import type { FastifyRequest } from 'fastify';

export const PRODUCTION_AUTH_COOKIE_NAME = '__Host-lodariq_session';
export const LOCAL_AUTH_COOKIE_NAME = 'lodariq_session_dev';

export interface AuthCookieOptions {
  production?: boolean;
  expiresAt?: string;
}

export function readAuthSessionToken(
  request: FastifyRequest,
  options: Pick<AuthCookieOptions, 'production'> = {},
): string | undefined {
  return readBearerToken(request) ?? readCookie(request, authCookieName(options.production));
}

export function serializeAuthSessionCookie(
  rawToken: string,
  options: AuthCookieOptions = {},
): string {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const attributes = [
    `${authCookieName(production)}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (production) attributes.push('Secure');
  if (options.expiresAt) attributes.push(`Expires=${new Date(options.expiresAt).toUTCString()}`);
  return attributes.join('; ');
}

export function serializeExpiredAuthSessionCookie(
  options: Pick<AuthCookieOptions, 'production'> = {},
): string {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const attributes = [
    `${authCookieName(production)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (production) attributes.push('Secure');
  return attributes.join('; ');
}

export function authCookieName(production = process.env.NODE_ENV === 'production'): string {
  return production ? PRODUCTION_AUTH_COOKIE_NAME : LOCAL_AUTH_COOKIE_NAME;
}

function readBearerToken(request: FastifyRequest): string | undefined {
  const authorization = readHeader(request, 'authorization');
  if (!authorization) return undefined;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) return undefined;
  return token.trim();
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  const cookieHeader = readHeader(request, 'cookie');
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) continue;
    if (cookie.slice(0, separatorIndex).trim() !== name) continue;
    const encoded = cookie.slice(separatorIndex + 1).trim();
    if (!encoded) return undefined;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
