'use client';

import { Check, KeyRound, LoaderCircle, MailCheck, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES } from '../i18n/messages';
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
  const fragmentRead = useRef(false);
  const exposedDevelopmentToken =
    process.env.NODE_ENV === 'production' ? undefined : developmentToken;
  const [verificationToken, setVerificationToken] = useState<string | null>(
    exposedDevelopmentToken ?? null,
  );
  const [tokenReady, setTokenReady] = useState(!readTokenFromFragment);
  const auth = useAuthMutations();
  const { _, i18n } = useLingui();

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
          caught instanceof ClientAuthError
            ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
            : _(AUTH_FORM_MESSAGES.invalidVerificationLink);
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
    [_, auth.verifyEmail, challengeId, onVerified, returnTo],
  );

  useEffect(() => {
    if (!readTokenFromFragment) {
      setTokenReady(true);
      return;
    }
    if (fragmentRead.current) return;
    fragmentRead.current = true;
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
      setPhase({ name: 'error', message: _(AUTH_FORM_MESSAGES.passwordsDoNotMatch) });
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
            {complete ? _(AUTH_FORM_MESSAGES.emailVerified) : _(AUTH_FORM_MESSAGES.verifyingEmail)}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {complete ? _(AUTH_FORM_MESSAGES.openingWorkspace) : _(AUTH_FORM_MESSAGES.moment)}
          </p>
        </div>
      </div>
    );
  }

  if (!tokenReady) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {_(AUTH_FORM_MESSAGES.readingVerificationLink)}
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
            {_(AUTH_FORM_MESSAGES.choosePassword)}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {_(AUTH_FORM_MESSAGES.choosePasswordHelp)}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="verification-password">{_(AUTH_FORM_MESSAGES.newPassword)}</Label>
          <Input
            autoComplete="new-password"
            id="verification-password"
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            {_(AUTH_FORM_MESSAGES.passwordLength)}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="verification-password-confirmation">
            {_(AUTH_FORM_MESSAGES.confirmPassword)}
          </Label>
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
          {_(AUTH_FORM_MESSAGES.verifyAndContinue)}
        </Button>
        {onRestart ? (
          <Button onClick={onRestart} type="button" variant="ghost">
            <RotateCcw aria-hidden="true" />
            {_(AUTH_FORM_MESSAGES.useAnotherEmail)}
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
          <h2 className="font-semibold text-foreground">{_(AUTH_FORM_MESSAGES.checkEmail)}</h2>
          <p className="text-sm leading-6">
            {email
              ? _({ ...AUTH_FORM_MESSAGES.verificationSent, values: { email } })
              : _(AUTH_FORM_MESSAGES.openVerificationLink)}
          </p>
          {expiresAt ? (
            <p className="text-xs opacity-80">
              {_({
                ...AUTH_FORM_MESSAGES.linkExpires,
                values: {
                  expiry: formatExpiry(expiresAt, i18n.locale, _(AUTH_FORM_MESSAGES.soon)),
                },
              })}
            </p>
          ) : null}
        </div>
      </div>

      {onRestart ? (
        <Button onClick={onRestart} type="button" variant="ghost">
          <RotateCcw aria-hidden="true" />
          {_(AUTH_FORM_MESSAGES.useAnotherEmail)}
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

function formatExpiry(value: string, locale: string, invalidFallback: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return invalidFallback;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      timeZone: 'UTC',
      timeZoneName: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', {
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      timeZone: 'UTC',
      timeZoneName: 'short',
      year: 'numeric',
    }).format(date);
  }
}
