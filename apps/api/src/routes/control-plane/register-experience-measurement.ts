import {
  ClaimExperienceStepLockBody,
  CreateExperienceCommentBody,
  CreateExperimentBody,
  ExperienceAnalytics,
  ExperienceCommentsResponse,
  ExperienceSessionsResponse,
  ExperienceStepLocksResponse,
  ExperimentResponse,
  RecordFormResponsesBody,
  ResolveExperienceCommentBody,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
  UpsertWorkspaceApplicationBody,
  WorkspaceApplicationsResponse,
  type ClaimExperienceStepLockBody as ClaimExperienceStepLockBodyType,
  type CreateExperienceCommentBody as CreateExperienceCommentBodyType,
  type CreateExperimentBody as CreateExperimentBodyType,
  type LodariqDocument,
  type RecordFormResponsesBody as RecordFormResponsesBodyType,
  type ResolveExperienceCommentBody as ResolveExperienceCommentBodyType,
  type UpdateExperienceMeasurementBody as UpdateExperienceMeasurementBodyType,
  type UpdateExperimentBody as UpdateExperimentBodyType,
  type UpsertWorkspaceApplicationBody as UpsertWorkspaceApplicationBodyType,
} from '@lodariq/schema';
import type { ControlPlaneRepository } from '@lodariq/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '../control-plane-access';
import { DocumentParams } from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';

