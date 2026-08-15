import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  type DocumentSummary,
  type PersistedCompiledArtifact,
  type PersistedDocument,
  type PersistedDocumentVersion,
  type PersistedReleaseOperation,
  type SaveDocumentInput,
  DocumentSaveConflictError,
  type CreateAuthoringMediaAssetInput,
  type SaveAuthoringResourcesInput,
} from '../repository';
import { assertWorkspaceScope } from '../rls';
import {
  authoringDraftCheckpoints,
  authoringMediaAssets,
  authoringStyleRecipes,
  compiledArtifacts,
  documents,
  documentVersions,
  releaseOperations,
} from '../schema';
import type {
  AuthoringDraftCheckpointResource,
  AuthoringMediaAssetResource,
  AuthoringStepStyleRecipeResource,
} from '@lodariq/schema';
import {
  toPersistedArtifact,
  assertArtifactMatchesDocument,
  toPersistedReleaseOperation,
  toPersistedDocumentVersion,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryPublication } from './publication';

export class DrizzleRepositoryDocuments extends DrizzleRepositoryPublication {
  async listAuthoringStyleRecipes(
    workspaceId: string,
  ): Promise<AuthoringStepStyleRecipeResource[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({ resource: authoringStyleRecipes.resource })
        .from(authoringStyleRecipes)
        .where(eq(authoringStyleRecipes.workspaceId, workspaceId))
        .orderBy(desc(authoringStyleRecipes.updatedAt));
      return rows.map((row) => structuredClone(row.resource));
    });
  }

  async listAuthoringDraftCheckpoints(
    workspaceId: string,
    documentId: string,
  ): Promise<AuthoringDraftCheckpointResource[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({ resource: authoringDraftCheckpoints.resource })
        .from(authoringDraftCheckpoints)
        .where(
          and(
            eq(authoringDraftCheckpoints.workspaceId, workspaceId),
            eq(authoringDraftCheckpoints.documentId, documentId),
          ),
        )
        .orderBy(desc(authoringDraftCheckpoints.createdAt));
      return rows.map((row) => structuredClone(row.resource));
    });
  }

  async listAuthoringMediaAssets(workspaceId: string): Promise<AuthoringMediaAssetResource[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(authoringMediaAssets)
        .where(eq(authoringMediaAssets.workspaceId, workspaceId))
        .orderBy(desc(authoringMediaAssets.createdAt));
      return rows.map(authoringMediaAssetResource);
    });
  }

  async getAuthoringMediaAsset(workspaceId: string, assetId: string) {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(authoringMediaAssets)
        .where(
          and(
            eq(authoringMediaAssets.workspaceId, workspaceId),
            eq(authoringMediaAssets.id, assetId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        ...authoringMediaAssetResource(row),
        workspaceId: row.workspaceId,
        contentBase64: row.contentBase64,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      };
    });
  }

  async getPublishedMediaAsset(assetId: string) {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select set_config('lodariq.media_asset_id', ${assetId}, true)`);
      const [row] = await tx
        .select()
        .from(authoringMediaAssets)
        .where(
          and(eq(authoringMediaAssets.id, assetId), isNotNull(authoringMediaAssets.publishedAt)),
        )
        .limit(1);
      if (!row) return null;
      return {
        ...authoringMediaAssetResource(row),
        workspaceId: row.workspaceId,
        contentBase64: row.contentBase64,
        publishedAt: row.publishedAt?.toISOString() ?? null,
      };
    });
  }

  async publishAuthoringMediaAssets(
    workspaceId: string,
    assetIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(assetIds)];
    if (ids.length === 0) return;
    await this.scoped(workspaceId, async (tx) => {
      await tx
        .update(authoringMediaAssets)
        .set({ publishedAt: new Date() })
        .where(
          and(
            eq(authoringMediaAssets.workspaceId, workspaceId),
            inArray(authoringMediaAssets.id, ids),
          ),
        );
    });
  }

  async saveAuthoringResources(input: SaveAuthoringResourcesInput): Promise<void> {
    for (const checkpoint of input.checkpoints) {
      assertWorkspaceScope(checkpoint.document.workspaceId, input.workspaceId);
      if (checkpoint.document.id !== input.documentId) {
        throw new Error('Authoring checkpoint document scope mismatch');
      }
    }
    await this.scoped(input.workspaceId, async (tx) => {
      await tx
        .delete(authoringStyleRecipes)
        .where(eq(authoringStyleRecipes.workspaceId, input.workspaceId));
      await tx
        .delete(authoringDraftCheckpoints)
        .where(
          and(
            eq(authoringDraftCheckpoints.workspaceId, input.workspaceId),
            eq(authoringDraftCheckpoints.documentId, input.documentId),
          ),
        );
      if (input.recipes.length > 0) {
        await tx.insert(authoringStyleRecipes).values(
          input.recipes.map((recipe) => ({
            id: recipe.id,
            workspaceId: input.workspaceId,
            resource: structuredClone(recipe),
            createdByUserId: input.actorUserId,
          })),
        );
      }
      if (input.checkpoints.length > 0) {
        await tx.insert(authoringDraftCheckpoints).values(
          input.checkpoints.map((checkpoint) => ({
            id: checkpoint.id,
            workspaceId: input.workspaceId,
            documentId: input.documentId,
            resource: structuredClone(checkpoint),
            createdByUserId: input.actorUserId,
            createdAt: new Date(checkpoint.createdAt),
          })),
        );
      }
    });
  }

  async createAuthoringMediaAsset(
    input: CreateAuthoringMediaAssetInput,
  ): Promise<AuthoringMediaAssetResource> {
    return this.scoped(input.workspaceId, async (tx) => {
      const id = `asset-${randomUUID()}`;
      const [row] = await tx
        .insert(authoringMediaAssets)
        .values({
          id,
          workspaceId: input.workspaceId,
          kind: input.kind,
          filename: input.filename,
          contentType: input.contentType,
          byteLength: input.byteLength,
          contentHash: input.contentHash,
          contentBase64: input.contentBase64,
          savedToLibrary: input.savedToLibrary,
          createdByUserId: input.actorUserId,
        })
        .returning();
      if (!row) throw new Error('Unable to persist authoring media asset');
      return authoringMediaAssetResource(row);
    });
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documents)
        .where(eq(documents.workspaceId, workspaceId))
        .orderBy(desc(documents.updatedAt));

      const summaries: DocumentSummary[] = [];
      for (const row of rows) {
        const latestArtifact = await this.getLatestArtifact(tx, workspaceId, row.id);
        summaries.push({
          id: row.id,
          workspaceId: row.workspaceId,
          type: row.canonical.type,
          status: row.canonical.status,
          title: row.title,
          schemaVersion: row.schemaVersion,
          createdByUserId: row.createdByUserId,
          updatedByUserId: row.updatedByUserId,
          updatedAt: toIsoString(row.updatedAt),
          ...(latestArtifact ? { latestContentHash: latestArtifact.contentHash } : {}),
          publications: await this.getLatestPublicationsForDocument(tx, workspaceId, row.id),
        });
      }
      return summaries;
    });
  }

  async getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [document] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.workspaceId, workspaceId), eq(documents.id, documentId)))
        .limit(1);

      if (!document) return null;
      const latestArtifact = await this.getLatestArtifact(tx, workspaceId, documentId);
      return {
        document: document.canonical,
        createdByUserId: document.createdByUserId,
        updatedByUserId: document.updatedByUserId,
        updatedAt: toIsoString(document.updatedAt),
        ...(latestArtifact ? { latestArtifact } : {}),
      };
    });
  }

  async listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
          ),
        )
        .orderBy(desc(documentVersions.version));

      return rows.map(toPersistedDocumentVersion);
    });
  }

  async getDocumentVersion(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<PersistedDocumentVersion | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [version] = await tx
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, workspaceId),
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.id, documentVersionId),
          ),
        )
        .limit(1);
      return version ? toPersistedDocumentVersion(version) : null;
    });
  }

  async saveDocument(input: SaveDocumentInput): Promise<PersistedDocument> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    assertArtifactMatchesDocument(input);

    return this.scoped(input.workspaceId, async (tx) => {
      let lockedCurrentUpdatedAt: Date | null = null;
      if (input.expectedUpdatedAt !== undefined) {
        const [current] = await tx
          .select({ updatedAt: documents.updatedAt })
          .from(documents)
          .where(
            and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.document.id)),
          )
          .for('update')
          .limit(1);
        const currentUpdatedAt = current?.updatedAt.toISOString() ?? null;
        if (currentUpdatedAt !== input.expectedUpdatedAt) {
          throw new DocumentSaveConflictError(currentUpdatedAt);
        }
        lockedCurrentUpdatedAt = current?.updatedAt ?? null;
      }
      const now = new Date(Math.max(Date.now(), (lockedCurrentUpdatedAt?.getTime() ?? 0) + 1));
      const [savedDocument] = await tx
        .insert(documents)
        .values({
          id: input.document.id,
          workspaceId: input.workspaceId,
          type: input.document.type,
          status: input.document.status,
          title: input.document.title,
          schemaVersion: input.document.schemaVersion,
          canonical: input.document,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            type: input.document.type,
            status: input.document.status,
            title: input.document.title,
            schemaVersion: input.document.schemaVersion,
            canonical: input.document,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          },
          setWhere: eq(documents.workspaceId, input.workspaceId),
        })
        .returning();

      const persistedDocument = savedDocument ?? (await this.requireDocument(tx, input));
      const documentVersion = await this.insertDocumentVersion(tx, input, now);
      const latestArtifact = input.artifact
        ? await this.persistCompiledArtifact(
            tx,
            input.workspaceId,
            documentVersion.id,
            input.artifact,
            now,
          )
        : await this.getLatestArtifact(tx, input.workspaceId, input.document.id);

      return {
        document: persistedDocument.canonical,
        createdByUserId: persistedDocument.createdByUserId,
        updatedByUserId: persistedDocument.updatedByUserId,
        updatedAt: toIsoString(persistedDocument.updatedAt),
        ...(latestArtifact ? { latestArtifact } : {}),
      };
    });
  }

  async getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(eq(compiledArtifacts.workspaceId, workspaceId))
        .orderBy(desc(compiledArtifacts.createdAt))
        .limit(1);

      return artifact ? toPersistedArtifact(artifact) : null;
    });
  }

  async getCompiledArtifact(
    workspaceId: string,
    documentId: string,
    artifactId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [artifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, workspaceId),
            eq(compiledArtifacts.documentId, documentId),
            eq(compiledArtifacts.id, artifactId),
          ),
        )
        .limit(1);
      return artifact ? toPersistedArtifact(artifact) : null;
    });
  }

  async getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const publication = await this.getCurrentPublication(workspaceId, environmentId);
    return publication?.artifact ?? null;
  }

  async getReleaseOperation(
    workspaceId: string,
    environmentId: string,
    documentId: string,
    idempotencyKey: string,
  ): Promise<PersistedReleaseOperation | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [operation] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, workspaceId),
            eq(releaseOperations.environmentId, environmentId),
            eq(releaseOperations.documentId, documentId),
            eq(releaseOperations.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      return operation ? toPersistedReleaseOperation(operation) : null;
    });
  }

  async getReleaseOperationById(
    workspaceId: string,
    operationId: string,
  ): Promise<PersistedReleaseOperation | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [operation] = await tx
        .select()
        .from(releaseOperations)
        .where(
          and(
            eq(releaseOperations.workspaceId, workspaceId),
            eq(releaseOperations.id, operationId),
          ),
        )
        .limit(1);
      return operation ? toPersistedReleaseOperation(operation) : null;
    });
  }
}

function authoringMediaAssetResource(
  row: typeof authoringMediaAssets.$inferSelect,
): AuthoringMediaAssetResource {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    contentType: row.contentType,
    byteLength: row.byteLength,
    contentHash: row.contentHash,
    savedToLibrary: row.savedToLibrary,
    createdAt: toIsoString(row.createdAt),
    downloadPath: `/v1/authoring/media-assets/${row.id}`,
  };
}
