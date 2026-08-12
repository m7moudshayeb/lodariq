// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_PANEL_MODE_OPEN_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  DEFAULT_EXPERIENCE_APPEARANCE,
  type BridgeMessage,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_appearance_target_outline';

describe('authoring target outline appearance option', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults legacy documents on and saves an outline-only opt-out from Appearance', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    delete baseDocument.appearance;
    const saveDocument = vi.fn();
    const postMessage = vi.fn();
    const peer = { postMessage } as unknown as Window;

    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
      sessionId: SESSION_ID,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    dispatchFromPeer(peer, {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: SESSION_ID,
      documentId: baseDocument.id,
      correlationId: 'open_appearance_target_outline',
      type: AUTHORING_PANEL_MODE_OPEN_TYPE,
      mode: 'appearance',
    });

    const group = await targetOutlineGroup();
    const stages = [...document.querySelectorAll<HTMLElement>('[data-appearance-step]')];
    expect(stages.map((stage) => stage.dataset.appearanceStep)).toEqual(['1', '2', '3']);
    expect(stages.map((stage) => stage.querySelector('strong[id]')?.textContent)).toEqual([
      'Workspace Brand theme',
      'Check and match product',
      'Adjust this experience only',
    ]);
    expect(document.querySelector('.panel-mode-subtitle')?.textContent).toBe(
      'Start with the workspace theme, then keep only intentional differences.',
    );
    expect(group.closest('[data-appearance-step="3"]')).not.toBeNull();
    expect(group.closest('details')).toBeNull();
    expect(buttonByText(group, 'Off').getAttribute('aria-pressed')).toBe('false');
    expect(buttonByText(group, 'On').getAttribute('aria-pressed')).toBe('true');
    expect(stages[2]?.querySelector('.appearance-step-summary')?.textContent).toContain(
      'Target outline',
    );
    expect(buttonByText(document, 'Use this element’s look')).toBeTruthy();

    buttonByText(group, 'Off').click();

    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledOnce());
    expect(saveDocument.mock.calls[0]?.[0]).toMatchObject({
      appearance: {
        ...DEFAULT_EXPERIENCE_APPEARANCE,
        displayTargetOutline: false,
      },
    });
    await vi.waitFor(() => expect(outbound(postMessage, 'preview.patch')).toHaveLength(1));
    expect(outbound(postMessage, 'preview.patch')[0]).toMatchObject({
      blockId: baseDocument.blocks[0]?.id,
      patch: {
        ops: [
          {
            op: 'setAppearance',
            appearance: {
              ...DEFAULT_EXPERIENCE_APPEARANCE,
              displayTargetOutline: false,
            },
          },
        ],
      },
    });

    await vi.waitFor(() => {
      const updatedGroup = findTargetOutlineGroup();
      expect(updatedGroup).not.toBeNull();
      expect(buttonByText(updatedGroup!, 'Off').getAttribute('aria-pressed')).toBe('true');
      expect(
        updatedGroup
          ?.closest('[data-appearance-step="3"]')
          ?.querySelector('.appearance-step-summary')?.textContent,
      ).not.toContain('Target outline');
    });
  });
});

function dispatchFromPeer(peer: Window, message: BridgeMessage): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: window.location.origin,
      source: peer,
      data: message,
    }),
  );
}

async function targetOutlineGroup(): Promise<HTMLFieldSetElement> {
  await vi.waitFor(() => expect(findTargetOutlineGroup()).not.toBeNull());
  return findTargetOutlineGroup()!;
}

function findTargetOutlineGroup(): HTMLFieldSetElement | null {
  return (
    [...document.querySelectorAll<HTMLFieldSetElement>('fieldset.appearance-choice-group')].find(
      (group) => group.querySelector('legend')?.textContent === 'Display target outline',
    ) ?? null
  );
}

function buttonByText(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`${label} button is missing`);
  return button;
}

function outbound(postMessage: ReturnType<typeof vi.fn>, type: string): BridgeMessage[] {
  return postMessage.mock.calls
    .map(([message]) => message as BridgeMessage)
    .filter((message) => message.type === type);
}
