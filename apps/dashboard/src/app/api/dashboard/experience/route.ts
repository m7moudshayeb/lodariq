import {
  UpdateExperienceMeasurementBody,
  isEnvironmentPolicyId,
  validate,
  type UpdateExperienceMeasurementBody as UpdateExperienceMeasurementBodyDto,
} from '@lodariq/schema';
import {
  DashboardApiError,
  loadControlPlaneContext,
  loadDocumentExperiment,
  loadExperienceAnalytics,
  loadExperienceMeasurement,
  loadExperienceSessions,
  loadWorkspaceEnvironments,
  saveExperienceMeasurement,
} from '../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

/**
 * One request for one experience in one environment. The measurement config and
 * the experiment travel with the numbers because reading a funnel without
 * knowing what success was declared to be is how the wrong conclusion gets made.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId') ?? '';
    const environmentId = url.searchParams.get('environmentId') ?? '';
    if (!documentId) throw invalidRequest('Choose an experience.', 'invalid_document');
    if (!isEnvironmentPolicyId(environmentId)) {
      throw invalidRequest('Choose a valid analytics environment.', 'invalid_environment');
    }
    await requireScopedEnvironment(environmentId);
    const [analytics, measurement, experiment, sessions] = await Promise.all([
      loadExperienceAnalytics(documentId, environmentId),
      loadExperienceMeasurement(documentId),
      loadDocumentExperiment(documentId),
      loadExperienceSessions(documentId, environmentId),
    ]);
    return dashboardJson({ analytics, measurement, experiment, sessions: sessions.sessions });
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const documentId = new URL(request.url).searchParams.get('documentId') ?? '';
    if (!documentId) throw invalidRequest('Choose an experience.', 'invalid_document');
    const workspaceId = await requireActiveDashboardWorkspace();
    const context = await loadControlPlaneContext();
    if (context.workspaceId !== workspaceId) throw workspaceMismatch();
    const body = validate(UpdateExperienceMeasurementBody, await readJsonBody(request));
    if (!body.valid) {
      throw invalidRequest('The measurement change was not understood.', 'invalid_measurement');
    }
    const measurement = await saveExperienceMeasurement(
      documentId,
      body.value as UpdateExperienceMeasurementBodyDto,
    );
    return dashboardJson({ measurement });
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

async function requireScopedEnvironment(environmentId: string): Promise<void> {
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
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function invalidRequest(message: string, code: string): DashboardApiError {
  return new DashboardApiError(400, message, { code, retryable: false });
}

function workspaceMismatch(): DashboardApiError {
  return new DashboardApiError(403, 'The active workspace could not be verified.', {
    code: 'workspace_scope_mismatch',
    retryable: false,
  });
}
