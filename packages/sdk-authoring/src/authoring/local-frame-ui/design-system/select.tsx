import * as RadixSelect from '@radix-ui/react-select';
import type { ReactNode } from 'react';
import { Check, ChevronDown } from './icons';

const EMPTY_SELECT_VALUE = '__lodariq_empty__';

export interface AuthoringSelectOption {
  label: string;
  value: string;
}

export function AuthoringSelect({
  ariaLabel,
  dataAction,
  dataBlockId,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  dataAction: string;
  dataBlockId: string;
  onValueChange?: (value: string) => void;
  options: AuthoringSelectOption[];
  value: string;
}) {
  const radixValue = toRadixSelectValue(value);
  return (
    <RadixSelect.Root
      value={radixValue}
      onValueChange={(nextValue) => onValueChange?.(fromRadixSelectValue(nextValue))}
    >
      <RadixSelect.Trigger
        aria-label={selectTriggerLabel(dataAction)}
        className="ui-select-trigger"
        data-action={dataAction}
        data-block-id={dataBlockId}
      >
        <RadixSelect.Value />
        <RadixSelect.Icon asChild>
          <ChevronDown size={14} strokeWidth={2.2} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content className="ui-select-content" position="popper" sideOffset={5}>
          <RadixSelect.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                className="ui-select-item"
                value={toRadixSelectValue(option.value)}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ui-select-indicator">
                  <Check size={14} strokeWidth={2.3} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
      <NativeSelectMirror
        ariaLabel={ariaLabel}
        dataAction={dataAction}
        dataBlockId={dataBlockId}
        options={options}
        value={value}
      />
    </RadixSelect.Root>
  );
}

function NativeSelectMirror({
  ariaLabel,
  dataAction,
  dataBlockId,
  options,
  value,
}: {
  ariaLabel: string;
  dataAction: string;
  dataBlockId: string;
  options: AuthoringSelectOption[];
  value: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="ui-native-select-mirror"
      data-action={dataAction}
      data-block-id={dataBlockId}
      onChange={() => undefined}
      tabIndex={-1}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function toRadixSelectValue(value: string): string {
  return value === '' ? EMPTY_SELECT_VALUE : value;
}

function fromRadixSelectValue(value: string): string {
  return value === EMPTY_SELECT_VALUE ? '' : value;
}

function selectTriggerLabel(dataAction: string): string {
  if (dataAction === 'set-action') return 'Open action menu';
  if (dataAction === 'transform-block') return 'Open block type menu';
  return 'Open selection menu';
}

export function SelectField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="content-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
