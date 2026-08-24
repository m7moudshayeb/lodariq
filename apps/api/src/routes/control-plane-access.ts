import {
  AUTHORING_SESSION_CAPABILITIES,
  resolveEnvironmentGovernanceCapabilities,
  resolveWorkspaceGovernanceCapabilities,
  type AuthoringSessionCapability,
  type GovernanceCapability,
  type WorkspaceGovernanceCapability,
} from '@lodariq/schema';
import type { ControlPlaneRepository } from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  isRecentAuthentication,
  workspaceSessionPolicyFailure,
  type AuthContext,
  type AuthProvider,
  type AuthRole,
} from '../auth';
import type { ObservabilityEvent, ObservabilitySink } from '../observability';

export type ReleaseCapability =
  | 'approve-production'
  | 'manage-release-policy'
  | 'promote-production'
  | 'publish-staging'
  | 'rollback-release'
  | 'schedule-release'
  | 'sample-product-style'
  | 'unpublish-release'
  | 'verify-staging';

export const RELEASE_CAPABILITIES_BY_ROLE = {
  viewer: [],
  member: ['publish-staging', 'sample-product-style', 'schedule-release', 'verify-staging'],
  admin: [
    'approve-production',
    'manage-release-policy',
    'promote-production',
    'publish-staging',
    'rollback-release',
    'schedule-release',
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
    'schedule-release',
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
  [AUTHORING_SESSION_CAPABILITIES.SCHEDULE_RELEASE]: 'schedule-release',
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
  'schedule-release': 'This workspace membership cannot schedule releases',
  'sample-product-style': 'This workspace membership cannot save product style sources',
  'unpublish-release': 'This workspace membership cannot unpublish releases',
  'verify-staging': 'This workspace membership cannot verify staging releases',
} as const satisfies Record<ReleaseCapability, string>;

export const GOVERNANCE_CAPABILITY_BY_RELEASE_CAPABILITY = {
  'approve-production': 'release:approve',
  'manage-release-policy': 'release-policy:manage',
  'promote-production': 'release:promote',
  'publish-staging': 'release:publish',
  'rollback-release': 'release:rollback',
  'schedule-release': 'release:schedule',
  'sample-product-style': 'product-style:sample',
  'unpublish-release': 'release:unpublish',
  'verify-staging': 'release:verify',
} as const satisfies Readonly<Record<ReleaseCapability, GovernanceCapability>>;

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

export async function requireEnvironmentReleaseCapability(
  repository: ControlPlaneRepository,
  auth: AuthContext,
  environmentId: string,
  capability: ReleaseCapability,
  reply: FastifyReply,
): Promise<boolean> {
  if (await environmentReleaseCapabilityAllowed(repository, auth, environmentId, capability)) {
    return true;
  }
  void reply.code(403).send({
    error: 'forbidden',
    message: RELEASE_CAPABILITY_FORBIDDEN_MESSAGES[capability],
  });
  return false;
}

export async function environmentReleaseCapabilityAllowed(
  repository: ControlPlaneRepository,
  auth: AuthContext,
  environmentId: string,
  capability: ReleaseCapability,
): Promise<boolean> {
  const [environment, resolved] = await Promise.all([
    repository
      .listEnvironments(auth.workspaceId)
      .then((environments) => environments.find((item) => item.id === environmentId) ?? null),
    repository.resolveGovernanceCapabilityProfile(auth.workspaceId, environmentId, auth.userId),
  ]);
  const requiredCapability = GOVERNANCE_CAPABILITY_BY_RELEASE_CAPABILITY[capability];
  if (environment && resolved && resolved.membershipRole === auth.role) {
    const grants = resolveEnvironmentGovernanceCapabilities({
      role: resolved.membershipRole,
      environmentCapabilities: environment.governanceCapabilities ?? [],
      profile: resolved.profile,
    });
    if (grants.includes(requiredCapability)) return true;
  }
  return false;
}

export async function workspaceGovernanceCapabilityAllowed(
  repository: ControlPlaneRepository,
  workspaceId: string,
  userId: string,
  capability: WorkspaceGovernanceCapability,
): Promise<boolean> {
  const resolved = await repository.resolveWorkspaceGovernanceCapabilityProfile(
    workspaceId,
    userId,
  );
  if (!resolved) return false;
  return resolveWorkspaceGovernanceCapabilities(resolved.membershipRole, resolved.profile).includes(
    capability,
  );
}

export async function requireWorkspaceGovernanceCapability(
  repository: ControlPlaneRepository,
  auth: AuthContext,
  capability: WorkspaceGovernanceCapability,
  reply: FastifyReply,
): Promise<boolean> {
  if (
    await workspaceGovernanceCapabilityAllowed(
      repository,
      auth.workspaceId,
      auth.userId,
      capability,
    )
  ) {
    return true;
  }
  void reply.code(403).send({
    error: 'forbidden',
    message: `The ${capability} workspace capability is required`,
  });
  return false;
}

export function requireRecentControlPlaneAuthentication(
  auth: AuthContext,
  reply: FastifyReply,
  now = new Date(),
): boolean {
  if (auth.authenticatedAt && isRecentAuthentication(auth.authenticatedAt, now)) return true;
  void reply.code(403).send({
    error: 'recent_authentication_required',
    message: 'Sign in again before changing production security policy',
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
      const policy = await repository.getWorkspaceAuthPolicy(auth.workspaceId);
      if (!policy) {
        await reply.code(403).send({
          error: 'workspace_auth_policy_unavailable',
          message: 'Workspace authentication policy could not be verified',
        });
        return null;
      }
      const workspaceSsoIdentitySatisfied = policy.ssoRequired
        ? await repository.identitySatisfiesWorkspaceSso(auth.workspaceId, auth.identityId ?? null)
        : false;
      const policyFailure = workspaceSessionPolicyFailure(
        auth,
        policy,
        workspaceSsoIdentitySatisfied,
      );
      if (policyFailure) {
        await reply.code(403).send({
          error: policyFailure,
          message: workspacePolicyFailureMessage(policyFailure),
        });
        return null;
      }
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

function workspacePolicyFailureMessage(
  failure: ReturnType<typeof workspaceSessionPolicyFailure> & string,
): string {
  if (failure === 'minimum_assurance_required') {
    return 'A stronger authentication method is required for this workspace';
  }
  if (failure === 'password_not_allowed') {
    return 'Password authentication is not allowed for this workspace';
  }
  return 'Enterprise sign-in is required for this workspace';
}

export function authRoleFromMembership(role: string): AuthRole {
  if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role;
  return 'viewer';
}
