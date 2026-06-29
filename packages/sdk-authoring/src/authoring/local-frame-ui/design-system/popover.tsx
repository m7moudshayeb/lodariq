import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

export function AuthoringPopover({
  align = 'start',
  contentClassName,
  content,
  onOpenChange,
  open,
  side = 'bottom',
  trigger,
}: {
  align?: 'center' | 'end' | 'start';
  contentClassName?: string;
  content: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  side?: 'bottom' | 'left' | 'right' | 'top';
  trigger: ReactNode;
}) {
  const className = ['ui-popover-content', contentClassName].filter(Boolean).join(' ');
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Content
        align={align}
        className={className}
        forceMount
        side={side}
        sideOffset={6}
      >
        {content}
        <RadixPopover.Arrow className="ui-popover-arrow" />
      </RadixPopover.Content>
    </RadixPopover.Root>
  );
}
