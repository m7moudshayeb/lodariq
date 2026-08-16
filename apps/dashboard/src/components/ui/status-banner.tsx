import * as React from 'react';
import { CircleCheck, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type StatusBannerKind = 'error' | 'warning' | 'success';

const STATUS_BANNER: Record<
  StatusBannerKind,
  {
    icon: LucideIcon;
    shell: string;
    iconClass: string;
    titleClass: string;
    bodyClass: string;
  }
> = {
  error: {
    icon: CircleX,
    shell: 'border-[var(--danger-border)] bg-[var(--danger-bg)]',
    iconClass: 'text-[var(--danger-fg)]',
    titleClass: 'text-[var(--danger-fg)]',
    bodyClass: 'text-[var(--danger-body)]',
  },
  warning: {
    icon: TriangleAlert,
    shell: 'border-[var(--warning-border)] bg-[var(--warning-bg)]',
    iconClass: 'text-[var(--warning-fg)]',
    titleClass: 'text-[var(--warning-fg)]',
    bodyClass: 'text-[var(--warning-body)]',
  },
  success: {
    icon: CircleCheck,
    shell: 'border-[var(--success-border)] bg-[var(--success-bg)]',
    iconClass: 'text-[var(--success-fg)]',
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
      className={cn('flex items-start gap-3 rounded-lg border p-3', tone.shell, className)}
      role={kind === 'success' ? 'status' : 'alert'}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', tone.iconClass)} />
      <div className="grid min-w-0 gap-1">
        <p className={cn('text-sm font-medium leading-5', tone.titleClass)}>{title}</p>
        {children ? <div className={cn('text-sm leading-5', tone.bodyClass)}>{children}</div> : null}
      </div>
    </div>
  );
}
