import 'server-only';
import type {
  BrandThemeDefinition,
  BrandThemeSnapshot,
  ControlPlaneAuthContext,
  DocumentDeployment,
  ProductStyleSource,
  ThemeBinding,
} from '@lodariq/schema';
import {
  dashboardSessionCookieName,
  isDevelopmentHeaderAuthMode,
  parseAuthSessionSnapshot,
  type AuthSessionSnapshot,
} from './auth-contract';

export type EnvironmentKind = 'development' | 'staging' | 'production';

export interface DocumentSummaryDto {
  id: string;
  workspaceId: string;
  type: string;
  status: string;
  title: string;
  schemaVersion: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  latestContentHash?: string;
  latestCompiledArtifactId?: string;
  publishReadinessIssues: PublishReadinessIssueDto[];
  publications: DocumentPublicationDto[];
  deployments?: DocumentDeployment[];
}

export interface PublishReadinessIssueDto {
  code: string;
  blockId?: string;
  targetId?: string;
  label: string;
  message: string;
}

export interface DocumentPublicationDto {
  id?: string;
  publicationId?: string;
  environmentId: string;
  environment: EnvironmentKind;
  contentHash: string;
  publishedAt: string;
  compiledArtifactId?: string;
  action?: 'publish' | 'promote' | 'rollback' | null;
  sourcePublicationId?: string | null;
  previousPublicationId?: string | null;
  releaseOperationId?: string | null;
  active?: boolean;
  generation?: number;
  rendererContractVersion?: string;
  themeVersionId?: string;
  themeContentHash?: string;
  verification?:
    | { status: 'not-run' }
    | {
        status: 'passed' | 'failed';
        result: 'passed' | 'failed';
        verificationId: string;
        verifiedAt: string;
        createdAt: string;
      };
}

