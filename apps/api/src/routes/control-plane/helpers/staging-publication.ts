import { basicVisualPreflightIssueLabel, isPublishReadinessBlocker } from '@lodariq/schema';
import {
  DeploymentChangedError,
  EnvironmentReleasePolicyChangedError,
  EnvironmentPolicyMutationForbiddenError,
  IdempotencyConflictError,
  ReleaseOperationInProgressError,
  AccessibilityReleaseBlockedError,
  type AuthoringSessionRecord,
  type PersistedCompiledArtifact,
  type VisualCheckRunRecord,
} from '@lodariq/database';
import { assertAccessibilityReleaseGate } from '../../../accessibility-governance';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createObservabilityEvent } from '../../../observability';
import { enqueueReleaseWebhookEvent } from '../../../governance-events';
import { emitObservability } from '../../control-plane-access';
import type { ControlPlaneRouteOptions } from '../../control-plane-context';
import {
  IDEMPOTENCY_KEY_HEADER,
  RELEASE_CORRELATION_ID_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  RELEASE_CORRELATION_ID_PATTERN,
} from '../support';
import type { AuthoringReleaseClient } from './release-recovery';
import {
  authoringSessionArtifactMatches,
  sendAuthoringSessionCompatibilityChanged,
} from './session-capabilities';
import { validateAuthoringStagingPublicationResult } from './authoring-auth';
import { resolveCurrentAuthoringMembershipRole } from './authoring-membership';
import {
  findEnvironmentPolicyScope,
  requireDirectPublishEnvironmentPolicy,
  loadReviewedReleaseArtifact,
  findVisualCheckForArtifact,
  createStagingPublicationRequestHash,
  runAndPersistVisualPreflight,
} from './activated-session';
import { readHeader } from './sdk-auth';
import {
  hasLegacyThemeReference,
  getThemeReleaseReview,
  toPublishReadinessIssueResponse,
  toPublicationResponse,
  validateDocumentReleaseReadiness,
  validMediaAssetsForDocument,
  compiledMediaAssetIds,
} from './document-compilation';

