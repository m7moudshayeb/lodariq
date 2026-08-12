import type { ControlPlaneRole } from '@lodariq/schema';
import { DashboardApiError, loadControlPlaneContext } from './api';

const ROLE_LEVEL: Readonly<Record<ControlPlaneRole, number>> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export async function requireDashboardActionRole(
  requiredRole: ControlPlaneRole,
): Promise<{ userId: string; workspaceId: string; role: ControlPlaneRole }> {
  const context = await loadControlPlaneContext();
  if (ROLE_LEVEL[context.role] < ROLE_LEVEL[requiredRole]) {
    throw new DashboardApiError(403, 'Your workspace role does not allow this action.', {
      code: 'capability_denied',
      retryable: false,
    });
  }
  return context;
}
