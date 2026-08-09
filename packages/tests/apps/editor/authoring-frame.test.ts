// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_ACTIVATION_GRANT_HEADER,
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_SESSION_CAPABILITIES,
  AUTHORING_SESSION_HEADER,
  BRAND_THEME_CONTRACT_VERSION,
  BRIDGE_PROTOCOL_VERSION,
  COMPILER_VERSION,
  HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE,
  HOSTED_AUTHORING_BRIDGE_PROTOCOL,
  HOSTED_AUTHORING_BROWSE_READY_TYPE,
  HOSTED_AUTHORING_EDITOR_READY_TYPE,
  HOSTED_AUTHORING_SESSION_READY_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
  HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LODARIQ_EDITOR_ORIGIN,
  LODARIQ_STAGING_API_ORIGIN,
  RENDERER_CONTRACT_VERSION,
  type HostedAuthoringEditorReadyMessage,
  type HostedAuthoringSessionReadyMessage,
  type LodariqDocument,
} from '@lodariq/schema';

const PARENT_ORIGIN = 'https://staging.lodariq.com';
const INSTALLATION_ID = 'ins_pub_abcdefghijklmnop';
const ACTIVATION_GRANT = `lod_activation_${'a'.repeat(48)}`;
const SESSION_TOKEN = `lod_authoring_${'s'.repeat(48)}`;

