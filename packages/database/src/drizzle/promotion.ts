import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  type PromoteVerifiedPublicationInput,
  type PromotionResult,
  ActivePublicationChangedError,
  ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
  DEPLOYMENT_CHANGED_ERROR_CODE,
  DeploymentChangedError,
  EnvironmentPolicyMutationForbiddenError,
  assertEnvironmentPolicyMutationAllowed,
  IdempotencyConflictError,
  ReleaseOperationInProgressError,
  PublicationVerificationRequiredError,
  ReleaseApprovalRejectedError,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  assertReleaseMutationGuardInput,
  normalizeWorkspaceEnvironments,
  assertCommercialFeature,
} from '../repository';
import {
  environments,
  publications,
  publicationVerifications,
  releaseOperations,
  workspaceMemberships,
} from '../schema';
import type { PromotionOutcome } from './types';
import {
  toWorkspaceEnvironment,
  toPersistedPublication,
  toPersistedDocumentDeployment,
  toPersistedReleaseOperation,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryReleaseChecks } from './release-checks';

export class DrizzleRepositoryPromotion extends DrizzleRepositoryReleaseChecks {
  async promoteVerifiedPublication(
    input: PromoteVerifiedPublicationInput,
  ): Promise<PromotionResult> {
    assertReleaseMutationGuardInput(input);
    if (!input.expectedSourcePublicationId.trim()) {
      throw new Error('promotion requires an expected source publication');
    }
    const outcome = await this.actorScoped(
      input.workspaceId,
      input.actorUserId,
      async (tx): Promise<PromotionOutcome> => {
      const environmentRows = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            inArray(environments.id, [input.sourceEnvironmentId, input.targetEnvironmentId]),
          ),
        )
        .for('share');
      const sourceEnvironment = environmentRows.find(
        (environment) => environment.id === input.sourceEnvironmentId,
      );
      const targetEnvironment = environmentRows.find(
        (environment) => environment.id === input.targetEnvironmentId,
      );
      if (!sourceEnvironment || sourceEnvironment.kind !== 'staging') {
        throw new Error('production promotion source must be staging');
      }
      if (!targetEnvironment || targetEnvironment.kind !== 'production') {
        throw new Error('production promotion target must be production');
      }

      await this.lockSortedReleaseDocumentEnvironments(tx, input.workspaceId, input.documentId, [
        input.sourceEnvironmentId,
        input.targetEnvironmentId,
      ]);

      let operation = await this.findPromotionOperation(tx, input);
      const replayedRequest = Boolean(operation);
      if (operation) {
        const requestChanged =
          operation.action !== 'promote' ||
          operation.sourcePublicationId !== input.expectedSourcePublicationId ||
          operation.expectedGeneration !== input.expectedGeneration ||
          operation.requestHash !== input.requestHash;
        if (requestChanged) return { kind: 'idempotency_conflict' };
        if (operation.status === 'completed') {
          if (!operation.sourcePublicationId || !operation.resultPublicationId) {
            return { kind: 'failed', errorCode: 'promotion_result_missing' };
          }
          const sourcePublication = await this.loadPublication(
            tx,
            input.workspaceId,
            operation.sourcePublicationId,
          );
          const publication = await this.loadPublication(
            tx,
            input.workspaceId,
            operation.resultPublicationId,
          );
          if (
            !sourcePublication ||
            !publication ||
            operation.resultGeneration === null ||
            operation.requestedArtifactId !== sourcePublication.compiledArtifactId
          ) {
            return { kind: 'failed', errorCode: 'promotion_result_missing' };
          }
          const approvals = await this.findReleaseApprovals(tx, input.workspaceId, operation.id);
          return {
            kind: 'success',
            result: {
              operation: toPersistedReleaseOperation(operation),
              sourcePublication,
              publication,
              deployment: {
                workspaceId: operation.workspaceId,
                environmentId: operation.environmentId,
                documentId: operation.documentId,
                state: 'active',
                activePublicationId: publication.id,
                pendingReleaseOperationId: null,
                generation: operation.resultGeneration,
                updatedAt: toIsoString(operation.completedAt ?? operation.createdAt),
              },
              approvalCount: approvals.filter((approval) => approval.decision === 'approved')
                .length,
              requiredApprovalCount: targetEnvironment.requiredApprovalCount,
              replayed: true,
            },
          };
        }
        if (operation.status === 'activating') return { kind: 'in_progress' };
        if (operation.status === 'failed') {
          if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
            return {
              kind: 'deployment_changed',
              expectedGeneration: operation.expectedGeneration,
              actualGeneration: operation.resultGeneration ?? 0,
            };
          }
          if (operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE) {
            return { kind: 'approval_rejected', operationId: operation.id };
          }
          if (operation.errorCode === ACTIVE_PUBLICATION_CHANGED_ERROR_CODE) {
            return { kind: 'active_publication_changed', actualPublicationId: null };
          }
          return {
            kind: 'failed',
            errorCode: operation.errorCode ?? 'promotion_operation_failed',
          };
        }
      }

