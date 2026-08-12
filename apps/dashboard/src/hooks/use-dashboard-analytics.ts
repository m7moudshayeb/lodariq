'use client';

import { useQuery } from '@tanstack/react-query';
import { loadDashboardAnalytics } from '../lib/client-dashboard-api';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useDashboardAnalytics(
  workspaceId: string,
  environmentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: dashboardQueryKeys.analytics(workspaceId, environmentId),
    queryFn: ({ signal }) => loadDashboardAnalytics(workspaceId, environmentId, signal),
    enabled: enabled && Boolean(workspaceId) && Boolean(environmentId),
    staleTime: 30_000,
  });
}
