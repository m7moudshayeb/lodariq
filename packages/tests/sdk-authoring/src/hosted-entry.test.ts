// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBrandThemeContentHash } from '@lodariq/compiler';
import {
  AUTHORING_ACTIVATION_CAPABILITIES,
  AUTHORING_SESSION_CAPABILITIES,
  BRAND_THEME_CONTRACT_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  COMPILER_VERSION,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_BROWSE_READY_TYPE,
  HOSTED_AUTHORING_EDITOR_READY_TYPE,
  HOSTED_AUTHORING_SESSION_FAILED_TYPE,
  HOSTED_AUTHORING_SESSION_READY_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
  HOSTED_CREATOR_REGISTRATION_PROPERTY,
  HOSTED_CREATOR_PANEL_STATE_EVENT,
  HOSTED_CREATOR_PANEL_TOGGLE_EVENT,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  RENDERER_CONTRACT_VERSION,
  type BrandThemeSnapshot,
  type AuthoringActivationGrantContext,
  type BridgeMessage,
  type LodariqDocument,
} from '@lodariq/schema';
import tourDocumentFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';
import type {
  HostedCreatorActivation,
  HostedCreatorModule,
} from '@lodariq/sdk-authoring/hosted-entry';

const READY_REQUEST_ID = 'editor_ready_hosted_123';
const READY_STATE = 'hosted-editor-state-'.padEnd(48, 's');
const ACTIVATION_GRANT = 'hosted-activation-grant-'.padEnd(64, 'a');
const INSTALLATION_ID = 'ins_pub_application_1234';
const FUTURE_DATE = '2099-08-07T12:05:00.000Z';
const tourDocument = tourDocumentFixture as LodariqDocument;

