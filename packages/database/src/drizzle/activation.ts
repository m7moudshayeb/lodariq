import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  type ActivateCompiledArtifactInput,
  DEPLOYMENT_CHANGED_ERROR_CODE,
  DeploymentChangedError,
  EnvironmentPolicyMutationForbiddenError,
  assertEnvironmentPolicyMutationAllowed,
  IdempotencyConflictError,
  type ReleaseActivationResult,
  ReleaseOperationInProgressError,
  assertReleaseMutationGuardInput,
} from '../repository';
import { assertWorkspaceScope } from '../rls';
import {
  compiledArtifacts,
  environments,
  publications,
  releaseOperations,
  workspaceMemberships,
} from '../schema';
import type { ReleaseOutcome } from './types';
import {
  toWorkspaceEnvironment,
  toPersistedArtifact,
  toPersistedPublication,
  toPersistedDocumentDeployment,
  toPersistedReleaseOperation,
} from './helpers';
import { DrizzleRepositoryRecovery } from './recovery';

export class DrizzleRepositoryActivation extends DrizzleRepositoryRecovery {
  async activateCompiledArtifact(
    input: ActivateCompiledArtifactInput,
  ): Promise<ReleaseActivationResult> {
    assertReleaseMutationGuardInput(input);
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);

    const outcome = await this.scoped(input.workspaceId, async (tx): Promise<ReleaseOutcome> => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1)
        .for('share');
      if (!environment) throw new Error('environment not found in workspace');

      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, input.workspaceId),
            eq(compiledArtifacts.id, input.artifact.id),
            eq(compiledArtifacts.documentId, input.artifact.documentId),
          ),
        )
        .limit(1);
      if (!artifact) throw new Error('compiled artifact not found in workspace');
      if (artifact.compiled.documentId !== artifact.documentId) {
        throw new Error('compiled artifact document mismatch');
      }

      const now = new Date();
      const action = input.action ?? 'publish';
      const sourcePublicationId = input.sourcePublicationId ?? null;
      const [insertedOperation] = await tx
        .insert(releaseOperations)
        .values({
          id: `relop_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          documentId: artifact.documentId,
          action,
          requestedArtifactId: artifact.id,
          requestedSourcePublicationId: null,
          requestedActivePublicationId: null,
          actualActivePublicationId: null,
          sourcePublicationId,
          expectedGeneration: input.expectedGeneration,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
          status: 'activating',
          correlationId: input.correlationId,
          requestedByUserId: input.actorUserId,
          reason: null,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [
            releaseOperations.workspaceId,
            releaseOperations.environmentId,
            releaseOperations.documentId,
            releaseOperations.idempotencyKey,
          ],
        })
        .returning();

      if (!insertedOperation) {
        const existingOperation = await this.findReleaseOperation(tx, input);
        if (!existingOperation) throw new Error('failed to resolve idempotent release operation');
        return this.resolveExistingReleaseOperation(tx, input, existingOperation);
      }

      const environmentPolicy = assertEnvironmentPolicyMutationAllowed(
        toWorkspaceEnvironment(environment),
        {
          action: 'direct-publish',
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
        !environmentPolicy.releasePolicy.publisherRoles.some((role) => role === membership.role)
      ) {
        throw new EnvironmentPolicyMutationForbiddenError('role_forbidden');
      }

      await tx.execute(
        sql`select pg_advisory_xact_lock(
          hashtext(${`${input.workspaceId}:${input.environmentId}`}),
          hashtext(${artifact.documentId})
        )`,
      );

      const currentDeployment = await this.findDocumentDeployment(
        tx,
        input.workspaceId,
        input.environmentId,
        artifact.documentId,
      );
      const actualGeneration = currentDeployment?.generation ?? 0;
      if (actualGeneration !== input.expectedGeneration) {
        const [failedOperation] = await tx
          .update(releaseOperations)
          .set({
            status: 'failed',
            resultGeneration: actualGeneration,
            errorCode: DEPLOYMENT_CHANGED_ERROR_CODE,
            completedAt: now,
          })
          .where(eq(releaseOperations.id, insertedOperation.id))
          .returning();
        if (!failedOperation) throw new Error('failed to record deployment conflict');
        return {
          kind: 'deployment_changed',
          expectedGeneration: input.expectedGeneration,
          actualGeneration,
        };
      }

      const [publication] = await tx
        .insert(publications)
        .values({
          id: `pub_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.environmentId,
          documentId: artifact.documentId,
          documentVersionId: artifact.documentVersionId,
          compiledArtifactId: artifact.id,
          contentHash: artifact.contentHash,
          action,
          sourcePublicationId,
          previousPublicationId:
            currentDeployment?.state === 'active' ? currentDeployment.activePublicationId : null,
          releaseOperationId: insertedOperation.id,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
        })
        .returning();
      if (!publication) throw new Error('failed to create release publication');

      const deployment = currentDeployment
        ? await this.advanceExistingDeployment(
            tx,
            currentDeployment,
            publication.id,
            insertedOperation.id,
            now,
          )
        : await this.createInitialDeployment(
            tx,
            input,
            artifact.documentId,
            publication.id,
            insertedOperation.id,
            now,
          );
      if (!deployment) {
        throw new DeploymentChangedError(input.expectedGeneration, actualGeneration);
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
        .where(eq(releaseOperations.id, insertedOperation.id))
        .returning();
      if (!completedOperation) throw new Error('failed to complete release operation');

      return {
        kind: 'success',
        result: {
          operation: toPersistedReleaseOperation(completedOperation),
          publication: toPersistedPublication(
            publication,
            environment.kind,
            toPersistedArtifact(artifact),
          ),
          deployment: toPersistedDocumentDeployment(deployment),
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
    if (outcome.kind === 'deployment_changed') {
      throw new DeploymentChangedError(outcome.expectedGeneration, outcome.actualGeneration);
    }
    throw new Error(outcome.errorCode);
  }
}
