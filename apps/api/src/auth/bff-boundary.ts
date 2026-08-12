import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';
import { AuthError } from './types';

export const AUTH_CLIENT_SOURCE_HEADER = 'x-lodariq-auth-client-source';
export const AUTH_BFF_SOURCE_SECRET_ENV = 'LODARIQ_AUTH_BFF_SOURCE_SECRET';
export const AUTH_CLIENT_SOURCE_MAX_SKEW_SECONDS = 120;

const SOURCE_ID_CONTEXT = 'lodariq-auth-source-v1';
const ENVELOPE_CONTEXT = 'lodariq-auth-source-envelope-v1';
const ENVELOPE_PATTERN = /^v1\.(\d{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

/**
 * Dashboard BFF contract: `v1.<unix-seconds>.<source-id>.<signature>`.
 * Both opaque fields are unpadded base64url HMAC-SHA256 values. The source ID
 * is a pseudonym derived from the validated Fly-Client-IP; the IP never crosses
 * the internal boundary or reaches persistence.
 */
export function createAuthClientSourceEnvelope(
  clientIp: string,
  secret: string,
  now = new Date(),
): string {
  assertStrongBffSecret(secret);
  if (!isIP(clientIp)) throw new Error('A valid client IP is required');
  const timestamp = Math.floor(now.getTime() / 1_000).toString();
  const sourceId = hmac(secret, `${SOURCE_ID_CONTEXT}\0${clientIp}`);
  const signature = hmac(secret, `${ENVELOPE_CONTEXT}\0${timestamp}\0${sourceId}`);
  return `v1.${timestamp}.${sourceId}.${signature}`;
}

export function authenticateCredentialGateway(
  request: FastifyRequest,
  environment: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): string {
  if (environment.NODE_ENV !== 'production') {
    return `peer:${request.socket.remoteAddress ?? request.ip ?? 'unknown'}`;
  }

  const secret = environment[AUTH_BFF_SOURCE_SECRET_ENV]?.trim() ?? '';
  if (!isStrongBffSecret(secret)) throw new AuthError(503, 'Credential service is unavailable');
  const envelope = readHeader(request, AUTH_CLIENT_SOURCE_HEADER);
  const parsed = envelope ? ENVELOPE_PATTERN.exec(envelope) : null;
  if (!parsed) throw new AuthError(401, 'Credential request is unauthorized');

  const [, timestampText, sourceId, suppliedSignature] = parsed;
  const timestamp = Number(timestampText);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    !timestampText ||
    !sourceId ||
    !suppliedSignature ||
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > AUTH_CLIENT_SOURCE_MAX_SKEW_SECONDS
  ) {
    throw new AuthError(401, 'Credential request is unauthorized');
  }

  const expectedSignature = hmac(secret, `${ENVELOPE_CONTEXT}\0${timestampText}\0${sourceId}`);
  if (!constantTimeBase64UrlMatch(expectedSignature, suppliedSignature)) {
    throw new AuthError(401, 'Credential request is unauthorized');
  }
  return `bff:${sourceId}`;
}

function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

function constantTimeBase64UrlMatch(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'base64url');
  let suppliedBuffer: Buffer;
  try {
    suppliedBuffer = Buffer.from(supplied, 'base64url');
  } catch {
    suppliedBuffer = Buffer.alloc(expectedBuffer.length);
  }
  if (suppliedBuffer.length !== expectedBuffer.length) {
    suppliedBuffer = Buffer.alloc(expectedBuffer.length);
  }
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function assertStrongBffSecret(secret: string): void {
  if (!isStrongBffSecret(secret)) throw new Error('BFF source secret must contain 32 bytes');
}

function isStrongBffSecret(secret: string): boolean {
  return Buffer.byteLength(secret.trim(), 'utf8') >= 32;
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0]?.trim() || undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