describe('content-addressed hosted creator entry', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
    localStorage.clear();
    sessionStorage.clear();
    delete previewRuntimeWindow().Lodariq;
    delete registrationWindow()[HOSTED_CREATOR_REGISTRATION_PROPERTY];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete previewRuntimeWindow().Lodariq;
    delete registrationWindow()[HOSTED_CREATOR_REGISTRATION_PROPERTY];
    document.body.innerHTML = '';
  });

  it('hands activation to the exact editor once, adopts that iframe, and delegates saves', async () => {
    const approvedTheme = await hostedApprovedTheme();
    const playTour = vi.fn(() => Promise.resolve());
    const stopTour = vi.fn();
    const playAuthoringPreview = vi.fn<(document: unknown, options: unknown) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const stopAuthoringPreview = vi.fn();
    previewRuntimeWindow().Lodariq = {
      playTour,
      stopTour,
      playAuthoringPreview,
      stopAuthoringPreview,
    };
    const creator = await loadRegisteredCreator();
    const input = activationInput();
    const activation = creator.activateLodariqAuthoring(input);

    const iframe = requireHostedIframe();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: peer });

    expect(input.activationGrant).toBe('');
    expect(iframe.src).toBe(`${LODARIQ_EDITOR_ORIGIN}/authoring.html`);
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(iframe.referrerPolicy).toBe('origin');
    expect(document.documentElement.outerHTML).not.toContain(ACTIVATION_GRANT);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    dispatchFromEditor(peer, editorReady(), 'https://forged.example');
    dispatchFromEditor({ postMessage: vi.fn() } as unknown as Window, editorReady());
    expect(peer.postMessage).not.toHaveBeenCalled();

    dispatchFromEditor(peer, editorReady());
    dispatchFromEditor(peer, editorReady());
    const handoffs = outboundMessages(peer, 'hosted-authoring.activation.handoff');
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]).toMatchObject({
      activationGrant: ACTIVATION_GRANT,
      apiOrigin: 'https://api.lodariq.com',
      customerOrigin: window.location.origin,
      documentIntent: { kind: 'existing', documentId: tourDocument.id },
      editorOrigin: LODARIQ_EDITOR_ORIGIN,
      installationId: INSTALLATION_ID,
      pageContext: { pathname: '/' },
      readyRequestId: READY_REQUEST_ID,
      state: READY_STATE,
    });
    const peerPostMessage = peer.postMessage as ReturnType<typeof vi.fn>;
    expect(peerPostMessage.mock.calls[0]?.[1]).toBe(LODARIQ_EDITOR_ORIGIN);

    const handoff = handoffs[0] as {
      handoffRequestId: string;
      readyRequestId: string;
      state: string;
    };
    dispatchFromEditor(peer, sessionReady(handoff, approvedTheme));
    await activation;

    const panelHost = document.querySelector('lodariq-authoring-panel');
    expect(panelHost?.querySelector('iframe')).toBe(iframe);
    expect(iframe.hasAttribute('aria-hidden')).toBe(false);
    expect(iframe.dataset['lodariqEditorZoom']).toBe('100');
    expect(iframe.style.transform).toBe('scale(1)');
    expect(iframe.style.width).toBe('100%');
    expect(iframe.style.height).toBe('100%');
    expect(outboundMessages(peer, 'authoring.init')).toHaveLength(1);
    expect(document.documentElement.outerHTML).not.toContain(ACTIVATION_GRANT);

    dispatchEstablishedMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: sessionContext(approvedTheme).sessionId,
      documentId: tourDocument.id,
      correlationId: 'hosted_runtime_preview_1',
      type: 'authoring.preview.request',
      mode: 'full',
    });
    await vi.waitFor(() => expect(playAuthoringPreview).toHaveBeenCalledOnce());
    expect(playTour).not.toHaveBeenCalled();
    expect(stopTour).not.toHaveBeenCalled();
    expect(playAuthoringPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: tourDocument.id,
        theme: expect.objectContaining({
          themeVersionId: approvedTheme.themeVersionId,
          contentHash: approvedTheme.contentHash,
        }),
      }),
      expect.objectContaining({
        ownerId: expect.stringMatching(/^authoring_preview_owner_/),
      }),
    );
    await vi.waitFor(() =>
      expect(outboundMessages(peer, 'ack')).toContainEqual(
        expect.objectContaining({ ackOf: 'hosted_runtime_preview_1' }),
      ),
    );

    dispatchEstablishedMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: sessionContext().sessionId,
      documentId: tourDocument.id,
      correlationId: 'hosted_patch_1',
      type: 'preview.patch',
      blockId: tourDocument.blocks[0]?.id ?? 'step_1',
      patch: { ops: [{ op: 'setDocumentTitle', title: 'Persisted hosted tour' }] },
    });
    expect(saveStateLabel()).toBe('Saving draft…');

    await waitForAutosave();
    const autosave = lastOutboundMessage(peer, 'authoring.save.request');
    expect(autosave).toBeDefined();
    expect(saveStateLabel()).toBe('Saving draft…');
    dispatchEstablishedMessage(peer, saveResult(autosave!.correlationId));
    await flushMicrotasks();
    expect(saveStateLabel()).toBe('Draft saved');

    const closeButton = panelHost?.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-panel-action="close-panel"]',
    );
    closeButton?.click();
    await flushMicrotasks();
    const closeRequest = lastItem(outboundMessages(peer, 'hosted-authoring.session.close.request'));
    expect(closeRequest).toMatchObject({
      documentId: tourDocument.id,
      mode: 'discard',
      sessionId: sessionContext().sessionId,
    });
    expect(outboundMessages(peer, 'authoring.save.request')).toHaveLength(1);
    expect(panelHost?.isConnected).toBe(true);
    dispatchFromEditor(peer, {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
      requestId: closeRequest?.['requestId'],
      sessionId: sessionContext().sessionId,
      documentId: tourDocument.id,
      ok: true,
      retryable: false,
    });
    await flushMicrotasks();
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
    const previewOwnerId = (
      playAuthoringPreview.mock.calls[0]?.[1] as { ownerId?: string } | undefined
    )?.ownerId;
    expect(previewOwnerId).toMatch(/^authoring_preview_owner_/);
    expect(stopAuthoringPreview).toHaveBeenCalledWith(previewOwnerId);
  });

  it('opens a credential-free browser when no document intent was chosen', async () => {
    const states: string[] = [];
    const recordState = (event: Event): void => {
      if (event instanceof CustomEvent && typeof event.detail === 'string')
        states.push(event.detail);
    };
    window.addEventListener(HOSTED_CREATOR_PANEL_STATE_EVENT, recordState);
    const creator = await loadRegisteredCreator();
    const input = activationInput();
    delete input.documentIntent;
    delete input.context.documentIntent;
    const activation = creator.activateLodariqAuthoring(input);
    const iframe = requireHostedIframe();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: peer });

    dispatchFromEditor(peer, editorReady());
    const handoff = outboundMessages(peer, 'hosted-authoring.activation.handoff')[0] as {
      handoffRequestId: string;
      readyRequestId: string;
      state: string;
    };
    expect(outboundMessages(peer, 'hosted-authoring.activation.handoff')[0]).not.toHaveProperty(
      'documentIntent',
    );

    dispatchFromEditor(peer, {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_BROWSE_READY_TYPE,
      readyRequestId: handoff.readyRequestId,
      handoffRequestId: handoff.handoffRequestId,
      state: handoff.state,
    });
    await activation;

    expect(document.querySelector('lodariq-hosted-browser iframe')).toBe(iframe);
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
    expect(lastItem(states)).toBe('browsing');
    window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_TOGGLE_EVENT));
    expect(document.querySelector('lodariq-hosted-browser')?.getAttribute('data-minimized')).toBe(
      'true',
    );
    expect(lastItem(states)).toBe('minimized');
    window.dispatchEvent(new CustomEvent(HOSTED_CREATOR_PANEL_TOGGLE_EVENT));
    expect(lastItem(states)).toBe('browsing');

    dispatchFromEditor(peer, sessionReady(handoff));
    await flushMicrotasks();
    expect(document.querySelector('lodariq-hosted-browser')).toBeNull();
    expect(document.querySelector('lodariq-authoring-panel iframe')).toBe(iframe);
    expect(lastItem(states)).toBe('open');

    document
      .querySelector<HTMLElement>('lodariq-authoring-panel')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-panel-action="close-panel"]')
      ?.click();
    await flushMicrotasks();
    const closeRequest = lastItem(outboundMessages(peer, 'hosted-authoring.session.close.request'));
    dispatchFromEditor(peer, {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
      requestId: closeRequest?.['requestId'],
      sessionId: sessionContext().sessionId,
      documentId: tourDocument.id,
      ok: true,
      retryable: false,
    });
    await flushMicrotasks();
    expect(lastItem(states)).toBe('closed');
    window.removeEventListener(HOSTED_CREATOR_PANEL_STATE_EVENT, recordState);
  });

  it('uses an owned direct TourPlayer fallback when no installed preview API is available', async () => {
    vi.spyOn(TourPlayer.prototype, 'waitUntilReady').mockResolvedValue(undefined);
    const target = document.createElement('button');
    target.dataset['lodariqId'] = 'new-project';
    target.setAttribute('aria-label', 'New project');
    target.getBoundingClientRect = () =>
      ({
        x: 20,
        y: 40,
        left: 20,
        top: 40,
        right: 220,
        bottom: 88,
        width: 200,
        height: 48,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(target);

    const creator = await loadRegisteredCreator();
    const activation = creator.activateLodariqAuthoring(activationInput());
    const iframe = requireHostedIframe();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: peer });
    dispatchFromEditor(peer, editorReady());
    const handoff = outboundMessages(peer, 'hosted-authoring.activation.handoff')[0] as {
      handoffRequestId: string;
      readyRequestId: string;
      state: string;
    };
    dispatchFromEditor(peer, sessionReady(handoff));
    await activation;

    dispatchEstablishedMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: sessionContext().sessionId,
      documentId: tourDocument.id,
      correlationId: 'hosted_direct_preview_1',
      type: 'authoring.preview.request',
      mode: 'full',
    });
    await vi.waitFor(() =>
      expect(outboundMessages(peer, 'ack')).toContainEqual(
        expect.objectContaining({ ackOf: 'hosted_direct_preview_1' }),
      ),
    );

    expect(
      document
        .querySelector('lodariq-tour')
        ?.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE),
    ).toMatch(/^authoring_preview_owner_/);
  });

  it('persists before Save & exit revokes and closes the hosted session', async () => {
    const creator = await loadRegisteredCreator();
    const activation = creator.activateLodariqAuthoring(activationInput());
    const iframe = requireHostedIframe();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: peer });
    dispatchFromEditor(peer, editorReady());
    const handoff = outboundMessages(peer, 'hosted-authoring.activation.handoff')[0] as {
      handoffRequestId: string;
      readyRequestId: string;
      state: string;
    };
    dispatchFromEditor(peer, sessionReady(handoff));
    await activation;

    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    host?.shadowRoot?.querySelector<HTMLButtonElement>('[data-panel-action="close"]')?.click();
    await flushMicrotasks();
    const save = lastOutboundMessage(peer, 'authoring.save.request');
    expect(save).toBeDefined();
    expect(host?.isConnected).toBe(true);

    dispatchEstablishedMessage(peer, saveResult(save!.correlationId));
    await flushMicrotasks();
    const closeRequest = lastItem(outboundMessages(peer, 'hosted-authoring.session.close.request'));
    expect(closeRequest).toMatchObject({ mode: 'save-and-exit' });
    expect(host?.isConnected).toBe(true);

    dispatchFromEditor(peer, {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
      requestId: closeRequest?.['requestId'],
      sessionId: sessionContext().sessionId,
      documentId: tourDocument.id,
      ok: true,
      retryable: false,
    });
    await flushMicrotasks();
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
  });

  it('rejects forged bindings, mismatched themes, and terminal failure without credentials', async () => {
    const creator = await loadRegisteredCreator();
    const input = activationInput();
    const activation = creator.activateLodariqAuthoring(input);
    const iframe = requireHostedIframe();
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: peer });

    dispatchFromEditor(peer, editorReady());
    const handoff = outboundMessages(peer, 'hosted-authoring.activation.handoff')[0] as {
      handoffRequestId: string;
      readyRequestId: string;
      state: string;
    };
    const mismatchedThemeMessage = sessionReady(handoff, await hostedApprovedTheme());
    mismatchedThemeMessage.context.themeVersionId =
      LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId;
    dispatchFromEditor(peer, mismatchedThemeMessage);
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();

    dispatchFromEditor(peer, {
      ...sessionReady(handoff),
      state: 'forged-state-'.padEnd(48, 'f'),
    });
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();

    dispatchFromEditor(peer, {
      protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
      type: HOSTED_AUTHORING_SESSION_FAILED_TYPE,
      readyRequestId: handoff.readyRequestId,
      handoffRequestId: handoff.handoffRequestId,
      state: handoff.state,
      customerOrigin: window.location.origin,
      code: 'session-unavailable',
      retryable: true,
    });

    await expect(activation).rejects.toThrow('Lodariq hosted authoring could not start');
    expect(iframe.isConnected).toBe(false);
    expect(input.activationGrant).toBe('');
    expect(document.documentElement.outerHTML).not.toContain(ACTIVATION_GRANT);
  });

  it('rejects unapproved API origins before creating an iframe', async () => {
    const creator = await loadRegisteredCreator();
    const input = activationInput();
    input.apiOrigin = 'https://customer.example';

    expect(() => creator.activateLodariqAuthoring(input)).toThrow(
      'Lodariq hosted authoring activation is invalid',
    );
    expect(document.querySelector('iframe')).toBeNull();
  });
});

