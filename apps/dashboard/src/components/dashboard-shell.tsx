import type { DashboardDataDto } from '../lib/api';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { buildDashboardViewModel } from '../lib/view-model';
import { DashboardAuthControls } from './dashboard-auth-controls';
import { DashboardWorkspace } from './dashboard-workspace';

interface DashboardShellProps {
  data: DashboardDataDto;
  session: AuthSessionSnapshot;
  apiError?: string;
}

export function DashboardShell({
  data,
  session,
  apiError,
}: DashboardShellProps): React.ReactElement {
  const viewModel = buildDashboardViewModel(data);
  return (
    <DashboardWorkspace
      apiError={apiError}
      authControls={<DashboardAuthControls session={session} />}
      compactAuthControls={<DashboardAuthControls compact session={session} />}
      viewModel={viewModel}
    />
  );
}
