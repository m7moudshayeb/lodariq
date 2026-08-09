import { DashboardAuthRequired } from '../components/dashboard-auth-required';
import { DashboardShell } from '../components/dashboard-shell';
import { WorkspaceRequired } from '../components/workspace-required';
import {
  DashboardApiError,
  loadAuthSession,
  loadDashboardData,
  type DashboardDataDto,
} from '../lib/api';

export const dynamic = 'force-dynamic';

const emptyData: DashboardDataDto = {
  controlPlaneContext: null,
  documents: [],
  environments: [],
  tokens: [],
  installations: [],
  themes: [],
};

export default async function DashboardPage(): Promise<React.ReactElement> {
  let session;
  try {
    session = await loadAuthSession();
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 401) {
      return (
        <DashboardAuthRequired
          description="Your workspace and authoring tools stay protected by your Lodariq session."
          title="Sign in to Lodariq"
        />
      );
    }
    return (
      <DashboardAuthRequired
        actionLabel="Try again"
        description="Lodariq could not verify your session. The service may be temporarily unavailable."
        title="We could not open your workspace"
      />
    );
  }

  if (!session.activeWorkspaceId) return <WorkspaceRequired session={session} />;

  try {
    const data = await loadDashboardData();
    return <DashboardShell data={data} session={session} />;
  } catch (error) {
    const message =
      error instanceof DashboardApiError
        ? `API ${error.statusCode}: ${error.message}`
        : 'API unavailable.';
    return <DashboardShell apiError={message} data={emptyData} session={session} />;
  }
}