async function loadRegisteredCreator(): Promise<HostedCreatorModule> {
  let registered: HostedCreatorModule | null = null;
  registrationWindow()[HOSTED_CREATOR_REGISTRATION_PROPERTY] = (value: unknown) => {
    registered = value as HostedCreatorModule;
  };
  await import('@lodariq/sdk-authoring/hosted-entry');
  if (!registered) throw new Error('hosted creator did not register');
  delete registrationWindow()[HOSTED_CREATOR_REGISTRATION_PROPERTY];
  return registered;
}

function activationInput(): HostedCreatorActivation {
  return {
    activationGrant: ACTIVATION_GRANT,
    apiOrigin: 'https://api.lodariq.com',
    context: activationContext(),
    documentIntent: { kind: 'existing', documentId: tourDocument.id },
  };
}

function activationContext(): AuthoringActivationGrantContext {
  return {
    grantId: 'grant_hosted_creator',
    requestId: 'request_hosted_creator',
    installationId: INSTALLATION_ID,
    workspaceId: tourDocument.workspaceId,
    environmentId: 'environment_staging_123',
    environment: 'staging',
    customerOrigin: window.location.origin,
    editorOrigin: LODARIQ_EDITOR_ORIGIN,
    creatorId: 'creator_hosted_123',
    capabilities: [
      AUTHORING_ACTIVATION_CAPABILITIES.CREATE_DOCUMENT,
      AUTHORING_ACTIVATION_CAPABILITIES.LIST_DOCUMENTS,
      AUTHORING_ACTIVATION_CAPABILITIES.SELECT_DOCUMENT,
    ],
    documentIntent: { kind: 'existing', documentId: tourDocument.id },
    expiresAt: FUTURE_DATE,
  };
}

