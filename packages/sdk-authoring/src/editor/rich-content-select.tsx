import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEventHandler, type ReactElement } from 'react';

export interface RichContentSelectOption {
  label: string;
  value: string;
}

export function RichContentSelect({
  ariaLabel,
  className = '',
  onOpenChange,
  onPointerDown,
  onValueChange,
  open,
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onValueChange: (value: string) => void;
  open?: boolean;
  options: readonly RichContentSelectOption[];
  value: string;
}): ReactElement {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [collisionBoundary, setCollisionBoundary] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setCollisionBoundary(
      triggerRef.current?.closest<HTMLElement>('.panel-storyboard-workspace') ?? null,
    );
  }, []);

  return (
    <RadixSelect.Root
      onOpenChange={onOpenChange}
      onValueChange={onValueChange}
      open={open}
      value={value}
    >
      <RadixSelect.Trigger
        ref={triggerRef}
        aria-label={ariaLabel}
        className={`ui-select-trigger ${className}`.trim()}
        onPointerDown={onPointerDown}
      >
        <span className="ui-select-value">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          align="start"
          avoidCollisions
          className="ui-select-content"
          collisionBoundary={collisionBoundary ?? undefined}
          collisionPadding={8}
          data-rich-content-select-content="true"
          position="popper"
          sideOffset={8}
        >
          <RadixSelect.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item className="ui-select-item" key={option.value} value={option.value}>
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ui-select-indicator">
                  <Check aria-hidden="true" size={14} strokeWidth={2.2} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
