import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadAnalyticsAggregates: vi.fn(),
}));

vi.mock('../../../../apps/dashboard/src/lib/api', () => ({
  DASHBOARD_ANALYTICS_AGGREGATE_LIMIT: 1_000,
  loadAnalyticsAggregates: mocks.loadAnalyticsAggregates,
  DashboardApiError: class DashboardApiError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'DashboardApiError';
      this.statusCode = statusCode;
    }
  },
}));

import { loadAnalyticsAggregatesAction } from '../../../../apps/dashboard/src/app/analytics-actions';
import { DashboardApiError } from '../../../../apps/dashboard/src/lib/api';

const ENVIRONMENT_ID = 'env.production:analytics';

describe('@lodariq/dashboard analytics aggregate action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads one exact opaque environment scope', async () => {
    const response = { aggregates: [] };
    mocks.loadAnalyticsAggregates.mockResolvedValue(response);

    await expect(loadAnalyticsAggregatesAction({ environmentId: ENVIRONMENT_ID })).resolves.toEqual({
      status: 'success',
      environmentId: ENVIRONMENT_ID,
      response,
    });
    expect(mocks.loadAnalyticsAggregates).toHaveBeenCalledOnce();
    expect(mocks.loadAnalyticsAggregates).toHaveBeenCalledWith(ENVIRONMENT_ID);
  });

  it('rejects a missing or over-bound environment before the authenticated client runs', async () => {
    await expect(loadAnalyticsAggregatesAction({ environmentId: '' })).resolves.toEqual({
      status: 'error',
      error: 'Choose one valid analytics environment.',
    });
    await expect(
      loadAnalyticsAggregatesAction({ environmentId: 'x'.repeat(257) }),
    ).resolves.toEqual({
      status: 'error',
      error: 'Choose one valid analytics environment.',
    });
    expect(mocks.loadAnalyticsAggregates).not.toHaveBeenCalled();
  });

  it('returns bounded unavailable, access, and invalid-response messages', async () => {
    mocks.loadAnalyticsAggregates
      .mockRejectedValueOnce(new DashboardApiError(404, 'not found'))
      .mockRejectedValueOnce(new DashboardApiError(403, 'forbidden'))
      .mockRejectedValueOnce(new DashboardApiError(502, 'invalid'));

    await expect(loadAnalyticsAggregatesAction({ environmentId: ENVIRONMENT_ID })).resolves.toEqual({
      status: 'error',
      error: 'The selected analytics environment is unavailable.',
    });
    await expect(loadAnalyticsAggregatesAction({ environmentId: ENVIRONMENT_ID })).resolves.toEqual({
      status: 'error',
      error: 'Your current workspace access cannot read analytics.',
    });
    await expect(loadAnalyticsAggregatesAction({ environmentId: ENVIRONMENT_ID })).resolves.toEqual({
      status: 'error',
      error: 'Analytics data could not be verified. No partial results were shown.',
    });
  });
});
