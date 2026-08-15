import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { buttonVariants } from '../../components/ui/button';
import { ACCOUNT_PAGE_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';

export default async function ForgotUsernamePage(): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  return (
    <AuthShell
      description={i18n._(ACCOUNT_PAGE_MESSAGES.forgotUsernameDescription)}
      eyebrow={i18n._(ACCOUNT_PAGE_MESSAGES.accessEyebrow)}
      title={i18n._(ACCOUNT_PAGE_MESSAGES.forgotUsernameTitle)}
    >
      <div className="grid gap-3">
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/sign-in">
          {i18n._(ACCOUNT_PAGE_MESSAGES.signInWithEmail)}
        </Link>
        <Link
          className={buttonVariants({ className: 'h-11 w-full', variant: 'outline' })}
          href="/forgot-password"
        >
          {i18n._(ACCOUNT_PAGE_MESSAGES.recoverAccess)}
        </Link>
      </div>
    </AuthShell>
  );
}
