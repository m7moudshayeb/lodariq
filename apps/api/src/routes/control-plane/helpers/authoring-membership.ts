import {
  AUTHORING_SESSION_CAPABILITIES,
  resolveEnvironmentGovernanceCapabilities,
  type AuthoringSessionCapability,
  type EnvironmentGovernanceCapability,
} from '@lodariq/schema';
import type {
  AuthoringSessionRecord,
  ControlPlaneRepository,
  WorkspaceEnvironment,
} from '@lodariq/database';
import type { AuthRole } from '../../../auth';
import {
  RELEASE_CAPABILITIES_BY_ROLE,
  RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY,
  GOVERNANCE_CAPABILITY_BY_RELEASE_CAPABILITY,
  authRoleFromMembership,
  type ReleaseCapability,
} from '../../control-plane-access';

export async function resolveCurrentAuthoringMembershipRole(
  repository: ControlPlaneRepository,
  session: AuthoringSessionRecord,
): Promise<AuthRole | null> {
  const membership = await repository.resolveWorkspaceMembership(
    session.workspaceId,
    session.createdByUserId,
  );
  return membership ? authRoleFromMembership(membership.role) : null;
}

export function authoringSessionCapabilitiesForRole(
  capabilities: readonly AuthoringSessionCapability[],
  role: AuthRole,
): AuthoringSessionCapability[] {
  const allowedReleaseCapabilities: readonly ReleaseCapability[] =
    RELEASE_CAPABILITIES_BY_ROLE[role];
  return capabilities.filter((capability) => {
    const releaseCapability = RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY[capability];
    return !releaseCapability || allowedReleaseCapabilities.includes(releaseCapability);
  });
}

export async function authoringSessionCapabilitiesForGovernance(
  repository: ControlPlaneRepository,
  session: Pick<AuthoringSessionRecord, 'workspaceId' | 'environmentId' | 'capabilities'> & {
    createdByUserId?: string;
    creatorId?: string;
  },
): Promise<AuthoringSessionCapability[]> {
  const creatorId = session.createdByUserId ?? session.creatorId;
  if (!creatorId) return [];
  const [resolved, environment] = await Promise.all([
    repository.resolveGovernanceCapabilityProfile(
      session.workspaceId,
      session.environmentId,
      creatorId,
    ),
    findEnvironment(repository, session.workspaceId, session.environmentId),
  ]);
  if (!resolved || !environment || !Array.isArray(session.capabilities)) return [];
  const grants = resolveEnvironmentGovernanceCapabilities({
    role: resolved.membershipRole,
    environmentCapabilities: environment.governanceCapabilities ?? [],
    profile: resolved.profile,
  });
  return session.capabilities.filter((capability) => {
    const required = governanceCapabilityForAuthoringSessionCapability(capability);
    return required ? grants.includes(required) : false;
  });
}

function governanceCapabilityForAuthoringSessionCapability(
  capability: AuthoringSessionCapability,
): EnvironmentGovernanceCapability | null {
  const releaseCapability = RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY[capability];
  if (releaseCapability) return GOVERNANCE_CAPABILITY_BY_RELEASE_CAPABILITY[releaseCapability];
  if (
    capability === AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT ||
    capability === AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE ||
    capability === AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT
  ) {
    return 'authoring:read';
  }
  if (capability === AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE) {
    return 'product-style:sample';
  }
  if (
    capability === AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT ||
    capability === AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET
  ) {
    return 'authoring:write';
  }
  return null;
}

export async function findEnvironment(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
): Promise<WorkspaceEnvironment | null> {
  return (
    (await repository.listEnvironments(workspaceId)).find(
      (environment) => environment.id === environmentId,
    ) ?? null
  );
}
