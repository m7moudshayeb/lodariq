import {
  AUTHORING_SESSION_CAPABILITIES,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type ReleaseRecoveryRequest as ReleaseRecoveryRequestType,
  type ReleaseRecoveryResult as ReleaseRecoveryResultType,
  type ReleaseRecoveryStateResponse as ReleaseRecoveryStateResponseType,
} from '@lodariq/schema';
import {
  ReleaseRecoveryHistoryIntegrityError,
  ReleaseRecoveryHistoryLimitExceededError,
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
} from '@lodariq/database';
import type { FastifyReply } from 'fastify';
import { enqueueReleaseWebhookEvent } from '../../../governance-events';
import {
  ReleaseRecoveryResponseValidationError,
  releaseRecoveryHttpStatus,
  validateReleaseRecoveryResult,
  validateReleaseRecoveryStateResponse,
} from '../../../releases/recovery';

export interface ReleaseRecoveryHttpScope {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  actorUserId: string;
}

export async function handleReleaseRecoveryState(
  repository: ControlPlaneRepository,
  scope: ReleaseRecoveryHttpScope,
  reply: FastifyReply,
  permissionIntersection?: { rollback: boolean; unpublish: boolean },
) {
  let validated: ReleaseRecoveryStateResponseType;
  try {
    const state = await repository.getReleaseRecoveryState(scope);
    if (!state) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Release recovery scope was not found',
      });
    }
    const repositoryState = validateReleaseRecoveryStateResponse(state, scope);
    const response = permissionIntersection
      ? {
          ...repositoryState,
          permissions: {
            rollback: repositoryState.permissions.rollback && permissionIntersection.rollback,
            unpublish: repositoryState.permissions.unpublish && permissionIntersection.unpublish,
          },
        }
      : repositoryState;
    validated = validateReleaseRecoveryStateResponse(response, scope);
  } catch (error) {
    if (!isReleaseRecoveryReadBoundaryError(error)) throw error;
    return reply.code(500).send({
      error: 'release_recovery_history_unavailable',
      message: 'Complete release recovery history is temporarily unavailable',
    });
  }
  return reply.code(200).send(validated);
}

export function authoringRecoveryPermissionIntersection(session: AuthoringSessionRecord) {
  const staging = session.environment === 'staging';
  return {
    rollback:
      staging &&
      session.capabilities?.includes(AUTHORING_SESSION_CAPABILITIES.ROLLBACK_RELEASE) === true,
    unpublish:
      staging &&
      session.capabilities?.includes(AUTHORING_SESSION_CAPABILITIES.UNPUBLISH_RELEASE) === true,
  };
}

export async function handleReleaseRecoveryMutation(
  repository: ControlPlaneRepository,
  scope: ReleaseRecoveryHttpScope,
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
) {
  let validated: ReleaseRecoveryResultType;
  try {
    const result = await repository.recoverDocumentRelease({ ...scope, request });
    if (!result) return sendMissingReleaseRecoveryScope(request, reply);
    validated = validateReleaseRecoveryResult(result);
    if (validated.ok) {
      await enqueueReleaseWebhookEvent(repository, {
        workspaceId: scope.workspaceId,
        environmentId: scope.environmentId,
        documentId: scope.documentId,
        operationId: validated.releaseOperationId,
        action: validated.action === 'rollback' ? 'rolled_back' : 'unpublished',
        occurredAt: validated.completedAt,
        generation: validated.generation,
        ...(validated.action === 'rollback'
          ? {
              publicationId: validated.publicationId,
              contentHash: validated.artifact.contentHash,
            }
          : { contentHash: validated.deactivatedArtifact.contentHash }),
      });
    }
  } catch (error) {
    if (!isReleaseRecoveryReadBoundaryError(error)) throw error;
    return reply
      .code(500)
      .send(
        validateReleaseRecoveryResult(releaseRecoveryGatewayFailure(request, 'internal_error')),
      );
  }
  return reply.code(releaseRecoveryHttpStatus(validated)).send(validated);
}

export function releaseRecoveryGatewayFailure(
  request: ReleaseRecoveryRequestType,
  code: 'capability_denied' | 'document_not_found' | 'internal_error',
): ReleaseRecoveryResultType {
  return {
    ok: false,
    action: request.action,
    state: 'failed',
    replayed: false,
    code,
    message: RELEASE_RECOVERY_FAILURE_MESSAGES[code],
    expectedGeneration: request.expectedGeneration,
    ...(request.expectedActivePublicationId
      ? { expectedActivePublicationId: request.expectedActivePublicationId }
      : {}),
  };
}

export function isReleaseRecoveryReadBoundaryError(error: unknown): boolean {
  return (
    error instanceof ReleaseRecoveryHistoryIntegrityError ||
    error instanceof ReleaseRecoveryHistoryLimitExceededError ||
    error instanceof ReleaseRecoveryResponseValidationError
  );
}

export function sendReleaseRecoveryCapabilityDenied(
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
) {
  return reply
    .code(403)
    .send(
      validateReleaseRecoveryResult(releaseRecoveryGatewayFailure(request, 'capability_denied')),
    );
}

export function sendMissingReleaseRecoveryScope(
  request: ReleaseRecoveryRequestType,
  reply: FastifyReply,
) {
  return reply
    .code(404)
    .send(
      validateReleaseRecoveryResult(releaseRecoveryGatewayFailure(request, 'document_not_found')),
    );
}

export type AuthoringReleaseClient = 'hosted-editor' | 'direct-sdk';
