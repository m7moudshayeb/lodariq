import { Paintbrush, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

export function BrandEmptyState({
  canEdit,
  error,
  pending,
  onCreate,
}: {
  canEdit: boolean;
  error: string;
  pending: boolean;
  onCreate: () => void;
}): React.ReactElement {
  return (
    <Card className="overflow-hidden border-dashed shadow-none">
      <div className="grid min-h-[360px] items-center gap-8 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.75fr)]">
        <div className="grid max-w-xl gap-5">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Paintbrush aria-hidden="true" className="size-5" />
          </span>
          <div className="grid gap-2">
            <h2 className="font-serif text-3xl font-medium tracking-[-0.025em]">
              Make every experience feel native
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Start from Lodariq’s accessible foundation, then adjust five essentials. No CSS,
              selectors, or theme configuration maze.
            </p>
          </div>
          <div>
            <Button disabled={!canEdit || pending} onClick={onCreate} type="button">
              <Sparkles aria-hidden="true" />
              {pending ? 'Creating…' : 'Create Brand system'}
            </Button>
            {!canEdit ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Ask a workspace member, admin, or owner to create it.
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm font-medium text-[var(--danger-fg)]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <div
          aria-hidden="true"
          className="rounded-2xl border border-border bg-[var(--surface-subtle)] p-4 shadow-[0_18px_50px_rgba(12,33,28,.08)]"
        >
          <div className="rounded-xl border border-[#d7dce5] bg-white p-5 text-[#172033] shadow-[0_8px_24px_rgba(16,24,40,.12)]">
            <p className="text-base font-semibold">Welcome to your workspace</p>
            <p className="mt-2 text-sm leading-6 text-[#5d6678]">
              A clear, accessible starting point for every product experience.
            </p>
            <button
              className="pointer-events-none mt-5 h-9 rounded-[10px] bg-[#2457ff] px-4 text-sm font-semibold text-white"
              tabIndex={-1}
              type="button"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
