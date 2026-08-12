import Link from 'next/link';
import { AuthForm } from '../../../components/auth-form';
import { AuthShell } from '../../../components/auth-shell';
import { buttonVariants } from '../../../components/ui/button';
import { safeReturnTo } from '../../../lib/auth-contract';
import { isPublicSignupEnabled } from '../../../lib/signup-config';
import { AUTH_PAGE_MESSAGES } from '../../../i18n/messages';
import { getDashboardI18n } from '../../../i18n/server';

interface SignUpPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function SignUpPage({
  searchParams,
}: SignUpPageProps): Promise<React.ReactElement> {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const { i18n } = await getDashboardI18n();
  if (!isPublicSignupEnabled()) {
    return (
      <AuthShell
        description={i18n._(AUTH_PAGE_MESSAGES.signUpDisabledDescription)}
        eyebrow={i18n._(AUTH_PAGE_MESSAGES.signUpDisabledEyebrow)}
        title={i18n._(AUTH_PAGE_MESSAGES.signUpDisabledTitle)}
      >
        <div className="grid gap-4 rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] p-4 text-sm leading-6 text-[var(--info-fg)]">
          <p>{i18n._(AUTH_PAGE_MESSAGES.signUpDisabledBody)}</p>
          <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/sign-in">
            {i18n._(AUTH_PAGE_MESSAGES.signInInstead)}
          </Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      description={i18n._(AUTH_PAGE_MESSAGES.signUpDescription)}
      eyebrow={i18n._(AUTH_PAGE_MESSAGES.signUpEyebrow)}
      title={i18n._(AUTH_PAGE_MESSAGES.signUpTitle)}
    >
      <AuthForm mode="sign-up" returnTo={returnTo} />
    </AuthShell>
  );
}
