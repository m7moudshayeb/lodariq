import type { SupportedLocale } from '@lodariq/i18n';
import type { PublicSdkInstallationDto, WorkspaceEnvironmentDto } from './api';
import { buildAuthoringLaunchUrl } from './authoring-launch-url';

export interface DashboardAuthoringSite {
  id: string;
  environmentId: string;
  environment: Exclude<WorkspaceEnvironmentDto['kind'], 'production'>;
  environmentLabel: string;
  exactOrigin: string;
  label: string;
  launchUrl: string;
}

type DashboardEnvironment = WorkspaceEnvironmentDto & { label: string; originLabel: string };

export function buildAuthoringSiteOptions(
  installations: readonly PublicSdkInstallationDto[],
  environmentById: ReadonlyMap<string, DashboardEnvironment>,
  locale: SupportedLocale,
): DashboardAuthoringSite[] {
  const sitesByOrigin = new Map<string, DashboardAuthoringSite>();

  for (const installation of installations) {
    if (installation.revokedAt) continue;
    for (const mapping of installation.origins) {
      if (!mapping.authoringEnabled) continue;
      const environment = environmentById.get(mapping.environmentId);
      if (!availableForAuthoring(environment)) continue;
      const exactOrigin = readHttpOrigin(mapping.exactOrigin);
      if (!exactOrigin || !environmentAllowsOrigin(environment, exactOrigin)) continue;
      sitesByOrigin.set(exactOrigin, {
        id: `${environment.id}:${exactOrigin}`,
        environmentId: environment.id,
        environment: environment.kind,
        environmentLabel: environment.name,
        exactOrigin,
        label: `${environment.name} · ${exactOrigin}`,
        launchUrl: buildAuthoringLaunchUrl(exactOrigin, locale),
      });
    }
  }

  return [...sitesByOrigin.values()].sort((left, right) => {
    const priority =
      environmentOpenPriority(left.environment) - environmentOpenPriority(right.environment);
    return priority || left.label.localeCompare(right.label);
  });
}

function availableForAuthoring(
  environment: DashboardEnvironment | undefined,
): environment is DashboardEnvironment & { kind: 'development' | 'staging' } {
  return Boolean(
    environment &&
    environment.kind !== 'production' &&
    environment.enabled !== false &&
    environment.authoringEnabled !== false,
  );
}

function environmentAllowsOrigin(environment: DashboardEnvironment, exactOrigin: string): boolean {
  return environment.originAllowlist.some((value) => readHttpOrigin(value) === exactOrigin);
}

function environmentOpenPriority(kind: DashboardAuthoringSite['environment']): number {
  return kind === 'staging' ? 0 : 1;
}

function readHttpOrigin(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}
