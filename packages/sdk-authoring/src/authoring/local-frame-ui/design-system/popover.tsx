import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

export function AuthoringPopover({
  align = 'start',
  contentClassName,
  content,
  onOpenChange,
  open,
  portal = false,
  side = 'bottom',
  trigger,
}: {
  align?: 'center' | 'end' | 'start';
  contentClassName?: string;
  content: ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  portal?: boolean;
  side?: 'bottom' | 'left' | 'right' | 'top';
  trigger: ReactNode;
}) {
  const className = ['ui-popover-content', contentClassName].filter(Boolean).join(' ');
  const popoverContent = (
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
  );
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      {portal ? <RadixPopover.Portal forceMount>{popoverContent}</RadixPopover.Portal> : popoverContent}
    </RadixPopover.Root>
  );
}
