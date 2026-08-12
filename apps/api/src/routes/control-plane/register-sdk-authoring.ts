import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringBrandDriftCheckResult,
  AuthoringBrandThemeAcknowledgementRequest,
  AuthoringBrandThemeAcknowledgementResult,
  AuthoringStagingPublicationResult,
  AuthoringStagingReleaseState,
  AuthoringStagingVerificationRequest,
  BrandDriftCheckRequest,
  ProductionPromotionRequest,
  ProductionPromotionResult,
  ReleaseRecoveryRequest,
  ReleaseRecoveryResult,
  ReleaseRecoveryStateResponse,
  type AuthoringBrandThemeAcknowledgementRequest as AuthoringBrandThemeAcknowledgementRequestType,
  type BrandDriftCheckRequest as BrandDriftCheckRequestType,
  type AuthoringStagingVerificationRequest as AuthoringStagingVerificationRequestType,
  type AuthoringStagingVerificationResult as AuthoringStagingVerificationResultType,
  type ProductStyleProposal as ProductStyleProposalType,
  type ProductionPromotionRequest as ProductionPromotionRequestType,
  type ReleaseRecoveryRequest as ReleaseRecoveryRequestType,
} from '@lodariq/schema';
import type { FastifyInstance } from 'fastify';
import { parseExactBrowserOrigin } from '../../sdk-origin';
import {
  ApiErrorResponse,
  AuthoringStagingVerificationHttpError,
  AuthoringStagingVerificationHttpSuccess,
  CreateAuthoringStagingPublicationBody,
  CreateAuthoringStyleSourceBody,
  CreateReleaseApprovalBody,
  DIRECT_RELEASE_RECOVERY_PATH,
  EnvironmentParams,
  ReleaseOperationParams,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  handleReleaseRecoveryState,
  authoringRecoveryPermissionIntersection,
  handleReleaseRecoveryMutation,
  handleAuthoringReleaseState,
  handleAuthoringStagingPublication,
  handleAuthoringStyleSource,
  handleAuthoringBrandDriftCheck,
  handleAuthoringBrandThemeAcknowledgement,
  createAuthoringPublicationVerification,
  handleProductionPromotion,
  handleReleaseApproval,
  requireDirectSdkStagingPublicationCapability,
  requireDirectSdkReleaseStateCapability,
  requireDirectReleaseRecoveryCapability,
  authenticateDirectAuthoringOperation,
  authenticateDirectAuthoringDocumentWrite,
  authenticateAuthoringSessionForToken,
  authenticateEnvironmentToken,
  requireDirectSdkAuthoringOrigin,
  setCredentialResponseHeaders,
} from './helpers';

