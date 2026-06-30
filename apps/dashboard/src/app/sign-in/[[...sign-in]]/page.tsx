import { SignIn } from '@clerk/nextjs';
import { DashboardAuthRequired } from '../../../components/dashboard-auth-required';
import {
  dashboardAfterAuthPath,
  dashboardSignUpPath,
  hasDashboardClerkProvider,
} from '../../../lib/clerk-config';

export default function SignInPage(): React.ReactElement {
  if (!hasDashboardClerkProvider()) {
    return (
      <DashboardAuthRequired
        title="Dashboard auth is not configured"
        description="Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY for this deployment before signing in."
        showAction={false}
      />
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full place-items-center bg-background p-4 text-foreground">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl={dashboardSignUpPath}
        fallbackRedirectUrl={dashboardAfterAuthPath}
      />
    </main>
  );
}
