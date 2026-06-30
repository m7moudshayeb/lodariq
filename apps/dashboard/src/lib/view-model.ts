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
      ownerLabel: string;
      updatedAtLabel: string;
      contentHashLabel: string;
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
        ownerLabel: document.updatedByUserId ?? document.createdByUserId ?? 'Unknown',
        updatedAtLabel: formatDate(document.updatedAt),
        contentHashLabel: document.latestContentHash ?? 'Not compiled',
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

function buildPublicationInfo(
  document: DocumentSummaryDto,
  environmentById: Map<string, WorkspaceEnvironmentDto>,
): { label: string; detail: string; variant: PublicationVariant } {
  if (!document.publications.length) {
    return {
      label: 'Unpublished',
      detail: 'No environment',
      variant: 'outline',
    };
  }

  const detail = document.publications
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
      label: 'Draft changes',
      detail,
      variant: 'warning',
    };
  }

  return {
    label: 'Published',
    detail,
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
