import { validateTourPublishReadiness } from '@lodariq/schema';
import {
  DeploymentChangedError,
  EnvironmentReleasePolicyChangedError,
  EnvironmentPolicyMutationForbiddenError,
  IdempotencyConflictError,
  ReleaseOperationInProgressError,
  type PersistedCompiledArtifact,
  type VisualCheckRunRecord,
} from '@lodariq/database';
import type { FastifyInstance } from 'fastify';
import { createObservabilityEvent } from '../../observability';
import { authenticate, emitObservability, requireReleaseCapability } from '../control-plane-access';
import { CreateStagingPublicationBody, DocumentParams } from '../control-plane-contracts';
import type { ControlPlaneRouteOptions } from '../control-plane-context';
import {
  IDEMPOTENCY_KEY_HEADER,
  RELEASE_CORRELATION_ID_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  RELEASE_CORRELATION_ID_PATTERN,
} from './support';
import {
  findEnvironment,
  findEnvironmentPolicyRow,
  requireDirectPublishEnvironmentPolicy,
  loadReviewedReleaseArtifact,
  findVisualCheckForArtifact,
  createStagingPublicationRequestHash,
  runAndPersistVisualPreflight,
  readHeader,
  hasLegacyThemeReference,
  getThemeReleaseReview,
  toPublishReadinessIssueResponse,
  toPublicationResponse,
} from './helpers';

