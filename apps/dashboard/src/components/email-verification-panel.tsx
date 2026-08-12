'use client';

import { Check, KeyRound, LoaderCircle, MailCheck, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

type VerificationPhase =
  | { name: 'ready' }
  | { name: 'verifying' }
  | { name: 'complete' }
  | { name: 'error'; message: string };

interface EmailVerificationPanelProps {
  challengeId: string;
  email?: string;
  expiresAt?: string;
  developmentToken?: string;
  readTokenFromFragment?: boolean;
  returnTo?: string;
  onVerified?: (session: AuthSessionSnapshot) => void | Promise<void>;
  onRestart?: () => void;
}

export function EmailVerificationPanel({
  challengeId,
  email,
  expiresAt,
  developmentToken,
  readTokenFromFragment = false,
  returnTo = '/',
  onVerified,
  onRestart,
}: EmailVerificationPanelProps): React.ReactElement {
  const [phase, setPhase] = useState<VerificationPhase>({ name: 'ready' });
  const verificationStarted = useRef(false);
  const exposedDevelopmentToken =
    process.env.NODE_ENV === 'production' ? undefined : developmentToken;
  const [verificationToken, setVerificationToken] = useState<string | null>(
    exposedDevelopmentToken ?? null,
  );
  const [tokenReady, setTokenReady] = useState(!readTokenFromFragment);
  const auth = useAuthMutations();

  const verifyToken = useCallback(
    async (token: string, password: string): Promise<void> => {
      if (verificationStarted.current) return;
      verificationStarted.current = true;
      setPhase({ name: 'verifying' });

      let session: AuthSessionSnapshot | null = null;
      let failureMessage = '';
      try {
        session = await auth.verifyEmail.mutateAsync({ challengeId, token, password });
      } catch (caught) {
        failureMessage =
          caught instanceof Error ? caught.message : 'The verification link is invalid or expired.';
      }

      if (!session) {
        verificationStarted.current = false;
        setPhase({ name: 'error', message: failureMessage });
        return;
      }

      setPhase({ name: 'complete' });
      if (onVerified) {
        await onVerified(session);
        return;
      }
      window.setTimeout(() => window.location.replace(returnTo), 650);
    },
    [auth.verifyEmail, challengeId, onVerified, returnTo],
  );

  useEffect(() => {
    if (!readTokenFromFragment) {
      setTokenReady(true);
      return;
    }
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    clearLocationFragment();
    setVerificationToken(token);
    setTokenReady(true);
  }, [readTokenFromFragment]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!verificationToken || verificationStarted.current) return;
    const form = new FormData(event.currentTarget);
    const password = passwordField(form, 'password');
    const confirmation = passwordField(form, 'passwordConfirmation');
    if (password !== confirmation) {
      setPhase({ name: 'error', message: 'Passwords do not match.' });
      return;
    }
    void verifyToken(verificationToken, password);
  }

  if (phase.name === 'verifying' || phase.name === 'complete') {
    const complete = phase.name === 'complete';
    return (
      <div className="grid gap-4 rounded-xl border border-border bg-[var(--surface-subtle)] p-5 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--success-bg)] text-[var(--success-fg)]">
          {complete ? (
            <Check aria-hidden="true" className="size-5" />
          ) : (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          )}
        </span>
        <div className="grid gap-1">
          <h2 className="[font-family:Georgia,serif] text-2xl tracking-[-0.02em]">
            {complete ? 'Email verified' : 'Verifying your email'}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {complete ? 'Opening your Lodariq workspace…' : 'This should only take a moment.'}
          </p>
        </div>
      </div>
    );
  }

  if (!tokenReady) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Reading your secure verification link…
      </p>
    );
  }

  if (verificationToken) {
    return (
      <form className="grid gap-5" onSubmit={submit}>
        <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
          <KeyRound aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-1">
          <h2 className="[font-family:Georgia,serif] text-2xl tracking-[-0.02em]">
            Choose your password
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Your email link proved ownership. Choose the password that will protect this account.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="verification-password">New password</Label>
          <Input
            autoComplete="new-password"
            id="verification-password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <p className="text-xs leading-5 text-muted-foreground">Use 12 to 128 characters.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="verification-password-confirmation">Confirm password</Label>
          <Input
            autoComplete="new-password"
            id="verification-password-confirmation"
            maxLength={128}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
        </div>
        {phase.name === 'error' ? (
          <p
            className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-fg)]"
            role="alert"
          >
            {phase.message}
          </p>
        ) : null}
        <Button className="h-11 w-full" type="submit">
          <Check aria-hidden="true" />
          Verify email and continue
        </Button>
        {onRestart ? (
          <Button onClick={onRestart} type="button" variant="ghost">
            <RotateCcw aria-hidden="true" />
            Use another email
          </Button>
        ) : null}
      </form>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-xl border border-[var(--info-border)] bg-[var(--info-bg)] p-4 text-[var(--info-fg)]">
        <MailCheck aria-hidden="true" className="size-5" />
        <div className="grid gap-1">
          <h2 className="font-semibold text-foreground">Check your email</h2>
          <p className="text-sm leading-6">
            {email
              ? `We sent a secure verification link to ${email}. Keep this page open or use the link directly.`
              : 'Open the complete verification link from your email, then choose the password for your account.'}
          </p>
          {expiresAt ? (
            <p className="text-xs opacity-80">The link expires {formatExpiry(expiresAt)}.</p>
          ) : null}
        </div>
      </div>

      {onRestart ? (
        <Button onClick={onRestart} type="button" variant="ghost">
          <RotateCcw aria-hidden="true" />
          Use another email
        </Button>
      ) : null}
    </div>
  );
}

function clearLocationFragment(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function passwordField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  const formatted = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
  return `${formatted} UTC`;
}
