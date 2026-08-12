'use client';

import { useActionState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DashboardWorkspaceData } from '@lodariq/schema';
import {
  createPublicSdkInstallationAction,
  revokePublicSdkInstallationAction,
  syncPublicSdkInstallationAction,
} from '../app/actions';
import {
  initialSdkInstallationActionState,
  type SdkInstallationActionState,
} from '../app/sdk-installation-action-state';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useSdkInstallationActions(workspaceId: string) {
  const queryClient = useQueryClient();
  const applyResult = useCallback(
    (result: SdkInstallationActionState): SdkInstallationActionState => {
      if (result.status !== 'success') return result;
      queryClient.setQueryData<DashboardWorkspaceData>(
        dashboardQueryKeys.workspace(workspaceId),
        (current) =>
          current
            ? {
                ...current,
                installations: upsertInstallation(current.installations, result.installation),
              }
            : current,
      );
      return result;
    },
    [queryClient, workspaceId],
  );
  const createReducer = useCallback(
    async (state: SdkInstallationActionState, formData: FormData) =>
      applyResult(await createPublicSdkInstallationAction(state, formData)),
    [applyResult],
  );
  const syncReducer = useCallback(
    async (state: SdkInstallationActionState, formData: FormData) =>
      applyResult(await syncPublicSdkInstallationAction(state, formData)),
    [applyResult],
  );
  const revokeReducer = useCallback(
    async (state: SdkInstallationActionState, formData: FormData) =>
      applyResult(await revokePublicSdkInstallationAction(state, formData)),
    [applyResult],
  );
  const [createState, createAction] = useActionState(
    createReducer,
    initialSdkInstallationActionState,
  );
  const [syncState, syncAction] = useActionState(syncReducer, initialSdkInstallationActionState);
  const [revokeState, revokeAction] = useActionState(
    revokeReducer,
    initialSdkInstallationActionState,
  );
  return { createState, createAction, syncState, syncAction, revokeState, revokeAction };
}

function upsertInstallation(
  installations: DashboardWorkspaceData['installations'],
  installation: DashboardWorkspaceData['installations'][number],
): DashboardWorkspaceData['installations'] {
  const byId = new Map(installations.map((candidate) => [candidate.installationId, candidate]));
  byId.set(installation.installationId, installation);
  return [...byId.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
