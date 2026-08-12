'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DashboardWorkspaceData, DashboardWorkspaceTheme } from '@lodariq/schema';
import {
  acknowledgeApprovedBrandThemeAction,
  approveBrandThemeAction,
  createAccessibleBrandThemeAction,
  loadBrandThemeImpactAction,
  makeDefaultBrandThemeAction,
  saveBrandThemeDraftAction,
} from '../app/actions';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useBrandSystemMutations(workspaceId: string) {
  const queryClient = useQueryClient();
  const updateTheme = (theme?: DashboardWorkspaceTheme): void => {
    if (!theme) return;
    queryClient.setQueryData<DashboardWorkspaceData>(
      dashboardQueryKeys.workspace(workspaceId),
      (current) =>
        current
          ? {
              ...current,
              themes: upsertTheme(current.themes, theme),
            }
          : current,
    );
  };
  const create = useMutation({
    mutationFn: createAccessibleBrandThemeAction,
    onSuccess: (result) => result.status === 'success' && updateTheme(result.theme),
  });
  const loadImpact = useMutation({ mutationFn: loadBrandThemeImpactAction });
  const saveDraft = useMutation({
    mutationFn: saveBrandThemeDraftAction,
    onSuccess: (result) => result.status === 'success' && updateTheme(result.theme),
  });
  const approve = useMutation({
    mutationFn: approveBrandThemeAction,
    onSuccess: (result) => result.status === 'success' && updateTheme(result.theme),
  });
  const makeDefault = useMutation({
    mutationFn: makeDefaultBrandThemeAction,
    onSuccess: (result) => result.status === 'success' && updateTheme(result.theme),
  });
  const acknowledge = useMutation({
    mutationFn: acknowledgeApprovedBrandThemeAction,
    onSuccess: (result) => result.status === 'success' && updateTheme(result.detail?.theme),
  });
  return {
    create,
    loadImpact,
    saveDraft,
    approve,
    makeDefault,
    acknowledge,
    isPending:
      create.isPending ||
      loadImpact.isPending ||
      saveDraft.isPending ||
      approve.isPending ||
      makeDefault.isPending ||
      acknowledge.isPending,
  };
}

function upsertTheme(
  themes: readonly DashboardWorkspaceTheme[],
  theme: DashboardWorkspaceTheme,
): DashboardWorkspaceTheme[] {
  const exists = themes.some((candidate) => candidate.id === theme.id);
  const next = exists
    ? themes.map((candidate) => {
        if (candidate.id === theme.id) return theme;
        return theme.isDefault ? { ...candidate, isDefault: false } : candidate;
      })
    : [...themes, theme];
  return [...next].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}
