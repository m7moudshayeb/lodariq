import {
  ANALYTICS_TARGET_RESOLUTION_STATUSES,
  isAuthoringControlPlaneRole,
  type AnalyticsTargetResolutionStatus,
  type CompiledDocument,
} from '@lodariq/schema';
import {
  type AuthoringSessionRecord,
  type PersistedAnalyticsEventRecord,
  type PersistedCompiledArtifact,
  type PersistedDocumentDeployment,
  type PersistedDocumentVersion,
  type PersistedPublication,
  type PersistedReleaseOperation,
  type PublicSdkInstallationOriginRecord,
  type SaveDocumentInput,
} from '../../repository';
import type {
  compiledArtifacts,
  authoringSessions,
  authoritativeAnalyticsEvents,
  documentDeployments,
  documentVersions,
  publications,
  releaseOperations,
} from '../../schema';

export function toPersistedAnalyticsEventRecord(
  event: typeof authoritativeAnalyticsEvents.$inferSelect,
): PersistedAnalyticsEventRecord {
  return {
    id: event.id,
    workspaceId: event.workspaceId,
    environmentId: event.environmentId,
    documentId: event.documentId,
    publicationId: event.publicationId,
    contentHash: event.contentHash,
    pointerGeneration: event.pointerGeneration,
    name: event.name,
    ...(event.stepId ? { stepId: event.stepId } : {}),
    sdkVersion: event.sdkVersion,
    ...(event.correlationId ? { correlationId: event.correlationId } : {}),
    timestamp: toIsoString(event.occurredAt),
    ...(event.props ? { props: event.props } : {}),
    ingestedAt: toIsoString(event.ingestedAt),
  };
}

