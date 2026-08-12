import { DashboardAuthRequired } from '../components/dashboard-auth-required';
import { DashboardShell } from '../components/dashboard-shell';
import { WorkspaceRequired } from '../components/workspace-required';
import { DASHBOARD_ENTRY_MESSAGES } from '../i18n/messages';
import { getDashboardI18n } from '../i18n/server';
import { dashboardErrorMessageDescriptor } from '../i18n/error-messages';
import { DashboardApiError, loadAuthSession, loadDashboardData } from '../lib/api';

export const dynamic = 'force-dynamic';

export default async function DashboardPage(): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  let session;
  try {
    session = await loadAuthSession();
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 401) {
      return (
        <DashboardAuthRequired
          description={i18n._(DASHBOARD_ENTRY_MESSAGES.signInDescription)}
          title={i18n._(DASHBOARD_ENTRY_MESSAGES.signInTitle)}
        />
      );
    }
    return (
      <DashboardAuthRequired
        actionLabel={i18n._(DASHBOARD_ENTRY_MESSAGES.retryAction)}
        description={i18n._(DASHBOARD_ENTRY_MESSAGES.unavailableDescription)}
        title={i18n._(DASHBOARD_ENTRY_MESSAGES.unavailableTitle)}
      />
    );
  }

  if (!session.activeWorkspaceId) return <WorkspaceRequired session={session} />;

  try {
    const data = await loadDashboardData(session.activeWorkspaceId);
    return <DashboardShell data={data} session={session} />;
  } catch (error) {
    const message =
      error instanceof DashboardApiError
        ? i18n._(dashboardErrorMessageDescriptor(error.code, error.statusCode))
        : i18n._(DASHBOARD_ENTRY_MESSAGES.workspaceUnavailable);
    return <DashboardShell apiError={message} session={session} />;
  }
}
