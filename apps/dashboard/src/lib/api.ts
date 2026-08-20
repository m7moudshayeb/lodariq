import 'server-only';
import {
  AnalyticsAggregateResponse as AnalyticsAggregateResponseSchema,
  AnalyticsEnvironmentQuery as AnalyticsEnvironmentQuerySchema,
  AuthoringAuthorizationResult as AuthoringAuthorizationResultSchema,
  ControlPlaneAuthContext as ControlPlaneAuthContextSchema,
  DashboardDocumentsResponse as DashboardDocumentsResponseSchema,
  DashboardDocumentDebugResponse as DashboardDocumentDebugResponseSchema,
  DashboardEnvironmentMutationResponse as DashboardEnvironmentMutationResponseSchema,
  DashboardEnvironmentTokenCreateResponse as DashboardEnvironmentTokenCreateResponseSchema,
  DashboardEnvironmentTokenRevokeResponse as DashboardEnvironmentTokenRevokeResponseSchema,
  DashboardEnvironmentsResponse as DashboardEnvironmentsResponseSchema,
  DashboardEnvironmentTokensResponse as DashboardEnvironmentTokensResponseSchema,
  DashboardPublicSdkInstallationCreateResponse as DashboardPublicSdkInstallationCreateResponseSchema,
  DashboardPublicSdkInstallationOriginsResponse as DashboardPublicSdkInstallationOriginsResponseSchema,
  DashboardPublicSdkInstallationRevokeResponse as DashboardPublicSdkInstallationRevokeResponseSchema,
  DashboardPendingAuthoringAuthorization as DashboardPendingAuthoringAuthorizationSchema,
  DashboardSdkInstallationsResponse as DashboardSdkInstallationsResponseSchema,
  DashboardThemeApprovalResponse as DashboardThemeApprovalResponseSchema,
  DashboardThemeMutationResponse as DashboardThemeMutationResponseSchema,
  DashboardThemesResponse as DashboardThemesResponseSchema,
  DashboardWorkspaceThemeDetail as DashboardWorkspaceThemeDetailSchema,
  ExperienceAnalytics as ExperienceAnalyticsSchema,
  ExperienceMeasurementConfig as ExperienceMeasurementConfigSchema,
  ExperienceSessionsResponse as ExperienceSessionsResponseSchema,
  ExperimentResponse as ExperimentResponseSchema,
  WorkspaceApplicationsResponse as WorkspaceApplicationsResponseSchema,
  ReleaseRecoveryRequest as ReleaseRecoveryRequestSchema,
  ReleaseRecoveryResult as ReleaseRecoveryResultSchema,
  ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseSchema,
  releaseRecoveryStateMatchesScope,
  validate,
  type AnalyticsAggregateResponse,
  type AnalyticsEventAggregate,
  type ApplicationSummary,
  type ExperienceAnalytics,
  type ExperienceSessionsResponse,
  type ExperienceMeasurementConfig,
  type ExperimentResponse,
  type UpdateExperienceMeasurementBody,
  type UpdateExperimentBody,
  type UpsertWorkspaceApplicationBody,
  type BrandThemeDefinition,
  type ControlPlaneAuthContext,
  type DashboardDocumentPublication,
  type DashboardDocumentSummary,
  type DashboardEnvironmentToken,
  type DashboardPublicSdkInstallation,
  type DashboardPublicSdkInstallationOrigin,
  type DashboardPendingAuthoringAuthorization,
  type DashboardPublishReadinessIssue,
  type DashboardWorkspaceData,
  type DashboardWorkspaceEnvironment,
  type DashboardWorkspaceTheme,
  type DashboardWorkspaceThemeDetail,
  type DashboardWorkspaceThemeImpact,
  type DashboardWorkspaceThemeStyleSource,
  type DashboardWorkspaceThemeVersion,
  type EnvironmentReleasePolicy,
  type ReleaseRecoveryFailureCode,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
  type ThemeBinding,
} from '@lodariq/schema';
import {
  dashboardSessionCookieName,
  isDevelopmentHeaderAuthMode,
  parseAuthSessionSnapshot,
  type AuthSessionSnapshot,
} from './auth-contract';
import { DASHBOARD_ANALYTICS_AGGREGATE_LIMIT } from './dashboard-constants';

export { DASHBOARD_ANALYTICS_AGGREGATE_LIMIT } from './dashboard-constants';

export type EnvironmentKind = 'development' | 'staging' | 'production';

export type DocumentSummaryDto = DashboardDocumentSummary;
export type PublishReadinessIssueDto = DashboardPublishReadinessIssue;
export type DocumentPublicationDto = DashboardDocumentPublication;
export type WorkspaceEnvironmentDto = DashboardWorkspaceEnvironment;
export type EnvironmentTokenDto = DashboardEnvironmentToken;
export type PublicSdkInstallationOriginDto = DashboardPublicSdkInstallationOrigin;
export type PublicSdkInstallationDto = DashboardPublicSdkInstallation;
export type WorkspaceThemeVersionDto = DashboardWorkspaceThemeVersion;
export type WorkspaceThemeDto = DashboardWorkspaceTheme;
export type WorkspaceThemeStyleSourceDto = DashboardWorkspaceThemeStyleSource;
export type WorkspaceThemeImpactDto = DashboardWorkspaceThemeImpact;
export type WorkspaceThemeDetailDto = DashboardWorkspaceThemeDetail;
export type DashboardDataDto = DashboardWorkspaceData;

