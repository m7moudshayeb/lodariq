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
import { requireDashboardActionRole } from '../lib/action-auth';
import { DASHBOARD_ACTION_MESSAGES } from '../i18n/messages';
import { serverMessage } from '../i18n/server-message';

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
    return {
      status: 'error',
      error: await serverMessage(DASHBOARD_ACTION_MESSAGES.chooseAnalyticsEnvironment),
    };
  }

  try {
    await requireDashboardActionRole('viewer');
    return {
      status: 'success',
      environmentId: query.value.environmentId,
      response: await loadAnalyticsAggregates(query.value.environmentId),
    };
  } catch (error) {
    return { status: 'error', error: await analyticsReadError(error) };
  }
}

async function analyticsReadError(error: unknown): Promise<string> {
  if (error instanceof DashboardApiError) {
    if (error.statusCode === 404) {
      return serverMessage(DASHBOARD_ACTION_MESSAGES.analyticsEnvironmentUnavailable);
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return serverMessage(DASHBOARD_ACTION_MESSAGES.analyticsForbidden);
    }
    if (error.statusCode === 502) {
      return serverMessage(DASHBOARD_ACTION_MESSAGES.analyticsInvalid);
    }
  }
  return serverMessage(DASHBOARD_ACTION_MESSAGES.analyticsUnavailable);
}
