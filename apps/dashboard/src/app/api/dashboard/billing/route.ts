import {
  DashboardApiError,
  loadControlPlaneContext,
  loadWorkspaceBillingOverview,
} from '../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const workspaceId = await requireBillingWorkspace();
    const overview = await loadWorkspaceBillingOverview();
    if (overview.subscription.workspaceId !== workspaceId) {
      throw new DashboardApiError(502, 'The billing workspace could not be verified.', {
        code: 'workspace_scope_mismatch',
        retryable: false,
      });
    }
    return dashboardJson(overview);
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

async function requireBillingWorkspace(): Promise<string> {
  const workspaceId = await requireActiveDashboardWorkspace();
  const context = await loadControlPlaneContext();
  if (context.workspaceId !== workspaceId) {
    throw new DashboardApiError(403, 'The active workspace could not be verified.', {
      code: 'workspace_scope_mismatch',
      retryable: false,
    });
  }
  return workspaceId;
}
