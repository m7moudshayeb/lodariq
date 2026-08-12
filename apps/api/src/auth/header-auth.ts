import type { FastifyRequest } from 'fastify';
import { AuthError, type AuthContext, type AuthProvider, type AuthRole } from './types';

export interface HeaderAuthProviderOptions {
  defaultWorkspaceId?: string;
  defaultUserId?: string;
  defaultRole?: AuthRole;
}

export function createHeaderAuthProvider(options: HeaderAuthProviderOptions = {}): AuthProvider {
  return {
    async authenticateIdentity(request: FastifyRequest) {
      const userId = readHeader(request, 'x-lodariq-user-id') ?? options.defaultUserId;
      if (!userId) throw new AuthError(401, 'Missing Lodariq user auth context');
      return { userId, provider: 'headers' };
    },
    async authenticate(request: FastifyRequest): Promise<AuthContext> {
      const workspaceId =
        readHeader(request, 'x-lodariq-workspace-id') ?? options.defaultWorkspaceId;
      const userId = readHeader(request, 'x-lodariq-user-id') ?? options.defaultUserId;
      const role = readAuthRole(request) ?? options.defaultRole ?? 'owner';

      if (!workspaceId || !userId) {
        throw new AuthError(401, 'Missing Lodariq workspace or user auth context');
      }

      return {
        workspaceId,
        userId,
        role,
        provider: 'headers',
      };
    },
  };
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readAuthRole(request: FastifyRequest): AuthRole | undefined {
  const role = readHeader(request, 'x-lodariq-role');
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') {
    return role;
  }
  return undefined;
}
