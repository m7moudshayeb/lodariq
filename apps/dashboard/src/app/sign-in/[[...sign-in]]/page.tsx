import { AuthForm } from '../../../components/auth-form';
import { AuthShell } from '../../../components/auth-shell';
import { safeReturnTo } from '../../../lib/auth-contract';
import { isPublicSignupEnabled } from '../../../lib/signup-config';
import { isPasswordRecoveryEnabled } from '../../../lib/password-recovery-config';
import { AUTH_PAGE_MESSAGES } from '../../../i18n/messages';
import { getDashboardI18n } from '../../../i18n/server';

interface SignInPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function SignInPage({
  searchParams,
}: SignInPageProps): Promise<React.ReactElement> {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const { i18n } = await getDashboardI18n();
  return (
    <AuthShell
      description={i18n._(AUTH_PAGE_MESSAGES.signInDescription)}
      eyebrow={i18n._(AUTH_PAGE_MESSAGES.signInEyebrow)}
      title={i18n._(AUTH_PAGE_MESSAGES.signInTitle)}
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
