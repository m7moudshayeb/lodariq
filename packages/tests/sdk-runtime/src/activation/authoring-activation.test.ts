// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://staging.customer.example/"}
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthoringAuthorizationContext,
  AuthoringCodeExchangeResult,
  AuthoringDocumentIntent,
  NonProductionPublicSdkBootstrapContext,
} from '@lodariq/schema';
import {
  HOSTED_CREATOR_PANEL_STATE_EVENT,
  HOSTED_CREATOR_PANEL_TOGGLE_EVENT,
  HOSTED_CREATOR_REGISTRATION_PROPERTY,
} from '@lodariq/schema/hosted-creator';
import {
  activatePublicAuthoring,
  createPublicAuthoringLauncher,
  loadHostedCreatorModule,
  type HostedCreatorActivation,
} from '@lodariq/sdk-runtime/activation-client';

const INSTALLATION_ID = 'ins_pub_application_1234';
const CUSTOMER_ORIGIN = 'https://staging.customer.example';
const APP_ORIGIN = 'https://app.lodariq.io';
const BOOTSTRAP_GRANT = `lod_bootstrap_${'b'.repeat(40)}`;
const AUTHORIZATION_CODE = `lod_code_${'c'.repeat(40)}`;
const ACTIVATION_GRANT = `lod_activation_${'g'.repeat(40)}`;
const FUTURE_DATE = '2099-01-01T00:00:00.000Z';

const context: NonProductionPublicSdkBootstrapContext = {
  installationId: INSTALLATION_ID,
  environmentId: 'env_staging',
  environment: 'staging',
  customerOrigin: CUSTOMER_ORIGIN,
  correlationId: 'corr_activation',
  delivery: { state: 'unavailable' },
  authoring: {
    state: 'available',
    appOrigin: APP_ORIGIN,
    activationUrl: `${APP_ORIGIN}/authoring/activate`,
    authorizationRequestUrl: 'https://api.lodariq.io/v1/sdk/authoring/authorization-requests',
    exchangeUrl: 'https://api.lodariq.io/v1/sdk/authoring/exchange',
    bootstrapGrant: BOOTSTRAP_GRANT,
    bootstrapGrantExpiresAt: FUTURE_DATE,
  },
};

