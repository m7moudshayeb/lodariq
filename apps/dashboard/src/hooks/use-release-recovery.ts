'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReleaseRecoveryRequest } from '@lodariq/schema';
import { recoverDocumentReleaseAction } from '../app/release-recovery-actions';
import { loadDashboardReleaseRecovery } from '../lib/client-dashboard-api';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useReleaseRecovery(workspaceId: string, documentId: string, environmentId: string) {
  const queryClient = useQueryClient();
  const queryKey = dashboardQueryKeys.releaseRecovery(workspaceId, documentId, environmentId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      loadDashboardReleaseRecovery(workspaceId, documentId, environmentId, signal),
    enabled: Boolean(workspaceId) && Boolean(documentId) && Boolean(environmentId),
    staleTime: 15_000,
  });
  const mutation = useMutation({
    mutationFn: (input: { environmentId: string; request: ReleaseRecoveryRequest }) =>
      recoverDocumentReleaseAction({ documentId, ...input }),
    onSettled: async (_result, _error, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: dashboardQueryKeys.releaseRecovery(
            workspaceId,
            documentId,
            input.environmentId,
          ),
        }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.workspace(workspaceId) }),
      ]);
    },
  });
  return { query, mutation };
}
