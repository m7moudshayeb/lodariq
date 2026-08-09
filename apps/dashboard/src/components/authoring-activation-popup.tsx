'use client';

import { Check, LoaderCircle, LogIn, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthSessionSnapshot } from '../lib/auth-contract';
import { AuthForm } from './auth-form';
import { Button } from './ui/button';

const ACTIVATION_PROTOCOL = 'lodariq.authoring.activation.v1';

interface ActivationRequestMessage {
  protocol: typeof ACTIVATION_PROTOCOL;
  type: 'authoring.activation.request';
  requestId: string;
  state: string;
}

interface ActivationHandshake {
  message: ActivationRequestMessage;
  openerOrigin: string;
}

interface PendingActivation {
  requestId: string;
  state: string;
  customerOrigin: string;
  environment: 'development' | 'staging';
  expiresAt: string;
  documentIntent?:
    { kind: 'existing'; documentId: string } | { kind: 'new-draft'; documentType: 'tour' };
}

interface AuthorizationResult {
  protocol: typeof ACTIVATION_PROTOCOL;
  type: 'authoring.authorization.result';
  requestId: string;
  state: string;
  authorizationCode: string;
  expiresAt: string;
}

type ActivationState =
  | { name: 'waiting' }
  | { name: 'loading'; handshake: ActivationHandshake }
  | { name: 'authentication'; handshake: ActivationHandshake }
  | { name: 'ready'; request: PendingActivation }
  | { name: 'approving'; request: PendingActivation }
  | { name: 'complete' }
  | { name: 'error'; message: string };

export function AuthoringActivationPopup({
  passwordRecoveryEnabled,
}: {
  passwordRecoveryEnabled: boolean;
}): React.ReactElement {
  const [state, setState] = useState<ActivationState>({ name: 'waiting' });
  const activeHandshake = useRef<ActivationHandshake | null>(null);

  const inspect = useCallback(async (handshake: ActivationHandshake): Promise<void> => {
    setState({ name: 'loading', handshake });
    try {
      const response = await fetch('/authoring/activate/request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'inspect', requestId: handshake.message.requestId }),
      });
      if (activeHandshake.current !== handshake) return;
      if (response.status === 401) {
        setState({ name: 'authentication', handshake });
        return;
      }
      if (!response.ok) throw new Error('request_unavailable');

      const context = (await response.json()) as Partial<PendingActivation>;
      if (
        context.requestId !== handshake.message.requestId ||
        context.customerOrigin !== handshake.openerOrigin ||
        (context.environment !== 'development' && context.environment !== 'staging') ||
        typeof context.expiresAt !== 'string'
      ) {
        throw new Error('request_mismatch');
      }

      setState({
        name: 'ready',
        request: {
          requestId: handshake.message.requestId,
          state: handshake.message.state,
          customerOrigin: handshake.openerOrigin,
          environment: context.environment,
          expiresAt: context.expiresAt,
          ...(context.documentIntent ? { documentIntent: context.documentIntent } : {}),
        },
      });
    } catch {
      if (activeHandshake.current !== handshake) return;
      setState({
        name: 'error',
        message:
          'This authoring request is unavailable or expired. Return to the launcher and retry.',
      });
    }
  }, []);

  useEffect(() => {
    if (!window.opener) {
      setState({
        name: 'error',
        message: 'Open authoring from the Lodariq launcher inside your application.',
      });
      return;
    }

    const receiveRequest = (event: MessageEvent<unknown>): void => {
      if (event.source !== window.opener || !isExactHttpOrigin(event.origin)) return;
      const message = parseActivationRequest(event.data);
      if (!message) return;

      const current = activeHandshake.current;
      if (
        current?.message.requestId === message.requestId &&
        current.message.state === message.state &&
        current.openerOrigin === event.origin
      ) {
        return;
      }

      const handshake = { message, openerOrigin: event.origin };
      activeHandshake.current = handshake;
      void inspect(handshake);
    };

    window.addEventListener('message', receiveRequest);
    return () => window.removeEventListener('message', receiveRequest);
  }, [inspect]);

  const resumeAfterSignIn = useCallback(
    async (_session: AuthSessionSnapshot, handshake: ActivationHandshake): Promise<void> => {
      if (activeHandshake.current !== handshake) return;
      await inspect(handshake);
    },
    [inspect],
  );

  const approve = useCallback(async (request: PendingActivation): Promise<void> => {
    setState({ name: 'approving', request });
    try {
      const response = await fetch('/authoring/activate/request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          requestId: request.requestId,
          state: request.state,
        }),
      });
      if (!response.ok) throw new Error('approval_failed');
      const result = (await response.json()) as unknown;
      if (!isAuthorizationResult(result, request)) throw new Error('approval_failed');
      if (!window.opener) throw new Error('opener_closed');

      window.opener.postMessage(result, request.customerOrigin);
      setState({ name: 'complete' });
      window.setTimeout(() => window.close(), 350);
    } catch {
      setState({
        name: 'error',
        message: 'Authoring could not be approved. Return to the launcher and try again.',
      });
    }
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full max-w-md gap-5 rounded-2xl border border-border bg-card p-6 shadow-[0_22px_70px_rgba(30,55,47,.16)]">
        <header className="flex items-start justify-between gap-4">
          <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </div>
          <button
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => window.close()}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </header>

        <ActivationContent
          onApprove={approve}
          onAuthenticated={resumeAfterSignIn}
          passwordRecoveryEnabled={passwordRecoveryEnabled}
          state={state}
        />
      </section>
    </main>
  );
}

