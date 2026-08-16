import { redirect } from 'next/navigation';
import { AccountSecuritySettings } from '../../../components/account-security-settings';
import { AccountWorkspaceShell } from '../../../components/dashboard-app-shell';
import { DashboardApiError, loadAuthSession } from '../../../lib/api';

export const dynamic = 'force-dynamic';

export default async function AccountPage(): Promise<React.ReactElement> {
  let session;
  try {
    session = await loadAuthSession();
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 401) {
      redirect('/sign-in?returnTo=%2Faccount');
    }
    throw error;
  }
  return (
    <AccountWorkspaceShell session={session}>
      <AccountSecuritySettings session={session} />
    </AccountWorkspaceShell>
  );
}
