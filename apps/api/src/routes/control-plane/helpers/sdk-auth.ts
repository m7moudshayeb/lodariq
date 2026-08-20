import {
  AUTHORING_ACTIVATION_GRANT_HEADER,
  AUTHORING_SESSION_HEADER,
  LODARIQ_EDITOR_ORIGIN,
  LODARIQ_STAGING_EDITOR_ORIGIN,
  LODARIQ_APP_ORIGIN,
  LODARIQ_AUTHORING_ACTIVATION_URL,
  LODARIQ_STAGING_APP_ORIGIN,
  LODARIQ_STAGING_AUTHORING_ACTIVATION_URL,
} from '@lodariq/schema';
import {
  hashAuthoringSessionToken,
  hashEnvironmentToken,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type ResolvedPublicSdkInstallation,
  type ResolvedEnvironmentToken,
} from '@lodariq/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseExactBrowserOrigin } from '../../../sdk-origin';
import {
  PUBLIC_SDK_INSTALLATION_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  RELEASE_CORRELATION_ID_HEADER,
} from '../support';
import { setAllowedSdkCorsHeaders } from './sdk-cors';

export async function authenticateAuthoringSessionForToken(
  repository: ControlPlaneRepository,
  environmentToken: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthoringSessionRecord | null> {
  const sessionToken = readHeader(request, AUTHORING_SESSION_HEADER);
  if (!sessionToken) {
    await reply.code(401).send({
      error: 'authoring_session_required',
      message: 'A valid authoring session is required for SDK authoring',
    });
    return null;
  }

  const session = await repository.resolveAuthoringSession(
    environmentToken.workspaceId,
    hashAuthoringSessionToken(sessionToken),
  );
  if (!session) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Authoring session is invalid, expired, or revoked',
    });
    return null;
  }

  const matchesToken =
    session.workspaceId === environmentToken.workspaceId &&
    session.environmentId === environmentToken.environmentId &&
    session.environment === environmentToken.environment &&
    environmentToken.environment !== 'production';

  if (!matchesToken) {
    await reply.code(403).send({
      error: 'authoring_session_mismatch',
      message: 'Authoring session does not match the SDK environment',
    });
    return null;
  }

  return session;
}

export async function authenticateEnvironmentToken(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ResolvedEnvironmentToken | null> {
  const bearerToken = readBearerToken(request);
  if (!bearerToken) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Environment token bearer authorization is required',
    });
    return null;
  }

  const token = await repository.resolveEnvironmentToken(hashEnvironmentToken(bearerToken));
  if (!token) {
    await reply.code(401).send({
      error: 'unauthorized',
      message: 'Environment token is invalid or revoked',
    });
    return null;
  }

  return token;
}

export function readBearerToken(request: FastifyRequest): string | null {
  const raw = request.headers.authorization;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  const token = match?.[1]?.trim();
  return token || null;
}

export function readHeader(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export interface SdkDeliveryScope {
  workspaceId: string;
  environmentId: string;
}

export interface SdkDocumentPathParams extends SdkDeliveryScope {
  documentId: string;
}

export interface SdkDocumentArtifactPathParams extends SdkDocumentPathParams {
  contentHash: string;
}

export function requireSdkDeliveryPathScope(
  scope: SdkDeliveryScope,
  params: SdkDocumentPathParams,
  reply: FastifyReply,
): boolean {
  if (scope.workspaceId === params.workspaceId && scope.environmentId === params.environmentId) {
    return true;
  }
  reply.code(403).send({
    error: 'delivery_scope_mismatch',
    message: 'The requested delivery path does not match the resolved SDK scope',
  });
  return false;
}

export async function resolveSdkDeliveryScope(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SdkDeliveryScope | null> {
  if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
    const resolved = await resolvePublicSdkRequest(repository, request, reply);
    return resolved
      ? {
          workspaceId: resolved.installation.workspaceId,
          environmentId: resolved.environment.id,
        }
      : null;
  }

  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token || !requireSdkOrigin(token, request, reply)) return null;
  return { workspaceId: token.workspaceId, environmentId: token.environmentId };
}

export async function resolvePublicSdkRequest(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<ResolvedPublicSdkInstallation | null> {
  const installationId = readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER);
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (!installationId || !exactOrigin) {
    await reply.code(400).send({
      error: 'public_sdk_scope_required',
      message: 'Public SDK requests require an installation ID and canonical browser Origin',
    });
    return null;
  }

  const resolved = await repository.resolvePublicSdkInstallation(installationId, exactOrigin);
  if (!resolved) {
    await reply.code(403).send({
      error: 'installation_origin_forbidden',
      message: 'Installation is not configured for this Origin',
    });
    return null;
  }
  setAllowedSdkCorsHeaders(exactOrigin, reply);
  return resolved;
}

