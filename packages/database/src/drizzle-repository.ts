import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { CompiledDocument } from '@lodariq/schema';
import {
  type AuthoringSessionRecord,
  type ControlPlaneRepository,
  type CreateAuthoringSessionInput,
  type CreateEnvironmentTokenInput,
  type DocumentPublicationSummary,
  type DocumentSummary,
  type EnvironmentTokenRecord,
  type IngestEventsInput,
  type PersistedCompiledArtifact,
  type PersistedDocument,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PublishCompiledArtifactInput,
  type ResolvedEnvironmentToken,
  type SaveDocumentInput,
  type WorkspaceMembershipRecord,
  type WorkspaceEnvironment,
} from './repository';
import { assertWorkspaceScope } from './rls';
import {
  compiledArtifacts,
  authoringSessions,
  documents,
  documentVersions,
  environments,
  environmentTokens,
  events,
  publications,
  users,
  workspaceMemberships,
} from './schema';
import type { LodariqDatabase } from './neon';
import { runWithEnvironmentTokenLookupScope, runWithWorkspaceScope } from './scoped-transaction';

type LodariqTransaction = Parameters<Parameters<LodariqDatabase['transaction']>[0]>[0];

export function createDrizzleControlPlaneRepository(
  database: LodariqDatabase,
): ControlPlaneRepository {
  return new DrizzleControlPlaneRepository(database);
}

class DrizzleControlPlaneRepository implements ControlPlaneRepository {
  constructor(private readonly database: LodariqDatabase) {}

