import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Environment } from '@lodariq/schema';

const TOKEN_PREFIX_LENGTH = 18;

export function createPublicSdkInstallationId(): string {
  return `ins_pub_${randomBytes(18).toString('base64url')}`;
}

export function createPublicSdkBootstrapGrant(): string {
  return `lod_bootstrap_${randomBytes(24).toString('base64url')}`;
}

export function createAuthoringAuthorizationCode(): string {
  return `lod_authorization_${randomBytes(24).toString('base64url')}`;
}

export function createAuthoringActivationGrant(): string {
  return `lod_activation_${randomBytes(24).toString('base64url')}`;
}

export function createEnvironmentClientToken(environment: Environment): string {
  return `lod_${environment}_${randomBytes(24).toString('base64url')}`;
}

export function createAuthoringSessionToken(): string {
  return `lod_authoring_${randomBytes(24).toString('base64url')}`;
}

export function hashEnvironmentToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export const hashAuthoringSessionToken = hashEnvironmentToken;
export const hashPublicSdkBootstrapGrant = hashEnvironmentToken;
export const hashAuthoringAuthorizationState = hashEnvironmentToken;
export const hashAuthoringAuthorizationCode = hashEnvironmentToken;
export const hashAuthoringActivationGrant = hashEnvironmentToken;

export function deriveAuthoringPkceS256Challenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
}

export function verifyAuthoringPkceS256Challenge(
  codeVerifier: string,
  expectedChallenge: string,
): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(codeVerifier)) return false;
  const actual = Buffer.from(deriveAuthoringPkceS256Challenge(codeVerifier), 'utf8');
  const expected = Buffer.from(expectedChallenge, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function getEnvironmentTokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LENGTH);
}
