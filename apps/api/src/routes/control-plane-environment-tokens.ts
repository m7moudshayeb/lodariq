import {
  createEnvironmentClientToken,
  getEnvironmentTokenPrefix,
  hashEnvironmentToken,
  type EnvironmentTokenRecord,
} from '@lodariq/database';
import {
  DashboardEnvironmentTokenCreateResponse,
  DashboardEnvironmentTokenRevokeResponse,
  DashboardEnvironmentTokensResponse,
} from '@lodariq/schema';
import type { FastifyInstance } from 'fastify';
import { renderSdkInstallationSnippet } from '../snippets';
import { authenticate, requireRole } from './control-plane-access';
import {
  ApiErrorResponse,
  CreateEnvironmentTokenBody,
  EnvironmentTokenParams,
} from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';

type EnvironmentTokenResponse = Omit<EnvironmentTokenRecord, 'clientToken' | 'tokenHash'>;

export function registerControlPlaneEnvironmentTokenRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/environment-tokens',
    { schema: { response: { 200: DashboardEnvironmentTokensResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const tokens = await options.repository.listEnvironmentTokens(auth.workspaceId);
      return { tokens: tokens.map(toTokenResponse) };
    },
  );

  fastify.post(
    '/v1/environment-tokens',
    {
      schema: {
        body: CreateEnvironmentTokenBody,
        response: {
          201: DashboardEnvironmentTokenCreateResponse,
          404: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const body = request.body as { environmentId: string; name: string };
      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === body.environmentId,
      );
      if (!environment)
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });

      const clientToken = createEnvironmentClientToken(environment.kind);
      const token = await options.repository.createEnvironmentToken({
        workspaceId: auth.workspaceId,
        environmentId: environment.id,
        name: body.name,
        tokenHash: hashEnvironmentToken(clientToken),
        tokenPrefix: getEnvironmentTokenPrefix(clientToken),
        clientToken,
        actorUserId: auth.userId,
      });
      return reply.code(201).send({
        token: toTokenResponse(token),
        clientToken,
        sdkSnippet: renderSdkInstallationSnippet({
          clientToken,
          environment: environment.kind,
          apiBaseUrl: options.publicApiBaseUrl,
          loaderSrc: options.loaderSrc,
        }),
      });
    },
  );

  fastify.post(
    '/v1/environment-tokens/:tokenId/revoke',
    {
      schema: {
        params: EnvironmentTokenParams,
        response: {
          200: DashboardEnvironmentTokenRevokeResponse,
          404: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { tokenId } = request.params as { tokenId: string };
      const token = await options.repository.revokeEnvironmentToken(
        auth.workspaceId,
        tokenId,
        auth.userId,
      );
      if (!token) return reply.code(404).send({ error: 'not_found', message: 'Token not found' });
      return { token: toTokenResponse(token) };
    },
  );
}

function toTokenResponse(token: EnvironmentTokenRecord): EnvironmentTokenResponse {
  return {
    id: token.id,
    workspaceId: token.workspaceId,
    environmentId: token.environmentId,
    environment: token.environment,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    createdAt: token.createdAt,
    ...(token.revokedAt === undefined ? {} : { revokedAt: token.revokedAt }),
  };
}
