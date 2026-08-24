import { createHash, randomBytes } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import {
  AssignGovernanceCapabilityProfileRequest,
  CreateGovernanceCapabilityProfileRequest,
  GovernanceCapabilityProfile,
  GovernanceCapabilityProfileAssignment,
  WorkspaceGovernanceCapabilityProfileAssignment,
  GovernanceCapabilityProfileList,
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointResult,
  WebhookDeliveryList,
  WebhookEndpointList,
  isSafeWebhookEndpointUrl,
  DataResidencyMigration,
  RequestDataResidencyMigration,
  WorkspaceDataResidencyState,
  UpdateGovernanceCapabilityProfileRequest,
  type AssignGovernanceCapabilityProfileRequest as AssignProfileBody,
  type CreateGovernanceCapabilityProfileRequest as CreateProfileBody,
  type UpdateGovernanceCapabilityProfileRequest as UpdateProfileBody,
  type CreateWebhookEndpointRequest as CreateWebhookBody,
  type RequestDataResidencyMigration as RequestResidencyBody,
} from '@lodariq/schema';
import type { GovernanceMutationResult } from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  authenticate,
  requireRecentControlPlaneAuthentication,
  requireWorkspaceGovernanceCapability,
} from './control-plane-access';
import { ApiErrorResponse } from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';
import { deriveWebhookSigningSecret } from '../outbound-webhooks';
import { enqueueGovernanceWebhookEvent } from '../governance-events';
import { hashAuthRateBucket, type AuthContext } from '../auth';

