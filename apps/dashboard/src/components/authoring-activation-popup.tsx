'use client';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { resolveClientLocale } from '@lodariq/i18n';
import { Check, LoaderCircle, LogIn, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthoringActivation, type PendingActivation } from '../hooks/use-authoring-activation';
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

type ActivationState =
  | { name: 'waiting' }
  | { name: 'loading'; handshake: ActivationHandshake }
  | { name: 'authentication'; handshake: ActivationHandshake }
  | { name: 'ready'; request: PendingActivation }
  | { name: 'approving'; request: PendingActivation }
  | { name: 'complete' }
  | { name: 'error'; message: string };

type Translate = ReturnType<typeof useLingui>['_'];

const COPY = {
  requestExpired: msg({
    id: 'dashboard.activation.requestExpired',
    message: 'This authoring request is unavailable or expired. Return to the launcher and retry.',
  }),
  openFromLauncher: msg({
    id: 'dashboard.activation.openFromLauncher',
    message: 'Open authoring from the Lodariq launcher inside your application.',
  }),
  approvalFailed: msg({
    id: 'dashboard.activation.approvalFailed',
    message: 'Authoring could not be approved. Return to the launcher and try again.',
  }),
  close: msg({ id: 'dashboard.activation.close', message: 'Close' }),
  signInTitle: msg({ id: 'dashboard.activation.signInTitle', message: 'Sign in, then continue' }),
  signInDescription: msg({
    id: 'dashboard.activation.signInDescription',
    message:
      'Sign in here. This window will resume the same secure authoring request automatically.',
  }),
  credentialSafety: msg({
    id: 'dashboard.activation.credentialSafety',
    message: 'Your credentials stay inside Lodariq and are never sent to the customer page.',
  }),
  passwordHelp: msg({
    id: 'dashboard.activation.passwordHelp',
    message: 'Need to set or reset your password?',
  }),
  openRecovery: msg({
    id: 'dashboard.activation.openRecovery',
    message: 'Open password recovery in a new tab',
  }),
  recoveryFinish: msg({
    id: 'dashboard.activation.recoveryFinish',
    message: 'Finish there, then close this window and start authoring again.',
  }),
  approveTitle: msg({
    id: 'dashboard.activation.approveTitle',
    message: 'Author in this application?',
  }),
  approveDescription: msg({
    id: 'dashboard.activation.approveDescription',
    message: 'Allow your Lodariq workspace to create and edit Tours on {host}.',
  }),
  environment: msg({ id: 'dashboard.activation.environment', message: 'Environment' }),
  experience: msg({ id: 'dashboard.activation.experience', message: 'Experience' }),
  continue: msg({ id: 'dashboard.activation.continue', message: 'Continue to authoring' }),
  cancel: msg({ id: 'dashboard.activation.cancel', message: 'Cancel' }),
  approved: msg({ id: 'dashboard.activation.approved', message: 'Authoring approved' }),
  returning: msg({
    id: 'dashboard.activation.returning',
    message: 'Returning you to the application…',
  }),
  couldNotContinue: msg({
    id: 'dashboard.activation.couldNotContinue',
    message: 'Could not continue',
  }),
  checking: msg({ id: 'dashboard.activation.checking', message: 'Checking access' }),
  verifying: msg({
    id: 'dashboard.activation.verifying',
    message: 'Verifying the application and workspace…',
  }),
  ready: msg({ id: 'dashboard.activation.ready', message: 'Ready to connect' }),
  readyDescription: msg({
    id: 'dashboard.activation.readyDescription',
    message: 'Keep this window open while the Lodariq launcher completes the secure handoff.',
  }),
  thisApplication: msg({
    id: 'dashboard.activation.thisApplication',
    message: 'this application',
  }),
  newTour: msg({ id: 'dashboard.activation.newTour', message: 'New Tour' }),
  existingTour: msg({ id: 'dashboard.activation.existingTour', message: 'Existing Tour' }),
  development: msg({ id: 'dashboard.activation.development', message: 'Development' }),
  staging: msg({ id: 'dashboard.activation.staging', message: 'Staging' }),
} as const;