describe('public authoring activation client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-lodariq-launcher]').forEach((element) => element.remove());
    localStorage.clear();
    sessionStorage.clear();
  });

  it('opens synchronously, verifies exact popup messages, exchanges PKCE, and hands off once', async () => {
    const order: string[] = [];
    let authorization: AuthoringAuthorizationContext | null = null;
    let exchangeBody: Record<string, unknown> | null = null;
    const popup = createPopup((message, targetOrigin) => {
      expect(targetOrigin).toBe(APP_ORIGIN);
      if (!isRecord(message) || message['type'] !== 'authoring.activation.request') return;
      const result = {
        protocol: 'lodariq.authoring.activation.v1',
        type: 'authoring.authorization.result',
        requestId: message['requestId'],
        state: message['state'],
        authorizationCode: AUTHORIZATION_CODE,
        uiLocale: 'fr',
        expiresAt: FUTURE_DATE,
      };
      window.dispatchEvent(
        new MessageEvent('message', {
          source: popup,
          origin: 'https://attacker.example',
          data: result,
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          origin: APP_ORIGIN,
          data: result,
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', { source: popup, origin: APP_ORIGIN, data: result }),
      );
    });
    vi.spyOn(window, 'open').mockImplementation(() => {
      order.push('open');
      return popup;
    });

    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (url.endsWith('/authorization-requests')) {
        authorization = {
          requestId: 'authreq_activation',
          installationId: INSTALLATION_ID,
          workspaceId: 'wk_activation',
          environmentId: 'env_staging',
          environment: 'staging',
          customerOrigin: CUSTOMER_ORIGIN,
          state: String(body['state']),
          codeChallenge: String(body['codeChallenge']),
          codeChallengeMethod: 'S256',
          requestedCapabilities: ['documents:create', 'documents:list', 'documents:select'],
          expiresAt: FUTURE_DATE,
        };
        return jsonResponse(authorization, 201);
      }
      exchangeBody = body;
      return jsonResponse(createExchangeResult(), 200);
    });
    const cryptoApi = createCrypto(order);
    const handedOff: HostedCreatorActivation[] = [];
    const loadCreatorModule = vi.fn(async () => ({
      activateLodariqAuthoring: (input: HostedCreatorActivation) => {
        handedOff.push(structuredClone(input));
      },
    }));

    await activatePublicAuthoring(context, {
      crypto: cryptoApi,
      fetchFn: fetchFn as typeof fetch,
      hostWindow: window,
      refreshContext: async () => context,
      loadCreatorModule,
      timeoutMs: 2_000,
    });

    expect(order[0]).toBe('open');
    expect(order).toContain('digest');
    expect(authorization).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const authorizationInit = fetchFn.mock.calls[0]?.[1];
    expect(authorizationInit?.credentials).toBe('omit');
    expect(authorizationInit?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-lodariq-bootstrap-grant': BOOTSTRAP_GRANT,
    });
    const authorizationBody = JSON.parse(String(authorizationInit?.body)) as Record<
      string,
      unknown
    >;
    expect(authorizationBody).not.toHaveProperty('environment');
    expect(authorizationBody['requestedCapabilities']).toEqual([
      'documents:create',
      'documents:list',
      'documents:select',
    ]);
    expect(authorizationBody).not.toHaveProperty('documentIntent');
    expect(exchangeBody).toMatchObject({
      installationId: INSTALLATION_ID,
      customerOrigin: CUSTOMER_ORIGIN,
      requestId: 'authreq_activation',
      authorizationCode: AUTHORIZATION_CODE,
    });
    expect(String(exchangeBody?.['codeVerifier'])).toHaveLength(64);
    expect(handedOff).toEqual([
      expect.objectContaining({
        activationGrant: ACTIVATION_GRANT,
        apiOrigin: 'https://api.lodariq.io',
        context: expect.objectContaining({ requestId: 'authreq_activation' }),
        uiLocale: 'fr',
      }),
    ]);
    expect(handedOff[0]).not.toHaveProperty('documentIntent');
    expect(handedOff[0]).not.toHaveProperty('getTargetStateId');
    expect(loadCreatorModule).toHaveBeenCalledTimes(1);
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(location.href).not.toMatch(/lod_(?:bootstrap|code|activation)_/u);
    expect(document.documentElement.outerHTML).not.toMatch(/lod_(?:bootstrap|code|activation)_/u);
    expect(JSON.stringify(localStorage)).not.toMatch(/lod_(?:bootstrap|code|activation)_/u);
    expect(JSON.stringify(sessionStorage)).not.toMatch(/lod_(?:bootstrap|code|activation)_/u);
  });

  it('keeps the staging app, API, CDN, and editor origins in one closed activation tuple', async () => {
    const stagingAppOrigin = 'https://staging-app.lodariq.io';
    const stagingContext: NonProductionPublicSdkBootstrapContext = {
      ...context,
      authoring: {
        state: 'available',
        appOrigin: stagingAppOrigin,
        activationUrl: `${stagingAppOrigin}/authoring/activate`,
        authorizationRequestUrl:
          'https://staging-api.lodariq.io/v1/sdk/authoring/authorization-requests',
        exchangeUrl: 'https://staging-api.lodariq.io/v1/sdk/authoring/exchange',
        bootstrapGrant: BOOTSTRAP_GRANT,
        bootstrapGrantExpiresAt: FUTURE_DATE,
      },
    };
    const popup = createPopup((message) => {
      if (!isRecord(message)) return;
      window.dispatchEvent(
        new MessageEvent('message', {
          source: popup,
          origin: stagingAppOrigin,
          data: {
            protocol: 'lodariq.authoring.activation.v1',
            type: 'authoring.authorization.result',
            requestId: message['requestId'],
            state: message['state'],
            authorizationCode: AUTHORIZATION_CODE,
            expiresAt: FUTURE_DATE,
          },
        }),
      );
    });
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (String(input).endsWith('/authorization-requests')) {
        return jsonResponse(
          {
            requestId: 'authreq_activation',
            installationId: INSTALLATION_ID,
            workspaceId: 'wk_activation',
            environmentId: 'env_staging',
            environment: 'staging',
            customerOrigin: CUSTOMER_ORIGIN,
            state: body['state'],
            codeChallenge: body['codeChallenge'],
            codeChallengeMethod: 'S256',
            requestedCapabilities: ['documents:create', 'documents:list', 'documents:select'],
            expiresAt: FUTURE_DATE,
          },
          201,
        );
      }
      const exchanged = createExchangeResult();
      exchanged.context.editorOrigin = 'https://staging-editor.lodariq.io';
      exchanged.creatorModule.url = `https://staging-cdn.lodariq.io/sdk/sha256-${'0'.repeat(64)}/creator.js`;
      return jsonResponse(exchanged);
    });
    const handedOff: HostedCreatorActivation[] = [];

    await activatePublicAuthoring(stagingContext, {
      crypto: createCrypto([]),
      fetchFn: fetchFn as typeof fetch,
      hostWindow: window,
      loadCreatorModule: async () => ({
        activateLodariqAuthoring: (input) => {
          handedOff.push(input);
        },
      }),
      timeoutMs: 2_000,
    });

    expect(window.open).toHaveBeenCalledWith(
      `${stagingAppOrigin}/authoring/activate`,
      expect.any(String),
      expect.any(String),
    );
    expect(handedOff).toEqual([
      expect.objectContaining({ apiOrigin: 'https://staging-api.lodariq.io' }),
    ]);
    expect(handedOff[0]?.context.editorOrigin).toBe('https://staging-editor.lodariq.io');
  });

  it('exposes a retryable blocked state without making API or creator requests', async () => {
    const fetchFn = vi.fn();
    const loadCreatorModule = vi.fn();
    const states: string[] = [];
    vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(
      activatePublicAuthoring(context, {
        fetchFn: fetchFn as typeof fetch,
        hostWindow: window,
        loadCreatorModule,
        onStateChange: (state) => states.push(state),
      }),
    ).rejects.toThrow('Lodariq authoring could not be opened');

    expect(states).toEqual(['blocked']);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(loadCreatorModule).not.toHaveBeenCalled();
  });

  it('rejects a forged app activation origin before opening a popup', async () => {
    const open = vi.spyOn(window, 'open');
    const forged = {
      ...context,
      authoring: {
        ...context.authoring,
        appOrigin: 'https://attacker.example',
        activationUrl: 'https://attacker.example/authoring/activate',
      },
    } as unknown as NonProductionPublicSdkBootstrapContext;

    await expect(activatePublicAuthoring(forged, { hostWindow: window })).rejects.toThrow(
      'Lodariq authoring is unavailable',
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('starts hidden, toggles from the global shortcut, and exposes an explicit Hide action', () => {
    const launcher = createPublicAuthoringLauncher(context, { hostWindow: window });
    const root = launcher.element.shadowRoot;
    const button = root?.querySelector<HTMLButtonElement>('.launcher');
    const actions = [
      ...(root?.querySelectorAll<HTMLButtonElement>('[data-launcher-action]') ?? []),
    ];

    expect(launcher.getState()).toBe('idle');
    expect(launcher.isVisible()).toBe(false);
    expect(launcher.element.style.display).toBe('none');
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        key: 'l',
        shiftKey: true,
      }),
    );
    expect(launcher.isVisible()).toBe(true);
    expect(button?.getAttribute('aria-label')).toBe('Open Lodariq actions');
    expect(button?.textContent).toBe('LQ');
    expect(actions.map((action) => action.getAttribute('aria-label'))).toEqual([
      'New experience',
      'Experiences on this page',
      'Preview as user',
      'Hide Lodariq',
    ]);
    expect(actions.every((action) => action.textContent === '')).toBe(true);
    expect(root?.querySelectorAll('[role="tooltip"]')).toHaveLength(4);
    expect(launcher.element.style.position).toBe('fixed');
    expect(launcher.element.style.width).toBe('max-content');
    expect(launcher.element.style.pointerEvents).toBe('none');
    expect(root?.querySelector('style')?.textContent).toContain('min-width: 44px');
    expect(root?.querySelector('style')?.textContent).toContain('safe-area-inset-right');
    expect(launcher.element.outerHTML).not.toContain(BOOTSTRAP_GRANT);
    expect(root?.innerHTML).not.toContain(BOOTSTRAP_GRANT);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem('lodariq.authoring.launcher.visibility.v1')).toBe('visible');
    expect(JSON.stringify(sessionStorage)).not.toMatch(/bootstrap|activation|grant|token/iu);

    button?.click();
    expect(root?.querySelector<HTMLElement>('.shell')?.dataset['pinned']).toBe('true');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    root?.querySelector<HTMLElement>('.shell')?.dispatchEvent(new MouseEvent('mouseleave'));
    expect(root?.querySelector<HTMLElement>('.shell')?.dataset['pinned']).toBe('true');

    root?.querySelector<HTMLButtonElement>('[data-launcher-action="hide-launcher"]')?.click();
    expect(launcher.isVisible()).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'L',
        metaKey: true,
        shiftKey: true,
      }),
    );
    expect(launcher.isVisible()).toBe(true);
    launcher.toggleVisibility();
    expect(launcher.isVisible()).toBe(false);

    launcher.destroy();
    expect(document.querySelector('[data-lodariq-launcher]')).toBeNull();
  });

  it('opens a compact Tour-only chooser and activates New with an explicit draft intent', async () => {
    const harness = createLauncherActivationHarness();
    const launcher = createPublicAuthoringLauncher(context, harness.options);
    const root = launcher.element.shadowRoot;

    root?.querySelector<HTMLButtonElement>('[data-launcher-action="new-experience"]')?.click();
    const surface = root?.querySelector<HTMLElement>('.type-surface');
    expect(surface?.hidden).toBe(false);
    expect(surface?.textContent).toContain('New experience');
    expect(surface?.querySelectorAll('[data-experience-type]')).toHaveLength(1);
    expect(surface?.textContent).toContain('Tour');

    surface?.querySelector<HTMLButtonElement>('[data-experience-type="tour"]')?.click();
    await vi.waitFor(() => expect(harness.handedOff).toHaveLength(1));

    expect(harness.authorizationBodies[0]?.['documentIntent']).toEqual({
      kind: 'new-draft',
      documentType: 'tour',
    });
    expect(harness.handedOff[0]?.documentIntent).toEqual({
      kind: 'new-draft',
      documentType: 'tour',
    });
    expect(surface?.hidden).toBe(true);
    expect(root?.querySelector<HTMLElement>('.shell')?.dataset['pinned']).toBe('true');
    launcher.destroy();
  });

  it('opens Experiences on this page with no document intent so hosted authoring can browse', async () => {
    const harness = createLauncherActivationHarness();
    const launcher = createPublicAuthoringLauncher(context, harness.options);
    const root = launcher.element.shadowRoot;

    root?.querySelector<HTMLButtonElement>('[data-launcher-action="experiences-on-page"]')?.click();
    await vi.waitFor(() => expect(harness.handedOff).toHaveLength(1));

    expect(harness.authorizationBodies[0]).not.toHaveProperty('documentIntent');
    expect(harness.handedOff[0]).not.toHaveProperty('documentIntent');
    expect(root?.querySelector<HTMLElement>('.shell')?.dataset['pinned']).toBe('true');
    launcher.destroy();
  });

  it('consumes a dashboard Flow Map handoff and activates its scoped document on click', async () => {
    window.history.replaceState(
      null,
      '',
      '/?lodariq-launcher=show&lodariq-document=doc_flow&lodariq-workspace=flow-map&lodariq-focus-block=step_branch',
    );
    const harness = createLauncherActivationHarness();
    const launcher = createPublicAuthoringLauncher(context, harness.options);

    expect(launcher.isVisible()).toBe(true);
    expect(window.location.search).toBe('');
    launcher.element.shadowRoot?.querySelector<HTMLButtonElement>('.launcher')?.click();
    await vi.waitFor(() => expect(harness.handedOff).toHaveLength(1));

    const expectedIntent = {
      kind: 'existing',
      documentId: 'doc_flow',
      workspace: 'flowMap',
      focusBlockId: 'step_branch',
    };
    expect(harness.authorizationBodies[0]?.['documentIntent']).toEqual(expectedIntent);
    expect(harness.handedOff[0]?.documentIntent).toEqual(expectedIntent);
    launcher.destroy();
  });

  it('keeps pinned actions open across actions, collapses only explicitly, and toggles the panel', () => {
    const launcher = createPublicAuthoringLauncher(context, {
      hostWindow: window,
      onPreview: vi.fn(),
    });
    const root = launcher.element.shadowRoot;
    const center = root?.querySelector<HTMLButtonElement>('.launcher');
    const shell = root?.querySelector<HTMLElement>('.shell');
    center?.click();

    root?.querySelector<HTMLButtonElement>('[data-launcher-action="preview-as-user"]')?.click();
    expect(shell?.dataset['pinned']).toBe('true');

    document.dispatchEvent(pointerEvent('pointerdown', 7, 5, 5));
    expect(shell?.dataset['pinned']).toBe('false');

    const toggle = vi.fn();
    window.addEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, toggle);
    window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: 'open' }));
    expect(shell?.dataset['pinned']).toBe('false');
    expect(shell?.dataset['dismissed']).toBe('true');
    expect(center?.getAttribute('aria-label')).toBe('Minimize Lodariq authoring');
    center?.click();
    expect(toggle).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: 'minimized' }),
    );
    expect(center?.getAttribute('aria-label')).toBe('Restore Lodariq authoring');

    window.removeEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, toggle);
    launcher.destroy();
  });

  it('keeps New and Browse single-session while an authoring surface is active', async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined);
    const popupOpen = vi.spyOn(window, 'open');
    const panelToggle = vi.fn();
    window.addEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, panelToggle);
    const launcher = createPublicAuthoringLauncher(context, { hostWindow: window, onPreview });
    const root = launcher.element.shadowRoot;
    const shell = root?.querySelector<HTMLElement>('.shell');
    const status = root?.querySelector<HTMLElement>('[role="status"]');
    const newAction = root?.querySelector<HTMLButtonElement>(
      '[data-launcher-action="new-experience"]',
    );
    const browseAction = root?.querySelector<HTMLButtonElement>(
      '[data-launcher-action="experiences-on-page"]',
    );
    const previewAction = root?.querySelector<HTMLButtonElement>(
      '[data-launcher-action="preview-as-user"]',
    );

    window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: 'open' }));
    expect(newAction?.getAttribute('aria-label')).toContain('close current authoring first');
    expect(browseAction?.getAttribute('aria-label')).toContain('close current authoring first');
    expect(
      root?.getElementById(newAction?.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('close current authoring first');

    newAction?.click();
    browseAction?.click();
    expect(popupOpen).not.toHaveBeenCalled();
    expect(root?.querySelector<HTMLElement>('.type-surface')?.hidden).toBe(true);
    expect(shell?.dataset['pinned']).toBe('true');
    expect(status?.textContent).toContain('Close current authoring');

    window.dispatchEvent(
      new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: 'minimized' }),
    );
    browseAction?.click();
    expect(panelToggle).toHaveBeenCalledOnce();
    expect(popupOpen).not.toHaveBeenCalled();

    previewAction?.click();
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledOnce());
    expect(launcher.getState()).toBe('active');

    window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_STATE_EVENT, { detail: 'closed' }));
    expect(newAction?.getAttribute('aria-label')).toBe('New experience');
    expect(browseAction?.getAttribute('aria-label')).toBe('Experiences on this page');
    expect(
      root?.getElementById(newAction?.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('New experience');
    expect(launcher.getState()).toBe('idle');
    expect(status?.hidden).toBe(true);

    window.removeEventListener(HOSTED_CREATOR_PANEL_TOGGLE_EVENT, panelToggle);
    launcher.destroy();
  });

  it('previews through the supplied viewer callback and reports unavailable or failed preview truthfully', async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined);
    const available = createPublicAuthoringLauncher(context, { hostWindow: window, onPreview });
    available.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-launcher-action="preview-as-user"]')
      ?.click();
    await vi.waitFor(() => expect(onPreview).toHaveBeenCalledTimes(1));
    expect(available.getState()).toBe('idle');

    const unavailable = createPublicAuthoringLauncher(context, { hostWindow: window });
    unavailable.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-launcher-action="preview-as-user"]')
      ?.click();
    await vi.waitFor(() => expect(unavailable.getState()).toBe('preview-unavailable'));
    expect(unavailable.element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain(
      'No published experience',
    );

    const failed = createPublicAuthoringLauncher(context, {
      hostWindow: window,
      onPreview: vi.fn().mockRejectedValue(new Error('viewer failed')),
    });
    failed.element.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-launcher-action="preview-as-user"]')
      ?.click();
    await vi.waitFor(() => expect(failed.getState()).toBe('preview-error'));

    available.destroy();
    unavailable.destroy();
    failed.destroy();
  });

  it('moves by keyboard and pointer while clamping the orb inside the viewport', () => {
    const launcher = createPublicAuthoringLauncher(context, { hostWindow: window });
    const root = launcher.element.shadowRoot;
    const button = root?.querySelector<HTMLButtonElement>('.launcher');
    vi.spyOn(launcher.element, 'getBoundingClientRect').mockReturnValue(rectAt(900, 650));

    button?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowLeft' }),
    );
    expect(launcher.element.style.left).toBe('884px');
    expect(launcher.element.style.top).toBe('650px');

    button?.dispatchEvent(pointerEvent('pointerdown', 1, 910, 660));
    window.dispatchEvent(pointerEvent('pointermove', 1, -500, -500));
    window.dispatchEvent(pointerEvent('pointerup', 1, -500, -500));
    expect(launcher.element.style.left).toBe('18px');
    expect(launcher.element.style.top).toBe('18px');
    button?.click();
    expect(root?.querySelector<HTMLElement>('.shell')?.dataset['pinned']).toBe('false');

    launcher.destroy();
  });

  it('rejects a non-content-addressed creator descriptor before module loading', async () => {
    const popup = createPopup((message) => {
      if (!isRecord(message)) return;
      window.dispatchEvent(
        new MessageEvent('message', {
          source: popup,
          origin: APP_ORIGIN,
          data: {
            protocol: 'lodariq.authoring.activation.v1',
            type: 'authoring.authorization.result',
            requestId: message['requestId'],
            state: message['state'],
            authorizationCode: AUTHORIZATION_CODE,
            expiresAt: FUTURE_DATE,
          },
        }),
      );
    });
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (String(input).endsWith('/authorization-requests')) {
        return jsonResponse({
          requestId: 'authreq_activation',
          installationId: INSTALLATION_ID,
          workspaceId: 'wk_activation',
          environmentId: 'env_staging',
          environment: 'staging',
          customerOrigin: CUSTOMER_ORIGIN,
          state: body['state'],
          codeChallenge: body['codeChallenge'],
          codeChallengeMethod: 'S256',
          requestedCapabilities: ['documents:create', 'documents:list', 'documents:select'],
          expiresAt: FUTURE_DATE,
        });
      }
      const exchanged = createExchangeResult();
      exchanged.creatorModule.url = 'https://cdn.lodariq.io/sdk/latest/creator.js';
      return jsonResponse(exchanged);
    });
    const loadCreatorModule = vi.fn();

    await expect(
      activatePublicAuthoring(context, {
        crypto: createCrypto([]),
        fetchFn: fetchFn as typeof fetch,
        hostWindow: window,
        loadCreatorModule,
        timeoutMs: 2_000,
      }),
    ).rejects.toThrow('Lodariq authoring activation failed');

    expect(loadCreatorModule).not.toHaveBeenCalled();
  });

  it('loads the hosted creator through an exact content-addressed SRI script', async () => {
    const creator = { activateLodariqAuthoring: vi.fn() };
    const append = vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
      const script = nodes[0] as HTMLScriptElement;
      expect(script.type).toBe('module');
      expect(script.crossOrigin).toBe('anonymous');
      expect(script.referrerPolicy).toBe('no-referrer');
      expect(script.integrity).toBe(`sha256-${'A'.repeat(43)}=`);
      expect(script.src).toBe(`https://cdn.lodariq.io/sdk/sha256-${'0'.repeat(64)}/creator.js`);
      const register = (
        window as Window & {
          [HOSTED_CREATOR_REGISTRATION_PROPERTY]?: (value: unknown) => void;
        }
      )[HOSTED_CREATOR_REGISTRATION_PROPERTY];
      register?.(creator);
      script.dispatchEvent(new Event('load'));
    });

    const descriptor = createExchangeResult().creatorModule;
    await expect(loadHostedCreatorModule(descriptor, window)).resolves.toBe(creator);
    await expect(loadHostedCreatorModule(descriptor, window)).resolves.toBe(creator);

    expect(append).toHaveBeenCalledOnce();
    expect(
      (
        window as Window & {
          [HOSTED_CREATOR_REGISTRATION_PROPERTY]?: (value: unknown) => void;
        }
      )[HOSTED_CREATOR_REGISTRATION_PROPERTY],
    ).toBeUndefined();
    expect(document.querySelector('[data-lodariq-creator-module]')).toBeNull();
  });
});

