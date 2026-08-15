import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { SetPasswordForm } from '../../components/set-password-form';
import { buttonVariants } from '../../components/ui/button';
import { parseSetPasswordChallengeId, safeReturnTo } from '../../lib/auth-contract';
import { AUTH_PAGE_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';

interface ResetPasswordPageProps {
  searchParams: Promise<{
    challenge?: string | string[];
    returnTo?: string | string[];
    token?: string | string[];
  }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps): Promise<React.ReactElement> {
  const query = await searchParams;
  const challengeId = parseSetPasswordChallengeId(query.challenge);
  const returnTo = safeReturnTo(query.returnTo);
  const { i18n } = await getDashboardI18n();

  if (!challengeId || query.token !== undefined) {
    return (
      <AuthShell
        description={i18n._(AUTH_PAGE_MESSAGES.incompletePasswordLinkDescription)}
        eyebrow={i18n._(AUTH_PAGE_MESSAGES.accountAccess)}
        title={i18n._(AUTH_PAGE_MESSAGES.incompleteLinkTitle)}
      >
        <Link
          className={buttonVariants({ className: 'h-11 w-full' })}
          href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {i18n._(AUTH_PAGE_MESSAGES.requestAnotherLink)}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={i18n._(AUTH_PAGE_MESSAGES.newPasswordDescription)}
      eyebrow={i18n._(AUTH_PAGE_MESSAGES.accountAccess)}
      title={i18n._(AUTH_PAGE_MESSAGES.newPasswordTitle)}
    >
      <SetPasswordForm challengeId={challengeId} returnTo={returnTo} />
    </AuthShell>
  );
}
