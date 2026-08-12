import type { DashboardWorkspaceData } from '@lodariq/schema';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { DashboardAuthControls } from './dashboard-auth-controls';
import { DashboardWorkspaceContainer } from './dashboard-workspace-container';

interface DashboardShellProps {
  data?: DashboardWorkspaceData;
  session: AuthSessionSnapshot;
  apiError?: string;
}

export function DashboardShell({
  data,
  session,
  apiError,
}: DashboardShellProps): React.ReactElement {
  const workspaceId = session.activeWorkspaceId;
  if (!workspaceId) throw new Error('DashboardShell requires an active workspace.');
  return (
    <DashboardWorkspaceContainer
      apiError={apiError}
      authControls={<DashboardAuthControls session={session} />}
      compactAuthControls={<DashboardAuthControls compact session={session} />}
      initialData={data}
      workspaceId={workspaceId}
    />
  );
}
