import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export function AuthoringField({
  children,
  description,
  label,
}: {
  children: ReactNode;
  description?: string;
  label: string;
}) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
      {description ? <span className="ui-field-description">{description}</span> : null}
    </label>
  );
}

export function AuthoringTextField({
  description,
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  description?: string;
  label: string;
}) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <label className="ui-field" htmlFor={inputId}>
      <span className="ui-field-label">{label}</span>
      <input
        {...props}
        aria-describedby={descriptionId}
        className={['ui-input', props.className].filter(Boolean).join(' ')}
        id={inputId}
      />
      {description ? (
        <span className="ui-field-description" id={descriptionId}>
          {description}
        </span>
      ) : null}
    </label>
  );
}
