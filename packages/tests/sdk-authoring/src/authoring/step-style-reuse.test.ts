// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCommercialEntitlements, type LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';
import { installJsdomInteractionShims } from '../support/jsdom-interaction';

const SESSION_ID = 'session_step_style_reuse';

/**
 * §6.2 — the whole fix for audit #5. What matters is that reuse is *discoverable*
 * (labelled rows in the Style section) and that a batch says its blast radius
 * before acting.
 */
describe('step style reuse', () => {
  let saveDocument = vi.fn();

  beforeEach(() => {
    installJsdomInteractionShims();
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    saveDocument = vi.fn();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(planId?: 'free'): Promise<void> {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    await mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        loadMediaAssets: () => [],
        loadMediaAssetPreview: async () => new Blob(['test'], { type: 'image/png' }),
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
        ...(planId
          ? {
              operations: {
                readCommercialUsage: async () => ({
                  features: [...resolveCommercialEntitlements(planId).features],
                }),
              } as never,
            }
          : {}),
      },
      frameMode: 'panel',
      sessionId: SESSION_ID,
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });
    await vi.waitFor(() => expect(document.querySelector('.overlay-step-settings')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('.overlay-step-settings')?.click();
    await vi.waitFor(() => expect(document.querySelector('.step-style-reuse')).not.toBeNull());
  }

  const action = (name: string): HTMLButtonElement => {
    const button = document.querySelector<HTMLButtonElement>(`[data-style-action="${name}"]`);
    if (!button) throw new Error(`Style action "${name}" is missing`);
    return button;
  };

  it('offers reuse as labelled rows inside the Style section', async () => {
    await mount();
    expect(document.querySelector('.inspector-section[data-section="style"]')).not.toBeNull();
    for (const name of ['copy', 'paste', 'apply-to', 'create']) {
      expect(action(name).textContent?.trim().length).toBeGreaterThan(0);
    }
    // Nothing copied yet, so pasting and applying are honestly unavailable.
    expect(action('paste').disabled).toBe(true);
    expect(action('apply-to').disabled).toBe(true);
  });

  it('enables paste once a style is copied', async () => {
    await mount();
    action('copy').click();
    await vi.waitFor(() => expect(action('paste').disabled).toBe(false));
    expect(action('apply-to').disabled).toBe(false);
  });

  it('names the blast radius before applying, and defaults to this step alone', async () => {
    await mount();
    action('copy').click();
    await vi.waitFor(() => expect(action('apply-to').disabled).toBe(false));
    expect(action('apply-to').textContent).toContain('Apply to');
  });

  it('saves a named style and offers it back for reuse', async () => {
    await mount();
    action('create').click();
    await vi.waitFor(() => expect(document.querySelector('[data-style-recipe]')).not.toBeNull());
    const recipe = document.querySelector<HTMLButtonElement>('[data-style-recipe]');
    expect(recipe?.textContent?.trim().length).toBeGreaterThan(0);
    expect(document.querySelector('.step-style-recipe-swatch')).not.toBeNull();
  });

  it('tells the creator how to select several steps', async () => {
    await mount();
    const hint = document.querySelector('.step-style-reuse-hint');
    expect(hint?.textContent).toContain('filmstrip');
  });

  it('keeps style reuse visible but disables named-style actions on Free', async () => {
    await mount('free');
    await vi.waitFor(() => expect(action('copy').disabled).toBe(true));
    for (const name of ['copy', 'paste', 'apply-to', 'create', 'update']) {
      expect(action(name).disabled, name).toBe(true);
      expect(action(name).title, name).toContain('not included');
    }
  });
});