const CapabilityProfileParams = Type.Object(
  { profileId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);
const CapabilityProfileAssignmentParams = Type.Object(
  {
    environmentId: Type.String({ minLength: 1, maxLength: 256 }),
    userId: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false },
);
const WorkspaceCapabilityProfileAssignmentParams = Type.Object(
  { userId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);
const WebhookEndpointParams = Type.Object(
  { endpointId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);
const WebhookDeliveryParams = Type.Object(
  { deliveryId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);
const ResidencyMigrationParams = Type.Object(
  { migrationId: Type.String({ minLength: 1, maxLength: 256 }) },
  { additionalProperties: false },
);

export function registerControlPlaneGovernanceRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/governance/capability-profiles',
    { schema: { response: { 200: GovernanceCapabilityProfileList, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const result = await options.repository.listGovernanceCapabilityProfiles(
        auth.workspaceId,
        auth.userId,
      );
      if (result.status !== 'ok') return governanceFailure(reply, result.status);
      return { profiles: result.value };
    },
  );

  fastify.post(
    '/v1/governance/capability-profiles',
    {
      schema: {
        body: CreateGovernanceCapabilityProfileRequest,
        response: {
          200: GovernanceCapabilityProfile,
          201: GovernanceCapabilityProfile,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const idempotencyKey = requireIdempotencyKey(request.headers['idempotency-key'], reply);
      if (!idempotencyKey) return;
      const body = request.body as CreateProfileBody;
      const now = new Date().toISOString();
      const profileId = idempotentOpaqueId('gcp', auth.workspaceId, idempotencyKey);
      const result = await options.repository.createGovernanceCapabilityProfile({
        profile: {
          schemaVersion: '1',
          id: profileId,
          workspaceId: auth.workspaceId,
          name: body.name,
          baseRole: body.baseRole,
          capabilities: [...body.capabilities],
          revision: 1,
          createdByUserId: auth.userId,
          createdAt: now,
          updatedAt: now,
        },
        actorUserId: auth.userId,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') {
        if (result.status === 'conflict') {
          const existing = await options.repository.listGovernanceCapabilityProfiles(
            auth.workspaceId,
            auth.userId,
          );
          const profile =
            existing.status === 'ok'
              ? existing.value.find((candidate) => candidate.id === profileId)
              : undefined;
          if (
            profile &&
            profile.name === body.name &&
            profile.baseRole === body.baseRole &&
            sameStringSet(profile.capabilities, body.capabilities)
          ) {
            return reply.code(200).send(profile);
          }
        }
        return governanceFailure(reply, result.status);
      }
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt: now,
        data: { action: 'created', profileId: result.value.id, baseRole: result.value.baseRole },
      });
      return reply.code(201).send(result.value);
    },
  );

  fastify.patch(
    '/v1/governance/capability-profiles/:profileId',
    {
      schema: {
        params: CapabilityProfileParams,
        body: UpdateGovernanceCapabilityProfileRequest,
        response: { 200: GovernanceCapabilityProfile, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { profileId } = request.params as { profileId: string };
      const body = request.body as UpdateProfileBody;
      const result = await options.repository.updateGovernanceCapabilityProfile({
        workspaceId: auth.workspaceId,
        profileId,
        name: body.name,
        capabilities: [...body.capabilities],
        expectedRevision: body.expectedRevision,
        actorUserId: auth.userId,
        updatedAt: new Date().toISOString(),
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') {
        if (result.status === 'conflict') {
          const existing = await options.repository.listGovernanceCapabilityProfiles(
            auth.workspaceId,
            auth.userId,
          );
          const profile =
            existing.status === 'ok'
              ? existing.value.find((candidate) => candidate.id === profileId)
              : undefined;
          if (
            profile &&
            profile.revision === body.expectedRevision + 1 &&
            profile.name === body.name &&
            sameStringSet(profile.capabilities, body.capabilities)
          ) {
            return profile;
          }
        }
        return governanceFailure(reply, result.status);
      }
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt: result.value.updatedAt,
        data: { action: 'updated', profileId: result.value.id, revision: result.value.revision },
      });
      return result.value;
    },
  );

  fastify.delete(
    '/v1/governance/capability-profiles/:profileId',
    {
      schema: {
        params: CapabilityProfileParams,
        response: { 204: Type.Null(), 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { profileId } = request.params as { profileId: string };
      const result = await options.repository.deleteGovernanceCapabilityProfile({
        workspaceId: auth.workspaceId,
        profileId,
        actorUserId: auth.userId,
        occurredAt: new Date().toISOString(),
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt: new Date().toISOString(),
        data: { action: 'deleted', profileId },
      });
      return reply.code(204).send();
    },
  );

  fastify.put(
    '/v1/governance/members/:userId/capability-profile',
    {
      schema: {
        params: WorkspaceCapabilityProfileAssignmentParams,
        body: AssignGovernanceCapabilityProfileRequest,
        response: { 200: WorkspaceGovernanceCapabilityProfileAssignment, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { userId } = request.params as { userId: string };
      const body = request.body as AssignProfileBody;
      const assignedAt = new Date().toISOString();
      const result = await options.repository.assignWorkspaceGovernanceCapabilityProfile({
        assignment: {
          workspaceId: auth.workspaceId,
          userId,
          profileId: body.profileId,
          assignedByUserId: auth.userId,
          assignedAt,
        },
        actorUserId: auth.userId,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt: assignedAt,
        data: { action: 'workspace-assigned', profileId: body.profileId, userId },
      });
      return result.value;
    },
  );

  fastify.delete(
    '/v1/governance/members/:userId/capability-profile',
    {
      schema: {
        params: WorkspaceCapabilityProfileAssignmentParams,
        response: { 204: Type.Null(), 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { userId } = request.params as { userId: string };
      const occurredAt = new Date().toISOString();
      const result = await options.repository.removeWorkspaceGovernanceCapabilityProfileAssignment({
        workspaceId: auth.workspaceId,
        userId,
        actorUserId: auth.userId,
        occurredAt,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt,
        data: { action: 'workspace-unassigned', userId },
      });
      return reply.code(204).send();
    },
  );

  fastify.put(
    '/v1/governance/environments/:environmentId/members/:userId/capability-profile',
    {
      schema: {
        params: CapabilityProfileAssignmentParams,
        body: AssignGovernanceCapabilityProfileRequest,
        response: { 200: GovernanceCapabilityProfileAssignment, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { environmentId, userId } = request.params as {
        environmentId: string;
        userId: string;
      };
      const body = request.body as AssignProfileBody;
      const assignedAt = new Date().toISOString();
      const result = await options.repository.assignGovernanceCapabilityProfile({
        assignment: {
          workspaceId: auth.workspaceId,
          environmentId,
          userId,
          profileId: body.profileId,
          assignedByUserId: auth.userId,
          assignedAt,
        },
        actorUserId: auth.userId,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt: assignedAt,
        data: { action: 'assigned', profileId: body.profileId, environmentId, userId },
      });
      return result.value;
    },
  );

  fastify.delete(
    '/v1/governance/environments/:environmentId/members/:userId/capability-profile',
    {
      schema: {
        params: CapabilityProfileAssignmentParams,
        response: { 204: Type.Null(), 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { environmentId, userId } = request.params as {
        environmentId: string;
        userId: string;
      };
      const result = await options.repository.removeGovernanceCapabilityProfileAssignment({
        workspaceId: auth.workspaceId,
        environmentId,
        userId,
        actorUserId: auth.userId,
        occurredAt: new Date().toISOString(),
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'governance.capability_profile_changed',
        occurredAt: new Date().toISOString(),
        data: { action: 'unassigned', environmentId, userId },
      });
      return reply.code(204).send();
    },
  );

  fastify.get(
    '/v1/governance/webhooks',
    { schema: { response: { 200: WebhookEndpointList, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'webhooks:manage',
          reply,
        ))
      )
        return;
      const result = await options.repository.listWebhookEndpoints(auth.workspaceId, auth.userId);
      if (result.status !== 'ok') return governanceFailure(reply, result.status);
      return { endpoints: result.value };
    },
  );

  fastify.post(
    '/v1/governance/webhooks',
    {
      schema: {
        body: CreateWebhookEndpointRequest,
        response: {
          201: CreateWebhookEndpointResult,
          200: CreateWebhookEndpointResult,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          422: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'webhooks:manage',
          reply,
        ))
      )
        return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const idempotencyKey = requireIdempotencyKey(request.headers['idempotency-key'], reply);
      if (!idempotencyKey) return;
      if (!options.webhookSigningKey) {
        return reply.code(503).send({
          error: 'webhook_delivery_unavailable',
          message: 'Outbound webhook delivery is not configured',
        });
      }
      const body = request.body as CreateWebhookBody;
      if (!isSafeWebhookEndpointUrl(body.url)) {
        return reply.code(422).send({
          error: 'invalid_webhook_url',
          message: 'Webhook URL must be a public HTTPS endpoint without credentials or fragments',
        });
      }
      const now = new Date().toISOString();
      const endpointId = idempotentOpaqueId('whep', auth.workspaceId, idempotencyKey);
      const result = await options.repository.createWebhookEndpoint({
        endpoint: {
          id: endpointId,
          workspaceId: auth.workspaceId,
          url: body.url,
          eventTypes: [...body.eventTypes],
          secretVersion: 1,
          enabled: true,
          createdByUserId: auth.userId,
          createdAt: now,
          updatedAt: now,
        },
        actorUserId: auth.userId,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') {
        if (result.status === 'conflict') {
          const existing = await options.repository.listWebhookEndpoints(
            auth.workspaceId,
            auth.userId,
          );
          const endpoint =
            existing.status === 'ok'
              ? existing.value.find((candidate) => candidate.id === endpointId)
              : undefined;
          if (
            endpoint &&
            endpoint.url === body.url &&
            sameStringSet(endpoint.eventTypes, body.eventTypes)
          ) {
            return reply.code(200).send({
              endpoint,
              signingSecret: deriveWebhookSigningSecret(
                options.webhookSigningKey,
                endpointId,
                endpoint.secretVersion,
              ),
            });
          }
        }
        return governanceFailure(reply, result.status);
      }
      return reply.code(201).send({
        endpoint: result.value,
        signingSecret: deriveWebhookSigningSecret(options.webhookSigningKey, endpointId, 1),
      });
    },
  );

  fastify.delete(
    '/v1/governance/webhooks/:endpointId',
    { schema: { params: WebhookEndpointParams, response: { 403: ApiErrorResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'webhooks:manage',
          reply,
        ))
      )
        return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { endpointId } = request.params as { endpointId: string };
      const result = await options.repository.disableWebhookEndpoint({
        workspaceId: auth.workspaceId,
        endpointId,
        actorUserId: auth.userId,
        occurredAt: new Date().toISOString(),
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      return result.value;
    },
  );

  fastify.get(
    '/v1/governance/webhook-deliveries',
    {
      schema: {
        querystring: Type.Object(
          {
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
            /** Keyset cursor: the id of the last row on the previous page. */
            before: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
          },
          { additionalProperties: false },
        ),
        response: { 200: WebhookDeliveryList, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'webhooks:manage',
          reply,
        ))
      )
        return;
      const query = request.query as { limit?: number; before?: string };
      const result = await options.repository.listWebhookDeliveries(
        auth.workspaceId,
        auth.userId,
        query,
      );
      if (result.status !== 'ok') return governanceFailure(reply, result.status);
      return { deliveries: result.value };
    },
  );

  fastify.post(
    '/v1/governance/webhook-deliveries/:deliveryId/replay',
    {
      schema: {
        params: WebhookDeliveryParams,
        response: {
          202: Type.Object({ ok: Type.Literal(true) }, { additionalProperties: false }),
          403: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'webhooks:manage',
          reply,
        ))
      )
        return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { deliveryId } = request.params as { deliveryId: string };
      const result = await options.repository.replayWebhookDelivery({
        workspaceId: auth.workspaceId,
        deliveryId,
        actorUserId: auth.userId,
        replayedAt: new Date().toISOString(),
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      return reply.code(202).send({ ok: true });
    },
  );

  fastify.get(
    '/v1/governance/data-residency',
    { schema: { response: { 200: WorkspaceDataResidencyState, 403: ApiErrorResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'residency:manage',
          reply,
        ))
      )
        return;
      const result = await options.repository.getWorkspaceDataResidencyState(
        auth.workspaceId,
        auth.userId,
      );
      if (result.status !== 'ok') return governanceFailure(reply, result.status);
      return result.value;
    },
  );

  fastify.post(
    '/v1/governance/data-residency/migrations',
    {
      schema: {
        body: RequestDataResidencyMigration,
        response: {
          201: DataResidencyMigration,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      // Nothing will advance this migration, so it is refused rather than
      // accepted as a pending row an admin waits on indefinitely.
      if (!options.dataResidencyExecutorConfigured) {
        return reply.code(503).send({
          error: 'residency_executor_unavailable',
          message: 'Data residency migrations are not configured for this deployment',
        });
      }
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'residency:manage',
          reply,
        ))
      )
        return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const idempotencyKey = header(request.headers['idempotency-key']);
      if (!idempotencyKey || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(idempotencyKey)) {
        return reply.code(400).send({
          error: 'invalid_idempotency_key',
          message: 'A valid Idempotency-Key header is required',
        });
      }
      const body = request.body as RequestResidencyBody;
      const requestedAt = new Date().toISOString();
      const result = await options.repository.requestDataResidencyMigration({
        migrationId: opaqueId('drmig'),
        historyId: opaqueId('drhist'),
        workspaceId: auth.workspaceId,
        targetRegion: body.targetRegion,
        expectedPlacementGeneration: body.expectedPlacementGeneration,
        idempotencyKey,
        actorUserId: auth.userId,
        requestedAt,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'residency.migration_changed',
        occurredAt: result.value.updatedAt,
        data: {
          migrationId: result.value.id,
          sourceRegion: result.value.sourceRegion,
          targetRegion: result.value.targetRegion,
          status: result.value.status,
        },
      });
      return reply.code(201).send(result.value);
    },
  );

  fastify.post(
    '/v1/governance/data-residency/migrations/:migrationId/cancel',
    {
      schema: {
        params: ResidencyMigrationParams,
        response: { 200: DataResidencyMigration, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireRecentControlPlaneAuthentication(auth, reply)) return;
      if (
        !(await requireWorkspaceGovernanceCapability(
          options.repository,
          auth,
          'residency:manage',
          reply,
        ))
      )
        return;
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const { migrationId } = request.params as { migrationId: string };
      const transitionedAt = new Date().toISOString();
      const result = await options.repository.transitionDataResidencyMigration({
        workspaceId: auth.workspaceId,
        migrationId,
        historyId: opaqueId('drhist'),
        expectedStatus: 'requested',
        nextStatus: 'cancelled',
        transitionedAt,
        actorId: auth.userId,
        auditEventId: opaqueId('tenevt'),
      });
      if (result.status !== 'completed') return governanceFailure(reply, result.status);
      await enqueueGovernanceWebhookEvent(options.repository, {
        workspaceId: auth.workspaceId,
        type: 'residency.migration_changed',
        occurredAt: result.value.updatedAt,
        data: {
          migrationId: result.value.id,
          sourceRegion: result.value.sourceRegion,
          targetRegion: result.value.targetRegion,
          status: result.value.status,
        },
      });
      return result.value;
    },
  );
}

function governanceFailure(
  reply: FastifyReply,
  status: GovernanceMutationResult['status'] | 'forbidden',
) {
  if (status === 'forbidden') {
    return reply.code(403).send({ error: 'forbidden', message: 'Governance access is required' });
  }
  if (status === 'not_found') {
    return reply.code(404).send({ error: 'not_found', message: 'Governance resource not found' });
  }
  if (status === 'invalid_capabilities' || status === 'base_role_mismatch') {
    return reply.code(422).send({ error: status, message: 'Capability profile is not valid' });
  }
  return reply.code(409).send({ error: 'conflict', message: 'Governance state changed' });
}

function opaqueId(prefix: 'gcp' | 'tenevt' | 'whep' | 'drmig' | 'drhist'): string {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

function header(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function requireIdempotencyKey(
  value: string | string[] | undefined,
  reply: FastifyReply,
): string | null {
  const parsed = header(value);
  if (parsed && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(parsed)) return parsed;
  void reply.code(400).send({
    error: 'invalid_idempotency_key',
    message: 'A valid Idempotency-Key header is required',
  });
  return null;
}

function idempotentOpaqueId(
  prefix: 'gcp' | 'whep',
  workspaceId: string,
  idempotencyKey: string,
): string {
  const digest = createHash('sha256')
    .update(`${workspaceId}:${prefix}:${idempotencyKey}`)
    .digest('base64url');
  return `${prefix}_${digest}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

export async function enforceGovernanceMutationQuota(
  options: ControlPlaneRouteOptions,
  auth: AuthContext,
  reply: FastifyReply,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await options.repository.consumeAuthRateLimit({
    bucketHash: hashAuthRateBucket(
      'tenant-mutation',
      'user',
      `governance:${auth.workspaceId}:${auth.userId}`,
    ),
    scope: 'sign-in',
    now,
    windowMs: 60 * 60 * 1_000,
    maxAttempts: 120,
    blockMs: 5 * 60 * 1_000,
  });
  if (result.allowed) return true;
  reply.header('retry-after', String(result.retryAfterSeconds));
  void reply.code(429).send({
    error: 'rate_limited',
    message: 'Governance API quota exceeded',
  });
  return false;
}
