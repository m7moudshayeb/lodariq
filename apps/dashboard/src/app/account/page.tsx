import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AccountSecuritySettings } from '../../components/account-security-settings';
import { buttonVariants } from '../../components/ui/button';
import { DashboardApiError, loadAuthSession } from '../../lib/api';
import { ACCOUNT_PAGE_MESSAGES } from '../../i18n/messages';
import { getDashboardI18n } from '../../i18n/server';

export const dynamic = 'force-dynamic';

export default async function AccountPage(): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  let session;
  try {
    session = await loadAuthSession();
  } catch (error) {
    if (error instanceof DashboardApiError && error.statusCode === 401) {
      redirect('/sign-in?returnTo=%2Faccount');
    }
    throw error;
  }
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <Link className={buttonVariants({ variant: 'ghost', className: 'w-fit' })} href="/">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          {i18n._(ACCOUNT_PAGE_MESSAGES.workspace)}
        </Link>
        <AccountSecuritySettings session={session} />
      </div>
    </main>
  );
}
