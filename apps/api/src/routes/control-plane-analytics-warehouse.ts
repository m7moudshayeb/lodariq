import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import {
  AnalyticsWarehouseDestination,
  AnalyticsWarehouseDestinationList,
  AnalyticsWarehouseSyncRunList,
  CreateAnalyticsWarehouseDestinationRequest,
  type CreateAnalyticsWarehouseDestinationRequest as CreateDestinationBody,
} from '@lodariq/schema/analytics-warehouse';
import {
  AnalyticsWarehouseDestinationConflictError,
  toPublicAnalyticsWarehouseDestination,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  authenticate,
  requireRecentControlPlaneAuthentication,
  requireWorkspaceGovernanceCapability,
} from './control-plane-access';
import { ApiErrorResponse } from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';
import type { AuthContext } from '../auth';

const DestinationParams = Type.Object(
  { destinationId: Type.String({ pattern: '^whdest_[A-Za-z0-9_-]{20,}$', maxLength: 160 }) },
  { additionalProperties: false },
);
const DisableDestinationBody = Type.Object(
  { expectedRevision: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
const SyncRunsQuery = Type.Object(
  {
    destinationId: Type.Optional(
      Type.String({ pattern: '^whdest_[A-Za-z0-9_-]{20,}$', maxLength: 160 }),
    ),
  },
  { additionalProperties: false },
);

export function registerControlPlaneAnalyticsWarehouseRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/analytics/warehouse-destinations',
    {
      schema: {
        response: {
          200: AnalyticsWarehouseDestinationList,
          403: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !(await requireWarehouseAccess(options, auth, reply))) return;
      const destinations = await options.repository.listAnalyticsWarehouseDestinations(
        auth.workspaceId,
      );
      return {
        destinations: destinations.map(toPublicAnalyticsWarehouseDestination),
      };
    },
  );

  fastify.post(
    '/v1/analytics/warehouse-destinations',
    {
      schema: {
        body: CreateAnalyticsWarehouseDestinationRequest,
        response: {
          201: AnalyticsWarehouseDestination,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          409: ApiErrorResponse,
          503: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (
        !auth ||
        !requireRecentControlPlaneAuthentication(auth, reply) ||
        !(await requireWarehouseAccess(options, auth, reply))
      ) {
        return;
      }
      // No sync worker means the destination would never receive an event.
      if (!options.analyticsWarehouseExecutorConfigured) {
        return reply.code(503).send({
          error: 'warehouse_executor_unavailable',
          message: 'Analytics warehouse delivery is not configured for this deployment',
        });
      }
      const idempotencyKey = header(request.headers['idempotency-key']);
      if (!idempotencyKey || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(idempotencyKey)) {
        return reply.code(400).send({
          error: 'invalid_idempotency_key',
          message: 'A valid Idempotency-Key header is required',
        });
      }
      const body = request.body as CreateDestinationBody;
      const now = new Date().toISOString();
      const requestHash = hashRequest(body);
      try {
        const destination = await options.repository.createAnalyticsWarehouseDestination({
          destination: {
            schemaVersion: '2026-08-22.1',
            id: idempotentId('whdest', auth.workspaceId, idempotencyKey),
            workspaceId: auth.workspaceId,
            environmentId: body.environmentId,
            ...(body.documentId ? { documentId: body.documentId } : {}),
            name: body.name,
            provider: body.provider,
            credentialReference: body.credentialReference,
            enabled: true,
            revision: 1,
            checkpoint: null,
            lastSyncedAt: null,
            lastErrorCode: null,
            createdByUserId: auth.userId,
            createdAt: now,
            updatedAt: now,
            operationId: idempotencyKey,
            requestHash,
            attemptCount: 0,
            nextAttemptAt: now,
          },
        });
        return reply.code(201).send(toPublicAnalyticsWarehouseDestination(destination));
      } catch (error) {
        if (error instanceof AnalyticsWarehouseDestinationConflictError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  fastify.post(
    '/v1/analytics/warehouse-destinations/:destinationId/disable',
    {
      schema: {
        params: DestinationParams,
        body: DisableDestinationBody,
        response: {
          200: AnalyticsWarehouseDestination,
          403: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (
        !auth ||
        !requireRecentControlPlaneAuthentication(auth, reply) ||
        !(await requireWarehouseAccess(options, auth, reply))
      ) {
        return;
      }
      const { destinationId } = request.params as { destinationId: string };
      const { expectedRevision } = request.body as { expectedRevision: number };
      const destination = await options.repository.disableAnalyticsWarehouseDestination(
        auth.workspaceId,
        destinationId,
        expectedRevision,
        new Date().toISOString(),
      );
      if (!destination) {
        return reply.code(409).send({
          error: 'destination_changed',
          message: 'Warehouse destination changed or was not found',
        });
      }
      return toPublicAnalyticsWarehouseDestination(destination);
    },
  );

  fastify.post(
    '/v1/analytics/warehouse-destinations/:destinationId/sync',
    {
      schema: {
        params: DestinationParams,
        response: {
          202: AnalyticsWarehouseDestination,
          403: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (
        !auth ||
        !requireRecentControlPlaneAuthentication(auth, reply) ||
        !(await requireWarehouseAccess(options, auth, reply))
      ) {
        return;
      }
      const { destinationId } = request.params as { destinationId: string };
      const destination = await options.repository.triggerAnalyticsWarehouseDestination(
        auth.workspaceId,
        destinationId,
        new Date().toISOString(),
      );
      if (!destination) {
        return reply.code(409).send({
          error: 'destination_unavailable',
          message: 'Warehouse destination is disabled or was not found',
        });
      }
      return reply.code(202).send(toPublicAnalyticsWarehouseDestination(destination));
    },
  );

  fastify.get(
    '/v1/analytics/warehouse-sync-runs',
    {
      schema: {
        querystring: SyncRunsQuery,
        response: { 200: AnalyticsWarehouseSyncRunList, 403: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !(await requireWarehouseAccess(options, auth, reply))) return;
      const { destinationId } = request.query as { destinationId?: string };
      const runs = await options.repository.listAnalyticsWarehouseSyncRuns(
        auth.workspaceId,
        destinationId,
      );
      return { runs: runs.map(({ workspaceId: _workspaceId, ...run }) => run) };
    },
  );
}

async function requireWarehouseAccess(
  options: ControlPlaneRouteOptions,
  auth: AuthContext,
  reply: FastifyReply,
): Promise<boolean> {
  return requireWorkspaceGovernanceCapability(options.repository, auth, 'audit:export', reply);
}

function hashRequest(body: CreateDestinationBody): string {
  const canonical = JSON.stringify({
    credentialReference: body.credentialReference,
    documentId: body.documentId ?? null,
    environmentId: body.environmentId,
    name: body.name,
    provider: body.provider,
  });
  return `sha256-${createHash('sha256').update(canonical).digest('hex')}`;
}

function idempotentId(prefix: 'whdest', workspaceId: string, idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(`${workspaceId}\0${idempotencyKey}`)
    .digest('base64url');
  return `${prefix}_${digest}`;
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
