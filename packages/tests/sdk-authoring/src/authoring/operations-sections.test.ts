// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_operations_sections';

/**
 * Operations is one surface with fifteen sections. Every one of them has to be
 * reachable from the nav and has to render — a section that throws only when a
 * customer clicks it is the failure this covers.
 */
const SECTION_ROOTS: Record<string, string> = {
  flow: '.tour-flow-map-workspace',
  storyboard: '.operations-storyboard',
  batch: '.tour-batch-workspace',
  templates: '.operations-templates',
  translation: '.experience-language-picker',
  narration: '.operations-narration',
  audience: '.operations-audience',
  experiment: '.operations-experiment',
  check: '.operations-check',
  analytics: '.operations-analytics',
  review: '.tour-review-workspace',
  collaboration: '.operations-collaboration',
  share: '.operations-share',
};

/** These three hand off to their own panel mode rather than rendering in place. */
const REDIRECTING_TABS = ['appearance', 'release', 'recovery'] as const;

describe('operations sections', () => {
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

  async function openOperations(): Promise<void> {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    await mountLocalAuthoringFrame({
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

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: peer,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: SESSION_ID,
          documentId: baseDocument.id,
          correlationId: 'open_operations_sections',
          type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
          action: 'open-operations',
        },
      }),
    );
    await vi.waitFor(() => expect(document.querySelector('.operations-hub')).not.toBeNull());
  }

  const tabButton = (tab: string): HTMLButtonElement => {
    const button = document.querySelector<HTMLButtonElement>(`[data-operations-tab="${tab}"]`);
    if (!button) throw new Error(`Operations tab "${tab}" is missing from the nav`);
    return button;
  };

  it('groups every tab under exactly one heading', async () => {
    await openOperations();

    const groups = [...document.querySelectorAll('.operations-hub-nav .operations-hub-group')];
    expect(
      groups.map((group) => group.querySelector('.operations-hub-group-label')?.textContent),
    ).toEqual(['Author', 'Look', 'Reach', 'Prove', 'Ship']);

    const tabs = [...document.querySelectorAll('[data-operations-tab]')].map(
      (button) => (button as HTMLElement).dataset.operationsTab,
    );
    expect(tabs).toHaveLength(16);
    expect(new Set(tabs).size).toBe(16);
    for (const tab of [...Object.keys(SECTION_ROOTS), ...REDIRECTING_TABS]) {
      expect(tabs).toContain(tab);
    }
  });

  it.each(Object.entries(SECTION_ROOTS))('renders the %s section', async (tab, root) => {
    await openOperations();
    tabButton(tab).click();
    await vi.waitFor(() => expect(document.querySelector(root)).not.toBeNull());
    expect(tabButton(tab).getAttribute('aria-current')).toBe('page');
  });

  it.each(REDIRECTING_TABS)(
    'hands %s off to its own mode instead of rendering in place',
    async (tab) => {
      await openOperations();
      tabButton(tab).click();
      await vi.waitFor(() => expect(document.querySelector('.operations-hub')).toBeNull());
    },
  );

  it('keeps the demo link blocked until the redaction pass is done', async () => {
    await openOperations();
    tabButton('share').click();
    await vi.waitFor(() => expect(document.querySelector('.operations-share')).not.toBeNull());

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.operations-share button')];
    const createLink = buttons.find((button) => button.textContent === 'Create the link');
    const review = buttons.find((button) => button.textContent === 'Review what will be published');

    // Nothing captured yet, so neither publishing nor reviewing is reachable.
    expect(createLink?.disabled).toBe(true);
    expect(review?.disabled).toBe(true);
  });
});