describe('hosted editor authoring frame', () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.replaceState(null, '', '/');
    document.head.innerHTML = '';
    document.body.innerHTML =
      '<div id="authoring" data-state="waiting">Waiting for Lodariq authoring session.</div>';
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://staging.lodariq.com/products',
    });
    delete (window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted;
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ignores init messages from origins other than the embedding host', async () => {
    await import('../../../../apps/editor/src/authoring-frame');

    window.dispatchEvent(initEvent('https://evil.example'));

    expect((window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted).toBe(false);
    expect(document.getElementById('authoring')?.getAttribute('data-state')).toBe('waiting');
  });

  it('mounts only after a validated authoring init bridge message', async () => {
    await import('../../../../apps/editor/src/authoring-frame');

    window.dispatchEvent(initEvent('https://staging.lodariq.com'));

    expect((window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted).toBe(true);
    expect(document.getElementById('authoring')?.getAttribute('data-state')).toBeNull();
  });

  it('trusts only the exact referrer origin and exact parent window for pre-session handoff', async () => {
    window.history.replaceState(null, '', '/authoring.html?parentOrigin=https://evil.example');
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    await import('../../../../apps/editor/src/authoring-frame');
    const ready = editorReadyMessage(postMessage);
    const handoff = activationHandoff(ready);

    window.dispatchEvent(
      handoffEvent(handoff, {
        origin: 'https://evil.example',
        source: window.parent,
      }),
    );
    window.dispatchEvent(
      handoffEvent(handoff, {
        origin: PARENT_ORIGIN,
        source: {} as Window,
      }),
    );
    window.dispatchEvent(
      handoffEvent(
        { ...handoff, apiOrigin: 'https://staging-api.lodariq.com.evil.example' },
        { origin: PARENT_ORIGIN, source: window.parent },
      ),
    );

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consumes one matching activation handoff and loads the canonical API document once', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const canonicalDocument = editorDocument();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authoringSessionResult(), 201))
      .mockResolvedValueOnce(jsonResponse(authoringDocumentPayload(canonicalDocument)));
    vi.stubGlobal('fetch', fetchMock);
    await import('../../../../apps/editor/src/authoring-frame');
    const ready = editorReadyMessage(postMessage);
    const handoff = activationHandoff(ready);

    window.dispatchEvent(handoffEvent(handoff));
    window.dispatchEvent(handoffEvent(handoff));

    await vi.waitFor(() => expect(hostedSessionReadyMessages(postMessage)).toHaveLength(1));
    expect(hostedSessionReadyMessages(postMessage)[0]?.theme).toEqual(
      LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/sessions`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: {
        'content-type': 'application/json',
        [AUTHORING_ACTIVATION_GRANT_HEADER]: ACTIVATION_GRANT,
      },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      installationId: INSTALLATION_ID,
      customerOrigin: PARENT_ORIGIN,
      pageContext: { pathname: '/products' },
      selectionScope: 'page',
      documentIntent: { kind: 'existing', documentId: canonicalDocument.id },
    });
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe(
      `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/document`,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
      headers: { [AUTHORING_SESSION_HEADER]: SESSION_TOKEN },
    });

    const outbound = JSON.stringify(postMessage.mock.calls.map(([message]) => message));
    expect(outbound).not.toContain(ACTIVATION_GRANT);
    expect(outbound).not.toContain(SESSION_TOKEN);
    expect(globalThis.document.documentElement.outerHTML).not.toContain(SESSION_TOKEN);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('browses page summaries inside the iframe before consuming the activation grant', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const summary = {
      id: editorDocument().id,
      title: 'Onboarding from the database',
      type: 'tour' as const,
      status: 'draft' as const,
      updatedAt: '2099-08-07T11:00:00.000Z',
      releases: [],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          scope: 'page',
          pageContext: { pathname: '/products' },
          documents: [summary],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          scope: 'workspace',
          pageContext: { pathname: '/products' },
          documents: [summary],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(authoringSessionResult(), 201))
      .mockResolvedValueOnce(jsonResponse(authoringDocumentPayload(editorDocument())));
    vi.stubGlobal('fetch', fetchMock);
    await import('../../../../apps/editor/src/authoring-frame');
    const ready = editorReadyMessage(postMessage);
    const handoff = activationHandoff(ready, null);

    window.dispatchEvent(handoffEvent(handoff));
    await vi.waitFor(() => expect(hostedBrowseReadyMessages(postMessage)).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/documents/query`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      installationId: INSTALLATION_ID,
      customerOrigin: PARENT_ORIGIN,
      pageContext: { pathname: '/products' },
      scope: 'page',
    });
    expect(document.getElementById('authoring')?.textContent).toContain(summary.title);
    expect(document.getElementById('authoring')?.textContent).toContain('Start Tour');
    expect(document.getElementById('authoring')?.textContent).toContain('Browse all workspace');
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain(summary.title);

    [...document.querySelectorAll<HTMLButtonElement>('.browse-secondary')]
      .find((button) => button.textContent === 'Browse all workspace')
      ?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(document.getElementById('authoring')?.textContent).toContain('All experiences'),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      scope: 'workspace',
    });

    document.querySelector<HTMLButtonElement>('.browse-row')?.click();
    await vi.waitFor(() => expect(hostedSessionReadyMessages(postMessage)).toHaveLength(1));
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      pageContext: { pathname: '/products' },
      selectionScope: 'workspace',
      documentIntent: { kind: 'existing', documentId: summary.id },
    });
  });

  it('best-effort revokes the unused activation when browse closes', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          scope: 'page',
          pageContext: { pathname: '/products' },
          documents: [],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await import('../../../../apps/editor/src/authoring-frame');
    const ready = editorReadyMessage(postMessage);
    const handoff = activationHandoff(ready, null);
    window.dispatchEvent(handoffEvent(handoff));
    await vi.waitFor(() => expect(hostedBrowseReadyMessages(postMessage)).toHaveLength(1));

    window.dispatchEvent(
      handoffEvent({
        protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
        type: 'hosted-authoring.browse.close.request',
        requestId: 'browse_close_request_1',
        readyRequestId: handoff.readyRequestId,
        handoffRequestId: handoff.handoffRequestId,
        state: handoff.state,
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe(
      `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/activation/revoke`,
    );
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      [AUTHORING_ACTIVATION_GRANT_HEADER]: ACTIVATION_GRANT,
    });
    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.some(
          ([value]) =>
            typeof value === 'object' &&
            value !== null &&
            'type' in value &&
            value.type === 'hosted-authoring.browse.close.result',
        ),
      ).toBe(true),
    );
  });

  it('awaits hosted API persistence before returning an explicit save result', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const document = editorDocument();
    const sessionUrl = `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/sessions`;
    const documentUrl = `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/document`;
    const releaseStateUrl = `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/release-state`;
    const revokeUrl = `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/sessions/authsess_hosted_editor/revoke`;
    let resolveSave: ((response: Response) => void) | undefined;
    const pendingSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = input.toString();
      const method = init?.method ?? 'GET';
      if (url === sessionUrl && method === 'POST') {
        return jsonResponse(authoringSessionResult(), 201);
      }
      if (url === documentUrl && method === 'GET') {
        return jsonResponse(authoringDocumentPayload(document));
      }
      if (url === releaseStateUrl && method === 'GET') {
        return jsonResponse({
          available: true,
          environment: 'staging',
          environmentId: 'env_staging',
          documentId: document.id,
          expectedGeneration: 0,
          draftArtifactId: null,
          draftContentHash: null,
          activeContentHash: null,
          state: 'no_saved_artifact',
          findings: [],
        });
      }
      if (url === documentUrl && method === 'POST') return pendingSave;
      if (url === revokeUrl && method === 'POST') {
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected hosted authoring request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    await import('../../../../apps/editor/src/authoring-frame');
    const ready = editorReadyMessage(postMessage);
    window.dispatchEvent(handoffEvent(activationHandoff(ready)));
    await vi.waitFor(() => expect(hostedSessionReadyMessages(postMessage)).toHaveLength(1));

    const sessionReady = hostedSessionReadyMessages(postMessage)[0]!;
    window.dispatchEvent(
      initEvent(PARENT_ORIGIN, {
        sessionId: sessionReady.context.sessionId,
        correlationId: sessionReady.context.correlationId,
        workspaceId: sessionReady.context.workspaceId,
        environment: sessionReady.context.environment,
        document: sessionReady.document,
      }),
    );
    expect((window as { __lodariqEditorMounted?: boolean }).__lodariqEditorMounted).toBe(true);

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: PARENT_ORIGIN,
        source: window.parent,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: sessionReady.context.sessionId,
          documentId: sessionReady.context.documentId,
          correlationId: 'title_commit_hosted_1',
          type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
          operation: { kind: 'setDocumentTitle', title: 'Persisted hosted change' },
        },
      }),
    );
    await Promise.resolve();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: PARENT_ORIGIN,
        source: window.parent,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: sessionReady.context.sessionId,
          documentId: sessionReady.context.documentId,
          correlationId: 'save_request_hosted_1',
          type: 'authoring.save.request',
        },
      }),
    );

    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => input.toString() === documentUrl && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(authoringSaveResults(postMessage)).toHaveLength(0);
    const saveRequest = fetchMock.mock.calls.find(
      ([input, init]) => input.toString() === documentUrl && init?.method === 'POST',
    )!;
    expect(saveRequest[1]).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [AUTHORING_SESSION_HEADER]: SESSION_TOKEN,
      },
    });
    const persistedPayload = JSON.parse(String(saveRequest[1]?.body)) as {
      document: LodariqDocument;
    };
    expect(persistedPayload.document.title).toBe('Persisted hosted change');

    resolveSave?.(jsonResponse(authoringDocumentPayload(persistedPayload.document)));
    await vi.waitFor(() => expect(authoringSaveResults(postMessage)).toHaveLength(1));
    expect(authoringSaveResults(postMessage)[0]).toMatchObject({
      requestCorrelationId: 'save_request_hosted_1',
      document: { title: 'Persisted hosted change' },
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: PARENT_ORIGIN,
        source: window.parent,
        data: {
          protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
          type: HOSTED_AUTHORING_SESSION_CLOSE_REQUEST_TYPE,
          requestId: 'hosted_session_close_1',
          sessionId: sessionReady.context.sessionId,
          documentId: sessionReady.context.documentId,
          mode: 'save-and-exit',
        },
      }),
    );
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => input.toString() === revokeUrl && init?.method === 'POST',
        ),
      ).toBe(true),
    );
    const revokeRequest = fetchMock.mock.calls.find(
      ([input, init]) => input.toString() === revokeUrl && init?.method === 'POST',
    )!;
    expect(revokeRequest[1]?.headers).toMatchObject({
      [AUTHORING_SESSION_HEADER]: SESSION_TOKEN,
    });
    await vi.waitFor(() =>
      expect(
        postMessage.mock.calls.some(
          ([value]) =>
            typeof value === 'object' &&
            value !== null &&
            'type' in value &&
            value.type === HOSTED_AUTHORING_SESSION_CLOSE_RESULT_TYPE,
        ),
      ).toBe(true),
    );
  });

  it('publishes the reviewed Tour artifact to staging from the authoring popup', async () => {
    const postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const document = publishableEditorDocument();
    const draftContentHash = `sha256-${'a'.repeat(64)}`;
    const releaseState = {
      available: true,
      environment: 'staging' as const,
      environmentId: 'env_staging',
      documentId: document.id,
      expectedGeneration: 3,
      draftArtifactId: 'artifact_reviewed_3',
      draftContentHash,
      activeContentHash: null,
      state: 'ready' as const,
      findings: [],
      visualCheck: null,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(authoringSessionResult({ publishToStaging: true }), 201))
      .mockResolvedValueOnce(jsonResponse(authoringDocumentPayload(document)))
      .mockResolvedValueOnce(jsonResponse(releaseState))
      .mockResolvedValueOnce(jsonResponse(authoringDocumentPayload(document)))
      .mockResolvedValueOnce(jsonResponse(releaseState))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            replayed: false,
            deployment: {
              workspaceId: 'wk_editor',
              environmentId: 'env_staging',
              documentId: document.id,
              state: 'active',
              generation: 4,
              activePublicationId: 'publication_4',
              updatedAt: '2099-08-07T12:00:00.000Z',
            },
            visualCheck: {
              report: {
                issues: [
                  {
                    code: 'long_copy_risk',
                    severity: 'warning',
                    stepIndex: 0,
                    nodeIndex: 0,
                    characterCount: 210,
                    recommendedMaximum: 180,
                  },
                ],
              },
            },
          },
          201,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    await import('../../../../apps/editor/src/authoring-frame');
    const ready = editorReadyMessage(postMessage);
    window.dispatchEvent(handoffEvent(activationHandoff(ready)));
    await vi.waitFor(() => expect(hostedSessionReadyMessages(postMessage)).toHaveLength(1));

    const sessionReady = hostedSessionReadyMessages(postMessage)[0]!;
    window.dispatchEvent(
      initEvent(PARENT_ORIGIN, {
        sessionId: sessionReady.context.sessionId,
        correlationId: sessionReady.context.correlationId,
        workspaceId: sessionReady.context.workspaceId,
        environment: sessionReady.context.environment,
        document: sessionReady.document,
      }),
    );

    await vi.waitFor(() =>
      expect(documentReleaseStatus()?.getAttribute('data-release-status')).toBe('ready'),
    );
    buttonWithText('Release options')?.click();
    await vi.waitFor(() => expect(buttonWithText('Publish to staging')).not.toBeNull());
    const publishButton = buttonWithText('Publish to staging');
    publishButton?.click();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    const releaseRequest = fetchMock.mock.calls[5]!;
    expect(releaseRequest[0].toString()).toBe(
      `${LODARIQ_STAGING_API_ORIGIN}/v1/authoring/publications`,
    );
    const releaseHeaders = new Headers(releaseRequest[1]?.headers);
    expect(releaseHeaders.get(AUTHORING_SESSION_HEADER)).toBe(SESSION_TOKEN);
    expect(releaseHeaders.get('Idempotency-Key')).toMatch(/^staging_publish_/u);
    expect(releaseHeaders.get('x-lodariq-correlation-id')).toMatch(/^release_/u);
    expect(JSON.parse(String(releaseRequest[1]?.body))).toEqual({
      expectedGeneration: 3,
      expectedArtifactId: 'artifact_reviewed_3',
      expectedContentHash: draftContentHash,
    });
    await vi.waitFor(() =>
      expect(activePanelMode()?.textContent).toContain('Exact staging artifact'),
    );
    expect(activePanelMode()?.textContent).toContain('Current');
  });
});

