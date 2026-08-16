import Link from 'next/link';
import { AuthShell } from '../../../components/auth-shell';
import { EmailChangeVerification } from '../../../components/email-change-verification';
import { buttonVariants } from '../../../components/ui/button';
import { parseEmailChangeLink } from '../../../lib/auth-contract';
import { getDashboardI18n } from '../../../i18n/server';
import { ACCOUNT_PAGE_MESSAGES } from '../../../i18n/messages';

interface EmailChangePageProps {
  searchParams: Promise<{
    challenge?: string | string[];
    proof?: string | string[];
    token?: string | string[];
  }>;
}

export default async function EmailChangePage({
  searchParams,
}: EmailChangePageProps): Promise<React.ReactElement> {
  const query = await searchParams;
  const link = parseEmailChangeLink(query.challenge, query.proof);
  const { i18n } = await getDashboardI18n();
  const valid = link && query.token === undefined;
  return (
    <AuthShell
      description={
        valid
          ? i18n._(ACCOUNT_PAGE_MESSAGES.emailChangeDescription)
          : i18n._(ACCOUNT_PAGE_MESSAGES.emailChangeInvalidDescription)
      }
      eyebrow={i18n._(ACCOUNT_PAGE_MESSAGES.securityEyebrow)}
      title={i18n._(ACCOUNT_PAGE_MESSAGES.emailChangeTitle)}
    >
      {valid ? (
        <EmailChangeVerification challengeId={link.challengeId} proof={link.proof} />
      ) : (
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/account">
          {i18n._(ACCOUNT_PAGE_MESSAGES.returnToSecurity)}
        </Link>
      )}
    </AuthShell>
  );
}
