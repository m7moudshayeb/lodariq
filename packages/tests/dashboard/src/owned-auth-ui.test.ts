// @vitest-environment jsdom

import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '../../../../apps/dashboard/src/components/auth-form';
import { EmailVerificationPanel } from '../../../../apps/dashboard/src/components/email-verification-panel';
import { PasswordRecoveryForm } from '../../../../apps/dashboard/src/components/password-recovery-form';
import { SetPasswordForm } from '../../../../apps/dashboard/src/components/set-password-form';

const CHALLENGE_ID = 'verify_abcdefghijklmnopqrstuvwxyz123456';
const VERIFICATION_TOKEN = 'lq_verify_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG';
const EXPIRES_AT = '2026-08-07T18:00:00.000Z';
const RAW_PASSWORD = '  correct horse battery  ';
const VERIFIED_PASSWORD = 'owner chosen password';
const RESET_CHALLENGE_ID = 'reset_abcdefghijklmnopqrstuvwxyz123456';
const RESET_TOKEN = 'lq_reset_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG';

interface MountedComponent {
  container: HTMLDivElement;
  root: Root;
}

describe('@lodariq/dashboard owned auth UI', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, '', '/');
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.replaceChildren();
    window.history.replaceState(null, '', '/');
  });

  it('moves sign-up into owner-chosen password verification without exposing the dev token', async () => {
    const authenticated = vi.fn();
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            status: 'verification_required',
            challengeId: CHALLENGE_ID,
            expiresAt: EXPIRES_AT,
            verificationToken: VERIFICATION_TOKEN,
          },
          202,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(sessionSnapshot()));
    vi.stubGlobal('fetch', fetchMock);
    const mounted = await mount(
      createElement(AuthForm, {
        embedded: true,
        mode: 'sign-up',
        onAuthenticated: authenticated,
      }),
    );

    await fillAndSubmitSignUp(mounted.container);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signUpInit = fetchMock.mock.calls[0]?.[1];
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/sign-up');
    expect(JSON.parse(String(signUpInit?.body))).toEqual({
      email: 'creator@example.test',
      name: 'Creator',
      workspaceName: 'Product',
    });
    expect(mounted.container.textContent).toContain('Choose your password');
    expect(mounted.container.textContent).not.toContain(VERIFICATION_TOKEN);
    expect(authenticated).not.toHaveBeenCalled();

    setInputValue(requiredInput(mounted.container, 'password'), VERIFIED_PASSWORD);
    setInputValue(requiredInput(mounted.container, 'passwordConfirmation'), VERIFIED_PASSWORD);
    const verificationForm = mounted.container.querySelector('form');
    if (!verificationForm) throw new Error('verification form not found');
    await act(async () => {
      verificationForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/verify-email');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      challengeId: CHALLENGE_ID,
      token: VERIFICATION_TOKEN,
      password: VERIFIED_PASSWORD,
    });
    expect(authenticated).toHaveBeenCalledWith(sessionSnapshot());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    await unmount(mounted);
  });

  it('keeps production sign-up in the form when verification delivery is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: 'signup_unavailable',
            message: 'Account creation is not available in this deployment.',
          },
          503,
        ),
      ),
    );
    const mounted = await mount(createElement(AuthForm, { embedded: true, mode: 'sign-up' }));

    await fillAndSubmitSignUp(mounted.container);

    expect(mounted.container.textContent).toContain(
      'Account creation is not available in this deployment.',
    );
    expect(mounted.container.textContent).not.toContain('Check your email');
    expect(mounted.container.querySelector('input[name="email"]')).not.toBeNull();

    await unmount(mounted);
  });

  it('reads a fragment token once, clears it, and never renders or persists it', async () => {
    const authenticated = vi.fn();
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(sessionSnapshot()));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(
      null,
      '',
      `/verify-email?challenge=${encodeURIComponent(CHALLENGE_ID)}#token=${encodeURIComponent(VERIFICATION_TOKEN)}`,
    );

    const mounted = await mount(
      createElement(EmailVerificationPanel, {
        challengeId: CHALLENGE_ID,
        onVerified: authenticated,
        readTokenFromFragment: true,
      }),
    );
    await flushAsyncWork();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mounted.container.textContent).toContain('Choose your password');
    setInputValue(requiredInput(mounted.container, 'password'), VERIFIED_PASSWORD);
    setInputValue(requiredInput(mounted.container, 'passwordConfirmation'), VERIFIED_PASSWORD);
    const verificationForm = mounted.container.querySelector('form');
    if (!verificationForm) throw new Error('verification form not found');
    await act(async () => {
      verificationForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      challengeId: CHALLENGE_ID,
      token: VERIFICATION_TOKEN,
      password: VERIFIED_PASSWORD,
    });
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe(`?challenge=${CHALLENGE_ID}`);
    expect(mounted.container.textContent).toContain('Email verified');
    expect(mounted.container.outerHTML).not.toContain(VERIFICATION_TOKEN);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(authenticated).toHaveBeenCalledWith(sessionSnapshot());

    await unmount(mounted);
  });

  it('never exposes a development verification token in production UI', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const mounted = await mount(
      createElement(EmailVerificationPanel, {
        challengeId: CHALLENGE_ID,
        developmentToken: VERIFICATION_TOKEN,
        email: 'creator@example.test',
      }),
    );

    expect(mounted.container.textContent).toContain('Check your email');
    expect(mounted.container.textContent).not.toContain('Choose your password');
    expect(mounted.container.outerHTML).not.toContain(VERIFICATION_TOKEN);
    await unmount(mounted);
  });

  it('keeps recovery generic and does not render its development token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse(
          {
            status: 'accepted',
            challengeId: RESET_CHALLENGE_ID,
            expiresAt: EXPIRES_AT,
            resetToken: RESET_TOKEN,
          },
          202,
        ),
      ),
    );
    const mounted = await mount(createElement(PasswordRecoveryForm, { returnTo: '/' }));
    setInputValue(requiredInput(mounted.container, 'email'), ' legacy@example.test ');
    const form = mounted.container.querySelector('form');
    if (!form) throw new Error('password recovery form not found');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(mounted.container.textContent).toContain('Check your email');
    expect(mounted.container.textContent).toContain('Open local recovery link');
    expect(mounted.container.outerHTML).not.toContain(RESET_TOKEN);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    await unmount(mounted);
  });

  it('clears the reset fragment before rendering and signs in with one submit', async () => {
    const authenticated = vi.fn();
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ status: 'password_updated', session: sessionSnapshot() }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(
      null,
      '',
      `/reset-password?challenge=${RESET_CHALLENGE_ID}#token=${encodeURIComponent(RESET_TOKEN)}`,
    );
    const mounted = await mount(
      createElement(SetPasswordForm, {
        challengeId: RESET_CHALLENGE_ID,
        onAuthenticated: authenticated,
      }),
    );
    await flushAsyncWork();

    expect(window.location.hash).toBe('');
    expect(mounted.container.outerHTML).not.toContain(RESET_TOKEN);
    setInputValue(requiredInput(mounted.container, 'password'), RAW_PASSWORD);
    setInputValue(requiredInput(mounted.container, 'passwordConfirmation'), RAW_PASSWORD);
    const form = mounted.container.querySelector('form');
    if (!form) throw new Error('set password form not found');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      challengeId: RESET_CHALLENGE_ID,
      token: RESET_TOKEN,
      password: RAW_PASSWORD,
    });
    expect(authenticated).toHaveBeenCalledWith(sessionSnapshot());
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    await unmount(mounted);
  });
});

async function fillAndSubmitSignUp(container: HTMLElement): Promise<void> {
  setInputValue(requiredInput(container, 'name'), ' Creator ');
  setInputValue(requiredInput(container, 'email'), ' creator@example.test ');
  setInputValue(requiredInput(container, 'workspaceName'), ' Product ');
  const form = container.querySelector('form');
  if (!form) throw new Error('sign-up form not found');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsyncWork();
  });
}

function requiredInput(container: HTMLElement, name: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`${name} input not found`);
  return input;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function mount(element: React.ReactElement): Promise<MountedComponent> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return { container, root };
}

async function unmount(mounted: MountedComponent): Promise<void> {
  await act(async () => mounted.root.unmount());
  mounted.container.remove();
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

function sessionSnapshot(): Record<string, unknown> {
  return {
    user: { id: 'user_creator', email: 'creator@example.test', name: 'Creator' },
    activeWorkspaceId: 'wk_product',
    workspaces: [{ id: 'wk_product', name: 'Product', role: 'owner' }],
  };
}
