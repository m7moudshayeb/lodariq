// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

const SESSION_ID = 'session_overlay_step_inspector';

/**
 * §4.3: the inspector replaces the Popup tray, the Placement tray and the
 * under-canvas property tray. These assertions are about the *shape* of that
 * replacement — sections rather than tabs, one entry point, no carried state.
 */
describe('overlay step inspector', () => {
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

  async function mount(): Promise<LodariqDocument> {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    await mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument: vi.fn(),
        loadMediaAssets: () => [],
        loadMediaAssetPreview: async () => new Blob(['test'], { type: 'image/png' }),
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
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });
    await vi.waitFor(() => {
      expect(document.querySelector('.overlay-step-card')).not.toBeNull();
      expect(document.querySelector('.overlay-step-settings')).not.toBeNull();
    });
    return baseDocument;
  }

  const settingsButton = (): HTMLButtonElement => {
    const button = document.querySelector<HTMLButtonElement>('.overlay-step-settings');
    if (!button) throw new Error('Step settings affordance is missing');
    return button;
  };

  const sectionIds = (): string[] =>
    [...document.querySelectorAll<HTMLElement>('.inspector-section')].map(
      (section) => section.dataset['section'] ?? '',
    );

  it('offers one visible entry point and starts closed', async () => {
    await mount();
    expect(settingsButton().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.overlay-step-inspector-panel')).toBeNull();
    // Pointer-first: the affordance is labelled, not a bare glyph.
    expect(settingsButton().getAttribute('aria-label')).toBe('Step settings');
  });

  it('opens sections rather than tabs, with only the first expanded', async () => {
    await mount();
    settingsButton().click();
    await vi.waitFor(() =>
      expect(document.querySelector('.overlay-step-inspector-panel')).not.toBeNull(),
    );
    // Advanced is last and collapsed — off the default path by construction.
    expect(sectionIds()).toEqual([
      'style',
      'actions',
      'placement',
      'target',
      'conditions',
      'narration',
      'advanced',
    ]);
    // No tab strip: the trays' tab navigation is what sections replace.
    expect(document.querySelector('.overlay-step-inspector-panel .popup-inspector-tabs')).toBeNull();
    const open = [...document.querySelectorAll('.inspector-section[open]')];
    expect(open).toHaveLength(1);
    expect((open[0] as HTMLElement).dataset['section']).toBe('style');
  });

  it('closes from its own control, leaving no pinned state behind', async () => {
    await mount();
    settingsButton().click();
    await vi.waitFor(() =>
      expect(document.querySelector('.overlay-step-inspector-panel')).not.toBeNull(),
    );
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.overlay-step-inspector-panel')).toBeNull(),
    );
    expect(settingsButton().getAttribute('aria-expanded')).toBe('false');
  });

  it('returns focus to the affordance that opened it', async () => {
    await mount();
    const opener = settingsButton();
    opener.focus();
    opener.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.overlay-step-inspector-panel')).not.toBeNull(),
    );
    expect(document.activeElement?.tagName).toBe('SUMMARY');
    document.querySelector<HTMLButtonElement>('[aria-label="Close settings"]')?.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(settingsButton()));
  });

  it('reserves the inspector band on the host only while it is open', async () => {
    await mount();
    const column = document.querySelector<HTMLElement>('.overlay-step-inspector');
    expect(column?.dataset['present']).toBe('false');
    settingsButton().click();
    await vi.waitFor(() => expect(column?.dataset['present']).toBe('true'));
  });
});
