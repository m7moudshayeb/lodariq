import { randomUUID } from 'node:crypto';
import {
  AccessibilityFinding,
  AccessibilityFindingList,
  AccessibilityFindingQuery,
  AccessibilitySweepList,
  AccessibilitySweepQuery,
  AccessibilitySweepResult,
  ResolveAccessibilityFindingRequest,
  type AccessibilityFindingQuery as AccessibilityFindingQueryType,
  type AccessibilitySweepQuery as AccessibilitySweepQueryType,
  type ResolveAccessibilityFindingRequest as ResolveAccessibilityFindingRequestType,
} from '@lodariq/schema/accessibility-governance';
import { AccessibilityFindingConflictError } from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AuthContext } from '../auth';
import { runWorkspaceAccessibilitySweep } from '../accessibility-governance';
import { enforceGovernanceMutationQuota } from './control-plane-governance';
import { authenticate } from './control-plane-access';
import { ApiErrorResponse } from './control-plane-contracts';
import type { ControlPlaneRouteOptions } from './control-plane-context';

const FindingParams = {
  type: 'object',
  required: ['findingId'],
  additionalProperties: false,
  properties: { findingId: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;
const SweepParams = {
  type: 'object',
  required: ['sweepId'],
  additionalProperties: false,
  properties: { sweepId: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;

export function registerControlPlaneAccessibilityRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.post(
    '/v1/governance/accessibility-sweeps',
    {
      schema: {
        response: {
          201: AccessibilitySweepResult,
          400: ApiErrorResponse,
          403: ApiErrorResponse,
          429: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireSweepMember(auth, reply)) return;
      /*
       * The one mutating governance route that never took the shared quota. A
       * sweep reads every document in the workspace and issues two queries per
       * document inline in the request, so any member could loop it with fresh
       * keys and hold a connection open per call.
       */
      if (!(await enforceGovernanceMutationQuota(options, auth, reply))) return;
      const operationId = request.headers['idempotency-key'];
      // The same pattern every other governance route requires, rather than
      // "a non-empty string" — a key that varies freely defeats the replay.
      if (
        typeof operationId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(operationId)
      ) {
        return reply.code(400).send({
          error: 'idempotency_key_required',
          message: 'Accessibility sweep requires a valid Idempotency-Key header',
        });
      }
      const result = await runWorkspaceAccessibilitySweep({
        repository: options.repository,
        workspaceId: auth.workspaceId,
        actorUserId: auth.userId,
        operationId,
      });
      return reply.code(201).send(result);
    },
  );

  fastify.get(
    '/v1/governance/accessibility-sweeps',
    { schema: { querystring: AccessibilitySweepQuery, response: { 200: AccessibilitySweepList } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireSweepMember(auth, reply)) return;
      const query = request.query as AccessibilitySweepQueryType;
      return {
        sweeps: await options.repository.listAccessibilitySweeps(auth.workspaceId, query.limit),
      };
    },
  );

  fastify.get(
    '/v1/governance/accessibility-sweeps/:sweepId',
    {
      schema: {
        params: SweepParams,
        response: { 200: AccessibilitySweepResult, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireSweepMember(auth, reply)) return;
      const { sweepId } = request.params as { sweepId: string };
      const result = await options.repository.getAccessibilitySweep(auth.workspaceId, sweepId);
      if (!result) return reply.code(404).send({ error: 'not_found', message: 'Sweep not found' });
      return result;
    },
  );

  fastify.get(
    '/v1/governance/accessibility-findings',
    {
      schema: {
        querystring: AccessibilityFindingQuery,
        response: { 200: AccessibilityFindingList },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireSweepMember(auth, reply)) return;
      return {
        findings: await options.repository.listAccessibilityFindings(
          auth.workspaceId,
          request.query as AccessibilityFindingQueryType,
        ),
      };
    },
  );

  fastify.post(
    '/v1/governance/accessibility-findings/:findingId/resolve',
    {
      schema: {
        params: FindingParams,
        body: ResolveAccessibilityFindingRequest,
        response: {
          200: AccessibilityFinding,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth || !requireResolutionRole(auth, reply)) return;
      const { findingId } = request.params as { findingId: string };
      const body = request.body as ResolveAccessibilityFindingRequestType;
      try {
        const finding = await options.repository.resolveAccessibilityFinding({
          workspaceId: auth.workspaceId,
          findingId,
          expectedRevision: body.expectedRevision,
          resolutionNote: body.resolutionNote,
          actorUserId: auth.userId,
          resolvedAt: new Date().toISOString(),
          eventId: `a11yevent_${randomUUID()}`,
        });
        if (!finding) {
          return reply.code(404).send({ error: 'not_found', message: 'Finding not found' });
        }
        return finding;
      } catch (error) {
        if (error instanceof AccessibilityFindingConflictError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );
}

function requireSweepMember(auth: AuthContext, reply: FastifyReply): boolean {
  if (auth.role !== 'viewer') return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'Accessibility sweeps require a member, admin, or owner role',
  });
  return false;
}

function requireResolutionRole(auth: AuthContext, reply: FastifyReply): boolean {
  if (auth.role === 'owner' || auth.role === 'admin') return true;
  void reply.code(403).send({
    error: 'forbidden',
    message: 'Accessibility finding resolution requires an admin or owner role',
  });
  return false;
}
