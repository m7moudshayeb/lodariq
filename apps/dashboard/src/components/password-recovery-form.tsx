'use client';

import Link from 'next/link';
import { ArrowRight, LoaderCircle, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import { useResendCooldown } from '../hooks/use-resend-cooldown';
import type { PasswordRecoveryAcceptedResponse } from '../lib/auth-contract';
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
import { Button } from './ui/button';

interface PasswordRecoveryFormProps {
  returnTo?: string;
}

export function PasswordRecoveryForm({
  returnTo = '/',
}: PasswordRecoveryFormProps): React.ReactElement {
  const [accepted, setAccepted] = useState<{
    email: string;
    response: PasswordRecoveryAcceptedResponse;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const auth = useAuthMutations();
  const { _ } = useLingui();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const validation = validateAuthForm(event.currentTarget, ['email']);
    if (hasAuthFieldErrors(validation.errors)) {
      setError('');
      setFieldErrors(validation.errors);
      focusFirstInvalidAuthField(event.currentTarget, ['email'], validation.errors);
      return;
    }
    setError('');
    setFieldErrors({});
    setPending(true);
    try {
      const email = validation.values.email;
      const response = await auth.requestPasswordRecovery.mutateAsync(email);
      setAccepted({ email, response });
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

  if (accepted) {
    return (
      <PasswordRecoveryAcceptedState
        accepted={accepted}
        onChangeEmail={() => setAccepted(null)}
        returnTo={returnTo}
      />
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
      <AuthField
        disabled={pending}
        error={fieldErrors.email}
        id="recovery-email"
        name="email"
        placeholder="you@company.com"
      />
      <AuthFormFeedback fieldErrors={fieldErrors} formError={error} />
      <span aria-live="polite" className="sr-only" role="status">
        {pending ? _(AUTH_FORM_MESSAGES.requestingSecureLink) : ''}
      </span>
      <Button className="h-11 w-full" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        )}
        {_(AUTH_FORM_MESSAGES.emailSecureLink)}
      </Button>
      <Link
        className="text-center text-sm font-semibold text-primary hover:underline"
        href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
      >
        {_(AUTH_PAGE_MESSAGES.returnToSignIn)}
      </Link>
    </form>
  );
}

function PasswordRecoveryAcceptedState({
  accepted,
  onChangeEmail,
  returnTo,
}: {
  accepted: { email: string; response: PasswordRecoveryAcceptedResponse };
  onChangeEmail: () => void;
  returnTo: string;
}): React.ReactElement {
  const [response, setResponse] = useState(accepted.response);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const { remainingSeconds, restart } = useResendCooldown();
  const auth = useAuthMutations();
  const { _ } = useLingui();
  const developmentLink = createDevelopmentResetLink(response, returnTo);

  async function resend(): Promise<void> {
    if (pending || remainingSeconds > 0) return;
    setError('');
    setPending(true);
    try {
      setResponse(await auth.requestPasswordRecovery.mutateAsync(accepted.email));
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
    <div className="grid gap-5">
      <div className="grid size-11 place-items-center rounded-xl bg-[var(--success-bg)] text-[var(--success-fg)]">
        <MailCheck aria-hidden="true" className="size-5" />
      </div>
      <div className="grid gap-2">
        <h2 className="[font-family:Georgia,serif] text-2xl tracking-[-0.02em]">
          {_(AUTH_FORM_MESSAGES.requestAccepted)}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {_(AUTH_FORM_MESSAGES.recoveryRequestAccepted)}
        </p>
      </div>
      {developmentLink ? (
        <Button
          className="h-11 w-full"
          onClick={() => window.location.assign(developmentLink)}
          type="button"
        >
          {_(AUTH_FORM_MESSAGES.openLocalRecoveryLink)}
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        </Button>
      ) : null}
      {error ? <AuthFormFeedback fieldErrors={{}} formError={error} /> : null}
      <Button
        disabled={pending || remainingSeconds > 0}
        onClick={() => void resend()}
        type="button"
        variant="outline"
      >
        {remainingSeconds > 0
          ? _({ ...AUTH_FORM_MESSAGES.requestAgainIn, values: { seconds: remainingSeconds } })
          : _(AUTH_FORM_MESSAGES.requestAnotherLink)}
      </Button>
      <span aria-live="polite" className="sr-only" role="status">
        {pending ? _(AUTH_FORM_MESSAGES.requestingSecureLink) : ''}
      </span>
      <Button onClick={onChangeEmail} type="button" variant="ghost">
        {_(AUTH_FORM_MESSAGES.useAnotherEmail)}
      </Button>
    </div>
  );
}

function createDevelopmentResetLink(
  response: PasswordRecoveryAcceptedResponse,
  returnTo: string,
): string | null {
  if (!('challengeId' in response) || !('resetToken' in response)) return null;
  const query = new URLSearchParams({ challenge: response.challengeId, returnTo });
  return `/reset-password?${query.toString()}#token=${encodeURIComponent(response.resetToken)}`;
}
