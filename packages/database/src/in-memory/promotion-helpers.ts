import {
  IdempotencyConflictError,
  type PersistedDocumentDeployment,
  type PersistedReleaseOperation,
  type PromoteVerifiedPublicationInput,
  type PromotionResult,
} from '../domains/releases';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryContentHelpers } from './content-helpers';

export class InMemoryRepositoryPromotionHelpers extends InMemoryRepositoryContentHelpers {
  protected assertMatchingPromotionRequest(
    input: PromoteVerifiedPublicationInput,
    operation: PersistedReleaseOperation,
  ): void {
    const requestChanged =
      operation.workspaceId !== input.workspaceId ||
      operation.environmentId !== input.targetEnvironmentId ||
      operation.documentId !== input.documentId ||
      operation.action !== 'promote' ||
      operation.sourcePublicationId !== input.expectedSourcePublicationId ||
      operation.expectedGeneration !== input.expectedGeneration ||
      operation.requestHash !== input.requestHash;
    if (requestChanged) throw new IdempotencyConflictError(input.idempotencyKey);
  }

  protected failPromotionOperation(
    operationKey: string,
    operation: PersistedReleaseOperation,
    errorCode: string,
  ): void {
    const completedAt = new Date().toISOString();
    this.releaseOperations.set(operationKey, {
      ...operation,
      status: 'failed',
      errorCode,
      completedAt,
    });
    const deploymentKey = this.key(
      operation.workspaceId,
      operation.environmentId,
      operation.documentId,
    );
    const deployment = this.documentDeployments.get(deploymentKey);
    if (deployment?.pendingReleaseOperationId !== operation.id) return;
    this.documentDeployments.set(deploymentKey, {
      ...deployment,
      pendingReleaseOperationId: null,
      updatedAt: completedAt,
    });
  }

  protected replayCompletedPromotion(
    operation: PersistedReleaseOperation,
    requiredApprovalCount: number,
  ): PromotionResult {
    if (!operation.sourcePublicationId || !operation.resultPublicationId) {
      throw new Error('completed promotion is missing publication provenance');
    }
    const sourcePublication = this.findPublicationById(
      operation.workspaceId,
      operation.sourcePublicationId,
    );
    const publication = this.findPublicationById(
      operation.workspaceId,
      operation.resultPublicationId,
    );
    if (
      !sourcePublication ||
      !publication ||
      operation.resultGeneration === null ||
      operation.requestedArtifactId !== sourcePublication.compiledArtifactId
    ) {
      throw new Error('completed promotion result is unavailable');
    }
    const deployment: PersistedDocumentDeployment = {
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: operation.resultGeneration,
      updatedAt: operation.completedAt ?? publication.publishedAt,
    };
    const approvals =
      this.releaseApprovals.get(this.key(operation.workspaceId, operation.id)) ?? [];
    return {
      operation: clone(operation),
      sourcePublication,
      publication,
      deployment,
      approvalCount: approvals.filter((approval) => approval.decision === 'approved').length,
      requiredApprovalCount,
      replayed: true,
    };
  }
}
