import { createHash, randomBytes } from 'node:crypto';
import type { Environment } from '@lodariq/schema';

const TOKEN_PREFIX_LENGTH = 18;

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

export function getEnvironmentTokenPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX_LENGTH);
}