export type DashboardResourceName =
  'documents' | 'environments' | 'tokens' | 'installations' | 'themes';

export interface DocumentDebugDto {
  canonical: unknown;
  latestArtifact: {
    id: string;
    workspaceId: string;
    documentId: string;
    documentVersionId?: string | null;
    contentHash: string;
    compilerVersion: string;
    createdAt: string;
    compiled: unknown;
  } | null;
  publishReadinessIssues: PublishReadinessIssueDto[];
  versions: Array<{
    id: string;
    workspaceId: string;
    documentId: string;
    version: number;
    canonical: unknown;
    createdByUserId: string | null;
    createdAt: string;
  }>;
}

export interface CreateEnvironmentTokenDto {
  environmentId: string;
  name: string;
}

export interface CreateEnvironmentTokenResponseDto {
  token: EnvironmentTokenDto;
  clientToken: string;
  sdkSnippet: string;
}

export interface RevokeEnvironmentTokenResponseDto {
  token: EnvironmentTokenDto;
}

export interface CreatePublicSdkInstallationResponseDto {
  installation: Omit<PublicSdkInstallationDto, 'origins' | 'sdkSnippet'>;
  sdkSnippet: string;
}

export interface ConfigurePublicSdkInstallationOriginDto {
  environmentId: string;
  origin: string;
  authoringEnabled: boolean;
}

export interface SyncPublicSdkInstallationOriginsResponseDto {
  origins: PublicSdkInstallationOriginDto[];
}

export interface RevokePublicSdkInstallationResponseDto {
  installation: Omit<PublicSdkInstallationDto, 'origins' | 'sdkSnippet'>;
}

/** The kill switch shares revoke's response shape: one updated installation. */
export type SuspendPublicSdkInstallationResponseDto = RevokePublicSdkInstallationResponseDto;

