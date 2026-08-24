import { validate } from '@lodariq/schema';
import { CreateBillingPortalSessionRequest } from '@lodariq/schema/commercial-billing';
import {
  DashboardApiError,
  createWorkspaceBillingPortalSession,
  loadControlPlaneContext,
} from '../../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    await requireScopedWorkspace();
    const body = validate(CreateBillingPortalSessionRequest, await readJsonBody(request));
    if (!body.valid) throw invalidBillingRequest();
    return dashboardJson(await createWorkspaceBillingPortalSession(body.value), 201);
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

function invalidBillingRequest(): DashboardApiError {
  return new DashboardApiError(400, 'The billing request was not understood.', {
    code: 'invalid_billing_request',
    retryable: false,
  });
}
