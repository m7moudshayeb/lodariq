import { randomUUID } from 'node:crypto';
import {
  EnvironmentPolicyMutationForbiddenError,
  assertEnvironmentPolicyMutationAllowed,
  normalizeWorkspaceEnvironments,
} from '../domains/environments';
import {
  ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
  DEPLOYMENT_CHANGED_ERROR_CODE,
  RELEASE_APPROVAL_REJECTED_ERROR_CODE,
  ActivePublicationChangedError,
  DeploymentChangedError,
  PublicationVerificationRequiredError,
  ReleaseApprovalRejectedError,
  ReleaseOperationInProgressError,
  type PersistedDocumentDeployment,
  type PersistedReleaseOperation,
  type PromoteVerifiedPublicationInput,
  type PromotionResult,
} from '../domains/releases';
import { assertReleaseMutationGuardInput } from '../domains/authoring-policy';
import { clone, compareAppendOnlyRecordsNewestFirst } from '../domains/in-memory-helpers';
import { InMemoryRepositoryReleaseApprovals } from './release-approvals';

export class InMemoryRepositoryReleasePromotion extends InMemoryRepositoryReleaseApprovals {
  async promoteVerifiedPublication(
    input: PromoteVerifiedPublicationInput,
  ): Promise<PromotionResult> {
    assertReleaseMutationGuardInput(input);
    if (!input.expectedSourcePublicationId.trim()) {
      throw new Error('promotion requires an expected source publication');
    }
    const sourceEnvironment = this.environments.get(
      this.key(input.workspaceId, input.sourceEnvironmentId),
    );
    const targetEnvironment = this.environments.get(
      this.key(input.workspaceId, input.targetEnvironmentId),
    );
    if (!sourceEnvironment || sourceEnvironment.kind !== 'staging') {
      throw new Error('production promotion source must be staging');
    }
    if (!targetEnvironment || targetEnvironment.kind !== 'production') {
      throw new Error('production promotion target must be production');
    }
    const operationKey = this.key(
      input.workspaceId,
      input.targetEnvironmentId,
      input.documentId,
      input.idempotencyKey,
    );
    let operation = this.releaseOperations.get(operationKey);
    const replayedRequest = Boolean(operation);
    if (operation) {
      this.assertMatchingPromotionRequest(input, operation);
      if (operation.status === 'completed') {
        return this.replayCompletedPromotion(
          operation,
          targetEnvironment.requiredApprovalCount ?? 0,
        );
      }
      if (operation.status === 'activating') {
        throw new ReleaseOperationInProgressError(input.idempotencyKey);
      }
      if (operation.status === 'failed') {
        if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
          throw new DeploymentChangedError(
            operation.expectedGeneration,
            operation.resultGeneration ?? 0,
          );
        }
        if (operation.errorCode === RELEASE_APPROVAL_REJECTED_ERROR_CODE) {
          throw new ReleaseApprovalRejectedError(operation.id);
        }
        if (operation.errorCode === ACTIVE_PUBLICATION_CHANGED_ERROR_CODE) {
          const deployment = this.documentDeployments.get(
            this.key(input.workspaceId, input.sourceEnvironmentId, input.documentId),
          );
          throw new ActivePublicationChangedError(
            input.expectedSourcePublicationId,
            deployment?.state === 'active' ? deployment.activePublicationId : null,
          );
        }
        throw new Error(operation.errorCode ?? 'promotion operation failed');
      }
    }

