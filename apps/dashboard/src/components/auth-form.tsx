'use client';

import Link from 'next/link';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import type { AuthSessionSnapshot, EmailVerificationRequiredResponse } from '../lib/auth-contract';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES } from '../i18n/messages';
import { EmailVerificationPanel } from './email-verification-panel';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface AuthFormProps {
  mode: 'sign-in' | 'sign-up';
  returnTo?: string;
  embedded?: boolean;
  showSignUpLink?: boolean;
  showPasswordRecoveryLink?: boolean;
  onAuthenticated?: (session: AuthSessionSnapshot) => void | Promise<void>;
}

export function AuthForm({
  mode,
  returnTo = '/',
  embedded = false,
  showSignUpLink = true,
  showPasswordRecoveryLink = true,
  onAuthenticated,
}: AuthFormProps): React.ReactElement {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [verification, setVerification] = useState<{
    email: string;
    response: EmailVerificationRequiredResponse;
  } | null>(null);
  const signUpMode = mode === 'sign-up';
  const auth = useAuthMutations();
  const { _ } = useLingui();

  async function completeAuthentication(session: AuthSessionSnapshot): Promise<void> {
    if (onAuthenticated) {
      await onAuthenticated(session);
      return;
    }
    window.location.replace(returnTo);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      if (signUpMode) {
        const email = stringField(form, 'email');
        const response = await auth.signUp.mutateAsync({
          email,
          name: stringField(form, 'name'),
          workspaceName: stringField(form, 'workspaceName'),
        });
        setVerification({ email, response });
        return;
      }

      const session = await auth.signIn.mutateAsync({
        email: stringField(form, 'email'),
        password: passwordField(form),
      });
      await completeAuthentication(session);
    } catch (caught) {
      setError(
        caught instanceof ClientAuthError
          ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
          : _(AUTH_FORM_MESSAGES.pleaseTryAgain),
      );
    } finally {
      setPending(false);
    }
  }

  if (verification) {
    return (
      <EmailVerificationPanel
        challengeId={verification.response.challengeId}
        developmentToken={verification.response.verificationToken}
        email={verification.email}
        expiresAt={verification.response.expiresAt}
        onRestart={() => setVerification(null)}
        onVerified={completeAuthentication}
      />
    );
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
      {signUpMode ? (
        <div className="grid gap-2">
          <Label htmlFor={embedded ? 'activation-name' : 'name'}>
            {_(AUTH_FORM_MESSAGES.yourName)}
          </Label>
          <Input
            autoComplete="name"
            disabled={pending}
            id={embedded ? 'activation-name' : 'name'}
            name="name"
            placeholder="Alex Morgan"
            required
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={embedded ? 'activation-email' : 'email'}>
          {_(AUTH_FORM_MESSAGES.email)}
        </Label>
        <Input
          autoCapitalize="none"
          autoComplete="email"
          disabled={pending}
          id={embedded ? 'activation-email' : 'email'}
          inputMode="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
      </div>

      {!signUpMode ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={embedded ? 'activation-password' : 'password'}>
              {_(AUTH_FORM_MESSAGES.password)}
            </Label>
            {showPasswordRecoveryLink ? (
              <Link
                className="text-xs font-semibold text-primary hover:underline"
                href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
              >
                {_(AUTH_FORM_MESSAGES.setOrResetPassword)}
              </Link>
            ) : null}
          </div>
          <Input
            autoComplete="current-password"
            disabled={pending}
            id={embedded ? 'activation-password' : 'password'}
            minLength={12}
            maxLength={128}
            name="password"
            required
            type="password"
          />
        </div>
      ) : null}

      {signUpMode ? (
        <div className="grid gap-2">
          <Label htmlFor="workspaceName">{_(AUTH_FORM_MESSAGES.workspace)}</Label>
          <Input
            autoComplete="organization"
            disabled={pending}
            id="workspaceName"
            name="workspaceName"
            placeholder="Acme Product"
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {_(AUTH_FORM_MESSAGES.workspaceHelp)}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-fg)]"
          role="alert"
        >
          {error}
        </p>
      ) : (
        <span aria-live="polite" className="sr-only">
          {pending ? _(AUTH_FORM_MESSAGES.signingIn) : ''}
        </span>
      )}

      <Button className="h-11 w-full" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        )}
        {signUpMode ? _(AUTH_FORM_MESSAGES.createAccount) : _(AUTH_FORM_MESSAGES.continue)}
      </Button>

      {!embedded && (signUpMode || showSignUpLink) ? (
        <p className="text-center text-sm text-muted-foreground">
          {signUpMode ? _(AUTH_FORM_MESSAGES.existingAccount) : _(AUTH_FORM_MESSAGES.newToLodariq)}{' '}
          <Link
            className="font-semibold text-primary hover:underline"
            href={`${signUpMode ? '/sign-in' : '/sign-up'}?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {signUpMode ? _(AUTH_FORM_MESSAGES.signIn) : _(AUTH_FORM_MESSAGES.createAnAccount)}
          </Link>
        </p>
      ) : null}
    </form>
  );
}

function stringField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function passwordField(form: FormData): string {
  const value = form.get('password');
  return typeof value === 'string' ? value : '';
}
