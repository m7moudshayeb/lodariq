import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringBrandDriftCheckResult,
  AuthoringBrandThemeAcknowledgementRequest,
  AuthoringBrandThemeAcknowledgementResult,
  AuthoringStagingVerificationRequest,
  BrandDriftCheckRequest,
  ProductionPromotionRequest,
  ProductionPromotionResult,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  type AuthoringBrandThemeAcknowledgementRequest as AuthoringBrandThemeAcknowledgementRequestType,
  type BrandDriftCheckRequest as BrandDriftCheckRequestType,
  type AuthoringStagingVerificationRequest as AuthoringStagingVerificationRequestType,
  type AuthoringStagingVerificationResult as AuthoringStagingVerificationResultType,
  type ProductStyleProposal as ProductStyleProposalType,
  type ProductionPromotionRequest as ProductionPromotionRequestType,
  type ReleaseRecoveryRequest as ReleaseRecoveryRequestType,
} from '@lodariq/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseExactBrowserOrigin } from '../../sdk-origin';
import {
  AuthoringStagingVerificationHttpError,
  AuthoringStagingVerificationHttpSuccess,
  CreateAuthoringStagingPublicationBody,
  CreateAuthoringStyleSourceBody,
  CreateReleaseApprovalBody,
  EnvironmentParams,
  HOSTED_RELEASE_RECOVERY_PATH,
  ReleaseRecoveryForbiddenResponse,
  ReleaseOperationParams,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  deploymentOriginsForApiBaseUrl,
  handleReleaseRecoveryMutation,
  handleAuthoringStagingPublication,
  handleAuthoringStyleSource,
  handleAuthoringBrandDriftCheck,
  handleAuthoringBrandThemeAcknowledgement,
  createAuthoringPublicationVerification,
  handleProductionPromotion,
  handleReleaseApproval,
  authenticateHostedEditorSession,
  requireHostedStagingPublicationCapability,
  requireHostedReleaseRecoveryCapability,
  requireHostedAuthoringOperation,
  requireAuthoringDocumentWrite,
  requireExpectedEditorOrigin,
  setCredentialResponseHeaders,
} from './helpers';

export function registerAuthoringReleaseRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const requireEditorOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor);

  fastify.post(
    HOSTED_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        body: ReleaseRecoveryRequest,
        response: {
          200: ReleaseRecoveryResult,
          201: ReleaseRecoveryResult,
          403: ReleaseRecoveryForbiddenResponse,
          404: ReleaseRecoveryResult,
          409: ReleaseRecoveryResult,
          500: ReleaseRecoveryResult,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      const recoveryRequest = request.body as ReleaseRecoveryRequestType;
      const { environmentId } = request.params as { environmentId: string };
      if (
        !(await requireHostedReleaseRecoveryCapability(
          options.repository,
          session,
          recoveryRequest,
          reply,
        ))
      ) {
        return;
      }
      return handleReleaseRecoveryMutation(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        recoveryRequest,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/publications',
    { schema: { body: CreateAuthoringStagingPublicationBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (!(await requireHostedStagingPublicationCapability(options.repository, session, reply))) {
        return;
      }
      return handleAuthoringStagingPublication(options, session, request, reply, 'hosted-editor');
    },
  );

  fastify.post(
    '/v1/authoring/style-sources',
    { schema: { body: CreateAuthoringStyleSourceBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          'sample-product-style',
          reply,
        ))
      ) {
        return;
      }
      return handleAuthoringStyleSource(
        options.repository,
        session,
        (request.body as { proposal: ProductStyleProposalType }).proposal,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/brand-drift',
    {
      schema: {
        body: BrandDriftCheckRequest,
        response: { 200: AuthoringBrandDriftCheckResult },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
          'sample-product-style',
          reply,
        ))
      ) {
        return;
      }
      return handleAuthoringBrandDriftCheck(
        options,
        session,
        request.body as BrandDriftCheckRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/brand-theme-acknowledgement',
    {
      schema: {
        body: AuthoringBrandThemeAcknowledgementRequest,
        response: { 200: AuthoringBrandThemeAcknowledgementResult },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (!(await requireAuthoringDocumentWrite(options.repository, session, reply))) return;
      return handleAuthoringBrandThemeAcknowledgement(
        options.repository,
        session,
        request.body as AuthoringBrandThemeAcknowledgementRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/verifications',
    {
      schema: {
        body: AuthoringStagingVerificationRequest,
        response: {
          201: AuthoringStagingVerificationHttpSuccess,
          409: AuthoringStagingVerificationHttpError,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
          'verify-staging',
          reply,
        ))
      ) {
        return;
      }
      const verifiedOrigin = parseExactBrowserOrigin(session.customerOrigin ?? undefined);
      if (!verifiedOrigin) {
        return reply.code(409).send({
          ok: false,
          code: 'origin_mismatch',
          message: 'Authoring session is missing its exact customer Origin',
        } satisfies AuthoringStagingVerificationResultType);
      }
      return createAuthoringPublicationVerification(
        options.repository,
        session,
        request.body as AuthoringStagingVerificationRequestType,
        verifiedOrigin,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/promotions',
    {
      schema: {
        body: ProductionPromotionRequest,
        response: {
          200: ProductionPromotionResult,
          201: ProductionPromotionResult,
          202: ProductionPromotionResult,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
          'promote-production',
          reply,
        ))
      ) {
        return;
      }
      return handleProductionPromotion(
        options,
        {
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
          request: request.body as ProductionPromotionRequestType,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/authoring/release-operations/:operationId/approvals',
    { schema: { params: ReleaseOperationParams, body: CreateReleaseApprovalBody } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const session = await authenticateHostedEditorSession(options.repository, request, reply);
      if (!session) return;
      if (
        !(await requireHostedAuthoringOperation(
          options.repository,
          session,
          AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
          'approve-production',
          reply,
        ))
      ) {
        return;
      }
      const { operationId } = request.params as { operationId: string };
      const body = request.body as { decision: 'approved' | 'rejected'; reason?: string };
      return handleReleaseApproval(
        options,
        {
          workspaceId: session.workspaceId,
          documentId: session.documentId,
          operationId,
          actorUserId: session.createdByUserId,
          decision: body.decision,
          reason: body.reason,
        },
        reply,
      );
    },
  );
}