const EnvironmentQuery = {
  type: 'object',
  required: ['environmentId'],
  additionalProperties: false,
  properties: { environmentId: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

const SessionsQuery = {
  type: 'object',
  required: ['environmentId'],
  additionalProperties: false,
  properties: {
    environmentId: { type: 'string', minLength: 1, maxLength: 128 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

/**
 * Operations: what an experience is trying to change, whether it did, and who is
 * editing it right now. None of it touches the compiled artifact, so a success
 * event or a running experiment never forces a republish.
 */
export function registerExperienceMeasurementRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/documents/:documentId/measurement',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const measurement = await options.repository.readExperienceMeasurement({
        workspaceId: auth.workspaceId,
        documentId,
      });
      return reply.send({
        documentId,
        ...(measurement.successEvent ? { successEvent: measurement.successEvent } : {}),
        adaptivePolicy: measurement.adaptivePolicy,
      });
    },
  );

  fastify.patch(
    '/v1/documents/:documentId/measurement',
    { schema: { params: DocumentParams, body: UpdateExperienceMeasurementBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const body = request.body as UpdateExperienceMeasurementBodyType;
      const measurement = await options.repository.updateExperienceMeasurement({
        workspaceId: auth.workspaceId,
        documentId,
        actorUserId: auth.userId,
        ...(body.successEvent === undefined ? {} : { successEvent: body.successEvent }),
        ...(body.adaptivePolicy ? { adaptivePolicy: body.adaptivePolicy } : {}),
      });
      return reply.send({
        documentId,
        ...(measurement.successEvent ? { successEvent: measurement.successEvent } : {}),
        adaptivePolicy: measurement.adaptivePolicy,
      });
    },
  );

  fastify.get(
    '/v1/documents/:documentId/analytics',
    {
      schema: {
        params: DocumentParams,
        querystring: EnvironmentQuery,
        response: { 200: ExperienceAnalytics },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const { environmentId } = request.query as { environmentId: string };
      const document = await requireDocument(
        options.repository,
        auth.workspaceId,
        documentId,
        reply,
      );
      if (!document) return;
      if (!(await requireEnvironment(options.repository, auth.workspaceId, environmentId, reply))) {
        return;
      }
      const analytics = await options.repository.readExperienceAnalytics({
        workspaceId: auth.workspaceId,
        documentId,
        environmentId,
        stepIdsInOrder: tourStepIds(document),
      });
      return reply.send(analytics);
    },
  );

  /**
   * Individual runs behind the funnel. The funnel says how many stalled; this
   * says what a stall looked like — which is the only view that tells a creator
   * what to fix.
   */
  fastify.get(
    '/v1/documents/:documentId/sessions',
    {
      schema: {
        params: DocumentParams,
        querystring: SessionsQuery,
        response: { 200: ExperienceSessionsResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const { environmentId, limit } = request.query as { environmentId: string; limit?: number };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      if (!(await requireEnvironment(options.repository, auth.workspaceId, environmentId, reply))) {
        return;
      }
      const sessions = await options.repository.listExperienceSessions({
        workspaceId: auth.workspaceId,
        documentId,
        environmentId,
        ...(limit === undefined ? {} : { limit }),
      });
      return reply.send({ sessions });
    },
  );

  fastify.post(
    '/v1/documents/:documentId/form-responses',
    { schema: { params: DocumentParams, body: RecordFormResponsesBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const body = request.body as RecordFormResponsesBodyType;
      if (
        !(await requireEnvironment(options.repository, auth.workspaceId, body.environmentId, reply))
      ) {
        return;
      }
      const accepted = await options.repository.recordFormResponses({
        workspaceId: auth.workspaceId,
        documentId,
        environmentId: body.environmentId,
        responses: body.responses,
      });
      return reply.code(202).send({ accepted });
    },
  );

  fastify.get(
    '/v1/documents/:documentId/experiment',
    { schema: { params: DocumentParams, response: { 200: ExperimentResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const result = await options.repository.readExperiment({
        workspaceId: auth.workspaceId,
        documentId,
      });
      return reply.send(result);
    },
  );

  fastify.post(
    '/v1/documents/:documentId/experiment',
    { schema: { params: DocumentParams, body: CreateExperimentBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const body = request.body as CreateExperimentBodyType;
      try {
        const experiment = await options.repository.createExperiment({
          workspaceId: auth.workspaceId,
          documentId,
          actorUserId: auth.userId,
          varies: body.varies,
          successEventName: body.successEventName,
          arms: body.arms,
        });
        return reply.code(201).send({ experiment });
      } catch (error) {
        return reply.code(409).send({
          error: 'experiment_conflict',
          message: error instanceof Error ? error.message : 'Experiment could not be created',
        });
      }
    },
  );

  fastify.patch(
    '/v1/experiments/:experimentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['experimentId'],
          additionalProperties: false,
          properties: { experimentId: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        body: UpdateExperimentBody,
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { experimentId } = request.params as { experimentId: string };
      const body = request.body as UpdateExperimentBodyType;
      try {
        const experiment = await options.repository.updateExperiment({
          workspaceId: auth.workspaceId,
          experimentId,
          ...(body.status ? { status: body.status } : {}),
          ...(body.arms ? { arms: body.arms } : {}),
          ...(body.promotedArmId ? { promotedArmId: body.promotedArmId } : {}),
        });
        if (!experiment) {
          return reply.code(404).send({ error: 'not_found', message: 'Experiment not found' });
        }
        return reply.send({ experiment });
      } catch (error) {
        return reply.code(422).send({
          error: 'experiment_invalid',
          message: error instanceof Error ? error.message : 'Experiment could not be updated',
        });
      }
    },
  );

  fastify.get(
    '/v1/documents/:documentId/comments',
    { schema: { params: DocumentParams, response: { 200: ExperienceCommentsResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const comments = await options.repository.listExperienceComments({
        workspaceId: auth.workspaceId,
        documentId,
      });
      return reply.send({ comments });
    },
  );

  fastify.post(
    '/v1/documents/:documentId/comments',
    { schema: { params: DocumentParams, body: CreateExperienceCommentBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const body = request.body as CreateExperienceCommentBodyType;
      const comment = await options.repository.createExperienceComment({
        workspaceId: auth.workspaceId,
        documentId,
        stepId: body.stepId,
        body: body.body,
        authorUserId: auth.userId,
        authorName: await displayName(options.repository, auth.userId),
      });
      return reply.code(201).send({ comment });
    },
  );

  fastify.patch(
    '/v1/comments/:commentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['commentId'],
          additionalProperties: false,
          properties: { commentId: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        body: ResolveExperienceCommentBody,
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { commentId } = request.params as { commentId: string };
      const body = request.body as ResolveExperienceCommentBodyType;
      const comment = await options.repository.resolveExperienceComment({
        workspaceId: auth.workspaceId,
        commentId,
        resolved: body.resolved,
        actorUserId: auth.userId,
      });
      if (!comment) {
        return reply.code(404).send({ error: 'not_found', message: 'Comment not found' });
      }
      return reply.send({ comment });
    },
  );

  fastify.get(
    '/v1/documents/:documentId/step-locks',
    { schema: { params: DocumentParams, response: { 200: ExperienceStepLocksResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const locks = await options.repository.listExperienceStepLocks({
        workspaceId: auth.workspaceId,
        documentId,
      });
      return reply.send({ locks });
    },
  );

  /**
   * The response is the winning lease, which may belong to someone else — the
   * caller learns who holds the step rather than being told "denied".
   */
  fastify.post(
    '/v1/documents/:documentId/step-locks',
    { schema: { params: DocumentParams, body: ClaimExperienceStepLockBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      if (!(await requireDocument(options.repository, auth.workspaceId, documentId, reply))) return;
      const body = request.body as ClaimExperienceStepLockBodyType;
      const lock = await options.repository.claimExperienceStepLock({
        workspaceId: auth.workspaceId,
        documentId,
        stepId: body.stepId,
        sessionId: body.sessionId,
        holderUserId: auth.userId,
        holderName: await displayName(options.repository, auth.userId),
      });
      return reply.code(lock.holderUserId === auth.userId ? 201 : 409).send({ lock });
    },
  );

  fastify.get(
    '/v1/applications',
    { schema: { response: { 200: WorkspaceApplicationsResponse } } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const applications = await options.repository.listWorkspaceApplications(auth.workspaceId);
      return reply.send({ applications });
    },
  );

  fastify.put(
    '/v1/applications/:applicationId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['applicationId'],
          additionalProperties: false,
          properties: { applicationId: { type: 'string', minLength: 1, maxLength: 128 } },
        },
        body: UpsertWorkspaceApplicationBody,
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'admin', reply)) return;
      const { applicationId } = request.params as { applicationId: string };
      const body = request.body as UpsertWorkspaceApplicationBodyType;
      if (body.id !== applicationId) {
        return reply.code(422).send({
          error: 'application_invalid',
          message: 'Application id in the path and body must match',
        });
      }
      const application = await options.repository.upsertWorkspaceApplication({
        workspaceId: auth.workspaceId,
        ...body,
      });
      return reply.send({ application });
    },
  );
}

export async function requireDocument(
  repository: ControlPlaneRepository,
  workspaceId: string,
  documentId: string,
  reply: FastifyReply,
): Promise<LodariqDocument | null> {
  const persisted = await repository.getDocument(workspaceId, documentId);
  if (persisted) return persisted.document;
  await reply.code(404).send({ error: 'not_found', message: 'Document not found' });
  return null;
}

export async function requireEnvironment(
  repository: ControlPlaneRepository,
  workspaceId: string,
  environmentId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const environments = await repository.listEnvironments(workspaceId);
  if (environments.some((environment) => environment.id === environmentId)) return true;
  await reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
  return false;
}

/** Funnel order comes from the document so a branch cannot reorder it. */
export function tourStepIds(document: LodariqDocument): string[] {
  return document.blocks.filter((block) => block.type === 'tourStep').map((block) => block.id);
}

/** A comment shows a person, not an opaque id — but never their email address. */
async function displayName(repository: ControlPlaneRepository, userId: string): Promise<string> {
  const user = await repository.getIdentityUser(userId);
  return user?.name?.trim() || userId;
}
