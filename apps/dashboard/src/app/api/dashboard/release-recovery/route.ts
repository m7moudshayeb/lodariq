import { isEnvironmentPolicyId } from '@lodariq/schema';
import {
  DashboardApiError,
  loadControlPlaneContext,
  loadDocumentReleaseRecoveryState,
} from '../../../../lib/api';
import {
  dashboardJson,
  dashboardRouteError,
  requireActiveDashboardWorkspace,
} from '../../../../lib/dashboard-route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const search = new URL(request.url).searchParams;
    const documentId = search.get('documentId') ?? '';
    const environmentId = search.get('environmentId') ?? '';
    if (!isRecordId(documentId) || !isEnvironmentPolicyId(environmentId)) {
      throw new DashboardApiError(400, 'Choose a valid release scope.', {
        code: 'invalid_release_scope',
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
    return dashboardJson(
      await loadDocumentReleaseRecoveryState({ documentId, environmentId, workspaceId }),
    );
  } catch (error) {
    return await dashboardRouteError(error);
  }
}

function isRecordId(value: string): boolean {
  return value.length > 0 && value.length <= 256 && /^[A-Za-z0-9._:-]+$/u.test(value);
}
