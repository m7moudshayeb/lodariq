'use client';

import Link from 'next/link';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { signIn, signUp } from '../lib/client-auth-api';
import type { AuthSessionSnapshot, EmailVerificationRequiredResponse } from '../lib/auth-contract';
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
        const response = await signUp({
          email,
          name: stringField(form, 'name'),
          workspaceName: stringField(form, 'workspaceName'),
        });
        setVerification({ email, response });
        return;
      }

      const session = await signIn({
        email: stringField(form, 'email'),
        password: passwordField(form),
      });
      await completeAuthentication(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Please try again.');
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
          <Label htmlFor={embedded ? 'activation-name' : 'name'}>Your name</Label>
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
        <Label htmlFor={embedded ? 'activation-email' : 'email'}>Email</Label>
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
            <Label htmlFor={embedded ? 'activation-password' : 'password'}>Password</Label>
            {showPasswordRecoveryLink ? (
              <Link
                className="text-xs font-semibold text-primary hover:underline"
                href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}
              >
                Set or reset password
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
          <Label htmlFor="workspaceName">Workspace</Label>
          <Input
            autoComplete="organization"
            disabled={pending}
            id="workspaceName"
            name="workspaceName"
            placeholder="Acme Product"
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Your shared home for experiences, environments, and releases.
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
          {pending ? 'Signing in' : ''}
        </span>
      )}

      <Button className="h-11 w-full" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" />
        )}
        {signUpMode ? 'Create account' : 'Continue'}
      </Button>

      {!embedded && (signUpMode || showSignUpLink) ? (
        <p className="text-center text-sm text-muted-foreground">
          {signUpMode ? 'Already have a Lodariq account?' : 'New to Lodariq?'}{' '}
          <Link
            className="font-semibold text-primary hover:underline"
            href={`${signUpMode ? '/sign-in' : '/sign-up'}?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {signUpMode ? 'Sign in' : 'Create an account'}
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
