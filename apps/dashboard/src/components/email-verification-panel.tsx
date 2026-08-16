'use client';

import Link from 'next/link';
import { Check, KeyRound, LoaderCircle, MailCheck, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import { useResendCooldown } from '../hooks/use-resend-cooldown';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES } from '../i18n/messages';
import {
  focusFirstInvalidAuthField,
  hasAuthFieldErrors,
  validateAuthForm,
  withoutAuthFieldError,
  type AuthFieldErrors,
} from '../lib/auth-form-validation';
import { AuthField, AuthFormFeedback } from './auth-form-controls';
import { Button, buttonVariants } from './ui/button';

type VerificationPhase =
  | { name: 'ready' }
  | { name: 'verifying' }
  | { name: 'complete' }
  | { name: 'error'; message: string; invalidLink: boolean };

interface EmailVerificationPanelProps {
  challengeId?: string;
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
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [currentChallengeId, setCurrentChallengeId] = useState(challengeId ?? '');
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
      let invalidLink = false;
      try {
        session = await auth.verifyEmail.mutateAsync({
          challengeId: currentChallengeId,
          token,
          password,
        });
      } catch (caught) {
        invalidLink = caught instanceof ClientAuthError && caught.code === 'verification_invalid';
        failureMessage =
          caught instanceof ClientAuthError
            ? _(authErrorMessageDescriptor(caught.code, caught.statusCode))
            : _(AUTH_FORM_MESSAGES.invalidVerificationLink);
      }

      if (!session) {
        verificationStarted.current = false;
        setPhase({ name: 'error', message: failureMessage, invalidLink });
        return;
      }

      setPhase({ name: 'complete' });
      if (onVerified) {
        await onVerified(session);
        return;
      }
      window.setTimeout(() => window.location.replace(returnTo), 650);
    },
    [_, auth.verifyEmail, currentChallengeId, onVerified, returnTo],
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
    const validation = validateAuthForm(event.currentTarget, ['password', 'passwordConfirmation'], {
      confirmPassword: true,
    });
    if (hasAuthFieldErrors(validation.errors)) {
      setFieldErrors(validation.errors);
      setPhase({ name: 'ready' });
      focusFirstInvalidAuthField(
        event.currentTarget,
        ['password', 'passwordConfirmation'],
        validation.errors,
      );
      return;
    }
    setFieldErrors({});
    void verifyToken(verificationToken, validation.values.password);
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

  if (phase.name === 'error' && phase.invalidLink) {
    return (
      <div className="grid gap-5">
        <div className="grid gap-2" role="alert">
          <h2 className="font-semibold text-foreground">
            {_(AUTH_FORM_MESSAGES.verificationLinkUnavailable)}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {_(AUTH_FORM_MESSAGES.verificationLinkUnavailableHelp)}
          </p>
        </div>
        {email ? (
          <VerificationResendControls
            email={email}
            onDevelopmentReplacement={(replacement) => {
              setCurrentChallengeId(replacement.challengeId);
              setVerificationToken(replacement.verificationToken);
              setPhase({ name: 'ready' });
            }}
          />
        ) : (
          <Link
            className={buttonVariants({ className: 'h-11 w-full' })}
            href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {_(AUTH_FORM_MESSAGES.restartVerification)}
          </Link>
        )}
        {onRestart ? (
          <Button onClick={onRestart} type="button" variant="ghost">
            <RotateCcw aria-hidden="true" />
            {_(AUTH_FORM_MESSAGES.useAnotherEmail)}
          </Button>
        ) : null}
      </div>
    );
  }

  if (readTokenFromFragment && !verificationToken) {
    return (
      <div className="grid gap-5" role="alert">
        <p className="text-sm leading-6 text-muted-foreground">
          {_(AUTH_FORM_MESSAGES.incompleteVerificationLink)}
        </p>
        <Link
          className={buttonVariants({ className: 'h-11 w-full' })}
          href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
        >
          {_(AUTH_FORM_MESSAGES.restartVerification)}
        </Link>
      </div>
    );
  }

  if (verificationToken) {
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
        onSubmit={submit}
      >
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
        <AuthField
          autoComplete="new-password"
          error={fieldErrors.password}
          help={_(AUTH_FORM_MESSAGES.passwordLength)}
          id="verification-password"
          name="password"
        />
        <AuthField
          autoComplete="new-password"
          error={fieldErrors.passwordConfirmation}
          id="verification-password-confirmation"
          name="passwordConfirmation"
        />
        <AuthFormFeedback
          fieldErrors={fieldErrors}
          formError={phase.name === 'error' ? phase.message : undefined}
        />
        <Button className="h-11 w-full" disabled={verificationStarted.current} type="submit">
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
      {email ? (
        <VerificationResendControls
          email={email}
          onDevelopmentReplacement={(replacement) => {
            setCurrentChallengeId(replacement.challengeId);
            setVerificationToken(replacement.verificationToken);
          }}
        />
      ) : null}
    </div>
  );
}

function clearLocationFragment(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function VerificationResendControls({
  email,
  onDevelopmentReplacement,
}: {
  email: string;
  onDevelopmentReplacement: (replacement: {
    challengeId: string;
    verificationToken: string;
  }) => void;
}): React.ReactElement {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const { remainingSeconds, restart } = useResendCooldown();
  const auth = useAuthMutations();
  const { _ } = useLingui();

  async function resend(): Promise<void> {
    if (pending || remainingSeconds > 0) return;
    setError('');
    setNotice('');
    setPending(true);
    try {
      const response = await auth.resendEmailVerification.mutateAsync(email);
      if ('challengeId' in response && 'verificationToken' in response) {
        onDevelopmentReplacement(response);
      }
      setNotice(_(AUTH_FORM_MESSAGES.verificationRequestAccepted));
      restart();
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

  return (
    <div className="grid gap-3">
      {error ? <AuthFormFeedback fieldErrors={{}} formError={error} /> : null}
      <Button
        disabled={pending || remainingSeconds > 0}
        onClick={() => void resend()}
        type="button"
        variant="outline"
      >
        {remainingSeconds > 0
          ? _({ ...AUTH_FORM_MESSAGES.requestAgainIn, values: { seconds: remainingSeconds } })
          : _(AUTH_FORM_MESSAGES.requestAnotherVerification)}
      </Button>
      <p aria-live="polite" className="text-xs leading-5 text-muted-foreground" role="status">
        {pending ? _(AUTH_FORM_MESSAGES.requestingVerification) : notice}
      </p>
    </div>
  );
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