export interface AuthoringSessionDto {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: EnvironmentKind;
  documentId: string;
  correlationId: string;
  iframeSrc: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export type PendingAuthoringAuthorizationDto = DashboardPendingAuthoringAuthorization;

export interface AuthoringAuthorizationResultDto {
  protocol: 'lodariq.authoring.activation.v1';
  type: 'authoring.authorization.result';
  requestId: string;
  state: string;
  authorizationCode: string;
  expiresAt: string;
}

export interface DashboardApiConfig {
  apiBaseUrl: string;
  devWorkspaceId?: string;
  devUserId?: string;
  useDevHeaderFallback: boolean;
}

export interface DashboardRequestAuthContext {
  authorization?: string;
  sessionToken?: string;
}

export class DashboardApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(
    statusCode: number,
    message: string,
    options: { code?: string; requestId?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'DashboardApiError';
    this.statusCode = statusCode;
    this.code = options.code ?? dashboardErrorCodeForStatus(statusCode);
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? (statusCode === 429 || statusCode >= 500);
  }
}

export function assertDashboardWorkspaceScope(
  expectedWorkspaceId: string,
  ...records: Array<{ workspaceId: string } | null | undefined>
): void {
  if (records.some((record) => record && record.workspaceId !== expectedWorkspaceId)) {
    throw new DashboardApiError(502, 'The workspace response could not be verified.', {
      code: 'workspace_scope_mismatch',
      retryable: false,
    });
  }
}

export async function loadDashboardData(expectedWorkspaceId?: string): Promise<DashboardDataDto> {
  const controlPlaneContext = await loadControlPlaneContext();
  const workspaceId = controlPlaneContext.workspaceId;
  if (expectedWorkspaceId && workspaceId !== expectedWorkspaceId) {
    throw new DashboardApiError(403, 'The active workspace could not be verified.', {
      code: 'workspace_scope_mismatch',
      retryable: false,
    });
  }
  const canReadCreatorResources = controlPlaneContext.role !== 'viewer';

  const [documents, environments, tokens, installations, themes] = await Promise.all([
    loadDashboardResource('documents', async () => {
      const result = validate(
        DashboardDocumentsResponseSchema,
        await controlPlaneFetch<unknown>('/v1/documents'),
      );
      if (!result.valid || !documentsMatchWorkspace(result.value.documents, workspaceId)) {
        throw invalidControlPlaneResponse('documents');
      }
      return result.value.documents as DocumentSummaryDto[];
    }),
    loadDashboardResource('environments', async () => {
      const result = validate(
        DashboardEnvironmentsResponseSchema,
        await controlPlaneFetch<unknown>('/v1/environments'),
      );
      if (!result.valid || !itemsMatchWorkspace(result.value.environments, workspaceId)) {
        throw invalidControlPlaneResponse('environments');
      }
      return result.value.environments as WorkspaceEnvironmentDto[];
    }),
    canReadCreatorResources
      ? loadDashboardResource('tokens', async () => {
          const result = validate(
            DashboardEnvironmentTokensResponseSchema,
            await controlPlaneFetch<unknown>('/v1/environment-tokens'),
          );
          if (!result.valid || !itemsMatchWorkspace(result.value.tokens, workspaceId)) {
            throw invalidControlPlaneResponse('tokens');
          }
          return result.value.tokens as EnvironmentTokenDto[];
        })
      : resolvedDashboardResource('tokens', [] as EnvironmentTokenDto[]),
    canReadCreatorResources
      ? loadDashboardResource('installations', async () => {
          const result = validate(
            DashboardSdkInstallationsResponseSchema,
            await controlPlaneFetch<unknown>('/v1/sdk-installations'),
          );
          if (
            !result.valid ||
            !installationsMatchWorkspace(result.value.installations, workspaceId)
          ) {
            throw invalidControlPlaneResponse('installations');
          }
          return result.value.installations as PublicSdkInstallationDto[];
        })
      : resolvedDashboardResource('installations', [] as PublicSdkInstallationDto[]),
    loadDashboardResource('themes', async () => {
      const result = validate(
        DashboardThemesResponseSchema,
        await controlPlaneFetch<unknown>('/v1/themes'),
      );
      if (!result.valid || !themesMatchWorkspace(result.value.themes, workspaceId)) {
        throw invalidControlPlaneResponse('themes');
      }
      return result.value.themes as WorkspaceThemeDto[];
    }),
  ]);

  const resources = [documents, environments, tokens, installations, themes] as const;

  return {
    controlPlaneContext,
    documents: documents.value,
    environments: environments.value,
    tokens: tokens.value,
    installations: installations.value,
    themes: themes.value,
    unavailableResources: resources.flatMap((resource) =>
      resource.available ? [] : [resource.name],
    ),
  };
}

export async function loadWorkspaceTheme(themeId: string): Promise<WorkspaceThemeDetailDto> {
  const value = await controlPlaneFetch<unknown>(`/v1/themes/${encodeURIComponent(themeId)}`);
  const result = validate(DashboardWorkspaceThemeDetailSchema, value);
  if (!result.valid || result.value.theme.id !== themeId) {
    throw invalidControlPlaneResponse('theme detail');
  }
  return result.value as WorkspaceThemeDetailDto;
}

export async function loadControlPlaneContext(): Promise<ControlPlaneAuthContext> {
  const result = validate(
    ControlPlaneAuthContextSchema,
    await controlPlaneFetch<unknown>('/v1/auth/context'),
  );
  if (!result.valid) throw invalidControlPlaneResponse('authentication context');
  return result.value;
}

export async function createWorkspaceTheme(input: {
  name: string;
  draft: BrandThemeDefinition;
}): Promise<{ theme: WorkspaceThemeDto }> {
  return validatedControlPlaneFetch(
    DashboardThemeMutationResponseSchema,
    '/v1/themes',
    { method: 'POST', body: JSON.stringify(input) },
    'theme mutation',
  );
}

export async function updateWorkspaceThemeDraft(input: {
  themeId: string;
  name?: string;
  draft: BrandThemeDefinition;
  expectedRevision: number;
  expectedUpdatedAt: string;
}): Promise<{ theme: WorkspaceThemeDto }> {
  const { themeId, ...body } = input;
  const response = await validatedControlPlaneFetch<{ theme: WorkspaceThemeDto }>(
    DashboardThemeMutationResponseSchema,
    `/v1/themes/${encodeURIComponent(themeId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'theme mutation',
  );
  if (response.theme.id !== themeId) throw invalidControlPlaneResponse('theme mutation');
  return response;
}

export async function approveWorkspaceTheme(input: {
  themeId: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
}): Promise<{ theme: WorkspaceThemeDto; approvedVersion: WorkspaceThemeVersionDto }> {
  const { themeId, ...body } = input;
  const response = await validatedControlPlaneFetch<{
    theme: WorkspaceThemeDto;
    approvedVersion: WorkspaceThemeVersionDto;
  }>(
    DashboardThemeApprovalResponseSchema,
    `/v1/themes/${encodeURIComponent(themeId)}/approve`,
    { method: 'POST', body: JSON.stringify(body) },
    'theme approval',
  );
  if (
    response.theme.id !== themeId ||
    response.approvedVersion.themeId !== themeId ||
    response.approvedVersion.workspaceId !== response.theme.workspaceId
  ) {
    throw invalidControlPlaneResponse('theme approval');
  }
  return response;
}

export async function setDefaultWorkspaceTheme(input: {
  themeId: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
}): Promise<{ theme: WorkspaceThemeDto }> {
  const { themeId, ...body } = input;
  const response = await validatedControlPlaneFetch<{ theme: WorkspaceThemeDto }>(
    DashboardThemeMutationResponseSchema,
    `/v1/themes/${encodeURIComponent(themeId)}/default`,
    { method: 'POST', body: JSON.stringify(body) },
    'theme mutation',
  );
  if (response.theme.id !== themeId) throw invalidControlPlaneResponse('theme mutation');
  return response;
}

export async function setDocumentThemeBinding(
  documentId: string,
  binding: ThemeBinding,
): Promise<{ document: unknown; latestArtifact: unknown }> {
  return controlPlaneFetch<{ document: unknown; latestArtifact: unknown }>(
    `/v1/documents/${encodeURIComponent(documentId)}/theme-binding`,
    { method: 'POST', body: JSON.stringify({ binding }) },
  );
}

export async function loadAuthSession(): Promise<AuthSessionSnapshot> {
  if (isDevelopmentHeaderAuthMode()) {
    const context = await loadControlPlaneContext();
    return {
      user: {
        id: context.userId,
        email: 'local-creator@lodariq.invalid',
        name: 'Local creator',
      },
      activeWorkspaceId: context.workspaceId,
      workspaces: [
        {
          id: context.workspaceId,
          name: 'Local workspace',
          role: context.role,
        },
      ],
    };
  }

  const snapshot = parseAuthSessionSnapshot(await controlPlaneFetch<unknown>('/v1/auth/session'));
  if (!snapshot) throw new DashboardApiError(502, 'Invalid auth session response.');
  return snapshot;
}

export async function loadWorkspaceEnvironments(
  expectedWorkspaceId?: string,
): Promise<WorkspaceEnvironmentDto[]> {
  const result = validate(
    DashboardEnvironmentsResponseSchema,
    await controlPlaneFetch<unknown>('/v1/environments'),
  );
  if (
    !result.valid ||
    (expectedWorkspaceId && !itemsMatchWorkspace(result.value.environments, expectedWorkspaceId))
  ) {
    throw invalidControlPlaneResponse('environments');
  }
  return result.value.environments as WorkspaceEnvironmentDto[];
}

export async function updateEnvironmentReleasePolicy(input: {
  environmentId: string;
  requiredApprovalCount: 0 | 1;
  expectedUpdatedAt: string;
}): Promise<{ environment: WorkspaceEnvironmentDto }> {
  const { environmentId, ...body } = input;
  const response = await validatedControlPlaneFetch<{ environment: WorkspaceEnvironmentDto }>(
    DashboardEnvironmentMutationResponseSchema,
    `/v1/environments/${encodeURIComponent(environmentId)}/release-policy`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'environment mutation',
  );
  if (response.environment.id !== environmentId) {
    throw invalidControlPlaneResponse('environment mutation');
  }
  return response;
}

export async function updateWorkspaceEnvironmentPolicy(input: {
  environmentId: string;
  name: string;
  originAllowlist: string[];
  enabled: boolean;
  pipelinePosition: 0 | 1 | 2;
  authoringEnabled: boolean;
  promotionSourceEnvironmentId?: string;
  releasePolicy: EnvironmentReleasePolicy;
  expectedUpdatedAt: string;
}): Promise<{ environment: WorkspaceEnvironmentDto }> {
  const { environmentId, ...body } = input;
  const response = await validatedControlPlaneFetch<{ environment: WorkspaceEnvironmentDto }>(
    DashboardEnvironmentMutationResponseSchema,
    `/v1/environments/${encodeURIComponent(environmentId)}/policy`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'environment mutation',
  );
  if (response.environment.id !== environmentId) {
    throw invalidControlPlaneResponse('environment mutation');
  }
  return response;
}

export async function loadPublicSdkInstallations(): Promise<PublicSdkInstallationDto[]> {
  const response = await validatedControlPlaneFetch<{
    installations: PublicSdkInstallationDto[];
  }>(DashboardSdkInstallationsResponseSchema, '/v1/sdk-installations', {}, 'SDK installations');
  return response.installations;
}

export async function createPublicSdkInstallation(
  name: string,
): Promise<CreatePublicSdkInstallationResponseDto> {
  return validatedControlPlaneFetch(
    DashboardPublicSdkInstallationCreateResponseSchema,
    '/v1/sdk-installations',
    { method: 'POST', body: JSON.stringify({ name }) },
    'SDK installation mutation',
  );
}

export async function syncPublicSdkInstallationOrigins(
  installationId: string,
  origins: readonly ConfigurePublicSdkInstallationOriginDto[],
): Promise<SyncPublicSdkInstallationOriginsResponseDto> {
  const response = await validatedControlPlaneFetch<SyncPublicSdkInstallationOriginsResponseDto>(
    DashboardPublicSdkInstallationOriginsResponseSchema,
    `/v1/sdk-installations/${encodeURIComponent(installationId)}/origins/sync`,
    { method: 'PUT', body: JSON.stringify({ origins }) },
    'SDK origin mutation',
  );
  if (response.origins.some((origin) => origin.installationId !== installationId)) {
    throw invalidControlPlaneResponse('SDK origin mutation');
  }
  return response;
}

export async function revokePublicSdkInstallation(
  installationId: string,
): Promise<RevokePublicSdkInstallationResponseDto> {
  const response = await validatedControlPlaneFetch<RevokePublicSdkInstallationResponseDto>(
    DashboardPublicSdkInstallationRevokeResponseSchema,
    `/v1/sdk-installations/${encodeURIComponent(installationId)}/revoke`,
    { method: 'POST' },
    'SDK installation mutation',
  );
  if (response.installation.installationId !== installationId) {
    throw invalidControlPlaneResponse('SDK installation mutation');
  }
  return response;
}

/**
 * Pause or resume delivery for one installation (ADR-0027).
 *
 * Unlike revoke this is reversible, which is the whole point: a customer who
 * suspects Lodariq of breaking their page can prove it either way in seconds
 * and undo it just as fast.
 */
export async function setPublicSdkInstallationSuspension(
  installationId: string,
  suspended: boolean,
): Promise<SuspendPublicSdkInstallationResponseDto> {
  const response = await validatedControlPlaneFetch<SuspendPublicSdkInstallationResponseDto>(
    DashboardPublicSdkInstallationRevokeResponseSchema,
    `/v1/sdk-installations/${encodeURIComponent(installationId)}/suspension`,
    { method: 'POST', body: JSON.stringify({ suspended }) },
    'SDK installation mutation',
  );
  if (response.installation.installationId !== installationId) {
    throw invalidControlPlaneResponse('SDK installation mutation');
  }
  return response;
}

export async function createEnvironmentToken(
  input: CreateEnvironmentTokenDto,
): Promise<CreateEnvironmentTokenResponseDto> {
  const response = await validatedControlPlaneFetch<CreateEnvironmentTokenResponseDto>(
    DashboardEnvironmentTokenCreateResponseSchema,
    '/v1/environment-tokens',
    { method: 'POST', body: JSON.stringify(input) },
    'environment token mutation',
  );
  if (response.token.environmentId !== input.environmentId) {
    throw invalidControlPlaneResponse('environment token mutation');
  }
  return response;
}

export async function revokeEnvironmentToken(
  tokenId: string,
): Promise<RevokeEnvironmentTokenResponseDto> {
  const response = await validatedControlPlaneFetch<RevokeEnvironmentTokenResponseDto>(
    DashboardEnvironmentTokenRevokeResponseSchema,
    `/v1/environment-tokens/${encodeURIComponent(tokenId)}/revoke`,
    { method: 'POST' },
    'environment token mutation',
  );
  if (response.token.id !== tokenId) {
    throw invalidControlPlaneResponse('environment token mutation');
  }
  return response;
}

export async function loadDocumentDebug(documentId: string): Promise<DocumentDebugDto> {
  const response = await validatedControlPlaneFetch<DocumentDebugDto>(
    DashboardDocumentDebugResponseSchema,
    `/v1/debug/documents/${encodeURIComponent(documentId)}`,
    {},
    'document support details',
  );
  if (
    (response.latestArtifact && response.latestArtifact.documentId !== documentId) ||
    response.versions.some((version) => version.documentId !== documentId)
  ) {
    throw invalidControlPlaneResponse('document support details');
  }
  return response;
}

export async function loadAnalyticsAggregates(
  environmentId: string,
): Promise<AnalyticsAggregateResponse> {
  const query = validate(AnalyticsEnvironmentQuerySchema, {
    environmentId,
    limit: DASHBOARD_ANALYTICS_AGGREGATE_LIMIT,
  });
  if (!query.valid) throw new DashboardApiError(400, 'Invalid analytics environment query.');

  const search = new URLSearchParams({
    environmentId: query.value.environmentId,
    limit: String(query.value.limit),
  });
  const value = await controlPlaneFetch<unknown>(`/v1/analytics/aggregate?${search.toString()}`);
  const response = validate(AnalyticsAggregateResponseSchema, value);
  if (
    !response.valid ||
    !analyticsAggregateResponseMatchesScope(response.value.aggregates, environmentId)
  ) {
    throw new DashboardApiError(502, 'Invalid analytics aggregate response.');
  }
  return response.value;
}

/**
 * Per-experience measurement. Deliberately separate from the workspace-wide
 * aggregate above: that answers "is the SDK healthy", this answers "did this
 * experience change anything", and merging them would make neither readable.
 */
export async function loadExperienceAnalytics(
  documentId: string,
  environmentId: string,
): Promise<ExperienceAnalytics> {
  const search = new URLSearchParams({ environmentId });
  return validatedControlPlaneFetch<ExperienceAnalytics>(
    ExperienceAnalyticsSchema,
    `/v1/documents/${encodeURIComponent(documentId)}/analytics?${search.toString()}`,
    {},
    'experience analytics',
  );
}

/**
 * The runs behind the funnel. Bounded here rather than in the panel so a busy
 * experience cannot make the dashboard request unbounded history.
 */
export const DASHBOARD_SESSION_LIMIT = 20;

export async function loadExperienceSessions(
  documentId: string,
  environmentId: string,
): Promise<ExperienceSessionsResponse> {
  const search = new URLSearchParams({
    environmentId,
    limit: String(DASHBOARD_SESSION_LIMIT),
  });
  return validatedControlPlaneFetch<ExperienceSessionsResponse>(
    ExperienceSessionsResponseSchema,
    `/v1/documents/${encodeURIComponent(documentId)}/sessions?${search.toString()}`,
    {},
    'experience sessions',
  );
}

export async function loadExperienceMeasurement(
  documentId: string,
): Promise<ExperienceMeasurementConfig> {
  return validatedControlPlaneFetch<ExperienceMeasurementConfig>(
    ExperienceMeasurementConfigSchema,
    `/v1/documents/${encodeURIComponent(documentId)}/measurement`,
    {},
    'experience measurement',
  );
}

export async function saveExperienceMeasurement(
  documentId: string,
  body: UpdateExperienceMeasurementBody,
): Promise<ExperienceMeasurementConfig> {
  return validatedControlPlaneFetch<ExperienceMeasurementConfig>(
    ExperienceMeasurementConfigSchema,
    `/v1/documents/${encodeURIComponent(documentId)}/measurement`,
    { method: 'PATCH', body: JSON.stringify(body) },
    'experience measurement',
  );
}

export async function loadDocumentExperiment(documentId: string): Promise<ExperimentResponse> {
  return validatedControlPlaneFetch<ExperimentResponse>(
    ExperimentResponseSchema,
    `/v1/documents/${encodeURIComponent(documentId)}/experiment`,
    {},
    'experiment',
  );
}

export async function saveDocumentExperiment(
  experimentId: string,
  body: UpdateExperimentBody,
): Promise<ExperimentResponse['experiment']> {
  const value = await controlPlaneFetch<{ experiment?: unknown }>(
    `/v1/experiments/${encodeURIComponent(experimentId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  const result = validate(ExperimentResponseSchema, { experiment: value.experiment, results: null });
  if (!result.valid) throw invalidControlPlaneResponse('experiment');
  return (result.value as ExperimentResponse).experiment;
}

export async function loadWorkspaceApplications(): Promise<readonly ApplicationSummary[]> {
  const response = await validatedControlPlaneFetch<{
    applications: readonly ApplicationSummary[];
  }>(WorkspaceApplicationsResponseSchema, '/v1/applications', {}, 'applications');
  return response.applications;
}

export async function saveWorkspaceApplication(
  body: UpsertWorkspaceApplicationBody,
): Promise<readonly ApplicationSummary[]> {
  await controlPlaneFetch<unknown>(`/v1/applications/${encodeURIComponent(body.id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return loadWorkspaceApplications();
}

export async function loadDocumentReleaseRecoveryState(input: {
  documentId: string;
  environmentId: string;
  workspaceId?: string;
}): Promise<ReleaseRecoveryStateResponse> {
  const value = await controlPlaneFetch<unknown>(
    `/v1/documents/${encodeURIComponent(input.documentId)}/environments/${encodeURIComponent(input.environmentId)}/release-recovery`,
  );
  const result = validate(ReleaseRecoveryStateResponseSchema, value);
  if (
    !result.valid ||
    result.value.documentId !== input.documentId ||
    result.value.environmentId !== input.environmentId ||
    !releaseRecoveryStateMatchesScope(result.value, {
      workspaceId: input.workspaceId ?? result.value.workspaceId,
      environmentId: input.environmentId,
      documentId: input.documentId,
    })
  ) {
    throw new DashboardApiError(502, 'Invalid release recovery state response.');
  }
  return result.value;
}

export async function recoverDocumentRelease(input: {
  documentId: string;
  environmentId: string;
  request: ReleaseRecoveryRequest;
}): Promise<ReleaseRecoveryResult> {
  const request = validate(ReleaseRecoveryRequestSchema, input.request);
  if (!request.valid) throw new DashboardApiError(400, 'Invalid release recovery request.');
  const response = await controlPlaneResponse(
    `/v1/documents/${encodeURIComponent(input.documentId)}/environments/${encodeURIComponent(input.environmentId)}/release-recovery`,
    { method: 'POST', body: JSON.stringify(request.value) },
  );
  const value = await readJsonResponse(response);
  const result = validate(ReleaseRecoveryResultSchema, value);
  if (
    !RECOVERY_RESULT_HTTP_STATUSES.has(response.status) ||
    !result.valid ||
    result.value.action !== request.value.action ||
    !releaseRecoveryResultMatchesHttpStatus(result.value, response.status)
  ) {
    throw new DashboardApiError(
      response.ok ? 502 : response.status,
      'Invalid release recovery result response.',
    );
  }
  return result.value;
}

export async function loadPendingAuthoringAuthorization(
  requestId: string,
): Promise<PendingAuthoringAuthorizationDto> {
  const response = await validatedControlPlaneFetch<PendingAuthoringAuthorizationDto>(
    DashboardPendingAuthoringAuthorizationSchema,
    `/v1/authoring/authorization-requests/${encodeURIComponent(requestId)}`,
    {},
    'authoring authorization',
  );
  if (response.requestId !== requestId)
    throw invalidControlPlaneResponse('authoring authorization');
  return response;
}

export async function approveAuthoringAuthorization(
  requestId: string,
  state: string,
): Promise<AuthoringAuthorizationResultDto> {
  const response = await validatedControlPlaneFetch<AuthoringAuthorizationResultDto>(
    AuthoringAuthorizationResultSchema,
    `/v1/authoring/authorization-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ state }),
    },
    'authoring authorization',
  );
  if (response.requestId !== requestId || response.state !== state) {
    throw invalidControlPlaneResponse('authoring authorization');
  }
  return response;
}

async function controlPlaneFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await controlPlaneResponse(path, init);

