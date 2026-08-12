import {
  type ControlPlaneRole,
  type ReleaseHistoryEntry,
  type ReleaseRecoveryOperationSnapshot,
} from '@lodariq/schema';
import { extractHistoricalReleaseArtifactPins } from '../release-artifact-compatibility';
import { type WorkspaceEnvironment } from '../domains/environments';
import {
  ReleaseRecoveryHistoryIntegrityError,
  type ReleaseRecoveryPublicationMaterial,
  type ReleaseRecoveryScopeInput,
} from '../domains/releases';
import {
  releaseRecoveryRequestFromOperation,
  toControlPlaneRole,
} from '../domains/release-recovery';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryRecoveryResults } from './recovery-results';

export class InMemoryRepositoryRecoverySnapshots extends InMemoryRepositoryRecoveryResults {
  protected resolveReleaseRecoveryScope(input: ReleaseRecoveryScopeInput): {
    environment: WorkspaceEnvironment;
    membershipRole: ControlPlaneRole | null;
  } | null {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!environment || !document) return null;
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    const membershipRole = toControlPlaneRole(membership?.role);
    if (!membershipRole) return null;
    return {
      environment: clone(environment),
      membershipRole,
    };
  }

  protected buildReleaseRecoveryPublicationSnapshots(
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): ReleaseRecoveryPublicationMaterial[] {
    const publications =
      this.publications.get(this.key(input.workspaceId, input.environmentId)) ?? [];
    const publicationById = new Map(
      publications
        .filter((publication) => publication.documentId === input.documentId)
        .map((publication) => [publication.id, publication] as const),
    );
    const materials: ReleaseRecoveryPublicationMaterial[] = [];
    for (const operation of this.releaseOperations.values()) {
      if (
        operation.workspaceId !== input.workspaceId ||
        operation.environmentId !== input.environmentId ||
        operation.documentId !== input.documentId ||
        operation.status !== 'completed' ||
        operation.action === 'unpublish'
      ) {
        continue;
      }
      if (
        !operation.resultPublicationId ||
        operation.resultGeneration === null ||
        operation.resultGeneration < 1 ||
        !operation.completedAt
      ) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const publication = publicationById.get(operation.resultPublicationId);
      if (
        !publication ||
        publication.releaseOperationId !== operation.id ||
        publication.action !== operation.action ||
        publication.compiledArtifactId !== operation.requestedArtifactId ||
        ((operation.action === 'promote' || operation.action === 'rollback') &&
          (!operation.sourcePublicationId ||
            publication.sourcePublicationId !== operation.sourcePublicationId)) ||
        (operation.action === 'rollback' &&
          (!operation.actualActivePublicationId ||
            publication.previousPublicationId !== operation.actualActivePublicationId ||
            !operation.reason))
      ) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const artifact = extractHistoricalReleaseArtifactPins(publication.artifact);
      if (!artifact) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      materials.push({
        publication: clone(publication),
        operation: clone(operation),
        snapshot: {
          id: publication.id,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          generation: operation.resultGeneration,
          outcome: 'succeeded',
          artifact,
        },
      });
    }
    return materials.sort(
      (left, right) =>
        left.snapshot.generation - right.snapshot.generation ||
        left.publication.id.localeCompare(right.publication.id),
    );
  }

  protected buildReleaseRecoveryOperationSnapshots(
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): ReleaseRecoveryOperationSnapshot[] {
    const snapshots: ReleaseRecoveryOperationSnapshot[] = [];
    for (const operation of this.releaseOperations.values()) {
      if (
        operation.workspaceId !== input.workspaceId ||
        operation.environmentId !== input.environmentId ||
        operation.documentId !== input.documentId ||
        (operation.action !== 'rollback' && operation.action !== 'unpublish') ||
        (operation.status !== 'completed' && operation.status !== 'failed')
      ) {
        continue;
      }
      const request = releaseRecoveryRequestFromOperation(operation);
      const result = this.releaseRecoveryResultFromOperation(operation, false);
      if (!request || !result) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      snapshots.push({
        id: operation.id,
        workspaceId: operation.workspaceId,
        environmentId: operation.environmentId,
        documentId: operation.documentId,
        request,
        result,
      });
    }
    return snapshots;
  }

  protected buildReleaseRecoveryHistory(
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): ReleaseHistoryEntry[] {
    const history: ReleaseHistoryEntry[] = [];
    const successfulMaterials = this.buildReleaseRecoveryPublicationSnapshots(input);
    for (const { operation, publication, snapshot } of successfulMaterials) {
      if (!operation.completedAt || operation.resultGeneration === null) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const identity = {
        id: operation.id,
        workspaceId: operation.workspaceId,
        environmentId: operation.environmentId,
        documentId: operation.documentId,
        releaseOperationId: operation.id,
        generation: operation.resultGeneration,
        idempotencyKey: operation.idempotencyKey,
        correlationId: operation.correlationId,
        actorUserId: operation.requestedByUserId,
        occurredAt: operation.completedAt,
      };
      if (operation.action === 'publish') {
        history.push({
          ...identity,
          action: 'publish',
          state: 'active',
          publicationId: publication.id,
          previousPublicationId: publication.previousPublicationId,
          artifact: clone(snapshot.artifact),
        });
      } else if (operation.action === 'promote' && operation.sourcePublicationId) {
        history.push({
          ...identity,
          action: 'promote',
          state: 'active',
          publicationId: publication.id,
          sourcePublicationId: operation.sourcePublicationId,
          previousPublicationId: publication.previousPublicationId,
          artifact: clone(snapshot.artifact),
        });
      } else if (
        operation.action === 'rollback' &&
        operation.sourcePublicationId &&
        publication.previousPublicationId &&
        operation.reason
      ) {
        history.push({
          ...identity,
          action: 'rollback',
          state: 'active',
          publicationId: publication.id,
          targetPublicationId: operation.sourcePublicationId,
          previousPublicationId: publication.previousPublicationId,
          reason: operation.reason,
          artifact: clone(snapshot.artifact),
        });
      } else {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
    }

    for (const operation of this.releaseOperations.values()) {
      if (
        operation.workspaceId !== input.workspaceId ||
        operation.environmentId !== input.environmentId ||
        operation.documentId !== input.documentId ||
        (operation.action !== 'rollback' && operation.action !== 'unpublish') ||
        (operation.status !== 'completed' && operation.status !== 'failed')
      ) {
        continue;
      }
      if (!operation.completedAt || !operation.reason) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
      const request = releaseRecoveryRequestFromOperation(operation);
      const result = this.releaseRecoveryResultFromOperation(operation, false);
      if (!request || !result) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      if (result.ok && result.action === 'unpublish') {
        history.push({
          id: operation.id,
          workspaceId: operation.workspaceId,
          environmentId: operation.environmentId,
          documentId: operation.documentId,
          releaseOperationId: operation.id,
          generation: result.generation,
          idempotencyKey: operation.idempotencyKey,
          correlationId: operation.correlationId,
          actorUserId: operation.requestedByUserId,
          occurredAt: operation.completedAt,
          action: 'unpublish',
          state: 'inactive',
          previousPublicationId: result.previousPublicationId,
          reason: operation.reason,
          deactivatedArtifact: clone(result.deactivatedArtifact),
        });
      } else if (!result.ok) {
        const failureBase = {
          id: operation.id,
          workspaceId: operation.workspaceId,
          environmentId: operation.environmentId,
          documentId: operation.documentId,
          releaseOperationId: operation.id,
          idempotencyKey: operation.idempotencyKey,
          correlationId: operation.correlationId,
          actorUserId: operation.requestedByUserId,
          occurredAt: operation.completedAt,
          state: 'failed' as const,
          reason: operation.reason,
          expectedGeneration: operation.expectedGeneration,
          ...(result.actualGeneration !== undefined
            ? { actualGeneration: result.actualGeneration }
            : {}),
          ...(result.expectedActivePublicationId
            ? { expectedActivePublicationId: result.expectedActivePublicationId }
            : {}),
          ...(result.actualActivePublicationId !== undefined
            ? { actualActivePublicationId: result.actualActivePublicationId }
            : {}),
          failure: { code: result.code, message: result.message },
        };
        history.push(
          request.action === 'rollback'
            ? {
                ...failureBase,
                action: 'rollback',
                targetPublicationId: request.targetPublicationId,
              }
            : { ...failureBase, action: 'unpublish' },
        );
      }
    }
    return history.sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id),
    );
  }
}
