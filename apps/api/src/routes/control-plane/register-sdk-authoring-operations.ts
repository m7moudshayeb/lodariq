import {
  AUTHORING_SESSION_CAPABILITIES,
  ClaimExperienceStepLockBody,
  CreateExperienceCommentBody,
  CreateExperimentBody,
  ExperienceAnalytics,
  ExperienceCommentsResponse,
  ExperienceSessionsResponse,
  ExperienceStepLocksResponse,
  ExperimentResponse,
  ResolveExperienceCommentBody,
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
  WorkspaceApplicationsResponse,
  type ClaimExperienceStepLockBody as ClaimExperienceStepLockBodyType,
  type CreateExperienceCommentBody as CreateExperienceCommentBodyType,
  type CreateExperimentBody as CreateExperimentBodyType,
  type ResolveExperienceCommentBody as ResolveExperienceCommentBodyType,
  type UpdateExperienceMeasurementBody as UpdateExperienceMeasurementBodyType,
  type UpdateExperimentBody as UpdateExperimentBodyType,
} from '@lodariq/schema';
import type { AuthoringSessionRecord, ControlPlaneRepository } from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  authenticateHostedEditorSession,
  authenticateAuthoringSessionForToken,
  authenticateEnvironmentToken,
  deploymentOriginsForApiBaseUrl,
  requireAuthoringSessionCapability,
  requireDirectSdkAuthoringOrigin,
  requireExpectedEditorOrigin,
  setCredentialResponseHeaders,
} from './helpers';
import { directSdkSessionHasCapability } from './helpers';
import {
  requireDocument,
  requireEnvironment,
  tourStepIds,
} from './register-experience-measurement';

/**
 * Operations, for the panel that is open on the customer's page (§4.7).
 *
 * The same surface the dashboard reads, reached with the credential the panel
 * actually holds: an authoring session, not a workspace login. Everything is
 * scoped to the session's own document and environment — no route here takes a
 * document id, so a session cannot read a neighbouring experience.
 */
export function registerSdkAuthoringOperationsRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const routeSets: readonly OperationsRouteSet[] = [
    {
      basePath: '/v1/sdk/authoring/operations',
      authenticate: (request, reply, mode) =>
        authenticateDirectOperations(options.repository, request, reply, mode),
    },
    {
      basePath: '/v1/authoring/operations',
      authenticate: (request, reply, mode) =>
        authenticateHostedOperations(
          options.repository,
          request,
          reply,
          mode,
          deploymentOrigins.editor,
        ),
    },
  ];

  for (const routeSet of routeSets) {
    registerOperationsRouteSet(fastify, options, routeSet);
  }
}

interface OperationsRouteSet {
  readonly basePath: '/v1/sdk/authoring/operations' | '/v1/authoring/operations';
  readonly authenticate: (
    request: FastifyRequest,
    reply: FastifyReply,
    mode: 'read' | 'write',
  ) => Promise<AuthoringSessionRecord | null>;
}

