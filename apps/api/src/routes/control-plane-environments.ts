import {
  EnvironmentReleasePolicyChangedError,
  WorkspaceEnvironmentPolicyInvalidError,
} from '@lodariq/database';
import {
  DashboardEnvironmentMutationResponse,
  DashboardEnvironmentMutationError,
  DashboardEnvironmentsResponse,
  type EnvironmentReleasePolicy as EnvironmentReleasePolicyType,
} from '@lodariq/schema';
import type { FastifyInstance } from 'fastify';
import { authenticate, requireReleaseCapability } from './control-plane-access';
import {
  ApiErrorResponse,
  EnvironmentParams,
  UpdateEnvironmentReleasePolicyBody,
  UpdateWorkspaceEnvironmentPolicyBody,
} from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';

export function registerControlPlaneEnvironmentRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/environments',
    { schema: { response: { 200: DashboardEnvironmentsResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      return { environments: await options.repository.listEnvironments(auth.workspaceId) };
    },
  );

  fastify.patch(
    '/v1/environments/:environmentId/release-policy',
    {
      schema: {
        params: EnvironmentParams,
        body: UpdateEnvironmentReleasePolicyBody,
        response: {
          200: DashboardEnvironmentMutationResponse,
          404: ApiErrorResponse,
          409: DashboardEnvironmentMutationError,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'manage-release-policy', reply)) return;
      const { environmentId } = request.params as { environmentId: string };
      const body = request.body as { requiredApprovalCount: 0 | 1; expectedUpdatedAt: string };
      const environment = (await options.repository.listEnvironments(auth.workspaceId)).find(
        (candidate) => candidate.id === environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.kind !== 'production') {
        return reply.code(409).send({
          error: 'production_environment_required',
          message: 'Release approval policy applies only to production',
        });
      }
      try {
        const updated = await options.repository.updateEnvironmentReleasePolicy({
          workspaceId: auth.workspaceId,
          environmentId,
          requiredApprovalCount: body.requiredApprovalCount,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return updated
          ? { environment: updated }
          : reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      } catch (error) {
        if (error instanceof EnvironmentReleasePolicyChangedError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            expectedUpdatedAt: error.expectedUpdatedAt,
            actualUpdatedAt: error.actualUpdatedAt,
          });
        }
        throw error;
      }
    },
  );

  fastify.patch(
    '/v1/environments/:environmentId/policy',
    {
      schema: {
        params: EnvironmentParams,
        body: UpdateWorkspaceEnvironmentPolicyBody,
        response: {
          200: DashboardEnvironmentMutationResponse,
          404: ApiErrorResponse,
          409: DashboardEnvironmentMutationError,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'manage-release-policy', reply)) return;
      const { environmentId } = request.params as { environmentId: string };
      const body = request.body as {
        name: string;
        originAllowlist: string[];
        enabled: boolean;
        pipelinePosition: 0 | 1 | 2;
        authoringEnabled: boolean;
        promotionSourceEnvironmentId?: string;
        releasePolicy: EnvironmentReleasePolicyType;
        expectedUpdatedAt: string;
      };
      try {
        const updated = await options.repository.updateWorkspaceEnvironmentPolicy({
          workspaceId: auth.workspaceId,
          environmentId,
          name: body.name,
          originAllowlist: body.originAllowlist,
          enabled: body.enabled,
          pipelinePosition: body.pipelinePosition,
          authoringEnabled: body.authoringEnabled,
          ...(body.promotionSourceEnvironmentId
            ? { promotionSourceEnvironmentId: body.promotionSourceEnvironmentId }
            : {}),
          releasePolicy: body.releasePolicy,
          expectedUpdatedAt: body.expectedUpdatedAt,
          actorUserId: auth.userId,
        });
        return updated
          ? { environment: updated }
          : reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      } catch (error) {
        if (error instanceof EnvironmentReleasePolicyChangedError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            expectedUpdatedAt: error.expectedUpdatedAt,
            actualUpdatedAt: error.actualUpdatedAt,
          });
        }
        if (error instanceof WorkspaceEnvironmentPolicyInvalidError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            issues: error.issues,
          });
        }
        throw error;
      }
    },
  );
}
