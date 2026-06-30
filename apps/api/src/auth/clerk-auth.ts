import { verifyToken as verifyClerkToken } from '@clerk/backend';
import type { FastifyRequest } from 'fastify';
import { AuthError, type AuthContext, type AuthProvider, type AuthRole } from './types';

type VerifyTokenOptions = Parameters<typeof verifyClerkToken>[1];
type VerifiedClerkToken = Awaited<ReturnType<typeof verifyClerkToken>>;

export type ClerkTokenVerifier = (
  token: string,
  options: VerifyTokenOptions,
) => Promise<VerifiedClerkToken>;

export interface ClerkAuthProviderOptions {
  secretKey?: string;
  jwtKey?: string;
  apiUrl?: string;
  apiVersion?: string;
  authorizedParties?: string[];
  requireAuthorizedParties?: boolean;
  verifyToken?: ClerkTokenVerifier;
}

export function createClerkAuthProvider(options: ClerkAuthProviderOptions = {}): AuthProvider {
  const verifier = options.verifyToken ?? verifyClerkToken;
  const config = readClerkConfig(options);

  return {
    async authenticate(request: FastifyRequest): Promise<AuthContext> {
      if (!config.secretKey && !config.jwtKey) {
        throw new AuthError(
          500,
          'Clerk auth boundary is missing CLERK_SECRET_KEY or CLERK_JWT_KEY',
        );
      }

      if (config.requireAuthorizedParties && !config.authorizedParties?.length) {
        throw new AuthError(500, 'Clerk auth boundary is missing CLERK_AUTHORIZED_PARTIES');
      }

      const token = readSessionToken(request);
      if (!token) {
        throw new AuthError(401, 'Missing Clerk session token');
      }

      let claims: VerifiedClerkToken;
      try {
        claims = await verifier(token, {
          ...(config.secretKey ? { secretKey: config.secretKey } : {}),
          ...(config.jwtKey ? { jwtKey: config.jwtKey } : {}),
          ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
          ...(config.apiVersion ? { apiVersion: config.apiVersion } : {}),
          ...(config.authorizedParties?.length
            ? { authorizedParties: config.authorizedParties }
            : {}),
        });
      } catch {
        throw new AuthError(401, 'Invalid Clerk session token');
      }

      const userId = readClaimString(claims, 'sub');
      const workspaceId = readClaimString(claims, 'org_id');
      if (!userId) {
        throw new AuthError(401, 'Clerk session token is missing a user subject');
      }
      if (!workspaceId) {
        throw new AuthError(403, 'Clerk session must include an active organization');
      }

      return {
        userId,
        workspaceId,
        role: mapClerkRoleToAuthRole(readClaimString(claims, 'org_role')),
        provider: 'clerk',
      };
    },
  };
}

export function mapClerkRoleToAuthRole(clerkRole?: string): AuthRole {
  const normalized = clerkRole?.toLowerCase() ?? '';
  if (normalized.includes('owner')) return 'owner';
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('member')) return 'member';
  return 'viewer';
}

function readClerkConfig(options: ClerkAuthProviderOptions): RequiredClerkAuthConfig {
  return {
    secretKey: options.secretKey ?? process.env.CLERK_SECRET_KEY,
    jwtKey: options.jwtKey ?? process.env.CLERK_JWT_KEY,
    apiUrl: options.apiUrl ?? process.env.CLERK_API_URL,
    apiVersion: options.apiVersion ?? process.env.CLERK_API_VERSION,
    authorizedParties:
      options.authorizedParties ?? parseCsvEnvironment(process.env.CLERK_AUTHORIZED_PARTIES),
    requireAuthorizedParties:
      options.requireAuthorizedParties ?? process.env.NODE_ENV === 'production',
  };
}

interface RequiredClerkAuthConfig {
  secretKey?: string;
  jwtKey?: string;
  apiUrl?: string;
  apiVersion?: string;
  authorizedParties?: string[];
  requireAuthorizedParties: boolean;
}

function readSessionToken(request: FastifyRequest): string | undefined {
  return readBearerToken(request) ?? readCookie(request, '__session');
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
    const key = cookie.slice(0, separatorIndex).trim();
    if (key !== name) continue;
    const value = cookie.slice(separatorIndex + 1).trim();
    return value ? decodeURIComponent(value) : undefined;
  }
  return undefined;
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readClaimString(claims: Record<string, unknown>, claim: string): string | undefined {
  const value = claims[claim];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function parseCsvEnvironment(value: string | undefined): string[] | undefined {
  const parsed = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed?.length ? parsed : undefined;
}
