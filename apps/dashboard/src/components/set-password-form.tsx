'use client';

import Link from 'next/link';
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES, AUTH_PAGE_MESSAGES } from '../i18n/messages';
import {
  focusFirstInvalidAuthField,
  hasAuthFieldErrors,
  validateAuthForm,
  withoutAuthFieldError,
  type AuthFieldErrors,
} from '../lib/auth-form-validation';
import { AuthField, AuthFormFeedback } from './auth-form-controls';
import { Button, buttonVariants } from './ui/button';

interface SetPasswordFormProps {
  challengeId: string;
  returnTo?: string;
  onAuthenticated?: (session: AuthSessionSnapshot) => void | Promise<void>;
}

export function SetPasswordForm({
  challengeId,
  returnTo = '/',
  onAuthenticated,
}: SetPasswordFormProps): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [invalidLink, setInvalidLink] = useState(false);
  const [pending, setPending] = useState(false);
  const fragmentRead = useRef(false);
  const auth = useAuthMutations();
  const { _ } = useLingui();

  useEffect(() => {
    if (fragmentRead.current) return;
    fragmentRead.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const nextToken = fragment.get('token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setToken(nextToken);
    setTokenReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || !token) return;
    const validation = validateAuthForm(event.currentTarget, ['password', 'passwordConfirmation'], {
      confirmPassword: true,
    });
    if (hasAuthFieldErrors(validation.errors)) {
      setError('');
      setFieldErrors(validation.errors);
      focusFirstInvalidAuthField(
        event.currentTarget,
        ['password', 'passwordConfirmation'],
        validation.errors,
      );
      return;
    }
    setError('');
    setFieldErrors({});

    setPending(true);
    try {
      const session = await auth.setPassword.mutateAsync({
        challengeId,
        token,
        password: validation.values.password,
      });
      if (onAuthenticated) await onAuthenticated(session);
      else window.location.replace(returnTo);
    } catch (caught) {
      if (caught instanceof ClientAuthError && caught.code === 'password_reset_invalid') {
        setInvalidLink(true);
        return;
      }
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(AUTH_FORM_MESSAGES.pleaseTryAgain),
      );
    } finally {
      setPending(false);
    }
  }

  if (!tokenReady) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {_(AUTH_FORM_MESSAGES.readingSecureLink)}
      </p>
    );
  }

  if (!token || invalidLink) {
    return (
      <div className="grid gap-5">
        <div className="grid gap-2" role="alert">
          <h2 className="font-semibold text-foreground">
            {_(
              invalidLink
                ? AUTH_FORM_MESSAGES.passwordLinkUnavailable
                : AUTH_PAGE_MESSAGES.incompleteLinkTitle,
            )}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {_(
              invalidLink
                ? AUTH_FORM_MESSAGES.passwordLinkUnavailableHelp
                : AUTH_FORM_MESSAGES.incompletePasswordLink,
            )}
          </p>
        </div>
        <Link
          className={buttonVariants({ className: 'h-11 w-full' })}
          href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {_(AUTH_PAGE_MESSAGES.requestAnotherLink)}
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5"
      noValidate
      onInput={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          setFieldErrors((current) => withoutAuthFieldError(current, target.name));
        }
      }}
      onSubmit={(event) => void submit(event)}
    >
      <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
        <KeyRound aria-hidden="true" className="size-5" />
      </div>
      <AuthField
        autoComplete="new-password"
        disabled={pending}
        error={fieldErrors.password}
        help={_(AUTH_FORM_MESSAGES.passwordLength)}
        id="new-password"
        name="password"
      />
      <AuthField
        autoComplete="new-password"
        disabled={pending}
        error={fieldErrors.passwordConfirmation}
        id="confirm-password"
        name="passwordConfirmation"
      />
      <AuthFormFeedback fieldErrors={fieldErrors} formError={error} />
      <span aria-live="polite" className="sr-only" role="status">
        {pending ? _(AUTH_FORM_MESSAGES.savingPassword) : ''}
      </span>
      <Button className="h-11 w-full" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        )}
        {_(AUTH_FORM_MESSAGES.savePassword)}
      </Button>
    </form>
  );
}