export function registerDocumentReleaseRoutes(
  fastify: FastifyInstance,
  options: ControlPlaneRouteOptions,
): void {
  fastify.post(
    '/v1/documents/:documentId/publications',
    { schema: { params: DocumentParams, body: CreateStagingPublicationBody } },
    async (request, reply) => {
      const auth = await authenticate(options.repository, options.authProvider, request, reply);
      if (!auth) return;
      if (!requireReleaseCapability(auth, 'publish-staging', reply)) return;

      const idempotencyKey = readHeader(request, IDEMPOTENCY_KEY_HEADER);
      if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        return reply.code(400).send({
          error: 'invalid_idempotency_key',
          message: 'A valid Idempotency-Key header is required for staging publication',
        });
      }
      const correlationId = readHeader(request, RELEASE_CORRELATION_ID_HEADER);
      if (!correlationId || !RELEASE_CORRELATION_ID_PATTERN.test(correlationId)) {
        return reply.code(400).send({
          error: 'invalid_correlation_id',
          message: `A valid ${RELEASE_CORRELATION_ID_HEADER} header is required`,
        });
      }

      const { documentId } = request.params as { documentId: string };
      const body = request.body as {
        environmentId: string;
        expectedGeneration: number;
        expectedArtifactId: string;
        expectedContentHash: string;
      };
      const [record, environment] = await Promise.all([
        options.repository.getDocument(auth.workspaceId, documentId),
        findEnvironment(options.repository, auth.workspaceId, body.environmentId),
      ]);
      if (!record) {
        return reply.code(404).send({ error: 'not_found', message: 'Document not found' });
      }
      if (!environment) {
        return reply.code(404).send({ error: 'not_found', message: 'Environment not found' });
      }
      if (environment.kind !== 'staging') {
        return reply.code(409).send({
          error: 'staging_environment_required',
          message: 'This Phase 2 publication path accepts the configured staging environment only',
        });
      }
      const environmentPolicy = await findEnvironmentPolicyRow(
        options.repository,
        auth.workspaceId,
        environment.id,
      );
      if (
        !environmentPolicy ||
        !requireDirectPublishEnvironmentPolicy(
          environmentPolicy,
          { role: auth.role, userId: auth.userId },
          reply,
        )
      ) {
        return;
      }

      const requestHash = await createStagingPublicationRequestHash({
        workspaceId: auth.workspaceId,
        documentId,
        environmentId: environment.id,
        artifactId: body.expectedArtifactId,
        contentHash: body.expectedContentHash,
        expectedGeneration: body.expectedGeneration,
      });
      const existingOperation = await options.repository.getReleaseOperation(
        auth.workspaceId,
        environment.id,
        documentId,
        idempotencyKey,
      );
      let artifact: PersistedCompiledArtifact;
      let visualCheck: VisualCheckRunRecord | null;
      if (existingOperation) {
        if (!existingOperation.requestedArtifactId) {
          return reply.code(409).send({
            error: 'idempotency_conflict',
            message: 'The idempotency key belongs to another release action',
          });
        }
        const existingArtifact = await options.repository.getCompiledArtifact(
          auth.workspaceId,
          documentId,
          existingOperation.requestedArtifactId,
        );
        if (!existingArtifact) {
          throw new Error('release operation references an unavailable compiled artifact');
        }
        artifact = existingArtifact;
        visualCheck = await findVisualCheckForArtifact(
          options.repository,
          auth.workspaceId,
          documentId,
          environment.id,
          artifact,
        );
      } else {
        const reviewed = await loadReviewedReleaseArtifact(
          options.repository,
          auth.workspaceId,
          documentId,
          body.expectedArtifactId,
          body.expectedContentHash,
        );
        if (!reviewed) {
          return reply.code(409).send({
            error: 'reviewed_artifact_unavailable',
            message:
              'The reviewed artifact changed or is no longer available; review staging again',
          });
        }
        const publishIssues = validateTourPublishReadiness(reviewed.document);
        if (publishIssues.length) {
          return reply.code(409).send({
            error: 'publish_blocked',
            message: publishIssues[0]?.message ?? 'Document is not ready to publish',
            issues: publishIssues.map(toPublishReadinessIssueResponse),
          });
        }
        if (hasLegacyThemeReference(reviewed.document)) {
          return reply.code(409).send({
            error: 'theme_migration_required',
            message: 'Choose an approved Brand theme before publishing this legacy draft',
          });
        }
        const themeReview = await getThemeReleaseReview(options.repository, reviewed.document);
        if (themeReview) {
          return reply.code(409).send({
            error: 'theme_review_required',
            message: 'Review the latest approved Brand theme before publishing this draft',
            ...themeReview,
          });
        }
        artifact = reviewed.artifact;
        visualCheck = await runAndPersistVisualPreflight({
          repository: options.repository,
          workspaceId: auth.workspaceId,
          documentId,
          environmentId: environment.id,
          artifact,
          actorUserId: auth.userId,
        });
        if (visualCheck.status === 'blocked') {
          return reply.code(409).send({
            error: 'visual_preflight_blocked',
            message: 'Brand and layout preflight found issues that must be fixed before staging',
            visualCheck,
          });
        }
      }

      try {
        const result = await options.repository.activateCompiledArtifact({
          workspaceId: auth.workspaceId,
          environmentId: environment.id,
          correlationId,
          artifact,
          actorUserId: auth.userId,
          idempotencyKey,
          requestHash,
          expectedGeneration: body.expectedGeneration,
          expectedEnvironmentPolicyUpdatedAt: environment.updatedAt,
        });
        emitObservability(
          options.observability,
          createObservabilityEvent({
            name: result.replayed ? 'publish.replayed' : 'publish.completed',
            correlationId,
            workspaceId: auth.workspaceId,
            documentId,
            environmentId: environment.id,
            userId: auth.userId,
            attributes: {
              contentHash: result.publication.contentHash,
              generation: result.deployment.generation,
            },
          }),
        );
        return reply.code(result.replayed ? 200 : 201).send({
          replayed: result.replayed,
          operation: result.operation,
          deployment: result.deployment,
          publication: toPublicationResponse(result.publication),
          visualCheck,
        });
      } catch (error) {
        if (error instanceof EnvironmentReleasePolicyChangedError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        if (error instanceof EnvironmentPolicyMutationForbiddenError) {
          return reply.code(409).send({
            error: error.code,
            code: error.decisionCode,
            message: error.message,
          });
        }
        if (error instanceof IdempotencyConflictError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        if (error instanceof DeploymentChangedError) {
          return reply.code(409).send({
            error: error.code,
            message: error.message,
            expectedGeneration: error.expectedGeneration,
            actualGeneration: error.actualGeneration,
          });
        }
        if (error instanceof ReleaseOperationInProgressError) {
          return reply.code(409).send({ error: error.code, message: error.message });
        }
        throw error;
      }
    },
  );
}
