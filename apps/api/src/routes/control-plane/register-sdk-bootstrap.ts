import { Type } from '@sinclair/typebox';
import {
  AUTHORING_ACTIVATION_PROTOCOL,
  SDK_ELIGIBILITY_DIGEST_MAX_AGE_SECONDS,
  SDK_ELIGIBILITY_DIGEST_STALE_WHILE_REVALIDATE_SECONDS,
  AUTHORING_BOOTSTRAP_GRANT_HEADER,
  AUTHORING_SESSION_HEADER,
  AuthoringAuthorizationRequest,
  AuthoringCodeExchangeRequest,
  PublicSdkBootstrapRequest,
  SdkBootstrapRequest,
  type AuthoringAuthorizationRequest as AuthoringAuthorizationRequestType,
  type AuthoringCodeExchangeRequest as AuthoringCodeExchangeRequestType,
  type PublicSdkBootstrapRequest as PublicSdkBootstrapRequestType,
  type SdkBootstrapRequest as SdkBootstrapRequestType,
} from '@lodariq/schema';
import {
  createAuthoringActivationGrant,
  createAuthoringAuthorizationCode,
  hashAuthoringActivationGrant,
  hashAuthoringAuthorizationCode,
  hashAuthoringAuthorizationState,
  hashPublicSdkBootstrapGrant,
} from '@lodariq/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseExactBrowserOrigin } from '../../sdk-origin';
import {
  ApproveAuthoringAuthorizationRequestBody,
  AuthoringAuthorizationRequestParams,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  AUTHORING_AUTHORIZATION_REQUEST_TTL_MS,
  AUTHORING_AUTHORIZATION_CODE_TTL_MS,
  AUTHORING_ACTIVATION_GRANT_TTL_MS,
} from './support';
import {
  deploymentOriginsForApiBaseUrl,
  authenticateAuthoringSessionForToken,
  authenticateEnvironmentToken,
  readHeader,
  requirePublicAuthoringScope,
  requireSdkOrigin,
  requireExpectedFirstPartyAppOrigin,
  setCredentialResponseHeaders,
  bootstrapPublicSdkInstallation,
  setAllowedSdkCorsHeaders,
  resolveCreatorModule,
  validateAuthoringAuthorizationContext,
  validateAuthoringAuthorizationResult,
  validateAuthoringCodeExchangeResult,
  buildSdkEligibilityDigest,
  isInstallationEnabled,
  createJsonEtag,
  requestMatchesEtag,
  createViewerSdkInstallContext,
  createAuthoringSdkInstallContext,
  getLegacyCurrentPublication,
  authenticateAuthoringAuthorizationRequest,
} from './helpers';

