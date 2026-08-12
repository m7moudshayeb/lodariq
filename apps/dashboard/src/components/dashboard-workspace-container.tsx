'use client';

import type { DashboardWorkspaceData } from '@lodariq/schema';
import { DEFAULT_LOCALE, isSupportedLocale } from '@lodariq/i18n';
import { useDashboardWorkspace } from '../hooks/use-dashboard-workspace';
import { buildDashboardViewModel } from '../lib/view-model';
import { DashboardClientApiError } from '../lib/client-dashboard-api';
import { dashboardErrorMessageDescriptor } from '../i18n/error-messages';
import { DASHBOARD_SERVER_MESSAGES } from '../i18n/messages';
import { useLingui } from '@lingui/react';
import { DashboardWorkspace } from './dashboard-workspace';

export function DashboardWorkspaceContainer({
  initialData,
  workspaceId,
  apiError,
  authControls,
  compactAuthControls,
}: {
  initialData?: DashboardWorkspaceData;
  workspaceId: string;
  apiError?: string;
  authControls?: React.ReactNode;
  compactAuthControls?: React.ReactNode;
}): React.ReactElement {
  const { _, i18n } = useLingui();
  const query = useDashboardWorkspace(workspaceId, initialData);
  const data = query.data ?? initialData ?? emptyWorkspaceData(workspaceId);
  const queryError =
    query.error instanceof DashboardClientApiError
      ? _(dashboardErrorMessageDescriptor(query.error.code, query.error.statusCode))
      : query.error
        ? _(DASHBOARD_SERVER_MESSAGES.unavailable)
        : undefined;
  const partialDataError = data.unavailableResources.length
    ? _(DASHBOARD_SERVER_MESSAGES.partialData)
    : undefined;
  const visibleError =
    queryError ?? (query.data ? partialDataError : (apiError ?? partialDataError));
  return (
    <DashboardWorkspace
      apiError={visibleError}
      authControls={authControls}
      compactAuthControls={compactAuthControls}
      viewModel={buildDashboardViewModel(data, {
        locale: isSupportedLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE,
        translate: (descriptor, values) => _(values ? { ...descriptor, values } : descriptor),
      })}
      workspaceId={workspaceId}
    />
  );
}

function emptyWorkspaceData(workspaceId: string): DashboardWorkspaceData {
  return {
    controlPlaneContext: { userId: 'unavailable', workspaceId, role: 'viewer' },
    documents: [],
    environments: [],
    tokens: [],
    installations: [],
    themes: [],
    unavailableResources: ['documents', 'environments', 'tokens', 'installations', 'themes'],
  };
}
