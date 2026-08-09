import type {
  DashboardDataDto,
  DocumentSummaryDto,
  EnvironmentTokenDto,
  PublicSdkInstallationDto,
  WorkspaceThemeDto,
  WorkspaceEnvironmentDto,
} from './api';
import { RELEASE_STAGE_LABELS } from './dashboard-constants';

type PublicationVariant = 'success' | 'warning' | 'outline';
export type DashboardStatusVariant = PublicationVariant | 'info' | 'destructive';
export type ReleaseStageTone = 'complete' | 'current' | 'pending' | 'attention';

export interface DashboardReleaseStage {
  id: keyof typeof RELEASE_STAGE_LABELS;
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
  id: 'draft' | 'staging' | 'production' | 'artifact';
  label: string;
  value: string;
  detail: string;
  tone: DashboardStatusVariant;
}

export interface DashboardBrandSourceSummary {
  sourceLabel: string;
  sourceDetail: string;
  statusLabel: string;
  statusVariant: DashboardStatusVariant;
  revisionLabel: string;
  checkedAtLabel: string;
  confidenceLabel: string | null;
  semanticRoles: string[];
}

export interface DashboardAuthoringSite {
  id: string;
  environmentId: string;
  environment: Exclude<WorkspaceEnvironmentDto['kind'], 'production'>;
  environmentLabel: string;
  exactOrigin: string;
  label: string;
}

