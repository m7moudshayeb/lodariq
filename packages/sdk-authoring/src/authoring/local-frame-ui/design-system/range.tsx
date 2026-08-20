import { useId, type ChangeEvent } from 'react';

export function AuthoringRange({
  disabled = false,
  label,
  max,
  min,
  onValueChange,
  step,
  unit = '',
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  step: number;
  unit?: string;
  value: number;
}) {
  const id = useId();
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onValueChange(Number(event.currentTarget.value));
  };

  /*
   * "2 px", "0 ms" — a unit is a word after a number, and §4.3 sets it that way.
   * A bare percent sign is the exception: it belongs against its figure.
   */
  const shown = unit === '' || unit === '%' ? `${value}${unit}` : `${value} ${unit}`;

  return (
    <label className="ui-range" htmlFor={id}>
      <span className="ui-range-header">
        <span>{label}</span>
        <output htmlFor={id}>{shown}</output>
      </span>
      <input
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onChange={handleChange}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}
