import { isAuthoringControlPlaneRole, isPublishReadinessBlocker } from '@lodariq/schema';
import { setupI18n } from '@lingui/core';
import { DEFAULT_LOCALE } from '@lodariq/i18n';
import { DASHBOARD_COMMON_MESSAGES, DASHBOARD_VIEW_MODEL_MESSAGES } from '../i18n/messages';
import { dashboardPublishIssueCopy } from '../i18n/server-feedback';
import type {
  DashboardDataDto,
  DocumentSummaryDto,
  EnvironmentTokenDto,
  PublicSdkInstallationDto,
  WorkspaceThemeDto,
  WorkspaceEnvironmentDto,
} from './api';
import { buildAuthoringSiteOptions, type DashboardAuthoringSite } from './authoring-site-options';
import {
  buildBrandSourceSummary,
  type DashboardBrandSourceSummary,
} from './brand-source-view-model';
import {
  buildDocumentFlowMapUrl,
  describeDocumentFlowEvidence,
  documentFlowIssues,
} from './dashboard-flow-health';
import { formatDate, formatDateTime, timestampOf } from './view-model-formatters';
import type { DashboardViewModelLocalization } from './view-model-localization';
import type { DashboardStatusVariant } from './view-model-types';

export type { DashboardAuthoringSite } from './authoring-site-options';
export type { DashboardBrandSourceSummary } from './brand-source-view-model';
export type { DashboardViewModelLocalization } from './view-model-localization';
export type { DashboardStatusVariant } from './view-model-types';

type PublicationVariant = 'success' | 'warning' | 'outline';
export type ReleaseStageTone = 'complete' | 'current' | 'pending' | 'attention';
export type DashboardDocumentReadiness = 'blocked' | 'draft' | 'previewable' | 'archived';

export interface DashboardReleaseStage {
  id: 'draft' | 'staging' | 'production';
  label: string;
  statusLabel: string;
  detail: string;
  tone: ReleaseStageTone;
}

export interface DashboardRecentActivity {
  id: string;
  documentId?: string;
  title: string;
  typeLabel: string;
  detail: string;
  kind: 'document' | 'staging' | 'production' | 'brand';
}

export interface DashboardReleaseEvidence {
  id: 'draft' | 'flow' | 'staging' | 'production' | 'artifact';
  label: string;
  value: string;
  detail: string;
  tone: DashboardStatusVariant;
}

export interface DashboardViewModel {
  documentRows: Array<
    DocumentSummaryDto & {
      statusLabel: string;
      lifecycleVariant: DashboardStatusVariant;
      typeLabel: string;
      editorLabel: string;
      readinessDetail: string;
      readinessState: DashboardDocumentReadiness;
      readinessIssueCount: number;
      readinessIssueSummary: string;
      updatedAtLabel: string;
      contentHashLabel: string;
      contentHashDetail: string;
      publicationLabel: string;
      publicationDetail: string;
      publicationVariant: PublicationVariant;
      pageScopeLabel: string;
      lastActivityLabel: string;
      queueStatusLabel: string;
      queueStatusVariant: DashboardStatusVariant;
      releaseActionLabel: string;
      releaseEvidence: DashboardReleaseEvidence[];
      flowIssueCount: number;
      flowMapUrl: string;
      releaseSummary: string;
      releaseStages: DashboardReleaseStage[];
    }
  >;
  environmentOptions: Array<WorkspaceEnvironmentDto & { label: string; originLabel: string }>;
  sdkInstallEnvironmentOptions: Array<
    WorkspaceEnvironmentDto & { label: string; originLabel: string }
  >;
  tokenRows: Array<EnvironmentTokenDto & { stateLabel: string }>;
  installationRows: PublicSdkInstallationDto[];
  authoringSiteOptions: DashboardAuthoringSite[];
  defaultEnvironmentId: string;
  defaultSdkEnvironmentId: string;
  hasDocuments: boolean;
  hasTokens: boolean;
  hasInstallations: boolean;
  canManageSdkInstallations: boolean;
  brandThemes: WorkspaceThemeDto[];
  canEditBrandSystem: boolean;
  canApproveBrandSystem: boolean;
  openInProductUrl: string;
  brandSourceSummary: DashboardBrandSourceSummary;
  recentActivity: DashboardRecentActivity[];
}

