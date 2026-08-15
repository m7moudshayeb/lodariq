'use client';

import { useLingui } from '@lingui/react';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RECOVERY_CODE_MESSAGES } from '../i18n/messages';
import { signInWithRecoveryCode } from '../lib/client-auth-api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface RecoveryCodeFormProps {
  returnTo: string;
}

export function RecoveryCodeForm({ returnTo }: RecoveryCodeFormProps): React.ReactElement {
  const { _ } = useLingui();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get('identifier') ?? '').trim();
    const code = String(form.get('code') ?? '').trim();
    const rememberMe = form.get('rememberMe') === 'on';
    if (!identifier || !/^LQRC-(?:[A-Za-z0-9]{5}-){3}[A-Za-z0-9]{5}$/u.test(code)) {
      setError(_(RECOVERY_CODE_MESSAGES.invalid));
      event.currentTarget
        .querySelector<HTMLInputElement>(!identifier ? '#recovery-identifier' : '#recovery-code')
        ?.focus();
      return;
    }
    setPending(true);
    setError('');
    try {
      await signInWithRecoveryCode(identifier, code, rememberMe);
      window.location.replace(returnTo);
    } catch {
      setError(_(RECOVERY_CODE_MESSAGES.unavailable));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={(event) => void submit(event)}>
      <div className="grid gap-2">
        <Label htmlFor="recovery-identifier">{_(RECOVERY_CODE_MESSAGES.identifier)}</Label>
        <Input
          aria-invalid={error ? 'true' : undefined}
          autoCapitalize="none"
          autoComplete="username"
          disabled={pending}
          id="recovery-identifier"
          name="identifier"
          spellCheck={false}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="recovery-code">{_(RECOVERY_CODE_MESSAGES.code)}</Label>
        <Input
          aria-describedby="recovery-code-help recovery-code-error"
          aria-invalid={error ? 'true' : undefined}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          disabled={pending}
          id="recovery-code"
          name="code"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground" id="recovery-code-help">
          {_(RECOVERY_CODE_MESSAGES.codeHelp)}
        </p>
      </div>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          className="size-4 rounded border-border accent-primary"
          disabled={pending}
          name="rememberMe"
          type="checkbox"
        />
        {_(RECOVERY_CODE_MESSAGES.rememberMe)}
      </label>
      <p className="min-h-5 text-sm text-destructive" id="recovery-code-error" role="alert">
        {error}
      </p>
      <Button className="h-11 w-full" disabled={pending} type="submit">
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <KeyRound aria-hidden="true" />
        )}
        {_(pending ? RECOVERY_CODE_MESSAGES.submitting : RECOVERY_CODE_MESSAGES.submit)}
      </Button>
    </form>
  );
}
