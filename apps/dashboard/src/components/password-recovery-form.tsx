'use client';

import Link from 'next/link';
import { ArrowRight, LoaderCircle, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import type { PasswordRecoveryAcceptedResponse } from '../lib/auth-contract';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES, AUTH_PAGE_MESSAGES } from '../i18n/messages';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface PasswordRecoveryFormProps {
  returnTo?: string;
}

export function PasswordRecoveryForm({
  returnTo = '/',
}: PasswordRecoveryFormProps): React.ReactElement {
  const [accepted, setAccepted] = useState<PasswordRecoveryAcceptedResponse | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const auth = useAuthMutations();
  const { _ } = useLingui();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    try {
      setAccepted(
        await auth.requestPasswordRecovery.mutateAsync(
          typeof email === 'string' ? email.trim() : '',
        ),
      );
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
    const developmentLink = createDevelopmentResetLink(accepted, returnTo);
    return (
      <div className="grid gap-5">
        <div className="grid size-11 place-items-center rounded-xl bg-[var(--success-bg)] text-[var(--success-fg)]">
          <MailCheck aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-2">
          <h2 className="[font-family:Georgia,serif] text-2xl tracking-[-0.02em]">
            {_(AUTH_FORM_MESSAGES.checkEmail)}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {_(AUTH_FORM_MESSAGES.recoveryEmailSent)}
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
        <Button onClick={() => setAccepted(null)} type="button" variant="outline">
          {_(AUTH_FORM_MESSAGES.useAnotherEmail)}
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor="recovery-email">{_(AUTH_FORM_MESSAGES.email)}</Label>
        <Input
          autoCapitalize="none"
          autoComplete="email"
          disabled={pending}
          id="recovery-email"
          inputMode="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
      </div>
      {error ? (
        <p
          className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-fg)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
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
        href="/sign-in"
      >
        {_(AUTH_PAGE_MESSAGES.returnToSignIn)}
      </Link>
    </form>
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
