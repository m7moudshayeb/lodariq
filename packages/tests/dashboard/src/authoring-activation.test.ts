// @vitest-environment jsdom

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dashboardApiMocks = vi.hoisted(() => ({
  approveAuthoringAuthorization: vi.fn(),
  loadPendingAuthoringAuthorization: vi.fn(),
}));
vi.mock('../../../../apps/dashboard/src/lib/api', () => ({
  approveAuthoringAuthorization: dashboardApiMocks.approveAuthoringAuthorization,
  DashboardApiError: class DashboardApiError extends Error {
    readonly statusCode: number;

    constructor(statusCode: number, message: string) {
      super(message);
      this.name = 'DashboardApiError';
      this.statusCode = statusCode;
    }
  },
  loadPendingAuthoringAuthorization: dashboardApiMocks.loadPendingAuthoringAuthorization,
}));

import { POST as activationProxyPost } from '../../../../apps/dashboard/src/app/authoring/activate/request/route';
import { AuthoringActivationPopup } from '../../../../apps/dashboard/src/components/authoring-activation-popup';
import { DashboardApiError } from '../../../../apps/dashboard/src/lib/api';

const ACTIVATION_PROTOCOL = 'lodariq.authoring.activation.v1';
const CUSTOMER_ORIGIN = 'https://app.customer.test';
const REQUEST_ID = 'activation_request_123';
const REQUEST_STATE = 'state_abcdefghijklmnopqrstuvwxyz_1234567890';
const AUTHORIZATION_CODE = 'code_abcdefghijklmnopqrstuvwxyz_1234567890';
const EXPIRES_AT = '2026-08-07T12:05:00.000Z';
const repoRoot = existsSync(resolve(process.cwd(), 'apps/dashboard'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

interface MountedPopup {
  container: HTMLDivElement;
  opener: WindowProxy;
  postMessage: ReturnType<typeof vi.fn>;
  root: Root;
}

describe('@lodariq/dashboard first-party authoring activation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, 'opener', { configurable: true, value: null });
    vi.stubGlobal('React', React);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.replaceChildren();
    Object.defineProperty(window, 'opener', { configurable: true, value: null });
  });

  it('keeps owned sign-in inline and never asks the popup to choose a workspace', () => {
    const page = readFileSync(
      resolve(repoRoot, 'apps/dashboard/src/app/authoring/activate/page.tsx'),
      'utf8',
    );
    const popup = readFileSync(
      resolve(repoRoot, 'apps/dashboard/src/components/authoring-activation-popup.tsx'),
      'utf8',
    );

    expect(page).toContain(
      '<AuthoringActivationPopup passwordRecoveryEnabled={isPasswordRecoveryEnabled()} />',
    );
    expect(popup).toContain('<AuthForm');
    expect(popup).toContain('resume the same secure authoring request automatically');
    expect(popup).toContain('showPasswordRecoveryLink={false}');
    expect(popup).toContain('Open password recovery in a new tab');
    expect(popup).toContain('href="/forgot-password?returnTo=%2Fsign-in"');
    expect(popup).toContain('start authoring again');
    expect(popup).not.toMatch(/WorkspaceRequired|WorkspaceSwitcher|selectWorkspace/);
    expect(popup).not.toMatch(/router\.(?:push|replace)|window\.location\s*=/);
  });

  it('strictly proxies inspection and explicit approval without accepting extra input', async () => {
    const pending = pendingActivation();
    dashboardApiMocks.loadPendingAuthoringAuthorization.mockResolvedValue(pending);
    dashboardApiMocks.approveAuthoringAuthorization.mockResolvedValue(authorizationResult());

    const inspectResponse = await activationProxyPost(
      jsonRequest({ action: 'inspect', requestId: REQUEST_ID }),
    );
    expect(inspectResponse.status).toBe(200);
    expect(inspectResponse.headers.get('cache-control')).toBe('no-store');
    await expect(inspectResponse.json()).resolves.toEqual(pending);
    expect(dashboardApiMocks.loadPendingAuthoringAuthorization).toHaveBeenCalledWith(REQUEST_ID);
    expect(dashboardApiMocks.approveAuthoringAuthorization).not.toHaveBeenCalled();

    const missingState = await activationProxyPost(
      jsonRequest({ action: 'approve', requestId: REQUEST_ID }),
    );
    expect(missingState.status).toBe(400);

    const extraCredential = await activationProxyPost(
      jsonRequest({
        action: 'approve',
        requestId: REQUEST_ID,
        state: REQUEST_STATE,
        authorizationCode: AUTHORIZATION_CODE,
      }),
    );
    expect(extraCredential.status).toBe(400);
    expect(dashboardApiMocks.approveAuthoringAuthorization).not.toHaveBeenCalled();

    const approveResponse = await activationProxyPost(
      jsonRequest({ action: 'approve', requestId: REQUEST_ID, state: REQUEST_STATE }),
    );
    expect(approveResponse.status).toBe(200);
    expect(approveResponse.headers.get('cache-control')).toBe('no-store');
    expect(dashboardApiMocks.approveAuthoringAuthorization).toHaveBeenCalledWith(
      REQUEST_ID,
      REQUEST_STATE,
    );
  });

  it('preserves backend auth status while redacting backend error details', async () => {
    dashboardApiMocks.loadPendingAuthoringAuthorization.mockRejectedValue(
      new DashboardApiError(401, 'Bearer private-backend-session'),
    );

    const rejected = await activationProxyPost(
      jsonRequest({ action: 'inspect', requestId: REQUEST_ID }),
    );
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get('cache-control')).toBe('no-store');
    const body = JSON.stringify(await rejected.json());
    expect(body).toContain('activation_request_rejected');
    expect(body).not.toContain('private-backend-session');

    dashboardApiMocks.loadPendingAuthoringAuthorization.mockRejectedValueOnce(
      new Error('internal activation service secret'),
    );
    const unavailable = await activationProxyPost(
      jsonRequest({ action: 'inspect', requestId: REQUEST_ID }),
    );
    expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).toContain('activation_service_unavailable');
  });

  it('ignores messages unless protocol, exact opener source, and exact HTTP origin all match', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse(pendingActivation()));
    vi.stubGlobal('fetch', fetchMock);
    const popup = await mountPopup();
    const validMessage = activationRequestMessage();

    await dispatchMessage({ source: window, origin: CUSTOMER_ORIGIN, data: validMessage });
    await dispatchMessage({
      source: popup.opener,
      origin: `${CUSTOMER_ORIGIN}/not-an-origin`,
      data: validMessage,
    });
    await dispatchMessage({
      source: popup.opener,
      origin: CUSTOMER_ORIGIN,
      data: { ...validMessage, protocol: 'lodariq.authoring.activation.v0' },
    });
    await dispatchMessage({
      source: popup.opener,
      origin: CUSTOMER_ORIGIN,
      data: { ...validMessage, unexpected: 'field' },
    });
    await dispatchMessage({
      source: popup.opener,
      origin: CUSTOMER_ORIGIN,
      data: { ...validMessage, state: 'too-short' },
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await dispatchMessage({ source: popup.opener, origin: CUSTOMER_ORIGIN, data: validMessage });
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/authoring/activate/request',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'inspect', requestId: REQUEST_ID }),
      }),
    );
    expect(popup.container.textContent).toContain('Author in this application?');
    expect(popup.container.textContent).toContain('app.customer.test');

    await unmountPopup(popup);
  });

  it('binds the inspected request to the opener origin before offering approval', async () => {
    const mismatchedRequest = {
      ...pendingActivation(),
      customerOrigin: 'https://different.customer.test',
    };
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse(mismatchedRequest));
    vi.stubGlobal('fetch', fetchMock);
    const popup = await mountPopup();

    await dispatchMessage({
      source: popup.opener,
      origin: CUSTOMER_ORIGIN,
      data: activationRequestMessage(),
    });
    await flushAsyncWork();

    expect(popup.container.textContent).toContain('Could not continue');
    expect(popup.container.textContent).not.toContain('Continue to authoring');
    expect(popup.postMessage).not.toHaveBeenCalled();

    await unmountPopup(popup);
  });

  it('resumes the exact inspected request automatically after inline sign-in', async () => {
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse(sessionSnapshot()))
      .mockResolvedValueOnce(jsonResponse(pendingActivation()));
    vi.stubGlobal('fetch', fetchMock);
    const popup = await mountPopup();

    await dispatchMessage({
      source: popup.opener,
      origin: CUSTOMER_ORIGIN,
      data: activationRequestMessage(),
    });
    await flushAsyncWork();

    expect(popup.container.textContent).toContain('Sign in, then continue');
    const email = popup.container.querySelector<HTMLInputElement>('input[name="email"]');
    const password = popup.container.querySelector<HTMLInputElement>('input[name="password"]');
    const form = popup.container.querySelector('form');
    expect(email).not.toBeNull();
    expect(password).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      setInputValue(email!, 'creator@example.test');
      setInputValue(password!, 'a-secure-password');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/sign-in');
    expect(fetchMock.mock.calls[2]).toEqual([
      '/authoring/activate/request',
      expect.objectContaining({
        body: JSON.stringify({ action: 'inspect', requestId: REQUEST_ID }),
      }),
    ]);
    expect(popup.container.textContent).toContain('Author in this application?');
    expect(window.location.href).not.toContain('/sign-in');

    await unmountPopup(popup);
  });

  it('requires a visible approval click and returns the code only to the exact opener origin', async () => {
    vi.useFakeTimers();
    const initialHref = window.location.href;
    const fetchMock = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(pendingActivation()))
      .mockResolvedValueOnce(jsonResponse(authorizationResult()));
    vi.stubGlobal('fetch', fetchMock);
    const popup = await mountPopup();

    await dispatchMessage({
      source: popup.opener,
      origin: CUSTOMER_ORIGIN,
      data: activationRequestMessage(),
    });
    await flushAsyncWork();

    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const approveButton = Array.from(popup.container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Continue to authoring'),
    );
    expect(approveButton).toBeDefined();

    await act(async () => {
      approveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]).toEqual([
      '/authoring/activate/request',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'approve',
          requestId: REQUEST_ID,
          state: REQUEST_STATE,
        }),
      }),
    ]);
    expect(popup.postMessage).toHaveBeenCalledWith(authorizationResult(), CUSTOMER_ORIGIN);
    expect(window.location.href).toBe(initialHref);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.documentElement.outerHTML).not.toContain(REQUEST_STATE);
    expect(document.documentElement.outerHTML).not.toContain(AUTHORIZATION_CODE);

    await unmountPopup(popup);
  });
});

