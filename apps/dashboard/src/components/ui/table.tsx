import * as React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className, ...props }: React.ComponentProps<'table'>): React.ReactElement {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentProps<'thead'>): React.ReactElement {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: React.ComponentProps<'tbody'>): React.ReactElement {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>): React.ReactElement {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-surface data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<'th'>): React.ReactElement {
  return (
    <th
      className={cn(
        'h-10 px-4 text-start align-middle text-xs font-semibold whitespace-nowrap text-muted-foreground uppercase tracking-normal',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>): React.ReactElement {
  return <td className={cn('p-4 align-top', className)} {...props} />;
}