export async function requirePublicAuthoringScope(
  repository: ControlPlaneRepository,
  installationId: string,
  exactOrigin: string,
  reply: FastifyReply,
): Promise<ResolvedPublicSdkInstallation | null> {
  const resolved = await repository.resolvePublicSdkInstallation(installationId, exactOrigin);
  const canAuthor =
    resolved?.authoringEnabled === true && resolved.environment.kind !== 'production';
  if (!resolved || !canAuthor) {
    await reply.code(403).send({
      error: 'authoring_origin_forbidden',
      message: 'Authoring is not enabled for this installation and Origin',
    });
    return null;
  }
  return resolved;
}

export function requireSdkOrigin(
  token: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  if (token.originAllowlist.includes(origin)) {
    setAllowedSdkCorsHeaders(origin, reply);
    return true;
  }

  void reply.code(403).send({
    error: 'origin_forbidden',
    message: 'Origin is not allowed for this Lodariq environment token',
  });
  return false;
}

export function requireDirectSdkAuthoringOrigin(
  token: ResolvedEnvironmentToken,
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (exactOrigin && token.originAllowlist.includes(exactOrigin)) {
    setAllowedSdkCorsHeaders(exactOrigin, reply);
    return true;
  }

  void reply.code(403).send({
    error: 'authoring_origin_forbidden',
    message: 'SDK authoring requires an exact allowlisted browser Origin',
  });
  return false;
}

export function requireExpectedFirstPartyAppOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedOrigin: string,
): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  const exactOrigin = parseExactBrowserOrigin(origin);
  if (exactOrigin === expectedOrigin) {
    reply.header('access-control-allow-origin', exactOrigin);
    reply.header('vary', 'Origin');
    reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
    reply.header('access-control-allow-headers', 'authorization,content-type');
    reply.header('access-control-max-age', '600');
    return true;
  }

  void reply.code(403).send({
    error: 'origin_forbidden',
    message: 'Authoring approval is available only from the Lodariq app origin',
  });
  return false;
}

export function requireExpectedEditorOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedOrigin: string,
): boolean {
  const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
  if (exactOrigin === expectedOrigin) {
    setExpectedEditorCorsHeaders(reply, expectedOrigin);
    return true;
  }

  void reply.code(403).send({
    error: 'editor_origin_forbidden',
    message: 'Activation-grant sessions are available only to the hosted Lodariq editor',
  });
  return false;
}

export function setExpectedEditorCorsHeaders(reply: FastifyReply, expectedOrigin: string): void {
  reply.header('access-control-allow-origin', expectedOrigin);
  reply.header('vary', 'Origin');
  reply.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  reply.header(
    'access-control-allow-headers',
    `content-type,${AUTHORING_ACTIVATION_GRANT_HEADER},${AUTHORING_SESSION_HEADER},${IDEMPOTENCY_KEY_HEADER},${RELEASE_CORRELATION_ID_HEADER}`,
  );
  reply.header('access-control-max-age', '600');
}

export function setCredentialResponseHeaders(reply: FastifyReply): void {
  reply.header('cache-control', 'no-store');
  reply.header('pragma', 'no-cache');
}

export function isExactEditorIframeSource(value: string): boolean {
  return (
    isExpectedEditorIframeSource(value, LODARIQ_EDITOR_ORIGIN) ||
    isExpectedEditorIframeSource(value, LODARIQ_STAGING_EDITOR_ORIGIN)
  );
}

export function isExpectedEditorIframeSource(value: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === expectedOrigin && !url.username && !url.password && !url.search && !url.hash
    );
  } catch {
    return false;
  }
}

export function deploymentOriginsForApiBaseUrl(publicApiBaseUrl: string): {
  activation:
    typeof LODARIQ_AUTHORING_ACTIVATION_URL | typeof LODARIQ_STAGING_AUTHORING_ACTIVATION_URL;
  app: typeof LODARIQ_APP_ORIGIN | typeof LODARIQ_STAGING_APP_ORIGIN;
  editor: typeof LODARIQ_EDITOR_ORIGIN | typeof LODARIQ_STAGING_EDITOR_ORIGIN;
} {
  const apiOrigin = new URL(publicApiBaseUrl).origin;
  if (apiOrigin === 'https://staging-api.lodariq.io') {
    return {
      activation: LODARIQ_STAGING_AUTHORING_ACTIVATION_URL,
      app: LODARIQ_STAGING_APP_ORIGIN,
      editor: LODARIQ_STAGING_EDITOR_ORIGIN,
    };
  }
  return {
    activation: LODARIQ_AUTHORING_ACTIVATION_URL,
    app: LODARIQ_APP_ORIGIN,
    editor: LODARIQ_EDITOR_ORIGIN,
  };
}
