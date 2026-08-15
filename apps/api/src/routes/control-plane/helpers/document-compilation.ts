import { compileDocument } from '@lodariq/compiler';
import type { LodariqDocument } from '@lodariq/schema';
import {
  DEFAULT_CONTENT_LOCALE,
  CompiledDocument,
  DEFAULT_EXPERIENCE_APPEARANCE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  publishReadinessIssueLabel,
  collectTourMediaAssetIds,
  validate,
  validateTourPublishReadiness,
  type BrandThemeSnapshot as BrandThemeSnapshotType,
  type CompiledDocument as CompiledDocumentType,
  type PublishReadinessIssue,
} from '@lodariq/schema';
import {
  extractHistoricalReleaseArtifactPins,
  type ControlPlaneRepository,
  type DocumentSummary,
  type PersistedDocument,
  type PersistedDocumentDeployment,
  type PersistedPublication,
  type PublicationVerificationRecord,
} from '@lodariq/database';
import type { CompiledArtifactResponse, PublicationResponse } from '../support';
import { DocumentThemeResolutionError } from './sdk-delivery';

export function hasLegacyThemeReference(document: PersistedDocument['document']): boolean {
  return !document.themeBinding && Boolean(document.themeRef?.trim());
}

export async function compileAndValidate(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<CompiledDocumentType> {
  const theme = await resolveDocumentTheme(repository, document);
  const compiled = await compileDocument({
    document,
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
  const result = validate(CompiledDocument, compiled);
  if (!result.valid) {
    throw new Error(`Compiled artifact failed schema validation: ${JSON.stringify(result.errors)}`);
  }
  return result.value;
}

export async function resolveDocumentTheme(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<BrandThemeSnapshotType> {
  const binding = document.themeBinding;
  if (!binding) {
    if (hasLegacyThemeReference(document)) {
      throw new DocumentThemeResolutionError(
        'theme_migration_required',
        'Choose an approved Brand theme before compiling this legacy draft',
      );
    }
    return LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1;
  }

  const theme = await repository.getWorkspaceTheme(document.workspaceId, binding.themeId);
  if (!theme) {
    throw new DocumentThemeResolutionError(
      'theme_binding_unavailable',
      'The document Brand theme no longer exists',
    );
  }
  const expectedVersionId =
    binding.policy === 'pinned' ? binding.themeVersionId : binding.acknowledgedThemeVersionId;
  const versions = await repository.listWorkspaceThemeVersions(document.workspaceId, theme.id);
  const version = versions.find((candidate) => candidate.id === expectedVersionId);
  if (!version) {
    throw new DocumentThemeResolutionError(
      'theme_binding_unavailable',
      'The document Brand theme version is unavailable or has not been approved',
    );
  }
  return version.snapshot;
}

export async function bindNewDocumentToDefaultTheme(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<LodariqDocument> {
  const next = structuredClone(document);
  next.appearance ??= structuredClone(DEFAULT_EXPERIENCE_APPEARANCE);
  next.localization ??= { defaultLocale: DEFAULT_CONTENT_LOCALE, variants: [] };
  const theme = await repository.getDefaultWorkspaceTheme(document.workspaceId);
  if (!theme?.activeVersionId) return next;
  next.themeBinding = {
    policy: 'workspace-current',
    themeId: theme.id,
    acknowledgedThemeVersionId: theme.activeVersionId,
  };
  return next;
}

export async function getThemeReleaseReview(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<{
  themeId: string;
  acknowledgedThemeVersionId: string;
  activeThemeVersionId: string;
} | null> {
  const binding = document.themeBinding;
  if (!binding || binding.policy !== 'workspace-current') return null;
  const theme = await repository.getWorkspaceTheme(document.workspaceId, binding.themeId);
  const activeThemeVersionId = theme?.activeVersionId;
  if (!activeThemeVersionId || activeThemeVersionId === binding.acknowledgedThemeVersionId) {
    return null;
  }
  return {
    themeId: binding.themeId,
    acknowledgedThemeVersionId: binding.acknowledgedThemeVersionId,
    activeThemeVersionId,
  };
}

export async function listDocumentSummariesWithReadiness(
  repository: ControlPlaneRepository,
  workspaceId: string,
): Promise<DocumentSummaryWithReleaseEvidence[]> {
  const [summaries, workspaceDeployments, mediaAssets] = await Promise.all([
    repository.listDocuments(workspaceId),
    repository.listDocumentDeployments(workspaceId),
    repository.listAuthoringMediaAssets(workspaceId),
  ]);
  const validMediaAssets = new Map(mediaAssets.map((asset) => [asset.id, asset.kind]));
  return Promise.all(
    summaries.map(async (summary) => {
      const [record, publicationRecords] = await Promise.all([
        repository.getDocument(workspaceId, summary.id),
        repository.listDocumentPublications(workspaceId, summary.id),
      ]);
      const issues = record
        ? validateDocumentReleaseReadiness(record.document, validMediaAssets)
        : [];
      const deployments = workspaceDeployments.filter(
        (deployment) => deployment.documentId === summary.id,
      );
      const publications = await latestDocumentPublicationEvidence(
        repository,
        publicationRecords,
        deployments,
      );
      return {
        ...summary,
        publications,
        deployments,
        ...(record?.latestArtifact ? { latestCompiledArtifactId: record.latestArtifact.id } : {}),
        publishReadinessIssues: issues.map(toPublishReadinessIssueResponse),
      };
    }),
  );
}

export function validateDocumentReleaseReadiness(
  document: LodariqDocument,
  validMediaAssets?: ReadonlyMap<string, 'image' | 'video' | 'captions'>,
): PublishReadinessIssue[] {
  return validateTourPublishReadiness(document, {
    ...(validMediaAssets ? { validMediaAssets, requireValidMediaAssets: true } : {}),
  });
}

export async function validMediaAssetsForDocument(
  repository: ControlPlaneRepository,
  document: LodariqDocument,
): Promise<ReadonlyMap<string, 'image' | 'video' | 'captions'>> {
  const referenced = collectTourMediaAssetIds(document);
  if (referenced.length === 0) return new Map();
  const referencedIds = new Set(referenced);
  const assets = await repository.listAuthoringMediaAssets(document.workspaceId);
  return new Map(
    assets.filter((asset) => referencedIds.has(asset.id)).map((asset) => [asset.id, asset.kind]),
  );
}

export function compiledMediaAssetIds(compiled: CompiledDocumentType): string[] {
  const assetIds = new Set<string>();
  for (const step of compiled.steps) {
    for (const node of step.body) {
      const media = (
        node.props as {
          media?: {
            assetId: string;
            kind: 'image' | 'video';
            captionsAssetId?: string;
            posterAssetId?: string;
          };
        }
      ).media;
      if (!media) continue;
      assetIds.add(media.assetId);
      if (media.kind === 'video') {
        if (media.captionsAssetId) assetIds.add(media.captionsAssetId);
        if (media.posterAssetId) assetIds.add(media.posterAssetId);
      }
    }
  }
  return [...assetIds];
}

export interface DocumentSummaryWithReleaseEvidence extends Omit<DocumentSummary, 'publications'> {
  publications: DocumentPublicationEvidence[];
  deployments: PersistedDocumentDeployment[];
  latestCompiledArtifactId?: string;
  publishReadinessIssues: PublishReadinessIssueResponse[];
}

export interface DocumentPublicationEvidence {
  id: string;
  publicationId: string;
  environmentId: string;
  environment: PersistedPublication['environment'];
  contentHash: string;
  publishedAt: string;
  compiledArtifactId: string;
  action: PersistedPublication['action'];
  sourcePublicationId: string | null;
  previousPublicationId: string | null;
  releaseOperationId: string | null;
  active: boolean;
  generation: number;
  rendererContractVersion?: string;
  themeVersionId?: string;
  themeContentHash?: string;
  verification:
    | { status: 'not-run' }
    | {
        status: PublicationVerificationRecord['result'];
        result: PublicationVerificationRecord['result'];
        verificationId: string;
        verifiedAt: string;
        createdAt: string;
      };
}

export async function latestDocumentPublicationEvidence(
  repository: ControlPlaneRepository,
  publications: PersistedPublication[],
  deployments: PersistedDocumentDeployment[],
): Promise<DocumentPublicationEvidence[]> {
  const latestByEnvironment = new Map<string, PersistedPublication>();
  for (const publication of publications) {
    if (!latestByEnvironment.has(publication.environmentId)) {
      latestByEnvironment.set(publication.environmentId, publication);
    }
  }
  return Promise.all(
    [...latestByEnvironment.values()]
      .sort((left, right) => left.environment.localeCompare(right.environment))
      .map(async (publication) => {
        const deployment = deployments.find(
          (candidate) => candidate.environmentId === publication.environmentId,
        );
        const verifications =
          publication.environment === 'staging'
            ? await repository.listPublicationVerifications(publication.workspaceId, publication.id)
            : [];
        const verification = verifications[0];
        const artifactPins = extractHistoricalReleaseArtifactPins(publication.artifact);
        const exactThemeEvidence = artifactPins
          ? {
              rendererContractVersion: artifactPins.rendererContractVersion,
              themeVersionId: artifactPins.themeVersionId,
              themeContentHash: artifactPins.themeContentHash,
            }
          : {};
        const isActive =
          deployment?.state === 'active' && deployment.activePublicationId === publication.id;
        return {
          id: publication.id,
          publicationId: publication.id,
          environmentId: publication.environmentId,
          environment: publication.environment,
          contentHash: publication.contentHash,
          publishedAt: publication.publishedAt,
          compiledArtifactId: publication.compiledArtifactId,
          action: publication.action,
          sourcePublicationId: publication.sourcePublicationId,
          previousPublicationId: publication.previousPublicationId,
          releaseOperationId: publication.releaseOperationId,
          active: isActive,
          generation: deployment?.generation ?? 0,
          ...exactThemeEvidence,
          verification: verification
            ? {
                status: verification.result,
                result: verification.result,
                verificationId: verification.id,
                verifiedAt: verification.createdAt,
                createdAt: verification.createdAt,
              }
            : { status: 'not-run' as const },
        };
      }),
  );
}

export interface PublishReadinessIssueResponse extends PublishReadinessIssue {
  label: string;
}

export function toPublishReadinessIssueResponse(
  issue: PublishReadinessIssue,
): PublishReadinessIssueResponse {
  return {
    ...issue,
    label: publishReadinessIssueLabel(issue.code),
  };
}

export function toPublicationResponse(publication: PersistedPublication): PublicationResponse {
  const artifact: CompiledArtifactResponse = {
    id: publication.artifact.id,
    workspaceId: publication.artifact.workspaceId,
    documentId: publication.artifact.documentId,
    contentHash: publication.artifact.contentHash,
    compilerVersion: publication.artifact.compilerVersion,
    createdAt: publication.artifact.createdAt,
  };
  if (publication.artifact.documentVersionId !== undefined) {
    artifact.documentVersionId = publication.artifact.documentVersionId;
  }
  if (publication.artifact.themeVersionId !== undefined) {
    artifact.themeVersionId = publication.artifact.themeVersionId;
  }
  if (publication.artifact.themeContentHash !== undefined) {
    artifact.themeContentHash = publication.artifact.themeContentHash;
  }
  if (publication.artifact.rendererContractVersion !== undefined) {
    artifact.rendererContractVersion = publication.artifact.rendererContractVersion;
  }

  const response: PublicationResponse = {
    id: publication.id,
    workspaceId: publication.workspaceId,
    correlationId: publication.correlationId,
    environmentId: publication.environmentId,
    environment: publication.environment,
    documentId: publication.documentId,
    compiledArtifactId: publication.compiledArtifactId,
    contentHash: publication.contentHash,
    action: publication.action,
    sourcePublicationId: publication.sourcePublicationId,
    previousPublicationId: publication.previousPublicationId,
    releaseOperationId: publication.releaseOperationId,
    publishedByUserId: publication.publishedByUserId,
    publishedAt: publication.publishedAt,
    artifact,
  };
  if (publication.documentVersionId !== undefined) {
    response.documentVersionId = publication.documentVersionId;
  }
  return response;
}
