'use client';

import { useMutation } from '@tanstack/react-query';
import { loadDocumentDebugAction } from '../app/actions';
import { initialDocumentDebugActionState } from '../app/document-debug-action-state';
import { dashboardQueryKeys } from '../lib/dashboard-query-keys';

export function useDocumentDebug(workspaceId: string) {
  return useMutation({
    mutationKey: dashboardQueryKeys.documentDebug(workspaceId),
    mutationFn: async (documentId: string) => {
      const formData = new FormData();
      formData.set('documentId', documentId);
      return loadDocumentDebugAction(initialDocumentDebugActionState, formData);
    },
  });
}
