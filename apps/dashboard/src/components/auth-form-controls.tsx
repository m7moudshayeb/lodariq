'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLingui } from '@lingui/react';
import {
  AUTH_FIELD_DEFINITIONS,
  type AuthFieldError,
  type AuthFieldErrors,
  type AuthFieldName,
} from '../lib/auth-form-validation';
import { AUTH_FORM_MESSAGES } from '../i18n/messages';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { StatusBanner } from './ui/status-banner';

const AUTH_FIELD_LABELS = {
  name: AUTH_FORM_MESSAGES.yourName,
  email: AUTH_FORM_MESSAGES.email,
  identifier: AUTH_FORM_MESSAGES.identifier,
  password: AUTH_FORM_MESSAGES.password,
  passwordConfirmation: AUTH_FORM_MESSAGES.confirmPassword,
  workspaceName: AUTH_FORM_MESSAGES.workspace,
} as const;

interface AuthFieldProps {
  autoComplete?: string;
  disabled?: boolean;
  error?: AuthFieldError;
  help?: ReactNode;
  id: string;
  label?: ReactNode;
  labelAction?: ReactNode;
  name: AuthFieldName;
  placeholder?: string;
}

export function AuthField({
  autoComplete,
  disabled = false,
  error,
  help,
  id,
  label,
  labelAction,
  name,
  placeholder,
}: AuthFieldProps): React.ReactElement {
  const { _ } = useLingui();
  const definition = AUTH_FIELD_DEFINITIONS[name];
  const [passwordVisible, setPasswordVisible] = useState(false);
  const password = definition.type === 'password';
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const fieldLabel = label ?? _(AUTH_FIELD_LABELS[name]);

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{fieldLabel}</Label>
        {labelAction}
      </div>
      <div className={password ? 'relative' : undefined}>
        <Input
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          aria-required="true"
          autoCapitalize={definition.type === 'email' || name === 'identifier' ? 'none' : undefined}
          autoComplete={autoComplete ?? definition.autoComplete}
          className={password ? 'pr-11' : undefined}
          disabled={disabled}
          id={id}
          inputMode={definition.inputMode}
          name={name}
          placeholder={placeholder}
          spellCheck={definition.type === 'text' ? undefined : false}
          type={password && passwordVisible ? 'text' : definition.type}
        />
        {password ? (
          <Button
            aria-controls={id}
            aria-label={
              passwordVisible
                ? _(AUTH_FORM_MESSAGES.hidePassword)
                : _(AUTH_FORM_MESSAGES.showPassword)
            }
            className="absolute inset-y-0 right-0 size-9 border-0 bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus-visible:border-transparent rtl:left-0 rtl:right-auto"
            disabled={disabled}
            onClick={() => setPasswordVisible((visible) => !visible)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {passwordVisible ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </Button>
        ) : null}
      </div>
      {help ? (
        <p className="text-xs leading-5 text-muted-foreground" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium leading-5 text-[var(--danger-fg)]" id={errorId}>
          {authFieldErrorText(error, _(AUTH_FIELD_LABELS[name]), _)}
        </p>
      ) : null}
    </div>
  );
}

export function AuthFormFeedback({
  fieldErrors,
  formError,
}: {
  fieldErrors: AuthFieldErrors;
  formError?: string;
}): React.ReactElement | null {
  const { _ } = useLingui();
  const hasFieldError = Object.keys(fieldErrors).length > 0;
  if (!formError && !hasFieldError) return null;
  return <StatusBanner kind="error" title={formError || _(AUTH_FORM_MESSAGES.reviewFields)} />;
}

function authFieldErrorText(
  error: AuthFieldError,
  fieldLabel: string,
  translate: ReturnType<typeof useLingui>['_'],
): string {
  if (error.code === 'invalid_format') {
    return translate(
      error.field === 'identifier'
        ? AUTH_FORM_MESSAGES.identifierInvalid
        : AUTH_FORM_MESSAGES.emailInvalid,
    );
  }
  if (error.code === 'password_mismatch') {
    return translate(AUTH_FORM_MESSAGES.passwordsDoNotMatch);
  }
  if (error.code === 'too_short') {
    return translate({
      ...AUTH_FORM_MESSAGES.fieldTooShort,
      values: { field: fieldLabel, limit: error.limit ?? 0 },
    });
  }
  if (error.code === 'too_long') {
    return translate({
      ...AUTH_FORM_MESSAGES.fieldTooLong,
      values: { field: fieldLabel, limit: error.limit ?? 0 },
    });
  }
  return translate({ ...AUTH_FORM_MESSAGES.fieldRequired, values: { field: fieldLabel } });
}
