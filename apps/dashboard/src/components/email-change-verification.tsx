'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { userFacingClientError, verifyEmailChange } from '../lib/client-auth-api';
import { buttonVariants } from './ui/button';
import { StatusBanner } from './ui/status-banner';

const COPY = {
  reading: msg({ id: 'account.emailChange.reading', message: 'Reading the secure link…' }),
  verifying: msg({ id: 'account.emailChange.verifying', message: 'Verifying this address…' }),
  recorded: msg({
    id: 'account.emailChange.recorded',
    message:
      'This address is confirmed. Open the verification link sent to the other address to finish.',
  }),
  completed: msg({
    id: 'account.emailChange.completed',
    message: 'Your sign-in email has been changed. Other sessions and recovery links were revoked.',
  }),
  invalid: msg({
    id: 'account.emailChange.invalid',
    message: 'This link is incomplete, expired, already used, or was replaced.',
  }),
  account: msg({ id: 'account.emailChange.account', message: 'Return to account security' }),
  signIn: msg({ id: 'account.emailChange.signIn', message: 'Sign in' }),
} as const;

interface EmailChangeVerificationProps {
  challengeId: string;
  proof: 'current_email' | 'new_email';
}

type Phase = 'reading' | 'verifying' | 'recorded' | 'completed' | 'error';

export function EmailChangeVerification({
  challengeId,
  proof,
}: EmailChangeVerificationProps): React.ReactElement {
  const { _ } = useLingui();
  const [phase, setPhase] = useState<Phase>('reading');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    if (!token) {
      setPhase('error');
      setMessage(_(COPY.invalid));
      return;
    }
    setPhase('verifying');
    void verifyEmailChange(challengeId, proof, token)
      .then((result) => {
        setPhase(result.status === 'completed' ? 'completed' : 'recorded');
      })
      .catch((error: unknown) => {
        setPhase('error');
        setMessage(userFacingClientError(error, _(COPY.invalid)));
      });
  }, [_, challengeId, proof]);

  if (phase === 'reading' || phase === 'verifying') {
    return (
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {_(phase === 'reading' ? COPY.reading : COPY.verifying)}
      </p>
    );
  }
  const successful = phase === 'recorded' || phase === 'completed';
  return (
    <div className="grid gap-5">
      <StatusBanner
        kind={successful ? 'success' : 'error'}
        title={successful ? _(phase === 'completed' ? COPY.completed : COPY.recorded) : message}
      />
      <Link
        className={buttonVariants({ className: 'h-11 w-full' })}
        href={successful ? '/account' : '/sign-in?returnTo=%2Faccount'}
      >
        {_(successful ? COPY.account : COPY.signIn)}
      </Link>
    </div>
  );
}