function registerOperationsRouteSet(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
  routeSet: OperationsRouteSet,
): void {
  const read = (request: FastifyRequest, reply: FastifyReply) =>
    routeSet.authenticate(request, reply, 'read');
  const write = (request: FastifyRequest, reply: FastifyReply) =>
    routeSet.authenticate(request, reply, 'write');
  const path = (suffix: string): string => `${routeSet.basePath}${suffix}`;

  fastify.get(path('/measurement'), async (request, reply) => {
    const session = await read(request, reply);
    if (!session) return;
    const measurement = await options.repository.readExperienceMeasurement(scopeOf(session));
    return reply.send(toMeasurementResponse(session.documentId, measurement));
  });

  fastify.patch(
    path('/measurement'),
    { schema: { body: UpdateExperienceMeasurementBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as UpdateExperienceMeasurementBodyType;
      const measurement = await options.repository.updateExperienceMeasurement({
        ...scopeOf(session),
        ...(body.successEvent === undefined ? {} : { successEvent: body.successEvent }),
        ...(body.adaptivePolicy ? { adaptivePolicy: body.adaptivePolicy } : {}),
        actorUserId: session.createdByUserId,
      });
      return reply.send(toMeasurementResponse(session.documentId, measurement));
    },
  );

  fastify.get(
    path('/analytics'),
    { schema: { response: { 200: ExperienceAnalytics } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const document = await requireDocument(
        options.repository,
        session.workspaceId,
        session.documentId,
        reply,
      );
      if (!document) return;
      const analytics = await options.repository.readExperienceAnalytics({
        ...scopeOf(session),
        environmentId: session.environmentId,
        stepIdsInOrder: tourStepIds(document),
      });
      return reply.send(analytics);
    },
  );

  fastify.get(
    path('/sessions'),
    { schema: { response: { 200: ExperienceSessionsResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      if (
        !(await requireEnvironment(
          options.repository,
          session.workspaceId,
          session.environmentId,
          reply,
        ))
      ) {
        return;
      }
      const sessions = await options.repository.listExperienceSessions({
        ...scopeOf(session),
        environmentId: session.environmentId,
      });
      return reply.send({ sessions });
    },
  );

  fastify.get(
    path('/experiment'),
    { schema: { response: { 200: ExperimentResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      return reply.send(await options.repository.readExperiment(scopeOf(session)));
    },
  );

  fastify.post(
    path('/experiment'),
    { schema: { body: CreateExperimentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as CreateExperimentBodyType;
      try {
        const experiment = await options.repository.createExperiment({
          ...scopeOf(session),
          varies: body.varies,
          successEventName: body.successEventName,
          arms: body.arms,
          actorUserId: session.createdByUserId,
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
    path('/experiment/:experimentId'),
    { schema: { params: ExperimentIdParams, body: UpdateExperimentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const { experimentId } = request.params as { experimentId: string };
      const experiment = await options.repository.updateExperiment({
        ...scopeOf(session),
        experimentId,
        ...(request.body as UpdateExperimentBodyType),
      });
      if (!experiment) {
        return reply.code(404).send({ error: 'not_found', message: 'Experiment not found' });
      }
      return reply.send({ experiment });
    },
  );

  fastify.get(
    path('/comments'),
    { schema: { response: { 200: ExperienceCommentsResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const comments = await options.repository.listExperienceComments(scopeOf(session));
      return reply.send({ comments });
    },
  );

  fastify.post(
    path('/comments'),
    { schema: { body: CreateExperienceCommentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as CreateExperienceCommentBodyType;
      const author = await options.repository.getIdentityUser(session.createdByUserId);
      const comment = await options.repository.createExperienceComment({
        ...scopeOf(session),
        stepId: body.stepId,
        body: body.body,
        authorUserId: session.createdByUserId,
        authorName: author?.name ?? 'Teammate',
      });
      return reply.code(201).send({ comment });
    },
  );

  fastify.patch(
    path('/comments/:commentId'),
    { schema: { params: CommentIdParams, body: ResolveExperienceCommentBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const { commentId } = request.params as { commentId: string };
      const comment = await options.repository.resolveExperienceComment({
        ...scopeOf(session),
        commentId,
        resolved: (request.body as ResolveExperienceCommentBodyType).resolved,
        actorUserId: session.createdByUserId,
      });
      if (!comment) {
        return reply.code(404).send({ error: 'not_found', message: 'Comment not found' });
      }
      return reply.send({ comment });
    },
  );

  fastify.get(
    path('/step-locks'),
    { schema: { response: { 200: ExperienceStepLocksResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const locks = await options.repository.listExperienceStepLocks(scopeOf(session));
      return reply.send({ locks });
    },
  );

  /**
   * A lease, not a lock. The winner comes back either way, so the panel can say
   * who holds the step instead of only that the claim failed.
   */
  fastify.post(
    path('/step-locks'),
    { schema: { body: ClaimExperienceStepLockBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as ClaimExperienceStepLockBodyType;
      const holder = await options.repository.getIdentityUser(session.createdByUserId);
      const lock = await options.repository.claimExperienceStepLock({
        ...scopeOf(session),
        stepId: body.stepId,
        holderUserId: session.createdByUserId,
        holderName: holder?.name ?? 'Teammate',
        sessionId: body.sessionId,
      });
      const mine = lock.holderUserId === session.createdByUserId;
      return reply.code(mine ? 201 : 409).send({ lock });
    },
  );

  fastify.delete(
    path('/step-locks'),
    { schema: { body: ClaimExperienceStepLockBody } },
    async (request, reply) => {
      const session = await write(request, reply);
      if (!session) return;
      const body = request.body as ClaimExperienceStepLockBodyType;
      await options.repository.releaseExperienceStepLock({
        ...scopeOf(session),
        stepId: body.stepId,
        holderUserId: session.createdByUserId,
        holderName: '',
        sessionId: body.sessionId,
      });
      return reply.code(204).send();
    },
  );

  fastify.get(
    path('/applications'),
    { schema: { response: { 200: WorkspaceApplicationsResponse } } },
    async (request, reply) => {
      const session = await read(request, reply);
      if (!session) return;
      const applications = await options.repository.listWorkspaceApplications(session.workspaceId);
      return reply.send({ applications });
    },
  );
}

const ExperimentIdParams = {
  type: 'object',
  required: ['experimentId'],
  additionalProperties: false,
  properties: { experimentId: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

const CommentIdParams = {
  type: 'object',
  required: ['commentId'],
  additionalProperties: false,
  properties: { commentId: { type: 'string', minLength: 1, maxLength: 128 } },
} as const;

function scopeOf(session: AuthoringSessionRecord): {
  workspaceId: string;
  documentId: string;
} {
  return { workspaceId: session.workspaceId, documentId: session.documentId };
}

function toMeasurementResponse(
  documentId: string,
  measurement: { successEvent?: unknown; adaptivePolicy: unknown },
): Record<string, unknown> {
  return {
    documentId,
    ...(measurement.successEvent ? { successEvent: measurement.successEvent } : {}),
    adaptivePolicy: measurement.adaptivePolicy,
  };
}

/**
 * Operations is document configuration, not a release action, so it asks only
 * for the document capability the session already carries. Writing needs
 * `WRITE_DOCUMENT`: declaring a success event or stopping a test changes what
 * the experience means, even though it never touches the artifact.
 */
async function authenticateDirectOperations(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: 'read' | 'write',
): Promise<AuthoringSessionRecord | null> {
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return null;
  const session = await authenticateAuthoringSessionForToken(repository, token, request, reply);
  if (!session) return null;
  const capability =
    mode === 'write'
      ? AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT
      : AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT;
  if (!directSdkSessionHasCapability(session, capability)) {
    await reply.code(403).send({
      error: 'authoring_capability_forbidden',
      message: 'Authoring session does not grant this Operations request',
    });
    return null;
  }
  return session;
}

async function authenticateHostedOperations(
  repository: ControlPlaneRepository,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: 'read' | 'write',
  editorOrigin: string,
): Promise<AuthoringSessionRecord | null> {
  if (!requireExpectedEditorOrigin(request, reply, editorOrigin)) return null;
  setCredentialResponseHeaders(reply);
  const session = await authenticateHostedEditorSession(repository, request, reply);
  if (!session) return null;
  const capability =
    mode === 'write'
      ? AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT
      : AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT;
  return requireAuthoringSessionCapability(session, capability, reply) ? session : null;
}
