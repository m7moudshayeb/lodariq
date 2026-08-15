import type { AuthSessionRecord, ControlPlaneRepository, UserRecord } from '@lodariq/database';
import type { FastifyRequest } from 'fastify';
import {
  authSessionIdleTtlMs,
  AUTH_SESSION_TOUCH_INTERVAL_MS,
  hashAuthSessionToken,
} from './owned-auth-crypto';
import { readAuthSessionToken } from './session-cookie';
import { AuthError, type AuthProvider } from './types';

export interface OwnedAuthSessionContext {
  rawToken: string;
  tokenHash: string;
  session: AuthSessionRecord;
  user: UserRecord;
}

export function createLodariqAuthProvider(repository: ControlPlaneRepository): AuthProvider {
  return {
    async authenticateIdentity(request: FastifyRequest) {
      const owned = await authenticateOwnedSession(repository, request);
      return {
        userId: owned.session.userId,
        provider: 'lodariq',
        authenticationMethod: owned.session.authenticationMethod,
        assuranceLevel: owned.session.assuranceLevel,
        authenticatedAt: owned.session.authenticatedAt,
        identityId: owned.session.identityId,
      };
    },
    async authenticate(request: FastifyRequest) {
      const owned = await authenticateOwnedSession(repository, request);
      if (!owned.session.activeWorkspaceId) {
        throw new AuthError(403, 'Select an active workspace to continue');
      }
      return {
        userId: owned.session.userId,
        workspaceId: owned.session.activeWorkspaceId,
        // Control-plane routes replace this placeholder with the
        // database-authoritative membership role before authorization.
        role: 'viewer',
        provider: 'lodariq',
        authenticationMethod: owned.session.authenticationMethod,
        assuranceLevel: owned.session.assuranceLevel,
        authenticatedAt: owned.session.authenticatedAt,
        identityId: owned.session.identityId,
      };
    },
  };
}

export async function authenticateOwnedSession(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
): Promise<OwnedAuthSessionContext> {
  const rawToken = readAuthSessionToken(request);
  if (!rawToken) throw new AuthError(401, 'Missing Lodariq session');

  const tokenHash = hashAuthSessionToken(rawToken);
  const now = new Date();
  let session = await repository.resolveAuthSession(tokenHash, now.toISOString());
  if (!session) throw new AuthError(401, 'Lodariq session is invalid or expired');

  const user = await repository.getIdentityUser(session.userId);
  if (!user?.emailVerifiedAt) {
    await repository.revokeAuthSession(tokenHash, now.toISOString());
    throw new AuthError(401, 'Lodariq session is invalid or expired');
  }

  if (now.getTime() - new Date(session.lastSeenAt).getTime() >= AUTH_SESSION_TOUCH_INTERVAL_MS) {
    const idleExpiresAt = new Date(
      now.getTime() + authSessionIdleTtlMs(session.durationPolicy),
    ).toISOString();
    session = await repository.touchAuthSession(tokenHash, now.toISOString(), idleExpiresAt);
    if (!session) throw new AuthError(401, 'Lodariq session is invalid or expired');
  }

  return { rawToken, tokenHash, session, user };
}
