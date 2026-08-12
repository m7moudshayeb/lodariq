import 'server-only';

import { NextResponse } from 'next/server';
import { DashboardApiError, loadAuthSession } from './api';

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

export function dashboardRouteError(error: unknown): NextResponse {
  if (error instanceof DashboardApiError) {
    return dashboardJson(
      {
        code: error.code,
        message: error.message,
        ...(error.requestId ? { requestId: error.requestId } : {}),
      },
      normalizeRouteStatus(error.statusCode),
    );
  }
  return dashboardJson(
    { code: 'dashboard_unavailable', message: 'The workspace is temporarily unavailable.' },
    503,
  );
}

function normalizeRouteStatus(status: number): number {
  return status >= 400 && status <= 599 ? status : 500;
}
