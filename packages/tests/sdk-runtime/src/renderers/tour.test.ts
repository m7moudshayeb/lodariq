// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as FloatingUiDomModule from '@floating-ui/dom';
import { compile } from '@lodariq/compiler';
import {
  COMPILED_ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  type NewCompiledDocument,
  type CompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import { DEFAULT_EXPERIENCE_APPEARANCE } from '@lodariq/schema/brand-runtime';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { exportDocument, importDocument } from '@lodariq/sdk-runtime/local-dev';
import { captureVisualFingerprint } from '@lodariq/sdk-runtime/resolver';
import { TourPlayer, resolveCompiledTourTheme } from '@lodariq/sdk-runtime/renderers/tour';
import { LodariqRuntime } from '@lodariq/sdk-runtime/runtime';
import { resetRuntimeLocaleForTests } from '@lodariq/sdk-runtime/i18n';

const computePositionMock = vi.hoisted(() =>
  vi.fn(async (_reference: unknown, _floating: unknown, _options?: unknown) => ({
    x: 12,
    y: 16,
    placement: 'bottom',
    strategy: 'fixed',
    middlewareData: {},
  })),
);

vi.mock('@floating-ui/dom', async (importOriginal) => {
  const actual = await importOriginal<typeof FloatingUiDomModule>();
  return { ...actual, computePosition: computePositionMock };
});

const compiledDoc: CompiledDocument = {
  documentId: 'doc_tour_welcome',
  type: 'tour',
  contentHash: 'local-preview',
  schemaVersion: '1.0.0',
  compilerVersion: '0.1.0',
  targets: [
    {
      id: 'target_new_project',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'New project',
        stableAttributes: { 'data-lodariq-id': 'new-project' },
      },
    },
  ],
  steps: [
    {
      id: 'step_1',
      targetId: 'target_new_project',
      placement: 'bottom',
      body: [
        {
          id: 'heading_1',
          type: 'heading',
          text: 'Create your first project',
          props: {},
        },
        {
          id: 'button_1',
          type: 'button',
          text: 'Continue',
          props: { action: { type: 'next' } },
        },
      ],
    },
  ],
};

const outlineDisabledCompiledDoc = {
  ...compiledDoc,
  artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
  contentHash: `sha256-${'1'.repeat(64)}`,
  compilerVersion: COMPILER_VERSION,
  rendererContractVersion: RENDERER_CONTRACT_VERSION,
  trigger: { type: 'manual' },
  audience: { environments: ['staging'] },
  theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  appearance: {
    ...DEFAULT_EXPERIENCE_APPEARANCE,
    displayTargetOutline: false,
  },
  localization: { defaultLocale: 'en', defaultTitle: 'Tour', variants: [] },
} as NewCompiledDocument;

const nativeGetBoundingClientRect = Element.prototype.getBoundingClientRect;

