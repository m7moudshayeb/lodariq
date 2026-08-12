'use client';

import { useQuery } from '@tanstack/react-query';
import type { DashboardWorkspaceData } from '@lodariq/schema';
import { loadDashboardWorkspace } from '../lib/client-dashboard-api';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useDashboardWorkspace(workspaceId: string, initialData?: DashboardWorkspaceData) {
  return useQuery({
    queryKey: dashboardQueryKeys.workspace(workspaceId),
    queryFn: ({ signal }) => loadDashboardWorkspace(workspaceId, signal),
    initialData,
    initialDataUpdatedAt: initialData?.unavailableResources.length ? 0 : undefined,
    staleTime: 30_000,
  });
}
