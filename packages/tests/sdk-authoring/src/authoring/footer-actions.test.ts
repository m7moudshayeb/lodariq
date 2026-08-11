// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
  AUTHORING_SAVE_STATE_UPDATE_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_footer_actions';

describe('authoring footer actions', () => {
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

  it('keeps primary actions in the persistent footer and secondary actions in overflow', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const postMessage = vi.fn();
    const peer = { postMessage } as unknown as Window;

    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument: vi.fn(),
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

    const footer = document.querySelector<HTMLElement>('.panel-workspace-footer');
    const saveAndExit = buttonByText(footer, 'Save & exit');
    const draftState = footer?.querySelector<HTMLElement>('.panel-save-status[data-save-state]');
    const moreActions = footer?.querySelector<HTMLButtonElement>(
      '[aria-label="More experience actions"]',
    );

    expect(footer).not.toBeNull();
    expect(draftState?.dataset.state).toBe('saved');
    expect(draftState?.querySelector('[data-save-state-label]')?.textContent).toBe('Draft saved');
    expect(footer?.querySelector('[data-panel-entry="appearance"]')).toBeNull();
    expect(footer?.querySelector('.review-recovery')).toBeNull();
    expect(buttonByText(footer, 'Preview')).toBeTruthy();
    expect(
      footer
        ?.querySelector<HTMLButtonElement>('[data-panel-entry="release"]')
        ?.getAttribute('aria-label'),
    ).toBe('Release options');
    expect(moreActions?.querySelector('svg')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="More experience actions"]')?.click();
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Customize"]'),
      ).not.toBeNull();
      expect(
        document.querySelector<HTMLButtonElement>('.review-recovery[role="menuitem"]'),
      ).not.toBeNull();
    });
    const appearance = document.querySelector<HTMLButtonElement>(
      '[role="menuitem"][aria-label="Customize"]',
    );
    const review = document.querySelector<HTMLButtonElement>('.review-recovery[role="menuitem"]');
    if (!appearance || !review) throw new Error('Footer overflow actions are missing');
    expect(appearance.querySelector('svg')).not.toBeNull();
    expect(review.querySelector('svg')).not.toBeNull();
    review.click();
    await vi.waitFor(() => expect(document.querySelector('.panel-advanced-editor')).not.toBeNull());
    expect(document.querySelector('.panel-workspace-footer')).not.toBeNull();

    saveAndExit.click();
    const requests = outbound(postMessage, AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: SESSION_ID,
      documentId: baseDocument.id,
      correlationId: expect.stringMatching(/^authoring_save_and_exit_/),
      type: AUTHORING_SAVE_AND_EXIT_REQUEST_TYPE,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: SESSION_ID,
          documentId: baseDocument.id,
          correlationId: 'save_state_error_1',
          type: AUTHORING_SAVE_STATE_UPDATE_TYPE,
          state: 'error',
          label: 'Could not save draft',
        } satisfies BridgeMessage,
        origin: window.location.origin,
        source: peer,
      }),
    );
    await vi.waitFor(() => {
      expect(draftState?.dataset.state).toBe('error');
      expect(draftState?.querySelector('[data-save-state-label]')?.textContent).toBe(
        'Could not save draft',
      );
    });

    document.querySelector<HTMLButtonElement>('[aria-label="More experience actions"]')?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Customize"]'),
      ).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[role="menuitem"][aria-label="Customize"]')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-panel-mode-heading]')?.textContent).toBe(
        'Feel native to this product',
      );
    });
    const modeFooter = document.querySelector<HTMLElement>('.panel-workspace-footer');
    expect(modeFooter).not.toBeNull();
    modeFooter?.querySelector<HTMLButtonElement>('[aria-label="More experience actions"]')?.click();
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>('.review-recovery[role="menuitem"]'),
      ).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('.review-recovery[role="menuitem"]')?.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.panel-advanced-editor')).not.toBeNull();
      expect(document.querySelector('.panel-workspace-footer')).not.toBeNull();
    });
  });
});

function buttonByText(scope: ParentNode | null, label: string): HTMLButtonElement {
  const button = [...(scope?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
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
