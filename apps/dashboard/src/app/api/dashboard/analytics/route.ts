import { isEnvironmentPolicyId } from '@lodariq/schema';
import {
  DashboardApiError,
  loadAnalyticsAggregates,
  loadControlPlaneContext,
  loadWorkspaceEnvironments,
} from '../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const environmentId = new URL(request.url).searchParams.get('environmentId') ?? '';
    if (!isEnvironmentPolicyId(environmentId)) {
      throw new DashboardApiError(400, 'Choose a valid analytics environment.', {
        code: 'invalid_environment',
        retryable: false,
      });
    }
    const workspaceId = await requireActiveDashboardWorkspace();
    const context = await loadControlPlaneContext();
    if (context.workspaceId !== workspaceId) throw workspaceMismatch();
    const environments = await loadWorkspaceEnvironments(workspaceId);
    const environment = environments.find((candidate) => candidate.id === environmentId);
    if (!environment || (environment.kind !== 'staging' && environment.kind !== 'production')) {
      throw new DashboardApiError(404, 'The analytics environment was not found.', {
        code: 'environment_not_found',
        retryable: false,
      });
    }
    const response = await loadAnalyticsAggregates(environmentId);
    if (response.aggregates.some((aggregate) => aggregate.workspaceId !== workspaceId)) {
      throw workspaceMismatch();
    }
    return dashboardJson(response);
  } catch (error) {
    return dashboardRouteError(error);
  }
}

function workspaceMismatch(): DashboardApiError {
  return new DashboardApiError(403, 'The active workspace could not be verified.', {
    code: 'workspace_scope_mismatch',
    retryable: false,
  });
}