function activationRequestMessage(): Record<string, string> {
  return {
    protocol: ACTIVATION_PROTOCOL,
    type: 'authoring.activation.request',
    requestId: REQUEST_ID,
    state: REQUEST_STATE,
  };
}

function pendingActivation(): Record<string, unknown> {
  return {
    requestId: REQUEST_ID,
    status: 'pending',
    installationId: 'ins_pub_application_1234',
    environmentId: 'env_staging',
    environment: 'staging',
    customerOrigin: CUSTOMER_ORIGIN,
    requestedCapabilities: ['author:tour'],
    documentIntent: { kind: 'new-draft', documentType: 'tour' },
    expiresAt: EXPIRES_AT,
  };
}

function authorizationResult(): Record<string, string> {
  return {
    protocol: ACTIVATION_PROTOCOL,
    type: 'authoring.authorization.result',
    requestId: REQUEST_ID,
    state: REQUEST_STATE,
    authorizationCode: AUTHORIZATION_CODE,
    expiresAt: EXPIRES_AT,
  };
}

function sessionSnapshot(): Record<string, unknown> {
  return {
    user: { id: 'user_creator', email: 'creator@example.test', name: 'Creator' },
    activeWorkspaceId: 'wk_product',
    workspaces: [{ id: 'wk_product', name: 'Product', role: 'owner' }],
  };
}

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request('https://app.lodariq.com/authoring/activate/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.lodariq.com',
      'sec-fetch-site': 'same-origin',
    },
    body: JSON.stringify(body),
  });
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function mountPopup(): Promise<MountedPopup> {
  const postMessage = vi.fn();
  const opener = { postMessage } as unknown as WindowProxy;
  Object.defineProperty(window, 'opener', { configurable: true, value: opener });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(createElement(AuthoringActivationPopup, { passwordRecoveryEnabled: true })),
  );
  return { container, opener, postMessage, root };
}

async function unmountPopup(popup: MountedPopup): Promise<void> {
  await act(async () => popup.root.unmount());
  popup.container.remove();
}

async function dispatchMessage({
  source,
  origin,
  data,
}: {
  source: MessageEventSource;
  origin: string;
  data: unknown;
}): Promise<void> {
  const event = new MessageEvent('message', { data, origin });
  Object.defineProperty(event, 'source', { configurable: true, value: source });
  await act(async () => window.dispatchEvent(event));
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
