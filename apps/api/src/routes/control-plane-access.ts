import { AUTHORING_SESSION_CAPABILITIES, type AuthoringSessionCapability } from '@lodariq/schema';
import type { ControlPlaneRepository } from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthError, type AuthContext, type AuthProvider, type AuthRole } from '../auth';
import type { ObservabilityEvent, ObservabilitySink } from '../observability';

export type ReleaseCapability =
  | 'approve-production'
  | 'manage-release-policy'
  | 'promote-production'
  | 'publish-staging'
  | 'rollback-release'
  | 'sample-product-style'
  | 'unpublish-release'
  | 'verify-staging';

export const RELEASE_CAPABILITIES_BY_ROLE = {
  viewer: [],
  member: ['publish-staging', 'sample-product-style', 'verify-staging'],
  admin: [
    'approve-production',
    'manage-release-policy',
    'promote-production',
    'publish-staging',
    'rollback-release',
    'sample-product-style',
    'unpublish-release',
    'verify-staging',
  ],
  owner: [
    'approve-production',
    'manage-release-policy',
    'promote-production',
    'publish-staging',
    'rollback-release',
    'sample-product-style',
    'unpublish-release',
    'verify-staging',
  ],
} as const satisfies Readonly<Record<AuthRole, readonly ReleaseCapability[]>>;

export const RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY: Partial<
  Readonly<Record<AuthoringSessionCapability, ReleaseCapability>>
> = {
  [AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION]: 'approve-production',
  [AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION]: 'promote-production',
  [AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING]: 'publish-staging',
  [AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE]: 'rollback-release',
  [AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE]: 'sample-product-style',
  [AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE]: 'unpublish-release',
  [AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING]: 'verify-staging',
};

export const RELEASE_CAPABILITY_FORBIDDEN_MESSAGES = {
  'approve-production': 'This workspace membership cannot approve production releases',
  'manage-release-policy': 'This workspace membership cannot manage release policy',
  'promote-production': 'This workspace membership cannot promote to production',
  'publish-staging': 'This workspace membership cannot publish to staging',
  'rollback-release': 'This workspace membership cannot roll back releases',
  'sample-product-style': 'This workspace membership cannot save product style sources',
  'unpublish-release': 'This workspace membership cannot unpublish releases',
  'verify-staging': 'This workspace membership cannot verify staging releases',
} as const satisfies Record<ReleaseCapability, string>;

const AUTH_ROLE_RANK = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} as const satisfies Record<AuthRole, number>;

export function emitObservability(sink: ObservabilitySink, event: ObservabilityEvent): void {
  try {
    sink.emit(event);
  } catch {
    // Telemetry must never turn a committed mutation into a misleading failure.
  }
}

export function requireRole(
  auth: AuthContext,
  minimumRole: AuthRole,
  reply: FastifyReply,
): boolean {
  if (AUTH_ROLE_RANK[auth.role] >= AUTH_ROLE_RANK[minimumRole]) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: `Workspace role ${minimumRole} or higher is required`,
  });
  return false;
}

export function requireReleaseCapability(
  auth: AuthContext,
  capability: ReleaseCapability,
  reply: FastifyReply,
): boolean {
  if (releaseRoleHasCapability(auth.role, capability)) return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[capability],
  });
  return false;
}

export function releaseRoleHasCapability(role: AuthRole, capability: ReleaseCapability): boolean {
  const capabilities: readonly ReleaseCapability[] = RELEASE_CAPABILITIES_BY_ROLE[role];
  return capabilities.includes(capability);
}

export async function authenticate(
  repository: ControlPlaneRepository,
  authProvider: AuthProvider,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  try {
    const auth = await authProvider.authenticate(request);
    const membership = await repository.resolveWorkspaceMembership(auth.workspaceId, auth.userId);
    if (membership) {
      return {
        ...auth,
        userId: membership.userId,
        role: authRoleFromMembership(membership.role),
      };
    }
    if (auth.provider === 'headers' && process.env.NODE_ENV !== 'production') return auth;
    await reply.code(403).send({
      error: 'forbidden',
      message: 'Workspace membership is required',
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      await reply.code(error.statusCode).send({ error: 'unauthorized', message: error.message });
      return null;
    }
    throw error;
  }
}

export function authRoleFromMembership(role: string): AuthRole {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role;
  return 'viewer';
}
