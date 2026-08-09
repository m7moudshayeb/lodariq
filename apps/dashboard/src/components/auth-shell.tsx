import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  backHref?: string;
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  backHref,
}: AuthShellProps): React.ReactElement {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-[0_22px_70px_rgba(30,55,47,.10)] sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,.88fr)_minmax(420px,1fr)]">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-[var(--surface-subtle)] p-10 lg:flex">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <span className="text-lg font-bold tracking-[-0.035em]">Lodariq</span>
          </div>
          <div className="grid max-w-sm gap-5 pb-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Author once
            </p>
            <p className="[font-family:Georgia,serif] text-[2.65rem] leading-[1.08] tracking-[-0.03em] text-foreground">
              Product experiences that stay close to the product.
            </p>
            <p className="max-w-xs text-sm leading-6 text-muted-foreground">
              Create, review, and release without carrying authoring work across tabs and tools.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Secure, first-party Lodariq access</p>
        </section>

        <section className="flex min-w-0 items-center justify-center p-5 sm:p-10 lg:p-14">
          <div className="grid w-full max-w-md gap-7">
            <div className="grid gap-5">
              <div className="flex items-center justify-between lg:hidden">
                <span className="text-lg font-bold tracking-[-0.035em]">Lodariq</span>
                {backHref ? (
                  <Link
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    href={backHref}
                  >
                    <ArrowLeft aria-hidden="true" className="size-3.5" />
                    Back
                  </Link>
                ) : null}
              </div>
              <div className="grid gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                  {eyebrow}
                </p>
                <h1 className="[font-family:Georgia,serif] text-4xl leading-tight tracking-[-0.025em]">
                  {title}
                </h1>
                <p className="text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
