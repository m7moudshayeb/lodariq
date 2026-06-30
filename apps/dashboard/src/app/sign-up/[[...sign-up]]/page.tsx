import { SignUp } from '@clerk/nextjs';
import { DashboardAuthRequired } from '../../../components/dashboard-auth-required';
import {
  dashboardAfterAuthPath,
  dashboardSignInPath,
  hasDashboardClerkProvider,
} from '../../../lib/clerk-config';

export default function SignUpPage(): React.ReactElement {
  if (!hasDashboardClerkProvider()) {
    return (
      <DashboardAuthRequired
        title="Dashboard auth is not configured"
        description="Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY for this deployment before signing up."
        showAction={false}
      />
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full place-items-center bg-background p-4 text-foreground">
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl={dashboardSignInPath}
        fallbackRedirectUrl={dashboardAfterAuthPath}
      />
    </main>
  );
}