const ENGLISH_I18N = setupI18n({ locale: DEFAULT_LOCALE, messages: { [DEFAULT_LOCALE]: {} } });
const DEFAULT_LOCALIZATION: DashboardViewModelLocalization = {
  locale: DEFAULT_LOCALE,
  translate: (descriptor, values) =>
    ENGLISH_I18N._(values ? { ...descriptor, values } : descriptor),
};

export function buildDashboardViewModel(
  data: DashboardDataDto,
  localization: DashboardViewModelLocalization = DEFAULT_LOCALIZATION,
): DashboardViewModel {
  const { locale, translate } = localization;
  const environmentOptions = data.environments.map((environment) => ({
    ...environment,
    label: `${environment.name} (${formatEnvironmentKind(environment.kind, translate)})`,
    originLabel: environment.originAllowlist.length
      ? environment.originAllowlist.join(', ')
      : translate(DASHBOARD_VIEW_MODEL_MESSAGES.noOrigins),
  }));
  const staging = environmentOptions.find((environment) => environment.kind === 'staging');
  const firstEnvironment = environmentOptions[0];
  const sdkInstallEnvironmentOptions = environmentOptions;
  const defaultSdkEnvironment = staging ?? sdkInstallEnvironmentOptions[0];
  const environmentById = new Map(
    environmentOptions.map((environment) => [environment.id, environment]),
  );
  const role = data.controlPlaneContext?.role;
  const authoringSiteOptions = isAuthoringControlPlaneRole(role)
    ? buildAuthoringSiteOptions(data.installations, environmentById, locale)
    : [];
  const brandThemes = [...data.themes].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  const documentRows = data.documents.map((document) => {
    const publication = buildPublicationInfo(document, environmentById, localization);
    const releaseQueue = buildReleaseQueueInfo(document, localization);
    const readinessState = documentReadinessState(document);
    const flowIssues = documentFlowIssues(document);
    return {
      ...document,
      statusLabel: formatDocumentStatus(document.status, translate),
      lifecycleVariant: documentLifecycleVariant(document.status),
      typeLabel: formatDocumentType(document.type, translate),
      editorLabel: formatEditorLabel(document, translate),
      readinessDetail: documentReadinessLabel(readinessState, translate),
      readinessState,
      readinessIssueCount: document.publishReadinessIssues.length,
      readinessIssueSummary: formatReadinessIssueSummary(document, translate),
      updatedAtLabel: formatDate(document.updatedAt, locale, translate),
      ...buildDraftInfo(document, translate),
      publicationLabel: publication.label,
      publicationDetail: publication.detail,
      publicationVariant: publication.variant,
      ...releaseQueue,
      flowIssueCount: flowIssues.length,
      flowMapUrl: buildDocumentFlowMapUrl(
        authoringSiteOptions[0]?.exactOrigin,
        document,
        flowIssues[0]?.blockId,
        locale,
      ),
    };
  });

  return {
    documentRows,
    environmentOptions,
    sdkInstallEnvironmentOptions,
    tokenRows: data.tokens.map((token) => ({
      ...token,
      stateLabel: translate(
        token.revokedAt
          ? DASHBOARD_VIEW_MODEL_MESSAGES.revoked
          : DASHBOARD_VIEW_MODEL_MESSAGES.active,
      ),
    })),
    installationRows: data.installations,
    authoringSiteOptions,
    defaultEnvironmentId: staging?.id ?? firstEnvironment?.id ?? '',
    defaultSdkEnvironmentId: defaultSdkEnvironment?.id ?? '',
    hasDocuments: data.documents.length > 0,
    hasTokens: data.tokens.length > 0,
    hasInstallations: data.installations.some((installation) => !installation.revokedAt),
    canManageSdkInstallations: role === 'owner' || role === 'admin',
    brandThemes,
    canEditBrandSystem: role === 'owner' || role === 'admin' || role === 'member',
    canApproveBrandSystem: role === 'owner' || role === 'admin',
    openInProductUrl: authoringSiteOptions[0]?.launchUrl ?? '',
    brandSourceSummary: buildBrandSourceSummary(brandThemes, localization),
    recentActivity: buildRecentActivity(documentRows, brandThemes, localization),
  };
}

