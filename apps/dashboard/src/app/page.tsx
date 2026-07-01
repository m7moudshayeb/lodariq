import { auth } from '@clerk/nextjs/server';
import { DashboardAuthRequired } from '../components/dashboard-auth-required';
import { DashboardShell } from '../components/dashboard-shell';
import { OrganizationRequired } from '../components/organization-required';
import { hasDashboardClerkRuntime, shouldProtectDashboardRoutes } from '../lib/clerk-config';
import { DashboardApiError, loadDashboardData, type DashboardDataDto } from '../lib/api';

export const dynamic = 'force-dynamic';

const emptyData: DashboardDataDto = {
  documents: [],
  environments: [],
  tokens: [],
};

export default async function DashboardPage(): Promise<React.ReactElement> {
  const authState = await readDashboardAuthState();
  if (authState?.configurationError) {
    return (
      <DashboardAuthRequired
        title="Dashboard auth is not configured"
        description="Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY for this deployment before using the experience workspace."
        showAction={false}
      />
    );
  }
  if (authState?.requiresSignIn) {
    return (
      <DashboardAuthRequired
        title="Sign in to Lodariq"
        description="The workspace uses Clerk sessions and active organization claims before it can read or change experiences."
      />
    );
  }
  if (authState?.requiresOrganization) {
    return <OrganizationRequired />;
  }

  try {
    const data = await loadDashboardData();
    return <DashboardShell data={data} />;
  } catch (error) {
    const message =
      error instanceof DashboardApiError
        ? `API ${error.statusCode}: ${error.message}`
        : 'API unavailable.';
    return <DashboardShell data={emptyData} apiError={message} />;
  }
}

async function readDashboardAuthState(): Promise<
  | { configurationError?: boolean; requiresSignIn?: boolean; requiresOrganization?: boolean }
  | undefined
> {
  if (!shouldProtectDashboardRoutes()) return undefined;
  if (!hasDashboardClerkRuntime()) return { configurationError: true };

  const session = await auth();
  if (!session.userId) return { requiresSignIn: true };
  if (!session.orgId) return { requiresOrganization: true };
  return undefined;
}
