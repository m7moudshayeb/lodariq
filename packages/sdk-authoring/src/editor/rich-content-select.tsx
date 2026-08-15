import * as RadixSelect from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactElement,
} from 'react';
import { inheritRichContentFloatingTheme } from './rich-content-floating-theme';

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
  options,
  value,
}: {
  ariaLabel: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
  onValueChange: (value: string) => void;
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

  const inheritTriggerTheme = useCallback((content: HTMLDivElement | null): void => {
    if (!content || !triggerRef.current) return;
    inheritRichContentFloatingTheme(triggerRef.current, content);
  }, []);

  const handleOpenChange = (nextOpen: boolean): void => {
    onOpenChange?.(nextOpen);
  };

  return (
    <RadixSelect.Root onOpenChange={handleOpenChange} onValueChange={onValueChange} value={value}>
      <RadixSelect.Trigger
        ref={triggerRef}
        aria-label={ariaLabel}
        className={`rich-content-select-trigger ${className}`.trim()}
        onPointerDown={onPointerDown}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon asChild>
          <ChevronDown aria-hidden="true" size={13} strokeWidth={2.2} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          ref={inheritTriggerTheme}
          align="start"
          avoidCollisions
          className="rich-content-select-content"
          collisionBoundary={collisionBoundary ?? undefined}
          collisionPadding={8}
          data-rich-content-select-content="true"
          position="popper"
          sideOffset={7}
        >
          <RadixSelect.Viewport className="rich-content-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item
                className="rich-content-select-item"
                key={option.value}
                value={option.value}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="rich-content-select-indicator">
                  <Check aria-hidden="true" size={13} strokeWidth={2.3} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
