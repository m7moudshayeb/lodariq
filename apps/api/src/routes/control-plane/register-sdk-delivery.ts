import { canonicalJson } from '@lodariq/compiler';
import {
  AUTHORING_SESSION_CAPABILITIES,
  AuthoringDocumentPayload,
  DataCatalogObservationBatch,
  LodariqDocument,
  SdkFormResponsesBody,
  validate,
  type SdkFormResponsesBody as SdkFormResponsesBodyType,
  type DataCatalogObservationBatch as DataCatalogObservationBatchType,
} from '@lodariq/schema';
import { PUBLIC_MANIFEST_SCHEMA_VERSION } from '@lodariq/schema/version';
import type { FastifyInstance } from 'fastify';
import { DocumentSaveConflictError } from '@lodariq/database';
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
  findAuthoringStepLockConflict,
  directSdkSessionHasCapability,
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
                schemaVersion: PUBLIC_MANIFEST_SCHEMA_VERSION,
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
        const body = request.body as { assignmentKey?: string; events: unknown[] };
        return ingestAuthoritativeSdkEvents(
          options.repository,
          {
            workspaceId: resolved.installation.workspaceId,
            environmentId: resolved.environment.id,
          },
          body.events,
          reply,
          body.assignmentKey,
        );
      }

      const token = await authenticateEnvironmentToken(options.repository, request, reply);
      if (!token) return;
      if (!requireSdkOrigin(token, request, reply)) return;

      const body = request.body as { assignmentKey?: string; events: unknown[] };
      return ingestAuthoritativeSdkEvents(
        options.repository,
        { workspaceId: token.workspaceId, environmentId: token.environmentId },
        body.events,
        reply,
        body.assignmentKey,
      );
    },
  );

  fastify.post(
    '/v1/sdk/catalog-observations',
    { schema: { body: DataCatalogObservationBatch } },
    async (request, reply) => {
      const scope = await resolvePublicSdkScope(options.repository, request, reply);
      if (!scope) return;
      const body = request.body as DataCatalogObservationBatchType;
      const catalog = await options.repository.observeWorkspaceDataCatalog({
        ...scope,
        observations: body.observations,
      });
      return reply.code(202).send({ accepted: body.observations.length, version: catalog.version });
    },
  );

  /**
   * Answers arrive over the same token-bound public channel as SDK events but
   * land through their own endpoint: free text is customer content and must
   * never travel as an analytics property.
   */
  fastify.post(
    '/v1/sdk/form-responses',
    { schema: { body: SdkFormResponsesBody } },
    async (request, reply) => {
      const scope = await resolvePublicSdkScope(options.repository, request, reply);
      if (!scope) return;
      const body = request.body as SdkFormResponsesBodyType;
      /*
       * The deployed artifact, not the document. An installation id is public
       * page source and Origin is forgeable off a browser, so a workspace-wide
       * document lookup let anyone file answers against an experience that was
       * never deployed to this environment.
       */
      const publication = await options.repository.getCurrentPublicationForDocument(
        scope.workspaceId,
        scope.environmentId,
        body.documentId,
      );
      if (!publication) {
        return reply.code(404).send({
          error: 'artifact_not_found',
          message: 'No active artifact exists for this document in this environment',
        });
      }
      const unknownField = body.responses.find(
        (response) =>
          !artifactHasFormField(publication.artifact.compiled, response.stepId, response.blockId),
      );
      if (unknownField) {
        return reply.code(422).send({
          error: 'unknown_form_field',
          message: 'Response does not match a form field in the deployed artifact',
        });
      }
      const accepted = await options.repository.recordFormResponses({
        workspaceId: scope.workspaceId,
        environmentId: scope.environmentId,
        documentId: body.documentId,
        responses: body.responses,
      });
      return reply.code(202).send({ accepted });
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

      return validateAuthoringDocumentPayload({
        document: record.document,
        documentUpdatedAt: record.updatedAt,
        theme,
      });
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

      if (
        !directSdkSessionHasCapability(
          authoringSession,
          AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
        )
      ) {
        return reply.code(403).send({
          error: 'authoring_capability_forbidden',
          message: 'Authoring session does not grant this document operation',
        });
      }

      const body = request.body as {
        document: unknown;
        expectedDocumentUpdatedAt?: string;
      };
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

      if (!body.expectedDocumentUpdatedAt) {
        return reply.code(428).send({
          error: 'precondition_required',
          message: 'Send expectedDocumentUpdatedAt from the loaded draft to save',
        });
      }

      const current = await options.repository.getDocument(token.workspaceId, document.id);
      if (!current) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      const lockConflict = await findAuthoringStepLockConflict(
        options.repository,
        current.document,
        document,
        authoringSession.id,
      );
      if (lockConflict) {
        return reply.code(409).send({
          error: 'step_lock_conflict',
          message: `${lockConflict.holderName} is editing this step`,
          stepId: lockConflict.stepId,
          holderName: lockConflict.holderName,
          expiresAt: lockConflict.expiresAt,
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
      let saved;
      try {
        saved = await options.repository.saveDocument({
          workspaceId: token.workspaceId,
          actorUserId: authoringSession.createdByUserId,
          document,
          artifact: compiled,
          expectedUpdatedAt: body.expectedDocumentUpdatedAt,
        });
      } catch (error) {
        if (error instanceof DocumentSaveConflictError) {
          return reply.code(409).send({
            error: 'document_conflict',
            message: 'The draft changed in another authoring session; reload before saving',
            currentDocumentUpdatedAt: error.currentUpdatedAt,
          });
        }
        throw error;
      }
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

/**
 * Either public-SDK credential resolves to the same thing: which workspace and
 * environment this page is allowed to write to. Callers never read it off the body.
 */
async function resolvePublicSdkScope(
  repository: ControlPlaneRouteOptions['repository'],
  request: Parameters<typeof resolvePublicSdkRequest>[1],
  reply: Parameters<typeof resolvePublicSdkRequest>[2],
): Promise<{ workspaceId: string; environmentId: string } | null> {
  if (readHeader(request, PUBLIC_SDK_INSTALLATION_HEADER)) {
    const resolved = await resolvePublicSdkRequest(repository, request, reply);
    if (!resolved) return null;
    return {
      workspaceId: resolved.installation.workspaceId,
      environmentId: resolved.environment.id,
    };
  }
  const token = await authenticateEnvironmentToken(repository, request, reply);
  if (!token) return null;
  if (!requireSdkOrigin(token, request, reply)) return null;
  return { workspaceId: token.workspaceId, environmentId: token.environmentId };
}

/**
 * An answer names the field it came from. The artifact is the only authority on
 * whether that field exists, so a forged pair is refused rather than stored and
 * counted in a summary nobody can trace back to a rendered control.
 */
function artifactHasFormField(compiled: unknown, stepId: string, blockId: string): boolean {
  const steps = (compiled as { steps?: readonly unknown[] } | null)?.steps;
  if (!Array.isArray(steps)) return false;
  const step = steps.find(
    (candidate): candidate is { id: string; body?: readonly unknown[] } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { id?: unknown }).id === stepId,
  );
  if (!step || !Array.isArray(step.body)) return false;
  return step.body.some(
    (node) =>
      typeof node === 'object' &&
      node !== null &&
      (node as { id?: unknown }).id === blockId &&
      (node as { type?: unknown }).type === 'formField',
  );
}
