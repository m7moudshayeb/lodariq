import {
  UpsertWorkspaceApplicationBody,
  validate,
  type UpsertWorkspaceApplicationBody as UpsertWorkspaceApplicationBodyDto,
} from '@lodariq/schema';
import {
  DashboardApiError,
  loadControlPlaneContext,
  loadWorkspaceApplications,
  saveWorkspaceApplication,
} from '../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

/** The registry a cross-application handoff resolves its destination against. */
export async function GET(): Promise<Response> {
  try {
    await requireScopedWorkspace();
    return dashboardJson({ applications: await loadWorkspaceApplications() });
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    await requireScopedWorkspace();
    const body = validate(UpsertWorkspaceApplicationBody, await readJsonBody(request));
    if (!body.valid) {
      throw new DashboardApiError(400, 'The application was not understood.', {
        code: 'invalid_application',
        retryable: false,
      });
    }
    const applications = await saveWorkspaceApplication(
      body.value as UpsertWorkspaceApplicationBodyDto,
    );
    return dashboardJson({ applications });
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

async function requireScopedWorkspace(): Promise<void> {
  const workspaceId = await requireActiveDashboardWorkspace();
  const context = await loadControlPlaneContext();
  if (context.workspaceId !== workspaceId) {
    throw new DashboardApiError(403, 'The active workspace could not be verified.', {
      code: 'workspace_scope_mismatch',
      retryable: false,
    });
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
