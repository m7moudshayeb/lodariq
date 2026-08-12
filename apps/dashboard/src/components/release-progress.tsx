'use client';

import { Check, Circle, CircleAlert, FileText, Globe2, ShieldCheck } from 'lucide-react';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import type { DashboardReleaseStage, ReleaseStageTone } from '../lib/view-model';

interface ReleaseProgressProps {
  stages: DashboardReleaseStage[];
  compact?: boolean;
}

const stageIcons = {
  draft: FileText,
  staging: ShieldCheck,
  production: Globe2,
} as const;

const RELEASE_PROGRESS_LABEL = msg({
  id: 'dashboard.releaseProgress.label',
  message: 'Release progress',
});

export function ReleaseProgress({
  stages,
  compact = false,
}: ReleaseProgressProps): React.ReactElement {
  const { _ } = useLingui();
  return (
    <ol
      className={compact ? 'grid gap-3 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-3 sm:gap-0'}
      aria-label={_(RELEASE_PROGRESS_LABEL)}
    >
      {stages.map((stage, index) => {
        const StageIcon = stageIcons[stage.id];
        const isLast = index === stages.length - 1;
        return (
          <li className="relative min-w-0" key={stage.id}>
            {!compact && !isLast ? (
              <span
                aria-hidden="true"
                className="absolute top-5 hidden h-px bg-border sm:block ltr:left-[calc(50%+1.5rem)] ltr:right-[calc(-50%+1.5rem)] rtl:right-[calc(50%+1.5rem)] rtl:left-[calc(-50%+1.5rem)]"
              />
            ) : null}
            <div
              className={
                compact
                  ? 'flex min-w-0 items-start gap-3'
                  : 'relative z-10 grid min-w-0 justify-items-start gap-2 sm:justify-items-center sm:text-center'
              }
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${stageToneClassName(stage.tone)}`}
                aria-hidden="true"
              >
                <StageIcon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{stage.label}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-foreground sm:justify-center">
                  <StageStateIcon tone={stage.tone} />
                  {stage.statusLabel}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {stage.detail}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StageStateIcon({ tone }: { tone: ReleaseStageTone }): React.ReactElement {
  if (tone === 'complete') {
    return <Check className="size-3.5 text-[var(--success-fg)]" aria-hidden="true" />;
  }
  if (tone === 'attention') {
    return <CircleAlert className="size-3.5 text-[var(--attention)]" aria-hidden="true" />;
  }
  return <Circle className="size-3.5 text-muted-foreground" aria-hidden="true" />;
}

function stageToneClassName(tone: ReleaseStageTone): string {
  if (tone === 'complete') {
    return 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]';
  }
  if (tone === 'current') {
    return 'border-primary/25 bg-primary/10 text-primary';
  }
  if (tone === 'attention') {
    return 'border-[var(--attention-border)] bg-[var(--attention-bg)] text-[var(--attention)]';
  }
  return 'border-border bg-card text-muted-foreground';
}
