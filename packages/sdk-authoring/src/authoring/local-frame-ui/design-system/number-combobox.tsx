import * as RadixPopover from '@radix-ui/react-popover';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from './icons';

export interface AuthoringNumberComboboxOption {
  label: string;
  value: number | string;
}

export interface AuthoringNumberComboboxProps {
  ariaLabel: string;
  className?: string;
  max: number;
  min: number;
  onValueChange: (value: number | string) => void;
  options: readonly AuthoringNumberComboboxOption[];
  placeholder?: string;
  step?: number;
  suffix?: string;
  value: number | string;
}

/** A token-aligned number field with discoverable presets and direct entry. */
export function AuthoringNumberCombobox({
  ariaLabel,
  className,
  max,
  min,
  onValueChange,
  options,
  placeholder,
  step = 1,
  suffix,
  value,
}: AuthoringNumberComboboxProps) {
  const [draft, setDraft] = useState(numberDraft(value));
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(numberDraft(value)), [value]);

  const commitDraft = (): void => {
    const input = inputRef.current;
    if (!input || draft.trim() === '') return;
    const nextValue = Number(draft);
    if (!Number.isInteger(nextValue) || nextValue < min || nextValue > max) {
      input.reportValidity();
      return;
    }
    onValueChange(nextValue);
  };
  const selectedOption = options.find((option) => option.value === value);
  const inputPlaceholder =
    placeholder ?? (typeof value === 'string' ? selectedOption?.label : undefined);
  const classes = ['ui-number-combobox', className].filter(Boolean).join(' ');

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <div className={classes}>
        <input
          ref={inputRef}
          aria-label={ariaLabel}
          inputMode="numeric"
          max={max}
          min={min}
          onBlur={commitDraft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraft();
              inputRef.current?.select();
            }
          }}
          placeholder={inputPlaceholder}
          step={step}
          type="number"
          value={draft}
        />
        {suffix ? <span className="ui-number-combobox-suffix">{suffix}</span> : null}
        <RadixPopover.Trigger asChild>
          <button type="button" aria-label={ariaLabel} className="ui-number-combobox-trigger">
            <ChevronDown size={13} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </RadixPopover.Trigger>
      </div>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align="start"
          className="ui-select-content ui-number-combobox-content"
          sideOffset={5}
        >
          <div className="ui-number-combobox-options" role="listbox" aria-label={ariaLabel}>
            {options.map((option) => (
              <button
                type="button"
                aria-selected={option.value === value}
                className="ui-select-item ui-number-combobox-option"
                data-kind={typeof option.value === 'number' ? 'number' : 'special'}
                key={String(option.value)}
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                role="option"
              >
                <span>{option.label}</span>
                {option.value === value ? (
                  <Check className="ui-select-indicator" size={14} strokeWidth={2.3} />
                ) : null}
              </button>
            ))}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

function numberDraft(value: number | string): string {
  return typeof value === 'number' ? String(value) : '';
}