function ActivationContent({
  state,
  onApprove,
  onAuthenticated,
  passwordRecoveryEnabled,
}: {
  state: ActivationState;
  onApprove: (request: PendingActivation) => Promise<void>;
  onAuthenticated: (session: AuthSessionSnapshot, handshake: ActivationHandshake) => Promise<void>;
  passwordRecoveryEnabled: boolean;
}): React.ReactElement {
  if (state.name === 'authentication') {
    return (
      <div className="grid gap-5">
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
          <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">
            Sign in, then continue
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Sign in here. This window will resume the same secure authoring request automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--info-border)] bg-[var(--info-bg)] px-3 py-2 text-xs text-[var(--info-fg)]">
          <LogIn aria-hidden="true" className="size-4 shrink-0" />
          Your credentials stay inside Lodariq and are never sent to the customer page.
        </div>
        <AuthForm
          embedded
          mode="sign-in"
          onAuthenticated={(session) => onAuthenticated(session, state.handshake)}
          returnTo="/authoring/activate"
          showPasswordRecoveryLink={false}
        />
        {passwordRecoveryEnabled ? (
          <div className="grid gap-1 rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-2 text-xs leading-5 text-muted-foreground">
            <span>Need to set or reset your password?</span>
            <a
              className="font-semibold text-primary hover:underline"
              href="/forgot-password?returnTo=%2Fsign-in"
              rel="noopener noreferrer"
              target="_blank"
            >
              Open password recovery in a new tab
            </a>
            <span>Finish there, then close this window and start authoring again.</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (state.name === 'ready' || state.name === 'approving') {
    const { request } = state;
    return (
      <>
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
          <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">
            Author in this application?
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Allow your Lodariq workspace to create and edit Tours on{' '}
            <strong className="font-medium text-foreground">
              {hostLabel(request.customerOrigin)}
            </strong>
            .
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-border bg-[var(--surface-subtle)] p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Environment</span>
            <span className="font-medium capitalize">{request.environment}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Experience</span>
            <span className="font-medium">{intentLabel(request.documentIntent)}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <Button disabled={state.name === 'approving'} onClick={() => void onApprove(request)}>
            {state.name === 'approving' ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-4" />
            )}
            Continue to authoring
          </Button>
          <Button onClick={() => window.close()} variant="outline">
            Cancel
          </Button>
        </div>
      </>
    );
  }

  const copy = activationStateCopy(state);
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
        <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">{copy.title}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{copy.description}</p>
      </div>
      {state.name === 'loading' || state.name === 'waiting' ? (
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-primary" />
      ) : null}
      {state.name === 'complete' ? (
        <Check aria-hidden="true" className="size-6 text-primary" />
      ) : null}
      {state.name === 'error' ? (
        <Button onClick={() => window.close()} variant="outline">
          Close
        </Button>
      ) : null}
    </div>
  );
}

function parseActivationRequest(value: unknown): ActivationRequestMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<ActivationRequestMessage>;
  const exactKeys = ['protocol', 'type', 'requestId', 'state'];
  if (Object.keys(value).some((key) => !exactKeys.includes(key))) return null;
  if (
    message.protocol !== ACTIVATION_PROTOCOL ||
    message.type !== 'authoring.activation.request' ||
    typeof message.requestId !== 'string' ||
    !message.requestId ||
    typeof message.state !== 'string' ||
    message.state.length < 32
  ) {
    return null;
  }
  return message as ActivationRequestMessage;
}

function isAuthorizationResult(
  value: unknown,
  request: PendingActivation,
): value is AuthorizationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<AuthorizationResult>;
  const exactKeys = ['protocol', 'type', 'requestId', 'state', 'authorizationCode', 'expiresAt'];
  return (
    Object.keys(value).every((key) => exactKeys.includes(key)) &&
    exactKeys.every((key) => key in value) &&
    result.protocol === ACTIVATION_PROTOCOL &&
    result.type === 'authoring.authorization.result' &&
    result.requestId === request.requestId &&
    result.state === request.state &&
    typeof result.authorizationCode === 'string' &&
    result.authorizationCode.length >= 32 &&
    typeof result.expiresAt === 'string'
  );
}

function isExactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

function activationStateCopy(state: ActivationState): { title: string; description: string } {
  if (state.name === 'complete') {
    return { title: 'Authoring approved', description: 'Returning you to the application…' };
  }
  if (state.name === 'error') return { title: 'Could not continue', description: state.message };
  if (state.name === 'loading') {
    return { title: 'Checking access', description: 'Verifying the application and workspace…' };
  }
  return {
    title: 'Ready to connect',
    description: 'Keep this window open while the Lodariq launcher completes the secure handoff.',
  };
}

function hostLabel(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return 'this application';
  }
}

function intentLabel(intent: PendingActivation['documentIntent']): string {
  if (!intent || intent.kind === 'new-draft') return 'New Tour';
  return 'Existing Tour';
}