  if (!response.ok) {
    throw await dashboardApiErrorFromResponse(response);
  }

  return (await readJsonResponse(response)) as T;
}

async function validatedControlPlaneFetch<T>(
  schema: Parameters<typeof validate>[0],
  path: string,
  init: RequestInit,
  resource: string,
): Promise<T> {
  const result = validate(schema, await controlPlaneFetch<unknown>(path, init));
  if (!result.valid) throw invalidControlPlaneResponse(resource);
  return result.value as T;
}

interface DashboardResourceResult<T> {
  name: DashboardResourceName;
  available: boolean;
  value: T;
}

async function loadDashboardResource<T>(
  name: DashboardResourceName,
  load: () => Promise<T>,
): Promise<DashboardResourceResult<T>> {
  try {
    return { name, available: true, value: await load() };
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 401) throw error;
    return { name, available: false, value: [] as T };
  }
}

function resolvedDashboardResource<T>(
  name: DashboardResourceName,
  value: T,
): Promise<DashboardResourceResult<T>> {
  return Promise.resolve({ name, available: true, value });
}

function itemsMatchWorkspace(
  items: readonly { workspaceId: string }[],
  workspaceId: string,
): boolean {
  return items.every((item) => item.workspaceId === workspaceId);
}

function documentsMatchWorkspace(
  documents: readonly DocumentSummaryDto[],
  workspaceId: string,
): boolean {
  return documents.every(
    (document) =>
      document.workspaceId === workspaceId &&
      (document.deployments ?? []).every(
        (deployment) =>
          deployment.workspaceId === workspaceId && deployment.documentId === document.id,
      ),
  );
}

