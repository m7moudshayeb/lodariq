import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { X } from './icons';
import { useExclusiveFloating } from './exclusive-floating';

export function AuthoringPopover({
  align = 'start',
  contentClassName,
  content,
  dismissLabel,
  onOpenChange,
  open,
  portal = false,
  side = 'bottom',
  trigger,
}: {
  align?: 'center' | 'end' | 'start';
  contentClassName?: string;
  content: ReactNode;
  dismissLabel?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  portal?: boolean;
  side?: 'bottom' | 'left' | 'right' | 'top';
  trigger: ReactNode;
}) {
  const floating = useExclusiveFloating({
    ...(onOpenChange ? { onOpenChange } : {}),
    ...(open === undefined ? {} : { open }),
  });
  const className = ['ui-popover-content', contentClassName].filter(Boolean).join(' ');
  const popoverContent = (
    <RadixPopover.Content align={align} className={className} side={side} sideOffset={6}>
      {dismissLabel ? (
        <RadixPopover.Close asChild>
          <button
            type="button"
            className="ui-popover-close"
            aria-label={dismissLabel}
            onClick={() => onOpenChange?.(false)}
          >
            <X size={15} strokeWidth={2.1} aria-hidden="true" />
          </button>
        </RadixPopover.Close>
      ) : null}
      {content}
      <RadixPopover.Arrow className="ui-popover-arrow" />
    </RadixPopover.Content>
  );
  return (
    <RadixPopover.Root open={floating.open} onOpenChange={floating.setOpen}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      {portal ? <RadixPopover.Portal>{popoverContent}</RadixPopover.Portal> : popoverContent}
    </RadixPopover.Root>
  );
}
