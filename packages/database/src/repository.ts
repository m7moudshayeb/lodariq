import type {
  AnalyticsEvent,
  CompiledDocument,
  Environment,
  LodariqDocument,
} from '@lodariq/schema';
import { assertWorkspaceScope } from './rls';

export interface WorkspaceEnvironment {
  id: string;
  workspaceId: string;
  kind: Environment;
  name: string;
  originAllowlist: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentTokenRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: Environment;
  name: string;
  tokenHash?: string;
  tokenPrefix: string;
  clientToken?: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface AuthoringSessionRecord {
  id: string;
  workspaceId: string;
  environmentId: string;
  environment: Environment;
  documentId: string;
  correlationId: string;
  tokenHash?: string;
  iframeSrc: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface DocumentSummary {
  id: string;
  workspaceId: string;
  type: LodariqDocument['type'];
  status: LodariqDocument['status'];
  title: string;
  schemaVersion: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  latestContentHash?: string;
  publications: DocumentPublicationSummary[];
}

export interface DocumentPublicationSummary {
  environmentId: string;
  environment: Environment;
  contentHash: string;
  publishedAt: string;
}

export interface PersistedDocumentVersion {
  id: string;
  workspaceId: string;
  documentId: string;
  version: number;
  canonical: LodariqDocument;
  createdByUserId: string | null;
  createdAt: string;
}

export interface PersistedCompiledArtifact {
  id: string;
  workspaceId: string;
  documentId: string;
  documentVersionId?: string | null;
  contentHash: string;
  compilerVersion: string;
  compiled: CompiledDocument;
  createdAt: string;
}

export interface PersistedPublication {
  id: string;
  workspaceId: string;
  correlationId: string;
  environmentId: string;
  environment: Environment;
  documentId: string;
  documentVersionId?: string | null;
  compiledArtifactId: string;
  contentHash: string;
  publishedByUserId: string | null;
  publishedAt: string;
  artifact: PersistedCompiledArtifact;
}

export interface PersistedDocument {
  document: LodariqDocument;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  updatedAt: string;
  latestArtifact?: PersistedCompiledArtifact;
}

export interface SaveDocumentInput {
  workspaceId: string;
  document: LodariqDocument;
  actorUserId: string;
  artifact?: CompiledDocument;
}

export interface CreateEnvironmentTokenInput {
  workspaceId: string;
  environmentId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  clientToken?: string;
  actorUserId: string;
}

export interface CreateAuthoringSessionInput {
  workspaceId: string;
  environmentId: string;
  documentId: string;
  correlationId: string;
  tokenHash: string;
  iframeSrc: string;
  expiresAt: string;
  actorUserId: string;
}

export interface PublishCompiledArtifactInput {
  workspaceId: string;
  environmentId: string;
  correlationId: string;
  artifact: PersistedCompiledArtifact;
  actorUserId: string;
}

export interface IngestEventsInput {
  workspaceId: string;
  events: AnalyticsEvent[];
}

export interface ResolvedEnvironmentToken extends EnvironmentTokenRecord {
  originAllowlist: string[];
}

export interface ControlPlaneRepository {
  listDocuments(workspaceId: string): Promise<DocumentSummary[]>;
  getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null>;
  listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]>;
  saveDocument(input: SaveDocumentInput): Promise<PersistedDocument>;
  getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null>;
  getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null>;
  getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null>;
  publishCompiledArtifact(input: PublishCompiledArtifactInput): Promise<PersistedPublication>;
  listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]>;
  listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]>;
  resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null>;
  createEnvironmentToken(input: CreateEnvironmentTokenInput): Promise<EnvironmentTokenRecord>;
  revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null>;
  createAuthoringSession(input: CreateAuthoringSessionInput): Promise<AuthoringSessionRecord>;
  resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null>;
  ingestEvents(input: IngestEventsInput): Promise<number>;
}

export interface InMemoryControlPlaneSeed {
  documents?: LodariqDocument[];
  environments?: WorkspaceEnvironment[];
  environmentTokens?: EnvironmentTokenRecord[];
  authoringSessions?: AuthoringSessionRecord[];
  documentVersions?: PersistedDocumentVersion[];
  compiledArtifacts?: PersistedCompiledArtifact[];
  publications?: PersistedPublication[];
}

