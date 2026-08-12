import type { ReactNode } from 'react';

export interface SegmentedControlOption<Value extends string> {
  icon?: ReactNode;
  label: string;
  value: Value;
}

export function AuthoringSegmentedControl<Value extends string>({
  ariaLabel,
  disabled = false,
  onValueChange,
  options,
  size = 'compact',
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onValueChange: (value: Value) => void;
  options: ReadonlyArray<SegmentedControlOption<Value>>;
  size?: 'compact' | 'default';
  value: Value;
}) {
  return (
    <div aria-label={ariaLabel} className={`ui-segmented ui-segmented-${size}`} role="group">
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={option.value === value}
          className="ui-segmented-option"
          disabled={disabled}
          onClick={() => onValueChange(option.value)}
          type="button"
        >
          {option.icon ? <span className="ui-segmented-icon">{option.icon}</span> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
