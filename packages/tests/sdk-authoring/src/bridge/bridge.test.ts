// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_DOCUMENT_TITLE_MAX_LENGTH,
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_MAX_LENGTH,
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
  AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
  AUTHORING_SAVE_STATE_UPDATE_TYPE,
  AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
  AUTHORING_RELEASE_STATE_REQUEST_TYPE,
  AUTHORING_SESSION_CAPABILITIES,
  BRIDGE_PROTOCOL_VERSION,
  BridgeMessage as BridgeMessageSchema,
  validate,
  type BridgeMessage,
} from '@lodariq/schema';
import {
  AuthoringBridge,
  RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS,
  startTargetPicker,
} from '@lodariq/sdk-authoring/bridge';
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
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lodariq-target-picker');
  });

  it('keeps inline preview content commits closed and bounded', () => {
    const message = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'inline_1',
      type: AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
      blockId: 'heading_1',
      content: 'Create your first project',
    } satisfies BridgeMessage;

    expect(validate(BridgeMessageSchema, message).valid).toBe(true);
    expect(
      validate(BridgeMessageSchema, { ...message, html: '<strong>unsafe</strong>' }).valid,
    ).toBe(false);
    expect(
      validate(BridgeMessageSchema, {
        ...message,
        content: 'x'.repeat(AUTHORING_INLINE_CONTENT_MAX_LENGTH + 1),
      }).valid,
    ).toBe(false);
  });

  it('keeps preview requests as a closed step-or-full discriminated union', () => {
    const envelope = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'preview_1',
      type: 'authoring.preview.request',
    } as const;

    expect(
      validate(BridgeMessageSchema, { ...envelope, mode: 'step', stepId: 'step_1' }).valid,
    ).toBe(true);
    expect(validate(BridgeMessageSchema, { ...envelope, mode: 'full' }).valid).toBe(true);
    expect(validate(BridgeMessageSchema, { ...envelope, mode: 'step' }).valid).toBe(false);
    expect(
      validate(BridgeMessageSchema, { ...envelope, mode: 'full', stepId: 'step_1' }).valid,
    ).toBe(false);
    expect(
      validate(BridgeMessageSchema, {
        ...envelope,
        mode: 'step',
        stepId: 'step_1',
        selector: '#unsafe',
      }).valid,
    ).toBe(false);
  });

  it('keeps direct release bridge messages semantic, closed, and credential-free', () => {
    const request = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'release_state_1',
      type: AUTHORING_RELEASE_STATE_REQUEST_TYPE,
    } satisfies BridgeMessage;
    expect(validate(BridgeMessageSchema, request).valid).toBe(true);
    expect(validate(BridgeMessageSchema, { ...request, bearer: 'secret' }).valid).toBe(false);
    expect(
      validate(BridgeMessageSchema, { ...request, url: 'https://api.example.test' }).valid,
    ).toBe(false);

    const init = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'authoring_init_1',
      type: 'authoring.init',
      workspaceId: 'wk_1',
      environment: 'development',
      document: {
        id: 'doc_1',
        workspaceId: 'wk_1',
        type: 'tour',
        status: 'draft',
        title: 'Direct authoring',
        trigger: { type: 'manual' },
        audience: { environments: ['development'] },
        schemaVersion: '1.0.0',
        targets: [],
        blocks: [],
      },
      releaseStateCapability: AUTHORING_SESSION_CAPABILITIES.READ_RELEASE_STATE,
    } satisfies BridgeMessage;
    expect(validate(BridgeMessageSchema, init).valid).toBe(true);
    expect(validate(BridgeMessageSchema, { ...init, authoringSessionToken: 'secret' }).valid).toBe(
      false,
    );
  });

  it('keeps live-preview control commits semantic and closed', () => {
    const placementMessage = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'control_1',
      type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
      operation: {
        kind: 'setPlacement',
        blockId: 'tooltip_1',
        placement: 'top',
      },
    } satisfies BridgeMessage;

    expect(validate(BridgeMessageSchema, placementMessage).valid).toBe(true);
    expect(
      validate(BridgeMessageSchema, {
        ...placementMessage,
        operation: { ...placementMessage.operation, placement: 'center' },
      }).valid,
    ).toBe(false);
    expect(
      validate(BridgeMessageSchema, {
        ...placementMessage,
        operation: { ...placementMessage.operation, css: 'position: fixed' },
      }).valid,
    ).toBe(false);

    const advancedMessage = {
      ...placementMessage,
      correlationId: 'control_2',
      operation: { kind: 'openAdvanced', stepId: 'step_1' },
    } satisfies BridgeMessage;
    expect(validate(BridgeMessageSchema, advancedMessage).valid).toBe(true);

    const actionMessage = {
      ...placementMessage,
      correlationId: 'control_action',
      operation: {
        kind: 'setAction',
        blockId: 'button_1',
        actionType: 'openPage',
      },
    } satisfies BridgeMessage;
    expect(validate(BridgeMessageSchema, actionMessage).valid).toBe(true);
    expect(
      validate(BridgeMessageSchema, {
        ...actionMessage,
        operation: { ...actionMessage.operation, actionType: 'runCode' },
      }).valid,
    ).toBe(false);

    const titleMessage = {
      ...placementMessage,
      correlationId: 'control_3',
      operation: { kind: 'setDocumentTitle', title: 'Customer onboarding' },
    } satisfies BridgeMessage;
    expect(validate(BridgeMessageSchema, titleMessage).valid).toBe(true);
    expect(
      validate(BridgeMessageSchema, {
        ...titleMessage,
        operation: {
          kind: 'setDocumentTitle',
          title: 'x'.repeat(AUTHORING_DOCUMENT_TITLE_MAX_LENGTH + 1),
        },
      }).valid,
    ).toBe(false);

    const appearanceMessage = {
      ...placementMessage,
      correlationId: 'control_4',
      operation: {
        kind: 'setAppearance',
        appearance: {
          preset: 'inverse',
          density: 'compact',
          width: 'wide',
          colorMode: 'dark',
          displayTargetOutline: true,
        },
      },
    } satisfies BridgeMessage;
    expect(validate(BridgeMessageSchema, appearanceMessage).valid).toBe(true);
    expect(
      validate(BridgeMessageSchema, {
        ...appearanceMessage,
        operation: {
          ...appearanceMessage.operation,
          appearance: {
            ...appearanceMessage.operation.appearance,
            displayTargetOutline: 'yes',
          },
        },
      }).valid,
    ).toBe(false);
    expect(
      validate(BridgeMessageSchema, {
        ...appearanceMessage,
        operation: {
          ...appearanceMessage.operation,
          appearance: { ...appearanceMessage.operation.appearance, css: 'all: unset' },
        },
      }).valid,
    ).toBe(false);
  });

  it('accepts only the three semantic authoring workspace layouts', () => {
    const message = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'panel_layout_1',
      type: AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
      mode: 'standard',
    } satisfies BridgeMessage;

    expect(validate(BridgeMessageSchema, message).valid).toBe(true);
    expect(validate(BridgeMessageSchema, { ...message, mode: 'fullscreen' }).valid).toBe(false);
    expect(validate(BridgeMessageSchema, { ...message, width: 900 }).valid).toBe(false);
  });

  it('keeps Save & exit as a narrow iframe-to-host intent', () => {
    const message = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'save_and_exit_1',
      type: AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
    } satisfies BridgeMessage;

    expect(validate(BridgeMessageSchema, message).valid).toBe(true);
    expect(validate(BridgeMessageSchema, { ...message, document: {} }).valid).toBe(false);
    expect(validate(BridgeMessageSchema, { ...message, closeWithoutSaving: true }).valid).toBe(
      false,
    );
  });

  it('keeps host-owned save state updates semantic, closed, and bounded', () => {
    const message = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'save_state_1',
      type: AUTHORING_SAVE_STATE_UPDATE_TYPE,
      state: 'saving',
      label: 'Saving…',
    } satisfies BridgeMessage;

    expect(validate(BridgeMessageSchema, message).valid).toBe(true);
    expect(validate(BridgeMessageSchema, { ...message, state: 'pending' }).valid).toBe(false);
    expect(validate(BridgeMessageSchema, { ...message, label: '' }).valid).toBe(false);
    expect(validate(BridgeMessageSchema, { ...message, label: 'x'.repeat(161) }).valid).toBe(false);
    expect(validate(BridgeMessageSchema, { ...message, retryAfter: 1_000 }).valid).toBe(false);
  });

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

  it('raises the ceiling only for validated recovery-state results', () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const onMessage = vi.fn();
    const bridge = new AuthoringBridge(peer, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      maxMessageBytes: 16,
      maxMessageBytesByType: RELEASE_RECOVERY_BRIDGE_MESSAGE_BYTE_LIMITS,
      autoAck: false,
      onMessage,
    });
    const recoveryResult = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 's1',
      documentId: 'doc_1',
      correlationId: 'recovery_state_result_1',
      type: AUTHORING_RELEASE_RECOVERY_STATE_RESULT_TYPE,
      requestCorrelationId: 'recovery_state_request_1',
      result: {
        ok: true,
        state: {
          workspaceId: 'workspace_1',
          environmentId: 'environment_1',
          documentId: 'doc_1',
          permissions: { rollback: false, unpublish: false },
          deployment: null,
          history: [],
          rollbackTargetPublicationIds: [],
        },
      },
    } satisfies BridgeMessage;

    expect(() => bridge.send(recoveryResult)).not.toThrow();
    expect(peer.postMessage).toHaveBeenCalledWith(recoveryResult, 'https://app.customer.com');
    expect(() => bridge.send(makeMessage())).toThrow(/over 16 bytes/);

    bridge.start();
    expect(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: null,
          origin: 'https://app.customer.com',
          source: peer,
        }),
      ),
    ).not.toThrow();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: recoveryResult,
        origin: 'https://app.customer.com',
        source: peer,
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: makeMessage(),
        origin: 'https://app.customer.com',
        source: peer,
      }),
    );

    expect(onMessage).toHaveBeenCalledOnce();
    expect(onMessage).toHaveBeenCalledWith(recoveryResult);
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

  it('acknowledges an inbound message only after asynchronous handling completes', async () => {
    let finishHandling: (() => void) | undefined;
    const handled = new Promise<void>((resolve) => {
      finishHandling = resolve;
    });
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const bridge = new AuthoringBridge(peer, {
      allowedOrigins: ['https://app.customer.com'],
      targetOrigin: 'https://app.customer.com',
      onMessage: () => handled,
    });
    bridge.start();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: makeMessage(),
        origin: 'https://app.customer.com',
        source: peer,
      }),
    );

    expect(peer.postMessage).not.toHaveBeenCalled();
    finishHandling?.();
    await handled;
    await vi.waitFor(() =>
      expect(peer.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ack', ackOf: 'corr_1' }),
        'https://app.customer.com',
      ),
    );
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

  it('keeps the page undimmed and shows lightweight hover guidance while choosing', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_picker">';
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'new-project';
    button.textContent = 'New project';
    document.body.appendChild(button);

    const onPick = vi.fn();
    startTargetPicker({ onPick });

    button.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 12, clientY: 18 }),
    );

    expect(document.documentElement.getAttribute('data-lodariq-target-picker')).toBe('active');
    expect(document.querySelector('[data-lodariq-bridge="target-veil"]')).toBeNull();
    expect(document.querySelector('[data-lodariq-bridge="target-cancel"]')).toBeTruthy();
    expect(document.head.querySelector('style')?.nonce).toBe('nonce_picker');
    expect(
      document.querySelector<HTMLElement>('[data-lodariq-bridge="target-outline"]')?.style.display,
    ).toBe('block');
    const candidate = document.querySelector<HTMLElement>(
      '[data-lodariq-bridge="target-controls"]',
    );
    expect(candidate?.style.display).toBe('none');
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'New project',
    );

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].element).toBe(button);
    expect(document.querySelector('[data-lodariq-bridge="target-controls"]')).toBeNull();
  });

  it('highlights a resolved semantic target immediately without pointer searching', () => {
    const onPick = vi.fn();
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'new-project';
    button.textContent = 'New project';
    document.body.appendChild(button);

    startTargetPicker({
      initialTarget: button,
      suggestion: { confidence: 100 },
      onPick,
    });

    const hoverLabel = document.querySelector<HTMLElement>('[data-lodariq-bridge="target-label"]');
    expect(hoverLabel?.style.display).toBe('block');
    expect(hoverLabel?.textContent).toContain('Current placement');
    expect(hoverLabel?.textContent).toContain('New project');

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].element).toBe(button);
  });

  it('lets an explicit product click replace the offered semantic target', () => {
    const onPick = vi.fn();
    const suggested = document.createElement('button');
    suggested.dataset['lodariqId'] = 'new-project';
    suggested.textContent = 'New project';
    const replacement = document.createElement('button');
    replacement.dataset['lodariqId'] = 'open-project';
    replacement.textContent = 'Open project';
    document.body.append(suggested, replacement);

    startTargetPicker({
      initialTarget: suggested,
      suggestion: { confidence: 100 },
      onPick,
    });

    replacement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 18 }),
    );

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].element).toBe(replacement);
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
      'Lodariq editor',
    );
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')?.textContent).toContain(
      'Choose an element on the page',
    );
    expect(onPick).not.toHaveBeenCalled();

    picker.cancel();
  });

  it('normalizes a nested label click to its meaningful control', () => {
    const onPick = vi.fn();
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'nested-button';
    const label = document.createElement('span');
    label.textContent = 'Nested label';
    button.appendChild(label);
    document.body.appendChild(button);

    startTargetPicker({ onPick });

    label.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0].element).toBe(button);
    expect(onPick.mock.calls[0]?.[0].fingerprint).toMatchObject({
      tagName: 'button',
      stableAttributes: { 'data-lodariq-id': 'nested-button' },
    });
  });

  it('attaches a repeated passive summary card in one click using its layout slot', () => {
    const onPick = vi.fn();
    const grid = document.createElement('section');
    const cards = [
      '<span>Active projects</span><strong>18</strong><small>3 launched this month</small>',
      '<span>Team members</span><strong>12</strong><small>2 joined this month</small>',
      '<span>Open tasks</span><strong>41</strong><small>7 due this week</small>',
    ].map((markup) => {
      const card = document.createElement('article');
      card.innerHTML = markup;
      card.getBoundingClientRect = () =>
        ({
          x: 120,
          y: 120,
          left: 120,
          top: 120,
          right: 400,
          bottom: 260,
          width: 280,
          height: 140,
          toJSON: () => ({}),
        }) as DOMRect;
      return card;
    });
    grid.append(...cards);
    document.body.appendChild(grid);

    startTargetPicker({ onPick });
    const visibleValue = cards[0]!.querySelector('strong')!;
    visibleValue.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    visibleValue.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onPick).toHaveBeenCalledOnce();
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({
      element: cards[0],
      identity: {
        intent: { resolutionMode: 'layout-slot' },
        captureEvidence: { quality: 'usable', uniqueCandidateCount: 1 },
      },
    });
    expect(document.querySelector('[data-lodariq-bridge="target-controls"]')).toBeNull();
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
        '[data-lodariq-bridge="target-interact"][data-action="click-through"]',
      )
      ?.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(productClick).toHaveBeenCalledOnce();
    expect(onPick).not.toHaveBeenCalled();
    expect(document.querySelector('[data-lodariq-bridge="target-cancel"]')).toBeTruthy();

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onPick).toHaveBeenCalledOnce();
    expect(productClick).toHaveBeenCalledOnce();
  });

  it('offers a visible cancel control and cancels target picking once', () => {
    const onCancel = vi.fn();
    const picker = startTargetPicker({ onPick: vi.fn(), onCancel });

    expect(document.querySelector('[data-lodariq-bridge="target-outline"]')).toBeTruthy();
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')).toBeTruthy();
    const cancel = document.querySelector<HTMLButtonElement>(
      '[data-lodariq-bridge="target-cancel"]',
    );
    expect(cancel?.textContent).toBe('Cancel');

    cancel?.click();
    picker.cancel();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-lodariq-bridge="target-outline"]')).toBeNull();
    expect(document.querySelector('[data-lodariq-bridge="target-label"]')).toBeNull();
    expect(document.querySelector('[data-lodariq-bridge="target-cancel"]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-lodariq-target-picker')).toBe(false);
  });
});