export interface WorkspaceEnvironmentDto {
  id: string;
  workspaceId: string;
  kind: EnvironmentKind;
  name: string;
  originAllowlist: string[];
  requiredApprovalCount?: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentTokenDto {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: EnvironmentKind;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface PublicSdkInstallationOriginDto {
  installationId: string;
  workspaceId: string;
  environmentId: string;
  exactOrigin: string;
  authoringEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSdkInstallationDto {
  installationId: string;
  workspaceId: string;
  name: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  origins: PublicSdkInstallationOriginDto[];
  sdkSnippet: string;
}

export interface WorkspaceThemeVersionDto {
  id: string;
  workspaceId: string;
  themeId: string;
  version: number;
  schemaVersion: BrandThemeSnapshot['schemaVersion'];
  contractVersion: BrandThemeSnapshot['contractVersion'];
  snapshot: BrandThemeSnapshot;
  contentHash: string;
  approvedByUserId: string | null;
  approvedAt: string;
  createdAt: string;
}

export interface WorkspaceThemeDto {
  id: string;
  workspaceId: string;
  name: string;
  draft: BrandThemeDefinition;
  revision: number;
  isDefault: boolean;
  activeVersionId: string | null;
  activeVersion: WorkspaceThemeVersionDto | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  latestStyleSource?: WorkspaceThemeStyleSourceDto | null;
}

export type WorkspaceThemeStyleSourceDto = ProductStyleSource & {
  recordId: string;
  sourceHash: string;
  environmentId: string;
  recordedAt: string;
};

export interface WorkspaceThemeImpactDto {
  documentId: string;
  title: string;
  status: string;
  bindingPolicy: 'workspace-current' | 'pinned' | 'legacy';
  acknowledgedThemeVersionId: string | null;
  pinnedThemeVersionId: string | null;
  latestArtifactThemeVersionId: string | null;
  activeEnvironmentIds: string[];
}

export interface WorkspaceThemeDetailDto {
  theme: WorkspaceThemeDto;
  versions: WorkspaceThemeVersionDto[];
  impact: WorkspaceThemeImpactDto[];
}

export interface DashboardDataDto {
  controlPlaneContext: ControlPlaneAuthContext | null;
  documents: DocumentSummaryDto[];
  environments: WorkspaceEnvironmentDto[];
  tokens: EnvironmentTokenDto[];
  installations: PublicSdkInstallationDto[];
  themes: WorkspaceThemeDto[];
}

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

export interface PendingAuthoringAuthorizationDto {
  requestId: string;
  status: 'pending';
  installationId: string;
  environmentId: string;
  environment: 'development' | 'staging';
  customerOrigin: string;
  requestedCapabilities: string[];
  documentIntent?:
    { kind: 'existing'; documentId: string } | { kind: 'new-draft'; documentType: 'tour' };
  expiresAt: string;
}

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

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'DashboardApiError';
    this.statusCode = statusCode;
  }
}

export async function loadDashboardData(): Promise<DashboardDataDto> {
  const [controlPlaneContext, documents, environments, tokens, installations, themes] =
    await Promise.all([
      controlPlaneFetch<ControlPlaneAuthContext>('/v1/auth/context'),
      controlPlaneFetch<{ documents: DocumentSummaryDto[] }>('/v1/documents'),
      controlPlaneFetch<{ environments: WorkspaceEnvironmentDto[] }>('/v1/environments'),
      controlPlaneFetch<{ tokens: EnvironmentTokenDto[] }>('/v1/environment-tokens'),
      controlPlaneFetch<{ installations: PublicSdkInstallationDto[] }>('/v1/sdk-installations'),
      controlPlaneFetch<{ themes: WorkspaceThemeDto[] }>('/v1/themes'),
    ]);

  return {
    controlPlaneContext,
    documents: documents.documents,
    environments: environments.environments,
    tokens: tokens.tokens,
    installations: installations.installations,
    themes: themes.themes,
  };
}

export async function loadWorkspaceTheme(themeId: string): Promise<WorkspaceThemeDetailDto> {
  return controlPlaneFetch<WorkspaceThemeDetailDto>(`/v1/themes/${encodeURIComponent(themeId)}`);
}

export async function createWorkspaceTheme(input: {
  name: string;
  draft: BrandThemeDefinition;
}): Promise<{ theme: WorkspaceThemeDto }> {
  return controlPlaneFetch<{ theme: WorkspaceThemeDto }>('/v1/themes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateWorkspaceThemeDraft(input: {
  themeId: string;
  name?: string;
  draft: BrandThemeDefinition;
  expectedRevision: number;
  expectedUpdatedAt: string;
}): Promise<{ theme: WorkspaceThemeDto }> {
  const { themeId, ...body } = input;
  return controlPlaneFetch<{ theme: WorkspaceThemeDto }>(
    `/v1/themes/${encodeURIComponent(themeId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function approveWorkspaceTheme(input: {
  themeId: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
}): Promise<{ theme: WorkspaceThemeDto; approvedVersion: WorkspaceThemeVersionDto }> {
  const { themeId, ...body } = input;
  return controlPlaneFetch<{
    theme: WorkspaceThemeDto;
    approvedVersion: WorkspaceThemeVersionDto;
  }>(`/v1/themes/${encodeURIComponent(themeId)}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function setDefaultWorkspaceTheme(input: {
  themeId: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
}): Promise<{ theme: WorkspaceThemeDto }> {
  const { themeId, ...body } = input;
  return controlPlaneFetch<{ theme: WorkspaceThemeDto }>(
    `/v1/themes/${encodeURIComponent(themeId)}/default`,
    { method: 'POST', body: JSON.stringify(body) },
  );
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
    const context = await controlPlaneFetch<ControlPlaneAuthContext>('/v1/auth/context');
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

export async function loadWorkspaceEnvironments(): Promise<WorkspaceEnvironmentDto[]> {
  const response = await controlPlaneFetch<{ environments: WorkspaceEnvironmentDto[] }>(
    '/v1/environments',
  );
  return response.environments;
}

export async function updateEnvironmentReleasePolicy(input: {
  environmentId: string;
  requiredApprovalCount: 0 | 1;
  expectedUpdatedAt: string;
}): Promise<{ environment: WorkspaceEnvironmentDto }> {
  const { environmentId, ...body } = input;
  return controlPlaneFetch<{ environment: WorkspaceEnvironmentDto }>(
    `/v1/environments/${encodeURIComponent(environmentId)}/release-policy`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function loadPublicSdkInstallations(): Promise<PublicSdkInstallationDto[]> {
  const response = await controlPlaneFetch<{ installations: PublicSdkInstallationDto[] }>(
    '/v1/sdk-installations',
  );
  return response.installations;
}

export async function createPublicSdkInstallation(
  name: string,
): Promise<CreatePublicSdkInstallationResponseDto> {
  return controlPlaneFetch<CreatePublicSdkInstallationResponseDto>('/v1/sdk-installations', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function syncPublicSdkInstallationOrigins(
  installationId: string,
  origins: readonly ConfigurePublicSdkInstallationOriginDto[],
): Promise<SyncPublicSdkInstallationOriginsResponseDto> {
  return controlPlaneFetch<SyncPublicSdkInstallationOriginsResponseDto>(
    `/v1/sdk-installations/${encodeURIComponent(installationId)}/origins/sync`,
    { method: 'PUT', body: JSON.stringify({ origins }) },
  );
}

export async function revokePublicSdkInstallation(
  installationId: string,
): Promise<RevokePublicSdkInstallationResponseDto> {
  return controlPlaneFetch<RevokePublicSdkInstallationResponseDto>(
    `/v1/sdk-installations/${encodeURIComponent(installationId)}/revoke`,
    { method: 'POST' },
  );
}

export async function createEnvironmentToken(
  input: CreateEnvironmentTokenDto,
): Promise<CreateEnvironmentTokenResponseDto> {
  return controlPlaneFetch<CreateEnvironmentTokenResponseDto>('/v1/environment-tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function revokeEnvironmentToken(
  tokenId: string,
): Promise<RevokeEnvironmentTokenResponseDto> {
  return controlPlaneFetch<RevokeEnvironmentTokenResponseDto>(
    `/v1/environment-tokens/${encodeURIComponent(tokenId)}/revoke`,
    { method: 'POST' },
  );
}

export async function loadDocumentDebug(documentId: string): Promise<DocumentDebugDto> {
  return controlPlaneFetch<DocumentDebugDto>(
    `/v1/debug/documents/${encodeURIComponent(documentId)}`,
  );
}

export async function loadPendingAuthoringAuthorization(
  requestId: string,
): Promise<PendingAuthoringAuthorizationDto> {
  return controlPlaneFetch<PendingAuthoringAuthorizationDto>(
    `/v1/authoring/authorization-requests/${encodeURIComponent(requestId)}`,
  );
}

export async function approveAuthoringAuthorization(
  requestId: string,
  state: string,
): Promise<AuthoringAuthorizationResultDto> {
  return controlPlaneFetch<AuthoringAuthorizationResultDto>(
    `/v1/authoring/authorization-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ state }),
    },
  );
}

async function controlPlaneFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = readDashboardApiConfig();
  const requestAuth = await readRequestAuthContext();
  const response = await fetch(new URL(path, config.apiBaseUrl), {
    ...init,
    cache: 'no-store',
    headers: buildDashboardApiHeaders(config, requestAuth, init.headers, Boolean(init.body)),
  });

  if (!response.ok) {
    throw new DashboardApiError(response.status, await response.text());
  }

  return (await response.json()) as T;
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
  if (hasJsonBody && !headers.has('content-type')) headers.set('content-type', 'application/json');

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
