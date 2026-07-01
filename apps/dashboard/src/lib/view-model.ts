import type {
  DashboardDataDto,
  DocumentSummaryDto,
  EnvironmentTokenDto,
  WorkspaceEnvironmentDto,
} from './api';

type PublicationVariant = 'success' | 'warning' | 'outline';

export interface DashboardViewModel {
  documentRows: Array<
    DocumentSummaryDto & {
      statusLabel: string;
      typeLabel: string;
      editorLabel: string;
      readinessDetail: string;
      updatedAtLabel: string;
      contentHashLabel: string;
      contentHashDetail: string;
      publicationLabel: string;
      publicationDetail: string;
      publicationVariant: PublicationVariant;
    }
  >;
  environmentOptions: Array<WorkspaceEnvironmentDto & { label: string; originLabel: string }>;
  sdkInstallEnvironmentOptions: Array<
    WorkspaceEnvironmentDto & { label: string; originLabel: string }
  >;
  tokenRows: Array<EnvironmentTokenDto & { stateLabel: string }>;
  defaultEnvironmentId: string;
  defaultSdkEnvironmentId: string;
  hasDocuments: boolean;
  hasTokens: boolean;
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
  const sdkInstallEnvironmentOptions = environmentOptions.filter(
    (environment) => environment.kind === 'staging',
  );
  const firstSdkEnvironment = sdkInstallEnvironmentOptions[0];
  const environmentById = new Map(
    environmentOptions.map((environment) => [environment.id, environment]),
  );

  return {
    documentRows: data.documents.map((document) => {
      const publication = buildPublicationInfo(document, environmentById);
      return {
        ...document,
        statusLabel: formatStatus(document.status),
        typeLabel: formatStatus(document.type),
        editorLabel: formatEditorLabel(document),
        readinessDetail: formatReadinessDetail(document.status),
        updatedAtLabel: formatDate(document.updatedAt),
        ...buildDraftInfo(document),
        publicationLabel: publication.label,
        publicationDetail: publication.detail,
        publicationVariant: publication.variant,
      };
    }),
    environmentOptions,
    sdkInstallEnvironmentOptions,
    tokenRows: data.tokens.map((token) => ({
      ...token,
      stateLabel: token.revokedAt ? 'Revoked' : 'Active',
    })),
    defaultEnvironmentId: staging?.id ?? firstEnvironment?.id ?? '',
    defaultSdkEnvironmentId: firstSdkEnvironment?.id ?? '',
    hasDocuments: data.documents.length > 0,
    hasTokens: data.tokens.length > 0,
  };
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

function formatReadinessDetail(status: string): string {
  if (status === 'ready') return 'Ready to preview';
  if (status === 'invalid') return 'Needs fixes before publishing';
  if (status === 'draft') return 'Draft in progress';
  return 'In progress';
}

function buildDraftInfo(
  document: DocumentSummaryDto,
): { contentHashLabel: string; contentHashDetail: string } {
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
      detail: 'Not live on any site yet',
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
      label: 'Changes waiting',
      detail: `Saved changes not live on ${siteList}`,
      variant: 'warning',
    };
  }

  return {
    label: 'Published',
    detail: `Live on ${siteList}`,
    variant: 'success',
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
