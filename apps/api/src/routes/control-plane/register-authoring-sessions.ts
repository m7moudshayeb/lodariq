import { Type } from '@sinclair/typebox';
import {
  AUTHORING_ACTIVATION_GRANT_HEADER,
  AUTHORING_SESSION_HEADER,
  CreateAuthoringDocumentSessionRequest,
  QueryAuthoringDocumentsRequest,
  QueryAuthoringDocumentsResult,
  RevokeAuthoringActivationRequest,
  validate,
  type QueryAuthoringDocumentsRequest as QueryAuthoringDocumentsRequestType,
  type RevokeAuthoringActivationRequest as RevokeAuthoringActivationRequestType,
} from '@lodariq/schema';
import {
  createAuthoringSessionToken,
  hashAuthoringSessionToken,
  hashAuthoringActivationGrant,
  hashEnvironmentToken,
  type AuthoringSessionRecord,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createObservabilityEvent } from '../../observability';
import { renderSdkInstallationSnippet } from '../../snippets';
import { parseExactBrowserOrigin } from '../../sdk-origin';
import { authenticate, emitObservability, requireRole } from '../control-plane-access';
import {
  ApiErrorResponse,
  AuthoringSessionParams,
  CreateAuthoringSessionBody,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import { AUTHORING_SESSION_TTL_MS } from './support';
import {
  deploymentOriginsForApiBaseUrl,
  createActivatedAuthoringDocumentSession,
  readHeader,
  requireExpectedFirstPartyAppOrigin,
  requireExpectedEditorOrigin,
  setCredentialResponseHeaders,
  createCorrelationId,
  DocumentThemeResolutionError,
  resolveDocumentTheme,
  toAuthoringSessionResponse,
} from './helpers';

export function registerAuthoringSessionRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const requireFirstPartyAppOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedFirstPartyAppOrigin(request, reply, deploymentOrigins.app);
  const requireEditorOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedEditorOrigin(request, reply, deploymentOrigins.editor);

  fastify.post(
    '/v1/authoring/documents/query',
    {
      schema: {
        body: QueryAuthoringDocumentsRequest,
        response: {
          200: QueryAuthoringDocumentsResult,
          400: ApiErrorResponse,
          401: ApiErrorResponse,
          403: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const activationGrant = readHeader(request, AUTHORING_ACTIVATION_GRANT_HEADER);
      if (!activationGrant) {
        return reply.code(401).send({
          error: 'activation_grant_required',
          message: 'The hosted editor must present an authoring activation grant',
        });
      }

      const body = request.body as QueryAuthoringDocumentsRequestType;
      const exactCustomerOrigin = parseExactBrowserOrigin(body.customerOrigin);
      if (!exactCustomerOrigin || exactCustomerOrigin !== body.customerOrigin) {
        return reply.code(400).send({
          error: 'invalid_customer_origin',
          message: 'Customer origin must be one canonical HTTP(S) browser origin',
        });
      }

      const result = await options.repository.queryAuthoringDocumentsFromActivation({
        installationId: body.installationId,
        exactOrigin: exactCustomerOrigin,
        activationGrantHash: hashAuthoringActivationGrant(activationGrant),
        scope: body.scope,
        pageContext: body.pageContext,
      });
      if (!result) {
        return reply.code(403).send({
          error: 'authoring_query_rejected',
          message: 'The authoring activation scope is invalid or expired',
        });
      }
      return result;
    },
  );

  fastify.post(
    '/v1/authoring/activation/revoke',
    { schema: { body: RevokeAuthoringActivationRequest } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const activationGrant = readHeader(request, AUTHORING_ACTIVATION_GRANT_HEADER);
      if (!activationGrant) {
        return reply.code(401).send({
          error: 'activation_grant_required',
          message: 'The hosted editor must present an authoring activation grant',
        });
      }

      const body = request.body as RevokeAuthoringActivationRequestType;
      const exactCustomerOrigin = parseExactBrowserOrigin(body.customerOrigin);
      if (exactCustomerOrigin && exactCustomerOrigin === body.customerOrigin) {
        await options.repository.revokeAuthoringActivationGrant({
          installationId: body.installationId,
          exactOrigin: exactCustomerOrigin,
          grantHash: hashAuthoringActivationGrant(activationGrant),
        });
      }
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/v1/authoring/sessions/:sessionId/revoke',
    { schema: { params: AuthoringSessionParams } },
    async (request, reply) => {
      if (!requireEditorOrigin(request, reply)) return;
      setCredentialResponseHeaders(reply);
      const authoringSession = readHeader(request, AUTHORING_SESSION_HEADER);
      if (!authoringSession) {
        return reply.code(401).send({
          error: 'authoring_session_required',
          message: 'The hosted editor must present its authoring session bearer',
        });
      }

      const { sessionId } = request.params as { sessionId: string };
      await options.repository.revokeAuthoringSession({
        sessionId,
        tokenHash: hashAuthoringSessionToken(authoringSession),
      });
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/v1/authoring/sessions',
    {
      schema: {
        body: Type.Union([CreateAuthoringSessionBody, CreateAuthoringDocumentSessionRequest]),
      },
    },
    async (request, reply) => {
      const activationGrant = readHeader(request, AUTHORING_ACTIVATION_GRANT_HEADER);
      if (activationGrant) {
        return createActivatedAuthoringDocumentSession(options, request, reply, activationGrant);
      }
      if (validate(CreateAuthoringDocumentSessionRequest, request.body).valid) {
        if (!requireEditorOrigin(request, reply)) return;
        return reply.code(401).send({
          error: 'activation_grant_required',
          message: 'The editor must present a valid authoring activation grant',
        });
      }
      if (!requireFirstPartyAppOrigin(request, reply)) return;

      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireRole(auth, 'member', reply)) return;

      const body = request.body as {
        environmentId: string;
        documentId: string;
        environmentClientToken?: string;
      };
      const [environment, document] = await Promise.all([
        options.repository
          .listEnvironments(auth.workspaceId)
          .then((items) => items.find((candidate) => candidate.id === body.environmentId)),
        options.repository.getDocument(auth.workspaceId, body.documentId),
      ]);

      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (!document) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (environment.kind === 'production') {
        return reply.code(403).send({
          error: 'production_authoring_forbidden',
          message: 'Production environments cannot create authoring sessions',
        });
      }
      if (environment.enabled === false || environment.authoringEnabled === false) {
        return reply.code(403).send({
          error: 'authoring_environment_disabled',
          message: 'Authoring is disabled for this environment',
        });
      }
      try {
        await resolveDocumentTheme(options.repository, document.document);
      } catch (error) {
        if (error instanceof DocumentThemeResolutionError) {
          return reply.code(error.statusCode).send({ error: error.code, message: error.message });
        }
        throw error;
      }

      if (body.environmentClientToken) {
        const environmentToken = await options.repository.resolveEnvironmentToken(
          hashEnvironmentToken(body.environmentClientToken),
        );
        const tokenMatchesAuthoringScope =
          environmentToken?.workspaceId === auth.workspaceId &&
          environmentToken.environmentId === environment.id &&
          environmentToken.environment === environment.kind;
        if (!tokenMatchesAuthoringScope) {
          return reply.code(403).send({
            error: 'environment_token_mismatch',
            message: 'Environment token does not match the authoring workspace or environment',
          });
        }
      }

      const sessionToken = createAuthoringSessionToken();
      const correlationId = createCorrelationId('authoring');
      let session: AuthoringSessionRecord;
      try {
        session = await options.repository.createAuthoringSession({
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          documentId: body.documentId,
          correlationId,
          tokenHash: hashAuthoringSessionToken(sessionToken),
          iframeSrc: options.authoringIframeSrc,
          expiresAt: new Date(Date.now() + AUTHORING_SESSION_TTL_MS).toISOString(),
          actorUserId: auth.userId,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'authoring session creator is not an active workspace member'
        ) {
          return reply.code(403).send({
            error: 'authoring_membership_required',
            message: 'An active authoring workspace membership is required',
          });
        }
        if (error instanceof Error && error.message === 'environment not found in workspace') {
          return reply.code(403).send({
            error: 'authoring_environment_disabled',
            message: 'Authoring is disabled for this environment',
          });
        }
        throw error;
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'authoring.session.created',
          correlationId,
          workspaceId: auth.workspaceId,
          documentId: body.documentId,
          environmentId: environment.id,
          userId: auth.userId,
        }),
      );

      const authoringSdkSnippet = body.environmentClientToken
        ? renderSdkInstallationSnippet({
            clientToken: body.environmentClientToken,
            environment: environment.kind,
            apiBaseUrl: options.publicApiBaseUrl,
            loaderSrc: options.loaderSrc,
            creatorLoaderSrc: options.creatorLoaderSrc,
            authoringSessionToken: sessionToken,
          })
        : undefined;

      setCredentialResponseHeaders(reply);
      return reply.code(201).send({
        authoringSession: toAuthoringSessionResponse(session),
        authoringSessionToken: sessionToken,
        bootstrapHeaderName: AUTHORING_SESSION_HEADER,
        ...(authoringSdkSnippet ? { authoringSdkSnippet } : {}),
      });
    },
  );
}
