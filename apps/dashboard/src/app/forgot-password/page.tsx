import Link from 'next/link';
import { AuthShell } from '../../components/auth-shell';
import { PasswordRecoveryForm } from '../../components/password-recovery-form';
import { buttonVariants } from '../../components/ui/button';
import { safeReturnTo } from '../../lib/auth-contract';
import { isPasswordRecoveryEnabled } from '../../lib/password-recovery-config';

interface ForgotPasswordPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps): Promise<React.ReactElement> {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  if (!isPasswordRecoveryEnabled()) {
    return (
      <AuthShell
        description="Password recovery has not been enabled for this deployment yet."
        eyebrow="Account access"
        title="Recovery is unavailable"
      >
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/sign-in">
          Return to sign in
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      description="One email link lets an existing creator establish or replace their Lodariq password."
      eyebrow="Account access"
      title="Set or reset your password"
    >
      <PasswordRecoveryForm returnTo={returnTo} />
    </AuthShell>
  );
}
