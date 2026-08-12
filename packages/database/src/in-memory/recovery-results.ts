import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type ReleaseRecoveryFailure,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
} from '@lodariq/schema';
import { extractHistoricalReleaseArtifactPins } from '../release-artifact-compatibility';
import {
  type PersistedReleaseOperation,
  type ReleaseRecoveryScopeInput,
} from '../domains/releases';
import { isReleaseRecoveryFailureCode } from '../domains/release-recovery';
import { InMemoryRepositoryPromotionHelpers } from './promotion-helpers';

export class InMemoryRepositoryRecoveryResults extends InMemoryRepositoryPromotionHelpers {
  protected releaseRecoveryResultFromOperation(
    operation: PersistedReleaseOperation,
    replayed: boolean,
  ): ReleaseRecoveryResult | null {
    if (operation.action !== 'rollback' && operation.action !== 'unpublish') return null;
    if (operation.status === 'failed') {
      if (!isReleaseRecoveryFailureCode(operation.errorCode)) return null;
      const result: ReleaseRecoveryFailure = {
        ok: false,
        action: operation.action,
        state: 'failed',
        replayed,
        code: operation.errorCode,
        message: RELEASE_RECOVERY_FAILURE_MESSAGES[operation.errorCode],
        releaseOperationId: operation.id,
        expectedGeneration: operation.expectedGeneration,
        ...(operation.resultGeneration !== null
          ? { actualGeneration: operation.resultGeneration }
          : {}),
        ...(operation.requestedActivePublicationId
          ? { expectedActivePublicationId: operation.requestedActivePublicationId }
          : {}),
        ...(operation.actualActivePublicationId
          ? { actualActivePublicationId: operation.actualActivePublicationId }
          : operation.errorCode === 'already_inactive'
            ? { actualActivePublicationId: null }
            : {}),
      };
      return result;
    }
    if (
      operation.status !== 'completed' ||
      operation.resultGeneration === null ||
      !operation.completedAt ||
      !operation.actualActivePublicationId
    ) {
      return null;
    }
    if (operation.action === 'rollback') {
      if (
        !operation.sourcePublicationId ||
        !operation.resultPublicationId ||
        !operation.requestedSourcePublicationId
      ) {
        return null;
      }
      const publication = this.findPublicationById(
        operation.workspaceId,
        operation.resultPublicationId,
      );
      const artifact = publication
        ? extractHistoricalReleaseArtifactPins(publication.artifact)
        : null;
      if (
        !publication ||
        !artifact ||
        publication.environmentId !== operation.environmentId ||
        publication.documentId !== operation.documentId ||
        publication.releaseOperationId !== operation.id ||
        publication.action !== 'rollback' ||
        publication.sourcePublicationId !== operation.sourcePublicationId ||
        publication.previousPublicationId !== operation.actualActivePublicationId ||
        publication.compiledArtifactId !== operation.requestedArtifactId
      ) {
        return null;
      }
      return {
        ok: true,
        action: 'rollback',
        state: 'active',
        replayed,
        releaseOperationId: operation.id,
        publicationId: publication.id,
        targetPublicationId: operation.sourcePublicationId,
        previousPublicationId: operation.actualActivePublicationId,
        generation: operation.resultGeneration,
        artifact,
        completedAt: operation.completedAt,
      };
    }
    const previousPublication = this.findPublicationById(
      operation.workspaceId,
      operation.actualActivePublicationId,
    );
    const deactivatedArtifact = previousPublication
      ? extractHistoricalReleaseArtifactPins(previousPublication.artifact)
      : null;
    if (
      !previousPublication ||
      !deactivatedArtifact ||
      previousPublication.environmentId !== operation.environmentId ||
      previousPublication.documentId !== operation.documentId
    ) {
      return null;
    }
    return {
      ok: true,
      action: 'unpublish',
      state: 'inactive',
      replayed,
      releaseOperationId: operation.id,
      previousPublicationId: operation.actualActivePublicationId,
      generation: operation.resultGeneration,
      deactivatedArtifact,
      completedAt: operation.completedAt,
    };
  }

  protected persistFailedRecoveryOperation(
    input: ReleaseRecoveryScopeInput,
    request: ReleaseRecoveryRequest,
    requestHash: string,
    operationId: string,
    occurredAt: string,
    result: ReleaseRecoveryFailure,
  ): void {
    this.releaseOperations.set(
      this.key(input.workspaceId, input.environmentId, input.documentId, request.idempotencyKey),
      {
        id: operationId,
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        action: request.action,
        requestedArtifactId: null,
        requestedSourcePublicationId:
          request.action === 'rollback' ? request.targetPublicationId : null,
        requestedActivePublicationId: request.expectedActivePublicationId ?? null,
        actualActivePublicationId:
          typeof result.actualActivePublicationId === 'string'
            ? result.actualActivePublicationId
            : null,
        sourcePublicationId: null,
        expectedGeneration: request.expectedGeneration,
        resultGeneration: result.actualGeneration ?? null,
        idempotencyKey: request.idempotencyKey,
        requestHash,
        status: 'failed',
        correlationId: request.correlationId,
        requestedByUserId: input.actorUserId,
        resultPublicationId: null,
        reason: request.reason,
        errorCode: result.code,
        createdAt: occurredAt,
        completedAt: occurredAt,
      },
    );
  }
}