function buildReleaseQueueInfo(
  document: DocumentSummaryDto,
  localization: DashboardViewModelLocalization,
): {
  pageScopeLabel: string;
  lastActivityLabel: string;
  queueStatusLabel: string;
  queueStatusVariant: DashboardStatusVariant;
  releaseActionLabel: string;
  releaseEvidence: DashboardReleaseEvidence[];
  releaseSummary: string;
  releaseStages: DashboardReleaseStage[];
} {
  const { locale, translate } = localization;
  const stagingPublication = latestPublicationForEnvironment(document, 'staging');
  const productionPublication = latestPublicationForEnvironment(document, 'production');
  const latestContentHash = document.latestContentHash;
  const blockingIssues = documentBlockingIssues(document);
  const hasBlockers = blockingIssues.length > 0;
  const stagingIsCurrent = publicationMatchesDraft(stagingPublication, latestContentHash);
  const productionIsCurrent = publicationMatchesDraft(productionPublication, latestContentHash);
  const stagingVerification = publicationVerification(stagingPublication);
  const productionActive = publicationIsActive(productionPublication);
  const productionIsExactPromotion = publicationsShareArtifact(
    stagingPublication,
    productionPublication,
  );
  const releaseEvidence = buildReleaseEvidence(
    document,
    stagingPublication,
    productionPublication,
    localization,
  );
  const releaseStages: DashboardReleaseStage[] = [
    buildDraftStage(document, localization),
    buildEnvironmentStage('staging', stagingPublication, latestContentHash, localization),
    buildEnvironmentStage('production', productionPublication, latestContentHash, localization),
  ];

  if (hasBlockers) {
    return {
      pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
      lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
      queueStatusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.needsReview),
      queueStatusVariant: 'warning',
      releaseActionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.reviewBlockers),
      releaseEvidence,
      releaseSummary: translate(DASHBOARD_VIEW_MODEL_MESSAGES.reviewBeforePublish, {
        issues: formatIssueCount(blockingIssues.length, translate),
      }),
      releaseStages,
    };
  }

  if (!latestContentHash) {
    return {
      pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
      lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
      queueStatusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.draftNotPrepared),
      queueStatusVariant: 'outline',
      releaseActionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.prepareDraft),
      releaseEvidence,
      releaseSummary: translate(DASHBOARD_VIEW_MODEL_MESSAGES.previewToPrepareDraft),
      releaseStages,
    };
  }

  if (productionIsCurrent) {
    return {
      pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
      lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
      queueStatusLabel: translate(
        productionActive
          ? DASHBOARD_VIEW_MODEL_MESSAGES.productionLive
          : DASHBOARD_VIEW_MODEL_MESSAGES.productionPublished,
      ),
      queueStatusVariant: productionActive ? 'success' : 'info',
      releaseActionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.reviewRelease),
      releaseEvidence,
      releaseSummary: productionCurrentSummary(
        productionActive,
        productionIsExactPromotion,
        translate,
      ),
      releaseStages,
    };
  }

  if (productionPublication) {
    return {
      pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
      lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
      queueStatusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.productionUpdate),
      queueStatusVariant: 'warning',
      releaseActionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.reviewProductionUpdate),
      releaseEvidence,
      releaseSummary: translate(DASHBOARD_VIEW_MODEL_MESSAGES.productionEarlierHash),
      releaseStages,
    };
  }

  if (stagingIsCurrent) {
    return {
      pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
      lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
      queueStatusLabel: translate(
        stagingVerification === 'passed'
          ? DASHBOARD_VIEW_MODEL_MESSAGES.stagingVerified
          : DASHBOARD_VIEW_MODEL_MESSAGES.stagingPublished,
      ),
      queueStatusVariant: stagingVerification === 'passed' ? 'success' : 'info',
      releaseActionLabel: translate(
        stagingVerification === 'passed'
          ? DASHBOARD_VIEW_MODEL_MESSAGES.reviewPromotion
          : DASHBOARD_VIEW_MODEL_MESSAGES.reviewVerification,
      ),
      releaseEvidence,
      releaseSummary: translate(
        stagingVerification === 'passed'
          ? DASHBOARD_VIEW_MODEL_MESSAGES.stagedArtifactReady
          : DASHBOARD_VIEW_MODEL_MESSAGES.stagedArtifactNeedsVerification,
      ),
      releaseStages,
    };
  }

  if (stagingPublication) {
    return {
      pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
      lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
      queueStatusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.stagingUpdate),
      queueStatusVariant: 'warning',
      releaseActionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.publishCurrentDraft),
      releaseEvidence,
      releaseSummary: translate(DASHBOARD_VIEW_MODEL_MESSAGES.stagingEarlierHash),
      releaseStages,
    };
  }

  return {
    pageScopeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notSpecified),
    lastActivityLabel: formatDateTime(document.updatedAt, locale, translate),
    queueStatusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.readyForStaging),
    queueStatusVariant: 'info',
    releaseActionLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.publishToStaging),
    releaseEvidence,
    releaseSummary: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noStagingRecordYet),
    releaseStages,
  };
}