      assertCommercialFeature(
        (await this.resolveWorkspaceEntitlements(tx, input.workspaceId)).entitlements,
        'release-management',
      );

      const sourcePolicy = normalizeWorkspaceEnvironments([
        toWorkspaceEnvironment(sourceEnvironment),
      ])[0];
      if (!sourcePolicy?.enabled) {
        throw new EnvironmentPolicyMutationForbiddenError('environment_disabled');
      }
      const targetPolicy = assertEnvironmentPolicyMutationAllowed(
        toWorkspaceEnvironment(targetEnvironment),
        {
          action: 'promote',
          sourceEnvironmentId: input.sourceEnvironmentId,
          expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
        },
      );
      const [membership] = await tx
        .select({ role: workspaceMemberships.role })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, input.actorUserId),
          ),
        )
        .limit(1)
        .for('share');
      if (
        !membership ||
        !targetPolicy.releasePolicy.publisherRoles.some((role) => role === membership.role)
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }

      const sourceDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.sourceEnvironmentId,
        input.documentId,
      );
      const activeSourcePublicationId =
        sourceDeployment?.state === 'active' ? sourceDeployment.activePublicationId : null;
      if (activeSourcePublicationId !== input.expectedSourcePublicationId) {
        if (operation) {
          await this.failPendingPromotionOperation(
            tx,
            operation,
            ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
          );
        }
        return {
          kind: 'active_publication_changed',
          actualPublicationId: activeSourcePublicationId,
        };
      }
      const sourcePublication = sourceDeployment
        ? await this.loadDeploymentPublication(tx, sourceDeployment)
        : null;
      if (!sourcePublication || sourcePublication.id !== input.expectedSourcePublicationId) {
        if (operation) {
          await this.failPendingPromotionOperation(
            tx,
            operation,
            ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
          );
        }
        return {
          kind: 'active_publication_changed',
          actualPublicationId: activeSourcePublicationId,
        };
      }
      if (operation && operation.requestedArtifactId !== sourcePublication.compiledArtifactId) {
        await this.failPendingPromotionOperation(tx, operation, 'promotion_artifact_pin_mismatch');
        return { kind: 'failed', errorCode: 'promotion_artifact_pin_mismatch' };
      }
      const [latestVerification] = await tx
        .select()
        .from(publicationVerifications)
        .where(
          and(
            eq(publicationVerifications.workspaceId, input.workspaceId),
            eq(publicationVerifications.publicationId, sourcePublication.id),
          ),
        )
        .orderBy(desc(publicationVerifications.createdAt), desc(publicationVerifications.id))
        .limit(1);
      if (!latestVerification || latestVerification.result !== 'passed') {
        return { kind: 'verification_required' };
      }

      const targetDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.targetEnvironmentId,
        input.documentId,
      );
      const actualGeneration = targetDeployment?.generation ?? 0;
      const now = new Date();
      if (!operation && targetDeployment?.pendingReleaseOperationId) {
        const [pendingOperation] = await tx
          .select()
          .from(releaseOperations)
          .where(
            and(
              eq(releaseOperations.workspaceId, input.workspaceId),
              eq(releaseOperations.id, targetDeployment.pendingReleaseOperationId),
            ),
          )
          .limit(1);
        const staleSource =
          pendingOperation?.status === 'awaiting_approval' &&
          pendingOperation.sourcePublicationId !== sourcePublication.id;
        if (!pendingOperation || !staleSource) return { kind: 'in_progress' };
        await this.failPendingPromotionOperation(
          tx,
          pendingOperation,
          ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
        );
      }
      if (!operation) {
        const status =
          targetEnvironment.requiredApprovalCount > 0 ? 'awaiting_approval' : 'activating';
        const [insertedOperation] = await tx
          .insert(releaseOperations)
          .values({
            id: `relop_${randomUUID()}`,
            workspaceId: input.workspaceId,
            environmentId: input.targetEnvironmentId,
            documentId: input.documentId,
            action: 'promote',
            requestedArtifactId: sourcePublication.compiledArtifactId,
            requestedSourcePublicationId: null,
            requestedActivePublicationId: null,
            actualActivePublicationId: null,
            sourcePublicationId: sourcePublication.id,
            expectedGeneration: input.expectedGeneration,
            resultGeneration:
              actualGeneration === input.expectedGeneration ? null : actualGeneration,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            status: actualGeneration === input.expectedGeneration ? status : 'failed',
            correlationId: input.correlationId,
            requestedByUserId: input.actorUserId,
            reason: null,
            errorCode:
              actualGeneration === input.expectedGeneration ? null : DEPLOYMENT_CHANGED_ERROR_CODE,
            createdAt: now,
            completedAt: actualGeneration === input.expectedGeneration ? null : now,
          })
          .returning();
        if (!insertedOperation) throw new Error('failed to create promotion operation');
        operation = insertedOperation;
        if (actualGeneration !== input.expectedGeneration) {
          return {
            kind: 'deployment_changed',
            expectedGeneration: input.expectedGeneration,
            actualGeneration,
          };
        }
      }

      const approvals = await this.findReleaseApprovals(tx, input.workspaceId, operation.id);
      if (approvals.some((approval) => approval.decision === 'rejected')) {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, operation.id));
        await this.clearPendingReleaseOperation(tx, operation.id);
        return { kind: 'approval_rejected', operationId: operation.id };
      }
      const approvalCount = approvals.filter((approval) => approval.decision === 'approved').length;
      if (approvalCount < targetEnvironment.requiredApprovalCount) {
        const pendingDeployment = await this.setPendingPromotionDeployment(
          tx,
          input,
          operation.id,
          targetDeployment,
          now,
        );
        if (!pendingDeployment) return { kind: 'in_progress' };
        return {
          kind: 'success',
          result: {
            operation: toPersistedReleaseOperation(operation),
            sourcePublication,
            publication: null,
            deployment: null,
            approvalCount,
            requiredApprovalCount: targetEnvironment.requiredApprovalCount,
            replayed: replayedRequest,
          },
        };
      }

      const currentTargetDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.targetEnvironmentId,
        input.documentId,
      );
      const currentGeneration = currentTargetDeployment?.generation ?? 0;
      if (currentGeneration !== input.expectedGeneration) {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            resultGeneration: currentGeneration,
            errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, operation.id));
        return {
          kind: 'deployment_changed',
          expectedGeneration: input.expectedGeneration,
          actualGeneration: currentGeneration,
        };
      }
      const [publication] = await tx
        .insert(publications)
        .values({
          id: `pub_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.targetEnvironmentId,
          documentId: sourcePublication.documentId,
          documentVersionId: sourcePublication.documentVersionId,
          compiledArtifactId: sourcePublication.compiledArtifactId,
          contentHash: sourcePublication.contentHash,
          action: 'promote',
          sourcePublicationId: sourcePublication.id,
          previousPublicationId:
            currentTargetDeployment?.state === 'active'
              ? currentTargetDeployment.activePublicationId
              : null,
          releaseOperationId: operation.id,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
        })
        .returning();
      if (!publication) throw new Error('failed to create promotion publication');
      const deployment = currentTargetDeployment
        ? await this.advanceExistingDeployment(
            tx,
            currentTargetDeployment,
            publication.id,
            operation.id,
            now,
          )
        : await this.createInitialPromotionDeployment(tx, input, publication.id, now);
      if (!deployment) {
        await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            resultGeneration: currentGeneration,
            errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, operation.id));
        return {
          kind: 'deployment_changed',
          expectedGeneration: input.expectedGeneration,
          actualGeneration: currentGeneration,
        };
      }
      const [completedOperation] = await tx
        .update(releaseOperations)
        .set({
          status: 'completed',
          resultPublicationId: publication.id,
          resultGeneration: deployment.generation,
          errorCode: null,
          completedAt: now,
        })
        .where(eq(releaseOperations.id, operation.id))
        .returning();
      if (!completedOperation) throw new Error('failed to complete promotion operation');
      return {
        kind: 'success',
        result: {
          operation: toPersistedReleaseOperation(completedOperation),
          sourcePublication,
          publication: toPersistedPublication(
            publication,
            targetEnvironment.kind,
            sourcePublication.artifact,
          ),
          deployment: toPersistedDocumentDeployment(deployment),
          approvalCount,
          requiredApprovalCount: targetEnvironment.requiredApprovalCount,
          replayed: false,
        },
      };
    });

    if (outcome.kind === 'success') return outcome.result;
    if (outcome.kind === 'idempotency_conflict') {
      throw new IdempotencyConflictError(input.idempotencyKey);
    }
    if (outcome.kind === 'in_progress') {
      throw new ReleaseOperationInProgressError(input.idempotencyKey);
    }
    if (outcome.kind === 'active_publication_changed') {
      throw new ActivePublicationChangedError(
        input.expectedSourcePublicationId,
        outcome.actualPublicationId,
      );
    }
    if (outcome.kind === 'verification_required') {
      throw new PublicationVerificationRequiredError(input.expectedSourcePublicationId);
    }
    if (outcome.kind === 'approval_rejected') {
      throw new ReleaseApprovalRejectedError(outcome.operationId);
    }
    if (outcome.kind === 'deployment_changed') {
      throw new DeploymentChangedError(outcome.expectedGeneration, outcome.actualGeneration);
    }
    throw new Error(outcome.errorCode);
  }
}
