import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  RELEASE_RECOVERY_HISTORY_MAX_ITEMS,
  ReleaseRecoveryRequest as ReleaseRecoveryRequestSchema,
  evaluateReleaseRecovery,
  validate,
  type ReleaseRecoveryResult,
  type ReleaseRecoveryStateResponse,
} from '@lodariq/schema';
import {
  type RecoverDocumentReleaseInput,
  type ReleaseRecoveryScopeInput,
  createReleaseRecoveryRequestHash,
  ReleaseRecoveryHistoryLimitExceededError,
} from '../repository';
import { isReleaseArtifactCurrentlyDeployable } from '../release-artifact-compatibility';
import { documentDeployments, publications, releaseOperations } from '../schema';
import {
  drizzleRecoveryOperationMatchesRequest,
  drizzleNonPersistingRecoveryFailure,
  drizzlePersistedRecoveryFailure,
  drizzleReleaseRecoveryPolicyFailure,
  drizzleReleaseRecoveryPermissions,
  buildDrizzleReleaseRecoveryHistory,
  toPersistedDocumentDeployment,
  toPersistedReleaseOperation,
} from './helpers';
import { DrizzleRepositoryDocuments } from './documents';

export class DrizzleRepositoryRecovery extends DrizzleRepositoryDocuments {
  async getReleaseRecoveryState(
    input: ReleaseRecoveryScopeInput,
  ): Promise<ReleaseRecoveryStateResponse | null> {
    return this.scoped(input.workspaceId, async (tx) => {
      const scope = await this.loadReleaseRecoveryScope(tx, input, false);
      if (!scope) return null;
      const deploymentRow = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.environmentId,
        input.documentId,
      );
      const deployment = deploymentRow ? toPersistedDocumentDeployment(deploymentRow) : null;
      const operations = await this.loadReleaseRecoveryOperations(tx, input);
      const materials = await this.loadReleaseRecoveryPublicationMaterials(
        tx,
        input,
        scope.environment.kind,
        operations,
      );
      const history = buildDrizzleReleaseRecoveryHistory(materials, operations);
      if (history.length > RELEASE_RECOVERY_HISTORY_MAX_ITEMS) {
        throw new ReleaseRecoveryHistoryLimitExceededError(history.length);
      }
      const rollbackTargetPublicationIds = materials
        .filter(
          ({ publication, operation }) =>
            deployment?.state === 'active' &&
            operation.resultGeneration !== null &&
            operation.resultGeneration < deployment.generation &&
            publication.id !== deployment.activePublicationId &&
            isReleaseArtifactCurrentlyDeployable(publication.artifact),
        )
        .map(({ publication }) => publication.id)
        .sort();
      return {
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        permissions: drizzleReleaseRecoveryPermissions(
          scope.environment,
          scope.membershipRole,
          input.actorUserId,
        ),
        deployment,
        history,
        rollbackTargetPublicationIds: [...new Set(rollbackTargetPublicationIds)],
      };
    });
  }

  async recoverDocumentRelease(
    input: RecoverDocumentReleaseInput,
  ): Promise<ReleaseRecoveryResult | null> {
    const requestContract = validate(ReleaseRecoveryRequestSchema, input.request);
    if (!requestContract.valid) throw new Error('release recovery request is invalid');
    const request = requestContract.value;
    return this.scoped(input.workspaceId, async (tx) => {
      await this.lockSortedReleaseDocumentEnvironments(tx, input.workspaceId, input.documentId, [
        input.environmentId,
      ]);
      const scope = await this.loadReleaseRecoveryScope(tx, input, true);
      if (!scope) return null;

      const requestHash = createReleaseRecoveryRequestHash(input, request);
      const [existingRow] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, input.workspaceId),
            eq(releaseOperations.environmentId, input.environmentId),
            eq(releaseOperations.documentId, input.documentId),
            eq(releaseOperations.idempotencyKey, request.idempotencyKey),
          ),
        )
        .limit(1)
        .for('update');
      if (existingRow) {
        const existing = toPersistedReleaseOperation(existingRow);
        if (!drizzleRecoveryOperationMatchesRequest(existing, input, request, requestHash)) {
          return drizzleNonPersistingRecoveryFailure(request, 'idempotency_conflict');
        }
        if (existing.status === 'activating' || existing.status === 'awaiting_approval') {
          return drizzleNonPersistingRecoveryFailure(
            request,
            'release_operation_in_progress',
            existing.id,
          );
        }
        const replay = await this.materializeReleaseRecoveryResult(tx, existing, true);
        return replay ?? drizzleNonPersistingRecoveryFailure(request, 'internal_error');
      }

      const deploymentRow = await this.findDocumentDeploymentForUpdate(tx, input);
      const deployment = deploymentRow ? toPersistedDocumentDeployment(deploymentRow) : null;
      const occurredAt = new Date();
      const occurredAtIso = occurredAt.toISOString();
      const operationId = `relop_${randomUUID()}`;
      const publicationId = request.action === 'rollback' ? `pub_${randomUUID()}` : undefined;
      const policyFailure = drizzleReleaseRecoveryPolicyFailure(
        scope.environment,
        scope.membershipRole,
        input.actorUserId,
        request.action,
      );
      if (policyFailure) {
        const result = drizzlePersistedRecoveryFailure(
          request,
          policyFailure,
          operationId,
          deployment,
        );
        await this.insertFailedReleaseRecoveryOperation(
          tx,
          input,
          request,
          requestHash,
          operationId,
          occurredAt,
          result,
        );
        return result;
      }

      const operations = await this.loadReleaseRecoveryOperations(tx, input);
      const materials = await this.loadReleaseRecoveryPublicationMaterials(
        tx,
        input,
        scope.environment.kind,
        operations,
      );
      const operationSnapshots = await this.materializeReleaseRecoveryOperationSnapshots(
        tx,
        operations,
      );
      const deployableRollbackTargetPublicationIds = new Set(
        materials
          .filter(({ publication }) => isReleaseArtifactCurrentlyDeployable(publication.artifact))
          .map(({ publication }) => publication.id),
      );
      const evaluationBase = {
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: input.documentId,
        actorUserId: input.actorUserId,
        deployment,
        publications: materials.map(({ snapshot }) => snapshot),
        operations: operationSnapshots,
        request,
        newReleaseOperationId: operationId,
        occurredAt: occurredAtIso,
      };
      const decision =
        request.action === 'rollback'
          ? evaluateReleaseRecovery({
              ...evaluationBase,
              request,
              newPublicationId: publicationId!,
              deployableRollbackTargetPublicationIds,
            })
          : evaluateReleaseRecovery({ ...evaluationBase, request });

      if (decision.kind === 'replay') return decision.result;
      if (decision.kind === 'reject') {
        if (decision.persistFailure) {
          await this.insertFailedReleaseRecoveryOperation(
            tx,
            input,
            request,
            requestHash,
            operationId,
            occurredAt,
            decision.result,
          );
        }
        return decision.result;
      }

      if (
        !deploymentRow ||
        deploymentRow.state !== 'active' ||
        !deploymentRow.activePublicationId
      ) {
        return drizzleNonPersistingRecoveryFailure(request, 'internal_error');
      }
      const targetMaterial =
        decision.action === 'rollback'
          ? materials.find(
              ({ publication }) => publication.id === decision.publication.sourcePublicationId,
            )
          : null;
      if (
        decision.action === 'rollback' &&
        (!targetMaterial ||
          targetMaterial.publication.compiledArtifactId !==
            decision.result.artifact.compiledArtifactId)
      ) {
        return drizzleNonPersistingRecoveryFailure(request, 'internal_error');
      }

      const [activatingOperation] = await tx
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
          actualActivePublicationId: null,
          sourcePublicationId: null,
          expectedGeneration: request.expectedGeneration,
          resultGeneration: null,
          idempotencyKey: request.idempotencyKey,
          requestHash,
          status: 'activating',
          correlationId: request.correlationId,
          requestedByUserId: input.actorUserId,
          resultPublicationId: null,
          reason: request.reason,
          errorCode: null,
          createdAt: occurredAt,
          completedAt: null,
        })
        .returning();
      if (!activatingOperation) throw new Error('failed to create release recovery operation');

      if (decision.action === 'rollback' && targetMaterial) {
        const [publication] = await tx
          .insert(publications)
          .values({
            id: decision.publication.id,
            workspaceId: input.workspaceId,
            correlationId: request.correlationId,
            environmentId: input.environmentId,
            documentId: input.documentId,
            documentVersionId: targetMaterial.publication.documentVersionId,
            compiledArtifactId: targetMaterial.publication.compiledArtifactId,
            contentHash: targetMaterial.publication.contentHash,
            action: 'rollback',
            sourcePublicationId: targetMaterial.publication.id,
            previousPublicationId: deploymentRow.activePublicationId,
            releaseOperationId: operationId,
            publishedByUserId: input.actorUserId,
            publishedAt: occurredAt,
          })
          .returning({ id: publications.id });
        if (!publication) throw new Error('failed to create rollback publication');
      }

      const [updatedDeployment] = await tx
        .update(documentDeployments)
        .set(
          decision.action === 'rollback'
            ? {
                state: 'active',
                activePublicationId: decision.result.publicationId,
                pendingReleaseOperationId: null,
                generation: decision.result.generation,
                updatedAt: occurredAt,
              }
            : {
                state: 'inactive',
                activePublicationId: null,
                pendingReleaseOperationId: null,
                generation: decision.result.generation,
                updatedAt: occurredAt,
              },
        )
        .where(
          and(
            eq(documentDeployments.workspaceId, input.workspaceId),
            eq(documentDeployments.environmentId, input.environmentId),
            eq(documentDeployments.documentId, input.documentId),
            eq(documentDeployments.state, 'active'),
            eq(documentDeployments.generation, request.expectedGeneration),
            eq(documentDeployments.activePublicationId, deploymentRow.activePublicationId),
            isNull(documentDeployments.pendingReleaseOperationId),
          ),
        )
        .returning({ generation: documentDeployments.generation });
      if (!updatedDeployment) throw new Error('release recovery deployment CAS failed');

      const [completedOperation] = await tx
        .update(releaseOperations)
        .set({
          status: 'completed',
          requestedArtifactId: targetMaterial?.publication.compiledArtifactId ?? null,
          sourcePublicationId: targetMaterial?.publication.id ?? null,
          actualActivePublicationId: deploymentRow.activePublicationId,
          resultPublicationId:
            decision.action === 'rollback' ? decision.result.publicationId : null,
          resultGeneration: decision.result.generation,
          errorCode: null,
          completedAt: occurredAt,
        })
        .where(
          and(eq(releaseOperations.id, operationId), eq(releaseOperations.status, 'activating')),
        )
        .returning({ id: releaseOperations.id });
      if (!completedOperation) throw new Error('failed to complete release recovery operation');
      return decision.result;
    });
  }
}
