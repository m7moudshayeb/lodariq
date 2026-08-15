// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RELEASE_RECOVERY_FAILURE_MESSAGES,
  type BrandThemeSnapshot,
  type CompiledDocument,
  type LodariqDocument,
  type SdkInstallContext,
} from '@lodariq/schema';
import { computeBrandThemeContentHash } from '@lodariq/compiler';
import { installCreatorLodariqFromScript } from '@lodariq/sdk-authoring/creator-install';

const DOCUMENT_UPDATED_AT = '2099-08-07T11:00:00.000Z';

describe('creator SDK install', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lodariq-authoring-panel-open');
    delete window.Lodariq;
    vi.unstubAllGlobals();
  });

  it('does not install without an explicit creator launch script', async () => {
    await expect(installCreatorLodariqFromScript()).resolves.toBeNull();
    expect(window.Lodariq).toBeUndefined();
  });

  it('keeps the creator toolbar hidden when bootstrap does not enable authoring', async () => {
    const api = await installCreatorLodariqFromScript({
      script: createCreatorScript(),
      installOptions: {
        fetchInstallContext: async () => installContext({ authoringEnabled: false }),
      },
    });

    expect(api?.authoring.enabled).toBe(false);
    expect(document.querySelector('[data-lodariq-creator-toolbar="true"]')).toBeNull();
  });

  it('installs a creator-only toolbar and opens the hosted authoring iframe', async () => {
    const approvedTheme = await approvedThemeFixture();
    const statefulTarget = document.createElement('button');
    statefulTarget.type = 'button';
    statefulTarget.dataset['testid'] = 'stateful-project-action';
    statefulTarget.textContent = 'Create project';
    statefulTarget.getBoundingClientRect = () =>
      ({
        x: 120,
        y: 120,
        left: 120,
        top: 120,
        right: 280,
        bottom: 168,
        width: 160,
        height: 48,
        toJSON: () => ({}),
      }) as DOMRect;
    const main = document.createElement('main');
    main.appendChild(statefulTarget);
    document.body.appendChild(main);
    const getTargetStateId = vi.fn(() => 'workspace.expanded');
    let compiledPreview: CompiledDocument | null = null;
    class PreviewPlayer {
      constructor(document: CompiledDocument) {
        compiledPreview = document;
      }
      start(): void {}
      stop(): void {}
      waitUntilReady(): Promise<void> {
        return Promise.resolve();
      }
    }
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'GET') {
        return {
          ok: true,
          json: async () => authoringDocumentPayload(approvedTheme),
        };
      }
      return {
        ok: true,
        json: async () => authoringDocumentPayload(approvedTheme),
      };
    });
    vi.stubGlobal('fetch', fetch);
    const api = await installCreatorLodariqFromScript({
      script: createCreatorScript(),
      getTargetStateId,
      installOptions: {
        fetchInstallContext: async () => installContext({ authoringEnabled: true }),
        loadTourRenderer: async () => ({ TourPlayer: PreviewPlayer }) as never,
      },
    });

    expect(api?.authoring).toEqual({
      enabled: true,
      iframeSrc: 'https://staging-editor.lodariq.io/authoring.html',
    });
    const toolbar = document.querySelector<HTMLButtonElement>(
      '[data-lodariq-creator-toolbar="true"]',
    );
    expect(toolbar?.textContent).toBe('LQ');

    toolbar?.click();
    document
      .querySelector<HTMLButtonElement>(
        '[data-lodariq-launcher-action-id="edit-current-experience"]',
      )
      ?.click();
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        'https://api.lodariq.io/v1/sdk/authoring/document',
        expect.objectContaining({ method: 'GET', credentials: 'omit' }),
      ),
    );

    await vi.waitFor(() =>
      expect(document.querySelector('lodariq-authoring-panel')).toBeInstanceOf(HTMLElement),
    );

    const panel = document.querySelector('lodariq-authoring-panel');
    const iframe = panel?.querySelector<HTMLIFrameElement>('iframe[title="Lodariq authoring"]');
    expect(panel).toBeInstanceOf(HTMLElement);
    const iframeUrl = new URL(iframe?.src ?? '');
    expect(`${iframeUrl.origin}${iframeUrl.pathname}`).toBe(
      'https://staging-editor.lodariq.io/authoring.html',
    );
    expect(iframeUrl.searchParams.get('parentOrigin')).toBe(window.location.origin);
    expect(document.documentElement.getAttribute('data-lodariq-authoring-panel-open')).toBe('true');

    const peer = { postMessage: vi.fn() } as unknown as Window;
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(compiledPreview).not.toBeNull());
    const preview = compiledPreview as CompiledDocument | null;
    expect(preview && 'theme' in preview ? preview.theme : null).toEqual(approvedTheme);
    const initMessage = vi
      .mocked(peer.postMessage)
      .mock.calls.map((call) => call[0] as Record<string, unknown>)
      .find((message) => message['type'] === 'authoring.init');
    expect(initMessage).toMatchObject({
      theme: approvedTheme,
      releaseStateCapability: 'document:read-release-state',
      stagingPublicationCapability: 'document:publish-staging',
    });
    expect(JSON.stringify(initMessage)).not.toContain('lod_staging_token');
    expect(JSON.stringify(initMessage)).not.toContain('lod_authoring_session');
    expect(JSON.stringify(initMessage)).not.toContain('/v1/sdk/authoring/release-state');

    dispatchEditorMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_creator',
      documentId: 'doc_tour_welcome',
      correlationId: 'creator_stateful_target_pick',
      type: 'target.pick.start',
      blockId: 'block_step_1',
      requiredAction: 'observe-click',
    });
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-lodariq-target-picker')).toBe('active'),
    );
    statefulTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(outboundEditorMessage(peer, 'target.pick.result')).toBeDefined());
    const targetPickResult = outboundEditorMessage(peer, 'target.pick.result');
    expect(
      (
        targetPickResult?.['identity'] as
          { visualTopologies?: Array<{ stateId?: string }> } | undefined
      )?.visualTopologies?.[0]?.stateId,
    ).toBe('workspace.expanded');
    expect(getTargetStateId).toHaveBeenCalledTimes(2);
    const targetPickCorrelationId = targetPickResult?.['correlationId'];
    if (typeof targetPickCorrelationId !== 'string') {
      throw new Error('Target pick correlation ID missing');
    }
    dispatchEditorMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_creator',
      documentId: 'doc_tour_welcome',
      correlationId: 'ack_creator_stateful_target_pick',
      type: 'ack',
      ackOf: targetPickCorrelationId,
    });

    dispatchEditorMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_creator',
      documentId: 'doc_tour_welcome',
      correlationId: 'creator_save_and_exit_1',
      type: AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
    });
    await vi.waitFor(() =>
      expect(outboundEditorMessages(peer, 'ack')).toContainEqual(
        expect.objectContaining({ ackOf: 'creator_save_and_exit_1' }),
      ),
    );
    await vi.waitFor(() =>
      expect(peer.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'authoring.save.request' }),
        'https://staging-editor.lodariq.io',
      ),
    );
    const saveRequest = vi
      .mocked(peer.postMessage)
      .mock.calls.map((call) => call[0] as { type?: string; correlationId?: string })
      .find((message) => message.type === 'authoring.save.request');
    if (!saveRequest?.correlationId) throw new Error('save request missing');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: 'authsess_creator',
          documentId: 'doc_tour_welcome',
          correlationId: 'authoring_save_result_1',
          type: 'authoring.save.result',
          requestCorrelationId: saveRequest.correlationId,
          document: savedDocument(),
        },
        origin: 'https://staging-editor.lodariq.io',
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const loadInit = fetch.mock.calls[0]?.[1];
    const saveInit = fetch.mock.calls[1]?.[1];
    const loadHeaders = loadInit?.headers as Headers;
    const saveHeaders = saveInit?.headers as Headers;
    expect(loadHeaders.get('authorization')).toBe('Bearer lod_staging_token');
    expect(loadHeaders.get('x-lodariq-authoring-session')).toBe('lod_authoring_session');
    expect(saveInit).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(saveHeaders.get('authorization')).toBe('Bearer lod_staging_token');
    expect(saveHeaders.get('content-type')).toBe('application/json');
    expect(saveHeaders.get('x-lodariq-authoring-session')).toBe('lod_authoring_session');
    expect(JSON.parse(saveInit?.body as string)).toEqual({
      document: savedDocument(),
      expectedDocumentUpdatedAt: DOCUMENT_UPDATED_AT,
    });
  });

  it('does not open authoring when the loaded document does not match the bootstrap context', async () => {
    const mismatchedDocument = { ...savedDocument(), workspaceId: 'wk_other' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          document: mismatchedDocument,
          documentUpdatedAt: DOCUMENT_UPDATED_AT,
          theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        }),
      })),
    );
    const errors: unknown[] = [];
    window.addEventListener('lodariq:authoring-error', (event) => {
      errors.push((event as CustomEvent<{ error: unknown }>).detail.error);
    });

    await installCreatorLodariqFromScript({
      script: createCreatorScript(),
      installOptions: {
        fetchInstallContext: async () => installContext({ authoringEnabled: true }),
      },
    });

    document.querySelector<HTMLButtonElement>('[data-lodariq-creator-toolbar="true"]')?.click();
    document
      .querySelector<HTMLButtonElement>(
        '[data-lodariq-launcher-action-id="edit-current-experience"]',
      )
      ?.click();

    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe(
      'Lodariq creator document does not match the SDK bootstrap context',
    );
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
  });

  it('substitutes the exact selected recovery environment and keeps credentials in headers', async () => {
    const approvedTheme = await approvedThemeFixture();
    const recoveryRequests: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url === 'https://api.lodariq.io/v1/sdk/authoring/document') {
        return new Response(JSON.stringify(authoringDocumentPayload(approvedTheme)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/v1/sdk/authoring/environments/')) {
        recoveryRequests.push({ url, init });
        const environmentId = decodeURIComponent(
          url.split('/environments/')[1]!.split('/release-recovery')[0]!,
        );
        if ((init?.method ?? 'GET') === 'GET') {
          return new Response(JSON.stringify(emptyRecoveryState(environmentId)), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(
          JSON.stringify({
            ok: false,
            action: 'unpublish',
            state: 'failed',
            replayed: false,
            code: 'deployment_changed',
            message: RELEASE_RECOVERY_FAILURE_MESSAGES.deployment_changed,
            expectedGeneration: 5,
            actualGeneration: 6,
            expectedActivePublicationId: 'publication_active_5',
            actualActivePublicationId: 'publication_changed_6',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected creator recovery request: ${init?.method ?? 'GET'} ${url}`);
    });
    vi.stubGlobal('fetch', fetch);
    await installCreatorLodariqFromScript({
      script: createCreatorScript(),
      installOptions: {
        fetchInstallContext: async () =>
          installContext({ authoringEnabled: true, recoveryEnabled: true }),
      },
    });
    document.querySelector<HTMLButtonElement>('[data-lodariq-creator-toolbar="true"]')?.click();
    document
      .querySelector<HTMLButtonElement>(
        '[data-lodariq-launcher-action-id="edit-current-experience"]',
      )
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('lodariq-authoring-panel')).toBeInstanceOf(HTMLElement),
    );
    const iframe = document.querySelector<HTMLIFrameElement>('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));
    const init = outboundEditorMessage(peer, 'authoring.init');
    expect(init).not.toHaveProperty('recoveryStateCapability');
    expect(init).not.toHaveProperty('rollbackCapability');
    expect(init).not.toHaveProperty('unpublishCapability');

    for (const [index, environmentId] of [
      'environment_staging',
      'environment_production',
    ].entries()) {
      const requestCorrelationId = `creator_recovery_state_${index}`;
      dispatchEditorMessage(peer, {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: 'authsess_creator',
        documentId: savedDocument().id,
        correlationId: requestCorrelationId,
        type: 'authoring.release-recovery-state.request',
        environmentId,
      });
      await vi.waitFor(() =>
        expect(
          outboundEditorMessages(peer, 'authoring.release-recovery-state.result'),
        ).toContainEqual(
          expect.objectContaining({
            requestCorrelationId,
            result: expect.objectContaining({
              ok: true,
              state: expect.objectContaining({ environmentId }),
            }),
          }),
        ),
      );
    }

    const mutation = {
      action: 'unpublish' as const,
      reason: 'Pause delivery during incident review',
      expectedGeneration: 5,
      expectedActivePublicationId: 'publication_active_5',
      idempotencyKey: 'creator.unpublish.request_1',
      correlationId: 'creator.unpublish.correlation_1',
    };
    dispatchEditorMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_creator',
      documentId: savedDocument().id,
      correlationId: 'creator_recovery_mutation_1',
      type: 'authoring.release-recovery.request',
      environmentId: 'environment_production',
      request: mutation,
    });
    await vi.waitFor(() =>
      expect(outboundEditorMessages(peer, 'authoring.release-recovery.result')).toContainEqual(
        expect.objectContaining({
          requestCorrelationId: 'creator_recovery_mutation_1',
          result: expect.objectContaining({
            ok: false,
            action: 'unpublish',
            code: 'deployment_changed',
          }),
        }),
      ),
    );

    expect(recoveryRequests.map((request) => request.url)).toEqual([
      'https://api.lodariq.io/v1/sdk/authoring/environments/environment_staging/release-recovery',
      'https://api.lodariq.io/v1/sdk/authoring/environments/environment_production/release-recovery',
      'https://api.lodariq.io/v1/sdk/authoring/environments/environment_production/release-recovery',
    ]);
    for (const request of recoveryRequests) {
      const headers = new Headers(request.init?.headers);
      expect(headers.get('authorization')).toBe('Bearer lod_staging_token');
      expect(headers.get('x-lodariq-authoring-session')).toBe('lod_authoring_session');
      expect(request.url).not.toContain('lod_staging_token');
      expect(request.url).not.toContain('lod_authoring_session');
    }
    expect(JSON.parse(String(recoveryRequests[2]?.init?.body))).toEqual(mutation);
    expect(String(recoveryRequests[2]?.init?.body)).not.toContain('compiler');
    expect(String(recoveryRequests[2]?.init?.body)).not.toContain('artifact');
  });

  it('keeps direct release credentials on the host and maps bridge actions to guarded HTTP', async () => {
    const approvedTheme = await approvedThemeFixture();
    const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/sdk/authoring/document')) {
        return {
          ok: true,
          json: async () => authoringDocumentPayload(approvedTheme),
        };
      }
      if (url.endsWith('/v1/sdk/authoring/release-state')) {
        return {
          ok: true,
          json: async () => ({
            available: true,
            environment: 'staging',
            environmentId: 'env_staging',
            documentId: 'doc_tour_welcome',
            expectedGeneration: 2,
            draftArtifactId: 'artifact_reviewed_2',
            draftContentHash: `sha256-${'b'.repeat(64)}`,
            activeContentHash: null,
            state: 'ready',
            findings: [],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, replayed: false, generation: 3, findings: [] }),
      };
    });
    vi.stubGlobal('fetch', fetch);
    await installCreatorLodariqFromScript({
      script: createCreatorScript(),
      installOptions: {
        fetchInstallContext: async () => installContext({ authoringEnabled: true }),
      },
    });
    document.querySelector<HTMLButtonElement>('[data-lodariq-creator-toolbar="true"]')?.click();
    document
      .querySelector<HTMLButtonElement>(
        '[data-lodariq-launcher-action-id="edit-current-experience"]',
      )
      ?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('lodariq-authoring-panel')).toBeInstanceOf(HTMLElement),
    );

    const panel = document.querySelector('lodariq-authoring-panel');
    const iframe = panel?.querySelector<HTMLIFrameElement>('iframe');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchEditorMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_creator',
      documentId: 'doc_tour_welcome',
      correlationId: 'release_state_request_1',
      type: 'authoring.release-state.request',
    });
    await vi.waitFor(() =>
      expect(outboundEditorMessage(peer, 'authoring.release-state.result')).toMatchObject({
        requestCorrelationId: 'release_state_request_1',
        result: { ok: true, releaseState: { state: 'ready' } },
      }),
    );

    const publicationRequest = {
      expectedGeneration: 2,
      expectedArtifactId: 'artifact_reviewed_2',
      expectedContentHash: `sha256-${'b'.repeat(64)}`,
      idempotencyKey: 'publish_direct_123',
      correlationId: 'release_direct_123',
    };
    dispatchEditorMessage(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'authsess_creator',
      documentId: 'doc_tour_welcome',
      correlationId: 'publish_request_1',
      type: 'authoring.publish-staging.request',
      request: publicationRequest,
    });
    await vi.waitFor(() =>
      expect(outboundEditorMessage(peer, 'authoring.publish-staging.result')).toMatchObject({
        requestCorrelationId: 'publish_request_1',
        result: { ok: true, replayed: false, generation: 3 },
      }),
    );

    const releaseCall = fetch.mock.calls.find(([input]) =>
      String(input).endsWith('/v1/sdk/authoring/release-state'),
    );
    const publicationCall = fetch.mock.calls.find(([input]) =>
      String(input).endsWith('/v1/sdk/authoring/publications'),
    );
    const releaseHeaders = releaseCall?.[1]?.headers as Headers;
    const publicationHeaders = publicationCall?.[1]?.headers as Headers;
    expect(releaseHeaders.get('authorization')).toBe('Bearer lod_staging_token');
    expect(releaseHeaders.get('x-lodariq-authoring-session')).toBe('lod_authoring_session');
    expect(publicationHeaders.get('Idempotency-Key')).toBe(publicationRequest.idempotencyKey);
    expect(publicationHeaders.get('x-lodariq-correlation-id')).toBe(
      publicationRequest.correlationId,
    );
    expect(JSON.parse(publicationCall?.[1]?.body as string)).toEqual({
      expectedGeneration: 2,
      expectedArtifactId: 'artifact_reviewed_2',
      expectedContentHash: publicationRequest.expectedContentHash,
    });
    expect(JSON.stringify(vi.mocked(peer.postMessage).mock.calls)).not.toContain(
      'lod_authoring_session',
    );
    panel?.shadowRoot
      ?.querySelector<HTMLButtonElement>('[data-panel-action="close-panel"]')
      ?.click();
  });
});

function createCreatorScript(): HTMLScriptElement {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = 'https://cdn.lodariq.io/sdk/lodariq-creator.js';
  script.dataset['lodariqLoader'] = '';
  script.dataset['lodariqEnvironment'] = 'staging';
  script.dataset['lodariqApi'] = 'https://api.lodariq.io';
  script.dataset['lodariqToken'] = 'lod_staging_token';
  script.dataset['lodariqAuthoringSession'] = 'lod_authoring_session';
  document.body.appendChild(script);
  return script;
}

function installContext({
  authoringEnabled,
  recoveryEnabled = false,
}: {
  authoringEnabled: boolean;
  recoveryEnabled?: boolean;
}): SdkInstallContext {
  const releaseRecoveryUrl =
    'https://api.lodariq.io/v1/sdk/authoring/environments/:environmentId/release-recovery';
  return {
    workspaceId: 'wk_creator',
    environment: 'staging',
    manifest: {
      documentId: 'doc_tour_welcome',
      currentVersion: 'sha256-live',
    },
    currentDocumentUrl: 'https://api.lodariq.io/v1/sdk/current-document',
    ingestUrl: 'https://api.lodariq.io/v1/sdk/events',
    authoring: authoringEnabled
      ? {
          enabled: true,
          iframeSrc: 'https://staging-editor.lodariq.io/authoring.html',
          sessionId: 'authsess_creator',
          expiresAt: '2099-01-01T00:00:00.000Z',
          documentUrl: 'https://api.lodariq.io/v1/sdk/authoring/document',
          saveDocumentUrl: 'https://api.lodariq.io/v1/sdk/authoring/document',
          release: {
            releaseState: {
              capability: 'document:read-release-state',
              url: 'https://api.lodariq.io/v1/sdk/authoring/release-state',
            },
            ...(recoveryEnabled
              ? {
                  recoveryState: {
                    capability: 'document:read-release-state' as const,
                    url: releaseRecoveryUrl,
                  },
                  rollback: {
                    capability: 'document:rollback' as const,
                    url: releaseRecoveryUrl,
                  },
                  unpublish: {
                    capability: 'document:unpublish' as const,
                    url: releaseRecoveryUrl,
                  },
                }
              : {}),
            stagingPublication: {
              capability: 'document:publish-staging',
              url: 'https://api.lodariq.io/v1/sdk/authoring/publications',
            },
          },
        }
      : { enabled: false },
  };
}

function emptyRecoveryState(environmentId: string) {
  return {
    workspaceId: 'wk_creator',
    environmentId,
    documentId: savedDocument().id,
    permissions: { rollback: true, unpublish: true },
    deployment: null,
    history: [],
    rollbackTargetPublicationIds: [],
  };
}

function authoringDocumentPayload(
  theme: BrandThemeSnapshot,
  document: LodariqDocument = savedDocument(),
) {
  return { document, documentUpdatedAt: DOCUMENT_UPDATED_AT, theme };
}

function savedDocument(): LodariqDocument {
  return {
    id: 'doc_tour_welcome',
    workspaceId: 'wk_creator',
    type: 'tour',
    status: 'draft',
    title: 'Saved from hosted editor',
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
                content: 'Saved step',
                props: { level: 2 },
                status: 'ready',
                children: [],
              },
              {
                id: 'button_1',
                type: 'button',
                content: 'Continue',
                props: { variant: 'primary', action: { type: 'next' } },
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

async function approvedThemeFixture(): Promise<BrandThemeSnapshot> {
  const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
  theme.themeId = 'theme_creator_exact';
  theme.themeVersionId = 'theme_version_creator_exact';
  theme.version = 2;
  theme.name = 'Creator exact approved theme';
  theme.contentHash = await computeBrandThemeContentHash(theme);
  return theme;
}

function outboundEditorMessage(peer: Window, type: string): Record<string, unknown> | undefined {
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as Record<string, unknown>)
    .find((message) => message['type'] === type);
}

function outboundEditorMessages(peer: Window, type: string): Array<Record<string, unknown>> {
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as Record<string, unknown>)
    .filter((message) => message['type'] === type);
}

function dispatchEditorMessage(peer: Window, data: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: 'https://staging-editor.lodariq.io',
      source: peer,
    }),
  );
}
