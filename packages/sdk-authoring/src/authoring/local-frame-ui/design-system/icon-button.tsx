import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AuthoringIconButtonSize = 'compact' | 'default';

export interface AuthoringIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: AuthoringIconButtonSize;
  tooltip?: string;
  children: ReactNode;
}

export function AuthoringIconButton({
  children,
  className,
  label,
  size = 'default',
  tooltip,
  type = 'button',
  ...props
}: AuthoringIconButtonProps) {
  const classes = ['ui-icon-button', `ui-icon-button-${size}`, className].filter(Boolean).join(' ');

  return (
    <button {...props} aria-label={label} className={classes} title={tooltip} type={type}>
      {children}
    </button>
  );
}
