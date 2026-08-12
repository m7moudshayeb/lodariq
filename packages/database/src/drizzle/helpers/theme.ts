import {
  type BrandDriftRunRecord,
  type ProductStyleApplicationRecord,
  type StyleSourceRecord,
  type PublicationVerificationRecord,
  type ReleaseApprovalRecord,
  type WorkspaceThemeRecord,
  type WorkspaceThemeVersionRecord,
  type VisualCheckRunRecord,
  type WorkspaceEnvironment,
  assertProductStyleApplicationIntegrity,
  normalizeEnvironmentOriginAllowlist,
} from '../../repository';
import type {
  environments,
  publicationVerifications,
  productStyleApplications,
  releaseApprovals,
  themes,
  themeVersions,
  styleSources,
  brandDriftRuns,
  visualCheckRuns,
} from '../../schema';
import { toIsoString } from './persistence';

export function isUniqueConstraintViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') return false;
    if ('code' in current && current.code === '23505') return true;
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}

export function toWorkspaceEnvironment(
  environment: typeof environments.$inferSelect,
): WorkspaceEnvironment {
  return {
    id: environment.id,
    workspaceId: environment.workspaceId,
    kind: environment.kind,
    name: environment.name,
    originAllowlist: normalizeEnvironmentOriginAllowlist(
      environment.originAllowlist,
      environment.kind,
      environment.id,
    ),
    requiredApprovalCount: normalizeRequiredApprovalCount(environment.requiredApprovalCount),
    enabled: environment.enabled,
    pipelinePosition: environment.pipelinePosition,
    authoringEnabled: environment.authoringEnabled,
    ...(environment.promotionSourceEnvironmentId
      ? { promotionSourceEnvironmentId: environment.promotionSourceEnvironmentId }
      : {}),
    releasePolicy: environment.releasePolicy,
    createdAt: toIsoString(environment.createdAt),
    updatedAt: toIsoString(environment.updatedAt),
  };
}

export function normalizeRequiredApprovalCount(value: number): 0 | 1 {
  return value === 1 ? 1 : 0;
}

export function toStyleSourceRecord(source: typeof styleSources.$inferSelect): StyleSourceRecord {
  return {
    id: source.id,
    workspaceId: source.workspaceId,
    themeId: source.themeId,
    environmentId: source.environmentId,
    proposalId: source.proposalId,
    proposalHash: source.proposalHash,
    sourceOrdinal: source.sourceOrdinal,
    sourceCount: source.sourceCount,
    appliedThemeRevision: source.appliedThemeRevision,
    draftChanged: source.draftChanged,
    source: source.source,
    sourceHash: source.sourceHash,
    createdByUserId: source.createdByUserId,
    createdAt: toIsoString(source.createdAt),
  };
}

export function toProductStyleApplicationRecord(
  application: typeof productStyleApplications.$inferSelect,
): ProductStyleApplicationRecord {
  if (application.previewThemeHash !== application.previewTheme.contentHash) {
    throw new Error('persisted Product match preview hash does not match its receipt');
  }
  const record: ProductStyleApplicationRecord = {
    id: application.id,
    workspaceId: application.workspaceId,
    themeId: application.themeId,
    environmentId: application.environmentId,
    requestHash: application.requestHash,
    sourceSetHash: application.sourceSetHash,
    receipt: {
      proposalId: application.proposalId,
      draftRevision: application.draftRevision,
      draftUpdatedAt: toIsoString(application.draftUpdatedAt),
      previewTheme: application.previewTheme,
      sources: application.sourceReceipts,
      draftChanged: application.draftChanged,
    },
    createdByUserId: application.createdByUserId,
    createdAt: toIsoString(application.createdAt),
  };
  assertProductStyleApplicationIntegrity(record);
  return record;
}