function installationsMatchWorkspace(
  installations: readonly PublicSdkInstallationDto[],
  workspaceId: string,
): boolean {
  return installations.every(
    (installation) =>
      installation.workspaceId === workspaceId &&
      installation.origins.every(
        (origin) =>
          origin.workspaceId === workspaceId &&
          origin.installationId === installation.installationId,
      ),
  );
}

function themesMatchWorkspace(themes: readonly WorkspaceThemeDto[], workspaceId: string): boolean {
  return themes.every(
    (theme) =>
      theme.workspaceId === workspaceId &&
      (!theme.activeVersion ||
        (theme.activeVersion.workspaceId === workspaceId &&
          theme.activeVersion.themeId === theme.id)),
  );
}

function invalidControlPlaneResponse(resource: string): DashboardApiError {
  return new DashboardApiError(502, `The ${resource} response could not be verified.`, {
    code: 'invalid_control_plane_response',
  });
}

const RECOVERY_RESULT_HTTP_STATUSES = new Set([200, 201, 403, 404, 409, 500]);
const RECOVERY_FAILURE_HTTP_STATUSES = new Map<ReleaseRecoveryFailureCode, number>([
  ['capability_denied', 403],
  ['document_not_found', 404],
  ['internal_error', 500],
]);

function releaseRecoveryResultMatchesHttpStatus(
  result: ReleaseRecoveryResult,
  status: number,
): boolean {
  if (result.ok) return status === (result.replayed ? 200 : 201);
  return status === (RECOVERY_FAILURE_HTTP_STATUSES.get(result.code) ?? 409);
}

