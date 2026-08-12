import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { PasswordRecoveryForm } from '../../components/password-recovery-form';
import { buttonVariants } from '../../components/ui/button';
import { safeReturnTo } from '../../lib/auth-contract';
import { isPasswordRecoveryEnabled } from '../../lib/password-recovery-config';
import { AUTH_PAGE_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';

interface ForgotPasswordPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps): Promise<React.ReactElement> {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const { i18n } = await getDashboardI18n();
  if (!isPasswordRecoveryEnabled()) {
    return (
      <AuthShell
        description={i18n._(AUTH_PAGE_MESSAGES.recoveryDisabledDescription)}
        eyebrow={i18n._(AUTH_PAGE_MESSAGES.accountAccess)}
        title={i18n._(AUTH_PAGE_MESSAGES.recoveryDisabledTitle)}
      >
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/sign-in">
          {i18n._(AUTH_PAGE_MESSAGES.returnToSignIn)}
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      description={i18n._(AUTH_PAGE_MESSAGES.recoveryDescription)}
      eyebrow={i18n._(AUTH_PAGE_MESSAGES.accountAccess)}
      title={i18n._(AUTH_PAGE_MESSAGES.recoveryTitle)}
    >
      <PasswordRecoveryForm returnTo={returnTo} />
    </AuthShell>
  );
}
