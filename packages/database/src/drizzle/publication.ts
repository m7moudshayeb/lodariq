import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  AmbiguousCurrentPublicationError,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type PublishCompiledArtifactInput,
} from '../repository';
import { assertWorkspaceScope } from '../rls';
import { compiledArtifacts, documentDeployments, environments, publications } from '../schema';
import {
  toPersistedArtifact,
  toPersistedPublication,
  toPersistedDocumentDeployment,
} from './helpers';
import { DrizzleRepositoryThemePolicy } from './theme-policy';

export class DrizzleRepositoryPublication extends DrizzleRepositoryThemePolicy {
  async getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, async (tx) => {
      const deploymentRows = await tx
        .select()
        .from(documentDeployments)
        .where(
          and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.environmentId, environmentId),
          ),
        )
        .orderBy(asc(documentDeployments.documentId));

      if (deploymentRows.length === 0) {
        const legacyPublication = await this.getLatestLegacyPublication(
          tx,
          workspaceId,
          environmentId,
        );
        return legacyPublication
          ? this.loadPublication(tx, workspaceId, legacyPublication.id)
          : null;
      }

      const activeDeployments = deploymentRows.filter(
        (deployment) => deployment.state === 'active',
      );
      if (activeDeployments.length === 0) return null;
      if (activeDeployments.length > 1) {
        throw new AmbiguousCurrentPublicationError(
          workspaceId,
          environmentId,
          activeDeployments.map((deployment) => deployment.documentId),
        );
      }

      const [activeDeployment] = activeDeployments;
      if (!activeDeployment?.activePublicationId) {
        throw new Error('active document deployment has no publication');
      }
      return this.loadDeploymentPublication(tx, activeDeployment);
    });
  }

  async getDocumentDeployment(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedDocumentDeployment | null> {
    return this.scoped(workspaceId, async (tx) => {
      const row = await this.findDocumentDeployment(tx, workspaceId, environmentId, documentId);
      return row ? toPersistedDocumentDeployment(row) : null;
    });
  }

  async listDocumentDeployments(
    workspaceId: string,
    environmentId?: string,
  ): Promise<PersistedDocumentDeployment[]> {
    return this.scoped(workspaceId, async (tx) => {
      const condition = environmentId
        ? and(
            eq(documentDeployments.workspaceId, workspaceId),
            eq(documentDeployments.environmentId, environmentId),
          )
        : eq(documentDeployments.workspaceId, workspaceId);
      const rows = await tx
        .select()
        .from(documentDeployments)
        .where(condition)
        .orderBy(asc(documentDeployments.environmentId), asc(documentDeployments.documentId));
      return rows.map(toPersistedDocumentDeployment);
    });
  }

  async listDocumentPublications(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedPublication[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          publication: publications,
          environment: environments.kind,
          artifact: compiledArtifacts,
        })
        .from(publications)
        .innerJoin(
          environments,
          and(
            eq(publications.workspaceId, environments.workspaceId),
            eq(publications.environmentId, environments.id),
          ),
        )
        .innerJoin(
          compiledArtifacts,
          and(
            eq(publications.workspaceId, compiledArtifacts.workspaceId),
            eq(publications.documentId, compiledArtifacts.documentId),
            eq(publications.compiledArtifactId, compiledArtifacts.id),
          ),
        )
        .where(
          and(eq(publications.workspaceId, workspaceId), eq(publications.documentId, documentId)),
        )
        .orderBy(desc(publications.publishedAt), desc(publications.id));
      return rows.map((row) =>
        toPersistedPublication(row.publication, row.environment, toPersistedArtifact(row.artifact)),
      );
    });
  }

  async getPublicationById(
    workspaceId: string,
    publicationId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, (tx) => this.loadPublication(tx, workspaceId, publicationId));
  }

  async getCurrentPublicationForDocument(
    workspaceId: string,
    environmentId: string,
    documentId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, async (tx) => {
      const deployment = await this.findDocumentDeployment(
        tx,
        workspaceId,
        environmentId,
        documentId,
      );
      if (!deployment || deployment.state === 'inactive') return null;
      return this.loadDeploymentPublication(tx, deployment);
    });
  }

  async publishCompiledArtifact(
    input: PublishCompiledArtifactInput,
  ): Promise<PersistedPublication> {
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);

    return this.scoped(input.workspaceId, async (tx) => {
      const [environment] = await tx
        .select()
        .from(environments)
        .where(
          and(
            eq(environments.workspaceId, input.workspaceId),
            eq(environments.id, input.environmentId),
          ),
        )
        .limit(1);

      if (!environment) {
        throw new Error('environment not found in workspace');
      }
      if (!(await this.hasAuthoringMembership(tx, input.workspaceId, input.actorUserId))) {
        throw new Error('authoring session creator is not an active workspace member');
      }

      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, input.workspaceId),
            eq(compiledArtifacts.id, input.artifact.id),
          ),
        )
        .limit(1);

      if (!artifact) {
        throw new Error('compiled artifact not found in workspace');
      }
      if (artifact.compiled.documentId !== artifact.documentId) {
        throw new Error('compiled artifact document mismatch');
      }

      const now = new Date();
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
          action: 'publish',
          sourcePublicationId: null,
          previousPublicationId: null,
          releaseOperationId: null,
          publishedByUserId: input.actorUserId,
          publishedAt: now,
        })
        .returning();

      if (!publication) {
        throw new Error('failed to create publication');
      }

      return toPersistedPublication(publication, environment.kind, toPersistedArtifact(artifact));
    });
  }
}