export function createInMemoryControlPlaneRepository(
  seed: InMemoryControlPlaneSeed = {},
): ControlPlaneRepository {
  return new InMemoryControlPlaneRepository(seed);
}

class InMemoryControlPlaneRepository implements ControlPlaneRepository {
  private readonly documents = new Map<string, PersistedDocument>();
  private readonly documentVersions = new Map<string, PersistedDocumentVersion[]>();
  private readonly environments = new Map<string, WorkspaceEnvironment>();
  private readonly environmentTokens = new Map<string, EnvironmentTokenRecord>();
  private readonly authoringSessions = new Map<string, AuthoringSessionRecord>();
  private readonly publications = new Map<string, PersistedPublication[]>();
  private readonly events: Array<{ workspaceId: string; event: AnalyticsEvent }> = [];

  constructor(seed: InMemoryControlPlaneSeed) {
    for (const environment of seed.environments ?? []) {
      this.environments.set(this.key(environment.workspaceId, environment.id), clone(environment));
    }
    for (const token of seed.environmentTokens ?? []) {
      this.environmentTokens.set(this.key(token.workspaceId, token.id), clone(token));
    }
    for (const session of seed.authoringSessions ?? []) {
      this.authoringSessions.set(this.key(session.workspaceId, session.id), clone(session));
    }
    for (const publication of seed.publications ?? []) {
      this.appendPublication(publication);
    }
    for (const version of seed.documentVersions ?? []) {
      this.appendDocumentVersion(version);
    }
    for (const document of seed.documents ?? []) {
      const documentKey = this.key(document.workspaceId, document.id);
      if (!this.documentVersions.has(documentKey)) {
        this.appendDocumentVersion({
          id: `${document.id}_v_1`,
          workspaceId: document.workspaceId,
          documentId: document.id,
          version: 1,
          canonical: clone(document),
          createdByUserId: null,
          createdAt: new Date().toISOString(),
        });
      }
      const latestArtifact = (seed.compiledArtifacts ?? [])
        .filter(
          (artifact) =>
            artifact.workspaceId === document.workspaceId && artifact.documentId === document.id,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      this.documents.set(this.key(document.workspaceId, document.id), {
        document: clone(document),
        createdByUserId: null,
        updatedByUserId: null,
        updatedAt: new Date().toISOString(),
        ...(latestArtifact ? { latestArtifact: clone(latestArtifact) } : {}),
      });
    }
  }

  async listDocuments(workspaceId: string): Promise<DocumentSummary[]> {
    return [...this.documents.values()]
      .filter((entry) => entry.document.workspaceId === workspaceId)
      .map((entry) => ({
        id: entry.document.id,
        workspaceId: entry.document.workspaceId,
        type: entry.document.type,
        status: entry.document.status,
        title: entry.document.title,
        schemaVersion: entry.document.schemaVersion,
        createdByUserId: entry.createdByUserId,
        updatedByUserId: entry.updatedByUserId,
        updatedAt: entry.updatedAt,
        ...(entry.latestArtifact?.contentHash
          ? { latestContentHash: entry.latestArtifact.contentHash }
          : {}),
        publications: this.listDocumentPublicationSummaries(
          entry.document.workspaceId,
          entry.document.id,
        ),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getDocument(workspaceId: string, documentId: string): Promise<PersistedDocument | null> {
    const entry = this.documents.get(this.key(workspaceId, documentId));
    return entry ? clone(entry) : null;
  }

  async listDocumentVersions(
    workspaceId: string,
    documentId: string,
  ): Promise<PersistedDocumentVersion[]> {
    return (this.documentVersions.get(this.key(workspaceId, documentId)) ?? [])
      .map((version) => clone(version))
      .sort((a, b) => b.version - a.version);
  }

  async saveDocument(input: SaveDocumentInput): Promise<PersistedDocument> {
    assertWorkspaceScope(input.document.workspaceId, input.workspaceId);
    const now = new Date().toISOString();
    const existing = this.documents.get(this.key(input.workspaceId, input.document.id));
    const documentVersion = this.createDocumentVersion(input, now);
    const latestArtifact = input.artifact
      ? this.createArtifact(
          input.workspaceId,
          input.document.id,
          documentVersion.id,
          input.artifact,
          now,
        )
      : existing?.latestArtifact;
    const next: PersistedDocument = {
      document: clone(input.document),
      createdByUserId: existing?.createdByUserId ?? input.actorUserId,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
      ...(latestArtifact ? { latestArtifact: clone(latestArtifact) } : {}),
    };
    this.documents.set(this.key(input.workspaceId, input.document.id), next);
    return clone(next);
  }

  async getLatestCompiledArtifact(workspaceId: string): Promise<PersistedCompiledArtifact | null> {
    const artifacts = [...this.documents.values()]
      .map((entry) => entry.latestArtifact)
      .filter((artifact): artifact is PersistedCompiledArtifact =>
        Boolean(artifact && artifact.workspaceId === workspaceId),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return artifacts[0] ? clone(artifacts[0]) : null;
  }

  async getCurrentPublication(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedPublication | null> {
    const latest = (
      this.publications.get(this.key(workspaceId, environmentId)) ?? []
    ).reduce<PersistedPublication | null>((current, publication) => {
      if (!current) return publication;
      return publication.publishedAt.localeCompare(current.publishedAt) >= 0
        ? publication
        : current;
    }, null);
    return latest ? clone(latest) : null;
  }

  async getCurrentPublishedArtifact(
    workspaceId: string,
    environmentId: string,
  ): Promise<PersistedCompiledArtifact | null> {
    const publication = await this.getCurrentPublication(workspaceId, environmentId);
    return publication ? clone(publication.artifact) : null;
  }

  async publishCompiledArtifact(
    input: PublishCompiledArtifactInput,
  ): Promise<PersistedPublication> {
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) {
      throw new Error('environment not found in workspace');
    }
    if (!this.documents.has(this.key(input.workspaceId, input.artifact.documentId))) {
      throw new Error('document not found in workspace');
    }
    if (input.artifact.compiled.documentId !== input.artifact.documentId) {
      throw new Error('compiled artifact document mismatch');
    }

    const now = new Date().toISOString();
    const publication: PersistedPublication = {
      id: `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      correlationId: input.correlationId,
      environmentId: input.environmentId,
      environment: environment.kind,
      documentId: input.artifact.documentId,
      documentVersionId: input.artifact.documentVersionId,
      compiledArtifactId: input.artifact.id,
      contentHash: input.artifact.contentHash,
      publishedByUserId: input.actorUserId,
      publishedAt: now,
      artifact: clone(input.artifact),
    };
    this.appendPublication(publication);
    return clone(publication);
  }

  async listEnvironments(workspaceId: string): Promise<WorkspaceEnvironment[]> {
    return [...this.environments.values()]
      .filter((environment) => environment.workspaceId === workspaceId)
      .map((environment) => clone(environment))
      .sort((a, b) => a.kind.localeCompare(b.kind));
  }

  async listEnvironmentTokens(workspaceId: string): Promise<EnvironmentTokenRecord[]> {
    return [...this.environmentTokens.values()]
      .filter((token) => token.workspaceId === workspaceId)
      .map((token) => clone(token))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveEnvironmentToken(tokenHash: string): Promise<ResolvedEnvironmentToken | null> {
    const token = [...this.environmentTokens.values()].find(
      (candidate) => candidate.tokenHash === tokenHash && !candidate.revokedAt,
    );
    if (!token) return null;
    const environment = this.environments.get(this.key(token.workspaceId, token.environmentId));
    if (!environment) return null;
    return clone({
      ...token,
      environment: environment.kind,
      originAllowlist: environment.originAllowlist,
    });
  }

  async createEnvironmentToken(
    input: CreateEnvironmentTokenInput,
  ): Promise<EnvironmentTokenRecord> {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) {
      throw new Error('environment not found in workspace');
    }
    const token: EnvironmentTokenRecord = {
      id: `envtok_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: environment.kind,
      name: input.name,
      tokenHash: input.tokenHash,
      tokenPrefix: input.tokenPrefix,
      ...(input.clientToken ? { clientToken: input.clientToken } : {}),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.environmentTokens.set(this.key(token.workspaceId, token.id), token);
    return clone(token);
  }

  async revokeEnvironmentToken(
    workspaceId: string,
    tokenId: string,
    _actorUserId: string,
  ): Promise<EnvironmentTokenRecord | null> {
    const key = this.key(workspaceId, tokenId);
    const token = this.environmentTokens.get(key);
    if (!token) return null;

    const revokedAt = token.revokedAt ?? new Date().toISOString();
    const revokedToken = { ...token, revokedAt };
    this.environmentTokens.set(key, revokedToken);
    return clone(revokedToken);
  }

  async createAuthoringSession(
    input: CreateAuthoringSessionInput,
  ): Promise<AuthoringSessionRecord> {
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) {
      throw new Error('environment not found in workspace');
    }
    const document = this.documents.get(this.key(input.workspaceId, input.documentId));
    if (!document) {
      throw new Error('document not found in workspace');
    }
    const session: AuthoringSessionRecord = {
      id: `authsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      environmentId: input.environmentId,
      environment: environment.kind,
      documentId: input.documentId,
      correlationId: input.correlationId,
      tokenHash: input.tokenHash,
      iframeSrc: input.iframeSrc,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.authoringSessions.set(this.key(session.workspaceId, session.id), session);
    return clone(session);
  }

  async resolveAuthoringSession(
    workspaceId: string,
    tokenHash: string,
  ): Promise<AuthoringSessionRecord | null> {
    const session = [...this.authoringSessions.values()].find(
      (candidate) =>
        candidate.workspaceId === workspaceId &&
        candidate.tokenHash === tokenHash &&
        !candidate.revokedAt &&
        Date.parse(candidate.expiresAt) > Date.now(),
    );
    return session ? clone(session) : null;
  }

  async ingestEvents(input: IngestEventsInput): Promise<number> {
    for (const event of input.events) {
      this.events.push({ workspaceId: input.workspaceId, event: clone(event) });
    }
    return input.events.length;
  }

  private createDocumentVersion(
    input: SaveDocumentInput,
    createdAt: string,
  ): PersistedDocumentVersion {
    const key = this.key(input.workspaceId, input.document.id);
    const existingVersions = this.documentVersions.get(key) ?? [];
    const version = Math.max(0, ...existingVersions.map((entry) => entry.version)) + 1;
    const documentVersion: PersistedDocumentVersion = {
      id: `${input.document.id}_v_${version}`,
      workspaceId: input.workspaceId,
      documentId: input.document.id,
      version,
      canonical: clone(input.document),
      createdByUserId: input.actorUserId,
      createdAt,
    };
    this.appendDocumentVersion(documentVersion);
    return documentVersion;
  }

  private appendDocumentVersion(version: PersistedDocumentVersion): void {
    const key = this.key(version.workspaceId, version.documentId);
    const versions = this.documentVersions.get(key) ?? [];
    versions.push(clone(version));
    this.documentVersions.set(key, versions);
  }

  private appendPublication(publication: PersistedPublication): void {
    const key = this.key(publication.workspaceId, publication.environmentId);
    const publications = this.publications.get(key) ?? [];
    publications.push(clone(publication));
    this.publications.set(key, publications);
  }

  private listDocumentPublicationSummaries(
    workspaceId: string,
    documentId: string,
  ): DocumentPublicationSummary[] {
    const latestByEnvironment = new Map<string, DocumentPublicationSummary>();
    for (const publication of [...this.publications.values()].flat()) {
      if (publication.workspaceId !== workspaceId || publication.documentId !== documentId) {
        continue;
      }
      const current = latestByEnvironment.get(publication.environmentId);
      if (current && current.publishedAt.localeCompare(publication.publishedAt) > 0) {
        continue;
      }
      latestByEnvironment.set(publication.environmentId, {
        environmentId: publication.environmentId,
        environment: publication.environment,
        contentHash: publication.contentHash,
        publishedAt: publication.publishedAt,
      });
    }

    return [...latestByEnvironment.values()].sort((a, b) =>
      a.environment.localeCompare(b.environment),
    );
  }

  private createArtifact(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
    compiled: CompiledDocument,
    createdAt: string,
  ): PersistedCompiledArtifact {
    return {
      id: `artifact_${compiled.contentHash.replace(/[^a-zA-Z0-9]/g, '_')}`,
      workspaceId,
      documentId,
      documentVersionId,
      contentHash: compiled.contentHash,
      compilerVersion: compiled.compilerVersion,
      compiled: clone(compiled),
      createdAt,
    };
  }

  private key(workspaceId: string, id: string): string {
    return `${workspaceId}:${id}`;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
