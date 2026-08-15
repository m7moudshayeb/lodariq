import { ControlPlaneAuthContext, LODARIQ_EDITOR_ORIGIN } from '@lodariq/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseExactBrowserOrigin } from '../../sdk-origin';
import { authenticate } from '../control-plane-access';
import {
  DASHBOARD_RELEASE_RECOVERY_PATH,
  DIRECT_RELEASE_RECOVERY_PATH,
  HOSTED_RELEASE_RECOVERY_PATH,
  HOSTED_AUTHORING_TRANSLATION_PATH,
  SDK_DOCUMENT_ARTIFACT_PATH,
  SDK_DOCUMENT_MANIFEST_PATH,
  SDK_DOCUMENT_PATH,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import { createObservabilityEvent } from '../../observability';
import {
  deploymentOriginsForApiBaseUrl,
  requireExpectedFirstPartyAppOrigin,
  requireExpectedEditorOrigin,
  setExpectedEditorCorsHeaders,
  setSdkPreflightCorsHeaders,
} from './helpers';

export function registerHealthAndCorsRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const requireFirstPartyAppOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedFirstPartyAppOrigin(request, reply, deploymentOrigins.app);
  const requireEditorOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor);
  const setEditorCorsHeaders = (reply: FastifyReply): void =>
    setExpectedEditorCorsHeaders(reply, deploymentOrigins.editor);

  fastify.get('/healthz', async () => ({ ok: true }));

  fastify.get('/readyz', async (_request, reply) => {
    try {
      const clockStartedAt = Date.now();
      await options.repository.checkReadiness();
      const databaseTime = Date.parse(await options.repository.readDatabaseTime());
      const clockFinishedAt = Date.now();
      const midpoint = clockStartedAt + Math.floor((clockFinishedAt - clockStartedAt) / 2);
      const skewMs = Math.abs(databaseTime - midpoint);
      if (!Number.isFinite(skewMs) || skewMs > 30_000) {
        options.observability.emit(
          createObservabilityEvent({
            name: 'auth.clock.skew_detected',
            attributes: { skewMs: Number.isFinite(skewMs) ? skewMs : 'invalid' },
          }),
        );
        return reply.code(503).send({ ok: false });
      }
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  fastify.get(
    '/v1/auth/context',
    { schema: { response: { 200: ControlPlaneAuthContext } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      return {
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        role: auth.role,
      };
    },
  );

  for (const path of [
    '/v1/sdk/bootstrap',
    '/v1/sdk/current-document',
    SDK_DOCUMENT_PATH,
    SDK_DOCUMENT_MANIFEST_PATH,
    SDK_DOCUMENT_ARTIFACT_PATH,
    '/v1/sdk/events',
    '/v1/sdk/authoring/authorization-requests',
    '/v1/sdk/authoring/exchange',
    '/v1/sdk/authoring/document',
    '/v1/sdk/authoring/release-state',
    DIRECT_RELEASE_RECOVERY_PATH,
    '/v1/sdk/authoring/publications',
    '/v1/sdk/authoring/brand-drift',
    '/v1/sdk/authoring/brand-theme-acknowledgement',
    '/v1/sdk/authoring/style-sources',
    '/v1/sdk/authoring/verifications',
    '/v1/sdk/authoring/promotions',
    '/v1/sdk/authoring/release-operations/:operationId/approvals',
  ]) {
    fastify.options(path, async (request, reply) => {
      setSdkPreflightCorsHeaders(request, reply);
      return reply.code(204).send();
    });
  }

  for (const path of [
    '/v1/authoring/authorization-requests/:requestId',
    '/v1/authoring/authorization-requests/:requestId/approve',
  ]) {
    fastify.options(path, async (request, reply) => {
      if (!requireFirstPartyAppOrigin(request, reply)) return;
      return reply.code(204).send();
    });
  }

  fastify.options('/v1/authoring/sessions', async (request, reply) => {
    if (parseExactBrowserOrigin(request.headers.origin) === LODARIQ_EDITOR_ORIGIN) {
      setEditorCorsHeaders(reply);
      return reply.code(204).send();
    }
    if (!requireFirstPartyAppOrigin(request, reply)) return;
    return reply.code(204).send();
  });

  for (const path of [
    '/v1/authoring/document',
    '/v1/authoring/resources',
    '/v1/authoring/media-assets',
    '/v1/authoring/media-assets/:assetId',
    HOSTED_AUTHORING_TRANSLATION_PATH,
    '/v1/authoring/documents/query',
    '/v1/authoring/activation/revoke',
    '/v1/authoring/release-state',
    HOSTED_RELEASE_RECOVERY_PATH,
    '/v1/authoring/publications',
    '/v1/authoring/brand-drift',
    '/v1/authoring/brand-theme-acknowledgement',
    '/v1/authoring/style-sources',
    '/v1/authoring/verifications',
    '/v1/authoring/promotions',
    '/v1/authoring/release-operations/:operationId/approvals',
    '/v1/authoring/sessions/:sessionId/revoke',
  ]) {
    fastify.options(path, async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      return reply.code(204).send();
    });
  }

  fastify.options(DASHBOARD_RELEASE_RECOVERY_PATH, async (request, reply) => {
    if (!requireFirstPartyAppOrigin(request, reply)) return;
    return reply.code(204).send();
  });
}