function createLauncherActivationHarness(): {
  authorizationBodies: Record<string, unknown>[];
  handedOff: HostedCreatorActivation[];
  options: Parameters<typeof createPublicAuthoringLauncher>[1];
} {
  const authorizationBodies: Record<string, unknown>[] = [];
  const handedOff: HostedCreatorActivation[] = [];
  let documentIntent: AuthoringDocumentIntent | undefined;
  const popup = createPopup((message) => {
    if (!isRecord(message) || message['type'] !== 'authoring.activation.request') return;
    window.dispatchEvent(
      new MessageEvent('message', {
        source: popup,
        origin: APP_ORIGIN,
        data: {
          protocol: 'lodariq.authoring.activation.v1',
          type: 'authoring.authorization.result',
          requestId: message['requestId'],
          state: message['state'],
          authorizationCode: AUTHORIZATION_CODE,
          expiresAt: FUTURE_DATE,
        },
      }),
    );
  });
  vi.spyOn(window, 'open').mockReturnValue(popup);
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (String(input).endsWith('/authorization-requests')) {
      authorizationBodies.push(body);
      documentIntent = body['documentIntent'] as AuthoringDocumentIntent | undefined;
      return jsonResponse(
        {
          requestId: 'authreq_activation',
          installationId: INSTALLATION_ID,
          workspaceId: 'wk_activation',
          environmentId: 'env_staging',
          environment: 'staging',
          customerOrigin: CUSTOMER_ORIGIN,
          state: body['state'],
          codeChallenge: body['codeChallenge'],
          codeChallengeMethod: 'S256',
          requestedCapabilities: ['documents:create', 'documents:list', 'documents:select'],
          expiresAt: FUTURE_DATE,
          ...(documentIntent ? { documentIntent } : {}),
        },
        201,
      );
    }
    return jsonResponse(createExchangeResult(documentIntent));
  });
  return {
    authorizationBodies,
    handedOff,
    options: {
      crypto: createCrypto([]),
      fetchFn: fetchFn as typeof fetch,
      hostWindow: window,
      loadCreatorModule: async () => ({
        activateLodariqAuthoring: (input) => {
          handedOff.push(structuredClone(input));
        },
      }),
      timeoutMs: 2_000,
    },
  };
}