export function registerSdkBootstrapRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  const deploymentOrigins = deploymentOriginsForApiBaseUrl(options.publicApiBaseUrl);
  const requireFirstPartyAppOrigin = (request: FastifyRequest, reply: FastifyReply): boolean =>
    requireExpectedFirstPartyAppOrigin(request, reply, deploymentOrigins.app);

  fastify.post(
    '/v1/sdk/bootstrap',
    { schema: { body: Type.Union([PublicSdkBootstrapRequest, SdkBootstrapRequest]) } },
    async (request, reply) => {
      const body = request.body as PublicSdkBootstrapRequestType | SdkBootstrapRequestType;
      if ('installationId' in body) {
        return bootstrapPublicSdkInstallation(options, body, request, reply);
      }

      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      if (body.environment !== token.environment) {
        return reply.code(403).send({
          error: 'environment_mismatch',
          message: 'SDK token is not valid for the requested environment',
        });
      }

      if (readHeader(request, AUTHORING_SESSION_HEADER)) {
        const authoringSession = await authenticateAuthoringSessionForToken(
          options.repository,
          token,
          request,
          reply,
        );
        if (!authoringSession) return;

        const record = await options.repository.getDocument(
          token.workspaceId,
          authoringSession.documentId,
        );
        if (!record) {
          return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
        }

        return createAuthoringSdkInstallContext(
          options.repository,
          options.publicApiBaseUrl,
          token,
          record,
          authoringSession,
          reply,
        );
      }

      const publication = await getLegacyCurrentPublication(
        options.repository,
        token.workspaceId,
        token.environmentId,
        reply,
      );
      if (reply.sent) return;
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No published tour artifact is available for this environment',
        });
      }

      const deployment = await options.repository.getDocumentDeployment(
        token.workspaceId,
        token.environmentId,
        publication.documentId,
      );
      return createViewerSdkInstallContext(
        options.publicApiBaseUrl,
        token,
        publication,
        deployment,
      );
    },
  );

  /**
   * The cacheable pre-flight (ADR-0027).
   *
   * A GET, so browsers and edges may cache it; scoped to one installation and
   * varied by Origin, so a customer's URL patterns are never served to a page
   * that is not theirs. Everything expensive about the bootstrap — page intent,
   * grant minting, artifact pinning — is deliberately absent.
   */
  fastify.get(
    '/v1/sdk/installations/:installationId/eligibility',
    {
      schema: {
        params: Type.Object(
          { installationId: Type.String({ minLength: 1, maxLength: 160 }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
      if (!exactOrigin) {
        return reply.code(400).send({
          error: 'origin_required',
          message: 'SDK eligibility requires one canonical browser Origin',
        });
      }
      const { installationId } = request.params as { installationId: string };
      const resolved = await options.repository.resolvePublicSdkInstallation(
        installationId,
        exactOrigin,
      );
      if (!resolved) {
        return reply.code(403).send({
          error: 'installation_origin_forbidden',
          message: 'Installation is not configured for this Origin',
        });
      }
      setAllowedSdkCorsHeaders(exactOrigin, reply);
      const digest = await buildSdkEligibilityDigest(
        options,
        resolved.installation.installationId,
        resolved.installation.workspaceId,
        resolved.environment.id,
        isInstallationEnabled(resolved.installation),
      );
      const body = JSON.stringify(digest);
      const etag = createJsonEtag(body);
      // Short freshness, long stale-while-revalidate: repeat page views inside
      // the window cost no network at all, an edge keeps absorbing traffic for
      // a day after that, and the kill switch still lands within minutes.
      reply.header(
        'cache-control',
        `public, max-age=${SDK_ELIGIBILITY_DIGEST_MAX_AGE_SECONDS}, stale-while-revalidate=${SDK_ELIGIBILITY_DIGEST_STALE_WHILE_REVALIDATE_SECONDS}`,
      );
      reply.header('etag', etag);
      reply.header('x-content-type-options', 'nosniff');
      if (requestMatchesEtag(request, etag)) return reply.code(304).send();
      return reply.send(digest);
    },
  );

  fastify.post(
    '/v1/sdk/authoring/authorization-requests',
    { schema: { body: AuthoringAuthorizationRequest } },
    async (request, reply) => {
      const body = request.body as AuthoringAuthorizationRequestType;
      const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
      const bootstrapGrant = readHeader(request, AUTHORING_BOOTSTRAP_GRANT_HEADER);
      if (!exactOrigin || !bootstrapGrant) {
        return reply.code(400).send({
          error: 'authoring_activation_scope_required',
          message: 'Authoring activation requires a canonical browser Origin and bootstrap grant',
        });
      }
      if (body.customerOrigin !== exactOrigin) {
        return reply.code(403).send({
          error: 'origin_claim_mismatch',
          message: 'Authorization request origin does not match the browser Origin',
        });
      }

      const resolved = await requirePublicAuthoringScope(
        options.repository,
        body.installationId,
        exactOrigin,
        reply,
      );
      if (!resolved) return;
      setAllowedSdkCorsHeaders(exactOrigin, reply);

      const expiresAt = new Date(Date.now() + AUTHORING_AUTHORIZATION_REQUEST_TTL_MS).toISOString();
      const authorizationRequest = await options.repository.createAuthoringAuthorizationRequest({
        installationId: body.installationId,
        exactOrigin,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(body.state),
        codeChallenge: body.codeChallenge,
        requestedCapabilities: [...body.requestedCapabilities],
        ...(body.documentIntent ? { documentIntent: body.documentIntent } : {}),
        expiresAt,
      });
      if (!authorizationRequest) {
        return reply.code(403).send({
          error: 'authoring_authorization_rejected',
          message: 'Authoring authorization request is invalid, expired, or outside policy',
        });
      }

      const context = validateAuthoringAuthorizationContext({
        requestId: authorizationRequest.requestId,
        installationId: authorizationRequest.installationId,
        workspaceId: authorizationRequest.workspaceId,
        environmentId: authorizationRequest.environmentId,
        environment: authorizationRequest.environment,
        customerOrigin: authorizationRequest.exactOrigin,
        state: body.state,
        codeChallenge: authorizationRequest.codeChallenge,
        codeChallengeMethod: authorizationRequest.codeChallengeMethod,
        requestedCapabilities: authorizationRequest.requestedCapabilities,
        ...(authorizationRequest.documentIntent
          ? { documentIntent: authorizationRequest.documentIntent }
          : {}),
        expiresAt: authorizationRequest.expiresAt,
      });
      setCredentialResponseHeaders(reply);
      return reply.code(201).send(context);
    },
  );

  fastify.get(
    '/v1/authoring/authorization-requests/:requestId',
    { schema: { params: AuthoringAuthorizationRequestParams } },
    async (request, reply) => {
      if (!requireFirstPartyAppOrigin(request, reply)) return;
      const { requestId } = request.params as { requestId: string };
      const resolved = await authenticateAuthoringAuthorizationRequest(
        options.repository,
        options.authProvider,
        request,
        reply,
        requestId,
      );
      if (!resolved) return;
      const authorizationRequest = resolved.request;
      if (authorizationRequest.approvedAt || authorizationRequest.authorizationCodeHash) {
        return reply.code(409).send({
          error: 'authorization_request_not_pending',
          message: 'Authoring authorization request is no longer pending',
        });
      }

      return {
        requestId: authorizationRequest.requestId,
        installationId: authorizationRequest.installationId,
        environmentId: authorizationRequest.environmentId,
        environment: authorizationRequest.environment,
        customerOrigin: authorizationRequest.exactOrigin,
        requestedCapabilities: authorizationRequest.requestedCapabilities,
        ...(authorizationRequest.documentIntent
          ? { documentIntent: authorizationRequest.documentIntent }
          : {}),
        expiresAt: authorizationRequest.expiresAt,
      };
    },
  );

  fastify.post(
    '/v1/authoring/authorization-requests/:requestId/approve',
    {
      schema: {
        params: AuthoringAuthorizationRequestParams,
        body: ApproveAuthoringAuthorizationRequestBody,
      },
    },
    async (request, reply) => {
      if (!requireFirstPartyAppOrigin(request, reply)) return;
      const { requestId } = request.params as { requestId: string };
      const resolved = await authenticateAuthoringAuthorizationRequest(
        options.repository,
        options.authProvider,
        request,
        reply,
        requestId,
      );
      if (!resolved) return;
      const body = request.body as { state: string };
      const authorizationCode = createAuthoringAuthorizationCode();
      const authorizationCodeExpiresAt = new Date(
        Date.now() + AUTHORING_AUTHORIZATION_CODE_TTL_MS,
      ).toISOString();
      const approved = await options.repository.approveAuthoringAuthorizationRequest({
        workspaceId: resolved.request.workspaceId,
        requestId,
        stateHash: hashAuthoringAuthorizationState(body.state),
        creatorId: resolved.auth.userId,
        authorizationCodeHash: hashAuthoringAuthorizationCode(authorizationCode),
        authorizationCodeExpiresAt,
      });
      if (!approved) {
        return reply.code(409).send({
          error: 'authorization_request_not_approvable',
          message: 'Authoring authorization request is invalid, expired, or no longer pending',
        });
      }

      const result = validateAuthoringAuthorizationResult({
        protocol: AUTHORING_ACTIVATION_PROTOCOL,
        type: 'authoring.authorization.result',
        requestId: approved.requestId,
        state: body.state,
        authorizationCode,
        expiresAt: approved.authorizationCodeExpiresAt,
      });
      setCredentialResponseHeaders(reply);
      return reply.send(result);
    },
  );

  fastify.post(
    '/v1/sdk/authoring/exchange',
    { schema: { body: AuthoringCodeExchangeRequest } },
    async (request, reply) => {
      const body = request.body as AuthoringCodeExchangeRequestType;
      const exactOrigin = parseExactBrowserOrigin(request.headers.origin);
      const bootstrapGrant = readHeader(request, AUTHORING_BOOTSTRAP_GRANT_HEADER);
      if (!exactOrigin || !bootstrapGrant) {
        return reply.code(400).send({
          error: 'authoring_activation_scope_required',
          message: 'Authoring exchange requires a canonical browser Origin and bootstrap grant',
        });
      }
      if (body.customerOrigin !== exactOrigin) {
        return reply.code(403).send({
          error: 'origin_claim_mismatch',
          message: 'Authorization exchange origin does not match the browser Origin',
        });
      }

      const resolved = await requirePublicAuthoringScope(
        options.repository,
        body.installationId,
        exactOrigin,
        reply,
      );
      if (!resolved) return;
      setAllowedSdkCorsHeaders(exactOrigin, reply);

      const creatorModule = resolveCreatorModule(options.creatorModule);
      if (!creatorModule) {
        return reply.code(503).send({
          error: 'creator_module_unavailable',
          message: 'The hosted creator module is not configured',
        });
      }

      const activationGrant = createAuthoringActivationGrant();
      const activationGrantExpiresAt = new Date(
        Date.now() + AUTHORING_ACTIVATION_GRANT_TTL_MS,
      ).toISOString();
      const exchanged = await options.repository.exchangeAuthoringAuthorizationCode({
        installationId: body.installationId,
        exactOrigin,
        requestId: body.requestId,
        bootstrapGrantHash: hashPublicSdkBootstrapGrant(bootstrapGrant),
        stateHash: hashAuthoringAuthorizationState(body.state),
        authorizationCodeHash: hashAuthoringAuthorizationCode(body.authorizationCode),
        codeVerifier: body.codeVerifier,
        activationGrantHash: hashAuthoringActivationGrant(activationGrant),
        activationGrantExpiresAt,
      });
      if (!exchanged) {
        return reply.code(403).send({
          error: 'authoring_exchange_rejected',
          message: 'Authorization exchange is invalid, expired, or already used',
        });
      }

      const grant = exchanged.activationGrant;
      const result = validateAuthoringCodeExchangeResult({
        activationGrant,
        context: {
          grantId: grant.grantId,
          requestId: grant.requestId,
          installationId: grant.installationId,
          workspaceId: grant.workspaceId,
          environmentId: grant.environmentId,
          environment: grant.environment,
          customerOrigin: grant.exactOrigin,
          editorOrigin: deploymentOrigins.editor,
          creatorId: grant.creatorId,
          capabilities: grant.capabilities,
          ...(grant.documentIntent ? { documentIntent: grant.documentIntent } : {}),
          expiresAt: grant.expiresAt,
        },
        creatorModule,
      });
      setCredentialResponseHeaders(reply);
      return reply.send(result);
    },
  );
}