describe('tour renderer (PRD §16.1)', () => {
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = () =>
      domRect({ x: 40, y: 60, width: 300, height: 160 });
    computePositionMock.mockClear();
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
    document.body.innerHTML = `
      <button data-lodariq-id="new-project" aria-label="New project">New project</button>
    `;
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = nativeGetBoundingClientRect;
    resetRuntimeLocaleForTests();
    vi.unstubAllGlobals();
  });

  it('keeps only one active tour host in the page', () => {
    new TourPlayer(compiledDoc).start();
    new TourPlayer(compiledDoc).start();

    expect(document.querySelectorAll('lodariq-tour')).toHaveLength(1);
  });

  it('keeps the target outline absent when delivery playback explicitly disables it', async () => {
    const player = new TourPlayer(outlineDisabledCompiledDoc);
    player.start();
    await player.waitUntilReady();

    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    expect(root?.querySelector('[data-lodariq-target-outline]')).toBeNull();
    player.stop();
  });

  it('renders the selected authored-content locale and attaches it to Tour analytics', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const arabicSteps = structuredClone(outlineDisabledCompiledDoc.steps);
    arabicSteps[0]!.body[0]!.text = 'أنشئ مشروعك الأول';
    const localizedDocument: NewCompiledDocument = {
      ...outlineDisabledCompiledDoc,
      localization: {
        ...outlineDisabledCompiledDoc.localization,
        variants: [
          {
            locale: 'ar',
            fallbackLocale: 'en',
            title: 'جولة ترحيبية',
            steps: arabicSteps,
          },
        ],
      },
    };
    const player = new TourPlayer(localizedDocument, { locale: 'ar' });
    const runtime = new LodariqRuntime({
      workspaceId: 'wk_localized',
      environment: 'production',
      ingestUrl: '/events',
    });

    player.start();
    await player.waitUntilReady();
    runtime.track('tour_started', { documentId: localizedDocument.documentId });
    runtime.endTour('tour_completed', localizedDocument.documentId);
    runtime.flush();

    const host = document.querySelector<HTMLElement>('lodariq-tour');
    expect(host).toMatchObject({ lang: 'ar', dir: 'rtl' });
    expect(host?.dataset['lodariqContentLocale']).toBe('ar');
    expect(host?.shadowRoot?.textContent).toContain('أنشئ مشروعك الأول');
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ props?: Record<string, unknown> }>;
    };
    expect(body.events.map((event) => event.props?.['locale'])).toEqual(['ar', 'ar']);
    player.stop();
  });

  it('loads tour-only runtime copy for the customer page locale', async () => {
    document.documentElement.lang = 'ar';
    const player = new TourPlayer(compiledDoc);

    player.start();
    await player.waitUntilReady();

    const host = document.querySelector<HTMLElement>('lodariq-tour');
    expect(host).toMatchObject({ lang: 'ar', dir: 'rtl' });
    expect(host?.dataset['lodariqContentLocale']).toBe('ar');
    expect(host?.shadowRoot?.querySelector('.tour-skip')).toBeNull();
    player.stop();
  });

  it('positions the default target outline around a legacy delivery owner as it moves', async () => {
    const owner = document.querySelector<HTMLElement>('[data-lodariq-id="new-project"]')!;
    let ownerRect = domRect({ x: 52, y: 76, width: 220, height: 84 });
    owner.getBoundingClientRect = vi.fn(() => ownerRect);
    const player = new TourPlayer(compiledDoc);

    player.start();
    await player.waitUntilReady();

    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    const outline = root?.querySelector<HTMLElement>('[data-lodariq-target-outline]');
    expect(outline?.hidden).toBe(false);
    expect(outline?.getAttribute('aria-hidden')).toBe('true');
    expect(outline?.style.left).toBe('49px');
    expect(outline?.style.top).toBe('73px');
    expect(outline?.style.width).toBe('226px');
    expect(outline?.style.height).toBe('90px');

    ownerRect = domRect({ x: 96, y: 128, width: 260, height: 104 });
    window.dispatchEvent(new Event('scroll'));
    await nextAnimationFrame();

    expect(outline?.style.left).toBe('93px');
    expect(outline?.style.top).toBe('125px');
    expect(outline?.style.width).toBe('266px');
    expect(outline?.style.height).toBe('110px');
    player.stop();
  });

  it('does not steal focus when a target-bound step cannot resolve safely', async () => {
    document.body.innerHTML = '<button id="outside">Keep focus here</button>';
    const outside = document.querySelector<HTMLButtonElement>('#outside')!;
    outside.focus();

    new TourPlayer(compiledDoc).start();
    await nextTask();

    const card = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
  });

  it('dismisses with Escape and restores focus to the element active before playback', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const dismissed = vi.fn();
    owner.focus();
    const player = new TourPlayer(compiledDoc, { onDismiss: dismissed });

    player.start();
    await player.waitUntilReady();
    const card = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      card?.contains(document.querySelector('lodariq-tour')?.shadowRoot?.activeElement ?? null),
    ).toBe(true);

    card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(dismissed).toHaveBeenCalledOnce();
    expect(document.querySelector('lodariq-tour')).toBeNull();
    expect(document.activeElement).toBe(owner);
  });

  it.each([
    'keyboard',
    'screenReader',
    'reducedMotion',
    'zoom200',
    'rtl',
    'compactReflow',
  ] as const)('wires the %s authoring accessibility preview through the runtime', async (mode) => {
    const targetless: NewCompiledDocument = {
      ...outlineDisabledCompiledDoc,
      targets: [],
      steps: [{ ...compiledDoc.steps[0]!, targetId: undefined, accessibilityName: 'Intro step' }],
    };
    const player = new TourPlayer(targetless, {
      authoringPreviewOwnerId: 'accessibility-preview-owner',
      authoringPreviewInteractive: true,
      authoringAccessibilityMode: mode,
    });

    player.start();

    const host = document.querySelector<HTMLElement>('lodariq-tour');
    expect(host?.dataset['lodariqAccessibilityPreview']).toBe(mode);
    if (mode === 'rtl') expect(host?.dir).toBe('rtl');
    if (mode === 'keyboard') {
      await vi.waitFor(() =>
        expect(host?.shadowRoot?.querySelector('.tour-accessibility-evidence ol')).not.toBeNull(),
      );
    }
    if (mode === 'screenReader') {
      await vi.waitFor(() =>
        expect(
          host?.shadowRoot?.querySelector('[data-lodariq-announcement-log]')?.textContent,
        ).toContain('Intro step'),
      );
    }
    player.stop();
  });

  it('records runtime wait announcements in the screen-reader preview log', async () => {
    const targetless: NewCompiledDocument = {
      ...outlineDisabledCompiledDoc,
      targets: [],
      steps: [
        {
          id: 'step_waiting',
          accessibilityName: 'Waiting step',
          body: [
            {
              id: 'wait_action',
              type: 'button' as const,
              text: 'Start wait',
              props: {
                action: {
                  type: 'runSequence' as const,
                  sequence: {
                    trigger: { type: 'manual' as const },
                    waitFor: [{ type: 'event' as const, eventName: 'product.ready' }],
                    transition: { type: 'complete' as const },
                    timeoutMs: 1_000,
                    onTimeout: 'stay' as const,
                  },
                },
              },
            },
          ],
        },
      ],
    };
    let markWaitStarted: (() => void) | undefined;
    const waitStarted = new Promise<void>((resolve) => {
      markWaitStarted = resolve;
    });
    const player = new TourPlayer(targetless, {
      authoringPreviewOwnerId: 'screen-reader-log-owner',
      authoringPreviewInteractive: true,
      authoringAccessibilityMode: 'screenReader',
      onChoreographyStageChange: (_step, update) => {
        if (update.stage === 'wait' && update.status === 'started') markWaitStarted?.();
      },
    });
    player.start();

    document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('button')
      ?.click();
    await waitStarted;

    await vi.waitFor(() =>
      expect(
        document
          .querySelector('lodariq-tour')
          ?.shadowRoot?.querySelector('[data-lodariq-announcement-log]')?.textContent,
      ).toContain('Waiting for the next condition'),
    );
    player.stop();
  });

  it('does not focus or arm an initially zero-sized owner', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const outside = document.createElement('button');
    outside.textContent = 'Keep focus here';
    document.body.appendChild(outside);
    outside.focus();
    let ownerRect = domRect({ x: 40, y: 60, width: 0, height: 0 });
    owner.getBoundingClientRect = vi.fn(() => ownerRect);
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Waiting for a visible owner',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Owner became visible', props: {} }],
        },
      ],
    });

    player.start();
    await nextTask();
    const card = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.hidden).toBe(true);
    expect(document.activeElement).toBe(outside);
    owner.click();
    await nextTask();
    expect(card?.textContent).toContain('Waiting for a visible owner');

    ownerRect = domRect({ x: 40, y: 60, width: 300, height: 160 });
    window.dispatchEvent(new Event('resize'));
    await revalidationTask();
    expect(card?.hidden).toBe(false);
    owner.click();
    await nextTask();
    expect(card?.textContent).toContain('Owner became visible');
  });

  it('projects a point presentation anchor from fresh owner bounds on viewport changes', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    let ownerRect = domRect({ x: 100, y: 200, width: 400, height: 200 });
    owner.getBoundingClientRect = vi.fn(() => ownerRect);

    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          presentationAnchor: { kind: 'point', xRatio: 0.25, yRatio: 0.75 },
        },
      ],
    });
    player.start();
    await player.waitUntilReady();

    const reference = computePositionMock.mock.calls[0]?.[0] as FloatingUiDomModule.VirtualElement;
    expect(reference).not.toBe(owner);
    expect(reference.contextElement).toBe(owner);
    expect(reference.getBoundingClientRect()).toEqual({
      x: 200,
      y: 350,
      width: 0,
      height: 0,
      top: 350,
      right: 200,
      bottom: 350,
      left: 200,
    });

    ownerRect = domRect({ x: 120, y: 240, width: 800, height: 400 });
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    await nextAnimationFrame();

    expect(computePositionMock).toHaveBeenCalledTimes(2);
    expect(reference.getBoundingClientRect()).toMatchObject({
      x: 320,
      y: 540,
      width: 0,
      height: 0,
    });
    player.stop();
  });

  it.each([
    {
      name: 'element bounds',
      presentationAnchor: { kind: 'element-bounds' } as const,
      expected: { x: 40, y: 60, width: 300, height: 160 },
    },
    {
      name: 'normalized region',
      presentationAnchor: {
        kind: 'region',
        xRatio: 0.1,
        yRatio: 0.25,
        widthRatio: 0.5,
        heightRatio: 0.4,
      } as const,
      expected: { x: 70, y: 100, width: 150, height: 64 },
    },
  ])('projects $name presentation anchors without changing the owner', async (example) => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    owner.getBoundingClientRect = vi.fn(() => domRect({ x: 40, y: 60, width: 300, height: 160 }));

    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          presentationAnchor: example.presentationAnchor,
        },
      ],
    });
    player.start();
    await player.waitUntilReady();

    const reference = computePositionMock.mock.calls[0]?.[0] as FloatingUiDomModule.VirtualElement;
    expect(reference.contextElement).toBe(owner);
    expect(reference.getBoundingClientRect()).toMatchObject(example.expected);
    player.stop();
  });

  it('clamps malformed presentation ratios to the resolved owner bounds', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    owner.getBoundingClientRect = vi.fn(() => domRect({ x: 40, y: 60, width: 300, height: 160 }));

    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          presentationAnchor: {
            kind: 'region',
            xRatio: -0.2,
            yRatio: 0.75,
            widthRatio: 1.4,
            heightRatio: 0.8,
          },
        },
      ],
    });
    player.start();
    await player.waitUntilReady();

    const reference = computePositionMock.mock.calls[0]?.[0] as FloatingUiDomModule.VirtualElement;
    expect(reference.getBoundingClientRect()).toMatchObject({
      x: 40,
      y: 180,
      width: 300,
      height: 40,
    });
    player.stop();
  });

  it('defensively projects non-finite presentation ratios inside the owner', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    owner.getBoundingClientRect = vi.fn(() => domRect({ x: 40, y: 60, width: 300, height: 160 }));

    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          presentationAnchor: {
            kind: 'point',
            xRatio: Number.NaN,
            yRatio: Number.POSITIVE_INFINITY,
          },
        },
      ],
    });
    player.start();
    await player.waitUntilReady();

    const reference = computePositionMock.mock.calls[0]?.[0] as FloatingUiDomModule.VirtualElement;
    expect(reference.getBoundingClientRect()).toMatchObject({ x: 40, y: 60, width: 0, height: 0 });
    player.stop();
  });

  it('repositions from a real-owner ResizeObserver and disconnects it on stop', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notifyResize: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    const resizeObserverDescriptor = Object.getOwnPropertyDescriptor(window, 'ResizeObserver');
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: TestResizeObserver,
    });

    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          presentationAnchor: {
            kind: 'region',
            xRatio: 0.1,
            yRatio: 0.2,
            widthRatio: 0.3,
            heightRatio: 0.4,
          },
        },
      ],
    });
    try {
      player.start();
      await player.waitUntilReady();

      expect(observe).toHaveBeenCalledWith(owner);
      const positionCount = computePositionMock.mock.calls.length;
      notifyResize?.([], {} as ResizeObserver);
      await nextAnimationFrame();
      expect(computePositionMock).toHaveBeenCalledTimes(positionCount + 1);

      player.stop();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      player.stop();
      if (resizeObserverDescriptor) {
        Object.defineProperty(window, 'ResizeObserver', resizeObserverDescriptor);
      } else {
        Reflect.deleteProperty(window, 'ResizeObserver');
      }
    }
  });

  it('clicks the real owner and advances from a clickTarget tour button', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const productClick = vi.fn();
    owner.addEventListener('click', productClick);
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          presentationAnchor: { kind: 'point', xRatio: 0.5, yRatio: 0.5 },
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Click product element',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Owner clicked', props: {} }],
        },
      ],
    });

    player.start();
    await nextTask();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();
    await nextTask();

    expect(productClick).toHaveBeenCalledOnce();
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Owner clicked',
    );
  });

  it('freshly validates the real owner before accepting its click', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Waiting for product click',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Advanced', props: {} }],
        },
      ],
    });

    player.start();
    await nextTask();
    owner.setAttribute('data-lodariq-id', 'repurposed');
    owner.setAttribute('aria-label', 'Delete project');
    owner.textContent = 'Delete project';
    owner.click();
    await nextTask();

    const card = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.hidden).toBe(true);
    expect(card?.textContent).toContain('Waiting for product click');

    owner.setAttribute('data-lodariq-id', 'new-project');
    owner.setAttribute('aria-label', 'New project');
    owner.textContent = 'New project';
    await revalidationTask();
    expect(card?.hidden).toBe(false);

    owner.click();
    await nextTask();
    expect(card?.textContent).toContain('Advanced');
  });

  it('renders a styled dialog and completes the tour from the button', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_runtime">';
    let completed = false;
    const player = new TourPlayer(compiledDoc, {
      onComplete: () => {
        completed = true;
      },
    });

    player.start();
    await nextTask();

    const host = document.querySelector<HTMLElement>('lodariq-tour');
    const dialog = host?.shadowRoot?.querySelector('[role="dialog"]');
    const button = host?.shadowRoot?.querySelector('button');
    const heading = host?.shadowRoot?.querySelector<HTMLElement>(
      `[${LODARIQ_RENDERED_NODE_ID_ATTRIBUTE}="heading_1"]`,
    );

    const styles = host?.shadowRoot?.querySelector('style');
    expect(styles?.textContent).toContain('position: fixed');
    expect(styles?.nonce).toBe('nonce_runtime');
    expect(dialog?.getAttribute('aria-label')).toBe('Lodariq tour');
    expect(dialog?.textContent).toContain('Create your first project');
    expect(heading?.getAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE)).toBe('heading');
    expect(heading?.hasAttribute('contenteditable')).toBe(false);
    expect(heading?.getAttribute('role')).toBeNull();
    expect(host?.shadowRoot?.activeElement).toBe(button);
    expect(host?.style.getPropertyValue('--lq-tour-surface')).toBe('#ffffff');
    expect(styles?.textContent).toContain('var(--lq-tour-surface)');

    button?.click();

    expect(completed).toBe(true);
    expect(document.querySelector('lodariq-tour')).toBeNull();
  });

  it('renders allowlisted rich-text styles from the compiled body node', async () => {
    const styledDocument: CompiledDocument = structuredClone(compiledDoc);
    styledDocument.steps[0]!.body[0]!.props.textStyle = {
      align: 'center',
      fontSizePx: 24,
      color: '#0a4f43',
      fontWeight: 700,
      fontStyle: 'italic',
    };

    new TourPlayer(styledDocument).start();
    await nextTask();

    const heading = document
      .querySelector<HTMLElement>('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>(
        `[${LODARIQ_RENDERED_NODE_ID_ATTRIBUTE}="heading_1"]`,
      );
    expect(heading?.style.textAlign).toBe('center');
    expect(heading?.style.fontSize).toBe('24px');
    expect(heading?.style.color).toBe('rgb(10, 79, 67)');
    expect(heading?.style.fontWeight).toBe('700');
    expect(heading?.style.fontStyle).toBe('italic');
  });

  it('renders ordered rich text, action placement, and safe button styling', async () => {
    const styledDocument: CompiledDocument = structuredClone(compiledDoc);
    const step = styledDocument.steps[0]!;
    step.targetId = undefined;
    step.tooltipLayout = {
      widthPx: 480,
      heightPx: 320,
      contentAlign: 'center',
      actionLayout: 'stack',
      actionAlign: 'stretch',
      gap: 'relaxed',
      padding: 'compact',
      radius: 'round',
      showArrow: false,
    };
    step.tooltipStyle = {
      surfaceColor: '#162033',
      textColor: '#ffffff',
      borderColor: '#006b58',
      borderWeight: 'strong',
      elevation: 'floating',
    };
    step.body = [
      {
        id: 'copy_before',
        type: 'paragraph',
        text: 'Your trial ends in 3 days.',
        contentRuns: [
          { text: 'Your trial ends in ' },
          {
            text: '3 days',
            marks: ['bold', 'underline'],
            fontSizePx: 24,
            color: '#006b58',
            highlightColor: '#fff0a8',
          },
          { text: '.' },
        ],
        props: {},
      },
      {
        id: 'styled_action',
        type: 'button',
        text: 'Upgrade now',
        props: {
          action: { type: 'complete' },
          variant: 'outline',
          blockLayout: { align: 'stretch', spacingBefore: 'relaxed', spacingAfterPx: 18 },
          buttonStyle: {
            width: 'hug',
            widthPx: 232,
            size: 'compact',
            fillColor: '#ffffff',
            textColor: '#006b58',
            borderColor: '#006b58',
            radius: 'round',
            icon: 'arrow-right',
            iconPlacement: 'end',
          },
        },
      },
      {
        id: 'copy_after',
        type: 'paragraph',
        text: 'You can change plans later.',
        props: {},
      },
    ];

    new TourPlayer(styledDocument).start();
    await nextTask();

    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    const dialog = root?.querySelector<HTMLElement>('[role="dialog"]');
    const orderedNodes = [...(root?.querySelectorAll<HTMLElement>('[data-lodariq-node-id]') ?? [])];
    const emphasized = orderedNodes[0]?.querySelectorAll('span')[1] as HTMLElement | undefined;
    const button = root?.querySelector<HTMLButtonElement>('[data-lodariq-node-id="styled_action"]');

    expect(orderedNodes.map((node) => node.dataset['lodariqNodeId'])).toEqual([
      'copy_before',
      'styled_action',
      'copy_after',
    ]);
    expect(dialog?.dataset).toMatchObject({
      lodariqPopupWidth: 'custom',
      lodariqPopupHeight: 'custom',
      lodariqContentAlign: 'center',
      lodariqActionLayout: 'stack',
      lodariqActionAlign: 'stretch',
      lodariqCompositionGap: 'relaxed',
      lodariqCompositionPadding: 'compact',
      lodariqPopupRadius: 'round',
      lodariqPointerArrow: 'hide',
      lodariqPopupBorderWeight: 'strong',
      lodariqPopupElevation: 'floating',
    });
    expect(dialog?.style.getPropertyValue('--lq-popup-width')).toBe('480px');
    expect(dialog?.style.getPropertyValue('--lq-popup-height')).toBe('320px');
    expect(dialog?.style.getPropertyValue('--lq-popup-surface')).toBe('#162033');
    expect(dialog?.style.getPropertyValue('--lq-popup-text')).toBe('#ffffff');
    expect(dialog?.style.getPropertyValue('--lq-popup-muted-text')).toBe('#ffffff');
    expect(dialog?.style.getPropertyValue('--lq-popup-border')).toBe('#006b58');
    expect(dialog?.querySelector(':scope > .tour-content')).not.toBeNull();
    expect(emphasized?.textContent).toBe('3 days');
    expect(emphasized?.style.fontWeight).toBe('700');
    expect(emphasized?.style.textDecoration).toBe('underline');
    expect(emphasized?.style.fontSize).toBe('24px');
    expect(emphasized?.style.color).toBe('rgb(0, 107, 88)');
    expect(emphasized?.style.backgroundColor).toBe('rgb(255, 240, 168)');
    expect(button?.parentElement?.className).toBe('tour-action-group');
    expect(button?.dataset).toMatchObject({
      lodariqActionWidth: 'custom',
      lodariqActionSize: 'compact',
      lodariqActionRadius: 'round',
      lodariqBlockAlign: 'stretch',
      lodariqSpacingAfterPx: '18',
    });
    expect(button?.style.getPropertyValue('--lq-block-spacing-after')).toBe('18px');
    expect(button?.style.getPropertyValue('--lq-action-width')).toBe('232px');
    expect(button?.style.getPropertyValue('--lq-action-fill')).toBe('#ffffff');
    expect(button?.style.getPropertyValue('--lq-action-text')).toBe('#006b58');
    expect(button?.style.getPropertyValue('--lq-action-border')).toBe('#006b58');
    expect(button?.querySelector('.tour-action-icon')).not.toBeNull();
  });

  it('maps a validated theme recipe and appearance to allowlisted renderer variables', () => {
    const theme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    theme.definition.tokens.modes.dark!.colors.surfaceInverse = '#102a24';
    theme.definition.tokens.modes.dark!.colors.textInverse = '#f4fff9';
    theme.definition.tokens.sizing.tourWidePx = 512;
    theme.definition.tokens.spacing.lg = 20;
    const documentV2 = {
      ...compiledDoc,
      artifactSchemaVersion: COMPILED_ARTIFACT_SCHEMA_VERSION,
      contentHash: `sha256-${'1'.repeat(64)}`,
      compilerVersion: COMPILER_VERSION,
      rendererContractVersion: RENDERER_CONTRACT_VERSION,
      trigger: { type: 'manual' },
      audience: { environments: ['staging'] },
      theme,
      appearance: {
        preset: 'inverse',
        density: 'compact',
        width: 'wide',
        colorMode: 'system',
      },
      localization: { defaultLocale: 'en', defaultTitle: 'Tour', variants: [] },
    } as NewCompiledDocument;

    const resolved = resolveCompiledTourTheme(documentV2, true);

    expect(resolved.colorMode).toBe('dark');
    expect(resolved.variables).toMatchObject({
      '--lq-tour-surface': '#102a24',
      '--lq-tour-text-color': '#f4fff9',
      '--lq-tour-width': '512px',
    });
    expect(Object.keys(resolved.variables).every((name) => name.startsWith('--lq-tour-'))).toBe(
      true,
    );

    const reducedMotion = resolveCompiledTourTheme(documentV2, true, true);
    expect(reducedMotion.variables['--lq-tour-motion-duration']).toBe('0ms');
  });

  it('mounts multiple inert targetless previews without changing delivery singleton behavior', () => {
    const targetlessStep = structuredClone(compiledDoc.steps[0]!);
    delete targetlessStep.targetId;
    const previewDocument: CompiledDocument = {
      ...compiledDoc,
      targets: [],
      steps: [targetlessStep],
    };
    const beforeContainer = document.createElement('div');
    const afterContainer = document.createElement('div');
    beforeContainer.style.position = 'relative';
    afterContainer.style.position = 'relative';
    document.body.append(beforeContainer, afterContainer);

    const before = new TourPlayer(previewDocument, {
      embeddedPreviewContainer: beforeContainer,
    });
    const after = new TourPlayer(previewDocument, {
      embeddedPreviewContainer: afterContainer,
    });
    before.start();
    after.start();

    const beforeHost = beforeContainer.querySelector('lodariq-tour');
    const afterHost = afterContainer.querySelector('lodariq-tour');
    expect(beforeHost?.hasAttribute('data-lodariq-embedded-preview')).toBe(true);
    expect(beforeHost?.hasAttribute('inert')).toBe(true);
    expect(beforeHost?.shadowRoot?.querySelector('style')?.textContent).toContain(
      'box-sizing: border-box',
    );
    expect(afterHost?.shadowRoot?.querySelector('[role="dialog"]')?.textContent).toContain(
      'Create your first project',
    );
    afterHost?.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click();
    expect(afterContainer.querySelector('lodariq-tour')).toBe(afterHost);

    const delivery = new TourPlayer(compiledDoc);
    delivery.start();
    expect(beforeContainer.querySelector('lodariq-tour')).toBe(beforeHost);
    expect(afterContainer.querySelector('lodariq-tour')).toBe(afterHost);

    delivery.stop();
    before.stop();
    after.stop();
  });

  it('keeps an owned authoring preview separate from concurrent delivery playback', async () => {
    const previewStep = structuredClone(compiledDoc.steps[0]!);
    delete previewStep.targetId;
    const previewDocument: CompiledDocument = {
      ...compiledDoc,
      documentId: 'doc_authoring_preview',
      targets: [],
      steps: [previewStep],
    };
    const delivery = new TourPlayer(compiledDoc);
    delivery.start();
    const preview = new TourPlayer(previewDocument, {
      authoringPreviewOwnerId: 'authoring_owner_1',
    });
    preview.start();
    await preview.waitUntilReady();

    const hosts = [...document.querySelectorAll('lodariq-tour')];
    const previewHost = hosts.find(
      (host) =>
        host.getAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE) === 'authoring_owner_1',
    );
    const deliveryHost = hosts.find(
      (host) => !host.hasAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE),
    );
    expect(previewHost).toBeDefined();
    expect(deliveryHost).toBeDefined();

    previewHost?.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click();
    expect(previewHost?.isConnected).toBe(true);
    preview.stop();
    expect(deliveryHost?.isConnected).toBe(true);
    delivery.stop();
  });

  it('lets an explicit full authoring preview advance through multiple steps', async () => {
    const firstStep = structuredClone(compiledDoc.steps[0]!);
    delete firstStep.targetId;
    const previewDocument: CompiledDocument = {
      ...compiledDoc,
      documentId: 'doc_interactive_authoring_preview',
      targets: [],
      steps: [
        firstStep,
        {
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Second step', props: {} }],
        },
      ],
    };
    const preview = new TourPlayer(previewDocument, {
      authoringPreviewOwnerId: 'authoring_owner_interactive',
      authoringPreviewInteractive: true,
    });
    preview.start();
    await preview.waitUntilReady();

    const host = document.querySelector(
      `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="authoring_owner_interactive"]`,
    );
    const card = host?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      host?.shadowRoot?.querySelector<HTMLElement>('[data-lodariq-target-outline]')?.hidden,
    ).toBe(true);
    expect(card?.textContent).toContain('Create your first project');
    card?.querySelector<HTMLButtonElement>('button')?.click();
    await nextTask();
    expect(card?.textContent).toContain('Second step');
    preview.stop();
  });

  it('resolves readiness only after a targeted card is visible and positioned', async () => {
    const player = new TourPlayer(compiledDoc, {
      authoringPreviewOwnerId: 'authoring_owner_ready',
    });
    player.start();
    const card = document
      .querySelector(
        `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="authoring_owner_ready"]`,
      )
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.hidden).toBe(true);

    await player.waitUntilReady();

    expect(card?.hidden).toBe(false);
    expect(card?.style.left).toBe('12px');
    expect(card?.style.top).toBe('16px');
    const arrow = card?.querySelector<HTMLElement>('.tour-arrow');
    expect(arrow?.hidden).toBe(false);
    expect(arrow?.style.top).toBe('-9px');
    expect(arrow?.dataset['side']).toBe('bottom');
    player.stop();
  });

  it('orients the arrow on every side without over-constraining its position', async () => {
    const cases = [
      {
        placement: 'bottom',
        position: { bottom: '', left: '24px', right: '', top: '-9px' },
      },
      {
        placement: 'top',
        position: { bottom: '-9px', left: '24px', right: '', top: '' },
      },
      {
        placement: 'right',
        position: { bottom: '', left: '-9px', right: '', top: '64px' },
      },
      {
        placement: 'left',
        position: { bottom: '', left: '', right: '-9px', top: '64px' },
      },
    ] as const;

    for (const arrowCase of cases) {
      computePositionMock.mockResolvedValueOnce({
        x: 12,
        y: 16,
        placement: arrowCase.placement,
        strategy: 'fixed',
        middlewareData: { arrow: { x: 24, y: 64 } },
      });
      const player = new TourPlayer(compiledDoc, {
        authoringPreviewOwnerId: `authoring_arrow_${arrowCase.placement}`,
      });
      player.start();
      await player.waitUntilReady();

      const arrow = document
        .querySelector(
          `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="authoring_arrow_${arrowCase.placement}"]`,
        )
        ?.shadowRoot?.querySelector<HTMLElement>('.tour-arrow');
      expect(arrow?.dataset['side']).toBe(arrowCase.placement);
      expect(arrow?.style.left).toBe(arrowCase.position.left);
      expect(arrow?.style.top).toBe(arrowCase.position.top);
      expect(arrow?.style.right).toBe(arrowCase.position.right);
      expect(arrow?.style.bottom).toBe(arrowCase.position.bottom);
      player.stop();
    }
  });

  it('keeps a visible pointer outside a scrollable custom-height popup', async () => {
    const customHeightDocument = structuredClone(compiledDoc);
    customHeightDocument.steps[0]!.tooltipLayout = {
      ...customHeightDocument.steps[0]!.tooltipLayout,
      heightPx: 320,
      showArrow: true,
    };
    const player = new TourPlayer(customHeightDocument, {
      authoringPreviewOwnerId: 'authoring_custom_height_arrow',
    });
    player.start();
    await player.waitUntilReady();

    const root = document.querySelector(
      `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="authoring_custom_height_arrow"]`,
    )?.shadowRoot;
    const dialog = root?.querySelector<HTMLElement>('[role="dialog"]');
    const arrow = dialog?.querySelector<HTMLElement>(':scope > .tour-arrow');
    const styles = root?.querySelector('style')?.textContent ?? '';

    expect(dialog?.dataset['lodariqPopupHeight']).toBe('custom');
    expect(dialog?.querySelector(':scope > .tour-content')).not.toBeNull();
    expect(arrow?.hidden).toBe(false);
    expect(styles).toContain(
      'div[role="dialog"][data-lodariq-popup-height="custom"] > .tour-content',
    );
    expect(styles).toContain('overflow: visible;');
    player.stop();
  });

  it('positions an authoring preview on the exact passive element that was just selected', async () => {
    document.body.innerHTML =
      '<article><span>Active projects</span><strong>18</strong><small>3 launched this month</small></article>';
    const selected = document.querySelector('article')!;
    let selectedRect = domRect({ x: 80, y: 120, width: 240, height: 96 });
    selected.getBoundingClientRect = vi.fn(() => selectedRect);
    const onTargetResolution = vi.fn();
    const player = new TourPlayer(compiledDoc, {
      authoringPreviewOwnerId: 'authoring_owner_exact_selection',
      authoringTargetOverride: { stepId: 'step_1', element: selected },
      onTargetResolution,
    });

    player.start();
    await player.waitUntilReady();

    const host = document.querySelector<HTMLElement>(
      `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="authoring_owner_exact_selection"]`,
    );
    const card = host?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    const ring = host?.shadowRoot?.querySelector<HTMLElement>('[data-lodariq-target-outline]');
    expect(card?.hidden).toBe(false);
    expect(card?.style.left).toBe('12px');
    expect(card?.style.top).toBe('16px');
    expect(ring?.hidden).toBe(false);
    expect(ring?.getAttribute('aria-hidden')).toBe('true');
    expect(ring?.style.left).toBe('77px');
    expect(ring?.style.top).toBe('117px');
    expect(ring?.style.width).toBe('246px');
    expect(ring?.style.height).toBe('102px');
    expect(host?.style.getPropertyValue('--lq-tour-focus-color')).toBe('#0b63ce');
    const styles = host?.shadowRoot?.querySelector('style')?.textContent ?? '';
    // The ring is customisable per step, so its default lives in the fallbacks —
    // and a step with no emphasis must leave every override unset.
    expect(styles).toContain(
      'border: var(--lq-outline-weight, 2px) var(--lq-outline-line, solid)\n        var(--lq-outline-color, var(--lq-tour-focus-color))',
    );
    expect(ring?.style.getPropertyValue('--lq-outline-weight')).toBe('');
    expect(ring?.style.getPropertyValue('--lq-outline-color')).toBe('');
    expect(ring?.hasAttribute('data-lodariq-outline-line')).toBe(false);
    expect(styles).toContain('pointer-events: none');
    expect(onTargetResolution).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'step_1' }),
      expect.objectContaining({
        state: 'found',
        resolutionMethod: 'authoring_selection',
        reasonCode: 'resolved',
      }),
    );

    selectedRect = domRect({ x: 124, y: 164, width: 280, height: 112 });
    window.dispatchEvent(new Event('scroll'));
    await nextAnimationFrame();

    expect(ring?.style.left).toBe('121px');
    expect(ring?.style.top).toBe('161px');
    expect(ring?.style.width).toBe('286px');
    expect(ring?.style.height).toBe('118px');
    player.stop();
  });

  it('rejects an exact target override outside an owned authoring preview', () => {
    const selected = document.querySelector('button')!;
    expect(
      () =>
        new TourPlayer(compiledDoc, {
          authoringTargetOverride: { stepId: 'step_1', element: selected },
        }),
    ).toThrow('authoring target overrides require an owned authoring preview');
  });

  it('keeps authoring preview lifecycle and host-target behavior side-effect free', async () => {
    const target = document.querySelector<HTMLElement>('[data-lodariq-id="new-project"]')!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    const lifecycleControl = document.createElement('button');
    lifecycleControl.dataset['testid'] = 'open-project-panel';
    const activatePanel = vi.fn();
    lifecycleControl.addEventListener('click', activatePanel);
    document.body.appendChild(lifecycleControl);
    const previewDocument: CompiledDocument = {
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          lifecycle: {
            openPanel: {
              tagName: 'button',
              role: 'button',
              stableAttributes: { 'data-testid': 'open-project-panel' },
            },
          },
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Observe target',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_should_not_advance',
          body: [{ id: 'heading_2', type: 'heading', text: 'Advanced', props: {} }],
        },
      ],
    };
    const player = new TourPlayer(previewDocument, {
      authoringPreviewOwnerId: 'authoring_owner_passive',
    });
    player.start();
    await player.waitUntilReady();

    target.click();
    await nextTask();
    const card = document
      .querySelector(
        `lodariq-tour[${LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE}="authoring_owner_passive"]`,
      )
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(activatePanel).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(card?.textContent).toContain('Observe target');
    expect(card?.textContent).not.toContain('Advanced');
    player.stop();
  });

  it('rejects readiness when an authoring preview target cannot resolve', async () => {
    document.body.innerHTML = '';
    const player = new TourPlayer(compiledDoc, {
      authoringPreviewOwnerId: 'authoring_owner_unresolved',
    });
    player.start();

    await expect(player.waitUntilReady()).rejects.toThrow(
      'Lodariq tour target could not be resolved for step step_1',
    );
    player.stop();
  });

  it('cancels pending lifecycle work before it can activate customer controls', async () => {
    const openPanelFingerprint = {
      tagName: 'button',
      role: 'button',
      stableAttributes: { 'data-testid': 'late-panel-control' },
    };
    const lifecycleDocument: CompiledDocument = {
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          lifecycle: {
            openPanel: openPanelFingerprint,
            timeoutMs: 1_000,
          },
        },
      ],
    };
    const player = new TourPlayer(lifecycleDocument, {
      authoringPreviewOwnerId: 'authoring_owner_canceled',
    });
    player.start();
    const readiness = player.waitUntilReady();
    player.stop();

    const lateControl = document.createElement('button');
    lateControl.dataset['testid'] = 'late-panel-control';
    const click = vi.fn();
    lateControl.addEventListener('click', click);
    document.body.appendChild(lateControl);
    await expect(readiness).rejects.toThrow('Lodariq tour presentation was canceled');
    await nextTask();
    expect(click).not.toHaveBeenCalled();
  });

  it('rejects target-bearing artifacts in embedded preview mode', () => {
    const container = document.createElement('div');
    expect(() => new TourPlayer(compiledDoc, { embeddedPreviewContainer: container })).toThrow(
      'Embedded Tour previews must use targetless compiled steps',
    );
  });

  it('falls back safely when a legacy artifact has no theme or appearance', () => {
    const resolved = resolveCompiledTourTheme(compiledDoc, true);

    expect(resolved.theme.themeVersionId).toBe('themev_lodariq_accessible_v1');
    expect(resolved.appearance).toEqual({
      preset: 'default',
      density: 'comfortable',
      width: 'standard',
      colorMode: 'system',
      displayTargetOutline: true,
    });
    expect(resolved.colorMode).toBe('dark');
  });

  it('rejects an incompatible versioned artifact before mounting renderer state', () => {
    const incompatible = {
      ...compile({
        document: tourFixture as LodariqDocument,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
      contentHash: `sha256-${'9'.repeat(64)}`,
      rendererContractVersion: '99',
    } as unknown as CompiledDocument;

    expect(() => new TourPlayer(incompatible)).toThrow(
      'Lodariq artifact is incompatible with this runtime',
    );
    expect(document.querySelector('lodariq-tour')).toBeNull();
  });

  it('can start preview playback at a requested step', () => {
    const previewDoc: CompiledDocument = {
      ...compiledDoc,
      steps: [
        compiledDoc.steps[0]!,
        {
          ...compiledDoc.steps[0]!,
          id: 'step_2',
          body: [
            {
              id: 'heading_2',
              type: 'heading',
              text: 'Invite teammates',
              props: {},
            },
            {
              id: 'button_2',
              type: 'button',
              text: 'Finish',
              props: { action: { type: 'next' } },
            },
          ],
        },
      ],
    };

    new TourPlayer(previewDoc, { initialStepId: 'step_2' }).start();

    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Invite teammates',
    );
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).not.toContain(
      'Create your first project',
    );
  });

  it('replays an exported, re-imported, and recompiled tour fixture', () => {
    document.body.innerHTML = `
      <button data-lodariq-id="new-project" aria-label="New project">New project</button>
    `;
    const fixture = tourFixture as LodariqDocument;
    const imported = importDocument(exportDocument(fixture));
    const compiled: CompiledDocument = {
      ...compile({
        document: imported,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
      contentHash: 'local-preview',
    };

    new TourPlayer(compiled).start();

    expect(compiled.steps.map((step) => step.id)).toEqual(fixture.blocks.map((block) => block.id));
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Create your first project',
    );
  });

  it('keeps no-action buttons disabled so incomplete drafts do not advance', () => {
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [{ id: 'button_incomplete', type: 'button', text: 'Choose later', props: {} }],
        },
        {
          ...compiledDoc.steps[0]!,
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Second step', props: {} }],
        },
      ],
    });

    player.start();

    const button = document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button');
    button?.click();

    expect(button?.disabled).toBe(true);
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Choose later',
    );
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).not.toContain(
      'Second step',
    );
  });

  it('renders list, divider, and link body nodes as semantic elements', () => {
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            { id: 'list_1', type: 'list', text: 'First\nSecond', props: {} },
            { id: 'divider_1', type: 'divider', props: {} },
            {
              id: 'link_1',
              type: 'link',
              text: 'Open settings',
              props: { action: { type: 'openPage', url: '/settings' } },
            },
          ],
        },
      ],
    });

    player.start();

    const shadow = document.querySelector('lodariq-tour')?.shadowRoot;
    expect([...(shadow?.querySelectorAll('li') ?? [])].map((item) => item.textContent)).toEqual([
      'First',
      'Second',
    ]);
    expect(shadow?.querySelector('hr')?.dataset['lodariqNodeType']).toBe('divider');
    expect(shadow?.querySelector('a')?.getAttribute('href')).toBe('/settings');
  });

  it('renders typed callout, stat, icon, and captioned-video recipes accessibly', async () => {
    const structuredDoc: NewCompiledDocument = {
      ...outlineDisabledCompiledDoc,
      targets: [],
      steps: [
        {
          id: 'step_structured',
          body: [
            {
              id: 'callout_1',
              type: 'callout',
              text: 'Keep this page open.',
              contentRuns: [
                {
                  text: 'Keep this page open.',
                  highlightColor: '#fff1a8',
                  animation: {
                    recipe: 'lift',
                    durationMs: 450,
                    easing: 'emphasized',
                    reducedMotion: 'none',
                  },
                },
              ],
              props: {
                accessibilityName: 'Important page reminder',
                composition: { kind: 'callout', tone: 'warning' },
              },
            },
            {
              id: 'stat_1',
              type: 'stat',
              text: '42% adopted',
              props: {
                accessibilityName: 'Adoption is 42 percent',
                composition: { kind: 'stat', emphasis: 'strong' },
              },
            },
            {
              id: 'icon_1',
              type: 'icon',
              text: 'Recommended',
              props: {
                accessibilityName: 'Recommended path',
                composition: { kind: 'icon', icon: 'rocket' },
                textStyle: { align: 'center', color: '#c96047', fontSizePx: 28 },
              },
            },
            {
              id: 'video_1',
              type: 'media',
              props: {
                media: {
                  kind: 'video' as const,
                  assetId: 'video-asset',
                  captionsAssetId: 'captions-asset',
                  posterAssetId: 'poster-asset',
                  accessibilityName: 'Product walkthrough',
                  fit: 'cover',
                  heightPx: 180,
                  widthPercent: 75,
                },
              },
            },
          ],
        },
      ],
    };
    const player = new TourPlayer(structuredDoc, {
      resolveMediaAsset: (assetId, kind) => `/${kind}/${assetId}`,
    });

    player.start();

    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    expect(root?.querySelector('[role="note"]')?.getAttribute('aria-label')).toBe(
      'Important page reminder',
    );
    const animatedRun = root?.querySelector<HTMLElement>(
      '[role="note"] [data-lodariq-inline-motion="lift"]',
    );
    expect(animatedRun?.style.backgroundColor).toBe('rgb(255, 241, 168)');
    expect(animatedRun?.style.getPropertyValue('--lq-inline-motion-duration')).toBe('450ms');
    expect(root?.querySelector('[data-lodariq-stat-emphasis="strong"]')?.textContent).toBe(
      '42% adopted',
    );
    expect(root?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Recommended path',
    );
    await vi.waitFor(() =>
      expect(root?.querySelector('[role="img"] svg[aria-hidden="true"]')).not.toBeNull(),
    );
    expect(root?.querySelector('[role="img"] svg[data-lodariq-icon-loading]')).toBeNull();
    const icon = root?.querySelector<HTMLElement>('[data-lodariq-node-type="icon"]');
    expect(icon?.textContent).toBe('');
    expect(icon?.style.justifyContent).toBe('center');
    expect(icon?.style.fontSize).toBe('28px');
    expect(icon?.style.color).toBe('rgb(201, 96, 71)');
    const video = root?.querySelector<HTMLVideoElement>('video');
    expect(video?.controls).toBe(true);
    expect(video?.getAttribute('aria-label')).toBe('Product walkthrough');
    expect(video?.getAttribute('src')).toBe('/video/video-asset');
    expect(video?.getAttribute('poster')).toBe('/image/poster-asset');
    expect(video?.style.height).toBe('180px');
    expect(video?.style.objectFit).toBe('cover');
    expect(video?.style.width).toBe('75%');
    expect(video?.querySelector('track')?.getAttribute('src')).toBe('/captions/captions-asset');
    expect(video?.querySelector('track')?.kind).toBe('captions');
    expect(video?.querySelector('track')?.default).toBe(true);
    player.stop();
  });

  it('hydrates media after an async asset resolver returns', async () => {
    let resolveAsset!: (url: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveAsset = resolve;
    });
    const player = new TourPlayer(
      {
        ...outlineDisabledCompiledDoc,
        steps: [
          {
            ...outlineDisabledCompiledDoc.steps[0]!,
            body: [
              {
                id: 'image_async',
                type: 'media',
                props: {
                  media: {
                    kind: 'image',
                    assetId: 'image-asset',
                    accessibilityName: 'Landscape',
                  },
                },
              },
            ],
          },
        ],
      } as NewCompiledDocument,
      {
        resolveMediaAsset: () => pending,
      },
    );
    player.start();
    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    expect(root?.querySelector('[data-lodariq-media-unavailable="true"]')).not.toBeNull();
    resolveAsset('/image/image-asset');
    await vi.waitFor(() =>
      expect(root?.querySelector<HTMLImageElement>('img')?.getAttribute('src')).toBe(
        '/image/image-asset',
      ),
    );
    player.stop();
  });

  it('renders local blob preview URLs from the media resolver', async () => {
    const blobUrl = 'blob:http://localhost:3000/media-asset';
    const player = new TourPlayer(
      {
        ...outlineDisabledCompiledDoc,
        steps: [
          {
            ...outlineDisabledCompiledDoc.steps[0]!,
            body: [
              {
                id: 'image_blob',
                type: 'media',
                props: {
                  media: {
                    kind: 'image',
                    assetId: 'image-asset',
                    accessibilityName: 'Landscape',
                  },
                },
              },
            ],
          },
        ],
      } as NewCompiledDocument,
      {
        resolveMediaAsset: async () => blobUrl,
      },
    );
    player.start();
    await vi.waitFor(() =>
      expect(
        document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('img')?.getAttribute('src'),
      ).toBe(blobUrl),
    );
    expect(
      document
        .querySelector('lodariq-tour')
        ?.shadowRoot?.querySelector('[data-lodariq-media-unavailable="true"]'),
    ).toBeNull();
    player.stop();
  });

  it('disables openPage links outside the Phase 1 navigation policy', () => {
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'link_http',
              type: 'link',
              text: 'Open insecure page',
              props: { action: { type: 'openPage', url: 'http://example.com/settings' } },
            },
          ],
        },
      ],
    });

    player.start();

    const link = document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('a');
    expect(link?.getAttribute('aria-disabled')).toBe('true');
    expect(link?.hasAttribute('href')).toBe(false);
  });

  it('allows HTTPS, mailto, and same-app relative openPage links', () => {
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'link_https',
              type: 'link',
              text: 'Open docs',
              props: { action: { type: 'openPage', url: 'https://example.com/docs' } },
            },
            {
              id: 'link_mailto',
              type: 'link',
              text: 'Email support',
              props: { action: { type: 'openPage', url: 'mailto:support@example.com' } },
            },
            {
              id: 'link_relative',
              type: 'link',
              text: 'Open settings',
              props: { action: { type: 'openPage', url: '/settings' } },
            },
          ],
        },
      ],
    });

    player.start();

    const links = [
      ...(document.querySelector('lodariq-tour')?.shadowRoot?.querySelectorAll('a') ?? []),
    ];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/docs',
      'mailto:support@example.com',
      '/settings',
    ]);
    expect(links.map((link) => link.getAttribute('target'))).toEqual(['_blank', null, null]);
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(links.every((link) => link.getAttribute('aria-disabled') !== 'true')).toBe(true);
  });

  it('opens external HTTPS actions in a protected new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'button_external',
              type: 'button',
              text: 'Open docs',
              props: { action: { type: 'openPage', url: 'www.google.com' } },
            },
          ],
        },
      ],
    });

    player.start();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();

    expect(open).toHaveBeenCalledWith('https://www.google.com/', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('persists the next step before same-origin open-page navigation continues', () => {
    const nextStep = {
      id: 'step_2',
      body: [{ id: 'heading_2', type: 'heading' as const, text: 'Settings', props: {} }],
    };
    const onBeforeStepChange = vi.fn();
    const player = new TourPlayer(
      {
        ...compiledDoc,
        steps: [
          {
            id: 'step_1',
            body: [
              {
                id: 'button_internal',
                type: 'button',
                text: 'Open settings',
                props: {
                  action: {
                    type: 'openPage',
                    url: '#settings',
                    navigationBehavior: 'continue',
                  },
                },
              },
            ],
          },
          nextStep,
        ],
      },
      { onBeforeStepChange },
    );

    player.start();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();

    expect(onBeforeStepChange).toHaveBeenCalledWith(1, nextStep);
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('keeps legacy open-page actions on the current step by default', () => {
    const onBeforeStepChange = vi.fn();
    const player = new TourPlayer(
      {
        ...compiledDoc,
        steps: [
          {
            id: 'step_1',
            body: [
              {
                id: 'button_internal',
                type: 'button',
                text: 'Open settings',
                props: { action: { type: 'openPage', url: '#settings' } },
              },
            ],
          },
          {
            id: 'step_2',
            body: [{ id: 'heading_2', type: 'heading', text: 'Settings', props: {} }],
          },
        ],
      },
      { onBeforeStepChange },
    );

    player.start();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();

    expect(onBeforeStepChange).not.toHaveBeenCalled();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('goes back to the previous step from a back action', () => {
    const player = new TourPlayer(
      {
        ...compiledDoc,
        steps: [
          {
            ...compiledDoc.steps[0]!,
            body: [{ id: 'heading_1', type: 'heading', text: 'First step', props: {} }],
          },
          {
            ...compiledDoc.steps[0]!,
            id: 'step_2',
            body: [
              {
                id: 'button_back',
                type: 'button',
                text: 'Back',
                props: { action: { type: 'back' } },
              },
            ],
          },
        ],
      },
      { initialStepIndex: 1 },
    );

    player.start();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();

    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain('First step');
  });

  it('complete action closes playback, announces completion, and fires completion', async () => {
    const completed = vi.fn();
    const dismissed = vi.fn();
    const player = new TourPlayer(
      {
        ...compiledDoc,
        steps: [
          {
            ...compiledDoc.steps[0]!,
            body: [
              {
                id: 'button_complete',
                type: 'button',
                text: 'Finish',
                props: { action: { type: 'complete' } },
              },
            ],
          },
        ],
      },
      { onComplete: completed, onDismiss: dismissed },
    );

    player.start();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();

    expect(completed).toHaveBeenCalledOnce();
    expect(dismissed).not.toHaveBeenCalled();
    expect(document.querySelector('lodariq-tour')).toBeNull();
    await nextAnimationFrame();
    const announcement = document.querySelector<HTMLElement>(
      '[data-lodariq-tour-completion-announcement]',
    );
    expect(announcement?.getAttribute('role')).toBe('status');
    expect(announcement?.textContent).toBe('Tour complete');
  });

  it('dismiss action closes playback without completing the tour', () => {
    const completed = vi.fn();
    const dismissed = vi.fn();
    const player = new TourPlayer(
      {
        ...compiledDoc,
        steps: [
          {
            ...compiledDoc.steps[0]!,
            body: [
              {
                id: 'button_dismiss',
                type: 'button',
                text: 'Close',
                props: { action: { type: 'dismiss' } },
              },
            ],
          },
        ],
      },
      { onComplete: completed, onDismiss: dismissed },
    );

    player.start();
    document.querySelector('lodariq-tour')?.shadowRoot?.querySelector('button')?.click();

    expect(dismissed).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
    expect(document.querySelector('lodariq-tour')).toBeNull();
  });

  it('does not inject a static skip control; skip is authored as a canvas button', () => {
    const player = new TourPlayer(compiledDoc);

    player.start();
    const root = document.querySelector('lodariq-tour')?.shadowRoot;

    expect(root?.querySelector('.tour-skip')).toBeNull();
    expect(root?.textContent).not.toContain('Skip tour');
    player.stop();
  });

  it('does not paint choreography recovery chrome on an authoring preview', async () => {
    const player = new TourPlayer(
      {
        ...outlineDisabledCompiledDoc,
        targets: [],
        steps: [
          {
            id: 'step_waiting',
            body: [
              {
                id: 'wait_action',
                type: 'button',
                text: 'Start wait',
                props: {
                  action: {
                    type: 'runSequence',
                    sequence: {
                      trigger: { type: 'manual' },
                      waitFor: [{ type: 'event', eventName: 'never.arrives' }],
                      transition: { type: 'complete' },
                      timeoutMs: 20,
                      onTimeout: 'stay',
                    },
                  },
                },
              },
            ],
          },
        ],
      } as NewCompiledDocument,
      {
        authoringPreviewOwnerId: 'authoring_owner_recovery',
        authoringPreviewInteractive: true,
      },
    );
    player.start();
    document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('button')
      ?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    expect(root?.querySelector('.tour-choreography-recovery')).toBeNull();
    expect(root?.textContent).not.toContain('Try again');
    expect(root?.textContent).not.toContain('Skip step');
    expect(root?.textContent).not.toContain('Exit tour');
    player.stop();
  });

  it('advances after the user clicks the resolved product target', async () => {
    const sequence: string[] = [];
    const productClick = vi.fn(() => {
      sequence.push('product-click');
      const modal = document.createElement('section');
      modal.dataset['lodariqId'] = 'import-modal';
      modal.textContent = 'Import modal';
      document.body.appendChild(modal);
    });
    document
      .querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')
      ?.addEventListener('click', productClick);

    const doc: CompiledDocument = {
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'heading_1',
              type: 'heading',
              text: 'Click New project',
              props: {},
            },
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Waiting for product click',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_2',
          targetId: 'target_import_modal',
          body: [
            {
              id: 'heading_2',
              type: 'heading',
              text: 'Modal opened',
              props: {},
            },
          ],
          lifecycle: {
            waitForElement: {
              tagName: 'section',
              stableAttributes: { 'data-lodariq-id': 'import-modal' },
            },
            timeoutMs: 80,
          },
        },
      ],
      targets: [
        ...compiledDoc.targets,
        {
          id: 'target_import_modal',
          fingerprint: {
            tagName: 'section',
            stableAttributes: { 'data-lodariq-id': 'import-modal' },
          },
        },
      ],
    };
    const playerOptions = {
      onBeforeStepChange: (index: number, step: CompiledDocument['steps'][number]) => {
        sequence.push(`persist:${index}:${step.id}`);
      },
    };
    const player = new TourPlayer(doc, playerOptions);

    player.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(sequence).toEqual(['persist:1:step_2', 'product-click']);
    expect(productClick).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-lodariq-id="import-modal"]')).toBeTruthy();
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Modal opened',
    );
  });

  it('cleans target-click listeners when playback stops', async () => {
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Waiting for product click',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          ...compiledDoc.steps[0]!,
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Second step', props: {} }],
        },
      ],
    });

    player.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    player.stop();

    document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.querySelector('lodariq-tour')).toBeNull();
  });

  it('re-resolves and rebinds when the active product target node is replaced', async () => {
    const player = new TourPlayer({
      ...compiledDoc,
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Waiting for product click',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_2',
          body: [{ id: 'heading_2', type: 'heading', text: 'Replacement worked', props: {} }],
        },
      ],
    });

    player.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const original = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const replacement = document.createElement('button');
    replacement.dataset['lodariqId'] = 'new-project';
    replacement.setAttribute('aria-label', 'New project');
    replacement.textContent = 'New project';
    original.replaceWith(replacement);

    await new Promise((resolve) => setTimeout(resolve, 10));
    replacement.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(original.isConnected).toBe(false);
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Replacement worked',
    );
  });

  it('waits for an asynchronously rendered target after a delegated sidebar click', async () => {
    document.body.innerHTML = `
      <aside><nav><a data-route="projects">Projects</a></nav></aside>
      <main><section data-view="projects"></section></main>
    `;
    const projectsLink = document.querySelector<HTMLAnchorElement>('[data-route="projects"]')!;
    const projectsView = document.querySelector<HTMLElement>('[data-view="projects"]')!;
    projectsLink.addEventListener('click', () => {
      window.setTimeout(() => {
        const article = document.createElement('article');
        article.dataset['testid'] = 'project-workspace';
        article.textContent = 'Project workspace';
        projectsView.appendChild(article);
      }, 40);
    });

    const player = new TourPlayer({
      ...compiledDoc,
      targets: [
        {
          id: 'target_projects_navigation',
          fingerprint: { tagName: 'a', stableAttributes: {} },
          identity: {
            schemaVersion: 2,
            targetId: 'target_projects_navigation',
            intent: {
              elementKind: 'control',
              requiredAction: 'observe-click',
              resolutionMode: 'semantic',
            },
            invariants: {},
            semantics: { tagName: 'a' },
            context: { ancestorRoles: ['nav', 'complementary'] },
            localizedEvidence: [{ locale: 'en', accessibleName: 'Projects' }],
            captureEvidence: {
              sampleCount: 3,
              stableSignalFamilies: ['element-semantics', 'ancestor-context', 'localized-text'],
              uniqueCandidateCount: 1,
              runnerUpMargin: 1,
              quality: 'strong',
            },
            display: { authorLabel: 'Projects' },
          },
        },
        {
          id: 'target_project_workspace',
          fingerprint: {
            tagName: 'article',
            stableAttributes: { 'data-testid': 'project-workspace' },
          },
        },
      ],
      steps: [
        {
          id: 'step_projects_navigation',
          targetId: 'target_projects_navigation',
          placement: 'right',
          body: [
            {
              id: 'button_click_projects',
              type: 'button',
              text: 'Open Projects',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_project_workspace',
          targetId: 'target_project_workspace',
          placement: 'bottom',
          body: [
            {
              id: 'heading_project_workspace',
              type: 'heading',
              text: 'Project workspace is ready',
              props: {},
            },
          ],
        },
      ],
    });

    player.start();
    await player.waitUntilReady();
    projectsLink.click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Project workspace is ready',
    );
    player.stop();
  });

  it('re-resolves a replacement owner inside an open shadow root', async () => {
    document.body.innerHTML = '<div id="product-shell"></div>';
    const productShell = document.querySelector<HTMLElement>('#product-shell')!;
    const productRoot = productShell.attachShadow({ mode: 'open' });
    const original = document.createElement('button');
    original.type = 'button';
    original.dataset['lodariqId'] = 'new-project';
    original.dataset['testid'] = 'new-project-shadow';
    original.setAttribute('aria-label', 'New project');
    original.textContent = 'New project';
    productRoot.appendChild(original);
    const player = new TourPlayer({
      ...compiledDoc,
      targets: [
        {
          ...compiledDoc.targets[0]!,
          identity: {
            schemaVersion: 2,
            targetId: 'target_new_project',
            intent: { elementKind: 'control', requiredAction: 'observe-click' },
            invariants: {
              configuredAttributes: { 'data-testid': 'new-project-shadow' },
              semanticAttributes: { type: 'button' },
            },
            semantics: { tagName: 'button', role: 'button' },
            context: {},
            localizedEvidence: [{ locale: 'en', accessibleName: 'New project' }],
            captureEvidence: {
              sampleCount: 3,
              stableSignalFamilies: [
                'configured-attribute',
                'semantic-attribute',
                'element-semantics',
              ],
              uniqueCandidateCount: 1,
              runnerUpMargin: 0.8,
              quality: 'strong',
            },
            display: { authorLabel: 'New project button' },
          },
        },
      ],
      steps: [
        {
          ...compiledDoc.steps[0]!,
          body: [
            {
              id: 'button_click_target',
              type: 'button',
              text: 'Waiting in web component',
              props: { action: { type: 'clickTarget' } },
            },
          ],
        },
        {
          id: 'step_2',
          body: [
            { id: 'heading_2', type: 'heading', text: 'Shadow replacement worked', props: {} },
          ],
        },
      ],
    });

    player.start();
    await nextTask();
    const replacement = original.cloneNode(true) as HTMLButtonElement;
    original.replaceWith(replacement);
    await revalidationTask();
    replacement.click();
    await nextTask();

    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Shadow replacement worked',
    );
  });

  it('hides while a connected owner is unavailable and resumes only after fresh resolution', async () => {
    const owner = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    const player = new TourPlayer(compiledDoc);
    player.start();
    await nextTask();

    const card = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    expect(card?.hidden).toBe(false);

    owner.hidden = true;
    await revalidationTask();
    expect(card?.hidden).toBe(true);

    owner.hidden = false;
    await revalidationTask();
    expect(card?.hidden).toBe(false);
  });

  it('keeps authoring preview focus while its visible owner and surrounding page mutate', async () => {
    const owner = document.querySelector<HTMLElement>('[data-lodariq-id="new-project"]')!;
    let ownerRect = domRect({ x: 40, y: 60, width: 300, height: 160 });
    owner.getBoundingClientRect = vi.fn(() => ownerRect);
    const player = new TourPlayer(compiledDoc, {
      authoringPreviewOwnerId: 'authoring-preview-focus',
    });
    player.start();
    await player.waitUntilReady();

    const root = document.querySelector('lodariq-tour')?.shadowRoot;
    const card = root?.querySelector<HTMLElement>('[role="dialog"]');
    const ring = root?.querySelector<HTMLElement>('[data-lodariq-target-outline]');
    const heading = root?.querySelector<HTMLElement>(
      `[${LODARIQ_RENDERED_NODE_ID_ATTRIBUTE}="heading_1"]`,
    );
    if (!heading) throw new Error('Authoring preview heading missing');
    heading.setAttribute('contenteditable', 'plaintext-only');
    heading.focus();
    expect(root?.activeElement).toBe(heading);

    const unrelatedStatus = document.createElement('div');
    unrelatedStatus.textContent = 'Unrelated application status';
    document.body.appendChild(unrelatedStatus);
    await revalidationTask();

    expect(card?.hidden).toBe(false);
    expect(ring?.hidden).toBe(false);
    expect(root?.activeElement).toBe(heading);

    ownerRect = domRect({ x: 72, y: 88, width: 320, height: 172 });
    owner.dataset['renderState'] = 'updated';
    await revalidationTask();

    expect(card?.hidden).toBe(false);
    expect(root?.querySelector('[data-lodariq-target-outline]')).toBe(ring);
    expect(ring?.hidden).toBe(false);
    expect(ring?.style.left).toBe('69px');
    expect(ring?.style.top).toBe('85px');
    expect(ring?.style.width).toBe('326px');
    expect(ring?.style.height).toBe('178px');
    expect(root?.activeElement).toBe(heading);
    player.stop();
  });

  it('positions a presentation-only tour against an anonymous visual anchor', async () => {
    document.body.innerHTML = '';
    const summary = document.createElement('div');
    summary.style.backgroundColor = 'rgb(240, 248, 255)';
    document.body.appendChild(summary);
    const visualFingerprint = captureVisualFingerprint(summary);
    expect(visualFingerprint).not.toBeNull();

    const visualDocument: CompiledDocument = {
      ...compiledDoc,
      targets: [
        {
          id: 'target_summary',
          fingerprint: { tagName: 'div', stableAttributes: {} },
          identity: {
            schemaVersion: 2,
            targetId: 'target_summary',
            intent: {
              elementKind: 'container',
              requiredAction: 'anchor',
              resolutionMode: 'visual-anchor',
            },
            invariants: {},
            semantics: { tagName: 'div' },
            context: {},
            visualFingerprints: [visualFingerprint!],
            localizedEvidence: [],
            captureEvidence: {
              sampleCount: 3,
              stableSignalFamilies: [
                'visual-structure',
                'visual-appearance',
                'visual-neighborhood',
              ],
              uniqueCandidateCount: 1,
              runnerUpMargin: 1,
              quality: 'strong',
            },
            display: { authorLabel: 'Summary card' },
          },
        },
      ],
      steps: [{ ...compiledDoc.steps[0]!, targetId: 'target_summary' }],
    };
    const player = new TourPlayer(visualDocument);

    player.start();
    await player.waitUntilReady();

    const card = document
      .querySelector('lodariq-tour')
      ?.shadowRoot?.querySelector<HTMLElement>('[role="dialog"]');
    const latestPositionCall =
      computePositionMock.mock.calls[computePositionMock.mock.calls.length - 1];
    const reference = latestPositionCall?.[0] as FloatingUiDomModule.VirtualElement;
    expect(card?.hidden).toBe(false);
    expect(reference).not.toBe(summary);
    expect(reference.contextElement).toBe(summary);
    expect(reference.getBoundingClientRect()).toMatchObject({ width: 300, height: 160 });
  });

  it('waits for lifecycle text before resolving an async target', async () => {
    document.body.innerHTML = '<main></main>';
    const scrollIntoView = vi.fn();
    const button = document.createElement('button');
    button.dataset['lodariqId'] = 'new-project';
    button.setAttribute('aria-label', 'New project');
    button.textContent = 'New project';
    button.scrollIntoView = scrollIntoView;

    new TourPlayer({
      ...compiledDoc,
      steps: [{ ...compiledDoc.steps[0]!, lifecycle: { waitForText: 'Loaded', timeoutMs: 80 } }],
    }).start();
    document.querySelector('main')?.append('Loaded', button);

    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('opens a configured lifecycle panel before resolving the step target', async () => {
    document.body.innerHTML = `
      <button data-lodariq-id="open-settings" aria-label="Open settings">Settings</button>
      <button data-lodariq-id="close-settings" aria-label="Close settings" hidden>Close</button>
    `;
    const opener = document.querySelector<HTMLButtonElement>('[data-lodariq-id="open-settings"]')!;
    const target = document.querySelector<HTMLButtonElement>('[data-lodariq-id="close-settings"]')!;
    const openPanel = vi.fn(() => {
      target.hidden = false;
    });
    opener.addEventListener('click', openPanel);
    target.scrollIntoView = vi.fn();

    new TourPlayer({
      ...compiledDoc,
      targets: [
        {
          id: 'target_close_settings',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Close settings',
            stableAttributes: { 'data-lodariq-id': 'close-settings' },
          },
        },
      ],
      steps: [
        {
          id: 'step_close_settings',
          targetId: 'target_close_settings',
          body: [{ id: 'heading_settings', type: 'heading', text: 'Close settings', props: {} }],
          lifecycle: {
            openPanel: {
              tagName: 'button',
              role: 'button',
              accessibleName: 'Open settings',
              stableAttributes: { 'data-lodariq-id': 'open-settings' },
            },
            timeoutMs: 80,
          },
        },
      ],
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(openPanel).toHaveBeenCalledOnce();
    expect(target.hidden).toBe(false);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Close settings',
    );
  });

  it('selects a configured lifecycle tab before resolving the step target', async () => {
    document.body.innerHTML = `
      <button role="tab" data-lodariq-id="billing-tab" aria-label="Billing" aria-selected="false">
        Billing
      </button>
      <button data-lodariq-id="update-plan" aria-label="Update plan" hidden>Update</button>
    `;
    const tab = document.querySelector<HTMLButtonElement>('[data-lodariq-id="billing-tab"]')!;
    const target = document.querySelector<HTMLButtonElement>('[data-lodariq-id="update-plan"]')!;
    const selectTab = vi.fn(() => {
      tab.setAttribute('aria-selected', 'true');
      target.hidden = false;
    });
    tab.addEventListener('click', selectTab);
    target.scrollIntoView = vi.fn();

    new TourPlayer({
      ...compiledDoc,
      targets: [
        {
          id: 'target_update_plan',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Update plan',
            stableAttributes: { 'data-lodariq-id': 'update-plan' },
          },
        },
      ],
      steps: [
        {
          id: 'step_update_plan',
          targetId: 'target_update_plan',
          body: [{ id: 'heading_plan', type: 'heading', text: 'Update plan', props: {} }],
          lifecycle: {
            selectTab: {
              tagName: 'button',
              role: 'tab',
              accessibleName: 'Billing',
              stableAttributes: { 'data-lodariq-id': 'billing-tab' },
            },
            timeoutMs: 80,
          },
        },
      ],
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(selectTab).toHaveBeenCalledOnce();
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(target.hidden).toBe(false);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain(
      'Update plan',
    );
  });

  it('waits for fetch network idle before resolving an available target', async () => {
    document.body.innerHTML = `
      <button data-lodariq-id="load-data" aria-label="Load data">Load</button>
      <button data-lodariq-id="loaded-target" aria-label="Loaded target">Loaded</button>
    `;
    const originalFetch = window.fetch;
    let responseText = '';
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(input).toBe('/api/items');
      expect(init).toEqual({ headers: { accept: 'text/plain' } });
      return new Response('loaded');
    });
    Object.defineProperty(window, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    });
    const opener = document.querySelector<HTMLButtonElement>('[data-lodariq-id="load-data"]')!;
    const target = document.querySelector<HTMLButtonElement>('[data-lodariq-id="loaded-target"]')!;
    opener.addEventListener('click', () => {
      void fetch('/api/items', { headers: { accept: 'text/plain' } }).then(async (response) => {
        responseText = await response.text();
      });
    });
    target.scrollIntoView = vi.fn();

    try {
      new TourPlayer({
        ...compiledDoc,
        targets: [
          {
            id: 'target_loaded',
            fingerprint: {
              tagName: 'button',
              role: 'button',
              accessibleName: 'Loaded target',
              stableAttributes: { 'data-lodariq-id': 'loaded-target' },
            },
          },
        ],
        steps: [
          {
            id: 'step_loaded',
            targetId: 'target_loaded',
            body: [{ id: 'heading_loaded', type: 'heading', text: 'Loaded target', props: {} }],
            lifecycle: {
              openPanel: {
                tagName: 'button',
                role: 'button',
                accessibleName: 'Load data',
                stableAttributes: { 'data-lodariq-id': 'load-data' },
              },
              waitForNetworkIdle: true,
              timeoutMs: 1_000,
            },
          },
        ],
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(target.scrollIntoView).not.toHaveBeenCalled();

      await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalled(), { timeout: 1_000 });
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(responseText).toBe('loaded');
      expect(window.fetch).toBe(fetchMock);
    } finally {
      Object.defineProperty(window, 'fetch', {
        value: originalFetch,
        configurable: true,
        writable: true,
      });
    }
  });

  it('waits for XHR network idle before resolving an available target', async () => {
    document.body.innerHTML = `
      <button data-lodariq-id="load-xhr" aria-label="Load XHR">Load</button>
      <button data-lodariq-id="xhr-target" aria-label="XHR target">Loaded</button>
    `;
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(function mockSend(
      this: XMLHttpRequest,
    ): void {
      setTimeout(() => this.dispatchEvent(new Event('loadend')), 40);
    });
    const opener = document.querySelector<HTMLButtonElement>('[data-lodariq-id="load-xhr"]')!;
    const target = document.querySelector<HTMLButtonElement>('[data-lodariq-id="xhr-target"]')!;
    opener.addEventListener('click', () => {
      const request = new XMLHttpRequest();
      request.open('GET', '/api/items');
      request.send();
    });
    target.scrollIntoView = vi.fn();

    try {
      new TourPlayer({
        ...compiledDoc,
        targets: [
          {
            id: 'target_xhr',
            fingerprint: {
              tagName: 'button',
              role: 'button',
              accessibleName: 'XHR target',
              stableAttributes: { 'data-lodariq-id': 'xhr-target' },
            },
          },
        ],
        steps: [
          {
            id: 'step_xhr',
            targetId: 'target_xhr',
            body: [{ id: 'heading_xhr', type: 'heading', text: 'XHR target', props: {} }],
            lifecycle: {
              openPanel: {
                tagName: 'button',
                role: 'button',
                accessibleName: 'Load XHR',
                stableAttributes: { 'data-lodariq-id': 'load-xhr' },
              },
              waitForNetworkIdle: true,
              timeoutMs: 1_000,
            },
          },
        ],
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(target.scrollIntoView).not.toHaveBeenCalled();

      await vi.waitFor(() => expect(target.scrollIntoView).toHaveBeenCalled(), { timeout: 1_000 });
      expect(send).toHaveBeenCalledOnce();
    } finally {
      send.mockRestore();
    }
  });

  it('scrolls the declared lifecycle container before positioning a target', async () => {
    document.body.innerHTML = `
      <main data-lodariq-id="scroll-pane" style="overflow: auto">
        <button data-lodariq-id="new-project" aria-label="New project">New project</button>
      </main>
    `;
    const container = document.querySelector<HTMLElement>('[data-lodariq-id="scroll-pane"]')!;
    const button = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
    container.scrollIntoView = vi.fn();
    button.scrollIntoView = vi.fn();

    new TourPlayer({
      ...compiledDoc,
      targets: [
        ...compiledDoc.targets,
        {
          id: 'target_scroll_pane',
          fingerprint: {
            tagName: 'main',
            stableAttributes: { 'data-lodariq-id': 'scroll-pane' },
          },
        },
      ],
      steps: [
        {
          ...compiledDoc.steps[0]!,
          lifecycle: {
            scrollContainer: {
              tagName: 'main',
              stableAttributes: { 'data-lodariq-id': 'scroll-pane' },
            },
            scrollStrategy: 'center',
          },
        },
      ],
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    expect(button.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
  });

  it('honors top and bottom lifecycle scroll strategies', async () => {
    for (const [strategy, block] of [
      ['top', 'start'],
      ['bottom', 'end'],
    ] as const) {
      document.body.innerHTML = `
        <button data-lodariq-id="new-project" aria-label="New project">New project</button>
      `;
      const button = document.querySelector<HTMLButtonElement>('[data-lodariq-id="new-project"]')!;
      button.scrollIntoView = vi.fn();

      new TourPlayer({
        ...compiledDoc,
        steps: [{ ...compiledDoc.steps[0]!, lifecycle: { scrollStrategy: strategy } }],
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(button.scrollIntoView).toHaveBeenCalledWith({ block, inline: 'nearest' });
    }
  });

  it('nudges virtualized scroll containers while waiting for lazy targets', async () => {
    document.body.innerHTML = '<main data-lodariq-id="virtual-list" style="overflow: auto"></main>';
    const container = document.querySelector<HTMLElement>('[data-lodariq-id="virtual-list"]')!;
    const scrollIntoView = vi.fn();
    container.addEventListener(
      'scroll',
      () => {
        if (container.querySelector('[data-lodariq-id="new-project"]')) return;
        const button = document.createElement('button');
        button.dataset['lodariqId'] = 'new-project';
        button.setAttribute('aria-label', 'New project');
        button.textContent = 'New project';
        button.scrollIntoView = scrollIntoView;
        container.appendChild(button);
      },
      { once: true },
    );

    new TourPlayer({
      ...compiledDoc,
      targets: [
        ...compiledDoc.targets,
        {
          id: 'target_virtual_list',
          fingerprint: {
            tagName: 'main',
            stableAttributes: { 'data-lodariq-id': 'virtual-list' },
          },
        },
      ],
      steps: [
        {
          ...compiledDoc.steps[0]!,
          lifecycle: {
            scrollContainer: {
              tagName: 'main',
              stableAttributes: { 'data-lodariq-id': 'virtual-list' },
            },
            scrollStrategy: 'virtualized-search',
            timeoutMs: 80,
          },
        },
      ],
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 70));

    expect(container.scrollTop).toBeGreaterThan(0);
    expect(scrollIntoView).toHaveBeenCalled();
  });
});

function domRect({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
    toJSON: () => ({}),
  };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function revalidationTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 120));
}
