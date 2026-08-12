import { canonicalJson } from '@lodariq/compiler';
import { AuthoringDocumentPayload, LodariqDocument, validate } from '@lodariq/schema';
import { COMPILED_ARTIFACT_SCHEMA_VERSION } from '@lodariq/schema/version';
import type { FastifyInstance } from 'fastify';
import { createObservabilityEvent } from '../../observability';
import { emitObservability } from '../control-plane-access';
import {
  ApiErrorResponse,
  SDK_DOCUMENT_ARTIFACT_PATH,
  SDK_DOCUMENT_MANIFEST_PATH,
  SDK_DOCUMENT_PATH,
  SdkAuthoringDocumentBody,
  SdkDocumentArtifactParams,
  SdkDocumentParams,
  SdkIngestEventsBody,
} from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import { PUBLIC_SDK_INSTALLATION_HEADER } from './support';
import {
  authoringSessionThemeMatches,
  authoringSessionArtifactMatches,
  sendAuthoringSessionCompatibilityChanged,
  validateAuthoringDocumentPayload,
  authenticateAuthoringSessionForToken,
  authenticateEnvironmentToken,
  readHeader,
  requireSdkDeliveryPathScope,
  resolveSdkDeliveryScope,
  resolvePublicSdkRequest,
  requireSdkOrigin,
  requireDirectSdkAuthoringOrigin,
  setCredentialResponseHeaders,
  createActiveManifestPointer,
  createJsonEtag,
  requestMatchesEtag,
  setManifestResponseHeaders,
  setPrivateDocumentResponseHeaders,
  setImmutableArtifactResponseHeaders,
  getLegacyCurrentPublication,
  beginSdkDeliveryObservation,
  emitSdkDeliveryResolution,
  ingestAuthoritativeSdkEvents,
  compileAndValidate,
  resolveDocumentTheme,
} from './helpers';
import type { SdkDocumentPathParams, SdkDocumentArtifactPathParams } from './helpers';

