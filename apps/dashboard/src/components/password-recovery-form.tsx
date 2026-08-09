'use client';

import Link from 'next/link';
import { ArrowRight, LoaderCircle, MailCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { requestPasswordRecovery } from '../lib/client-auth-api';
import type { PasswordRecoveryAcceptedResponse } from '../lib/auth-contract';
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

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    try {
      setAccepted(await requestPasswordRecovery(typeof email === 'string' ? email.trim() : ''));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Please try again.');
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
            Check your email
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            If that address belongs to a Lodariq account, the newest message contains a secure
            password link. It expires shortly and works once.
          </p>
        </div>
        {developmentLink ? (
          <Button
            className="h-11 w-full"
            onClick={() => window.location.assign(developmentLink)}
            type="button"
          >
            Open local recovery link
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : null}
        <Button onClick={() => setAccepted(null)} type="button" variant="outline">
          Use another email
        </Button>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor="recovery-email">Email</Label>
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
          <ArrowRight aria-hidden="true" />
        )}
        Email a secure link
      </Button>
      <Link
        className="text-center text-sm font-semibold text-primary hover:underline"
        href="/sign-in"
      >
        Return to sign in
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
