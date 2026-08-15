import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { EmailVerificationPanel } from '../../components/email-verification-panel';
import { buttonVariants } from '../../components/ui/button';
import { parseVerificationChallengeId, safeReturnTo } from '../../lib/auth-contract';
import { AUTH_PAGE_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';

interface VerifyEmailPageProps {
  searchParams: Promise<{
    challenge?: string | string[];
    returnTo?: string | string[];
    token?: string | string[];
  }>;
}

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps): Promise<React.ReactElement> {
  const query = await searchParams;
  const challengeId = parseVerificationChallengeId(query.challenge);
  const returnTo = safeReturnTo(query.returnTo);
  const { i18n } = await getDashboardI18n();

  if (!challengeId || query.token !== undefined) {
    return (
      <AuthShell
        description={i18n._(AUTH_PAGE_MESSAGES.incompleteVerificationDescription)}
        eyebrow={i18n._(AUTH_PAGE_MESSAGES.emailVerification)}
        title={i18n._(AUTH_PAGE_MESSAGES.incompleteLinkTitle)}
      >
        <Link
          className={buttonVariants({ className: 'h-11 w-full' })}
          href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {i18n._(AUTH_PAGE_MESSAGES.returnToAccountCreation)}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description={i18n._(AUTH_PAGE_MESSAGES.finishAccountDescription)}
      eyebrow={i18n._(AUTH_PAGE_MESSAGES.emailVerification)}
      title={i18n._(AUTH_PAGE_MESSAGES.finishAccountTitle)}
    >
      <EmailVerificationPanel challengeId={challengeId} readTokenFromFragment returnTo={returnTo} />
    </AuthShell>
  );
}