export function registerSdkAuthoringRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get(
    '/v1/sdk/authoring/release-state',
    { schema: { response: { 200: AuthoringStagingReleaseState } } },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      if (!(await requireDirectSdkReleaseStateCapability(options.repository, session, reply))) {
        return;
      }

      setCredentialResponseHeaders(reply);
      return handleAuthoringReleaseState(options, session, reply, 'direct-sdk');
    },
  );

  fastify.get(
    DIRECT_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        response: {
          200: ReleaseRecoveryStateResponse,
          404: ApiErrorResponse,
          500: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;
      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      if (!(await requireDirectSdkReleaseStateCapability(options.repository, session, reply))) {
        return;
      }
      const { environmentId } = request.params as { environmentId: string };
      setCredentialResponseHeaders(reply);
      return handleReleaseRecoveryState(
        options.repository,
        {
          workspaceId: session.workspaceId,
          environmentId,
          documentId: session.documentId,
          actorUserId: session.createdByUserId,
        },
        reply,
        authoringRecoveryPermissionIntersection(session),
      );
    },
  );

  fastify.post(
    DIRECT_RELEASE_RECOVERY_PATH,
    {
      schema: {
        params: EnvironmentParams,
        body: ReleaseRecoveryRequest,
        response: {
          200: ReleaseRecoveryResult,
          201: ReleaseRecoveryResult,
          403: ReleaseRecoveryResult,
          404: ReleaseRecoveryResult,
          409: ReleaseRecoveryResult,
          500: ReleaseRecoveryResult,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;
      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      const recoveryRequest = request.body as ReleaseRecoveryRequestType;
      const { environmentId } = request.params as { environmentId: string };
      if (
        !(await requireDirectReleaseRecoveryCapability(
          options.repository,
          session,
          recoveryRequest,
          reply,
        ))
      ) {
        return;
      }
      setCredentialResponseHeaders(reply);
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
    '/v1/sdk/authoring/publications',
    {
      schema: {
        body: CreateAuthoringStagingPublicationBody,
        response: {
          200: AuthoringStagingPublicationResult,
          201: AuthoringStagingPublicationResult,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const session = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!session) return;
      if (
        !(await requireDirectSdkStagingPublicationCapability(options.repository, session, reply))
      ) {
        return;
      }

      setCredentialResponseHeaders(reply);
      return handleAuthoringStagingPublication(options, session, request, reply, 'direct-sdk');
    },
  );

  fastify.post(
    '/v1/sdk/authoring/style-sources',
    { schema: { body: CreateAuthoringStyleSourceBody } },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        'sample-product-style',
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleAuthoringStyleSource(
        options.repository,
        scoped.session,
        (request.body as { proposal: ProductStyleProposalType }).proposal,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/brand-drift',
    {
      schema: {
        body: BrandDriftCheckRequest,
        response: { 200: AuthoringBrandDriftCheckResult },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.SAMPLE_PRODUCT_STYLE,
        'sample-product-style',
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleAuthoringBrandDriftCheck(
        options.repository,
        scoped.session,
        request.body as BrandDriftCheckRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/brand-theme-acknowledgement',
    {
      schema: {
        body: AuthoringBrandThemeAcknowledgementRequest,
        response: { 200: AuthoringBrandThemeAcknowledgementResult },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringDocumentWrite(
        options.repository,
        request,
        reply,
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleAuthoringBrandThemeAcknowledgement(
        options.repository,
        scoped.session,
        request.body as AuthoringBrandThemeAcknowledgementRequestType,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/verifications',
    {
      schema: {
        body: AuthoringStagingVerificationRequest,
        response: {
          201: AuthoringStagingVerificationHttpSuccess,
          403: AuthoringStagingVerificationHttpError,
        },
      },
    },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.VERIFY_STAGING,
        'verify-staging',
      );
      if (!scoped) return;
      const verifiedOrigin = parseExactBrowserOrigin(request.headers.origin);
      if (!verifiedOrigin || !scoped.token.originAllowlist.includes(verifiedOrigin)) {
        return reply.code(403).send({
          ok: false,
          code: 'origin_mismatch',
          message: 'Verification must run on the exact allowlisted staging Origin',
        } satisfies AuthoringStagingVerificationResultType);
      }
      setCredentialResponseHeaders(reply);
      return createAuthoringPublicationVerification(
        options.repository,
        scoped.session,
        request.body as AuthoringStagingVerificationRequestType,
        verifiedOrigin,
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/promotions',
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
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.PROMOTE_PRODUCTION,
        'promote-production',
      );
      if (!scoped) return;
      setCredentialResponseHeaders(reply);
      return handleProductionPromotion(
        options,
        {
          workspaceId: scoped.session.workspaceId,
          documentId: scoped.session.documentId,
          actorUserId: scoped.session.createdByUserId,
          request: request.body as ProductionPromotionRequestType,
        },
        reply,
      );
    },
  );

  fastify.post(
    '/v1/sdk/authoring/release-operations/:operationId/approvals',
    { schema: { params: ReleaseOperationParams, body: CreateReleaseApprovalBody } },
    async (request, reply) => {
      const scoped = await authenticateDirectAuthoringOperation(
        options.repository,
        request,
        reply,
        AUTHORING_SESSION_CAPABILITIES.APPROVE_PRODUCTION,
        'approve-production',
      );
      if (!scoped) return;
      const { operationId } = request.params as { operationId: string };
      const body = request.body as { decision: 'approved' | 'rejected'; reason?: string };
      setCredentialResponseHeaders(reply);
      return handleReleaseApproval(
        options,
        {
          workspaceId: scoped.session.workspaceId,
          documentId: scoped.session.documentId,
          operationId,
          actorUserId: scoped.session.createdByUserId,
          decision: body.decision,
          reason: body.reason,
        },
        reply,
      );
    },
  );
}
