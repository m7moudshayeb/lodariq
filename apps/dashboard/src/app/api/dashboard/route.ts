import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../lib/dashboard-route';
import { loadDashboardData } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const workspaceId = await requireActiveDashboardWorkspace();
    return dashboardJson(await loadDashboardData(workspaceId));
  } catch (error) {
    return await dashboardRouteError(error);
  }
}