export async function handleAuthoringStagingPublication(
  options: ControlPlaneRouteOptions,
  session: AuthoringSessionRecord,
  request: FastifyRequest,
  reply: FastifyReply,
  client: AuthoringReleaseClient,
) {
  if (session.environment !== 'staging') {
    return reply.code(409).send({
      error: 'staging_authoring_session_required',
      message: 'Open Lodariq on the configured staging origin to publish this draft',
    });
  }
  const [environmentPolicyScope, actorRole] = await Promise.all([
    findEnvironmentPolicyScope(options.repository, session.workspaceId, session.environmentId),
    resolveCurrentAuthoringMembershipRole(options.repository, session),
  ]);
  if (!environmentPolicyScope || !actorRole) {
    return reply.code(403).send({
      error: 'environment_policy_forbidden',
      message: 'An active configured staging policy and workspace membership are required',
    });
  }
  if (
    !requireDirectPublishEnvironmentPolicy(
      environmentPolicyScope.policy,
      { role: actorRole, userId: session.createdByUserId },
      reply,
    )
  ) {
    return;
  }

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

  const record = await options.repository.getDocument(session.workspaceId, session.documentId);
  if (!record) {
    return reply.code(404).send({ error: 'not_found', message: 'Authoring document not found' });
  }
  const { expectedGeneration, expectedArtifactId, expectedContentHash } = request.body as {
    expectedGeneration: number;
    expectedArtifactId: string;
    expectedContentHash: string;
  };
  const requestHash = await createStagingPublicationRequestHash({
    workspaceId: session.workspaceId,
    documentId: session.documentId,
    environmentId: session.environmentId,
    artifactId: expectedArtifactId,
    contentHash: expectedContentHash,
    expectedGeneration,
  });
  const existingOperation = await options.repository.getReleaseOperation(
    session.workspaceId,
    session.environmentId,
    session.documentId,
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
      session.workspaceId,
      session.documentId,
      existingOperation.requestedArtifactId,
    );
    if (!existingArtifact) {
      throw new Error('release operation references an unavailable compiled artifact');
    }
    artifact = existingArtifact;
    if (!authoringSessionArtifactMatches(session, artifact.compiled)) {
      return sendAuthoringSessionCompatibilityChanged(reply);
    }
    visualCheck = await findVisualCheckForArtifact(
      options.repository,
      session.workspaceId,
      session.documentId,
      session.environmentId,
      artifact,
    );
  } else {
    const reviewed = await loadReviewedReleaseArtifact(
      options.repository,
      session.workspaceId,
      session.documentId,
      expectedArtifactId,
      expectedContentHash,
    );
    if (!reviewed) {
      return reply.code(409).send({
        error: 'reviewed_artifact_unavailable',
        message: 'The reviewed artifact changed or is no longer available; review staging again',
      });
    }
    const validMediaAssets = await validMediaAssetsForDocument(
      options.repository,
      reviewed.document,
    );
    const publishIssues = validateDocumentReleaseReadiness(reviewed.document, validMediaAssets);
    const blockingPublishIssues = publishIssues.filter(isPublishReadinessBlocker);
    if (blockingPublishIssues.length) {
      return reply.code(409).send({
        error: 'publish_blocked',
        message: blockingPublishIssues[0]?.message ?? 'Document is not ready to publish',
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
    try {
      await assertAccessibilityReleaseGate(
        options.repository,
        session.workspaceId,
        artifact.documentVersionId,
      );
    } catch (error) {
      if (error instanceof AccessibilityReleaseBlockedError) {
        return reply.code(409).send({
          error: error.code,
          message: error.message,
          findings: error.findings,
        });
      }
      throw error;
    }
    if (!authoringSessionArtifactMatches(session, artifact.compiled)) {
      return sendAuthoringSessionCompatibilityChanged(reply);
    }
    visualCheck = await runAndPersistVisualPreflight({
      repository: options.repository,
      workspaceId: session.workspaceId,
      documentId: session.documentId,
      environmentId: session.environmentId,
      artifact,
      actorUserId: session.createdByUserId,
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
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      correlationId,
      artifact,
      actorUserId: session.createdByUserId,
      idempotencyKey,
      requestHash,
      expectedGeneration,
      expectedEnvironmentPolicyUpdatedAt: environmentPolicyScope.environment.updatedAt,
    });
    await options.repository.publishAuthoringMediaAssets(
      session.workspaceId,
      compiledMediaAssetIds(artifact.compiled),
    );
    await enqueueReleaseWebhookEvent(options.repository, {
      workspaceId: session.workspaceId,
      environmentId: session.environmentId,
      documentId: session.documentId,
      operationId: result.operation.id,
      action: 'activated',
      occurredAt: result.operation.completedAt ?? result.publication.publishedAt,
      generation: result.deployment.generation,
      publicationId: result.publication.id,
      contentHash: result.publication.contentHash,
    });
    emitObservability(
      options.observability,
      createObservabilityEvent({
        name: result.replayed ? 'publish.replayed' : 'publish.completed',
        correlationId,
        workspaceId: session.workspaceId,
        documentId: session.documentId,
        environmentId: session.environmentId,
        userId: session.createdByUserId,
        attributes: {
          source: client,
          contentHash: result.publication.contentHash,
          generation: result.deployment.generation,
        },
      }),
    );
    const statusCode = result.replayed ? 200 : 201;
    if (client === 'direct-sdk') {
      const publicationResult = validateAuthoringStagingPublicationResult({
        ok: true,
        replayed: result.replayed,
        generation: result.deployment.generation,
        findings:
          visualCheck?.report.issues.map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            label: basicVisualPreflightIssueLabel(issue.code),
          })) ?? [],
      });
      return reply.code(statusCode).send(publicationResult);
    }
    return reply.code(statusCode).send({
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
}