function analyticsAggregateResponseMatchesScope(
  aggregates: readonly AnalyticsEventAggregate[],
  environmentId: string,
): boolean {
  const workspaceId = aggregates[0]?.workspaceId;
  return aggregates.every(
    (aggregate) =>
      aggregate.environmentId === environmentId &&
      aggregate.workspaceId === workspaceId &&
      Date.parse(aggregate.firstTimestamp) <= Date.parse(aggregate.lastTimestamp),
  );
}

async function controlPlaneResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const config = readDashboardApiConfig();
  const requestAuth = await readRequestAuthContext();
  const apiBaseUrl = new URL(config.apiBaseUrl);
  const url = new URL(path, apiBaseUrl);
  if (url.origin !== apiBaseUrl.origin || !path.startsWith('/')) {
    throw new DashboardApiError(500, 'The control-plane request target is invalid.', {
      code: 'invalid_control_plane_target',
      retryable: false,
    });
  }
  const timeoutSignal = AbortSignal.timeout(DASHBOARD_API_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal,
      headers: buildDashboardApiHeaders(config, requestAuth, init.headers, Boolean(init.body)),
    });
  } catch (error) {
    if (error instanceof DashboardApiError) throw error;
    const timedOut = timeoutSignal.aborted && !init.signal?.aborted;
    throw new DashboardApiError(
      timedOut ? 504 : 503,
      timedOut
        ? 'The control plane did not respond in time.'
        : 'The control plane is temporarily unavailable.',
      { code: timedOut ? 'control_plane_timeout' : 'control_plane_unavailable' },
    );
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new DashboardApiError(
      response.ok ? 502 : response.status,
      'The control-plane response was not valid JSON.',
      { code: 'invalid_control_plane_response' },
    );
  }
  try {
    return await response.json();
  } catch {
    throw new DashboardApiError(
      response.ok ? 502 : response.status,
      'The control-plane response was not valid JSON.',
    );
  }
}

