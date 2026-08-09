import type { FastifyRequest } from 'fastify';
import type { ControlPlaneRole } from '@lodariq/schema';

export type AuthRole = ControlPlaneRole;

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: AuthRole;
  provider: 'lodariq' | 'headers';
}

export interface IdentityAuthContext {
  userId: string;
  provider: AuthContext['provider'];
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