function documentReleaseStatus(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-label="Release status"]');
}

function activePanelMode(): HTMLElement | null {
  return (
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Back to authoring"]')
      ?.closest<HTMLElement>('section') ?? null
  );
}

function buttonWithText(label: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes(label),
    ) ?? null
  );
}

function initEvent(
  origin: string,
  overrides: Partial<{
    sessionId: string;
    correlationId: string;
    workspaceId: string;
    environment: 'development' | 'staging';
    document: LodariqDocument;
  }> = {},
): MessageEvent {
  const document = overrides.document ?? editorDocument();
  return new MessageEvent('message', {
    data: {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: overrides.sessionId ?? 'authsess_editor',
      documentId: document.id,
      correlationId: overrides.correlationId ?? 'authoring_init_1',
      type: 'authoring.init',
      workspaceId: overrides.workspaceId ?? 'wk_editor',
      environment: overrides.environment ?? 'staging',
      document,
    },
    origin,
    source: window.parent,
  });
}

function activationHandoff(
  ready: HostedAuthoringEditorReadyMessage,
  documentIntent: { kind: 'existing'; documentId: string } | null = {
    kind: 'existing',
    documentId: editorDocument().id,
  },
) {
  return {
    protocol: HOSTED_AUTHORING_BRIDGE_PROTOCOL,
    type: HOSTED_AUTHORING_ACTIVATION_HANDOFF_TYPE,
    readyRequestId: ready.readyRequestId,
    handoffRequestId: 'handoff_hosted_1',
    state: ready.state,
    editorOrigin: LODARIQ_EDITOR_ORIGIN,
    apiOrigin: LODARIQ_STAGING_API_ORIGIN,
    customerOrigin: PARENT_ORIGIN,
    installationId: INSTALLATION_ID,
    pageContext: { pathname: '/products' },
    ...(documentIntent ? { documentIntent } : {}),
    activationGrant: ACTIVATION_GRANT,
  };
}

