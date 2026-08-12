'use client';

import { CircleAlert, RotateCcw } from 'lucide-react';
import { useLingui } from '@lingui/react';
import { Button } from '../components/ui/button';
import { DASHBOARD_ERROR_MESSAGES } from '../i18n/messages';

export default function DashboardError({ reset }: { reset: () => void }): React.ReactElement {
  const { _ } = useLingui();
  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full max-w-lg gap-5 rounded-2xl border border-border bg-card p-7 shadow-[0_20px_60px_rgba(30,55,47,.10)]">
        <div className="grid size-11 place-items-center rounded-xl bg-[var(--danger-bg)] text-[var(--danger-fg)]">
          <CircleAlert aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
          <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">
            {_(DASHBOARD_ERROR_MESSAGES.title)}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {_(DASHBOARD_ERROR_MESSAGES.description)}
          </p>
        </div>
        <Button className="w-fit" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          {_(DASHBOARD_ERROR_MESSAGES.retry)}
        </Button>
      </section>
    </main>
  );
}