export function toBrandDriftRunRecord(
  run: typeof brandDriftRuns.$inferSelect,
): BrandDriftRunRecord {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    environmentId: run.environmentId,
    documentId: run.documentId,
    themeId: run.themeId,
    baselineThemeVersionId: run.baselineThemeVersionId,
    trigger: run.trigger,
    classification: run.classification,
    confidence: run.confidence,
    report: structuredClone(run.report),
    createdByUserId: run.createdByUserId,
    createdAt: toIsoString(run.createdAt),
  };
}

export function compareStyleSourceRecords(
  left: StyleSourceRecord,
  right: StyleSourceRecord,
): number {
  return left.sourceOrdinal - right.sourceOrdinal || left.id.localeCompare(right.id);
}

export function toPublicationVerificationRecord(
  verification: typeof publicationVerifications.$inferSelect,
): PublicationVerificationRecord {
  return {
    id: verification.id,
    workspaceId: verification.workspaceId,
    environmentId: verification.environmentId,
    documentId: verification.documentId,
    publicationId: verification.publicationId,
    result: verification.result,
    report: verification.report,
    verifiedOrigin: verification.verifiedOrigin,
    verifiedByUserId: verification.verifiedByUserId,
    createdAt: toIsoString(verification.createdAt),
  };
}

export function toReleaseApprovalRecord(
  approval: typeof releaseApprovals.$inferSelect,
): ReleaseApprovalRecord {
  return {
    id: approval.id,
    workspaceId: approval.workspaceId,
    releaseOperationId: approval.releaseOperationId,
    decision: approval.decision,
    reason: approval.reason,
    decidedByUserId: approval.decidedByUserId,
    createdAt: toIsoString(approval.createdAt),
  };
}

export function toWorkspaceThemeRecord(
  theme: typeof themes.$inferSelect,
  activeVersion: WorkspaceThemeVersionRecord | null,
): WorkspaceThemeRecord {
  return {
    id: theme.id,
    workspaceId: theme.workspaceId,
    name: theme.name,
    draft: theme.draft,
    revision: theme.revision,
    isDefault: theme.isDefault,
    activeVersionId: theme.activeVersionId,
    activeVersion,
    createdByUserId: theme.createdByUserId,
    updatedByUserId: theme.updatedByUserId,
    createdAt: toIsoString(theme.createdAt),
    updatedAt: toIsoString(theme.updatedAt),
  };
}

export function toWorkspaceThemeVersionRecord(
  version: typeof themeVersions.$inferSelect,
): WorkspaceThemeVersionRecord {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    themeId: version.themeId,
    version: version.version,
    schemaVersion: version.snapshot.schemaVersion,
    contractVersion: version.snapshot.contractVersion,
    snapshot: version.snapshot,
    contentHash: version.contentHash,
    approvedByUserId: version.approvedByUserId,
    approvedAt: toIsoString(version.approvedAt),
    createdAt: toIsoString(version.createdAt),
  };
}

export function workspaceThemeVersionValues(version: WorkspaceThemeVersionRecord) {
  return {
    id: version.id,
    workspaceId: version.workspaceId,
    themeId: version.themeId,
    version: version.version,
    schemaVersion: version.schemaVersion,
    contractVersion: version.contractVersion,
    snapshot: version.snapshot,
    contentHash: version.contentHash,
    approvedByUserId: version.approvedByUserId,
    approvedAt: new Date(version.approvedAt),
    createdAt: new Date(version.createdAt),
  };
}

export function toVisualCheckRunRecord(
  run: typeof visualCheckRuns.$inferSelect,
): VisualCheckRunRecord {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    documentId: run.documentId,
    documentVersionId: run.documentVersionId,
    compiledArtifactId: run.compiledArtifactId,
    themeVersionId: run.themeVersionId,
    environmentId: run.environmentId,
    contentHash: run.contentHash,
    report: run.report,
    status: run.status,
    createdByUserId: run.createdByUserId,
    createdAt: toIsoString(run.createdAt),
  };
}
