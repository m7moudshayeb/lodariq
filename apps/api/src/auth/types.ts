import type { FastifyRequest } from 'fastify';

export type AuthRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: AuthRole;
  provider: 'clerk' | 'headers';
}

export interface AuthProvider {
  authenticate(request: FastifyRequest): Promise<AuthContext>;
}

export class AuthError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}