function sessionContext(theme: BrandThemeSnapshot = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1) {
  return {
    sessionId: 'authoring_session_hosted_123',
    correlationId: 'authoring_correlation_hosted_123',
    compilerVersion: COMPILER_VERSION,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
    themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
    themeVersionId: theme.themeVersionId,
    workspaceId: tourDocument.workspaceId,
    environmentId: 'environment_staging_123',
    environment: 'staging' as const,
    documentId: tourDocument.id,
    customerOrigin: window.location.origin,
    editorOrigin: LODARIQ_EDITOR_ORIGIN,
    creatorId: 'creator_hosted_123',
    capabilities: [
      AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
      AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
      AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
      AUTHORING_SESSION_CAPABILITIES.SELECT_TARGET,
    ],
    expiresAt: FUTURE_DATE,
  };
}

function editorReady() {
  return {
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_EDITOR_READY_TYPE,
    readyRequestId: READY_REQUEST_ID,
    state: READY_STATE,
    editorOrigin: LODARIQ_EDITOR_ORIGIN,
  };
}

function sessionReady(
  binding: {
    handoffRequestId: string;
    readyRequestId: string;
    state: string;
  },
  theme: BrandThemeSnapshot = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
) {
  return {
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_SESSION_READY_TYPE,
    readyRequestId: binding.readyRequestId,
    handoffRequestId: binding.handoffRequestId,
    state: binding.state,
    context: sessionContext(theme),
    document: structuredClone(tourDocument),
    theme: structuredClone(theme),
  };
}