export interface DashboardViewModel {
  documentRows: Array<
    DocumentSummaryDto & {
      statusLabel: string;
      typeLabel: string;
      editorLabel: string;
      readinessDetail: string;
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

export function buildDashboardViewModel(data: DashboardDataDto): DashboardViewModel {
  const environmentOptions = data.environments.map((environment) => ({
    ...environment,
    label: `${environment.name} (${environment.kind})`,
    originLabel: environment.originAllowlist.length
      ? environment.originAllowlist.join(', ')
      : 'No origins',
  }));
  const staging = environmentOptions.find((environment) => environment.kind === 'staging');
  const firstEnvironment = environmentOptions[0];
  const sdkInstallEnvironmentOptions = environmentOptions;
  const defaultSdkEnvironment = staging ?? sdkInstallEnvironmentOptions[0];
  const environmentById = new Map(
    environmentOptions.map((environment) => [environment.id, environment]),
  );
  const authoringSiteOptions = buildAuthoringSiteOptions(data.installations, environmentById);
  const brandThemes = [...data.themes].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  const role = data.controlPlaneContext?.role;

  const documentRows = data.documents.map((document) => {
    const publication = buildPublicationInfo(document, environmentById);
    const releaseQueue = buildReleaseQueueInfo(document);
    return {
      ...document,
      statusLabel: formatStatus(document.status),
      typeLabel: formatStatus(document.type),
      editorLabel: formatEditorLabel(document),
      readinessDetail: formatReadinessDetail(document),
      readinessIssueCount: document.publishReadinessIssues.length,
      readinessIssueSummary: formatReadinessIssueSummary(document),
      updatedAtLabel: formatDate(document.updatedAt),
      ...buildDraftInfo(document),
      publicationLabel: publication.label,
      publicationDetail: publication.detail,
      publicationVariant: publication.variant,
      ...releaseQueue,
    };
  });

  return {
    documentRows,
    environmentOptions,
    sdkInstallEnvironmentOptions,
    tokenRows: data.tokens.map((token) => ({
      ...token,
      stateLabel: token.revokedAt ? 'Revoked' : 'Active',
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
    openInProductUrl: authoringSiteOptions[0]?.exactOrigin ?? '',
    brandSourceSummary: buildBrandSourceSummary(brandThemes),
    recentActivity: buildRecentActivity(documentRows, brandThemes),
  };
}

function buildAuthoringSiteOptions(
  installations: readonly PublicSdkInstallationDto[],
  environmentById: ReadonlyMap<string, DashboardViewModel['environmentOptions'][number]>,
): DashboardAuthoringSite[] {
  const sitesByOrigin = new Map<string, DashboardAuthoringSite>();

  for (const installation of installations) {
    if (installation.revokedAt) continue;
    for (const mapping of installation.origins) {
      if (!mapping.authoringEnabled) continue;
      const environment = environmentById.get(mapping.environmentId);
      if (!environment || environment.kind === 'production') continue;
      const exactOrigin = readHttpOrigin(mapping.exactOrigin);
      if (!exactOrigin || !environmentAllowsOrigin(environment, exactOrigin)) continue;
      sitesByOrigin.set(exactOrigin, {
        id: `${environment.id}:${exactOrigin}`,
        environmentId: environment.id,
        environment: environment.kind,
        environmentLabel: environment.name,
        exactOrigin,
        label: `${environment.name} · ${exactOrigin}`,
      });
    }
  }

  return [...sitesByOrigin.values()].sort((left, right) => {
    const priority =
      environmentOpenPriority(left.environment) - environmentOpenPriority(right.environment);
    return priority || left.label.localeCompare(right.label);
  });
}

function environmentAllowsOrigin(
  environment: WorkspaceEnvironmentDto,
  exactOrigin: string,
): boolean {
  return environment.originAllowlist.some((value) => readHttpOrigin(value) === exactOrigin);
}

function buildReleaseQueueInfo(document: DocumentSummaryDto): {
  pageScopeLabel: string;
  lastActivityLabel: string;
  queueStatusLabel: string;
  queueStatusVariant: DashboardStatusVariant;
  releaseActionLabel: string;
  releaseEvidence: DashboardReleaseEvidence[];
  releaseSummary: string;
  releaseStages: DashboardReleaseStage[];
} {
  const stagingPublication = latestPublicationForEnvironment(document, 'staging');
  const productionPublication = latestPublicationForEnvironment(document, 'production');
  const latestContentHash = document.latestContentHash;
  const hasBlockers = document.publishReadinessIssues.length > 0;
  const stagingIsCurrent = publicationMatchesDraft(stagingPublication, latestContentHash);
  const productionIsCurrent = publicationMatchesDraft(productionPublication, latestContentHash);
  const stagingVerification = publicationVerification(stagingPublication);
  const productionActive = publicationIsActive(productionPublication);
  const productionIsExactPromotion = publicationsShareArtifact(
    stagingPublication,
    productionPublication,
  );
  const releaseEvidence = buildReleaseEvidence(document, stagingPublication, productionPublication);
  const releaseStages: DashboardReleaseStage[] = [
    buildDraftStage(document),
    buildEnvironmentStage('staging', stagingPublication, latestContentHash),
    buildEnvironmentStage('production', productionPublication, latestContentHash),
  ];

  if (hasBlockers) {
    return {
      pageScopeLabel: 'Not specified',
      lastActivityLabel: formatDateTime(document.updatedAt),
      queueStatusLabel: 'Needs review',
      queueStatusVariant: 'warning',
      releaseActionLabel: 'Review blockers',
      releaseEvidence,
      releaseSummary: `${formatIssueCount(document.publishReadinessIssues.length)} must be reviewed before this draft can be published.`,
      releaseStages,
    };
  }

  if (!latestContentHash) {
    return {
      pageScopeLabel: 'Not specified',
      lastActivityLabel: formatDateTime(document.updatedAt),
      queueStatusLabel: 'Draft not prepared',
      queueStatusVariant: 'outline',
      releaseActionLabel: 'Prepare draft',
      releaseEvidence,
      releaseSummary: 'Preview this experience once to prepare a publishable draft.',
      releaseStages,
    };
  }

  if (productionIsCurrent) {
    return {
      pageScopeLabel: 'Not specified',
      lastActivityLabel: formatDateTime(document.updatedAt),
      queueStatusLabel: productionActive ? 'Production live' : 'Production published',
      queueStatusVariant: productionActive ? 'success' : 'info',
      releaseActionLabel: 'Review release',
      releaseEvidence,
      releaseSummary: productionCurrentSummary(productionActive, productionIsExactPromotion),
      releaseStages,
    };
  }

  if (productionPublication) {
    return {
      pageScopeLabel: 'Not specified',
      lastActivityLabel: formatDateTime(document.updatedAt),
      queueStatusLabel: 'Production update',
      queueStatusVariant: 'warning',
      releaseActionLabel: 'Review production update',
      releaseEvidence,
      releaseSummary:
        'The latest production publication record uses an earlier content hash than the saved draft.',
      releaseStages,
    };
  }

  if (stagingIsCurrent) {
    return {
      pageScopeLabel: 'Not specified',
      lastActivityLabel: formatDateTime(document.updatedAt),
      queueStatusLabel: stagingVerification === 'passed' ? 'Staging verified' : 'Staging published',
      queueStatusVariant: stagingVerification === 'passed' ? 'success' : 'info',
      releaseActionLabel:
        stagingVerification === 'passed' ? 'Review promotion' : 'Review verification',
      releaseEvidence,
      releaseSummary:
        stagingVerification === 'passed'
          ? 'The exact staged artifact is verified and ready for deliberate production promotion.'
          : 'The staged artifact matches the draft; exact browser verification is still required.',
      releaseStages,
    };
  }

  if (stagingPublication) {
    return {
      pageScopeLabel: 'Not specified',
      lastActivityLabel: formatDateTime(document.updatedAt),
      queueStatusLabel: 'Staging update',
      queueStatusVariant: 'warning',
      releaseActionLabel: 'Publish current draft',
      releaseEvidence,
      releaseSummary:
        'The latest staging publication record uses an earlier content hash than the saved draft.',
      releaseStages,
    };
  }

  return {
    pageScopeLabel: 'Not specified',
    lastActivityLabel: formatDateTime(document.updatedAt),
    queueStatusLabel: 'Ready for staging',
    queueStatusVariant: 'info',
    releaseActionLabel: 'Publish to staging',
    releaseEvidence,
    releaseSummary: 'The saved draft has no staging publication record yet.',
    releaseStages,
  };
}

function buildDraftStage(document: DocumentSummaryDto): DashboardReleaseStage {
  const issue = document.publishReadinessIssues[0];
  if (issue) {
    return {
      id: 'draft',
      label: RELEASE_STAGE_LABELS.draft,
      statusLabel: 'Needs review',
      detail: issue.label,
      tone: 'attention',
    };
  }
  if (document.latestContentHash) {
    return {
      id: 'draft',
      label: RELEASE_STAGE_LABELS.draft,
      statusLabel: 'Draft saved',
      detail: 'Current saved content',
      tone: 'current',
    };
  }
  return {
    id: 'draft',
    label: RELEASE_STAGE_LABELS.draft,
    statusLabel: 'Needs preview',
    detail: 'No compiled draft yet',
    tone: 'pending',
  };
}

function buildEnvironmentStage(
  environment: 'staging' | 'production',
  publication: DocumentSummaryDto['publications'][number] | undefined,
  latestContentHash: string | undefined,
): DashboardReleaseStage {
  const label = RELEASE_STAGE_LABELS[environment];
  if (!publication) {
    return {
      id: environment,
      label,
      statusLabel: 'No record',
      detail: `No ${environment} publication record`,
      tone: 'pending',
    };
  }

  if (!publicationMatchesDraft(publication, latestContentHash)) {
    return {
      id: environment,
      label,
      statusLabel: 'Newer draft',
      detail: `Latest record ${formatDateTime(publication.publishedAt)}`,
      tone: 'attention',
    };
  }

  const verification = publicationVerification(publication);
  if (environment === 'staging' && verification === 'passed') {
    return {
      id: environment,
      label,
      statusLabel: 'Verified',
      detail: `Verified exact artifact ${formatDateTime(publication.publishedAt)}`,
      tone: 'complete',
    };
  }
  if (environment === 'production' && publicationIsActive(publication)) {
    return {
      id: environment,
      label,
      statusLabel: 'Live',
      detail: `Active publication ${formatDateTime(publication.publishedAt)}`,
      tone: 'complete',
    };
  }

  return {
    id: environment,
    label,
    statusLabel: 'Published',
    detail:
      environment === 'staging'
        ? `Published ${formatDateTime(publication.publishedAt)} · verification pending`
        : `Published ${formatDateTime(publication.publishedAt)} · active delivery unconfirmed`,
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

function productionCurrentSummary(active: boolean, exactPromotion: boolean): string {
  if (active && exactPromotion) {
    return 'Production points to the exact artifact promoted from staging.';
  }
  if (active) {
    return 'Production is active, but exact staging-artifact provenance is not available yet.';
  }
  return 'A production publication matches the draft; active-delivery evidence is not available yet.';
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
): DashboardReleaseEvidence[] {
  const stagingVerification = publicationVerification(staging);
  const stagingVerifiedAt = publicationVerifiedAt(staging);
  const artifactPublication = staging ?? production;
  const artifactId = publicationArtifactId(artifactPublication);
  const stagingEvidence = describeStagingEvidence(staging, stagingVerification, stagingVerifiedAt);
  const productionEvidence = describeProductionEvidence(production, staging);
  const artifactEvidence = describeArtifactEvidence(artifactPublication, artifactId);
  return [
    {
      id: 'draft',
      label: 'Current draft',
      value: document.latestContentHash ? shortHash(document.latestContentHash) : 'Not prepared',
      detail: draftEvidenceDetail(document),
      tone: document.publishReadinessIssues.length ? 'warning' : 'outline',
    },
    {
      id: 'staging',
      label: 'Staging evidence',
      ...stagingEvidence,
    },
    {
      id: 'production',
      label: 'Production evidence',
      ...productionEvidence,
    },
    {
      id: 'artifact',
      label: 'Artifact identity',
      ...artifactEvidence,
    },
  ];
}

function draftEvidenceDetail(document: DocumentSummaryDto): string {
  if (!document.latestContentHash) return 'Preview once to prepare a publishable artifact';
  const count = document.publishReadinessIssues.length;
  if (count === 0) return 'No blocking checks';
  const noun = count === 1 ? 'check' : 'checks';
  return `${count} blocking ${noun}`;
}

function describeStagingEvidence(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  verification: PublicationWithEvidence['verificationStatus'] | undefined,
  verifiedAt: string | undefined,
): Pick<DashboardReleaseEvidence, 'value' | 'detail' | 'tone'> {
  if (!publication) {
    return {
      value: 'Not published',
      detail: 'No staging publication record',
      tone: 'outline',
    };
  }
  if (verification === 'passed') {
    return {
      value: 'Verified',
      detail: `Exact artifact verified ${formatDateTime(verifiedAt ?? publication.publishedAt)}`,
      tone: 'success',
    };
  }
  return {
    value: 'Published',
    detail: `Published ${formatDateTime(publication.publishedAt)} · browser verification not recorded`,
    tone: 'info',
  };
}

function describeProductionEvidence(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  staging: DocumentSummaryDto['publications'][number] | undefined,
): Pick<DashboardReleaseEvidence, 'value' | 'detail' | 'tone'> {
  if (!publication) {
    return {
      value: 'Not published',
      detail: 'No production publication record',
      tone: 'outline',
    };
  }
  if (publicationIsActive(publication)) {
    return {
      value: 'Live',
      detail: publicationsShareArtifact(staging, publication)
        ? `Exact staged artifact active since ${formatDateTime(publication.publishedAt)}`
        : `Active since ${formatDateTime(publication.publishedAt)} · exact staging provenance unavailable`,
      tone: 'success',
    };
  }
  return {
    value: 'Published',
    detail: `Published ${formatDateTime(publication.publishedAt)} · active pointer not exposed`,
    tone: 'info',
  };
}

function describeArtifactEvidence(
  publication: DocumentSummaryDto['publications'][number] | undefined,
  artifactId: string | undefined,
): Pick<DashboardReleaseEvidence, 'value' | 'detail' | 'tone'> {
  if (artifactId) {
    return {
      value: shortArtifactId(artifactId),
      detail: 'Immutable compiled artifact',
      tone: 'outline',
    };
  }
  if (publication) {
    return {
      value: shortHash(publication.contentHash),
      detail: 'Content hash is the strongest artifact evidence available',
      tone: 'outline',
    };
  }
  return {
    value: 'Not available',
    detail: 'Created during server-side publication',
    tone: 'warning',
  };
}

function buildBrandSourceSummary(themes: WorkspaceThemeDto[]): DashboardBrandSourceSummary {
  const theme = themes.find((item) => item.isDefault) ?? themes[0];
  if (!theme) {
    return {
      sourceLabel: 'Lodariq accessible fallback',
      sourceDetail: 'Safe semantic defaults are active until a workspace Brand theme is approved.',
      statusLabel: 'Safe fallback',
      statusVariant: 'outline',
      revisionLabel: 'No approved version',
      checkedAtLabel: 'Product match has not been recorded',
      confidenceLabel: null,
      semanticRoles: ['Accent', 'Surface', 'Text', 'Typography', 'Radius'],
    };
  }
  const styleSource = theme.latestStyleSource;
  if (styleSource) {
    return {
      sourceLabel: productStyleSourceLabel(styleSource.kind),
      sourceDetail: productStyleSourceDetail(styleSource.kind, theme.name),
      statusLabel: theme.activeVersion ? 'Approved source' : 'Needs approval',
      statusVariant: theme.activeVersion ? 'success' : 'warning',
      revisionLabel: styleSource.revision
        ? `Source revision ${styleSource.revision}`
        : `Theme revision ${theme.revision}`,
      checkedAtLabel: `Checked ${formatDateTime(styleSource.capturedAt)}`,
      confidenceLabel: productStyleConfidenceLabel(styleSource.confidence),
      semanticRoles: ['Accent', 'Surface', 'Text', 'Typography', 'Radius'],
    };
  }
  if (!theme.activeVersion) {
    return {
      sourceLabel: `${theme.name} workspace draft`,
      sourceDetail: 'Semantic tokens are saved as a draft and cannot change live releases.',
      statusLabel: 'Needs approval',
      statusVariant: 'warning',
      revisionLabel: `Draft revision ${theme.revision}`,
      checkedAtLabel: `Updated ${formatDateTime(theme.updatedAt)}`,
      confidenceLabel: null,
      semanticRoles: ['Accent', 'Surface', 'Text', 'Typography', 'Radius'],
    };
  }
  return {
    sourceLabel: 'Workspace-approved semantic tokens',
    sourceDetail: `${theme.name} is compiled into releases as an immutable Brand snapshot.`,
    statusLabel: 'Approved source',
    statusVariant: 'success',
    revisionLabel: `Version ${theme.activeVersion.version}`,
    checkedAtLabel: `Approved ${formatDateTime(theme.activeVersion.approvedAt)}`,
    confidenceLabel: null,
    semanticRoles: ['Accent', 'Surface', 'Text', 'Typography', 'Radius'],
  };
}

type DashboardProductStyleSourceKind = NonNullable<WorkspaceThemeDto['latestStyleSource']>['kind'];

function productStyleSourceLabel(kind: DashboardProductStyleSourceKind): string {
  if (kind === 'registered_tokens') return 'Registered design tokens';
  if (kind === 'selected_element') return 'Selected product element';
  if (kind === 'nearby_control') return 'Nearby product controls';
  if (kind === 'page_typography') return 'Product typography';
  if (kind === 'ancestor_context') return 'Product surface context';
  return 'Accessible fallback';
}

function productStyleSourceDetail(
  kind: DashboardProductStyleSourceKind,
  themeName: string,
): string {
  if (kind === 'registered_tokens') {
    return `${themeName} is grounded in explicitly registered semantic customer tokens.`;
  }
  if (kind === 'selected_element') {
    return `${themeName} was proposed from one representative product element and reviewed semantically.`;
  }
  return `${themeName} uses privacy-safe product style evidence and stores no raw CSS or DOM snapshot.`;
}

function productStyleConfidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'High-confidence evidence';
  if (confidence >= 60) return 'Review recommended';
  return 'Low-confidence evidence';
}

function buildRecentActivity(
  documents: DashboardViewModel['documentRows'],
  themes: WorkspaceThemeDto[],
): DashboardRecentActivity[] {
  const activities: Array<DashboardRecentActivity & { occurredAt: string }> = [];
  for (const document of documents) {
    activities.push({
      id: `document-update:${document.id}:${document.updatedAt}`,
      documentId: document.id,
      title: `${document.title} was last updated`,
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
        title: `${document.title} was published to ${formatStatus(publication.environment)}`,
        typeLabel:
          publicationVerification(publication) === 'passed' && publication.environment === 'staging'
            ? 'Exact artifact verified'
            : 'Immutable publication',
        detail: formatDateTime(publication.publishedAt),
        kind,
        occurredAt: publication.publishedAt,
      });
    }
  }
  for (const theme of themes) {
    if (!theme.activeVersion) continue;
    activities.push({
      id: `brand-approval:${theme.id}:${theme.activeVersion.id}`,
      title: `${theme.name} Brand version ${theme.activeVersion.version} was approved`,
      typeLabel: 'Immutable Brand snapshot',
      detail: formatDateTime(theme.activeVersion.approvedAt),
      kind: 'brand',
      occurredAt: theme.activeVersion.approvedAt,
    });
  }
  return activities
    .sort((left, right) => timestampOf(right.occurredAt) - timestampOf(left.occurredAt))
    .slice(0, 6)
    .map(({ occurredAt: _occurredAt, ...activity }) => activity);
}

function shortHash(value: string | undefined): string {
  if (!value) return 'Not available';
  return value.length <= 14 ? value : `…${value.slice(-10)}`;
}

function shortArtifactId(value: string): string {
  return value.length <= 18 ? value : `Artifact …${value.slice(-10)}`;
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

function formatIssueCount(count: number): string {
  return `${count} publish ${count === 1 ? 'issue' : 'issues'}`;
}

function environmentOpenPriority(kind: WorkspaceEnvironmentDto['kind']): number {
  if (kind === 'staging') return 0;
  if (kind === 'development') return 1;
  return 2;
}

function readHttpOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function formatStatus(status: string): string {
  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatEditorLabel(document: DocumentSummaryDto): string {
  if (document.updatedByUserId || document.createdByUserId) return 'Workspace teammate';
  return 'Team update';
}

function formatReadinessDetail(document: DocumentSummaryDto): string {
  if (document.publishReadinessIssues.length) {
    return document.publishReadinessIssues[0]?.label ?? 'Needs review';
  }
  if (document.status === 'ready') return 'Ready to preview';
  if (document.status === 'invalid') return 'Needs fixes before publishing';
  if (document.status === 'draft') return 'Draft in progress';
  return 'In progress';
}

function formatReadinessIssueSummary(document: DocumentSummaryDto): string {
  const firstIssue = document.publishReadinessIssues[0];
  if (!firstIssue) return 'No publish blockers';
  const remaining = document.publishReadinessIssues.length - 1;
  if (remaining === 0) return firstIssue.message;
  return `${firstIssue.message} +${remaining} more`;
}

function buildDraftInfo(document: DocumentSummaryDto): {
  contentHashLabel: string;
  contentHashDetail: string;
} {
  if (document.latestContentHash) {
    return {
      contentHashLabel: 'Draft saved',
      contentHashDetail: document.publications.length
        ? 'Changes are being tracked'
        : 'Ready for first publish',
    };
  }

  return {
    contentHashLabel: 'Needs preview',
    contentHashDetail: 'Preview once to prepare publishing',
  };
}

function buildPublicationInfo(
  document: DocumentSummaryDto,
  environmentById: Map<string, WorkspaceEnvironmentDto>,
): { label: string; detail: string; variant: PublicationVariant } {
  if (!document.publications.length) {
    return {
      label: 'Unpublished',
      detail: 'No environment publication record yet',
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
      label: 'Newer draft',
      detail: `Publication records for ${siteList} use an earlier content hash`,
      variant: 'warning',
    };
  }

  return {
    label: 'Publication recorded',
    detail: `Current draft recorded for ${siteList}`,
    variant: 'outline',
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function timestampOf(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