function createExchangeResult(
  documentIntent?: AuthoringDocumentIntent,
): AuthoringCodeExchangeResult {
  return {
    activationGrant: ACTIVATION_GRANT,
    context: {
      grantId: 'grant_activation',
      requestId: 'authreq_activation',
      installationId: INSTALLATION_ID,
      workspaceId: 'wk_activation',
      environmentId: 'env_staging',
      environment: 'staging',
      customerOrigin: CUSTOMER_ORIGIN,
      editorOrigin: 'https://editor.lodariq.io',
      creatorId: 'user_activation',
      capabilities: ['documents:create', 'documents:list', 'documents:select'],
      expiresAt: FUTURE_DATE,
      ...(documentIntent ? { documentIntent } : {}),
    },
    creatorModule: {
      url: `https://cdn.lodariq.io/sdk/sha256-${'0'.repeat(64)}/creator.js`,
      version: 'sha256-test',
      integrity: `sha256-${'A'.repeat(43)}=`,
    },
  };
}

function rectAt(left: number, top: number): DOMRect {
  return {
    bottom: top + 58,
    height: 58,
    left,
    right: left + 58,
    top,
    width: 58,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function pointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  return event as PointerEvent;
}

function createPopup(onPostMessage: (message: unknown, targetOrigin: string) => void): Window {
  const popup = {
    closed: false,
    close: vi.fn(() => {
      popup.closed = true;
    }),
    postMessage: vi.fn(onPostMessage),
  };
  return popup as unknown as Window;
}

function createCrypto(order: string[]): Crypto {
  return {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    subtle: {
      digest: async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
        order.push('digest');
        return webcrypto.subtle.digest(algorithm, data);
      },
    },
  } as unknown as Crypto;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
