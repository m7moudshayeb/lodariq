import Link from 'next/link';
import { AuthForm } from '../../../components/auth-form';
import { AuthShell } from '../../../components/auth-shell';
import { buttonVariants } from '../../../components/ui/button';
import { safeReturnTo } from '../../../lib/auth-contract';
import { isPublicSignupEnabled } from '../../../lib/signup-config';

interface SignUpPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function SignUpPage({
  searchParams,
}: SignUpPageProps): Promise<React.ReactElement> {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  if (!isPublicSignupEnabled()) {
    return (
      <AuthShell
        description="This deployment is not accepting new accounts. Existing creators can continue with their Lodariq account."
        eyebrow="Account creation"
        title="Sign-up is not available here"
      >
        <div className="grid gap-4 rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] p-4 text-sm leading-6 text-[var(--info-fg)]">
          <p>Account creation is not available in this deployment.</p>
          <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/sign-in">
            Sign in instead
          </Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      description="Create your account and first workspace together—no setup detour."
      eyebrow="Start authoring"
      title="Bring the experience into the product"
    >
      <AuthForm mode="sign-up" returnTo={returnTo} />
    </AuthShell>
  );
}
