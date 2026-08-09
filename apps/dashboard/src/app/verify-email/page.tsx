import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { EmailVerificationPanel } from '../../components/email-verification-panel';
import { buttonVariants } from '../../components/ui/button';
import { parseVerificationChallengeId, safeReturnTo } from '../../lib/auth-contract';

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

  if (!challengeId || query.token !== undefined) {
    return (
      <AuthShell
        description="Use the complete verification link from your latest Lodariq email."
        eyebrow="Email verification"
        title="This link is incomplete"
      >
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/sign-up">
          Return to account creation
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="Your email link proves ownership. Choose the password that will protect your account."
      eyebrow="Email verification"
      title="Finish your account"
    >
      <EmailVerificationPanel challengeId={challengeId} readTokenFromFragment returnTo={returnTo} />
    </AuthShell>
  );
}
