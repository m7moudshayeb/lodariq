import { and, asc, eq } from 'drizzle-orm';
import {
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type ReleaseRecoveryFailure,
  type ReleaseRecoveryOperationSnapshot,
  type ReleaseRecoveryRequest,
  type ReleaseRecoveryResult,
} from '@lodariq/schema';
import {
  type PersistedPublication,
  type PersistedReleaseOperation,
  type ReleaseRecoveryScopeInput,
  ReleaseRecoveryHistoryIntegrityError,
} from '../repository';
import { extractHistoricalReleaseArtifactPins } from '../release-artifact-compatibility';
import { compiledArtifacts, publications, releaseOperations } from '../schema';
import type { LodariqTransaction, DrizzleReleaseRecoveryPublicationMaterial } from './types';
import {
  drizzleRecoveryRequestFromOperation,
  isDrizzleRecoveryFailureCode,
  toPersistedArtifact,
  toPersistedPublication,
  toPersistedReleaseOperation,
} from './helpers';
import { DrizzleRepositoryReleaseHelpers } from './release-helpers';

export class DrizzleRepositoryRecoveryHelpers extends DrizzleRepositoryReleaseHelpers {
  protected async loadReleaseRecoveryOperations(
    tx: LodariqTransaction,
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
  ): Promise<PersistedReleaseOperation[]> {
    const rows = await tx
      .select()
      .from(releaseOperations)
      .where(
        and(
          eq(releaseOperations.workspaceId, input.workspaceId),
          eq(releaseOperations.environmentId, input.environmentId),
          eq(releaseOperations.documentId, input.documentId),
        ),
      )
      .orderBy(asc(releaseOperations.createdAt), asc(releaseOperations.id));
    return rows.map(toPersistedReleaseOperation);
  }

  protected async loadReleaseRecoveryPublicationMaterials(
    tx: LodariqTransaction,
    input: Pick<ReleaseRecoveryScopeInput, 'workspaceId' | 'environmentId' | 'documentId'>,
    environmentKind: PersistedPublication['environment'],
    operations: readonly PersistedReleaseOperation[],
  ): Promise<DrizzleReleaseRecoveryPublicationMaterial[]> {
    const rows = await tx
      .select({ publication: publications, artifact: compiledArtifacts })
      .from(publications)
      .innerJoin(
        compiledArtifacts,
        and(
          eq(publications.workspaceId, compiledArtifacts.workspaceId),
          eq(publications.documentId, compiledArtifacts.documentId),
          eq(publications.compiledArtifactId, compiledArtifacts.id),
        ),
      )
      .where(
        and(
          eq(publications.workspaceId, input.workspaceId),
          eq(publications.environmentId, input.environmentId),
          eq(publications.documentId, input.documentId),
        ),
      );
    const qualifyingOperations = operations.filter(
      (operation) => operation.status === 'completed' && operation.action !== 'unpublish',
    );
    for (const operation of qualifyingOperations) {
      if (
        !operation.resultPublicationId ||
        operation.resultGeneration === null ||
        operation.resultGeneration < 1 ||
        !operation.completedAt
      ) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
    }
    const operationByPublicationId = new Map(
      qualifyingOperations.map((operation) => [operation.resultPublicationId!, operation] as const),
    );
    const materials: DrizzleReleaseRecoveryPublicationMaterial[] = [];
    const resolvedOperationIds = new Set<string>();
    for (const row of rows) {
      const artifact = toPersistedArtifact(row.artifact);
      const publication = toPersistedPublication(row.publication, environmentKind, artifact);
      const operation = operationByPublicationId.get(publication.id);
      if (!operation) {
        continue;
      }
      if (
        publication.releaseOperationId !== operation.id ||
        publication.action !== operation.action ||
        publication.compiledArtifactId !== operation.requestedArtifactId ||
        operation.resultGeneration === null ||
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
      const pins = extractHistoricalReleaseArtifactPins(artifact);
      if (!pins) throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      resolvedOperationIds.add(operation.id);
      materials.push({
        publication,
        operation,
        snapshot: {
          id: publication.id,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          generation: operation.resultGeneration,
          outcome: 'succeeded',
          artifact: pins,
        },
      });
    }
    for (const operation of qualifyingOperations) {
      if (!resolvedOperationIds.has(operation.id)) {
        throw new ReleaseRecoveryHistoryIntegrityError(operation.id);
      }
    }
    return materials.sort(
      (left, right) =>
        left.snapshot.generation - right.snapshot.generation ||
        left.publication.id.localeCompare(right.publication.id),
    );
  }

  protected async materializeReleaseRecoveryOperationSnapshots(
    tx: LodariqTransaction,
    operations: readonly PersistedReleaseOperation[],
  ): Promise<ReleaseRecoveryOperationSnapshot[]> {
    const snapshots: ReleaseRecoveryOperationSnapshot[] = [];
    for (const operation of operations) {
      if (
        (operation.action !== 'rollback' && operation.action !== 'unpublish') ||
        (operation.status !== 'completed' && operation.status !== 'failed')
      ) {
        continue;
      }
      const request = drizzleRecoveryRequestFromOperation(operation);
      const result = await this.materializeReleaseRecoveryResult(tx, operation, false);
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

  protected async materializeReleaseRecoveryResult(
    tx: LodariqTransaction,
    operation: PersistedReleaseOperation,
    replayed: boolean,
  ): Promise<ReleaseRecoveryResult | null> {
    if (operation.action !== 'rollback' && operation.action !== 'unpublish') return null;
    if (operation.status === 'failed') {
      if (!isDrizzleRecoveryFailureCode(operation.errorCode)) return null;
      return {
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
      if (!operation.sourcePublicationId || !operation.resultPublicationId) return null;
      const publication = await this.loadPublication(
        tx,
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
    const previousPublication = await this.loadPublication(
      tx,
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

  protected async insertFailedReleaseRecoveryOperation(
    tx: LodariqTransaction,
    input: ReleaseRecoveryScopeInput,
    request: ReleaseRecoveryRequest,
    requestHash: string,
    operationId: string,
    occurredAt: Date,
    result: ReleaseRecoveryFailure,
  ): Promise<void> {
    const [operation] = await tx
      .insert(releaseOperations)
      .values({
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
        resultPublicationId: null,
        expectedGeneration: request.expectedGeneration,
        resultGeneration: result.actualGeneration ?? null,
        idempotencyKey: request.idempotencyKey,
        requestHash,
        status: 'failed',
        correlationId: request.correlationId,
        requestedByUserId: input.actorUserId,
        reason: request.reason,
        errorCode: result.code,
        createdAt: occurredAt,
        completedAt: occurredAt,
      })
      .returning({ id: releaseOperations.id });
    if (!operation) throw new Error('failed to persist release recovery failure');
  }
}