function buildDraftStage(
  document: DocumentSummaryDto,
  localization: DashboardViewModelLocalization,
): DashboardReleaseStage {
  const { translate } = localization;
  const issue = document.publishReadinessIssues[0];
  if (issue) {
    return {
      id: 'draft',
      label: translate(DASHBOARD_COMMON_MESSAGES.draft),
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.needsReview),
      detail: translate(dashboardPublishIssueCopy(issue.code).label),
      tone: 'attention',
    };
  }
  if (document.latestContentHash) {
    return {
      id: 'draft',
      label: translate(DASHBOARD_COMMON_MESSAGES.draft),
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.draftSaved),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.currentSavedContent),
      tone: 'current',
    };
  }
  return {
    id: 'draft',
    label: translate(DASHBOARD_COMMON_MESSAGES.draft),
    statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.needsPreview),
    detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noCompiledDraft),
    tone: 'pending',
  };
}

function buildEnvironmentStage(
  environment: 'staging' | 'production',
  publication: DocumentSummaryDto['publications'][number] | undefined,
  latestContentHash: string | undefined,
  localization: DashboardViewModelLocalization,
): DashboardReleaseStage {
  const { locale, translate } = localization;
  const label = translate(
    environment === 'staging'
      ? DASHBOARD_COMMON_MESSAGES.staging
      : DASHBOARD_COMMON_MESSAGES.production,
  );
  if (!publication) {
    return {
      id: environment,
      label,
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noRecord),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noEnvironmentPublicationRecord, {
        environment: label,
      }),
      tone: 'pending',
    };
  }

  if (!publicationMatchesDraft(publication, latestContentHash)) {
    return {
      id: environment,
      label,
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.newerDraft),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.latestRecordAt, {
        date: formatDateTime(publication.publishedAt, locale, translate),
      }),
      tone: 'attention',
    };
  }

  const verification = publicationVerification(publication);
  if (environment === 'staging' && verification === 'passed') {
    return {
      id: environment,
      label,
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.verified),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.verifiedExactArtifactAt, {
        date: formatDateTime(publication.publishedAt, locale, translate),
      }),
      tone: 'complete',
    };
  }
  if (environment === 'production' && publicationIsActive(publication)) {
    return {
      id: environment,
      label,
      statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.live),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.activePublicationAt, {
        date: formatDateTime(publication.publishedAt, locale, translate),
      }),
      tone: 'complete',
    };
  }

  return {
    id: environment,
    label,
    statusLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.published),
    detail: translate(
      environment === 'staging'
        ? DASHBOARD_VIEW_MODEL_MESSAGES.publishedVerificationPending
        : DASHBOARD_VIEW_MODEL_MESSAGES.publishedDeliveryUnconfirmed,
      { date: formatDateTime(publication.publishedAt, locale, translate) },
    ),
    tone: 'current',
  };
}