function handoffEvent(
  data: unknown,
  event: { origin?: string; source?: Window } = {},
): MessageEvent {
  return new MessageEvent('message', {
    data,
    origin: event.origin ?? PARENT_ORIGIN,
    source: event.source ?? window.parent,
  });
}

interface RecordedMessages {
  readonly mock: {
    readonly calls: ReadonlyArray<readonly unknown[]>;
  };
}

function editorReadyMessage(postMessage: RecordedMessages): HostedAuthoringEditorReadyMessage {
  const message = postMessage.mock.calls
    .map(([value]) => value)
    .find(
      (value): value is HostedAuthoringEditorReadyMessage =>
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === HOSTED_AUTHORING_EDITOR_READY_TYPE,
    );
  expect(message).toBeTruthy();
  return message!;
}

function authoringSessionResult(options: { publishToStaging?: boolean } = {}) {
  return {
    authoringSessionToken: SESSION_TOKEN,
    context: {
      sessionId: 'authsess_hosted_editor',
      correlationId: 'authoring_hosted_editor',
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      themeContractVersion: BRAND_THEME_CONTRACT_VERSION,
      themeVersionId: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1.themeVersionId,
      workspaceId: 'wk_editor',
      environmentId: 'env_staging',
      environment: 'staging' as const,
      documentId: editorDocument().id,
      customerOrigin: PARENT_ORIGIN,
      editorOrigin: LODARIQ_EDITOR_ORIGIN,
      creatorId: 'user_editor',
      capabilities: [
        AUTHORING_SESSION_CAPABILITIES.READ_DOCUMENT,
        AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
        AUTHORING_SESSION_CAPABILITIES.WRITE_DOCUMENT,
        AUTHORING_SESSION_CAPABILITIES.PREVIEW_DOCUMENT,
        ...(options.publishToStaging ? [AUTHORING_SESSION_CAPABILITIES.PUBLISH_STAGING] : []),
      ],
      expiresAt: '2099-08-07T12:00:00.000Z',
    },
  };
}

