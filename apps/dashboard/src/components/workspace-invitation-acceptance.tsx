'use client';

import Link from 'next/link';
import { ArrowRight, LoaderCircle, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react';
import { WORKSPACE_INVITATION_MESSAGES } from '../i18n/messages';
import { acceptWorkspaceInvitation, ClientAuthError } from '../lib/client-auth-api';
import { Button, buttonVariants } from './ui/button';

interface WorkspaceInvitationAcceptanceProps {
  invitationId: string;
}

type InvitationState = 'ready' | 'sign_in' | 'accepted' | 'unavailable';

export function WorkspaceInvitationAcceptance({
  invitationId,
}: WorkspaceInvitationAcceptanceProps): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<InvitationState>('ready');
  const fragmentRead = useRef(false);
  const { _ } = useLingui();

  useEffect(() => {
    if (fragmentRead.current) return;
    fragmentRead.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    setToken(fragment.get('token'));
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setTokenReady(true);
  }, []);

  async function accept(): Promise<void> {
    if (!token || pending) return;
    setPending(true);
    try {
      await acceptWorkspaceInvitation(invitationId, token);
      setState('accepted');
    } catch (error) {
      setState(
        error instanceof ClientAuthError && error.statusCode === 401 ? 'sign_in' : 'unavailable',
      );
    } finally {
      setPending(false);
    }
  }

  if (!tokenReady) {
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {_(WORKSPACE_INVITATION_MESSAGES.reading)}
      </p>
    );
  }

  if (!token || state === 'unavailable') {
    return (
      <div className="grid gap-4" role="alert">
        <p className="text-sm leading-6 text-muted-foreground">
          {_(
            token
              ? WORKSPACE_INVITATION_MESSAGES.unavailable
              : WORKSPACE_INVITATION_MESSAGES.incomplete,
          )}
        </p>
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/">
          {_(WORKSPACE_INVITATION_MESSAGES.openWorkspace)}
        </Link>
      </div>
    );
  }

  if (state === 'accepted') {
    return (
      <div className="grid gap-4" role="status">
        <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
          <UserPlus aria-hidden="true" className="size-5" />
        </div>
        <div className="grid gap-2">
          <h2 className="font-semibold text-foreground">
            {_(WORKSPACE_INVITATION_MESSAGES.accepted)}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {_(WORKSPACE_INVITATION_MESSAGES.acceptedHelp)}
          </p>
        </div>
        <Link className={buttonVariants({ className: 'h-11 w-full' })} href="/">
          {_(WORKSPACE_INVITATION_MESSAGES.openWorkspace)}
          <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {state === 'sign_in' ? (
        <div className="grid gap-3" role="alert">
          <p className="text-sm leading-6 text-muted-foreground">
            {_(WORKSPACE_INVITATION_MESSAGES.signInRequired)}
          </p>
          <Link
            className={buttonVariants({ className: 'h-11 w-full', variant: 'outline' })}
            href="/sign-in"
            rel="noopener noreferrer"
            target="_blank"
          >
            {_(WORKSPACE_INVITATION_MESSAGES.signInNewTab)}
          </Link>
        </div>
      ) : null}
      <span aria-live="polite" className="sr-only" role="status">
        {pending ? _(WORKSPACE_INVITATION_MESSAGES.accepting) : ''}
      </span>
      <Button
        className="h-11 w-full"
        disabled={pending}
        onClick={() => void accept()}
        type="button"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <UserPlus aria-hidden="true" />
        )}
        {_(
          pending ? WORKSPACE_INVITATION_MESSAGES.accepting : WORKSPACE_INVITATION_MESSAGES.accept,
        )}
      </Button>
    </div>
  );
}
