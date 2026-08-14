import type { AuthoringDocumentIntent } from '@lodariq/schema';
import type { LocalAuthoringInitialWorkspace } from '@lodariq/sdk-authoring/authoring-frame';

export function initialWorkspaceFromDocumentIntent(
  intent: AuthoringDocumentIntent | undefined,
): LocalAuthoringInitialWorkspace | undefined {
  if (intent?.kind !== 'existing' || !intent.workspace) return undefined;
  return {
    kind: intent.workspace,
    ...(intent.focusBlockId ? { focusBlockId: intent.focusBlockId } : {}),
  };
}
