// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type BridgeMessage } from '@talmeh/schema';
import { AuthoringBridge } from '@talmeh/sdk-authoring/bridge';

function makeMessage(): BridgeMessage {
  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: 's1',
    documentId: 'doc_1',
    correlationId: 'corr_1',
    type: 'target.pick.start',
  };
}

describe('AuthoringBridge (PRD §9.5)', () => {
  it('ignores messages from disallowed origins', () => {
    const onMessage = vi.fn();
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage,
    });
    bridge.start();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: makeMessage(),
        origin: 'https://evil.example',
        source: window,
      }),
    );
    expect(onMessage).not.toHaveBeenCalled();
    bridge.stop();
  });

  it('ignores messages from the wrong peer window even with an allowed origin', () => {
    const onMessage = vi.fn();
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage,
    });
    bridge.start();
    window.dispatchEvent(
      new MessageEvent('message', { data: makeMessage(), origin: 'https://app.customer.com' }),
    );
    expect(onMessage).not.toHaveBeenCalled();
    bridge.stop();
  });

  it('accepts schema-valid messages from the expected peer and allowed origin', () => {
    const onMessage = vi.fn();
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage,
    });
    bridge.start();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: makeMessage(),
        origin: 'https://app.customer.com',
        source: window,
      }),
    );
    expect(onMessage).toHaveBeenCalledOnce();
    bridge.stop();
  });

  it('refuses to send an invalid message', () => {
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage: vi.fn(),
    });
    expect(() => bridge.send({ bogus: true } as unknown as BridgeMessage)).toThrow();
  });

  it('refuses to send to a wildcard target origin', () => {
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: '*',
      onMessage: vi.fn(),
    });
    expect(() => bridge.send(makeMessage())).toThrow(/wildcard target origin/);
  });
});
