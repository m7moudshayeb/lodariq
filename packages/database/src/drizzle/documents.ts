import { and, desc, eq } from 'drizzle-orm';
import {
  type DocumentSummary,
  type PersistedCompiledArtifact,
  type PersistedDocument,
  type PersistedDocumentVersion,
  type PersistedReleaseOperation,
  type SaveDocumentInput,
} from '../repository';
import { assertWorkspaceScope } from '../rls';
import { compiledArtifacts, documents, documentVersions, releaseOperations } from '../schema';
import {
  toPersistedArtifact,
  assertArtifactMatchesDocument,
  toPersistedReleaseOperation,
  toPersistedDocumentVersion,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryPublication } from './publication';

export class DrizzleRepositoryDocuments extends DrizzleRepositoryPublication {
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
      const now = new Date();
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