async function hostedApprovedTheme(): Promise<BrandThemeSnapshot> {
  const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  theme.themeId = 'theme_hosted_approved';
  theme.themeVersionId = 'themev_hosted_approved_7';
  theme.version = 7;
  theme.name = 'Hosted approved theme';
  theme.definition.tokens.modes.light.colors.accent = '#0b735d';
  theme.contentHash = await computeBrandThemeContentHash(theme);
  return theme;
}

function previewRuntimeWindow(): {
  Lodariq?: {
    playTour: () => Promise<void>;
    stopTour: () => void;
    playAuthoringPreview?: (document: unknown, options: unknown) => Promise<void>;
    stopAuthoringPreview?: (ownerId: string) => void;
  };
} {
  return window as unknown as {
    Lodariq?: {
      playTour: () => Promise<void>;
      stopTour: () => void;
      playAuthoringPreview?: (document: unknown, options: unknown) => Promise<void>;
      stopAuthoringPreview?: (ownerId: string) => void;
    };
  };
}

function saveResult(requestCorrelationId: string): BridgeMessage {
  const document = structuredClone(tourDocument);
  document.title = 'Persisted hosted tour';
  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: sessionContext().sessionId,
    documentId: tourDocument.id,
    correlationId: `save_result_${requestCorrelationId}`,
    type: 'authoring.save.result',
    requestCorrelationId,
    document,
  };
}

function requireHostedIframe(): HTMLIFrameElement {
  const iframe = document.querySelector<HTMLIFrameElement>(
    `iframe[src="${LODARIQ_EDITOR_ORIGIN}/authoring.html"]`,
  );
  if (!iframe) throw new Error('hosted editor iframe missing');
  return iframe;
}

function dispatchFromEditor(
  source: Window,
  data: unknown,
  origin: string = LODARIQ_EDITOR_ORIGIN,
): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}

function dispatchEstablishedMessage(source: Window, data: BridgeMessage): void {
  dispatchFromEditor(source, data);
}

function outboundMessages(peer: Window, type: string): Record<string, unknown>[] {
  const postMessage = peer.postMessage as ReturnType<typeof vi.fn>;
  return postMessage.mock.calls
    .map((call) => call[0])
    .filter(
      (message): message is Record<string, unknown> =>
        typeof message === 'object' && message !== null && message['type'] === type,
    );
}

function lastOutboundMessage(peer: Window, type: string): BridgeMessage | undefined {
  return lastItem(outboundMessages(peer, type)) as BridgeMessage | undefined;
}

function lastItem<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

function saveStateLabel(): string | null | undefined {
  return document
    .querySelector('lodariq-authoring-panel')
    ?.shadowRoot?.querySelector('[data-save-state-label]')?.textContent;
}

async function waitForAutosave(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 700));
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
}

function registrationWindow(): Window & {
  [HOSTED_CREATOR_REGISTRATION_PROPERTY]?: (module: unknown) => void;
} {
  return window as Window & {
    [HOSTED_CREATOR_REGISTRATION_PROPERTY]?: (module: unknown) => void;
  };
}