type PublicationWithEvidence = DocumentSummaryDto['publications'][number] & {
  artifactId?: string;
  isActive?: boolean;
  rendererVersion?: string;
  themeVersion?: number;
  verificationStatus?: 'not-run' | 'running' | 'passed' | 'failed';
  verifiedAt?: string;
};

function publicationVerification(
  publication: DocumentSummaryDto['publications'][number] | undefined,
): PublicationWithEvidence['verificationStatus'] | undefined {
  if (!publication) return undefined;
  const evidence = publication as PublicationWithEvidence;
  return evidence.verification?.status ?? evidence.verificationStatus;
}

function publicationVerifiedAt(
  publication: DocumentSummaryDto['publications'][number] | undefined,
): string | undefined {
  if (!publication) return undefined;
  const evidence = publication as PublicationWithEvidence;
  const verification = evidence.verification;
  return verification && 'verifiedAt' in verification
    ? verification.verifiedAt
    : evidence.verifiedAt;
}

function publicationIsActive(
  publication: DocumentSummaryDto['publications'][number] | undefined,
): boolean {
  const evidence = publication as PublicationWithEvidence | undefined;
  return Boolean(evidence?.active ?? evidence?.isActive);
}

function productionCurrentSummary(
  active: boolean,
  exactPromotion: boolean,
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (active && exactPromotion) {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.exactArtifactPromoted);
  }
  if (active) {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.activeProvenanceUnavailable);
  }
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.productionMatchesNoDeliveryEvidence);
}

function publicationsShareArtifact(
  staging: DocumentSummaryDto['publications'][number] | undefined,
  production: DocumentSummaryDto['publications'][number] | undefined,
): boolean {
  const stagingArtifactId = publicationArtifactId(staging);
  const productionArtifactId = publicationArtifactId(production);
  return Boolean(stagingArtifactId && productionArtifactId === stagingArtifactId);
}

function publicationArtifactId(
  publication: DocumentSummaryDto['publications'][number] | undefined,
): string | undefined {
  const evidence = publication as PublicationWithEvidence | undefined;
  return evidence?.artifactId ?? evidence?.compiledArtifactId;
}

function buildReleaseEvidence(
  document: DocumentSummaryDto,
  staging: DocumentSummaryDto['publications'][number] | undefined,
  production: DocumentSummaryDto['publications'][number] | undefined,
  localization: DashboardViewModelLocalization,
): DashboardReleaseEvidence[] {
  const { translate } = localization;
  const stagingVerification = publicationVerification(staging);
  const stagingVerifiedAt = publicationVerifiedAt(staging);
  const artifactPublication = staging ?? production;
  const artifactId = publicationArtifactId(artifactPublication);
  const stagingEvidence = describeStagingEvidence(
    staging,
    stagingVerification,
    stagingVerifiedAt,
    localization,
  );
  const productionEvidence = describeProductionEvidence(production, staging, localization);
  const artifactEvidence = describeArtifactEvidence(artifactPublication, artifactId, localization);
  const flowEvidence = describeDocumentFlowEvidence(document, localization);
  return [
    {
      id: 'draft',
      label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.currentDraft),
      value: document.latestContentHash
        ? shortHash(document.latestContentHash, translate)
        : translate(DASHBOARD_VIEW_MODEL_MESSAGES.notPrepared),
      detail: draftEvidenceDetail(document, translate),
      tone: document.publishReadinessIssues.length ? 'warning' : 'outline',
    },
    ...(flowEvidence
      ? [
          {
            id: 'flow' as const,
            label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.flowHealth),
            ...flowEvidence,
          },
        ]
      : []),
    {
      id: 'staging',
      label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.stagingEvidence),
      ...stagingEvidence,
    },
    {
      id: 'production',
      label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.productionEvidence),
      ...productionEvidence,
    },
    {
      id: 'artifact',
      label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.artifactIdentity),
      ...artifactEvidence,
    },
  ];
}