const DASHBOARD_API_TIMEOUT_MS = 15_000;
const SAFE_API_ERROR_CODE = /^[a-z][a-z0-9_]{0,119}$/u;

async function dashboardApiErrorFromResponse(response: Response): Promise<DashboardApiError> {
  let code = dashboardErrorCodeForStatus(response.status);
  const requestId = response.headers.get('x-request-id')?.slice(0, 256) || undefined;
  try {
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('application/json')) {
      const body = (await response.json()) as unknown;
      if (body && typeof body === 'object' && 'error' in body) {
        const candidate = (body as { error?: unknown }).error;
        if (typeof candidate === 'string' && SAFE_API_ERROR_CODE.test(candidate)) code = candidate;
      }
    }
  } catch {
    // The response status remains authoritative when an error body is malformed.
  }
  return new DashboardApiError(response.status, dashboardErrorMessageForStatus(response.status), {
    code,
    requestId,
  });
}

function dashboardErrorCodeForStatus(statusCode: number): string {
  if (statusCode === 400) return 'invalid_request';
  if (statusCode === 401) return 'authentication_required';
  if (statusCode === 403) return 'capability_denied';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 409) return 'conflict';
  if (statusCode === 429) return 'rate_limited';
  return statusCode >= 500 ? 'control_plane_unavailable' : 'request_failed';
}