export function createArtifactId(documentId: string, contentHash: string): string {
  return `artifact_${documentId}_${contentHash.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export function toPersistedArtifact(
  artifact: typeof compiledArtifacts.$inferSelect,
): PersistedCompiledArtifact {
  return {
    id: artifact.id,
    workspaceId: artifact.workspaceId,
    documentId: artifact.documentId,
    documentVersionId: artifact.documentVersionId,
    contentHash: artifact.contentHash,
    compilerVersion: artifact.compilerVersion,
    themeVersionId: artifact.themeVersionId,
    themeContentHash: artifact.themeContentHash,
    rendererContractVersion: artifact.rendererContractVersion,
    compiled: artifact.compiled,
    createdAt: toIsoString(artifact.createdAt),
  };
}

export function assertArtifactMatchesDocument(input: SaveDocumentInput): void {
  if (input.artifact && input.artifact.documentId !== input.document.id) {
    throw new Error('compiled artifact document mismatch');
  }
}

export function compiledArtifactMetadata(compiled: CompiledDocument): {
  themeVersionId: string | null;
  themeContentHash: string | null;
  rendererContractVersion: string | null;
} {
  if (compiled.artifactSchemaVersion !== '2') {
    return {
      themeVersionId: null,
      themeContentHash: null,
      rendererContractVersion: null,
    };
  }
  return {
    themeVersionId: compiled.theme.themeVersionId,
    themeContentHash: compiled.theme.contentHash,
    rendererContractVersion: compiled.rendererContractVersion,
  };
}

export function toPersistedPublication(
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
    action: toPersistedPublicationAction(publication.action),
    sourcePublicationId: publication.sourcePublicationId,
    previousPublicationId: publication.previousPublicationId,
    releaseOperationId: publication.releaseOperationId,
    publishedByUserId: publication.publishedByUserId,
    publishedAt: toIsoString(publication.publishedAt),
    artifact,
  };
}

export function toPersistedPublicationAction(
  action: 'publish' | 'promote' | 'rollback' | 'unpublish' | null,
): PersistedPublication['action'] {
  if (action === 'unpublish') {
    throw new Error('unpublish release operations do not create publications');
  }
  return action;
}

export function toPersistedDocumentDeployment(
  deployment: typeof documentDeployments.$inferSelect,
): PersistedDocumentDeployment {
  const shared = {
    workspaceId: deployment.workspaceId,
    environmentId: deployment.environmentId,
    documentId: deployment.documentId,
    generation: deployment.generation,
    updatedAt: toIsoString(deployment.updatedAt),
    pendingReleaseOperationId: deployment.pendingReleaseOperationId,
  };
  if (deployment.state === 'active') {
    if (!deployment.activePublicationId) {
      throw new Error('active document deployment has no publication');
    }
    return {
      ...shared,
      state: 'active',
      activePublicationId: deployment.activePublicationId,
    };
  }
  if (deployment.activePublicationId) {
    throw new Error('inactive document deployment has an active publication');
  }
  return {
    ...shared,
    state: 'inactive',
    activePublicationId: null,
  };
}

export function toPersistedReleaseOperation(
  operation: typeof releaseOperations.$inferSelect,
): PersistedReleaseOperation {
  if (
    operation.status !== 'awaiting_approval' &&
    operation.status !== 'activating' &&
    operation.status !== 'completed' &&
    operation.status !== 'failed'
  ) {
    throw new Error(`unsupported release operation status: ${operation.status}`);
  }
  if (
    (operation.action === 'publish' || operation.action === 'promote') &&
    !operation.requestedArtifactId
  ) {
    throw new Error('publish release operation has no requested artifact');
  }
  return {
    id: operation.id,
    workspaceId: operation.workspaceId,
    environmentId: operation.environmentId,
    documentId: operation.documentId,
    action: operation.action,
    requestedArtifactId: operation.requestedArtifactId,
    requestedSourcePublicationId: operation.requestedSourcePublicationId,
    requestedActivePublicationId: operation.requestedActivePublicationId,
    actualActivePublicationId: operation.actualActivePublicationId,
    sourcePublicationId: operation.sourcePublicationId,
    expectedGeneration: operation.expectedGeneration,
    resultGeneration: operation.resultGeneration,
    idempotencyKey: operation.idempotencyKey,
    requestHash: operation.requestHash,
    status: operation.status,
    correlationId: operation.correlationId,
    requestedByUserId: operation.requestedByUserId,
    resultPublicationId: operation.resultPublicationId,
    reason: operation.reason,
    errorCode: operation.errorCode,
    createdAt: toIsoString(operation.createdAt),
    completedAt: operation.completedAt ? toIsoString(operation.completedAt) : null,
  };
}

export function toPersistedDocumentVersion(
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

export function toAuthoringSessionRecord(
  session:
    | typeof authoringSessions.$inferSelect
    | (Pick<
        typeof authoringSessions.$inferSelect,
        | 'id'
        | 'workspaceId'
        | 'environmentId'
        | 'documentId'
        | 'installationId'
        | 'activationGrantId'
        | 'customerOrigin'
        | 'capabilities'
        | 'compilerVersion'
        | 'rendererContractVersion'
        | 'themeContractVersion'
        | 'themeVersionId'
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
  const activatedScope =
    'installationId' in session && session.installationId
      ? {
          installationId: session.installationId,
          activationGrantId: session.activationGrantId,
          customerOrigin: session.customerOrigin,
          capabilities: session.capabilities ? [...session.capabilities] : null,
        }
      : {};
  const compatibilityPins =
    'compilerVersion' in session
      ? {
          compilerVersion: session.compilerVersion,
          rendererContractVersion: session.rendererContractVersion,
          themeContractVersion: session.themeContractVersion,
          themeVersionId: session.themeVersionId,
        }
      : {};
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
    ...activatedScope,
    ...compatibilityPins,
  };
}

export function comparePublicSdkInstallationOriginRecords(
  left: PublicSdkInstallationOriginRecord,
  right: PublicSdkInstallationOriginRecord,
): number {
  const environmentOrder = left.environmentId.localeCompare(right.environmentId);
  return environmentOrder || left.exactOrigin.localeCompare(right.exactOrigin);
}

export function hasAuthoringWorkspaceRole(role: string): boolean {
  return isAuthoringControlPlaneRole(role);
}

export function toAnalyticsTargetResolutionStatus(
  value: string | null,
): AnalyticsTargetResolutionStatus {
  if (value && (ANALYTICS_TARGET_RESOLUTION_STATUSES as readonly string[]).includes(value)) {
    return value as AnalyticsTargetResolutionStatus;
  }
  return 'unknown';
}

export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
