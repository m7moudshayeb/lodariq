import { assertWorkspaceScope } from '../rls';
import {
  EnvironmentPolicyMutationForbiddenError,
  assertEnvironmentPolicyMutationAllowed,
} from '../domains/environments';
import {
  DEPLOYMENT_CHANGED_ERROR_CODE,
  DeploymentChangedError,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type PersistedReleaseOperation,
} from '../domains/releases';
import {
  LEGACY_PUBLICATION_PROVENANCE,
  type ActivateCompiledArtifactInput,
  type PublishCompiledArtifactInput,
  type ReleaseActivationResult,
} from '../domains/documents';
import { assertReleaseMutationGuardInput } from '../domains/authoring-policy';
import { clone } from '../domains/in-memory-helpers';
import { InMemoryRepositoryDocuments } from './documents';

export class InMemoryRepositoryPublication extends InMemoryRepositoryDocuments {
  async publishCompiledArtifact(
    input: PublishCompiledArtifactInput,
  ): Promise<PersistedPublication> {
    return this.createPublication(input, LEGACY_PUBLICATION_PROVENANCE);
  }

  async activateCompiledArtifact(
    input: ActivateCompiledArtifactInput,
  ): Promise<ReleaseActivationResult> {
    assertReleaseMutationGuardInput(input);
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);
    const operationKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.artifact.documentId,
      input.idempotencyKey,
    );
    const existingOperation = this.releaseOperations.get(operationKey);
    if (existingOperation) {
      return this.resolveExistingReleaseOperation(input, existingOperation);
    }
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) throw new Error('environment not found in workspace');
    const environmentPolicy = assertEnvironmentPolicyMutationAllowed(environment, {
      action: 'direct-publish',
      expectedUpdatedAt: input.expectedEnvironmentPolicyUpdatedAt,
    });
    const membership = this.workspaceMemberships.get(
      this.key(input.workspaceId, input.actorUserId),
    );
    if (
      !membership ||
      !environmentPolicy.releasePolicy.publisherRoles.some((role) => role === membership.role)
    ) {
      throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
    }

    const createdAt = new Date().toISOString();
    const action = input.action ?? 'publish';
    const sourcePublicationId = input.sourcePublicationId ?? null;
    const operation: PersistedReleaseOperation = {
      id: `relop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      documentId: input.artifact.documentId,
      action,
      requestedArtifactId: input.artifact.id,
      requestedSourcePublicationId: null,
      requestedActivePublicationId: null,
      actualActivePublicationId: null,
      sourcePublicationId,
      expectedGeneration: input.expectedGeneration,
      resultGeneration: null,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      status: 'activating',
      correlationId: input.correlationId,
      requestedByUserId: input.actorUserId,
      resultPublicationId: null,
      reason: null,
      errorCode: null,
      createdAt,
      completedAt: null,
    };
    this.releaseOperations.set(operationKey, operation);

    const deploymentKey = this.key(
      input.workspaceId,
      input.environmentId,
      input.artifact.documentId,
    );
    const currentDeployment = this.documentDeployments.get(deploymentKey);
    const actualGeneration = currentDeployment?.generation ?? 0;
    if (actualGeneration !== input.expectedGeneration) {
      const failedOperation = {
        ...operation,
        status: 'failed' as const,
        errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
        resultGeneration: actualGeneration,
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      throw new DeploymentChangedError(input.expectedGeneration, actualGeneration);
    }

    try {
      const previousPublicationId =
        currentDeployment?.state === 'active' ? currentDeployment.activePublicationId : null;
      const publication = this.createPublication(input, {
        action,
        sourcePublicationId,
        previousPublicationId,
        releaseOperationId: operation.id,
      });
      const deployment: PersistedDocumentDeployment = {
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId: publication.documentId,
        state: 'active',
        activePublicationId: publication.id,
        pendingReleaseOperationId: null,
        generation: actualGeneration + 1,
        updatedAt: publication.publishedAt,
      };
      this.documentDeployments.set(deploymentKey, deployment);
      const completedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'completed',
        resultGeneration: deployment.generation,
        resultPublicationId: publication.id,
        completedAt: publication.publishedAt,
      };
      this.releaseOperations.set(operationKey, completedOperation);
      return {
        operation: clone(completedOperation),
        publication,
        deployment: clone(deployment),
        replayed: false,
      };
    } catch (error) {
      const failedOperation: PersistedReleaseOperation = {
        ...operation,
        status: 'failed',
        errorCode: 'release_activation_failed',
        completedAt: new Date().toISOString(),
      };
      this.releaseOperations.set(operationKey, failedOperation);
      throw error;
    }
  }
}
