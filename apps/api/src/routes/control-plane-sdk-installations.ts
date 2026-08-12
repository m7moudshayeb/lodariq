import { createPublicSdkInstallationId } from '@lodariq/database';
import {
  DashboardPublicSdkInstallationCreateResponse,
  DashboardPublicSdkInstallationOriginsResponse,
  DashboardPublicSdkInstallationRevokeResponse,
  DashboardSdkInstallationsResponse,
} from '@lodariq/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { renderPublicSdkInstallationSnippet } from '../snippets';
import { parseExactBrowserOrigin } from '../sdk-origin';
import { authenticate, requireRole } from './control-plane-access';
import {
  ApiErrorResponse,
  ConfigurePublicSdkInstallationOriginBody,
  CreatePublicSdkInstallationBody,
  PublicSdkInstallationParams,
  SyncPublicSdkInstallationOriginsBody,
} from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';

export function registerControlPlaneSdkInstallationRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/sdk-installations',
    { schema: { response: { 200: DashboardSdkInstallationsResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const installations = await options.repository.listPublicSdkInstallations(auth.workspaceId);
      return {
        installations: installations.map((installation) => ({
          ...installation,
          sdkSnippet: renderPublicSdkInstallationSnippet({
            installationId: installation.installationId,
            loaderSrc: options.publicLoaderSrc,
          }),
        })),
      };
    },
  );

  fastify.post(
    '/v1/sdk-installations',
    {
      schema: {
        body: CreatePublicSdkInstallationBody,
        response: { 201: DashboardPublicSdkInstallationCreateResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const body = request.body as { name: string };
      const installation = await options.repository.getOrCreatePublicSdkInstallation({
        workspaceId: auth.workspaceId,
        installationId: createPublicSdkInstallationId(),
        name: body.name,
        actorUserId: auth.userId,
      });
      return reply.code(201).send({
        installation,
        sdkSnippet: renderPublicSdkInstallationSnippet({
          installationId: installation.installationId,
          loaderSrc: options.publicLoaderSrc,
        }),
      });
    },
  );

  fastify.put(
    '/v1/sdk-installations/:installationId/origins',
    {
      schema: {
        params: PublicSdkInstallationParams,
        body: ConfigurePublicSdkInstallationOriginBody,
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { installationId } = request.params as { installationId: string };
      const body = request.body as {
        environmentId: string;
        origin: string;
        authoringEnabled: boolean;
      };
      const exactOrigin = parseExactBrowserOrigin(body.origin);
      if (!exactOrigin) {
        return reply.code(400).send({
          error: 'invalid_origin',
          message: 'Origin must be a canonical HTTP(S) browser origin without a path',
        });
      }
      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === body.environmentId,
      );
      if (!environment)
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      if (environment.kind === 'production' && !exactOrigin.startsWith('https://')) {
        return reply.code(400).send({
          error: 'production_https_required',
          message: 'Production origins must use HTTPS',
        });
      }
      if (environment.kind === 'production' && body.authoringEnabled) {
        return reply.code(403).send({
          error: 'production_authoring_forbidden',
          message: 'Production origins cannot enable authoring',
        });
      }
      try {
        const mapping = await options.repository.setPublicSdkInstallationOrigin({
          workspaceId: auth.workspaceId,
          installationId,
          environmentId: environment.id,
          origin: exactOrigin,
          authoringEnabled: body.authoringEnabled,
        });
        return { mapping };
      } catch (error) {
        return sendInstallationMutationError(error, reply);
      }
    },
  );

  registerOriginSyncRoute(fastify, options);

  fastify.post(
    '/v1/sdk-installations/:installationId/revoke',
    {
      schema: {
        params: PublicSdkInstallationParams,
        response: {
          200: DashboardPublicSdkInstallationRevokeResponse,
          404: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { installationId } = request.params as { installationId: string };
      const installation = await options.repository.revokePublicSdkInstallation(
        auth.workspaceId,
        installationId,
        auth.userId,
      );
      if (!installation)
        return reply.code(404).send({ error: 'not_found', message: 'Installation not found' });
      return { installation };
    },
  );
}

function registerOriginSyncRoute(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.put(
    '/v1/sdk-installations/:installationId/origins/sync',
    {
      schema: {
        params: PublicSdkInstallationParams,
        body: SyncPublicSdkInstallationOriginsBody,
        response: {
          200: DashboardPublicSdkInstallationOriginsResponse,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { installationId } = request.params as { installationId: string };
      const body = request.body as {
        origins: Array<{ environmentId: string; origin: string; authoringEnabled: boolean }>;
      };
      try {
        const origins = await options.repository.syncPublicSdkInstallationOrigins({
          workspaceId: auth.workspaceId,
          installationId,
          origins: body.origins,
        });
        return { origins };
      } catch (error) {
        return sendInstallationMutationError(error, reply, true);
      }
    },
  );
}

function sendInstallationMutationError(error: unknown, reply: FastifyReply, syncing = false) {
  if (!(error instanceof Error)) throw error;
  if (error.message === 'active public SDK installation not found in workspace') {
    return reply.code(404).send({ error: 'not_found', message: 'Installation not found' });
  }
  if (error.message === 'authoring cannot be enabled for a production environment') {
    return reply.code(403).send({
      error: 'production_authoring_forbidden',
      message: 'Production origins cannot enable authoring',
    });
  }
  if (error.message === 'public SDK origin is not allowlisted for the environment') {
    return reply.code(409).send({
      error: 'environment_policy_forbidden',
      message: 'Origin is not present in the environment origin allowlist',
    });
  }
  if (
    error.message === 'environment is disabled' ||
    error.message === 'authoring is disabled for the environment'
  ) {
    return reply.code(409).send({ error: 'environment_policy_forbidden', message: error.message });
  }
  if (syncing) {
    return reply.code(400).send({ error: 'invalid_origin_sync', message: error.message });
  }
  throw error;
}
