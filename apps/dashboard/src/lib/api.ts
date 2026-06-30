import 'server-only';

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
  publications: DocumentPublicationDto[];
}

export interface DocumentPublicationDto {
  environmentId: string;
  environment: EnvironmentKind;
  contentHash: string;
  publishedAt: string;
}

export interface WorkspaceEnvironmentDto {
  id: string;
  workspaceId: string;
  kind: EnvironmentKind;
  name: string;
  originAllowlist: string[];
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

export interface DashboardDataDto {
  documents: DocumentSummaryDto[];
  environments: WorkspaceEnvironmentDto[];
  tokens: EnvironmentTokenDto[];
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
  authoringDocumentId?: string;
}

export interface CreateEnvironmentTokenResponseDto {
  token: EnvironmentTokenDto;
  clientToken: string;
  sdkSnippet: string;
  authoringSession?: AuthoringSessionDto;
  authoringSessionToken?: string;
  bootstrapHeaderName?: string;
  authoringSdkSnippet?: string;
}

export interface RevokeEnvironmentTokenResponseDto {
  token: EnvironmentTokenDto;
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
  const [documents, environments, tokens] = await Promise.all([
    controlPlaneFetch<{ documents: DocumentSummaryDto[] }>('/v1/documents'),
    controlPlaneFetch<{ environments: WorkspaceEnvironmentDto[] }>('/v1/environments'),
    controlPlaneFetch<{ tokens: EnvironmentTokenDto[] }>('/v1/environment-tokens'),
  ]);

  return {
    documents: documents.documents,
    environments: environments.environments,
    tokens: tokens.tokens,
  };
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

  if (!headers.has('cookie') && requestAuth.sessionToken) {
    headers.set('cookie', `__session=${encodeURIComponent(requestAuth.sessionToken)}`);
  }

  if (
    !headers.has('authorization') &&
    !headers.has('cookie') &&
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
    const sessionToken = requestCookies.get('__session')?.value.trim();
    return {
      ...(authorization ? { authorization } : {}),
      ...(sessionToken ? { sessionToken } : {}),
    };
  } catch {
    return {};
  }
}
