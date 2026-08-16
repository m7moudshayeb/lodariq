import * as React from 'react';
import { CircleCheck, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type StatusBannerKind = 'error' | 'warning' | 'success';

const STATUS_BANNER: Record<
  StatusBannerKind,
  {
    icon: LucideIcon;
    shell: string;
    rail: string;
    titleClass: string;
    bodyClass: string;
  }
> = {
  error: {
    icon: CircleX,
    shell: 'border-[var(--danger-border)] bg-[var(--danger-bg)]',
    rail: 'bg-[var(--danger-solid)]',
    titleClass: 'text-[var(--danger-fg)]',
    bodyClass: 'text-[var(--danger-body)]',
  },
  warning: {
    icon: TriangleAlert,
    shell: 'border-[var(--warning-border)] bg-[var(--warning-bg)]',
    rail: 'bg-[var(--warning-solid)]',
    titleClass: 'text-[var(--warning-fg)]',
    bodyClass: 'text-[var(--warning-body)]',
  },
  success: {
    icon: CircleCheck,
    shell: 'border-[var(--success-border)] bg-[var(--success-bg)]',
    rail: 'bg-[var(--success-solid)]',
    titleClass: 'text-[var(--success-fg)]',
    bodyClass: 'text-[var(--success-body)]',
  },
};

export function StatusBanner({
  kind,
  title,
  children,
  className,
}: {
  kind: StatusBannerKind;
  title: string;
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  const tone = STATUS_BANNER[kind];
  const Icon = tone.icon;
  return (
    <div
      className={cn('flex overflow-hidden rounded-lg border', tone.shell, className)}
      role={kind === 'success' ? 'status' : 'alert'}
    >
      <div
        className={cn('flex w-11 shrink-0 items-start justify-center self-stretch pt-3', tone.rail)}
      >
        <Icon aria-hidden="true" className="size-5 text-white" />
      </div>
      <div className="grid min-w-0 flex-1 gap-1 p-3">
        <p className={cn('text-sm font-medium leading-5', tone.titleClass)}>{title}</p>
        {children ? (
          <div className={cn('text-sm leading-5', tone.bodyClass)}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
