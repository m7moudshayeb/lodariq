// @vitest-environment jsdom

import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm } from '../../../../apps/dashboard/src/components/auth-form';
import { EmailVerificationPanel } from '../../../../apps/dashboard/src/components/email-verification-panel';
import { EmailChangeVerification } from '../../../../apps/dashboard/src/components/email-change-verification';
import { PasswordRecoveryForm } from '../../../../apps/dashboard/src/components/password-recovery-form';
import { SetPasswordForm } from '../../../../apps/dashboard/src/components/set-password-form';
import { RecoveryCodeForm } from '../../../../apps/dashboard/src/components/recovery-code-form';
import { EnterpriseIdentitySettings } from '../../../../apps/dashboard/src/components/enterprise-identity-settings';

const CHALLENGE_ID = 'verify_abcdefghijklmnopqrstuvwxyz123456';
const VERIFICATION_TOKEN = 'lq_verify_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG';
const EXPIRES_AT = '2026-08-07T18:00:00.000Z';
const RAW_PASSWORD = '  correct horse battery  ';
const VERIFIED_PASSWORD = 'owner chosen password';
const RESET_CHALLENGE_ID = 'reset_abcdefghijklmnopqrstuvwxyz123456';
const RESET_TOKEN = 'lq_reset_abcdefghijklmnopqrstuvwxyz1234567890ABCDEFG';
const dashboardI18n = setupI18n({ locale: 'en', messages: { en: {} } });

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
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/auth/sign-up');
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
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/v1/auth/verify-email');
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

    expect(mounted.container.textContent).toContain('Account creation is not available right now.');
    expect(mounted.container.textContent).not.toContain('Check your email');
    expect(mounted.container.querySelector('input[name="email"]')).not.toBeNull();

    await unmount(mounted);
  });

  it('exposes passkey and recovery-code sign-in without native browser validation', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const signIn = await mount(createElement(AuthForm, { embedded: true, mode: 'sign-in' }));
    expect(signIn.container.textContent).toContain('Use Passkey');
    expect(signIn.container.textContent).toContain('Use a recovery code');
    expect(signIn.container.textContent).toContain('Continue with SSO');
    expect(
      signIn.container.querySelector('button[aria-label="Continue with Google"]'),
    ).not.toBeNull();
    expect(
      signIn.container.querySelector('button[aria-label="Continue with Microsoft"]'),
    ).not.toBeNull();
    await unmount(signIn);

    const recovery = await mount(createElement(RecoveryCodeForm, { returnTo: '/' }));
    const form = recovery.container.querySelector('form');
    if (!form) throw new Error('recovery code form not found');
    expect(form.noValidate).toBe(true);
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });
    expect(recovery.container.textContent).toContain(
      'Enter your identifier and a complete recovery code.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(requiredInput(recovery.container, 'identifier'));
    await unmount(recovery);
  });

  it('renders owner-only enterprise controls with custom validation and one-time secret guidance', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        policy: {
          workspaceId: 'wk_enterprise_ui',
          ssoRequired: false,
          minimumAssurance: 'aal1',
          passwordAllowed: true,
        },
        connections: [
          {
            id: `sso_${'c'.repeat(24)}`,
            workspaceId: 'wk_enterprise_ui',
            provider: 'okta',
            protocol: 'oidc',
            issuer: 'https://tenant.okta.com/oauth2/default',
            clientId: 'client-id',
            provisioningMode: 'invitation_only',
            status: 'validation_required',
            validatedAt: null,
            createdAt: EXPIRES_AT,
            updatedAt: EXPIRES_AT,
          },
        ],
        domains: [],
        groupRoleMappings: [],
        scimConnections: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const mounted = await mount(
      createElement(EnterpriseIdentitySettings, {
        currentRole: 'owner',
        workspaceId: 'wk_enterprise_ui',
      }),
    );
    await flushAsyncWork();
    expect(mounted.container.textContent).toContain('Enterprise identity');
    expect(mounted.container.textContent).toContain('Validation required');
    expect(mounted.container.textContent).toContain('Tokens are shown once');
    expect([...mounted.container.querySelectorAll('form')].every((form) => form.noValidate)).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/v1/workspaces/wk_enterprise_ui/enterprise/configuration',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
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
      createElement(
        React.StrictMode,
        null,
        createElement(EmailVerificationPanel, {
          challengeId: CHALLENGE_ID,
          onVerified: authenticated,
          readTokenFromFragment: true,
        }),
      ),
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

    expect(mounted.container.textContent).toContain('Request accepted');
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
      createElement(
        React.StrictMode,
        null,
        createElement(SetPasswordForm, {
          challengeId: RESET_CHALLENGE_ID,
          onAuthenticated: authenticated,
        }),
      ),
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

  it('owns validation, focuses the first invalid field, and exposes password visibility safely', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const mounted = await mount(createElement(AuthForm, { mode: 'sign-in' }));
    const form = mounted.container.querySelector('form');
    if (!form) throw new Error('sign-in form not found');
    const identifier = requiredInput(mounted.container, 'identifier');
    const password = requiredInput(mounted.container, 'password');

    expect(form.noValidate).toBe(true);
    expect(identifier.required).toBe(false);
    expect(password.required).toBe(false);
    expect(password.minLength).toBe(-1);
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(identifier).toBe(document.activeElement);
    expect(identifier.getAttribute('aria-invalid')).toBe('true');
    expect(identifier.getAttribute('aria-describedby')).toContain('identifier-error');
    expect(mounted.container.textContent).toContain('Email or username is required.');

    setInputValue(identifier, 'creator@example.test');
    setInputValue(password, RAW_PASSWORD);
    expect(identifier.hasAttribute('aria-invalid')).toBe(false);
    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Show password"]',
    );
    if (!toggle) throw new Error('password visibility control not found');
    await act(async () => toggle.click());
    expect(password.type).toBe('text');
    expect(password.value).toBe(RAW_PASSWORD);
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(password.autocomplete).toBe('current-password');

    await unmount(mounted);
  });

  it('makes remember-me explicit and sends the user choice to the server', async () => {
    const authenticated = vi.fn();
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse(sessionSnapshot()));
    vi.stubGlobal('fetch', fetchMock);
    const mounted = await mount(
      createElement(AuthForm, { mode: 'sign-in', onAuthenticated: authenticated }),
    );
    const identifier = requiredInput(mounted.container, 'identifier');
    const password = requiredInput(mounted.container, 'password');
    const rememberMe = requiredInput(mounted.container, 'rememberMe');
    setInputValue(identifier, 'creator@example.test');
    setInputValue(password, RAW_PASSWORD);
    await act(async () => rememberMe.click());
    const form = mounted.container.querySelector('form');
    if (!form) throw new Error('sign-in form not found');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      identifier: 'creator@example.test',
      password: RAW_PASSWORD,
      rememberMe: true,
    });
    expect(mounted.container.textContent).toContain('up to 30 days');
    expect(authenticated).toHaveBeenCalledOnce();
    await unmount(mounted);
  });

  it('consumes an email-change token from the fragment once and clears it before feedback', async () => {
    const challengeId = 'emailchange_abcdefghijklmnopqrstuvwxyz123456';
    const token = 'lq_email_change_abcdefghijklmnopqrstuvwxyz1234567890';
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ status: 'completed', email: 'new@example.test' }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(
      null,
      '',
      `/account/email-change?challenge=${challengeId}&proof=new_email#token=${token}`,
    );
    const mounted = await mount(
      createElement(
        React.StrictMode,
        null,
        createElement(EmailChangeVerification, { challengeId, proof: 'new_email' }),
      ),
    );
    await act(async () => flushAsyncWork());

    expect(window.location.hash).toBe('');
    expect(mounted.container.outerHTML).not.toContain(token);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/auth/email-change/verify');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      challengeId,
      proof: 'new_email',
      token,
    });
    expect(mounted.container.textContent).toContain('sign-in email has been changed');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    await unmount(mounted);
  });

  it('turns a rejected reset into a safe actionable replacement-link state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        jsonResponse(
          {
            error: 'password_reset_invalid',
            message: 'The password link is invalid or expired.',
          },
          400,
        ),
      ),
    );
    window.history.replaceState(
      null,
      '',
      `/reset-password?challenge=${RESET_CHALLENGE_ID}#token=${encodeURIComponent(RESET_TOKEN)}`,
    );
    const mounted = await mount(
      createElement(SetPasswordForm, {
        challengeId: RESET_CHALLENGE_ID,
        returnTo: '/authoring/activate',
      }),
    );
    await flushAsyncWork();
    setInputValue(requiredInput(mounted.container, 'password'), VERIFIED_PASSWORD);
    setInputValue(requiredInput(mounted.container, 'passwordConfirmation'), VERIFIED_PASSWORD);
    const form = mounted.container.querySelector('form');
    if (!form) throw new Error('set password form not found');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(mounted.container.textContent).toContain('This password link cannot be used');
    expect(mounted.container.textContent).toContain('newer request');
    expect(mounted.container.querySelector('a')?.getAttribute('href')).toBe(
      '/forgot-password?returnTo=%2Fauthoring%2Factivate',
    );
    await unmount(mounted);
  });

  it('labels recovery as queued and enables a bounded resend after cooldown', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    vi.stubGlobal('fetch', fetchMock);
    const mounted = await mount(createElement(PasswordRecoveryForm, { returnTo: '/' }));
    setInputValue(requiredInput(mounted.container, 'email'), 'creator@example.test');
    const form = mounted.container.querySelector('form');
    if (!form) throw new Error('password recovery form not found');
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await flushAsyncWork();
    });

    expect(mounted.container.textContent).toContain('Request accepted');
    expect(mounted.container.textContent).toContain('has been queued');
    expect(mounted.container.textContent).not.toContain('We sent');
    await act(async () => vi.advanceTimersByTime(31_000));
    const resend = [...mounted.container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Request another link'),
    );
    if (!resend) throw new Error('recovery resend control not found');
    await act(async () => {
      resend.click();
      await flushAsyncWork();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/v1/auth/password-recovery');
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
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  await act(async () =>
    root.render(
      createElement(
        I18nProvider,
        { i18n: dashboardI18n },
        createElement(QueryClientProvider, { client: queryClient }, element),
      ),
    ),
  );
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
