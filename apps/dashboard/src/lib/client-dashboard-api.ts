'use client';

import {
  AnalyticsAggregateResponse,
  DashboardClientError,
  DashboardWorkspaceData,
  ReleaseRecoveryStateResponse,
  releaseRecoveryStateMatchesScope,
  validate,
  type AnalyticsAggregateResponse as AnalyticsAggregateResponseDto,
  type DashboardWorkspaceData as DashboardWorkspaceDataDto,
  type ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseDto,
} from '@lodariq/schema';

export class DashboardClientApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId?: string;

  constructor(statusCode: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'DashboardClientApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function loadDashboardWorkspace(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<DashboardWorkspaceDataDto> {
  const value = await dashboardJson('/api/dashboard', signal);
  const result = validate(DashboardWorkspaceData, value);
  if (!result.valid || result.value.controlPlaneContext.workspaceId !== workspaceId) {
    throw invalidClientResponse();
  }
  return result.value;
}

export async function loadDashboardAnalytics(
  workspaceId: string,
  environmentId: string,
  signal?: AbortSignal,
): Promise<AnalyticsAggregateResponseDto> {
  const search = new URLSearchParams({ environmentId });
  const value = await dashboardJson(`/api/dashboard/analytics?${search.toString()}`, signal);
  const result = validate(AnalyticsAggregateResponse, value);
  if (
    !result.valid ||
    result.value.aggregates.some(
      (aggregate) =>
        aggregate.workspaceId !== workspaceId || aggregate.environmentId !== environmentId,
    )
  ) {
    throw invalidClientResponse();
  }
  return result.value;
}

export async function loadDashboardReleaseRecovery(
  workspaceId: string,
  documentId: string,
  environmentId: string,
  signal?: AbortSignal,
): Promise<ReleaseRecoveryStateResponseDto> {
  const search = new URLSearchParams({ documentId, environmentId });
  const value = await dashboardJson(`/api/dashboard/release-recovery?${search.toString()}`, signal);
  const result = validate(ReleaseRecoveryStateResponse, value);
  if (
    !result.valid ||
    !releaseRecoveryStateMatchesScope(result.value, {
      workspaceId,
      documentId,
      environmentId,
    })
  ) {
    throw invalidClientResponse();
  }
  return result.value;
}

async function dashboardJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DashboardClientApiError(
      503,
      'dashboard_unavailable',
      'The workspace is temporarily unavailable.',
    );
  }

  const value = await readJson(response);
  if (!response.ok) {
    const error = validate(DashboardClientError, value);
    if (error.valid) {
      throw new DashboardClientApiError(
        response.status,
        error.value.code,
        error.value.message,
        error.value.requestId,
      );
    }
    throw new DashboardClientApiError(
      response.status,
      'dashboard_request_failed',
      'The workspace request could not be completed.',
    );
  }
  return value;
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) throw invalidClientResponse();
  try {
    return await response.json();
  } catch {
    throw invalidClientResponse();
  }
}

function invalidClientResponse(): DashboardClientApiError {
  return new DashboardClientApiError(
    502,
    'invalid_dashboard_response',
    'The workspace response could not be verified.',
  );
}