export function registerSdkDeliveryRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.get('/v1/sdk/current-document', async (request, reply) => {
    // This compatibility endpoint is selected by a credential-bearing header,
    // so a shared cache must never reuse one tenant's response for another.
    setPrivateDocumentResponseHeaders(reply);
    if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
      const resolved = await resolvePublicSdkRequest(options.repository, request, reply);
      if (!resolved) return;
      const publication = await getLegacyCurrentPublication(
        options.repository,
        resolved.installation.workspaceId,
        resolved.environment.id,
        reply,
      );
      if (reply.sent) return;
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No published tour artifact is available for this environment',
        });
      }
      return publication.artifact.compiled;
    }

    const token = await authenticateEnvironmentToken(options.repository, request, reply);
    if (!token) return;
    if (!requireSdkOrigin(token, request, reply)) return;

    const publication = await getLegacyCurrentPublication(
      options.repository,
      token.workspaceId,
      token.environmentId,
      reply,
    );
    if (reply.sent) return;
    const artifact = publication?.artifact ?? null;
    if (!artifact) {
      return reply.code(404).send({
        error: 'artifact_not_found',
        message: 'No published tour artifact is available for this environment',
      });
    }

    return artifact.compiled;
  });

  fastify.get(
    SDK_DOCUMENT_MANIFEST_PATH,
    { schema: { params: SdkDocumentParams } },
    async (request, reply) => {
      const scope = await resolveSdkDeliveryScope(options.repository, request, reply);
      if (!scope) return;
      const params = request.params as SdkDocumentPathParams;
      if (!requireSdkDeliveryPathScope(scope, params, reply)) return;
      const { documentId } = params;
      const observation = beginSdkDeliveryObservation(request);
      try {
        const deployment = await options.repository.getDocumentDeployment(
          scope.workspaceId,
          scope.environmentId,
          documentId,
        );
        if (!deployment) {
          emitSdkDeliveryResolution(options.observability, observation, scope, {
            resource: 'manifest',
            outcome: 'not_found',
            statusCode: 404,
            cacheOutcome: 'not_applicable',
          });
          return reply.code(404).send({
            error: 'manifest_not_found',
            message: 'No document deployment exists for this environment',
          });
        }

        const manifest =
          deployment.state === 'active'
            ? await createActiveManifestPointer(
                options.repository,
                options.publicApiBaseUrl,
                deployment,
              )
            : {
                schemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
                workspaceId: deployment.workspaceId,
                environmentId: deployment.environmentId,
                documentId: deployment.documentId,
                state: 'inactive' as const,
                generation: deployment.generation,
                deactivatedAt: deployment.updatedAt,
              };
        if (!manifest) {
          emitSdkDeliveryResolution(options.observability, observation, scope, {
            resource: 'manifest',
            outcome: 'inconsistent',
            statusCode: 409,
            cacheOutcome: 'not_applicable',
          });
          return reply.code(409).send({
            error: 'deployment_publication_missing',
            message: 'The active deployment does not resolve to an immutable publication',
          });
        }

        const body = canonicalJson(manifest);
        const etag = createJsonEtag(body);
        const notModified = requestMatchesEtag(request, etag);
        setManifestResponseHeaders(reply, etag);
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'manifest',
          outcome: manifest.state,
          statusCode: notModified ? 304 : 200,
          cacheOutcome: notModified ? 'not_modified' : 'served',
        });
        if (notModified) return reply.code(304).send();
        return reply.type('application/json; charset=utf-8').send(body);
      } catch (error) {
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'manifest',
          outcome: 'error',
          statusCode: 500,
          cacheOutcome: 'not_applicable',
        });
        throw error;
      }
    },
  );

  fastify.get(
    SDK_DOCUMENT_ARTIFACT_PATH,
    { schema: { params: SdkDocumentArtifactParams } },
    async (request, reply) => {
      const scope = await resolveSdkDeliveryScope(options.repository, request, reply);
      if (!scope) return;
      const params = request.params as SdkDocumentArtifactPathParams;
      if (!requireSdkDeliveryPathScope(scope, params, reply)) return;
      const { documentId, contentHash } = params;
      const observation = beginSdkDeliveryObservation(request);
      try {
        const publication = (
          await options.repository.listDocumentPublications(scope.workspaceId, documentId)
        ).find(
          (candidate) =>
            candidate.environmentId === scope.environmentId &&
            candidate.contentHash === contentHash,
        );
        if (!publication) {
          emitSdkDeliveryResolution(options.observability, observation, scope, {
            resource: 'artifact',
            outcome: 'not_found',
            statusCode: 404,
            cacheOutcome: 'not_applicable',
          });
          return reply.code(404).send({
            error: 'artifact_not_found',
            message:
              'The requested immutable document artifact was not published to this environment',
          });
        }

        const body = canonicalJson(publication.artifact.compiled);
        const etag = `"${contentHash}"`;
        const notModified = requestMatchesEtag(request, etag);
        setImmutableArtifactResponseHeaders(reply, etag);
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'artifact',
          outcome: 'found',
          statusCode: notModified ? 304 : 200,
          cacheOutcome: notModified ? 'not_modified' : 'served',
        });
        if (notModified) return reply.code(304).send();
        return reply.type('application/json; charset=utf-8').send(body);
      } catch (error) {
        emitSdkDeliveryResolution(options.observability, observation, scope, {
          resource: 'artifact',
          outcome: 'error',
          statusCode: 500,
          cacheOutcome: 'not_applicable',
        });
        throw error;
      }
    },
  );

  fastify.get(
    SDK_DOCUMENT_PATH,
    { schema: { params: SdkDocumentParams } },
    async (request, reply) => {
      const scope = await resolveSdkDeliveryScope(options.repository, request, reply);
      if (!scope) return;
      const params = request.params as SdkDocumentPathParams;
      if (!requireSdkDeliveryPathScope(scope, params, reply)) return;
      const { documentId } = params;
      const publication = await options.repository.getCurrentPublicationForDocument(
        scope.workspaceId,
        scope.environmentId,
        documentId,
      );
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No active artifact exists for this document in this environment',
        });
      }

      const body = canonicalJson(publication.artifact.compiled);
      const etag = `"${publication.contentHash}"`;
      setManifestResponseHeaders(reply, etag);
      if (requestMatchesEtag(request, etag)) return reply.code(304).send();
      return reply.type('application/json; charset=utf-8').send(body);
    },
  );

  fastify.post(
    '/v1/sdk/events',
    { schema: { body: SdkIngestEventsBody } },
    async (request, reply) => {
      if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
        const resolved = await resolvePublicSdkRequest(options.repository, request, reply);
        if (!resolved) return;
        const body = request.body as { events: unknown[] };
        return ingestAuthoritativeSdkEvents(
          options.repository,
          {
            workspaceId: resolved.installation.workspaceId,
            environmentId: resolved.environment.id,
          },
          body.events,
          reply,
        );
      }

      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      const body = request.body as { events: unknown[] };
      return ingestAuthoritativeSdkEvents(
        options.repository,
        { workspaceId: token.workspaceId, environmentId: token.environmentId },
        body.events,
        reply,
      );
    },
  );

  fastify.get(
    '/v1/sdk/authoring/document',
    {
      schema: {
        response: {
          200: AuthoringDocumentPayload,
          401: ApiErrorResponse,
          403: ApiErrorResponse,
          404: ApiErrorResponse,
          409: ApiErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const authoringSession = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!authoringSession) return;
      setCredentialResponseHeaders(reply);

      const record = await options.repository.getDocument(
        token.workspaceId,
        authoringSession.documentId,
      );
      if (!record) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const theme = await resolveDocumentTheme(options.repository, record.document);
      if (!authoringSessionThemeMatches(authoringSession, theme)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }

      return validateAuthoringDocumentPayload({ document: record.document, theme });
    },
  );

  fastify.post(
    '/v1/sdk/authoring/document',
    { schema: { body: SdkAuthoringDocumentBody } },
    async (request, reply) => {
      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireDirectSdkAuthoringOrigin(token, request, reply)) return;

      const authoringSession = await authenticateAuthoringSessionForToken(
        options.repository,
        token,
        request,
        reply,
      );
      if (!authoringSession) return;
      setCredentialResponseHeaders(reply);

      const body = request.body as { document: unknown };
      const canonical = validate(LodariqDocument, body.document);
      if (!canonical.valid) {
        return reply.code(400).send({
          error: 'invalid_document',
          message: 'Request body must contain canonical Lodariq block JSON',
          issues: canonical.errors,
        });
      }

      const document = canonical.value;
      if (document.workspaceId !== token.workspaceId) {
        return reply.code(403).send({
          error: 'workspace_mismatch',
          message: 'Document workspaceId must match the SDK token workspace',
        });
      }

      if (document.id !== authoringSession.documentId) {
        return reply.code(403).send({
          error: 'authoring_session_mismatch',
          message: 'Authoring session does not match the document being saved',
        });
      }

      const compiled = await compileAndValidate(options.repository, document);
      if (!authoringSessionArtifactMatches(authoringSession, compiled)) {
        return sendAuthoringSessionCompatibilityChanged(reply);
      }
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'compile.completed',
          correlationId: authoringSession.correlationId,
          workspaceId: token.workspaceId,
          documentId: document.id,
          environmentId: authoringSession.environmentId,
          userId: authoringSession.createdByUserId,
          attributes: { source: 'creator-save', contentHash: compiled.contentHash },
        }),
      );
      const saved = await options.repository.saveDocument({
        workspaceId: token.workspaceId,
        actorUserId: authoringSession.createdByUserId,
        document,
        artifact: compiled,
      });
      emitObservability(
        options.observability,
        createObservabilityEvent({
          name: 'authoring.save.completed',
          correlationId: authoringSession.correlationId,
          workspaceId: token.workspaceId,
          documentId: document.id,
          environmentId: authoringSession.environmentId,
          userId: authoringSession.createdByUserId,
          attributes: { contentHash: saved.latestArtifact?.contentHash },
        }),
      );

      return reply.code(200).send({
        document: {
          id: saved.document.id,
          workspaceId: saved.document.workspaceId,
          title: saved.document.title,
          updatedAt: saved.updatedAt,
          latestContentHash: saved.latestArtifact?.contentHash,
        },
        artifact: saved.latestArtifact
          ? {
              id: saved.latestArtifact.id,
              contentHash: saved.latestArtifact.contentHash,
              compilerVersion: saved.latestArtifact.compilerVersion,
              createdAt: saved.latestArtifact.createdAt,
            }
          : null,
      });
    },
  );
}