function draftEvidenceDetail(
  document: DocumentSummaryDto,
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (!document.latestContentHash) {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.previewToPrepareArtifact);
  }
  const count = documentBlockingIssues(document).length;
  if (count === 0) return translate(DASHBOARD_VIEW_MODEL_MESSAGES.noBlockingChecks);
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.blockingChecks, { count });
}

function describeStagingEvidence(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  verification: PublicationWithEvidence['verificationStatus'] | undefined,
  verifiedAt: string | undefined,
  localization: DashboardViewModelLocalization,
): Pick<DashboardReleaseEvidence, 'value' | 'detail' | 'tone'> {
  const { locale, translate } = localization;
  if (!publication) {
    return {
      value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notPublished),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noStagingPublicationRecord),
      tone: 'outline',
    };
  }
  if (verification === 'passed') {
    return {
      value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.verified),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.exactArtifactVerifiedAt, {
        date: formatDateTime(verifiedAt ?? publication.publishedAt, locale, translate),
      }),
      tone: 'success',
    };
  }
  return {
    value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.published),
    detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.publishedNoBrowserVerification, {
      date: formatDateTime(publication.publishedAt, locale, translate),
    }),
    tone: 'info',
  };
}

function describeProductionEvidence(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  staging: DocumentSummaryDto['publications'][number] | undefined,
  localization: DashboardViewModelLocalization,
): Pick<DashboardReleaseEvidence, 'value' | 'detail' | 'tone'> {
  const { locale, translate } = localization;
  if (!publication) {
    return {
      value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.notPublished),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noProductionPublicationRecord),
      tone: 'outline',
    };
  }
  if (publicationIsActive(publication)) {
    return {
      value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.live),
      detail: publicationsShareArtifact(staging, publication)
        ? translate(DASHBOARD_VIEW_MODEL_MESSAGES.exactStagedArtifactActiveAt, {
            date: formatDateTime(publication.publishedAt, locale, translate),
          })
        : translate(DASHBOARD_VIEW_MODEL_MESSAGES.activeNoProvenanceAt, {
            date: formatDateTime(publication.publishedAt, locale, translate),
          }),
      tone: 'success',
    };
  }
  return {
    value: translate(DASHBOARD_VIEW_MODEL_MESSAGES.published),
    detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.publishedPointerNotExposed, {
      date: formatDateTime(publication.publishedAt, locale, translate),
    }),
    tone: 'info',
  };
}

function describeArtifactEvidence(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  artifactId: string | undefined,
  localization: DashboardViewModelLocalization,
): Pick<DashboardReleaseEvidence, 'value' | 'detail' | 'tone'> {
  const { translate } = localization;
  if (artifactId) {
    return {
      value: shortArtifactId(artifactId, translate),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.immutableCompiledArtifact),
      tone: 'outline',
    };
  }
  if (publication) {
    return {
      value: shortHash(publication.contentHash, translate),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.contentHashStrongestEvidence),
      tone: 'outline',
    };
  }
  return {
    value: translate(DASHBOARD_COMMON_MESSAGES.notAvailable),
    detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.createdDuringPublication),
    tone: 'warning',
  };
}

