import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import {
  type ActivateCompiledArtifactInput,
  type PromoteVerifiedPublicationInput,
  DEPLOYMENT_CHANGED_ERROR_CODE,
  type PersistedDocumentDeployment,
  type PersistedPublication,
} from '../repository';
import {
  compiledArtifacts,
  documentDeployments,
  environments,
  publications,
  releaseOperations,
  releaseApprovals,
} from '../schema';
import type { LodariqTransaction, ReleaseOutcome } from './types';
import {
  toPersistedArtifact,
  toPersistedPublication,
  toPersistedReleaseOperation,
  toIsoString,
} from './helpers';
import { DrizzleRepositorySdkHelpers } from './sdk-helpers';

export class DrizzleRepositoryReleaseHelpers extends DrizzleRepositorySdkHelpers {
  protected async findReleaseOperation(
    tx: LodariqTransaction,
    input: ActivateCompiledArtifactInput,
  ): Promise<typeof releaseOperations.$inferSelect | null> {
    const [operation] = await tx
      .select()
      .from(releaseOperations)
      .where(
        and(
          eq(releaseOperations.workspaceId, input.workspaceId),
          eq(releaseOperations.environmentId, input.environmentId),
          eq(releaseOperations.documentId, input.artifact.documentId),
          eq(releaseOperations.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return operation ?? null;
  }

  protected async findPromotionOperation(
    tx: LodariqTransaction,
    input: PromoteVerifiedPublicationInput,
  ): Promise<typeof releaseOperations.$inferSelect | null> {
    const [operation] = await tx
      .select()
      .from(releaseOperations)
      .where(
        and(
          eq(releaseOperations.workspaceId, input.workspaceId),
          eq(releaseOperations.environmentId, input.targetEnvironmentId),
          eq(releaseOperations.documentId, input.documentId),
          eq(releaseOperations.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return operation ?? null;
  }

  protected async findReleaseApprovals(
    tx: LodariqTransaction,
    workspaceId: string,
    releaseOperationId: string,
  ): Promise<Array<typeof releaseApprovals.$inferSelect>> {
    return tx
      .select()
      .from(releaseApprovals)
      .where(
        and(
          eq(releaseApprovals.workspaceId, workspaceId),
          eq(releaseApprovals.releaseOperationId, releaseOperationId),
        ),
      )
      .orderBy(asc(releaseApprovals.createdAt), asc(releaseApprovals.id));
  }

  protected async clearPendingReleaseOperation(
    tx: LodariqTransaction,
    releaseOperationId: string,
  ): Promise<void> {
    await tx
      .update(documentDeployments)
      .set({ pendingReleaseOperationId: null, updatedAt: new Date() })
      .where(eq(documentDeployments.pendingReleaseOperationId, releaseOperationId));
  }

  protected async failPendingPromotionOperation(
    tx: LodariqTransaction,
    operation: typeof releaseOperations.$inferSelect,
    errorCode: string,
  ): Promise<void> {
    await tx
      .update(releaseOperations)
      .set({ status: 'failed', errorCode, completedAt: new Date() })
      .where(eq(releaseOperations.id, operation.id));
    await this.clearPendingReleaseOperation(tx, operation.id);
  }

  protected async setPendingPromotionDeployment(
    tx: LodariqTransaction,
    input: PromoteVerifiedPublicationInput,
    releaseOperationId: string,
    current: typeof documentDeployments.$inferSelect | null,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    if (current) {
      const [deployment] = await tx
        .update(documentDeployments)
        .set({ pendingReleaseOperationId: releaseOperationId, updatedAt })
        .where(
          and(
            eq(documentDeployments.workspaceId, input.workspaceId),
            eq(documentDeployments.environmentId, input.targetEnvironmentId),
            eq(documentDeployments.documentId, input.documentId),
            eq(documentDeployments.generation, input.expectedGeneration),
            or(
              isNull(documentDeployments.pendingReleaseOperationId),
              eq(documentDeployments.pendingReleaseOperationId, releaseOperationId),
            ),
          ),
        )
        .returning();
      return deployment ?? null;
    }
    const [deployment] = await tx
      .insert(documentDeployments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        documentId: input.documentId,
        state: 'inactive',
        activePublicationId: null,
        pendingReleaseOperationId: releaseOperationId,
        generation: 0,
        updatedAt,
      })
      .onConflictDoNothing({
        target: [
          documentDeployments.workspaceId,
          documentDeployments.environmentId,
          documentDeployments.documentId,
        ],
      })
      .returning();
    return deployment ?? null;
  }

  protected async createInitialPromotionDeployment(
    tx: LodariqTransaction,
    input: PromoteVerifiedPublicationInput,
    publicationId: string,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .insert(documentDeployments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.targetEnvironmentId,
        documentId: input.documentId,
        state: 'active',
        activePublicationId: publicationId,
        pendingReleaseOperationId: null,
        generation: 1,
        updatedAt,
      })
      .onConflictDoNothing({
        target: [
          documentDeployments.workspaceId,
          documentDeployments.environmentId,
          documentDeployments.documentId,
        ],
      })
      .returning();
    return deployment ?? null;
  }

  protected async resolveExistingReleaseOperation(
    tx: LodariqTransaction,
    input: ActivateCompiledArtifactInput,
    operation: typeof releaseOperations.$inferSelect,
  ): Promise<ReleaseOutcome> {
    const requestChanged =
      operation.requestHash !== input.requestHash ||
      operation.action !== (input.action ?? 'publish') ||
      operation.requestedArtifactId !== input.artifact.id ||
      operation.sourcePublicationId !== (input.sourcePublicationId ?? null) ||
      operation.expectedGeneration !== input.expectedGeneration;
    if (requestChanged) return { kind: 'idempotency_conflict' };
    if (operation.status === 'activating' || operation.status === 'awaiting_approval') {
      return { kind: 'in_progress' };
    }
    if (operation.status === 'failed') {
      if (operation.errorCode === DEPLOYMENT_CHANGED_ERROR_CODE) {
        return {
          kind: 'deployment_changed',
          expectedGeneration: operation.expectedGeneration,
          actualGeneration: operation.resultGeneration ?? 0,
        };
      }
      return { kind: 'failed', errorCode: operation.errorCode ?? 'release_operation_failed' };
    }
    if (!operation.resultPublicationId || operation.resultGeneration === null) {
      return { kind: 'failed', errorCode: 'release_operation_result_missing' };
    }
    const publication = await this.loadPublication(
      tx,
      operation.workspaceId,
      operation.resultPublicationId,
    );
    if (!publication) {
      return { kind: 'failed', errorCode: 'release_operation_publication_missing' };
    }
    const deployment: PersistedDocumentDeployment = {
      workspaceId: operation.workspaceId,
      environmentId: operation.environmentId,
      documentId: operation.documentId,
      state: 'active',
      activePublicationId: publication.id,
      pendingReleaseOperationId: null,
      generation: operation.resultGeneration,
      updatedAt: toIsoString(operation.completedAt ?? operation.createdAt),
    };
    return {
      kind: 'success',
      result: {
        operation: toPersistedReleaseOperation(operation),
        publication,
        deployment,
        replayed: true,
      },
    };
  }

  protected async advanceExistingDeployment(
    tx: LodariqTransaction,
    current: typeof documentDeployments.$inferSelect,
    publicationId: string,
    _releaseOperationId: string,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .update(documentDeployments)
      .set({
        state: 'active',
        activePublicationId: publicationId,
        pendingReleaseOperationId: null,
        generation: current.generation + 1,
        updatedAt,
      })
      .where(
        and(
          eq(documentDeployments.workspaceId, current.workspaceId),
          eq(documentDeployments.environmentId, current.environmentId),
          eq(documentDeployments.documentId, current.documentId),
          eq(documentDeployments.generation, current.generation),
        ),
      )
      .returning();
    return deployment ?? null;
  }

  protected async createInitialDeployment(
    tx: LodariqTransaction,
    input: ActivateCompiledArtifactInput,
    documentId: string,
    publicationId: string,
    _releaseOperationId: string,
    updatedAt: Date,
  ): Promise<typeof documentDeployments.$inferSelect | null> {
    const [deployment] = await tx
      .insert(documentDeployments)
      .values({
        workspaceId: input.workspaceId,
        environmentId: input.environmentId,
        documentId,
        state: 'active',
        activePublicationId: publicationId,
        pendingReleaseOperationId: null,
        generation: 1,
        updatedAt,
      })
      .onConflictDoNothing({
        target: [
          documentDeployments.workspaceId,
          documentDeployments.environmentId,
          documentDeployments.documentId,
        ],
      })
      .returning();
    return deployment ?? null;
  }

  protected async getLatestLegacyPublication(
    tx: LodariqTransaction,
    workspaceId: string,
    environmentId: string,
  ): Promise<typeof publications.$inferSelect | null> {
    const [publication] = await tx
      .select()
      .from(publications)
      .where(
        and(
          eq(publications.workspaceId, workspaceId),
          eq(publications.environmentId, environmentId),
        ),
      )
      .orderBy(desc(publications.publishedAt), desc(publications.id))
      .limit(1);
    return publication ?? null;
  }

  protected async loadDeploymentPublication(
    tx: LodariqTransaction,
    deployment: typeof documentDeployments.$inferSelect,
  ): Promise<PersistedPublication> {
    if (deployment.state !== 'active' || !deployment.activePublicationId) {
      throw new Error('inactive document deployment has no current publication');
    }
    const publication = await this.loadPublication(
      tx,
      deployment.workspaceId,
      deployment.activePublicationId,
    );
    if (!publication) {
      throw new Error('active document deployment publication not found in workspace');
    }
    if (
      publication.environmentId !== deployment.environmentId ||
      publication.documentId !== deployment.documentId
    ) {
      throw new Error('active document deployment publication scope mismatch');
    }
    return publication;
  }

  protected async loadPublication(
    tx: LodariqTransaction,
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null> {
    const [publication] = await tx
      .select()
      .from(publications)
      .where(and(eq(publications.workspaceId, workspaceId), eq(publications.id, publicationId)))
      .limit(1);
    if (!publication) return null;

    const [environment] = await tx
      .select()
      .from(environments)
      .where(
        and(
          eq(environments.workspaceId, workspaceId),
          eq(environments.id, publication.environmentId),
        ),
      )
      .limit(1);
    if (!environment) {
      throw new Error('published environment not found in workspace');
    }

    const [artifact] = await tx
      .select()
      .from(compiledArtifacts)
      .where(
        and(
          eq(compiledArtifacts.workspaceId, workspaceId),
          eq(compiledArtifacts.id, publication.compiledArtifactId),
        ),
      )
      .limit(1);
    if (!artifact) {
      throw new Error('published compiled artifact not found in workspace');
    }
    return toPersistedPublication(publication, environment.kind, toPersistedArtifact(artifact));
  }
}
