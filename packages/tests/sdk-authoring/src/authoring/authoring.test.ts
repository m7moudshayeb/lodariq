// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION } from '@talmeh/schema';
import {
  LOCAL_AUTHORING_SESSION_ID,
  openLocalAuthoringPanel,
} from '@talmeh/sdk-authoring/talmeh-authoring';

describe('local authoring panel (PRD §16.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a same-origin iframe panel and closes it', () => {
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
    const iframe = host?.shadowRoot?.querySelector('iframe');

    expect(dialog?.getAttribute('aria-label')).toBe('Talmeh authoring');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    expect(iframe?.getAttribute('src')).toBe('/talmeh-local/authoring.html');

    panel.close();

    expect(document.querySelector('talmeh-authoring-panel')).toBeNull();
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
    const iframe = host?.shadowRoot?.querySelector('iframe');
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
});
