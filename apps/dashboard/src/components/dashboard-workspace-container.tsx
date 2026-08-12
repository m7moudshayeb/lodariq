'use client';

import type { DashboardWorkspaceData } from '@lodariq/schema';
import { useDashboardWorkspace } from '../hooks/use-dashboard-workspace';
import { buildDashboardViewModel } from '../lib/view-model';
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
  const query = useDashboardWorkspace(workspaceId, initialData);
  const data = query.data ?? initialData ?? emptyWorkspaceData(workspaceId);
  const queryError = query.error instanceof Error ? query.error.message : undefined;
  const partialDataError = data.unavailableResources.length
    ? 'Some workspace data is temporarily unavailable. Available sections remain usable.'
    : undefined;
  const visibleError =
    queryError ?? (query.data ? partialDataError : (apiError ?? partialDataError));
  return (
    <DashboardWorkspace
      apiError={visibleError}
      authControls={authControls}
      compactAuthControls={compactAuthControls}
      viewModel={buildDashboardViewModel(data)}
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
