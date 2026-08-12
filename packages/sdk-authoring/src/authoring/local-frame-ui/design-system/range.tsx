import { useId, type ChangeEvent } from 'react';

export function AuthoringRange({
  label,
  max,
  min,
  onValueChange,
  step,
  unit = '',
  value,
}: {
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

  return (
    <label className="ui-range" htmlFor={id}>
      <span className="ui-range-header">
        <span>{label}</span>
        <output htmlFor={id}>{`${value}${unit}`}</output>
      </span>
      <input
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
