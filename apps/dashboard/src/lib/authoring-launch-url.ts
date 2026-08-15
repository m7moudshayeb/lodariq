import { type SupportedLocale } from '@lodariq/i18n';
import type { AuthoringWorkspaceView } from '@lodariq/schema';
import {
  AUTHORING_DOCUMENT_QUERY_PARAMETER,
  AUTHORING_FOCUS_BLOCK_QUERY_PARAMETER,
  AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER,
  AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE,
  AUTHORING_LOCALE_QUERY_PARAMETER,
  AUTHORING_WORKSPACE_QUERY_PARAMETER,
  AUTHORING_WORKSPACE_QUERY_VALUES,
} from '@lodariq/schema/authoring-entry-runtime';

export interface ExistingDocumentAuthoringIntent {
  documentId: string;
  focusBlockId?: string;
  workspace?: AuthoringWorkspaceView;
}

export function buildAuthoringLaunchUrl(
  exactOrigin: string,
  locale: SupportedLocale,
  intent?: ExistingDocumentAuthoringIntent,
): string {
  const url = new URL(exactOrigin);
  url.searchParams.set(
    AUTHORING_LAUNCHER_ENTRY_QUERY_PARAMETER,
    AUTHORING_LAUNCHER_ENTRY_QUERY_VALUE,
  );
  url.searchParams.set(AUTHORING_LOCALE_QUERY_PARAMETER, locale);
  if (!intent) return url.toString();

  url.searchParams.set(AUTHORING_DOCUMENT_QUERY_PARAMETER, intent.documentId);
  if (intent.workspace) {
    url.searchParams.set(
      AUTHORING_WORKSPACE_QUERY_PARAMETER,
      AUTHORING_WORKSPACE_QUERY_VALUES[intent.workspace],
    );
  }
  if (intent.focusBlockId) {
    url.searchParams.set(AUTHORING_FOCUS_BLOCK_QUERY_PARAMETER, intent.focusBlockId);
  }
  return url.toString();
}
