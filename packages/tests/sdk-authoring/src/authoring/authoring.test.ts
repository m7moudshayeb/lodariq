// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '@talmeh/compiler';
import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type CompiledDocument,
  type TalmehDocument,
} from '@talmeh/schema';
import {
  LOCAL_AUTHORING_SESSION_ID,
  openLocalAuthoringPanel,
} from '@talmeh/sdk-authoring/talmeh-authoring';

const baseDocument: TalmehDocument = {
  id: 'doc_tour_welcome',
  workspaceId: 'wk_local_dev',
  type: 'tour',
  status: 'draft',
  title: 'Welcome tour',
  trigger: { type: 'manual' },
  audience: { environments: ['development', 'staging'] },
  schemaVersion: '1.0.0',
  targets: [],
  blocks: [
    {
      id: 'step_1',
      type: 'tourStep',
      props: { index: 0 },
      status: 'incomplete',
      children: [
        {
          id: 'tooltip_1',
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'incomplete',
          children: [
            {
              id: 'heading_1',
              type: 'heading',
              content: 'Create your first project',
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

describe('local authoring panel (PRD §16.1)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  it('opens a same-origin iframe panel and closes it', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_authoring">';
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/talmeh-local/authoring.html' },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const dialog = host?.shadowRoot?.querySelector('[role="dialog"]');
    const iframe = host?.querySelector('iframe');

    expect(dialog?.getAttribute('aria-label')).toBe('Talmeh authoring');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(iframe?.getAttribute('src')).toBe('/talmeh-local/authoring.html');
    expect(iframe?.getAttribute('slot')).toBe('authoring-frame');
    const styles = host?.shadowRoot?.querySelector('style')?.textContent ?? '';
    expect(styles).toContain('top: 82px');
    expect(styles).toContain('width: min(550px, calc(100vw - 36px))');
    expect(styles).toContain('.panel::before');
    expect(styles).toContain('slot[name="authoring-frame"]');
    expect(styles).toContain('pointer-events: auto');
    expect(styles).not.toContain('pointer-events: none');
    expect(host?.shadowRoot?.querySelector('style')?.nonce).toBe('nonce_authoring');
    expect(document.documentElement.hasAttribute('data-talmeh-authoring-panel-open')).toBe(true);

    panel.close();

    expect(document.querySelector('talmeh-authoring-panel')).toBeNull();
    expect(document.documentElement.hasAttribute('data-talmeh-authoring-panel-open')).toBe(false);
  });

  it('uses the iframe origin for bridge messages', () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: 'https://editor.talmeh.io/authoring.html' },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_pick_start_1',
          type: 'target.pick.start',
          blockId: 'block_1',
        },
        origin: 'https://editor.talmeh.io',
        source: peer,
      }),
    );

    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ack', ackOf: 'target_pick_start_1' }),
      'https://editor.talmeh.io',
    );

    panel.close();
  });

  it('emits page lifecycle updates from the host bridge', async () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/talmeh-local/authoring.html' },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));

    const initial = await waitForOutboundMessage(peer, 'page.lifecycle.update');
    expect(initial).toMatchObject({
      type: 'page.lifecycle.update',
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      documentId: 'doc_tour_welcome',
      route: '/',
      scrollState: { x: 0, y: 0 },
    });

    ackOutboundMessage(peer, initial);
    panel.close();
  });

  it('coalesces page lifecycle updates while waiting for iframe acknowledgement', async () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/talmeh-local/authoring.html' },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));
    const initial = await waitForOutboundMessage(peer, 'page.lifecycle.update');
    vi.mocked(peer.postMessage).mockClear();

    window.history.pushState(null, '', '#first');
    window.history.pushState(null, '', '#second');
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => window.setTimeout(resolve, 32));

    expect(outboundMessages(peer, 'page.lifecycle.update')).toHaveLength(0);

    ackOutboundMessage(peer, initial);

    const update = await waitForOutboundMessage(peer, 'page.lifecycle.update');
    expect(update).toMatchObject({
      type: 'page.lifecycle.update',
      route: '/#second',
    });
    expect(outboundMessages(peer, 'page.lifecycle.update')).toHaveLength(1);

    ackOutboundMessage(peer, update);
    panel.close();
  });

  it('resolves target inspection requests through the host bridge', () => {
    const productButton = document.createElement('button');
    productButton.dataset['talmehId'] = 'new-project';
    productButton.textContent = 'New project';
    document.body.appendChild(productButton);

    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/talmeh-local/authoring.html' },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_inspect_request_1',
          type: 'target.inspect.request',
          blockId: 'step_1',
          targetId: 'target_1',
          action: 'view',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'New project',
            stableAttributes: { 'data-talmeh-id': 'new-project' },
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    const result = vi
      .mocked(peer.postMessage)
      .mock.calls.map((call) => call[0] as { type?: string; correlationId?: string })
      .find((message) => message.type === 'target.inspect.result');

    expect(result).toMatchObject({
      type: 'target.inspect.result',
      blockId: 'step_1',
      targetId: 'target_1',
      action: 'view',
      diagnostic: expect.objectContaining({
        state: 'found',
        confidence: expect.any(Number),
        candidateCount: 1,
        resolutionMethod: 'talmeh_id',
      }),
    });
    expect(
      (result as { diagnostic?: { confidence?: number } }).diagnostic?.confidence,
    ).toBeGreaterThanOrEqual(100);
    expect(document.querySelector('[data-talmeh-bridge="target-reveal"]')).toBeTruthy();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'ack_target_inspect_result',
          type: 'ack',
          ackOf: result?.correlationId,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    panel.close();
    expect(document.querySelector('[data-talmeh-bridge="target-reveal"]')).toBeNull();
  });

  it('applies semantic preview patches and plays the affected step', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const playPreview = vi.fn(() => Promise.resolve());
    const stopPreview = vi.fn();
    const compilePreview = vi.fn(async (doc: TalmehDocument): Promise<CompiledDocument> => {
      return { ...compile(doc), contentHash: 'local-preview' };
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/talmeh-local/authoring.html',
        preview: {
          loadDocument: () => structuredClone(baseDocument),
          compilePreview,
          playPreview,
          stopPreview,
        },
      },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_1',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: {
            ops: [
              {
                op: 'attachTarget',
                targetId: 'target_1',
                fingerprint: {
                  tagName: 'button',
                  role: 'button',
                  accessibleName: 'New project',
                  stableAttributes: { 'data-talmeh-id': 'new-project' },
                },
              },
            ],
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());

    expect(compilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            id: 'target_1',
            fingerprint: expect.objectContaining({ accessibleName: 'New project' }),
          }),
        ],
      }),
    );
    expect(playPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ id: 'step_1', targetId: 'target_1' })],
      }),
      { stepId: 'step_1' },
    );

    compilePreview.mockClear();
    playPreview.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_remove_target',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: { ops: [{ op: 'removeTarget', targetId: 'target_1' }] },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(compilePreview).toHaveBeenCalledOnce());
    const removedTargetDocument = compilePreview.mock.calls[0]?.[0];
    const tooltip = removedTargetDocument?.blocks[0]?.children[0];
    expect(removedTargetDocument?.targets).toEqual([]);
    expect(removedTargetDocument?.blocks[0]).toMatchObject({
      id: 'step_1',
      status: 'incomplete',
    });
    expect(tooltip).toMatchObject({
      type: 'tooltip',
      status: 'incomplete',
      props: { placement: 'bottom' },
    });
    expect(tooltip?.props).not.toHaveProperty('targetId');
    expect(JSON.stringify(removedTargetDocument)).toContain('Create your first project');
    expect(playPreview).not.toHaveBeenCalled();
    expect(stopPreview).toHaveBeenCalledOnce();

    panel.close();
  });

  it('ignores iframe messages outside the active authoring session scope', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const playPreview = vi.fn(() => Promise.resolve());
    const compilePreview = vi.fn(async (doc: TalmehDocument): Promise<CompiledDocument> => {
      return { ...compile(doc), contentHash: 'local-preview' };
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/talmeh-local/authoring.html',
        preview: {
          loadDocument: () => structuredClone(baseDocument),
          compilePreview,
          playPreview,
        },
      },
    );

    const host = document.querySelector('talmeh-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: 'wrong_session',
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_wrong_session',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: { ops: [{ op: 'updateContent', content: 'Wrong session' }] },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await Promise.resolve();

    expect(compilePreview).not.toHaveBeenCalled();
    expect(playPreview).not.toHaveBeenCalled();
    expect(peer.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ack', ackOf: 'preview_patch_wrong_session' }),
      window.location.origin,
    );

    panel.close();
  });
});

function outboundMessages<TType extends BridgeMessage['type']>(
  peer: Window,
  type: TType,
): Extract<BridgeMessage, { type: TType }>[] {
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as BridgeMessage)
    .filter((message): message is Extract<BridgeMessage, { type: TType }> => {
      return message.type === type;
    });
}

async function waitForOutboundMessage<TType extends BridgeMessage['type']>(
  peer: Window,
  type: TType,
): Promise<Extract<BridgeMessage, { type: TType }>> {
  await vi.waitFor(() => expect(outboundMessages(peer, type)).toHaveLength(1));
  return outboundMessages(peer, type)[0]!;
}

function ackOutboundMessage(peer: Window, message: BridgeMessage): void {
  if (message.type === 'ack') return;
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: message.sessionId,
        documentId: message.documentId,
        correlationId: `ack_${message.correlationId}`,
        type: 'ack',
        ackOf: message.correlationId,
      },
      origin: window.location.origin,
      source: peer,
    }),
  );
}
