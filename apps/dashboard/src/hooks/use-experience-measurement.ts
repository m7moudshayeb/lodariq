'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  UpdateExperienceMeasurementBody,
  UpdateExperimentBody,
  UpsertWorkspaceApplicationBody,
} from '@lodariq/schema';
import {
  loadExperienceMeasurement,
  loadWorkspaceApplications,
  saveExperienceSuccessEvent,
  saveExperimentChange,
  saveWorkspaceApplication,
} from '../lib/client-dashboard-api';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useExperienceMeasurement(
  workspaceId: string,
  documentId: string,
  environmentId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: dashboardQueryKeys.experience(workspaceId, documentId, environmentId),
    queryFn: ({ signal }) => loadExperienceMeasurement(documentId, environmentId, signal),
    enabled: enabled && Boolean(workspaceId) && Boolean(documentId) && Boolean(environmentId),
    staleTime: 30_000,
  });
}

/**
 * Declaring what success means changes every number below it, so the whole
 * snapshot is refetched rather than patched in place.
 */
export function useDeclareSuccessEvent(
  workspaceId: string,
  documentId: string,
  environmentId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (successEvent: UpdateExperienceMeasurementBody['successEvent']) =>
      saveExperienceSuccessEvent(documentId, successEvent),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: dashboardQueryKeys.experience(workspaceId, documentId, environmentId),
      }),
  });
}

export function useExperimentChange(
  workspaceId: string,
  documentId: string,
  environmentId: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { experimentId: string; change: UpdateExperimentBody }) =>
      saveExperimentChange(input.experimentId, input.change),
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: dashboardQueryKeys.experience(workspaceId, documentId, environmentId),
      }),
  });
}

export function useWorkspaceApplications(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: dashboardQueryKeys.applications(workspaceId),
    queryFn: ({ signal }) => loadWorkspaceApplications(signal),
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useSaveWorkspaceApplication(workspaceId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (application: UpsertWorkspaceApplicationBody) =>
      saveWorkspaceApplication(application),
    onSuccess: (applications) =>
      client.setQueryData(dashboardQueryKeys.applications(workspaceId), applications),
  });
}
