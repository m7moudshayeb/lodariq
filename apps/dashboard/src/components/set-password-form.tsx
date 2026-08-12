'use client';

import Link from 'next/link';
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useLingui } from '@lingui/react';
import { useAuthMutations } from '../hooks/use-auth-mutations';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { ClientAuthError } from '../lib/client-auth-api';
import { authErrorMessageDescriptor } from '../i18n/error-messages';
import { AUTH_FORM_MESSAGES, AUTH_PAGE_MESSAGES } from '../i18n/messages';
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
  const auth = useAuthMutations();
  const { _ } = useLingui();

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
      setError(_(AUTH_FORM_MESSAGES.passwordsDoNotMatch));
      return;
    }

    setPending(true);
    try {
      const session = await auth.setPassword.mutateAsync({ challengeId, token, password });
      if (onAuthenticated) await onAuthenticated(session);
      else window.location.replace(returnTo);
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

  if (!tokenReady) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {_(AUTH_FORM_MESSAGES.readingSecureLink)}
      </p>
    );
  }

  if (!token) {
    return (
      <div className="grid gap-5">
        <p className="text-sm leading-6 text-muted-foreground">
          {_(AUTH_FORM_MESSAGES.incompletePasswordLink)}
        </p>
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/forgot-password">
          {_(AUTH_PAGE_MESSAGES.requestAnotherLink)}
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
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
        <Label htmlFor="new-password">{_(AUTH_FORM_MESSAGES.newPassword)}</Label>
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
        <p className="text-xs leading-5 text-muted-foreground">
          {_(AUTH_FORM_MESSAGES.passwordLength)}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">{_(AUTH_FORM_MESSAGES.confirmPassword)}</Label>
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
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        )}
        {_(AUTH_FORM_MESSAGES.savePassword)}
      </Button>
    </form>
  );
}

function passwordField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
