import { SignInButton } from '@clerk/nextjs';
import { LockKeyhole } from 'lucide-react';
import { Button } from './ui/button';

interface DashboardAuthRequiredProps {
  title: string;
  description: string;
  actionLabel?: string;
  showAction?: boolean;
}

export function DashboardAuthRequired({
  title,
  description,
  actionLabel = 'Sign in',
  showAction = true,
}: DashboardAuthRequiredProps): React.ReactElement {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-xl place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full gap-5 rounded-lg border border-border bg-surface p-6 shadow-sm shadow-black/20">
        <div className="flex size-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Lodariq</p>
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {showAction ? (
          <SignInButton mode="redirect">
            <Button>{actionLabel}</Button>
          </SignInButton>
        ) : null}
      </section>
    </main>
  );
}
