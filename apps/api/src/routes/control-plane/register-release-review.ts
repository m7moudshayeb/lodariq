import {
  DashboardDocumentDebugResponse,
  ProductionPromotionRequest,
  validateTourPublishReadiness,
  type AuthoringStagingVerificationRequest as AuthoringStagingVerificationRequestType,
  type ProductionPromotionRequest as ProductionPromotionRequestType,
} from '@lodariq/schema';
import type { FastifyInstance } from 'fastify';
import { authenticate, requireReleaseCapability, requireRole } from '../control-plane-access';
import {
  CreateDashboardPublicationVerificationBody,
  ApiErrorResponse,
  CreateReleaseApprovalBody,
  DocumentParams,
  PublicationParams,
  ReleaseOperationParams,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  createExactPublicationVerification,
  handleProductionPromotion,
  handleReleaseApproval,
  requireVerificationOrigin,
  findEnvironment,
  toPublishReadinessIssueResponse,
  toPublicationResponse,
} from './helpers';

export function registerReleaseReviewRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.post(
    '/v1/publications/:publicationId/verifications',
    { schema: { params: PublicationParams, body: CreateDashboardPublicationVerificationBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'verify-staging', reply)) return;
      const { publicationId } = request.params as { publicationId: string };
      const body = request.body as {
        environmentId: string;
        report: AuthoringStagingVerificationRequestType['report'];
      };
      const environment = await findEnvironment(
        options.repository,
        auth.workspaceId,
        body.environmentId,
      );
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.enabled === false) {
        return reply.code(409).send({
          error: 'environment_policy_forbidden',
          code: 'environment_disabled',
          message: 'The release environment is disabled',
        });
      }
      const verifiedOrigin = requireVerificationOrigin(environment, request, reply);
      if (!verifiedOrigin) return;
      return createExactPublicationVerification(
        options.repository,
        {
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          publicationId,
          report: body.report,
          verifiedOrigin,
          actorUserId: auth.userId,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/documents/:documentId/promotions',
    { schema: { params: DocumentParams, body: ProductionPromotionRequest } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'promote-production', reply)) return;
      const { documentId } = request.params as { documentId: string };
      return handleProductionPromotion(
        options,
        {
          workspaceId: auth.workspaceId,
          documentId,
          actorUserId: auth.userId,
          request: request.body as ProductionPromotionRequestType,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/release-operations/:operationId/approvals',
    { schema: { params: ReleaseOperationParams, body: CreateReleaseApprovalBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'approve-production', reply)) return;
      const { operationId } = request.params as { operationId: string };
      const body = request.body as { decision: 'approved' | 'rejected'; reason?: string };
      return handleReleaseApproval(
        options,
        {
          workspaceId: auth.workspaceId,
          operationId,
          actorUserId: auth.userId,
          decision: body.decision,
          reason: body.reason,
        },
        reply,
      );
    },
  );

  fastify.get(
    '/v1/documents/:documentId/deployments',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const deployments = await options.repository.listDocumentDeployments(auth.workspaceId);
      return {
        deployments: deployments.filter((deployment) => deployment.documentId === documentId),
      };
    },
  );

  fastify.get(
    '/v1/documents/:documentId/publications',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const publications = await options.repository.listDocumentPublications(
        auth.workspaceId,
        documentId,
      );
      return { publications: publications.map(toPublicationResponse) };
    },
  );

  fastify.get(
    '/v1/documents/:documentId/visual-checks',
    { schema: { params: DocumentParams } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      const { documentId } = request.params as { documentId: string };
      const document = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      return {
        visualChecks: await options.repository.listVisualCheckRuns(auth.workspaceId, documentId),
      };
    },
  );

  fastify.get(
    '/v1/debug/documents/:documentId',
    {
      schema: {
        params: DocumentParams,
        response: { 200: DashboardDocumentDebugResponse, 404: ApiErrorResponse },
      },
    },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;
      const { documentId } = request.params as { documentId: string };
      const record = await options.repository.getDocument(auth.workspaceId, documentId);
      if (!record)
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      const versions = await options.repository.listDocumentVersions(auth.workspaceId, documentId);
      return {
        canonical: record.document,
        latestArtifact: record.latestArtifact ?? null,
        publishReadinessIssues: validateTourPublishReadiness(record.document).map(
          toPublishReadinessIssueResponse,
        ),
        versions,
      };
    },
  );
}
