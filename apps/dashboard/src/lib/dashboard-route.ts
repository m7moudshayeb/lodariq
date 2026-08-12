import 'server-only';

import { NextResponse } from 'next/server';
import { DashboardApiError, loadAuthSession } from './api';
import { dashboardErrorMessageDescriptor } from '../i18n/error-messages';
import { getDashboardI18n } from '../i18n/server';
import { DASHBOARD_SERVER_MESSAGES } from '../i18n/messages';

export async function requireActiveDashboardWorkspace(): Promise<string> {
  const session = await loadAuthSession();
  if (!session.activeWorkspaceId) {
    throw new DashboardApiError(409, 'Choose a workspace to continue.', {
      code: 'workspace_required',
      retryable: false,
    });
  }
  return session.activeWorkspaceId;
}

export function dashboardJson(value: unknown, status = 200): NextResponse {
  return NextResponse.json(value, {
    status,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      vary: 'Cookie, Authorization',
    },
  });
}

export async function dashboardRouteError(error: unknown): Promise<NextResponse> {
  const { i18n } = await getDashboardI18n();
  if (error instanceof DashboardApiError) {
    return dashboardJson(
      {
        code: error.code,
        message: i18n._(dashboardErrorMessageDescriptor(error.code, error.statusCode)),
        ...(error.requestId ? { requestId: error.requestId } : {}),
      },
      normalizeRouteStatus(error.statusCode),
    );
  }
  return dashboardJson(
    { code: 'dashboard_unavailable', message: i18n._(DASHBOARD_SERVER_MESSAGES.unavailable) },
    503,
  );
}

function normalizeRouteStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500;
}
