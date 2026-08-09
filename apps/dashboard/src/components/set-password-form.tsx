'use client';

import Link from 'next/link';
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { setPassword } from '../lib/client-auth-api';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { Button, buttonVariants } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

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
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const nextToken = fragment.get('token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setToken(nextToken);
    setTokenReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || !token) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const password = passwordField(form, 'password');
    const confirmation = passwordField(form, 'passwordConfirmation');
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setPending(true);
    try {
      const session = await setPassword(challengeId, token, password);
      if (onAuthenticated) await onAuthenticated(session);
      else window.location.replace(returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (!tokenReady) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        Reading your secure link…
      </p>
    );
  }

  if (!token) {
    return (
      <div className="grid gap-5">
        <p className="text-sm leading-6 text-muted-foreground">
          This password link is incomplete. Request a new link to continue.
        </p>
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/forgot-password">
          Request another link
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
      <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
        <KeyRound aria-hidden="true" className="size-5" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          autoComplete="new-password"
          disabled={pending}
          id="new-password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
        <p className="text-xs leading-5 text-muted-foreground">Use 12 to 128 characters.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          autoComplete="new-password"
          disabled={pending}
          id="confirm-password"
          maxLength={128}
          minLength={12}
          name="passwordConfirmation"
          required
          type="password"
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
        Save password and continue
      </Button>
    </form>
  );
}

function passwordField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