function buildRecentActivity(
  documents: DashboardViewModel['documentRows'],
  themes: WorkspaceThemeDto[],
  localization: DashboardViewModelLocalization,
): DashboardRecentActivity[] {
  const { locale, translate } = localization;
  const activities: Array<DashboardRecentActivity & { occurredAt: string }> = [];
  for (const document of documents) {
    activities.push({
      id: `document-update:${document.id}:${document.updatedAt}`,
      documentId: document.id,
      title: translate(DASHBOARD_VIEW_MODEL_MESSAGES.documentUpdated, {
        document: document.title,
      }),
      typeLabel: document.typeLabel,
      detail: document.lastActivityLabel,
      kind: 'document',
      occurredAt: document.updatedAt,
    });
    for (const publication of document.publications) {
      if (publication.environment !== 'staging' && publication.environment !== 'production') {
        continue;
      }
      const kind = publication.environment;
      activities.push({
        id: `publication:${document.id}:${publication.environmentId}:${publication.publishedAt}`,
        documentId: document.id,
        title: translate(DASHBOARD_VIEW_MODEL_MESSAGES.documentPublished, {
          document: document.title,
          environment: formatEnvironmentKind(publication.environment, translate),
        }),
        typeLabel:
          publicationVerification(publication) === 'passed' && publication.environment === 'staging'
            ? translate(DASHBOARD_VIEW_MODEL_MESSAGES.exactArtifactVerified)
            : translate(DASHBOARD_VIEW_MODEL_MESSAGES.immutablePublication),
        detail: formatDateTime(publication.publishedAt, locale, translate),
        kind,
        occurredAt: publication.publishedAt,
      });
    }
  }
  for (const theme of themes) {
    if (!theme.activeVersion) continue;
    activities.push({
      id: `brand-approval:${theme.id}:${theme.activeVersion.id}`,
      title: translate(DASHBOARD_VIEW_MODEL_MESSAGES.brandVersionApproved, {
        theme: theme.name,
        version: theme.activeVersion.version,
      }),
      typeLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.immutableBrandSnapshot),
      detail: formatDateTime(theme.activeVersion.approvedAt, locale, translate),
      kind: 'brand',
      occurredAt: theme.activeVersion.approvedAt,
    });
  }
  return activities
    .sort((left, right) => timestampOf(right.occurredAt) - timestampOf(left.occurredAt))
    .slice(0, 6)
    .map(({ occurredAt: _occurredAt, ...activity }) => activity);
}

function shortHash(
  value: string | undefined,
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (!value) return translate(DASHBOARD_COMMON_MESSAGES.notAvailable);
  return value.length <= 14 ? value : `…${value.slice(-10)}`;
}

function shortArtifactId(
  value: string,
  translate: DashboardViewModelLocalization['translate'],
): string {
  return value.length <= 18
    ? value
    : translate(DASHBOARD_VIEW_MODEL_MESSAGES.artifactShort, { suffix: value.slice(-10) });
}

function latestPublicationForEnvironment(
  document: DocumentSummaryDto,
  environment: WorkspaceEnvironmentDto['kind'],
): DocumentSummaryDto['publications'][number] | undefined {
  return document.publications
    .filter((publication) => publication.environment === environment)
    .sort((left, right) => timestampOf(right.publishedAt) - timestampOf(left.publishedAt))[0];
}

function publicationMatchesDraft(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  latestContentHash: string | undefined,
): boolean {
  return Boolean(publication && latestContentHash && publication.contentHash === latestContentHash);
}

function formatIssueCount(
  count: number,
  translate: DashboardViewModelLocalization['translate'],
): string {
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.publishIssues, { count });
}

function formatEnvironmentKind(
  environment: WorkspaceEnvironmentDto['kind'],
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (environment === 'development') return translate(DASHBOARD_COMMON_MESSAGES.development);
  if (environment === 'staging') return translate(DASHBOARD_COMMON_MESSAGES.staging);
  return translate(DASHBOARD_COMMON_MESSAGES.production);
}

function formatDocumentStatus(
  status: DocumentSummaryDto['status'],
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (status === 'draft') return translate(DASHBOARD_COMMON_MESSAGES.draft);
  if (status === 'review') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.statusReview);
  if (status === 'approved') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.statusApproved);
  if (status === 'live') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.statusLive);
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.archived);
}

function formatDocumentType(
  type: DocumentSummaryDto['type'],
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (type === 'tour') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.typeTour);
  if (type === 'announcement') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.typeAnnouncement);
  if (type === 'checklist') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.typeChecklist);
  if (type === 'survey') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.typeSurvey);
  if (type === 'hotspot') return translate(DASHBOARD_VIEW_MODEL_MESSAGES.typeHotspot);
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.typeKnowledge);
}

function formatEditorLabel(
  document: DocumentSummaryDto,
  translate: DashboardViewModelLocalization['translate'],
): string {
  if (document.updatedByUserId || document.createdByUserId) {
    return translate(DASHBOARD_VIEW_MODEL_MESSAGES.workspaceTeammate);
  }
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.teamUpdate);
}

