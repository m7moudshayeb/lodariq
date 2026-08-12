import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { buttonVariants } from './ui/button';
import { getDashboardI18n } from '../i18n/server';
import { AUTH_FORM_MESSAGES } from '../i18n/messages';

interface DashboardAuthRequiredProps {
  title: string;
  description: string;
  actionLabel?: string;
  returnTo?: string;
}

export async function DashboardAuthRequired({
  title,
  description,
  actionLabel,
  returnTo = '/',
}: DashboardAuthRequiredProps): Promise<React.ReactElement> {
  const { i18n } = await getDashboardI18n();
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full max-w-lg gap-6 rounded-2xl border border-border bg-card p-7 shadow-[0_20px_60px_rgba(30,55,47,.10)] sm:p-9">
        <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
          <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Link
          className={buttonVariants({ className: 'h-11 w-full sm:w-fit' })}
          href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {actionLabel ?? i18n._(AUTH_FORM_MESSAGES.signIn)}
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </section>
    </main>
  );
}