function hostedSessionReadyMessages(postMessage: RecordedMessages) {
  return postMessage.mock.calls
    .map(([value]) => value)
    .filter(
      (value): value is HostedAuthoringSessionReadyMessage =>
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === HOSTED_AUTHORING_SESSION_READY_TYPE,
    );
}

function hostedBrowseReadyMessages(postMessage: RecordedMessages) {
  return postMessage.mock.calls
    .map(([value]) => value)
    .filter(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === HOSTED_AUTHORING_BROWSE_READY_TYPE,
    );
}

function authoringSaveResults(postMessage: RecordedMessages) {
  return postMessage.mock.calls
    .map(([value]) => value)
    .filter(
      (
        value,
      ): value is {
        type: 'authoring.save.result';
        requestCorrelationId: string;
        document: LodariqDocument;
      } =>
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        value.type === 'authoring.save.result',
    );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function authoringDocumentPayload(document: LodariqDocument) {
  return {
    document,
    theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  };
}

function editorDocument(): LodariqDocument {
  return {
    id: 'doc_tour_welcome',
    workspaceId: 'wk_editor',
    type: 'tour',
    status: 'draft',
    title: 'Hosted editor test',
    trigger: { type: 'manual' },
    audience: { environments: ['staging'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: 'step_1',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'tooltip_1',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'ready',
            children: [
              {
                id: 'heading_1',
                type: 'heading',
                content: 'Hosted editor',
                props: { level: 2 },
                status: 'ready',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

function publishableEditorDocument(): LodariqDocument {
  const document = editorDocument();
  document.targets = [
    {
      id: 'target_publish',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Create project',
        stableAttributes: { 'data-testid': 'create-project' },
      },
    },
  ];
  const tooltip = document.blocks[0]?.children[0];
  if (!tooltip) throw new Error('Hosted editor tooltip missing');
  tooltip.props = { ...tooltip.props, targetId: 'target_publish' };
  return document;
}
