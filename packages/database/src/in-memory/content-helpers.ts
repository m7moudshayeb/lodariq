import {
  BRAND_THEME_CONTRACT_VERSION,
  type CompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import { assertWorkspaceScope } from '../rls';
import {
  type BrandDriftRunRecord,
  type StyleSourceRecord,
  type VisualCheckRunRecord,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
} from '../domains/themes';
import { type AuthoringSessionCompatibilityPins } from '../domains/sdk-authoring';
import {
  type DocumentPublicationSummary,
  type PersistedCompiledArtifact,
  type PersistedDocumentDeployment,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PublicationVerificationRecord,
  type ReleaseApprovalRecord,
} from '../domains/releases';
import {
  type PublicationProvenance,
  type PublishCompiledArtifactInput,
  type SaveDocumentInput,
} from '../domains/documents';
import {
  type PersistedAnalyticsEventRecord,
  type QueryAnalyticsEventsInput,
} from '../domains/analytics';
import {
  authoringSessionThemeReference,
  createAuthoringSessionCompatibilityPins,
} from '../domains/authoring-policy';
import { compiledArtifactMetadata } from '../domains/theme-policy';
import { clone, comparePublicationsNewestFirst } from '../domains/in-memory-helpers';
import { InMemoryRepositoryUtility } from './utility';

export class InMemoryRepositoryContentHelpers extends InMemoryRepositoryUtility {
  protected matchingAnalyticsEvents(
    input: QueryAnalyticsEventsInput,
  ): PersistedAnalyticsEventRecord[] {
    const from = input.query.from ? Date.parse(input.query.from) : null;
    const to = input.query.to ? Date.parse(input.query.to) : null;
    return this.analyticsEvents.filter((event) => {
      if (event.workspaceId !== input.workspaceId) return false;
      if (event.environmentId !== input.query.environmentId) return false;
      if (input.query.documentId && event.documentId !== input.query.documentId) return false;
      if (input.query.publicationId && event.publicationId !== input.query.publicationId)
        return false;
      if (input.query.contentHash && event.contentHash !== input.query.contentHash) return false;
      const timestamp = Date.parse(event.timestamp);
      if (from !== null && timestamp < from) return false;
      if (to !== null && timestamp > to) return false;
      return true;
    });
  }

  protected appendThemeVersion(version: WorkspaceThemeVersionRecord): void {
    const key = this.key(version.workspaceId, version.themeId);
    const versions = this.themeVersions.get(key) ?? [];
    versions.push(clone(version));
    this.themeVersions.set(key, versions);
  }

  protected findThemeVersion(
    workspaceId: string,
    themeId: string,
    versionId: string | null,
  ): WorkspaceThemeVersionRecord | null {
    if (!versionId) return null;
    const candidates = this.themeVersions.get(this.key(workspaceId, themeId)) ?? [];
    const version = candidates.find((candidate) => candidate.id === versionId);
    return version ? clone(version) : null;
  }

  protected resolveAuthoringSessionCompatibility(
    document: LodariqDocument,
  ): AuthoringSessionCompatibilityPins | null {
    const reference = authoringSessionThemeReference(document);
    if (!reference) return null;
    if (reference.source === 'fallback') {
      return createAuthoringSessionCompatibilityPins(reference.themeVersionId);
    }
    const version = this.findThemeVersion(
      document.workspaceId,
      reference.themeId,
      reference.themeVersionId,
    );
    if (!version || version.contractVersion !== BRAND_THEME_CONTRACT_VERSION) return null;
    return createAuthoringSessionCompatibilityPins(version.id);
  }

  protected hydrateTheme(theme: WorkspaceThemeRecord): WorkspaceThemeRecord {
    return clone({
      ...theme,
      activeVersion: this.findThemeVersion(theme.workspaceId, theme.id, theme.activeVersionId),
    });
  }

  protected clearWorkspaceThemeDefault(
    workspaceId: string,
    actorUserId: string,
    updatedAt: string,
  ): void {
    for (const [key, theme] of this.themes) {
      if (theme.workspaceId !== workspaceId || !theme.isDefault) continue;
      this.themes.set(key, {
        ...theme,
        isDefault: false,
        revision: theme.revision + 1,
        updatedByUserId: actorUserId,
        updatedAt,
      });
    }
  }

  protected appendVisualCheckRun(run: VisualCheckRunRecord): void {
    const key = this.key(run.workspaceId, run.documentId);
    const runs = this.visualCheckRuns.get(key) ?? [];
    runs.push(clone(run));
    this.visualCheckRuns.set(key, runs);
  }

  protected appendStyleSource(source: StyleSourceRecord): void {
    const key = this.key(source.workspaceId, source.themeId);
    const sources = this.styleSources.get(key) ?? [];
    sources.push(clone(source));
    this.styleSources.set(key, sources);
  }

  protected appendBrandDriftRun(run: BrandDriftRunRecord): void {
    const key = this.key(run.workspaceId, run.documentId);
    const runs = this.brandDriftRuns.get(key) ?? [];
    runs.push(clone(run));
    this.brandDriftRuns.set(key, runs);
  }

  protected appendPublicationVerification(verification: PublicationVerificationRecord): void {
    const key = this.key(verification.workspaceId, verification.publicationId);
    const verifications = this.publicationVerifications.get(key) ?? [];
    verifications.push(clone(verification));
    this.publicationVerifications.set(key, verifications);
  }

  protected appendReleaseApproval(approval: ReleaseApprovalRecord): void {
    const key = this.key(approval.workspaceId, approval.releaseOperationId);
    const approvals = this.releaseApprovals.get(key) ?? [];
    approvals.push(clone(approval));
    this.releaseApprovals.set(key, approvals);
  }

  protected createDocumentVersion(
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

  protected appendDocumentVersion(version: PersistedDocumentVersion): void {
    const key = this.key(version.workspaceId, version.documentId);
    const versions = this.documentVersions.get(key) ?? [];
    versions.push(clone(version));
    this.documentVersions.set(key, versions);
  }

  protected createPublication(
    input: PublishCompiledArtifactInput,
    provenance: PublicationProvenance,
  ): PersistedPublication {
    assertWorkspaceScope(input.artifact.workspaceId, input.workspaceId);
    const environment = this.environments.get(this.key(input.workspaceId, input.environmentId));
    if (!environment) {
      throw new Error('environment not found in workspace');
    }
    if (!this.documents.has(this.key(input.workspaceId, input.artifact.documentId))) {
      throw new Error('document not found in workspace');
    }
    const artifact = this.compiledArtifactsById.get(this.key(input.workspaceId, input.artifact.id));
    if (!artifact) {
      throw new Error('compiled artifact not found in workspace');
    }
    if (artifact.compiled.documentId !== artifact.documentId) {
      throw new Error('compiled artifact document mismatch');
    }

    const publication: PersistedPublication = {
      id: `pub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      correlationId: input.correlationId,
      environmentId: input.environmentId,
      environment: environment.kind,
      documentId: artifact.documentId,
      documentVersionId: artifact.documentVersionId,
      compiledArtifactId: artifact.id,
      contentHash: artifact.contentHash,
      ...provenance,
      publishedByUserId: input.actorUserId,
      publishedAt: new Date().toISOString(),
      artifact: clone(artifact),
    };
    this.appendPublication(publication);
    return clone(publication);
  }

  protected appendPublication(publication: PersistedPublication): void {
    const key = this.key(publication.workspaceId, publication.environmentId);
    const publications = this.publications.get(key) ?? [];
    publications.push(clone(publication));
    this.publications.set(key, publications);
  }

  protected requireDeploymentPublication(
    deployment: PersistedDocumentDeployment,
  ): PersistedPublication {
    if (deployment.state !== 'active') {
      throw new Error('inactive document deployment has no current publication');
    }
    const publication = (
      this.publications.get(this.key(deployment.workspaceId, deployment.environmentId)) ?? []
    ).find((candidate) => candidate.id === deployment.activePublicationId);
    if (!publication) {
      throw new Error('active document deployment publication not found in workspace');
    }
    if (publication.documentId !== deployment.documentId) {
      throw new Error('active document deployment publication document mismatch');
    }
    return clone(publication);
  }

  protected getLatestLegacyPublication(
    workspaceId: string,
    environmentId: string,
  ): PersistedPublication | null {
    const [latest] = [...(this.publications.get(this.key(workspaceId, environmentId)) ?? [])].sort(
      comparePublicationsNewestFirst,
    );
    return latest ?? null;
  }

  protected listDocumentPublicationSummaries(
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

  protected persistCompiledArtifact(
    workspaceId: string,
    documentId: string,
    documentVersionId: string,
    compiled: CompiledDocument,
    createdAt: string,
  ): PersistedCompiledArtifact {
    const identityKey = this.artifactIdentityKey(workspaceId, documentId, compiled.contentHash);
    const existing = this.compiledArtifactsByIdentity.get(identityKey);
    if (existing) return clone(existing);

    const artifact: PersistedCompiledArtifact = {
      id: `artifact_${documentId}_${compiled.contentHash.replace(/[^a-zA-Z0-9]/g, '_')}`,
      workspaceId,
      documentId,
      documentVersionId,
      contentHash: compiled.contentHash,
      compilerVersion: compiled.compilerVersion,
      ...compiledArtifactMetadata(compiled),
      compiled: clone(compiled),
      createdAt,
    };
    this.compiledArtifactsByIdentity.set(identityKey, artifact);
    this.compiledArtifactsById.set(this.key(workspaceId, artifact.id), artifact);
    return clone(artifact);
  }

  protected rememberSeedArtifact(artifact: PersistedCompiledArtifact): void {
    const identityKey = this.artifactIdentityKey(
      artifact.workspaceId,
      artifact.documentId,
      artifact.contentHash,
    );
    if (this.compiledArtifactsByIdentity.has(identityKey)) return;
    const stored = clone(artifact);
    this.compiledArtifactsByIdentity.set(identityKey, stored);
    this.compiledArtifactsById.set(this.key(artifact.workspaceId, artifact.id), stored);
  }
}
