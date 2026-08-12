'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DashboardWorkspaceData } from '@lodariq/schema';
import {
  updateEnvironmentReleasePolicyAction,
  updateWorkspaceEnvironmentPolicyAction,
} from '../app/actions';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useEnvironmentPolicyMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateWorkspaceEnvironmentPolicyAction,
    onSuccess: (result) => {
      if (result.status !== 'success') return;
      updateEnvironmentCache(queryClient, workspaceId, result.environment);
    },
  });
}

export function useEnvironmentApprovalMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateEnvironmentReleasePolicyAction,
    onSuccess: (result) => {
      if (result.status !== 'success') return;
      updateEnvironmentCache(queryClient, workspaceId, result.environment);
    },
  });
}

function updateEnvironmentCache(
  queryClient: ReturnType<typeof useQueryClient>,
  workspaceId: string,
  environment: DashboardWorkspaceData['environments'][number],
): void {
  queryClient.setQueryData<DashboardWorkspaceData>(
    dashboardQueryKeys.workspace(workspaceId),
    (current) =>
      current
        ? {
            ...current,
            environments: current.environments.map((candidate) =>
              candidate.id === environment.id ? environment : candidate,
            ),
          }
        : current,
  );
}
