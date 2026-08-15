import type { FastifyRequest } from 'fastify';
import type { AuthAssuranceLevel, AuthenticationMethod, ControlPlaneRole } from '@lodariq/schema';

export type AuthRole = ControlPlaneRole;

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: AuthRole;
  provider: 'lodariq' | 'headers';
  authenticationMethod: AuthenticationMethod;
  assuranceLevel: AuthAssuranceLevel;
  authenticatedAt?: string;
  identityId?: string | null;
}

export interface IdentityAuthContext {
  userId: string;
  provider: AuthContext['provider'];
  authenticationMethod: AuthenticationMethod;
  assuranceLevel: AuthAssuranceLevel;
  authenticatedAt?: string;
  identityId?: string | null;
}

export interface AuthProvider {
  authenticate(request: FastifyRequest): Promise<AuthContext>;
  authenticateIdentity(request: FastifyRequest): Promise<IdentityAuthContext>;
}

export class AuthError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
