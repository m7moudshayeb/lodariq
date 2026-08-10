'use server';

import {
  AnalyticsEnvironmentQuery as AnalyticsEnvironmentQuerySchema,
  validate,
  type AnalyticsAggregateResponse,
} from '@lodariq/schema';
import {
  DASHBOARD_ANALYTICS_AGGREGATE_LIMIT,
  DashboardApiError,
  loadAnalyticsAggregates,
} from '../lib/api';

export type AnalyticsAggregateActionResult =
  | { status: 'success'; environmentId: string; response: AnalyticsAggregateResponse }
  | { status: 'error'; error: string };

export async function loadAnalyticsAggregatesAction(input: {
  environmentId: string;
}): Promise<AnalyticsAggregateActionResult> {
  const query = validate(AnalyticsEnvironmentQuerySchema, {
    environmentId: input.environmentId,
    limit: DASHBOARD_ANALYTICS_AGGREGATE_LIMIT,
  });
  if (!query.valid) {
    return { status: 'error', error: 'Choose one valid analytics environment.' };
  }

  try {
    return {
      status: 'success',
      environmentId: query.value.environmentId,
      response: await loadAnalyticsAggregates(query.value.environmentId),
    };
  } catch (error) {
    return { status: 'error', error: analyticsReadError(error) };
  }
}

function analyticsReadError(error: unknown): string {
  if (error instanceof DashboardApiError) {
    if (error.statusCode === 404) return 'The selected analytics environment is unavailable.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      return 'Your current workspace access cannot read analytics.';
    }
    if (error.statusCode === 502) {
      return 'Analytics data could not be verified. No partial results were shown.';
    }
  }
  return 'Analytics are temporarily unavailable for the selected environment.';
}
