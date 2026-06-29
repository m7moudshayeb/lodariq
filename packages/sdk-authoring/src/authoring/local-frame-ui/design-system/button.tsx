import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AuthoringButtonTone = 'default' | 'primary' | 'ghost' | 'danger';

export interface AuthoringButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  tone?: AuthoringButtonTone;
}

export function AuthoringButton({
  children,
  className,
  icon,
  tone = 'default',
  type = 'button',
  ...props
}: AuthoringButtonProps) {
  const classes = ['ui-button', tone !== 'default' ? `ui-button-${tone}` : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button {...props} type={type} className={classes}>
      {icon ? <span className="ui-button-icon">{icon}</span> : null}
      {children ? <span className="ui-button-label">{children}</span> : null}
    </button>
  );
}
