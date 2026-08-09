import { AuthForm } from '../../../components/auth-form';
import { AuthShell } from '../../../components/auth-shell';
import { safeReturnTo } from '../../../lib/auth-contract';
import { isPublicSignupEnabled } from '../../../lib/signup-config';
import { isPasswordRecoveryEnabled } from '../../../lib/password-recovery-config';

interface SignInPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function SignInPage({
  searchParams,
}: SignInPageProps): Promise<React.ReactElement> {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  return (
    <AuthShell
      description="Use your Lodariq account to return to your product workspace."
      eyebrow="Welcome back"
      title="Continue your work"
    >
      <AuthForm
        mode="sign-in"
        returnTo={returnTo}
        showPasswordRecoveryLink={isPasswordRecoveryEnabled()}
        showSignUpLink={isPublicSignupEnabled()}
      />
    </AuthShell>
  );
}