function dashboardErrorMessageForStatus(statusCode: number): string {
  if (statusCode === 400) return 'The request was invalid.';
  if (statusCode === 401) return 'Sign in again to continue.';
  if (statusCode === 403) return 'Your workspace role does not allow this action.';
  if (statusCode === 404) return 'The requested workspace record was not found.';
  if (statusCode === 409) return 'The record changed in another session. Refresh and try again.';
  if (statusCode === 429) return 'Too many requests. Wait briefly and try again.';
  return 'The control plane is temporarily unavailable.';
}

function readDashboardApiConfig(): DashboardApiConfig {
  return {
    apiBaseUrl: process.env.LODARIQ_API_BASE_URL ?? 'http://127.0.0.1:3001',
    devWorkspaceId: process.env.LODARIQ_WORKSPACE_ID ?? 'wk_local_dev',
    devUserId: process.env.LODARIQ_DASHBOARD_USER_ID ?? 'user_local_dev',
    useDevHeaderFallback: process.env.NODE_ENV !== 'production',
  };
}

export function buildDashboardApiHeaders(
  config: DashboardApiConfig,
  requestAuth: DashboardRequestAuthContext,
  initHeaders?: HeadersInit,
  hasJsonBody = false,
): Headers {
  const headers = new Headers(initHeaders);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  if (hasJsonBody && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!headers.has('x-request-id')) headers.set('x-request-id', crypto.randomUUID());

  if (!headers.has('authorization') && requestAuth.authorization) {
    headers.set('authorization', requestAuth.authorization);
  }

  if (!headers.has('authorization') && requestAuth.sessionToken) {
    headers.set('authorization', `Bearer ${requestAuth.sessionToken}`);
  }

  if (
    !headers.has('authorization') &&
    config.useDevHeaderFallback &&
    config.devWorkspaceId &&
    config.devUserId
  ) {
    headers.set('x-lodariq-workspace-id', config.devWorkspaceId);
    headers.set('x-lodariq-user-id', config.devUserId);
  }

  return headers;
}

async function readRequestAuthContext(): Promise<DashboardRequestAuthContext> {
  try {
    const nextHeaders = await import('next/headers');
    const [requestHeaders, requestCookies] = await Promise.all([
      nextHeaders.headers(),
      nextHeaders.cookies(),
    ]);
    const authorization = requestHeaders.get('authorization')?.trim();
    const sessionToken = requestCookies.get(dashboardSessionCookieName())?.value.trim();
    return {
      ...(authorization ? { authorization } : {}),
      ...(sessionToken ? { sessionToken } : {}),
    };
  } catch {
    return {};
  }
}
