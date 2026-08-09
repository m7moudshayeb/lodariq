import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { SetPasswordForm } from '../../components/set-password-form';
import { buttonVariants } from '../../components/ui/button';
import { parseSetPasswordChallengeId, safeReturnTo } from '../../lib/auth-contract';

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

  if (!challengeId || query.token !== undefined) {
    return (
      <AuthShell
        description="Use the complete password link from your latest Lodariq email."
        eyebrow="Account access"
        title="This link is incomplete"
      >
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/forgot-password">
          Request another link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      description="The secret is cleared from your browser before the form appears. Saving signs you in."
      eyebrow="Account access"
      title="Choose a new password"
    >
      <SetPasswordForm challengeId={challengeId} returnTo={returnTo} />
    </AuthShell>
  );
}
