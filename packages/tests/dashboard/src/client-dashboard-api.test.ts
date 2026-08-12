import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadDashboardWorkspace,
  type DashboardClientApiError,
} from '../../../../apps/dashboard/src/lib/client-dashboard-api';
import { dashboardQueryKeys } from '../../../../apps/dashboard/src/lib/dashboard-query-keys';

describe('@lodariq/dashboard browser data boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps query identities isolated by workspace and environment', () => {
    expect(dashboardQueryKeys.workspace('wk_a')).not.toEqual(dashboardQueryKeys.workspace('wk_b'));
    expect(dashboardQueryKeys.analytics('wk_a', 'env_a')).not.toEqual(
      dashboardQueryKeys.analytics('wk_a', 'env_b'),
    );
  });

  it('fails closed when a valid response belongs to another workspace', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse({
          controlPlaneContext: { userId: 'user_b', workspaceId: 'wk_b', role: 'owner' },
          documents: [],
          environments: [],
          tokens: [],
          installations: [],
          themes: [],
          unavailableResources: [],
        }),
      ),
    );

    await expect(loadDashboardWorkspace('wk_a')).rejects.toMatchObject({
      code: 'invalid_dashboard_response',
      statusCode: 502,
    });
  });

  it('accepts only the bounded public error contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse(
          {
            code: 'workspace_required',
            message: 'Choose a workspace to continue.',
            leakedSecret: 'must invalidate the entire error body',
          },
          409,
        ),
      ),
    );

    await expect(loadDashboardWorkspace('wk_a')).rejects.toEqual(
      expect.objectContaining<Partial<DashboardClientApiError>>({
        code: 'dashboard_request_failed',
        statusCode: 409,
      }),
    );
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