    const sourcePolicy = normalizeWorkspaceEnvironments([sourceEnvironment])[0];
    if (!sourcePolicy?.enabled) {
      throw new EnvironmentPolicyMutationForbiddenError('environment_disabled');
    }
    const targetPolicy = assertEnvironmentPolicyMutationAllowed(targetEnvironment, {
      action: 'promote',
      sourceEnvironmentId: input.sourceEnvironmentId,
      expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
    });
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !membership ||
      !targetPolicy.releasePolicy.publisherRoles.some((role) => role === membership.role)
    ) {
      throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
    }

    const sourceDeployment = this.documentDeployments.get(
      this.key(input.workspaceId, input.sourceEnvironmentId, input.documentId),
    );
    const activeSourcePublicationId =
      sourceDeployment?.state === 'active' ? sourceDeployment.activePublicationId : null;
    if (activeSourcePublicationId !== input.expectedSourcePublicationId) {
      if (operation) {
        this.failPromotionOperation(operationKey, operation, ACTIVE_PUBLICATION_CHANGED_ERROR_CODE);
      }
      throw new ActivePublicationChangedError(
        input.expectedSourcePublicationId,
        activeSourcePublicationId,
      );
    }
    const sourcePublication = sourceDeployment
      ? this.requireDeploymentPublication(sourceDeployment)
      : null;
    if (!sourcePublication || sourcePublication.id !== input.expectedSourcePublicationId) {
      if (operation) {
        this.failPromotionOperation(operationKey, operation, ACTIVE_PUBLICATION_CHANGED_ERROR_CODE);
      }
      throw new ActivePublicationChangedError(
        input.expectedSourcePublicationId,
        activeSourcePublicationId,
      );
    }
    if (operation && operation.requestedArtifactId !== sourcePublication.compiledArtifactId) {
      this.failPromotionOperation(operationKey, operation, 'promotion_artifact_pin_mismatch');
      throw new Error('promotion operation artifact pin does not match its source publication');
    }
    const latestVerification = [
      ...(this.publicationVerifications.get(this.key(input.workspaceId, sourcePublication.id)) ??
        []),
    ].sort(compareAppendOnlyRecordsNewestFirst)[0];
    if (!latestVerification || latestVerification.result !== 'passed') {
      throw new PublicationVerificationRequiredError(sourcePublication.id);
    }

    const deploymentKey = this.key(input.workspaceId, input.targetEnvironmentId, input.documentId);
    const targetDeployment = this.documentDeployments.get(deploymentKey);
    const actualGeneration = targetDeployment?.generation ?? 0;
    const requiredApprovalCount = targetEnvironment.requiredApprovalCount ?? 0;
    if (!operation && targetDeployment?.pendingReleaseOperationId) {
      const pendingOperation = [...this.releaseOperations.values()].find(
        (candidate) =>
          candidate.workspaceId === input.workspaceId &&
          candidate.id === targetDeployment.pendingReleaseOperationId,
      );
      const staleSource =
        pendingOperation?.status === 'awaiting_approval' &&
        pendingOperation.sourcePublicationId !== sourcePublication.id;
      if (!pendingOperation || !staleSource) {
        throw new ReleaseOperationInProgressError(input.idempotencyKey);
      }
      this.failPromotionOperation(
        this.releaseOperationKey(pendingOperation),
        pendingOperation,
        ACTIVE_PUBLICATION_CHANGED_ERROR_CODE,
      );
    }
    if (!operation) {
      const createdAt = new Date().toISOString();
      const deploymentChanged = actualGeneration !== input.expectedGeneration;
      let status: PersistedReleaseOperation['status'] = 'activating';
      if (deploymentChanged) status = 'failed';
      else if (requiredApprovalCount > 0) status = 'awaiting_approval';
      operation = {
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
        resultGeneration: deploymentChanged ? actualGeneration : null,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        status,
        correlationId: input.correlationId,
        requestedByUserId: input.actorUserId,
        resultPublicationId: null,
        reason: null,
        errorCode: deploymentChanged ? DEPLOYMENT_CHANGED_ERROR_CODE : null,
        createdAt,
        completedAt: deploymentChanged ? createdAt : null,
      };
      this.releaseOperations.set(operationKey, operation);
      if (deploymentChanged) {
        throw new DeploymentChangedError(input.expectedGeneration, actualGeneration);
      }
    }

    const approvals = this.releaseApprovals.get(this.key(input.workspaceId, operation.id)) ?? [];
    if (approvals.some((approval) => approval.decision === 'rejected')) {
      const failedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'failed',
        errorCode: RELEASE_APPROVAL_REJECTED_ERROR_CODE,
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      const pendingDeployment = this.documentDeployments.get(deploymentKey);
      if (pendingDeployment?.pendingReleaseOperationId === operation.id) {
        this.documentDeployments.set(deploymentKey, {
          ...pendingDeployment,
          pendingReleaseOperationId: null,
          updatedAt: failedOperation.completedAt ?? pendingDeployment.updatedAt,
        });
      }
      throw new ReleaseApprovalRejectedError(operation.id);
    }
    const approvalCount = approvals.filter((approval) => approval.decision === 'approved').length;
    if (approvalCount < requiredApprovalCount) {
      const awaitingOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'awaiting_approval',
      };
      this.releaseOperations.set(operationKey, awaitingOperation);
      const updatedAt = new Date().toISOString();
      const pendingDeployment: PersistedDocumentDeployment =
        targetDeployment?.state === 'active'
          ? {
              workspaceId: input.workspaceId,
              environmentId: input.targetEnvironmentId,
              documentId: input.documentId,
              state: 'active',
              activePublicationId: targetDeployment.activePublicationId,
              pendingReleaseOperationId: awaitingOperation.id,
              generation: actualGeneration,
              updatedAt,
            }
          : {
              workspaceId: input.workspaceId,
              environmentId: input.targetEnvironmentId,
              documentId: input.documentId,
              state: 'inactive',
              activePublicationId: null,
              pendingReleaseOperationId: awaitingOperation.id,
              generation: actualGeneration,
              updatedAt,
            };
      this.documentDeployments.set(deploymentKey, pendingDeployment);
      return {
        operation: clone(awaitingOperation),
        sourcePublication,
        publication: null,
        deployment: null,
        approvalCount,
        requiredApprovalCount,
        replayed: replayedRequest,
      };
    }

    const currentTargetDeployment = this.documentDeployments.get(deploymentKey);
    const currentGeneration = currentTargetDeployment?.generation ?? 0;
    if (currentGeneration !== input.expectedGeneration) {
      const failedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'failed',
        resultGeneration: currentGeneration,
        errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      throw new DeploymentChangedError(input.expectedGeneration, currentGeneration);
    }
    const activatingOperation: PersistedReleaseOperation = {
      ...operation,
      status: 'activating',
    };
    this.releaseOperations.set(operationKey, activatingOperation);
    const publication = this.createPublication(
      {
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        correlationId: input.correlationId,
        artifact: sourcePublication.artifact,
        actorUserId: input.actorUserId,
      },
      {
        action: 'promote',
        sourcePublicationId: sourcePublication.id,
        previousPublicationId:
          currentTargetDeployment?.state === 'active'
            ? currentTargetDeployment.activePublicationId
            : null,
        releaseOperationId: activatingOperation.id,
      },
    );
    const deployment: PersistedDocumentDeployment = {
      workspaceId: input.workspaceId,
      environmentId: input.targetEnvironmentId,
      documentId: input.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: currentGeneration + 1,
      updatedAt: publication.publishedAt,
    };
    this.documentDeployments.set(deploymentKey, deployment);
    const completedOperation: PersistedReleaseOperation = {
      ...activatingOperation,
      status: 'completed',
      resultGeneration: deployment.generation,
      resultPublicationId: publication.id,
      errorCode: null,
      completedAt: publication.publishedAt,
    };
    this.releaseOperations.set(operationKey, completedOperation);
    return {
      operation: clone(completedOperation),
      sourcePublication,
      publication,
      deployment: clone(deployment),
      approvalCount,
      requiredApprovalCount,
      replayed: false,
    };
  }
}