function documentReadinessLabel(
  readiness: DashboardDocumentReadiness,
  translate: DashboardViewModelLocalization['translate'],
): string {
  const descriptorByReadiness = {
    blocked: DASHBOARD_VIEW_MODEL_MESSAGES.readinessBlocked,
    draft: DASHBOARD_VIEW_MODEL_MESSAGES.readinessDraft,
    previewable: DASHBOARD_VIEW_MODEL_MESSAGES.readinessPreviewable,
    archived: DASHBOARD_VIEW_MODEL_MESSAGES.archived,
  } as const;
  return translate(descriptorByReadiness[readiness]);
}

const DOCUMENT_LIFECYCLE_VARIANTS: Readonly<
  Record<DocumentSummaryDto['status'], DashboardStatusVariant>
> = {
  draft: 'warning',
  review: 'info',
  approved: 'success',
  live: 'success',
  archived: 'outline',
};

function documentReadinessState(document: DocumentSummaryDto): DashboardDocumentReadiness {
  if (document.status === 'archived') return 'archived';
  if (documentBlockingIssues(document).length) return 'blocked';
  return document.latestContentHash ? 'previewable' : 'draft';
}

function documentBlockingIssues(document: DocumentSummaryDto) {
  return document.publishReadinessIssues.filter(isPublishReadinessBlocker);
}

function documentLifecycleVariant(status: DocumentSummaryDto['status']): DashboardStatusVariant {
  return DOCUMENT_LIFECYCLE_VARIANTS[status];
}

function formatReadinessIssueSummary(
  document: DocumentSummaryDto,
  translate: DashboardViewModelLocalization['translate'],
): string {
  const firstIssue = document.publishReadinessIssues[0];
  if (!firstIssue) return translate(DASHBOARD_VIEW_MODEL_MESSAGES.noPublishBlockers);
  const firstIssueMessage = translate(dashboardPublishIssueCopy(firstIssue.code).message);
  const remaining = document.publishReadinessIssues.length - 1;
  if (remaining === 0) return firstIssueMessage;
  return translate(DASHBOARD_VIEW_MODEL_MESSAGES.moreIssues, {
    message: firstIssueMessage,
    count: remaining,
  });
}

function buildDraftInfo(
  document: DocumentSummaryDto,
  translate: DashboardViewModelLocalization['translate'],
): {
  contentHashLabel: string;
  contentHashDetail: string;
} {
  if (document.latestContentHash) {
    return {
      contentHashLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.draftSaved),
      contentHashDetail: document.publications.length
        ? translate(DASHBOARD_VIEW_MODEL_MESSAGES.changesTracked)
        : translate(DASHBOARD_VIEW_MODEL_MESSAGES.readyFirstPublish),
    };
  }

  return {
    contentHashLabel: translate(DASHBOARD_VIEW_MODEL_MESSAGES.needsPreview),
    contentHashDetail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.previewToPreparePublishing),
  };
}

function buildPublicationInfo(
  document: DocumentSummaryDto,
  environmentById: Map<string, WorkspaceEnvironmentDto>,
  localization: DashboardViewModelLocalization,
): { label: string; detail: string; variant: PublicationVariant } {
  const { translate } = localization;
  if (!document.publications.length) {
    return {
      label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.unpublished),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.noPublicationRecord),
      variant: 'outline',
    };
  }

  const siteList = document.publications
    .map(
      (publication) =>
        environmentById.get(publication.environmentId)?.name ?? publication.environment,
    )
    .join(', ');
  const latestContentHash = document.latestContentHash;
  const hasDraftChanges = Boolean(
    latestContentHash &&
    document.publications.some((publication) => publication.contentHash !== latestContentHash),
  );

  if (hasDraftChanges) {
    return {
      label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.newerDraft),
      detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.recordsUseEarlierHash, {
        sites: siteList,
      }),
      variant: 'warning',
    };
  }

  return {
    label: translate(DASHBOARD_VIEW_MODEL_MESSAGES.publicationRecorded),
    detail: translate(DASHBOARD_VIEW_MODEL_MESSAGES.currentDraftRecorded, { sites: siteList }),
    variant: 'outline',
  };
}
