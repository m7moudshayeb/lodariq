import {
  UpdateExperimentBody,
  validate,
  type UpdateExperimentBody as UpdateExperimentBodyDto,
} from '@lodariq/schema';
import {
  DashboardApiError,
  loadControlPlaneContext,
  saveDocumentExperiment,
} from '../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

/**
 * Stopping or promoting an arm. Creating one stays in the authoring frame, where
 * the creator can see the two variants they are choosing between.
 */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const experimentId = new URL(request.url).searchParams.get('experimentId') ?? '';
    if (!experimentId) {
      throw new DashboardApiError(400, 'Choose an experiment.', {
        code: 'invalid_experiment',
        retryable: false,
      });
    }
    const workspaceId = await requireActiveDashboardWorkspace();
    const context = await loadControlPlaneContext();
    if (context.workspaceId !== workspaceId) {
      throw new DashboardApiError(403, 'The active workspace could not be verified.', {
        code: 'workspace_scope_mismatch',
        retryable: false,
      });
    }
    const body = validate(UpdateExperimentBody, await readJsonBody(request));
    if (!body.valid) {
      throw new DashboardApiError(400, 'The experiment change was not understood.', {
        code: 'invalid_experiment_change',
        retryable: false,
      });
    }
    const experiment = await saveDocumentExperiment(
      experimentId,
      body.value as UpdateExperimentBodyDto,
    );
    return dashboardJson({ experiment });
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
