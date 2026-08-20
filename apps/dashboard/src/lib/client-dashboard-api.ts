'use client';

import {
  AnalyticsAggregateResponse,
  DashboardClientError,
  DashboardWorkspaceData,
  ExperienceAnalytics,
  ExperienceMeasurementConfig,
  ExperienceSessionsResponse,
  ExperimentResponse,
  ReleaseRecoveryStateResponse,
  WorkspaceApplicationsResponse,
  releaseRecoveryStateMatchesScope,
  validate,
  type AnalyticsAggregateResponse as AnalyticsAggregateResponseDto,
  type ApplicationSummary as ApplicationSummaryDto,
  type DashboardWorkspaceData as DashboardWorkspaceDataDto,
  type ExperienceAnalytics as ExperienceAnalyticsDto,
  type ExperienceMeasurementConfig as ExperienceMeasurementConfigDto,
  type ExperienceSession as ExperienceSessionDto,
  type Experiment as ExperimentDto,
  type ExperimentResponse as ExperimentResponseDto,
  type ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseDto,
  type UpdateExperienceMeasurementBody as UpdateExperienceMeasurementBodyDto,
  type UpdateExperimentBody as UpdateExperimentBodyDto,
  type UpsertWorkspaceApplicationBody as UpsertWorkspaceApplicationBodyDto,
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

/** Everything one experience needs to be judged: numbers, what success is, and the live test. */
export async function loadExperienceMeasurement(
  documentId: string,
  environmentId: string,
  signal?: AbortSignal,
): Promise<ExperienceMeasurementSnapshot> {
  const search = new URLSearchParams({ documentId, environmentId });
  const value = await dashboardJson(`/api/dashboard/experience?${search.toString()}`, signal);
  return requireExperienceSnapshot(value, documentId, environmentId);
}

export async function saveExperienceSuccessEvent(
  documentId: string,
  successEvent: UpdateExperienceMeasurementBodyDto['successEvent'],
): Promise<ExperienceMeasurementConfigDto> {
  const search = new URLSearchParams({ documentId });
  const value = await dashboardMutation(
    `/api/dashboard/experience?${search.toString()}`,
    'PATCH',
    { successEvent },
  );
  const result = validate(ExperienceMeasurementConfig, (value as { measurement?: unknown }).measurement);
  if (!result.valid) throw invalidClientResponse();
  return result.value;
}

export async function saveExperimentChange(
  experimentId: string,
  change: UpdateExperimentBodyDto,
): Promise<ExperimentDto> {
  const search = new URLSearchParams({ experimentId });
  const value = await dashboardMutation(
    `/api/dashboard/experiment?${search.toString()}`,
    'PATCH',
    change,
  );
  const result = validate(ExperimentResponse, {
    experiment: (value as { experiment?: unknown }).experiment,
    results: null,
  });
  if (!result.valid || !result.value.experiment) throw invalidClientResponse();
  return result.value.experiment;
}

export async function loadWorkspaceApplications(
  signal?: AbortSignal,
): Promise<readonly ApplicationSummaryDto[]> {
  const value = await dashboardJson('/api/dashboard/applications', signal);
  const result = validate(WorkspaceApplicationsResponse, value);
  if (!result.valid) throw invalidClientResponse();
  return result.value.applications;
}

export async function saveWorkspaceApplication(
  application: UpsertWorkspaceApplicationBodyDto,
): Promise<readonly ApplicationSummaryDto[]> {
  const value = await dashboardMutation('/api/dashboard/applications', 'PUT', application);
  const result = validate(WorkspaceApplicationsResponse, value);
  if (!result.valid) throw invalidClientResponse();
  return result.value.applications;
}

export interface ExperienceMeasurementSnapshot {
  analytics: ExperienceAnalyticsDto;
  measurement: ExperienceMeasurementConfigDto;
  experiment: ExperimentResponseDto;
  sessions: readonly ExperienceSessionDto[];
}

function requireExperienceSnapshot(
  value: unknown,
  documentId: string,
  environmentId: string,
): ExperienceMeasurementSnapshot {
  const payload = value as Partial<Record<keyof ExperienceMeasurementSnapshot, unknown>>;
  const analytics = validate(ExperienceAnalytics, payload.analytics);
  const measurement = validate(ExperienceMeasurementConfig, payload.measurement);
  const experiment = validate(ExperimentResponse, payload.experiment);
  const sessions = validate(ExperienceSessionsResponse, { sessions: payload.sessions });
  if (!analytics.valid || !measurement.valid || !experiment.valid || !sessions.valid) {
    throw invalidClientResponse();
  }
  // The scope the caller asked for is the scope it must render; anything else
  // would silently attribute one environment's numbers to another.
  if (
    analytics.value.documentId !== documentId ||
    analytics.value.environmentId !== environmentId ||
    measurement.value.documentId !== documentId
  ) {
    throw invalidClientResponse();
  }
  return {
    analytics: analytics.value,
    measurement: measurement.value,
    experiment: experiment.value,
    sessions: sessions.value.sessions,
  };
}

async function dashboardMutation(
  path: string,
  method: 'PATCH' | 'PUT',
  body: unknown,
): Promise<unknown> {
  return dashboardRequest(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function dashboardJson(path: string, signal?: AbortSignal): Promise<unknown> {
  return dashboardRequest(path, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
}

async function dashboardRequest(path: string, init: RequestInit): Promise<unknown> {
  const signal = init.signal ?? undefined;
  let response: Response;
  try {
    response = await fetch(path, init);
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
