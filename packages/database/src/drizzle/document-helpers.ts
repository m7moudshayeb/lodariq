import { and, desc, eq, sql } from 'drizzle-orm';
import { type CompiledDocument } from '@lodariq/schema';
import {
  type DocumentPublicationSummary,
  type PersistedCompiledArtifact,
  type SaveDocumentInput,
} from '../repository';
import {
  compiledArtifacts,
  documents,
  documentVersions,
  environments,
  publications,
} from '../schema';
import type { LodariqTransaction } from './types';
import {
  createArtifactId,
  toPersistedArtifact,
  compiledArtifactMetadata,
  toIsoString,
} from './helpers';
import { DrizzleRepositoryRecoveryHelpers } from './recovery-helpers';

export class DrizzleRepositoryDocumentHelpers extends DrizzleRepositoryRecoveryHelpers {
  protected async getLatestArtifact(
    tx: LodariqTransaction,
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const [artifact] = await tx
      .select()
      .from(compiledArtifacts)
      .where(
        and(
          eq(compiledArtifacts.workspaceId, workspaceId),
          eq(compiledArtifacts.documentId, documentId),
        ),
      )
      .orderBy(desc(compiledArtifacts.createdAt))
      .limit(1);

    return artifact ? toPersistedArtifact(artifact) : null;
  }

  protected async requireDocument(
    tx: LodariqTransaction,
    input: SaveDocumentInput,
  ): Promise<typeof documents.$inferSelect> {
    const [document] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.document.id)))
      .limit(1);

    if (!document) {
      throw new Error('document upsert failed in workspace scope');
    }
    return document;
  }

  protected async getLatestPublicationsForDocument(
    tx: LodariqTransaction,
    workspaceId: string,
    documentId: string,
  ): Promise<DocumentPublicationSummary[]> {
    const rows = await tx
      .select({
        environmentId: publications.environmentId,
        environment: environments.kind,
        contentHash: publications.contentHash,
        publishedAt: publications.publishedAt,
      })
      .from(publications)
      .innerJoin(
        environments,
        and(
          eq(publications.workspaceId, environments.workspaceId),
          eq(publications.environmentId, environments.id),
        ),
      )
      .where(
        and(eq(publications.workspaceId, workspaceId), eq(publications.documentId, documentId)),
      )
      .orderBy(desc(publications.publishedAt));

    const latestByEnvironment = new Map<string, DocumentPublicationSummary>();
    for (const row of rows) {
      if (latestByEnvironment.has(row.environmentId)) continue;
      latestByEnvironment.set(row.environmentId, {
        environmentId: row.environmentId,
        environment: row.environment,
        contentHash: row.contentHash,
        publishedAt: toIsoString(row.publishedAt),
      });
    }

    return [...latestByEnvironment.values()].sort((a, b) =>
      a.environment.localeCompare(b.environment),
    );
  }

  protected async insertDocumentVersion(
    tx: LodariqTransaction,
    input: SaveDocumentInput,
    createdAt: Date,
  ): Promise<typeof documentVersions.$inferSelect> {
    const [latest] = await tx
      .select({
        version: sql<number>`coalesce(max(${documentVersions.version}), 0)::int`,
      })
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.workspaceId, input.workspaceId),
          eq(documentVersions.documentId, input.document.id),
        ),
      );

    const version = Number(latest?.version ?? 0) + 1;
    const [documentVersion] = await tx
      .insert(documentVersions)
      .values({
        id: `${input.document.id}_v_${version}`,
        workspaceId: input.workspaceId,
        documentId: input.document.id,
        version,
        canonical: input.document,
        createdByUserId: input.actorUserId,
        createdAt,
      })
      .returning();

    if (!documentVersion) {
      throw new Error('failed to create document version');
    }
    return documentVersion;
  }

  protected async persistCompiledArtifact(
    tx: LodariqTransaction,
    workspaceId: string,
    documentVersionId: string,
    compiled: CompiledDocument,
    createdAt: Date,
  ): Promise<PersistedCompiledArtifact> {
    const metadata = compiledArtifactMetadata(compiled);
    const [artifact] = await tx
      .insert(compiledArtifacts)
      .values({
        id: createArtifactId(compiled.documentId, compiled.contentHash),
        workspaceId,
        documentId: compiled.documentId,
        documentVersionId,
        contentHash: compiled.contentHash,
        compilerVersion: compiled.compilerVersion,
        themeVersionId: metadata.themeVersionId,
        themeContentHash: metadata.themeContentHash,
        rendererContractVersion: metadata.rendererContractVersion,
        compiled,
        createdAt,
      })
      .onConflictDoNothing({
        target: [
          compiledArtifacts.workspaceId,
          compiledArtifacts.documentId,
          compiledArtifacts.contentHash,
        ],
      })
      .returning();

    if (!artifact) {
      const [existingArtifact] = await tx
        .select()
        .from(compiledArtifacts)
        .where(
          and(
            eq(compiledArtifacts.workspaceId, workspaceId),
            eq(compiledArtifacts.documentId, compiled.documentId),
            eq(compiledArtifacts.contentHash, compiled.contentHash),
          ),
        )
        .limit(1);
      if (existingArtifact) return toPersistedArtifact(existingArtifact);
      throw new Error('failed to persist or resolve immutable compiled artifact');
    }

    return toPersistedArtifact(artifact);
  }
}