  async resolveWorkspaceMembership(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembershipRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          workspaceId: workspaceMemberships.workspaceId,
          userId: workspaceMemberships.userId,
          role: workspaceMemberships.role,
          createdAt: workspaceMemberships.createdAt,
        })
        .from(workspaceMemberships)
        .innerJoin(users, eq(users.id, workspaceMemberships.userId))
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            or(eq(workspaceMemberships.userId, userId), eq(users.clerkUserId, userId)),
          ),
        )
        .limit(1);

      return row ? { ...row, createdAt: toIsoString(row.createdAt) } : null;
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

  async saveDocument(input: SaveDocumentInput): Promise<PersistedDocument> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);

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
        ? await this.upsertCompiledArtifact(
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

  async getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const publication = await this.getCurrentPublication(workspaceId, environmentId);
    return publication?.artifact ?? null;
  }

  async getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [publication] = await tx
        .select()
        .from(publications)
        .where(
          and(
            eq(publications.workspaceId, workspaceId),
            eq(publications.environmentId, environmentId),
          ),
        )
        .orderBy(desc(publications.publishedAt))
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

  async listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(environments)
        .where(eq(environments.workspaceId, workspaceId))
        .orderBy(environments.kind);

      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        kind: row.kind,
        name: row.name,
        originAllowlist: row.originAllowlist,
        createdAt: toIsoString(row.createdAt),
        updatedAt: toIsoString(row.updatedAt),
      }));
    });
  }

  async listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]> {
    return this.scoped(workspaceId, async (tx) => {
      const rows = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(eq(environmentTokens.workspaceId, workspaceId))
        .orderBy(desc(environmentTokens.createdAt));

      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        environment: row.environment,
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        createdAt: toIsoString(row.createdAt),
        revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
      }));
    });
  }

  async resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null> {
    return runWithEnvironmentTokenLookupScope(this.database, tokenHash, async (tx) => {
      const [row] = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenHash: environmentTokens.tokenHash,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
          originAllowlist: environments.originAllowlist,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(and(eq(environmentTokens.tokenHash, tokenHash), isNull(environmentTokens.revokedAt)))
        .limit(1);

      if (!row) return null;
      return {
        id: row.id,
        workspaceId: row.workspaceId,
        environmentId: row.environmentId,
        environment: row.environment,
        name: row.name,
        tokenHash: row.tokenHash,
        tokenPrefix: row.tokenPrefix,
        createdAt: toIsoString(row.createdAt),
        revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : null,
        originAllowlist: row.originAllowlist,
      };
    });
  }

  async createEnvironmentToken(
    input: CreateEnvironmentTokenInput,
  ): Promise<EnvironmentTokenRecord> {
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

      const [token] = await tx
        .insert(environmentTokens)
        .values({
          id: `envtok_${randomUUID()}`,
          workspaceId: input.workspaceId,
          environmentId: input.environmentId,
          name: input.name,
          tokenHash: input.tokenHash,
          tokenPrefix: input.tokenPrefix,
          createdByUserId: input.actorUserId,
        })
        .returning();

      if (!token) throw new Error('failed to create environment token');

      return {
        id: token.id,
        workspaceId: token.workspaceId,
        environmentId: token.environmentId,
        environment: environment.kind,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        ...(input.clientToken ? { clientToken: input.clientToken } : {}),
        createdAt: toIsoString(token.createdAt),
        revokedAt: token.revokedAt ? toIsoString(token.revokedAt) : null,
      };
    });
  }

  async revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    _actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [current] = await tx
        .select({
          id: environmentTokens.id,
          workspaceId: environmentTokens.workspaceId,
          environmentId: environmentTokens.environmentId,
          environment: environments.kind,
          name: environmentTokens.name,
          tokenPrefix: environmentTokens.tokenPrefix,
          createdAt: environmentTokens.createdAt,
          revokedAt: environmentTokens.revokedAt,
        })
        .from(environmentTokens)
        .innerJoin(environments, eq(environmentTokens.environmentId, environments.id))
        .where(
          and(eq(environmentTokens.workspaceId, workspaceId), eq(environmentTokens.id, tokenId)),
        )
        .limit(1);

      if (!current) return null;

      let revokedAt = current.revokedAt;
      if (!revokedAt) {
        const [updated] = await tx
          .update(environmentTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(environmentTokens.workspaceId, workspaceId), eq(environmentTokens.id, tokenId)),
          )
          .returning({ revokedAt: environmentTokens.revokedAt });
        revokedAt = updated?.revokedAt ?? new Date();
      }

      return {
        id: current.id,
        workspaceId: current.workspaceId,
        environmentId: current.environmentId,
        environment: current.environment,
        name: current.name,
        tokenPrefix: current.tokenPrefix,
        createdAt: toIsoString(current.createdAt),
        revokedAt: toIsoString(revokedAt),
      };
    });
  }

  async createAuthoringSession(
    input: CreateAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord> {
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

      const [document] = await tx
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(eq(documents.workspaceId, input.workspaceId), eq(documents.id, input.documentId)),
        )
        .limit(1);

      if (!document) {
        throw new Error('document not found in workspace');
      }

      const [session] = await tx
        .insert(authoringSessions)
        .values({
          id: `authsess_${randomUUID()}`,
          workspaceId: input.workspaceId,
          correlationId: input.correlationId,
          environmentId: input.environmentId,
          documentId: input.documentId,
          tokenHash: input.tokenHash,
          iframeSrc: input.iframeSrc,
          createdByUserId: input.actorUserId,
          expiresAt: new Date(input.expiresAt),
        })
        .returning();

      if (!session) throw new Error('failed to create authoring session');
      return toAuthoringSessionRecord(session, environment.kind);
    });
  }

  async resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    return this.scoped(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          id: authoringSessions.id,
          workspaceId: authoringSessions.workspaceId,
          environmentId: authoringSessions.environmentId,
          environment: environments.kind,
          documentId: authoringSessions.documentId,
          correlationId: authoringSessions.correlationId,
          tokenHash: authoringSessions.tokenHash,
          iframeSrc: authoringSessions.iframeSrc,
          createdByUserId: authoringSessions.createdByUserId,
          createdAt: authoringSessions.createdAt,
          expiresAt: authoringSessions.expiresAt,
          revokedAt: authoringSessions.revokedAt,
        })
        .from(authoringSessions)
        .innerJoin(environments, eq(authoringSessions.environmentId, environments.id))
        .where(
          and(
            eq(authoringSessions.workspaceId, workspaceId),
            eq(authoringSessions.tokenHash, tokenHash),
            isNull(authoringSessions.revokedAt),
            sql`${authoringSessions.expiresAt} > now()`,
          ),
        )
        .limit(1);

      return row ? toAuthoringSessionRecord(row, row.environment) : null;
    });
  }

  async ingestEvents(input: IngestEventsInput): Promise<number> {
    return this.scoped(input.workspaceId, async (tx) => {
      if (!input.events.length) return 0;

      await tx.insert(events).values(
        input.events.map((event) => ({
          id: `evt_${randomUUID()}`,
          workspaceId: input.workspaceId,
          documentId: event.documentId ?? null,
          name: event.name,
          payload: event,
        })),
      );

      return input.events.length;
    });
  }

  private scoped<TResult>(
    workspaceId: string,
    operation: (transaction: LodariqTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return runWithWorkspaceScope(this.database, workspaceId, operation);
  }

  private async getLatestArtifact(
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

  private async requireDocument(
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

  private async getLatestPublicationsForDocument(
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

  private async insertDocumentVersion(
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

  private async upsertCompiledArtifact(
    tx: LodariqTransaction,
    workspaceId: string,
    documentVersionId: string,
    compiled: CompiledDocument,
    createdAt: Date,
  ): Promise<PersistedCompiledArtifact> {
    const [artifact] = await tx
      .insert(compiledArtifacts)
      .values({
        id: createArtifactId(compiled.documentId, compiled.contentHash),
        workspaceId,
        documentId: compiled.documentId,
        documentVersionId,
        contentHash: compiled.contentHash,
        compilerVersion: compiled.compilerVersion,
        compiled,
        createdAt,
      })
      .onConflictDoUpdate({
        target: compiledArtifacts.id,
        set: {
          documentVersionId,
          compilerVersion: compiled.compilerVersion,
          compiled,
          createdAt,
        },
        setWhere: eq(compiledArtifacts.workspaceId, workspaceId),
      })
      .returning();

    if (!artifact) {
      const latest = await this.getLatestArtifact(tx, workspaceId, compiled.documentId);
      if (latest) return latest;
      throw new Error('failed to persist compiled artifact');
    }

    return toPersistedArtifact(artifact);
  }
}

function createArtifactId(documentId: string, contentHash: string): string {
  return `artifact_${documentId}_${contentHash.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function toPersistedArtifact(
  artifact: typeof compiledArtifacts.$inferSelect,
): PersistedCompiledArtifact {
  return {
    id: artifact.id,
    workspaceId: artifact.workspaceId,
    documentId: artifact.documentId,
    documentVersionId: artifact.documentVersionId,
    contentHash: artifact.contentHash,
    compilerVersion: artifact.compilerVersion,
    compiled: artifact.compiled,
    createdAt: toIsoString(artifact.createdAt),
  };
}

function toPersistedPublication(
  publication: typeof publications.$inferSelect,
  environment: PersistedPublication['environment'],
  artifact: PersistedCompiledArtifact,
): PersistedPublication {
  return {
    id: publication.id,
    workspaceId: publication.workspaceId,
    correlationId: publication.correlationId ?? `corr_${publication.id}`,
    environmentId: publication.environmentId,
    environment,
    documentId: publication.documentId,
    documentVersionId: publication.documentVersionId,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    publishedByUserId: publication.publishedByUserId,
    publishedAt: toIsoString(publication.publishedAt),
    artifact,
  };
}

function toPersistedDocumentVersion(
  version: typeof documentVersions.$inferSelect,
): PersistedDocumentVersion {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    documentId: version.documentId,
    version: version.version,
    canonical: version.canonical,
    createdByUserId: version.createdByUserId,
    createdAt: toIsoString(version.createdAt),
  };
}

function toAuthoringSessionRecord(
  session:
    | typeof authoringSessions.$inferSelect
    | (Pick<
        typeof authoringSessions.$inferSelect,
        | 'id'
        | 'workspaceId'
        | 'environmentId'
        | 'documentId'
        | 'correlationId'
        | 'tokenHash'
        | 'iframeSrc'
        | 'createdByUserId'
        | 'createdAt'
        | 'expiresAt'
        | 'revokedAt'
      > & { environment: AuthoringSessionRecord['environment'] }),
  environment: AuthoringSessionRecord['environment'],
): AuthoringSessionRecord {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    environmentId: session.environmentId,
    environment,
    documentId: session.documentId,
    correlationId: session.correlationId ?? `corr_${session.id}`,
    tokenHash: session.tokenHash,
    iframeSrc: session.iframeSrc,
    createdByUserId: session.createdByUserId,
    createdAt: toIsoString(session.createdAt),
    expiresAt: toIsoString(session.expiresAt),
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : null,
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
