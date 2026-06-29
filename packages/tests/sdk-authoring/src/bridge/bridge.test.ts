// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type BridgeMessage } from '@lodariq/schema';
import { AuthoringBridge, startTargetPicker } from '@lodariq/sdk-authoring/bridge';
import { resolve } from '@lodariq/sdk-runtime/resolver';

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

  it('drops messages outside the configured session or document scope', () => {
    const onMessage = vi.fn();
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      expectedSessionId: 'session_expected',
      expectedDocumentId: 'doc_expected',
      onMessage,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { ...makeMessage(), sessionId: 'session_other', documentId: 'doc_expected' },
        origin: 'https://app.customer.com',
        source: window,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { ...makeMessage(), sessionId: 'session_expected', documentId: 'doc_other' },
        origin: 'https://app.customer.com',
        source: window,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { ...makeMessage(), sessionId: 'session_expected', documentId: 'doc_expected' },
        origin: 'https://app.customer.com',
        source: window,
      }),
    );

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session_expected', documentId: 'doc_expected' }),
    );
    bridge.stop();
  });

  it('uses dynamic scope values when validating inbound messages', () => {
    const onMessage = vi.fn();
    let documentId = 'doc_initial';
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      expectedSessionId: () => 'session_expected',
      expectedDocumentId: () => documentId,
      onMessage,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          ...makeMessage(),
          sessionId: 'session_expected',
          documentId: 'doc_initial',
          correlationId: 'corr_initial',
        },
        origin: 'https://app.customer.com',
        source: window,
      }),
    );
    documentId = 'doc_replaced';
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          ...makeMessage(),
          sessionId: 'session_expected',
          documentId: 'doc_initial',
          correlationId: 'corr_stale',
        },
        origin: 'https://app.customer.com',
        source: window,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          ...makeMessage(),
          sessionId: 'session_expected',
          documentId: 'doc_replaced',
          correlationId: 'corr_replaced',
        },
        origin: 'https://app.customer.com',
        source: window,
      }),
    );

    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage.mock.calls.map((call) => call[0].correlationId)).toEqual([
      'corr_initial',
      'corr_replaced',
    ]);
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

  it('refuses to send oversized messages', () => {
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      maxMessageBytes: 16,
      onMessage: vi.fn(),
    });

    expect(() => bridge.send(makeMessage())).toThrow(/over 16 bytes/);
  });

  it('drops oversized inbound messages before validation or dispatch', () => {
    const onMessage = vi.fn();
    const bridge = new AuthoringBridge(window, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      maxMessageBytes: 16,
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

    expect(onMessage).not.toHaveBeenCalled();
    bridge.stop();
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

  it('does not resolve sendWithAck from an ack outside the configured document scope', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const bridge = new AuthoringBridge(peer, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      expectedSessionId: 's1',
      expectedDocumentId: 'doc_1',
      onMessage: vi.fn(),
    });
    bridge.start();

    const acked = bridge.sendWithAck(makeMessage(), { timeoutMs: 5 });
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: 's1',
          documentId: 'doc_other',
          correlationId: 'ack_wrong_doc',
          type: 'ack',
          ackOf: 'corr_1',
        },
        origin: 'https://app.customer.com',
        source: peer,
      }),
    );

    await expect(acked).rejects.toThrow('Bridge acknowledgement timed out: corr_1');
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
    button.dataset['lodariqId'] = 'new-project';
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
      stableAttributes: { 'data-lodariq-id': 'new-project' },
      diagnosticCoordinates: { x: 12, y: 18 },
    });
    expect(resolve(onPick.mock.calls[0]![0].fingerprint).state).toBe('found');
  });

  it('shows a veil and mechanical hover label while picking targets', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_picker">';
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'new-project';
    button.textContent = 'New project';
    document.body.appendChild(button);

    const picker = startTargetPicker({ onPick: vi.fn() });

    button.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 18 }),
    );

    expect(document.documentElement.getAttribute('data-lodariq-target-picker')).toBe('active');
    expect(document.querySelector('[data-lodariq-bridge="target-veil"]')).toBeTruthy();
    expect(document.head.querySelector('style')?.nonce).toBe('nonce_picker');
    expect(
      document.querySelector<HTMLElement>('[data-lodariq-bridge="target-outline"]')?.style.display,
    ).toBe('block');
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'Button',
    );
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'New project',
    );
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'Click to attach',
    );

    picker.cancel();
  });

  it('marks Lodariq UI as blocked and does not select it as a target', () => {
    const onPick = vi.fn();
    const picker = startTargetPicker({ onPick });
    const panel = document.createElement('lodariq-authoring-panel');
    const close = document.createElement('button');
    close.textContent = 'Close';
    panel.appendChild(close);
    document.body.appendChild(panel);

    close.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 4, clientY: 5 }));
    close.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.documentElement.getAttribute('data-lodariq-target-picker')).toBe('blocked');
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'Lodariq UI',
    );
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'Cannot attach',
    );
    expect(onPick).not.toHaveBeenCalled();

    picker.cancel();
  });

  it('cycles nested targets with parent and deeper controls', () => {
    const onPick = vi.fn();
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'nested-button';
    const label = document.createElement('span');
    label.textContent = 'Nested label';
    button.appendChild(label);
    document.body.appendChild(button);

    startTargetPicker({ onPick });

    label.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>(
        '[data-lodariq-bridge="target-control"][data-action="parent"]',
      )
      ?.click();
    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].element).toBe(button);
    expect(onPick.mock.calls[0]?.[0].fingerprint).toMatchObject({
      tagName: 'button',
      stableAttributes: { 'data-lodariq-id': 'nested-button' },
    });
  });

  it('allows one product click-through without attaching a target', () => {
    const onPick = vi.fn();
    const productClick = vi.fn();
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'menu-trigger';
    button.textContent = 'Open menu';
    button.addEventListener('click', productClick);
    document.body.appendChild(button);

    startTargetPicker({ onPick });

    button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>(
        '[data-lodariq-bridge="target-control"][data-action="click-through"]',
      )
      ?.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(productClick).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(document.querySelector('[data-lodariq-bridge="target-veil"]')).toBeTruthy();

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(productClick).toHaveBeenCalledOnce();
  });

  it('cancels target picking once and removes the outline', () => {
    const onCancel = vi.fn();
    const picker = startTargetPicker({ onPick: vi.fn(), onCancel });

    expect(document.querySelector('[data-lodariq-bridge="target-outline"]')).toBeTruthy();
    expect(document.querySelector('[data-lodariq-bridge="target-veil"]')).toBeTruthy();
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')).toBeTruthy();

    picker.cancel();
    picker.cancel();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-lodariq-bridge="target-outline"]')).toBeNull();
    expect(document.querySelector('[data-lodariq-bridge="target-veil"]')).toBeNull();
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-lodariq-target-picker')).toBe(false);
  });
});
