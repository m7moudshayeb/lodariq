import type { AuthoringDocumentIntent, AuthoringWorkspaceView } from '@lodariq/schema';
import {
  AUTHORING_DOCUMENT_QUERY_PARAMETER,
  AUTHORING_FOCUS_BLOCK_QUERY_PARAMETER,
  AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER,
  AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE,
  AUTHORING_WORKSPACE_QUERY_PARAMETER,
  AUTHORING_WORKSPACE_QUERY_VALUES,
} from '@lodariq/schema/authoring-entry-runtime';

export interface DashboardAuthoringEntryIntent {
  documentIntent?: AuthoringDocumentIntent;
  present: boolean;
}

const WORKSPACE_BY_QUERY_VALUE = new Map<string, AuthoringWorkspaceView>(
  Object.entries(AUTHORING_WORKSPACE_QUERY_VALUES).map(([workspace, queryValue]) => [
    queryValue,
    workspace as AuthoringWorkspaceView,
  ]),
);

/** Consume non-secret dashboard routing state exactly once from the customer page URL. */
export function consumeDashboardAuthoringEntryIntent(
  ownerWindow: Window,
): DashboardAuthoringEntryIntent {
  let url: URL;
  try {
    url = new URL(ownerWindow.location.href);
  } catch {
    return { present: false };
  }
  if (
    url.searchParams.get(AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER) !==
    AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE
  ) {
    return { present: false };
  }

  const documentId = url.searchParams.get(AUTHORING_DOCUMENT_QUERY_PARAMETER)?.trim();
  const workspaceValue = url.searchParams.get(AUTHORING_WORKSPACE_QUERY_PARAMETER);
  const workspace = workspaceValue ? WORKSPACE_BY_QUERY_VALUE.get(workspaceValue) : undefined;
  const focusBlockId = url.searchParams.get(AUTHORING_FOCUS_BLOCK_QUERY_PARAMETER)?.trim();
  const documentIntent = existingDocumentIntent(documentId, workspace, focusBlockId);

  url.searchParams.delete(AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER);
  url.searchParams.delete(AUTHORING_DOCUMENT_QUERY_PARAMETER);
  url.searchParams.delete(AUTHORING_WORKSPACE_QUERY_PARAMETER);
  url.searchParams.delete(AUTHORING_FOCUS_BLOCK_QUERY_PARAMETER);
  try {
    ownerWindow.history.replaceState(
      ownerWindow.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    /* The non-secret entry intent remains safe if the host blocks history replacement. */
  }
  return { present: true, ...(documentIntent ? { documentIntent } : {}) };
}

function existingDocumentIntent(
  documentId: string | undefined,
  workspace: AuthoringWorkspaceView | undefined,
  focusBlockId: string | undefined,
): AuthoringDocumentIntent | undefined {
  if (!documentId) return undefined;
  return {
    kind: 'existing',
    documentId,
    ...(workspace ? { workspace } : {}),
    ...(focusBlockId ? { focusBlockId } : {}),
  };
}
