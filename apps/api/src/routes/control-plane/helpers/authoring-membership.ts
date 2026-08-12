import type { AuthoringSessionCapability } from '@lodariq/schema';
import type {
  AuthoringSessionRecord,
  ControlPlaneRepository,
  WorkspaceEnvironment,
} from '@lodariq/database';
import type { AuthRole } from '../../../auth';
import {
  RELEASE_CAPABILITIES_BY_ROLE,
  RELEASE_CAPABILITY_BY_AUTHORING_SESSION_CAPABILITY,
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