export function AuthoringActivationPopup({
  passwordRecoveryEnabled,
}: {
  passwordRecoveryEnabled: boolean;
}): React.ReactElement {
  const { _, i18n } = useLingui();
  const dashboardLocale = resolveClientLocale([i18n.locale]);
  const [state, setState] = useState<ActivationState>({ name: 'waiting' });
  const activeHandshake = useRef<ActivationHandshake | null>(null);
  const activation = useAuthoringActivation();

  const inspect = useCallback(
    async (handshake: ActivationHandshake): Promise<void> => {
      setState({ name: 'loading', handshake });
      try {
        const result = await activation.inspect.mutateAsync({
          requestId: handshake.message.requestId,
          state: handshake.message.state,
          openerOrigin: handshake.openerOrigin,
        });
        if (activeHandshake.current !== handshake) return;
        if (result.status === 'authentication') {
          setState({ name: 'authentication', handshake });
          return;
        }
        setState({ name: 'ready', request: result.request });
      } catch {
        if (activeHandshake.current !== handshake) return;
        setState({
          name: 'error',
          message: _(COPY.requestExpired),
        });
      }
    },
    [activation.inspect, _],
  );

  useEffect(() => {
    if (!window.opener) {
      setState({
        name: 'error',
        message: _(COPY.openFromLauncher),
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
  }, [inspect, _]);

  const resumeAfterSignIn = useCallback(
    async (_session: AuthSessionSnapshot, handshake: ActivationHandshake): Promise<void> => {
      if (activeHandshake.current !== handshake) return;
      await inspect(handshake);
    },
    [inspect],
  );

  const approve = useCallback(
    async (request: PendingActivation): Promise<void> => {
      setState({ name: 'approving', request });
      try {
        const result = await activation.approve.mutateAsync(request);
        if (!window.opener) throw new Error('opener_closed');

        window.opener.postMessage({ ...result, uiLocale: dashboardLocale }, request.customerOrigin);
        setState({ name: 'complete' });
        window.setTimeout(() => window.close(), 350);
      } catch {
        setState({
          name: 'error',
          message: _(COPY.approvalFailed),
        });
      }
    },
    [activation.approve, dashboardLocale, _],
  );

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <section className="grid w-full max-w-md gap-5 rounded-2xl border border-border bg-card p-6 shadow-[0_22px_70px_rgba(30,55,47,.16)]">
        <header className="flex items-start justify-between gap-4">
          <div className="grid size-11 place-items-center rounded-xl bg-[var(--nav-active)] text-primary">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </div>
          <button
            aria-label={_(COPY.close)}
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
  const { _ } = useLingui();
  if (state.name === 'authentication') {
    return (
      <div className="grid gap-5">
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Lodariq</p>
          <h1 className="[font-family:Georgia,serif] text-3xl tracking-[-0.025em]">
            {_(COPY.signInTitle)}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">{_(COPY.signInDescription)}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--info-border)] bg-[var(--info-bg)] px-3 py-2 text-xs text-[var(--info-fg)]">
          <LogIn aria-hidden="true" className="size-4 shrink-0" />
          {_(COPY.credentialSafety)}
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
            <span>{_(COPY.passwordHelp)}</span>
            <a
              className="font-semibold text-primary hover:underline"
              href="/forgot-password?returnTo=%2Fsign-in"
              rel="noopener noreferrer"
              target="_blank"
            >
              {_(COPY.openRecovery)}
            </a>
            <span>{_(COPY.recoveryFinish)}</span>
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
            {_(COPY.approveTitle)}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {_({
              ...COPY.approveDescription,
              values: { host: hostLabel(request.customerOrigin, _) },
            })}
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-border bg-[var(--surface-subtle)] p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{_(COPY.environment)}</span>
            <span className="font-medium">{environmentLabel(request.environment, _)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{_(COPY.experience)}</span>
            <span className="font-medium">{intentLabel(request.documentIntent, _)}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <Button disabled={state.name === 'approving'} onClick={() => void onApprove(request)}>
            {state.name === 'approving' ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden="true" className="size-4" />
            )}
            {_(COPY.continue)}
          </Button>
          <Button onClick={() => window.close()} variant="outline">
            {_(COPY.cancel)}
          </Button>
        </div>
      </>
    );
  }

  const copy = activationStateCopy(state, _);
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
          {_(COPY.close)}
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

function activationStateCopy(
  state: ActivationState,
  translate: Translate,
): { title: string; description: string } {
  if (state.name === 'complete') {
    return { title: translate(COPY.approved), description: translate(COPY.returning) };
  }
  if (state.name === 'error') {
    return { title: translate(COPY.couldNotContinue), description: state.message };
  }
  if (state.name === 'loading') {
    return { title: translate(COPY.checking), description: translate(COPY.verifying) };
  }
  return {
    title: translate(COPY.ready),
    description: translate(COPY.readyDescription),
  };
}

function hostLabel(origin: string, translate: Translate): string {
  try {
    return new URL(origin).host;
  } catch {
    return translate(COPY.thisApplication);
  }
}

function intentLabel(intent: PendingActivation['documentIntent'], translate: Translate): string {
  if (!intent || intent.kind === 'new-draft') return translate(COPY.newTour);
  return translate(COPY.existingTour);
}

function environmentLabel(
  environment: PendingActivation['environment'],
  translate: Translate,
): string {
  if (environment === 'staging') return translate(COPY.staging);
  return translate(COPY.development);
}
