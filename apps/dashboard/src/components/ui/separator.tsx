import * as React from 'react';
import { cn } from '../../lib/utils';

export function Separator({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return <div role="separator" className={cn('h-px w-full bg-border', className)} {...props} />;
}
