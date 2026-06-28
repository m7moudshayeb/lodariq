// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type BridgeMessage } from '@talmeh/schema';
import { AuthoringBridge, startTargetPicker } from '@talmeh/sdk-authoring/bridge';
import { resolve } from '@talmeh/sdk-runtime/resolver';

function makeMessage(): BridgeMessage {
  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    sessionId: 's1',
    documentId: 'doc_1',
    correlationId: 'corr_1',
    type: 'target.pick.start',
    blockId: 'block_1',
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

  it('resolves sendWithAck when the peer acknowledges the correlation id', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const bridge = new AuthoringBridge(peer, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage: vi.fn(),
    });
    bridge.start();

    const acked = bridge.sendWithAck(makeMessage(), { timeoutMs: 50 });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: 's1',
          documentId: 'doc_1',
          correlationId: 'ack_1',
          type: 'ack',
          ackOf: 'corr_1',
        },
        origin: 'https://app.customer.com',
        source: peer,
      }),
    );

    await expect(acked).resolves.toBeUndefined();
    bridge.stop();
  });

  it('rejects sendWithAck when the peer does not acknowledge in time', async () => {
    const bridge = new AuthoringBridge({ postMessage: vi.fn() } as unknown as Window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage: vi.fn(),
    });

    await expect(bridge.sendWithAck(makeMessage(), { timeoutMs: 1 })).rejects.toThrow(
      'Bridge acknowledgement timed out: corr_1',
    );
  });

  it('captures a semantic fingerprint and intercepts the product click while picking', () => {
    const onPick = vi.fn();
    const productClick = vi.fn();
    const productPointerDown = vi.fn();
    const productPointerUp = vi.fn();
    const productMouseDown = vi.fn();
    const productMouseUp = vi.fn();
    const button = document.createElement('button');
    button.dataset['talmehId'] = 'new-project';
    button.textContent = 'New project';
    button.addEventListener('pointerdown', productPointerDown);
    button.addEventListener('pointerup', productPointerUp);
    button.addEventListener('mousedown', productMouseDown);
    button.addEventListener('mouseup', productMouseUp);
    button.addEventListener('click', productClick);
    document.body.appendChild(button);

    startTargetPicker({ onPick });

    expect(
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    ).toBe(false);
    expect(
      button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })),
    ).toBe(false);
    button.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 18 }),
    );
    button.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 18 }),
    );

    expect(productClick).not.toHaveBeenCalled();
    expect(productPointerDown).not.toHaveBeenCalled();
    expect(productPointerUp).not.toHaveBeenCalled();
    expect(productMouseDown).not.toHaveBeenCalled();
    expect(productMouseUp).not.toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].fingerprint).toMatchObject({
      tagName: 'button',
      role: 'button',
      accessibleName: 'New project',
      stableAttributes: { 'data-talmeh-id': 'new-project' },
      diagnosticCoordinates: { x: 12, y: 18 },
    });
    expect(resolve(onPick.mock.calls[0]![0].fingerprint).state).toBe('found');
  });
});
