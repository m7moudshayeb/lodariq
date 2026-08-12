// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type LodariqDocument,
} from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  LOCAL_AUTHORING_SESSION_ID,
  mountLocalAuthoringFrame,
  type LocalAuthoringFrameServices,
} from '@lodariq/sdk-authoring';
import { LocalAuthoringFrameController } from '../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';

const HEAVY_FIXTURE_TEST_TIMEOUT_MS = 10_000;

async function loadFrame(): Promise<void> {
  vi.resetModules();
  document.body.innerHTML = '<div id="authoring"></div>';
  localStorage.clear();
  await import('../../../../apps/fixture-host/src/authoring-frame');
  await waitForEditorReady();
}

async function waitForEditorReady(): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector('[aria-label="Experience editor"]')).not.toBeNull();
    expect(document.querySelector('.canvas-editor-loading')).toBeNull();
  });
}

function documentJson(): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Editable backup"]')!;
}

function buttonWithText(label: string, root: ParentNode = document): HTMLButtonElement | null {
  return (
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes(label),
    ) ?? null
  );
}

function panelModeView(): HTMLElement | null {
  return (
    document
      .querySelector<HTMLButtonElement>('button[aria-label="Back to authoring"]')
      ?.closest<HTMLElement>('section') ?? null
  );
}

async function importTwoBlocks(): Promise<void> {
  const textarea = documentJson();
  const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]')!;
  const doc = JSON.parse(textarea.value) as { blocks: Array<Record<string, unknown>> };
  doc.blocks = [
    {
      id: 'block_a',
      type: 'tourStep',
      props: { index: 0 },
      status: 'incomplete',
      children: [
        {
          id: 'tooltip_a',
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'incomplete',
          children: [
            {
              id: 'block_a_heading',
              type: 'heading',
              content: 'Alpha',
              props: { level: 2 },
              children: [],
              status: 'ready',
            },
            {
              id: 'block_a_copy',
              type: 'paragraph',
              content: 'Alpha body',
              props: {},
              children: [],
              status: 'ready',
            },
          ],
        },
      ],
    },
    {
      id: 'block_b',
      type: 'tourStep',
      props: { index: 1 },
      status: 'incomplete',
      children: [
        {
          id: 'tooltip_b',
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'incomplete',
          children: [
            {
              id: 'block_b_heading',
              type: 'heading',
              content: 'Beta',
              props: { level: 2 },
              children: [],
              status: 'ready',
            },
          ],
        },
      ],
    },
  ];
  textarea.value = JSON.stringify(doc);
  importButton.click();
  await flushPreviewPatchQueue();
}

async function flushPreviewPatchQueue(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await waitForEditorReady();
}

function localFrameServices(): LocalAuthoringFrameServices {
  return {
    loadDocument: () => null,
    saveDocument: vi.fn(),
    exportDocument: (doc) => JSON.stringify(doc, null, 2),
    importDocument: (json) => JSON.parse(json) as LodariqDocument,
    resetDocuments: vi.fn(),
    compilePreview: async () => ({}),
    recordMetric: vi.fn(),
    getMetricsSummary: () => ({}),
    exportMetricsReport: () => JSON.stringify({ sessions: [] }),
  };
}

describe('fixture host authoring frame (PRD §16.1)', () => {
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
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
    localStorage.clear();
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it(
    'keeps top-level slash commands limited to tour steps',
    async () => {
      await loadFrame();

      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Experience composer"]',
      );
      const menu = document.querySelector<HTMLElement>('.menu');

      expect(input).toBeTruthy();
      input!.value = '/';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      await flushPreviewPatchQueue();

      expect(menu?.hidden).toBe(false);
      expect(document.querySelector<HTMLButtonElement>('[data-command="heading"]')).toBeNull();
      expect(document.querySelector<HTMLButtonElement>('[data-command="button"]')).toBeNull();
      const step = document.querySelector<HTMLButtonElement>('[data-command="step"]');
      step?.firstChild?.dispatchEvent(
        new Event('pointerdown', { bubbles: true, cancelable: true }),
      );
      await flushPreviewPatchQueue();

      const doc = JSON.parse(documentJson().value) as {
        blocks: Array<{
          type: string;
          children?: Array<{ children?: Array<{ content?: string }> }>;
        }>;
      };
      expect(doc.blocks[doc.blocks.length - 1]).toMatchObject({
        type: 'tourStep',
      });
      expect(doc.blocks[doc.blocks.length - 1]?.children?.[0]?.children?.[0]?.content).toBe(
        'Untitled step',
      );
    },
    HEAVY_FIXTURE_TEST_TIMEOUT_MS,
  );

  it('applies the host CSP nonce to local authoring frame styles', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_local_frame">';
    await loadFrame();

    expect(document.head.querySelector('style')?.nonce).toBe('nonce_local_frame');
  });

  it('loads the local authoring frame with the editor theme styles', async () => {
    await loadFrame();

    const styles = document.head.querySelector('style')?.textContent ?? '';
    expect(styles).toContain('color-scheme: dark');
    expect(styles).toContain('background: var(--lq-color-page)');
    expect(styles).toContain(
      'background: linear-gradient(180deg, var(--lq-color-chrome), #101216)',
    );
    const contextualSurfaceRule = styles.match(
      /\.menu,\s*\.inline-command-menu,\s*\.step-command-menu,\s*\.ui-select-content,\s*\.ui-popover-content \{[\s\S]*?\n {2}\}/,
    )?.[0];
    expect(contextualSurfaceRule).toContain('--lq-color-page: #ffffff');
    expect(contextualSurfaceRule).toContain('--lq-color-panel: #f7faf9');
    expect(contextualSurfaceRule).toContain('color-scheme: light');
  });

  it('keeps the mounted frame intact when pagehide enters the back-forward cache', async () => {
    await loadFrame();

    const frameRoot = document.querySelector<HTMLElement>('#authoring')!;
    const frameStyle = document.head.querySelector<HTMLStyleElement>('style')!;
    const pageHide = new Event('pagehide');
    Object.defineProperty(pageHide, 'persisted', { value: true });
    window.dispatchEvent(pageHide);

    expect(frameRoot.childElementCount).toBeGreaterThan(0);
    expect(frameStyle.isConnected).toBe(true);
  });

  it(
    'does not emit React flushSync warnings during lifecycle-driven updates',
    async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await loadFrame();

      const composer = document.querySelector<HTMLInputElement>(
        'input[aria-label="Experience composer"]',
      )!;
      composer.value = '/step';
      composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await flushPreviewPatchQueue();

      const title = document.querySelector<HTMLInputElement>(
        'input[aria-label="Experience title"]',
      )!;
      title.value = 'Lifecycle warning regression';
      title.dispatchEvent(new Event('change', { bubbles: true }));
      await flushPreviewPatchQueue();

      const errorText = consoleError.mock.calls
        .flat()
        .map((value) => String(value))
        .join('\n');
      expect(errorText).not.toContain('flushSync');
    },
    HEAVY_FIXTURE_TEST_TIMEOUT_MS,
  );

  it('keeps focus inside the authoring field after committing content edits', async () => {
    await loadFrame();

    const heading = document.querySelector<HTMLTextAreaElement>(
      '[data-block-id="block_heading_1"][data-action="edit-content"]',
    )!;
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;

    heading.focus();
    setTextareaValue?.call(heading, 'Focus stays here');
    heading.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    expect(document.activeElement).toBe(heading);
    expect(
      document.querySelector<HTMLTextAreaElement>(
        '[data-block-id="block_heading_1"][data-action="edit-content"]',
      ),
    ).toBe(heading);
    expect(documentJson().value).toContain('Focus stays here');
  });

  it('uses one storyboard workspace without duplicate inner chrome in panel mode', async () => {
    window.history.replaceState(null, '', '/authoring.html?lodariqFrame=panel');
    await loadFrame();

    expect(document.querySelector('.shell-panel')).toBeTruthy();
    expect(document.querySelector('.topbar')).toBeNull();
    expect(document.querySelector('.tour-storyboard')).toBeTruthy();
    expect(
      document.querySelector(
        '.tour-storyboard-language .ui-select-trigger[aria-label="Experience language"]',
      ),
    ).toBeTruthy();
    expect(document.querySelector('.tour-step-inspector')).toBeTruthy();
    expect(document.querySelector('.tour-sequence-rail')).toBeNull();
    expect(document.querySelector('.tour-workspace-toggle')).toBeNull();
    expect(document.querySelector('.tour-appearance-entry')).toBeNull();
    expect(document.querySelector('.document-main')).toBeNull();
    expect(document.querySelector('.block')).toBeNull();
    expect(document.querySelector('.tour-step-accordion')).toBeNull();
    expect(document.querySelector('.rich-step-editor')).toBeTruthy();
    expect(document.querySelector('.rich-step-toolbar')).toBeTruthy();
    expect(document.querySelector('[role="group"][aria-label="Step content editor"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Content');
    expect(document.body.textContent).toContain('Placement');
    expect(document.body.textContent).toContain('Popup');
    expect(document.querySelector('.tour-position-options')).toBeNull();
    expect(document.querySelector('.tour-advance-options')).toBeNull();
    expect(document.body.textContent).not.toContain('Step details');
    expect(document.body.textContent).not.toContain('Advanced settings');
    expect(document.querySelector('button[aria-label="More experience actions"]')).toBeTruthy();
    expect(buttonWithText('Release options')).not.toBeNull();

    window.history.replaceState(null, '', '/');
  });

  it('edits and formats structured step copy through one rich-text surface', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const saveDocument = vi.fn<(document: LodariqDocument) => void>();
    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument: tourFixture as LodariqDocument,
      services: { ...localFrameServices(), saveDocument },
      frameMode: 'panel',
      sessionId: 'session_rich_step_content',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });
    await flushPreviewPatchQueue();

    const editor = document.querySelector<HTMLElement>(
      '[role="group"][aria-label="Step content editor"]',
    );
    const heading = editor?.querySelector<HTMLElement>('[data-rich-block-id="block_heading_1"]');
    const alignCenter = document.querySelector<HTMLButtonElement>('[aria-label="Align center"]');
    const bold = document.querySelector<HTMLButtonElement>('[aria-label="Bold"]');
    if (!editor || !heading || !alignCenter || !bold) {
      throw new Error('rich step editor controls missing');
    }

    alignCenter.click();
    bold.click();
    heading.textContent = 'A better welcome';
    heading.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await flushPreviewPatchQueue();

    const lastSave = saveDocument.mock.calls[saveDocument.mock.calls.length - 1]?.[0];
    const serialized = JSON.stringify(lastSave, null, 2);
    expect(serialized).toContain('A better welcome');
    expect(serialized).toContain('"align": "center"');
    expect(serialized).toContain('"fontWeight": 700');
  });

  it('opens advanced step details inside the panel workspace', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const peer = { postMessage: vi.fn() } as unknown as Window;
    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      frameMode: 'panel',
      sessionId: 'session_workspace_layout',
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });
    await flushPreviewPatchQueue();

    document
      .querySelector<HTMLButtonElement>('button[aria-label="More experience actions"]')
      ?.click();
    await vi.waitFor(() => expect(buttonWithText('Review & recovery')).not.toBeNull());
    buttonWithText('Review & recovery')?.click();
    await flushPreviewPatchQueue();
    expect(document.querySelector('.panel-advanced-title')?.textContent).toContain(
      'Review & recovery',
    );
    expect(
      document.querySelector('.panel-advanced-main section[aria-label="Placement"]'),
    ).toBeNull();
    expect(document.querySelector('.panel-advanced-main .tour-position-options')).toBeNull();
    expect(document.querySelector('.panel-advanced-main > .document')).toBeNull();
    expect(document.querySelector('.panel-advanced-main > .insert-bar')).toBeNull();
    expect(document.querySelector('.panel-advanced-main > .inspector')).not.toBeNull();
    const back = buttonWithText('Back to editor');
    expect(back?.querySelector('svg')).not.toBeNull();
    expect(back?.textContent?.trim()).toBe('Back to editor');
    expect(document.querySelector('.panel-advanced-save-status')?.textContent).toContain(
      'Draft saved',
    );
    expect(peer.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'authoring.panel-layout.request' }),
      expect.anything(),
    );
  });

  it('keeps staging release gracefully unavailable in local preview', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      frameMode: 'panel',
      sessionId: 'session_release_local',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    const releaseFooter = document.querySelector<HTMLElement>('[aria-label="Release status"]');
    expect(releaseFooter?.dataset['releaseStatus']).toBe('unavailable');
    // Release actions sit beside the status chip, not inside it.
    buttonWithText('Release options')?.click();
    await vi.waitFor(() => expect(panelModeView()).not.toBeNull());
    expect(panelModeView()?.textContent).toContain('Local preview');
    expect(buttonWithText('Publish to staging', panelModeView() ?? document)).toBeNull();
  });

  it('keeps development release truth read-only after document edits', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const getReleaseState = vi
      .fn<NonNullable<LocalAuthoringFrameServices['getReleaseState']>>()
      .mockResolvedValue({
        available: false,
        environment: 'development',
        environmentId: 'env_development',
        documentId: 'doc_tour_welcome',
        expectedGeneration: 0,
        draftArtifactId: null,
        draftContentHash: null,
        activeContentHash: null,
        state: 'open_in_staging',
        findings: [],
      });
    const controller = new LocalAuthoringFrameController({
      root: document.getElementById('authoring')!,
      baseDocument: tourFixture as LodariqDocument,
      services: {
        ...localFrameServices(),
        persistDocument: vi.fn().mockResolvedValue(undefined),
        getReleaseState,
      },
      sessionId: 'session_release_development',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    controller.start();
    await vi.waitFor(() => expect(controller.getSnapshot().release.reason).toBe('open_in_staging'));
    controller.commitDocumentTitle('Changed in development');
    expect(controller.getSnapshot().release).toMatchObject({
      status: 'blocked',
      reason: 'open_in_staging',
    });
    expect(controller.getSnapshot().release.reason).not.toBe('unsaved_changes');
    controller.destroy();
  });

  it('publishes one reviewed staging artifact without leaving the compact popup', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const persistDocument = vi
      .fn<NonNullable<LocalAuthoringFrameServices['persistDocument']>>()
      .mockResolvedValue(undefined);
    const draftContentHash = `sha256-${'b'.repeat(64)}`;
    const getReleaseState = vi
      .fn<NonNullable<LocalAuthoringFrameServices['getReleaseState']>>()
      .mockResolvedValue({
        available: true,
        environment: 'staging',
        environmentId: 'env_staging',
        documentId: 'doc_tour_welcome',
        expectedGeneration: 2,
        draftArtifactId: 'artifact_reviewed_2',
        draftContentHash,
        activeContentHash: null,
        state: 'ready',
        findings: [],
      });
    const publishToStaging = vi
      .fn<NonNullable<LocalAuthoringFrameServices['publishToStaging']>>()
      .mockResolvedValue({
        ok: true,
        replayed: false,
        generation: 3,
        findings: [
          {
            code: 'compact_viewport_risk',
            severity: 'warning',
            label: 'Compact viewport may clip content',
          },
        ],
      });
    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument: tourFixture as LodariqDocument,
      services: {
        ...localFrameServices(),
        persistDocument,
        getReleaseState,
        publishToStaging,
      },
      frameMode: 'panel',
      sessionId: 'session_release_hosted',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[aria-label="Release status"]')?.dataset[
          'releaseStatus'
        ],
      ).toBe('ready'),
    );
    buttonWithText('Release options')?.click();
    await vi.waitFor(() => expect(buttonWithText('Publish to staging')).not.toBeNull());
    buttonWithText('Publish to staging')?.click();

    await vi.waitFor(() => expect(publishToStaging).toHaveBeenCalledOnce());
    expect(persistDocument).toHaveBeenCalledOnce();
    expect(getReleaseState).toHaveBeenCalledTimes(2);
    expect(publishToStaging).toHaveBeenCalledWith({
      expectedGeneration: 2,
      expectedArtifactId: 'artifact_reviewed_2',
      expectedContentHash: draftContentHash,
      idempotencyKey: expect.stringMatching(/^staging_publish_/u),
      correlationId: expect.stringMatching(/^release_/u),
    });
    await vi.waitFor(() =>
      expect(panelModeView()?.textContent).toContain('Exact staging artifact'),
    );
    expect(panelModeView()?.textContent).toContain('Current');
  });

  it('shows visual-preflight blockers without exposing a publish action', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const getReleaseState = vi
      .fn<NonNullable<LocalAuthoringFrameServices['getReleaseState']>>()
      .mockResolvedValue({
        available: true,
        environment: 'staging',
        environmentId: 'env_staging',
        documentId: 'doc_tour_welcome',
        expectedGeneration: 2,
        draftArtifactId: 'artifact_blocked_2',
        draftContentHash: `sha256-${'c'.repeat(64)}`,
        activeContentHash: null,
        state: 'ready',
        findings: [
          {
            code: 'contrast_unusable',
            severity: 'blocker',
            label: 'Unusable contrast',
          },
        ],
      });
    mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument: tourFixture as LodariqDocument,
      services: {
        ...localFrameServices(),
        persistDocument: vi.fn().mockResolvedValue(undefined),
        getReleaseState,
        publishToStaging: vi.fn().mockRejectedValue(new Error('must not publish')),
      },
      frameMode: 'panel',
      sessionId: 'session_release_blocked',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLElement>('[aria-label="Release status"]')?.dataset[
          'releaseStatus'
        ],
      ).toBe('blocked'),
    );
    buttonWithText('Release options')?.click();
    await vi.waitFor(() =>
      expect(panelModeView()?.textContent).toContain('Release needs attention'),
    );
    expect(buttonWithText('Publish to staging', panelModeView() ?? document)).toBeNull();
  });

  it('keeps placement context in one focused tool with one element action', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_compact_placement';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      frameMode: 'panel',
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    buttonWithText('Placement', document.querySelector('.storyboard-tool-dock')!)?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLElement>('section[aria-label="Placement"]')).not.toBeNull(),
    );
    const placement = document.querySelector<HTMLElement>('section[aria-label="Placement"]');
    expect(placement?.textContent).toContain('Where the popup appears');
    expect(placement?.textContent).toContain('New project');
    expect(placement?.textContent).toContain('Unverified');
    expect(placement?.textContent).not.toContain('Behavior');
    expect(placement?.querySelector('[aria-label^="Duplicate step"]')).toBeNull();
    expect(placement?.querySelector('[aria-label^="Delete step"]')).toBeNull();
    expect(
      placement?.querySelector<HTMLButtonElement>('[aria-label="Placement New project actions"]'),
    ).not.toBeNull();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_inspect_missing_compact',
          type: 'target.inspect.result',
          blockId: 'block_step_1',
          targetId: 'target_new_project',
          action: 'health',
          diagnostic: {
            state: 'missing',
            confidence: 0,
            candidateCount: 0,
          },
        },
      }),
    );
    await flushPreviewPatchQueue();

    expect(
      placement?.querySelector<HTMLButtonElement>('[aria-label="Placement New project actions"]'),
    ).not.toBeNull();
    expect(placement?.textContent).toContain('Missing');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_inspect_found_compact',
          type: 'target.inspect.result',
          blockId: 'block_step_1',
          targetId: 'target_new_project',
          action: 'health',
          diagnostic: {
            state: 'found',
            confidence: 1,
            candidateCount: 1,
          },
        },
      }),
    );
    await flushPreviewPatchQueue();

    expect(placement?.textContent).toContain('Placement');
    expect(placement?.textContent).toContain('New project');
    expect(placement?.textContent).toContain('Verified');
    expect(placement?.textContent).not.toContain('Needs check');
    expect(placement?.textContent).not.toContain('Missing');
    expect(placement?.textContent).not.toContain('Healthy');
    expect(
      placement?.querySelector<HTMLButtonElement>('[aria-label="Placement New project actions"]'),
    ).not.toBeNull();
  });

  it('offers one choose-element action for an unplaced compact step', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const unplacedDocument = structuredClone(tourFixture) as LodariqDocument;
    unplacedDocument.targets = [];
    const tooltip = unplacedDocument.blocks[0]?.children[0];
    if (!tooltip) throw new Error('Tour fixture tooltip missing');
    tooltip.props = { placement: 'bottom' };

    mountLocalAuthoringFrame({
      root,
      baseDocument: unplacedDocument,
      services: localFrameServices(),
      frameMode: 'panel',
      sessionId: 'session_compact_unplaced',
      peerWindow: { postMessage: vi.fn() } as unknown as Window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    buttonWithText('Placement', document.querySelector('.storyboard-tool-dock')!)?.click();
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLElement>('section[aria-label="Placement"]')).not.toBeNull(),
    );
    const placement = document.querySelector<HTMLElement>('section[aria-label="Placement"]');
    expect(placement?.textContent).toContain('Placement');
    expect(placement?.textContent).toContain('Not placed yet');
    expect(
      placement?.querySelector<HTMLButtonElement>('[aria-label="Choose target for step 1"]'),
    ).not.toBeNull();
  });

  it('turns typed top-level text into a titled tour step and rejects content commands', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    )!;
    const initialDoc = JSON.parse(documentJson().value) as { blocks: unknown[] };
    input.value = '/heading';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const rejectedDoc = JSON.parse(documentJson().value) as { blocks: unknown[] };
    expect(rejectedDoc.blocks).toHaveLength(initialDoc.blocks.length);
    expect(document.querySelector('#status')?.textContent).toBe('Open a step to add content.');

    input.value = 'Invite teammates';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const titledStepDoc = JSON.parse(documentJson().value) as {
      blocks: Array<{ type: string; children?: Array<{ children?: Array<{ content?: string }> }> }>;
    };
    expect(titledStepDoc.blocks[titledStepDoc.blocks.length - 1]).toMatchObject({
      type: 'tourStep',
    });
    expect(
      titledStepDoc.blocks[titledStepDoc.blocks.length - 1]?.children?.[0]?.children?.[0]?.content,
    ).toBe('Invite teammates');
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toContain('Invite teammates');
  });

  it('edits the experience title inline as document content', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const title = document.querySelector<HTMLInputElement>('input[aria-label="Experience title"]')!;
    expect(title.value).toBe('Welcome tour');

    title.value = 'Customer onboarding tour';
    title.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as { title: string };
    expect(doc.title).toBe('Customer onboarding tour');
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toContain(
      'Customer onboarding tour',
    );
    expect(document.querySelector('#status')?.textContent).toBe('Title updated');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        patch: {
          ops: [{ op: 'setDocumentTitle', title: 'Customer onboarding tour' }],
        },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it('authors a real editable tour step with text and a continue button', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    )!;
    input.value = '/step';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const renderedBlocks = [...document.querySelectorAll<HTMLElement>('.block')];
    const step = renderedBlocks[renderedBlocks.length - 1]!;
    expect(step.getAttribute('aria-label')).toBe('Step: Untitled step');
    expect(step.querySelector<HTMLInputElement>('[aria-label="Heading"]')?.value).toBe(
      'Untitled step',
    );
    expect(step.querySelector<HTMLTextAreaElement>('[aria-label="Body text"]')?.value).toBe(
      'Write supporting copy',
    );
    expect(step.querySelector<HTMLInputElement>('[aria-label="Button label"]')?.value).toBe(
      'Continue',
    );
    expect(
      step.querySelector<HTMLSelectElement>(
        'select.ui-native-select-mirror[aria-label="After click"]',
      )?.value,
    ).toBe('next');

    const heading = step.querySelector<HTMLInputElement>(
      '[data-action="edit-content"][aria-label="Heading"]',
    )!;
    heading.value = 'Invite teammates';
    heading.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        type: string;
        children: Array<{ type: string; children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    const authoredStep = doc.blocks[doc.blocks.length - 1];

    expect(authoredStep?.type).toBe('tourStep');
    expect(authoredStep?.children[0]?.type).toBe('tooltip');
    expect(authoredStep?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
    ]);
    expect(authoredStep?.children[0]?.children[0]?.content).toBe('Invite teammates');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        patch: { ops: [{ op: 'updateContent', content: 'Invite teammates' }] },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it(
    'inserts tour steps between top-level blocks without exposing content blocks',
    async () => {
      await loadFrame();
      await importTwoBlocks();

      document.querySelector<HTMLButtonElement>('[aria-label="Add step after this step"]')?.click();
      await flushPreviewPatchQueue();
      expect(
        [
          ...document.querySelectorAll<HTMLButtonElement>(
            '.inline-command-menu:not([hidden]) .inline-command',
          ),
        ].some((button) => button.textContent?.includes('Heading')),
      ).toBe(false);
      const stepCommand = [
        ...document.querySelectorAll<HTMLButtonElement>(
          '.inline-command-menu:not([hidden]) .inline-command',
        ),
      ].find((button) => button.textContent?.includes('Step'));
      stepCommand?.click();
      await flushPreviewPatchQueue();

      const doc = JSON.parse(documentJson().value) as {
        blocks: Array<{ id: string; type: string; content?: string }>;
      };
      expect(doc.blocks.map((block) => block.id)).toEqual([
        'block_a',
        expect.stringMatching(/^block_/),
        'block_b',
      ]);
      expect(doc.blocks.map((block) => block.type)).toEqual(['tourStep', 'tourStep', 'tourStep']);
    },
    HEAVY_FIXTURE_TEST_TIMEOUT_MS,
  );

  it('filters and closes inline insert menus like a document command palette', async () => {
    await loadFrame();
    await importTwoBlocks();

    document.querySelector<HTMLButtonElement>('[aria-label="Add step after this step"]')?.click();
    await flushPreviewPatchQueue();

    const search = document.querySelector<HTMLInputElement>(
      '.inline-command-menu:not([hidden]) [aria-label="Search content"]',
    );
    expect(search).toBeTruthy();
    const menu = search?.closest<HTMLElement>('.inline-command-menu');
    expect(menu?.parentElement).toBe(document.body);
    expect(menu?.getAttribute('popover')).toBe('manual');
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setInputValue?.call(search, 'button');
    search!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();

    const commandLabels = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.inline-command-menu:not([hidden]) .inline-command',
      ),
    ].map((button) => button.textContent ?? '');
    expect(commandLabels).toHaveLength(0);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushPreviewPatchQueue();
    expect(document.querySelector('.inline-command-menu:not([hidden])')).toBeNull();
  });

  it('inserts nested paragraph, button, and media placeholders inside a step', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const composer = step.querySelector<HTMLInputElement>('input[aria-label="Step composer"]')!;
    composer.value = 'Composer paragraph';
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await flushPreviewPatchQueue();
    const composerUpdatedStep = document.querySelector<HTMLElement>(
      '.block[data-block-type="tourStep"]',
    )!;
    expect(composerUpdatedStep.querySelector('[aria-label="Add title to this step"]')).toBeTruthy();
    expect(composerUpdatedStep.querySelector('[aria-label="Add text to this step"]')).toBeTruthy();
    expect(
      composerUpdatedStep.querySelector('[aria-label="Add button to this step"]'),
    ).toBeTruthy();
    expect(composerUpdatedStep.querySelector('[aria-label="Add media to this step"]')).toBeTruthy();
    const mediaButton = composerUpdatedStep.querySelector<HTMLButtonElement>(
      '[aria-label="Add media to this step"]',
    )!;
    mediaButton.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const updatedStep = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const mediaInput = updatedStep.querySelector<HTMLInputElement>(
      '[aria-label="Media placeholder"]',
    );
    expect(mediaInput?.value).toBe('Media placeholder');
    expect(updatedStep.textContent).toContain('Add media later');

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string; status?: string }> }>;
      }>;
    };
    const childTypes = doc.blocks[0]?.children[0]?.children.map((block) => block.type);
    expect(childTypes).toEqual(['heading', 'paragraph', 'button', 'paragraph', 'media']);
    expect(doc.blocks[0]?.children[0]?.children[3]).toMatchObject({
      type: 'paragraph',
      content: 'Composer paragraph',
    });
    expect(doc.blocks[0]?.children[0]?.children[4]).toMatchObject({
      type: 'media',
      content: 'Media placeholder',
      status: 'incomplete',
    });
  });

  it('renders nested slash commands as readable step command rows', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const composer = step.querySelector<HTMLInputElement>('input[aria-label="Step composer"]')!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setInputValue?.call(composer, '/');
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();

    const menu = document.querySelector<HTMLElement>('.step-command-menu:not([hidden])');
    expect(menu).toBeTruthy();
    expect(menu?.parentElement).toBe(document.body);
    const firstCommand = menu!.querySelector<HTMLButtonElement>('.command-item');
    expect(firstCommand).toBeTruthy();
    expect(firstCommand!.querySelector(':scope > .ui-button-icon')).toBeNull();
    expect(firstCommand!.querySelector('.ui-button-label > .command-icon')).toBeTruthy();
    expect(
      firstCommand!.querySelector('.ui-button-label > .command-copy strong')?.textContent,
    ).toBe('Heading');
  });

  it('opens the nested content menu from the step plus control', async () => {
    await loadFrame();

    const openMenu = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Open add content menu"]',
    );
    expect(openMenu).toBeTruthy();
    openMenu?.click();
    await flushPreviewPatchQueue();

    const menu = document.querySelector<HTMLElement>('.step-command-menu');
    expect(openMenu?.getAttribute('aria-expanded')).toBe('true');
    expect(menu?.parentElement).toBe(document.body);
    expect(menu?.getAttribute('role')).toBe('listbox');
    expect(menu?.querySelectorAll('.command-item')).toHaveLength(7);
  });

  it('inserts nested content from partial slash queries and arrow-key selection', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const composer = step.querySelector<HTMLInputElement>('input[aria-label="Step composer"]')!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    setInputValue?.call(composer, '/bu');
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    setInputValue?.call(composer, '/');
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ type: string; content?: string }> }> }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
      'button',
      'paragraph',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[4]?.content ?? '').toBe('');
  });

  it('supports keyboard selection in inline step insert menus', async () => {
    await loadFrame();

    const firstHeading = document.querySelector<HTMLElement>('.step-child-heading')!;
    firstHeading
      .querySelector<HTMLButtonElement>('[aria-label="Insert content after this"]')
      ?.click();
    await flushPreviewPatchQueue();

    const search = document.querySelector<HTMLInputElement>(
      '.inline-command-menu:not([hidden]) [aria-label="Search content"]',
    )!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setInputValue?.call(search, 'but');
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ type: string }> }> }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'button',
      'paragraph',
      'button',
    ]);
    expect(document.querySelector('.inline-command-menu:not([hidden])')).toBeNull();
  });

  it('continues and removes nested text blocks like a document editor', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();
    postMessage.mockClear();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const heading = step.querySelector<HTMLTextAreaElement>('[aria-label="Heading"]')!;
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setTextareaValue?.call(heading, 'Edited heading');
    heading.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();
    await flushPreviewPatchQueue();

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_heading_1',
        patch: {
          ops: [
            { op: 'updateContent', content: 'Edited heading' },
            expect.objectContaining({
              op: 'insertStepContent',
              stepBlockId: 'block_step_1',
              index: 1,
            }),
          ],
        },
      }),
      window.location.origin,
    );
    expect(
      postMessage.mock.calls
        .map(([message]) => message as BridgeMessage)
        .flatMap((message) =>
          message.type === 'preview.patch' ? message.patch.ops.map((op) => op.op) : [],
        ),
    ).not.toContain('replaceDocument');

    let doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'button',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[0]?.content).toBe('Edited heading');
    expect(doc.blocks[0]?.children[0]?.children[1]?.type).toBe('paragraph');
    expect(doc.blocks[0]?.children[0]?.children[1]?.content ?? '').toBe('');

    const emptyParagraph = document.querySelector<HTMLTextAreaElement>(
      '.step-child-paragraph [aria-label="Body text"]',
    )!;
    emptyParagraph.setSelectionRange(0, 0);
    emptyParagraph.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();
    await flushPreviewPatchQueue();

    doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[0]?.content).toBe('Edited heading');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Heading');

    const bodyParagraph = document.querySelector<HTMLTextAreaElement>(
      '.step-child-paragraph [aria-label="Body text"]',
    )!;
    const setBodyValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setBodyValue?.call(bodyParagraph, 'Alpha Beta');
    bodyParagraph.focus();
    bodyParagraph.setSelectionRange(5, 5);
    bodyParagraph.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();

    doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'button',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[1]).toMatchObject({
      type: 'paragraph',
      content: 'Alpha',
    });
    expect(doc.blocks[0]?.children[0]?.children[2]).toMatchObject({
      type: 'paragraph',
      content: ' Beta',
    });

    const paragraphFields = [
      ...document.querySelectorAll<HTMLTextAreaElement>(
        '.step-child-paragraph [aria-label="Body text"]',
      ),
    ];
    const firstParagraph = paragraphFields[0]!;
    const splitParagraph = paragraphFields[1]!;
    expect(document.activeElement).toBe(splitParagraph);
    expect(splitParagraph.selectionStart).toBe(0);
    expect(splitParagraph.selectionEnd).toBe(0);

    firstParagraph.focus();
    firstParagraph.setSelectionRange(firstParagraph.value.length, firstParagraph.value.length);
    firstParagraph.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();
    await flushPreviewPatchQueue();
    expect(document.activeElement).toBe(splitParagraph);
    expect(splitParagraph.selectionStart).toBe(0);
    expect(splitParagraph.selectionEnd).toBe(0);

    splitParagraph.setSelectionRange(0, 0);
    splitParagraph.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();
    await flushPreviewPatchQueue();
    expect(document.activeElement).toBe(firstParagraph);
    expect(firstParagraph.selectionStart).toBe(firstParagraph.value.length);
    expect(firstParagraph.selectionEnd).toBe(firstParagraph.value.length);

    splitParagraph.focus();
    splitParagraph.setSelectionRange(0, 0);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Body text');
    splitParagraph.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();
    await flushPreviewPatchQueue();

    doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[1]).toMatchObject({
      type: 'paragraph',
      content: 'Alpha Beta',
    });
    const mergedParagraph = document.querySelector<HTMLTextAreaElement>(
      '[data-block-id="block_paragraph_1"][data-action="edit-content"]',
    )!;
    expect(document.activeElement).toBe(mergedParagraph);
    expect(mergedParagraph.selectionStart).toBe('Alpha'.length);
    expect(mergedParagraph.selectionEnd).toBe('Alpha'.length);
    postMessage.mockRestore();
  });

  it('continues from nested button fields like a document editor', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const buttonLabel = step.querySelector<HTMLInputElement>('[aria-label="Button label"]')!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

    setInputValue?.call(buttonLabel, 'Done');
    buttonLabel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'button',
      'paragraph',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[2]).toMatchObject({
      type: 'button',
      content: 'Done',
    });
    expect(doc.blocks[0]?.children[0]?.children[3]?.type).toBe('paragraph');
    expect(doc.blocks[0]?.children[0]?.children[3]?.content ?? '').toBe('');
  });

  it('turns inline slash text inside a step line into structured content', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const heading = step.querySelector<HTMLTextAreaElement>('[aria-label="Heading"]')!;
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;

    setTextareaValue?.call(heading, 'Edited heading');
    heading.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();

    const emptyLine = document.querySelector<HTMLTextAreaElement>(
      '.step-child-paragraph [aria-label="Body text"]',
    )!;
    setTextareaValue?.call(emptyLine, '/bu');
    emptyLine.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string; status?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'heading',
      'button',
      'paragraph',
      'button',
    ]);
    expect(doc.blocks[0]?.children[0]?.children[1]).toMatchObject({
      type: 'button',
      content: 'Continue',
      status: 'incomplete',
    });
    expect(JSON.stringify(doc)).not.toContain('/bu');
  });

  it('keeps unknown inline slash text as ordinary paragraph content', async () => {
    await loadFrame();

    const paragraph = document.querySelector<HTMLTextAreaElement>(
      '.step-child-paragraph [aria-label="Body text"]',
    )!;
    const setTextareaValue = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setTextareaValue?.call(paragraph, '/not-a-command');
    paragraph.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string }> }>;
      }>;
    };
    expect(doc.blocks[0]?.children[0]?.children[1]).toMatchObject({
      type: 'paragraph',
      content: '/not-a-command',
    });
  });

  it('exposes duplicate and delete actions on nested step content', async () => {
    await loadFrame();

    const firstParagraph = document.querySelector<HTMLElement>('.step-child-paragraph')!;
    firstParagraph.querySelector<HTMLButtonElement>('[aria-label="Text move and format"]')?.click();
    await flushPreviewPatchQueue();

    const popover = document.querySelector<HTMLElement>('.step-child-action-popover');
    expect(popover?.textContent).toContain('Move up');
    expect(popover?.textContent).toContain('Format as');
    expect(popover?.textContent).not.toContain('Duplicate');
    expect(popover?.textContent).not.toContain('Delete');

    firstParagraph.querySelector<HTMLButtonElement>('[aria-label="Duplicate text"]')?.click();
    await flushPreviewPatchQueue();

    let doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ id: string; type: string; content?: string }> }>;
      }>;
    };
    let stepChildren = doc.blocks[0]?.children[0]?.children ?? [];
    expect(stepChildren.map((child) => child.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
      'button',
    ]);
    expect(stepChildren[2]?.content).toBe("Projects help organize your team's work.");

    const duplicatedParagraphs = [
      ...document.querySelectorAll<HTMLElement>('.step-child-paragraph'),
    ];
    const duplicatedParagraph = duplicatedParagraphs[1]!;
    duplicatedParagraph.querySelector<HTMLButtonElement>('[aria-label="Delete text"]')?.click();
    await flushPreviewPatchQueue();

    doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ id: string; type: string; content?: string }> }>;
      }>;
    };
    stepChildren = doc.blocks[0]?.children[0]?.children ?? [];
    expect(stepChildren.map((child) => child.type)).toEqual(['heading', 'paragraph', 'button']);
  });

  it('supports keyboard shortcuts on nested step content', async () => {
    await loadFrame();

    const paragraph = document.querySelector<HTMLElement>('.step-child-paragraph')!;
    paragraph.focus();
    paragraph.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await flushPreviewPatchQueue();

    let doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ id: string; type: string }> }> }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((child) => child.type)).toEqual([
      'heading',
      'button',
      'paragraph',
    ]);

    const movedParagraph = document.querySelector<HTMLElement>('.step-child-paragraph')!;
    movedParagraph.focus();
    movedParagraph.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'd',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await flushPreviewPatchQueue();

    doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ id: string; type: string }> }> }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((child) => child.type)).toEqual([
      'heading',
      'button',
      'paragraph',
      'paragraph',
    ]);

    const duplicatedParagraphs = [
      ...document.querySelectorAll<HTMLElement>('.step-child-paragraph'),
    ];
    const duplicatedParagraph = duplicatedParagraphs[1]!;
    duplicatedParagraph.focus();
    await flushPreviewPatchQueue();
    const focusedDuplicatedParagraph = [
      ...document.querySelectorAll<HTMLElement>('.step-child-paragraph'),
    ][1]!;
    focusedDuplicatedParagraph.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();

    doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ id: string; type: string }> }> }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((child) => child.type)).toEqual([
      'heading',
      'button',
      'paragraph',
    ]);
  });

  it('saves incomplete button actions and sends typed setAction patches', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const composer = step.querySelector<HTMLInputElement>('input[aria-label="Step composer"]')!;
    composer.value = '/button';
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const buttonBlocks = [...step.querySelectorAll<HTMLElement>('.step-child-button')];
    const buttonBlock = buttonBlocks[buttonBlocks.length - 1]!;
    const actionSelect = buttonBlock.querySelector<HTMLSelectElement>(
      'select.ui-native-select-mirror[data-action="set-action"][aria-label="After click"]',
    )!;
    const styleSelect = buttonBlock.querySelector<HTMLSelectElement>(
      'select.ui-native-select-mirror[data-action="set-button-style"][aria-label="Button style"]',
    )!;
    expect(buttonBlock.textContent).toContain('Choose next action');
    expect(actionSelect.value).toBe('');
    expect(styleSelect.value).toBe('primary');

    styleSelect.value = 'secondary';
    styleSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    actionSelect.value = 'clickTarget';
    actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{
          children: Array<{ type: string; status?: string; props: { action?: { type: string } } }>;
        }>;
      }>;
    };
    const stepChildren = doc.blocks[0]?.children[0]?.children ?? [];
    const authoredButton = stepChildren[stepChildren.length - 1];
    expect(authoredButton).toMatchObject({
      type: 'button',
      status: 'ready',
      props: { variant: 'secondary', action: { type: 'clickTarget' } },
    });
    expect(buttonBlock.textContent).toContain('Click target');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        patch: {
          ops: expect.arrayContaining([{ op: 'setAction', action: { type: 'clickTarget' } }]),
        },
      }),
      window.location.origin,
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        patch: { ops: expect.arrayContaining([{ op: 'setVariant', variant: 'secondary' }]) },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it('does not treat pasted slash text inside the slash input as document content', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    );
    const textarea = documentJson();
    const initialDoc = JSON.parse(textarea!.value) as { blocks: unknown[] };
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? '/' : '') },
    });

    input?.dispatchEvent(event);

    const doc = JSON.parse(textarea!.value) as { blocks: unknown[] };
    expect(doc.blocks).toHaveLength(initialDoc.blocks.length);
    expect(textarea?.value).not.toContain('"content": "/"');
  });

  it('keeps unknown top-level slash text as ordinary creator content', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    )!;
    const before = JSON.parse(documentJson().value) as { blocks: unknown[] };
    input.value = '/not-a-command';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const after = JSON.parse(documentJson().value) as {
      blocks: Array<{ children?: Array<{ children?: Array<{ content?: string }> }> }>;
    };
    expect(after.blocks).toHaveLength(before.blocks.length + 1);
    expect(after.blocks[after.blocks.length - 1]?.children?.[0]?.children?.[0]?.content).toBe(
      '/not-a-command',
    );
    expect(document.querySelector('#status')?.textContent).toBe('Added step');
  });

  it('keeps recognized content commands out of the top-level step composer', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    )!;
    const before = documentJson().value;
    input.value = '/button';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    expect(documentJson().value).toBe(before);
    expect(document.querySelector('#status')?.textContent).toBe('Open a step to add content.');
  });

  it('resets to a fresh fixture after inserted blocks', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    );
    const reset = document.querySelector<HTMLButtonElement>('[data-action="reset"]');
    const textarea = documentJson();

    input!.value = 'Temporary step';
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();
    expect(textarea?.value).toContain('Temporary step');

    reset?.click();
    await flushPreviewPatchQueue();

    const doc = JSON.parse(textarea!.value) as { blocks: Array<{ id: string }> };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_step_1']);
    expect(textarea?.value).not.toContain('Untitled heading');
  });

  it('sends semantic preview patches for block transactions, not keystrokes', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();
    postMessage.mockClear();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    );
    input!.value = '/';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();
    const step = document.querySelector<HTMLButtonElement>('[data-command="step"]');

    expect(postMessage).not.toHaveBeenCalled();

    step?.click();
    await flushPreviewPatchQueue();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: expect.stringMatching(/^block_/),
        patch: { ops: [expect.objectContaining({ op: 'insertBlock' })] },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it('emits one semantic preview patch when transforming a block', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();
    await importTwoBlocks();
    await flushPreviewPatchQueue();
    postMessage.mockClear();

    document
      .querySelector<HTMLButtonElement>(
        '[data-block-id="block_a_copy"] [aria-label="Text move and format"]',
      )
      ?.click();
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>(
          '[data-block-id="block_a_copy"] [aria-label="Turn content into button"]',
        ),
      ).not.toBeNull();
    });
    document
      .querySelector<HTMLButtonElement>(
        '[data-block-id="block_a_copy"] [aria-label="Turn content into button"]',
      )
      ?.click();
    expect(postMessage).not.toHaveBeenCalled();
    await flushPreviewPatchQueue();

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_a_copy',
        patch: {
          ops: [{ op: 'transformBlock', type: 'button' }],
        },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it('uses the configured session id for outbound bridge messages', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_custom_authoring';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    )!;
    input.value = '/step';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'preview.patch',
      }),
      window.location.origin,
    );

    vi.mocked(peer.postMessage).mockClear();
    document.querySelector<HTMLButtonElement>('[data-action="target-pick"]')?.click();

    const startMessage = vi.mocked(peer.postMessage).mock.calls[0]?.[0] as BridgeMessage;
    expect(startMessage).toMatchObject({
      sessionId,
      type: 'target.pick.start',
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: startMessage.documentId,
          correlationId: 'ack_custom_session',
          type: 'ack',
          ackOf: startMessage.correlationId,
        },
      }),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(peer.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'target.pick.canceled',
      }),
      window.location.origin,
    );

    window.dispatchEvent(new Event('pagehide'));
  });

  it('synchronizes direct preview text commits with canonical JSON and the dock field once', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const services = localFrameServices();
    const sessionId = 'session_inline_preview';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services,
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();
    vi.mocked(peer.postMessage).mockClear();

    const dispatchCommit = (correlationId: string): void => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: peer,
          origin: window.location.origin,
          data: {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId,
            documentId: 'doc_tour_welcome',
            correlationId,
            type: AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
            blockId: 'block_heading_1',
            content: 'Launch your first project',
          },
        }),
      );
    };

    dispatchCommit('inline_content_1');
    await flushPreviewPatchQueue();

    expect(
      document.querySelector<HTMLInputElement>(
        '[data-block-id="block_heading_1"][data-action="edit-content"]',
      )?.value,
    ).toBe('Launch your first project');
    const canonicalDocument = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ id: string; content?: string }> }> }>;
    };
    expect(canonicalDocument.blocks[0]?.children[0]?.children[0]).toMatchObject({
      id: 'block_heading_1',
      content: 'Launch your first project',
    });
    expect(services.saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            children: [
              expect.objectContaining({
                children: [
                  expect.objectContaining({
                    id: 'block_heading_1',
                    content: 'Launch your first project',
                  }),
                  expect.anything(),
                  expect.anything(),
                ],
              }),
            ],
          }),
        ],
      }),
    );

    const previewPatches = (): Array<Extract<BridgeMessage, { type: 'preview.patch' }>> =>
      vi
        .mocked(peer.postMessage)
        .mock.calls.map(([message]) => message as BridgeMessage)
        .filter(
          (message): message is Extract<BridgeMessage, { type: 'preview.patch' }> =>
            message.type === 'preview.patch',
        );
    expect(previewPatches()).toEqual([
      expect.objectContaining({
        blockId: 'block_heading_1',
        patch: {
          ops: [{ op: 'updateContent', content: 'Launch your first project' }],
        },
      }),
    ]);
    expect(document.querySelector('#status')?.textContent).toContain('Content updated in preview');

    dispatchCommit('inline_content_duplicate');
    await flushPreviewPatchQueue();
    expect(previewPatches()).toHaveLength(1);

    window.dispatchEvent(new Event('pagehide'));
  });

  it('shows a rail-selected tour step immediately through a semantic bridge request', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_selected_step_preview';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();
    await importTwoBlocks();

    vi.mocked(peer.postMessage).mockClear();
    document.querySelector<HTMLButtonElement>('[aria-label="Edit step 2: Beta"]')?.click();
    await flushPreviewPatchQueue();

    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'authoring.preview.request',
        mode: 'step',
        stepId: 'block_b',
      }),
      window.location.origin,
    );

    window.dispatchEvent(new Event('pagehide'));
  });

  it('starts target selection immediately after Add step', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_add_step_target';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();
    vi.mocked(peer.postMessage).mockClear();

    document.querySelector<HTMLButtonElement>('.tour-add-step')?.click();

    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'target.pick.start',
        blockId: expect.stringMatching(/^block_/),
      }),
      window.location.origin,
    );
    await flushPreviewPatchQueue();
    expect(document.querySelectorAll('.tour-step-row')).toHaveLength(2);

    window.dispatchEvent(new Event('pagehide'));
  });

  it('applies live-preview placement controls and opens Advanced on demand', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const services = localFrameServices();
    const sessionId = 'session_inline_controls';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services,
      frameMode: 'panel',
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();
    expect(document.querySelector('.document-main')).toBeNull();

    const dispatchControl = (
      correlationId: string,
      operation: Extract<
        BridgeMessage,
        { type: typeof AUTHORING_INLINE_CONTROL_COMMIT_TYPE }
      >['operation'],
    ): void => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: peer,
          origin: window.location.origin,
          data: {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId,
            documentId: 'doc_tour_welcome',
            correlationId,
            type: AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
            operation,
          },
        }),
      );
    };

    dispatchControl('inline_control_placement', {
      kind: 'setPlacement',
      blockId: 'block_tooltip_1',
      placement: 'top',
    });
    await flushPreviewPatchQueue();
    expect(services.saveDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            children: [
              expect.objectContaining({ props: expect.objectContaining({ placement: 'top' }) }),
            ],
          }),
        ],
      }),
    );
    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_tooltip_1',
        patch: { ops: [{ op: 'setPlacement', placement: 'top' }] },
      }),
      window.location.origin,
    );

    dispatchControl('inline_control_action', {
      kind: 'setAction',
      blockId: 'block_button_1',
      actionType: 'complete',
    });
    await flushPreviewPatchQueue();
    expect(services.saveDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({
        blocks: [
          expect.objectContaining({
            children: [
              expect.objectContaining({
                children: expect.arrayContaining([
                  expect.objectContaining({
                    id: 'block_button_1',
                    props: expect.objectContaining({ action: { type: 'complete' } }),
                  }),
                ]),
              }),
            ],
          }),
        ],
      }),
    );
    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_button_1',
        patch: { ops: [{ op: 'setAction', action: { type: 'complete' } }] },
      }),
      window.location.origin,
    );

    dispatchControl('inline_control_advanced', {
      kind: 'openAdvanced',
      stepId: 'block_step_1',
    });
    await flushPreviewPatchQueue();
    expect(document.querySelector('.panel-advanced-editor')).toBeTruthy();
    expect(document.querySelector('.document-main')).toBeTruthy();

    window.dispatchEvent(new Event('pagehide'));
  });

  it('keeps target identity and lifecycle hints when replacing a placement', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_target_replacement';
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    baseDocument.targets[0]!.lifecycle = {
      expectedRoute: '/projects',
      waitForText: 'Projects loaded',
      scrollStrategy: 'center',
    };

    mountLocalAuthoringFrame({
      root,
      baseDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: baseDocument.id,
          correlationId: 'target_pick_replacement_1',
          type: 'target.pick.result',
          blockId: 'block_step_1',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'Create project',
            stableAttributes: { 'data-lodariq-id': 'create-project' },
          },
        },
      }),
    );
    await flushPreviewPatchQueue();

    const savedDocument = JSON.parse(documentJson().value) as LodariqDocument;
    expect(savedDocument.targets).toHaveLength(1);
    expect(savedDocument.targets[0]).toMatchObject({
      id: 'target_new_project',
      lifecycle: {
        expectedRoute: '/projects',
        waitForText: 'Projects loaded',
        scrollStrategy: 'center',
      },
      fingerprint: {
        accessibleName: 'Create project',
        stableAttributes: { 'data-lodariq-id': 'create-project' },
      },
    });
    expect(savedDocument.blocks[0]?.children[0]?.props.targetId).toBe('target_new_project');
    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_step_1',
        patch: {
          ops: [
            expect.objectContaining({
              op: 'attachTarget',
              targetId: 'target_new_project',
            }),
          ],
        },
      }),
      window.location.origin,
    );

    window.dispatchEvent(new Event('pagehide'));
  });

  it('offers direct placement repair and truthful release readiness copy', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_direct_placement_repair';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    expect(document.querySelector('.review-summary-copy strong')?.textContent).toBe(
      '1 to fix before release',
    );
    expect(document.body.textContent).not.toContain('Ready to publish');
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Fix placement for step 1"]'),
    ).toBeNull();
    expect(document.querySelector('.tour-step-health')?.textContent).toContain('Unverified');
    expect(document.querySelector('.tour-health-count')?.textContent).toBe('0/1 verified');
    expect(document.querySelector('.tour-active-step-footer')?.textContent).toContain('Unverified');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_inspect_missing_1',
          type: 'target.inspect.result',
          blockId: 'block_step_1',
          targetId: 'target_new_project',
          action: 'health',
          diagnostic: {
            state: 'missing',
            confidence: 0,
            candidateCount: 0,
          },
        },
      }),
    );
    await flushPreviewPatchQueue();

    expect(document.body.textContent).toContain('Fix before release');
    const repairButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Fix placement for step 1"]',
    );
    expect(repairButton?.textContent).toContain('Fix placement');

    vi.mocked(peer.postMessage).mockClear();
    repairButton?.click();
    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'target.pick.start',
        blockId: 'block_step_1',
        fingerprint: expect.objectContaining({ accessibleName: 'New project' }),
      }),
      window.location.origin,
    );

    window.dispatchEvent(new Event('pagehide'));
  });

  it('does not let a stale inspection overwrite a newer placement pick', () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_stale_target_inspection';

    const controller = new LocalAuthoringFrameController({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    const internals = controller as unknown as {
      bridge: {
        sendWithAck: (message: BridgeMessage, options?: { timeoutMs?: number }) => Promise<void>;
      };
      handleBridgeMessage: (message: BridgeMessage) => void;
    };
    const sendWithAck = vi.spyOn(internals.bridge, 'sendWithAck').mockResolvedValue(undefined);
    const outboundMessages = (): BridgeMessage[] => sendWithAck.mock.calls.map((call) => call[0]);
    const receive = (message: BridgeMessage): void => internals.handleBridgeMessage(message);

    expect(controller.getSnapshot().documentState.targets.map((target) => target.id)).toContain(
      'target_new_project',
    );
    expect(controller.getSnapshot().documentState.blocks.map((block) => block.id)).toContain(
      'block_step_1',
    );
    controller.requestTargetInspection('block_step_1', 'target_new_project', 'view');
    expect(controller.getSnapshot().status).toBe('Highlighting placement');

    const oldInspection = outboundMessages().find(
      (message): message is Extract<BridgeMessage, { type: 'target.inspect.request' }> =>
        message.type === 'target.inspect.request',
    );
    if (!oldInspection) throw new Error('initial inspection request missing');

    controller.startTargetPick('block_step_1');

    const pickStart = [...outboundMessages()]
      .reverse()
      .find(
        (message): message is Extract<BridgeMessage, { type: 'target.pick.start' }> =>
          message.type === 'target.pick.start',
      );
    if (!pickStart) throw new Error('replacement pick request missing');

    receive({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: 'doc_tour_welcome',
      correlationId: 'legacy_stale_inspection_result',
      type: 'target.inspect.result',
      blockId: 'block_step_1',
      targetId: 'target_new_project',
      action: 'view',
      diagnostic: {
        state: 'found',
        confidence: 100,
        candidateCount: 1,
      },
    });
    expect(controller.getSnapshot().status).toBe('Select where this step appears');

    receive({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: 'doc_tour_welcome',
      correlationId: 'replacement_pick_result',
      type: 'target.pick.result',
      captureCorrelationId: pickStart.correlationId,
      blockId: 'block_step_1',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'Create replacement project',
        stableAttributes: { 'data-testid': 'replacement-project' },
      },
    });
    const newInspection = [...outboundMessages()]
      .reverse()
      .find(
        (message): message is Extract<BridgeMessage, { type: 'target.inspect.request' }> =>
          message.type === 'target.inspect.request' &&
          message.correlationId !== oldInspection.correlationId,
      );
    if (!newInspection) throw new Error('replacement inspection request missing');

    receive({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: 'doc_tour_welcome',
      correlationId: 'correlated_stale_inspection_result',
      type: 'target.inspect.result',
      requestCorrelationId: oldInspection.correlationId,
      blockId: 'block_step_1',
      targetId: 'target_new_project',
      action: 'view',
      diagnostic: {
        state: 'missing',
        confidence: 0,
        candidateCount: 0,
      },
    });
    expect(controller.getSnapshot().status).toBe('Verifying placement');

    receive({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId,
      documentId: 'doc_tour_welcome',
      correlationId: 'replacement_inspection_result',
      type: 'target.inspect.result',
      requestCorrelationId: newInspection.correlationId,
      blockId: 'block_step_1',
      targetId: 'target_new_project',
      action: 'health',
      diagnostic: {
        state: 'found',
        confidence: 100,
        candidateCount: 1,
      },
    });
    expect(controller.getSnapshot().status).toBe('Placement verified.');
  });

  it('invalidates placement readiness after the host route changes', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_route_readiness';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    const sendHostMessage = (
      message:
        | Omit<
            Extract<BridgeMessage, { type: 'page.lifecycle.update' }>,
            'protocol' | 'sessionId' | 'documentId'
          >
        | Omit<
            Extract<BridgeMessage, { type: 'target.inspect.result' }>,
            'protocol' | 'sessionId' | 'documentId'
          >,
    ): void => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: peer,
          origin: window.location.origin,
          data: {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId,
            documentId: 'doc_tour_welcome',
            ...message,
          },
        }),
      );
    };

    sendHostMessage({
      correlationId: 'page_lifecycle_projects_1',
      type: 'page.lifecycle.update',
      route: '/projects',
      scrollState: { x: 0, y: 0 },
    });
    sendHostMessage({
      correlationId: 'target_inspect_found_1',
      type: 'target.inspect.result',
      blockId: 'block_step_1',
      targetId: 'target_new_project',
      action: 'health',
      diagnostic: {
        state: 'found',
        confidence: 1,
        candidateCount: 1,
      },
    });
    await flushPreviewPatchQueue();

    expect(document.querySelector('.tour-step-health')?.textContent).toContain('Verified');
    expect(document.querySelector('.tour-health-count')?.textContent).toBe('1/1 verified');

    sendHostMessage({
      correlationId: 'page_lifecycle_projects_2',
      type: 'page.lifecycle.update',
      route: '/projects',
      scrollState: { x: 0, y: 240 },
    });
    await flushPreviewPatchQueue();

    expect(document.querySelector('.tour-step-health')?.textContent).toContain('Verified');

    sendHostMessage({
      correlationId: 'page_lifecycle_settings_1',
      type: 'page.lifecycle.update',
      route: '/settings',
      scrollState: { x: 0, y: 0 },
    });
    await flushPreviewPatchQueue();

    expect(document.querySelector('.tour-step-health')?.textContent).toContain('Unverified');
    expect(document.querySelector('.tour-health-count')?.textContent).toBe('0/1 verified');
    expect(document.querySelector('.tour-active-step-footer')?.textContent).toContain('Unverified');
    expect(document.querySelector('#status')?.textContent).toBe('Verifying placement');
    const reinspectionRequest = [...vi.mocked(peer.postMessage).mock.calls]
      .reverse()
      .map((call) => call[0] as BridgeMessage)
      .find(
        (message): message is Extract<BridgeMessage, { type: 'target.inspect.request' }> =>
          message.type === 'target.inspect.request',
      );
    if (!reinspectionRequest) throw new Error('route-change inspection request missing');

    sendHostMessage({
      correlationId: 'target_inspect_found_2',
      type: 'target.inspect.result',
      requestCorrelationId: reinspectionRequest.correlationId,
      blockId: 'block_step_1',
      targetId: 'target_new_project',
      action: 'health',
      diagnostic: {
        state: 'found',
        confidence: 1,
        candidateCount: 1,
      },
    });
    await flushPreviewPatchQueue();

    expect(document.querySelector('.tour-step-health')?.textContent).toContain('Verified');
    expect(document.querySelector('.tour-health-count')?.textContent).toBe('1/1 verified');

    window.dispatchEvent(new Event('pagehide'));
  });

  it('progressively discloses placement behavior and troubleshooting details', async () => {
    document.body.innerHTML = '<div id="authoring"></div>';
    const root = document.getElementById('authoring')!;
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const sessionId = 'session_target_inspection';

    mountLocalAuthoringFrame({
      root,
      baseDocument: tourFixture as LodariqDocument,
      services: localFrameServices(),
      sessionId,
      peerWindow: peer,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
      now: () => 1000,
    });
    await flushPreviewPatchQueue();

    const trigger = document.querySelector<HTMLButtonElement>(
      '[aria-label="Placement New project actions"]',
    )!;
    expect(document.querySelector('.target-menu')).toBeNull();
    trigger.click();
    await flushPreviewPatchQueue();
    const targetMenu = document.querySelector<HTMLElement>('.target-menu')!;
    expect(targetMenu.closest('.block')).toBeNull();
    expect(targetMenu.closest('.step-child')).toBeNull();
    expect(targetMenu.textContent).toContain('Placement');
    expect(targetMenu.textContent).toContain('More placement options');
    expect(
      [...targetMenu.querySelectorAll<HTMLButtonElement>('.target-menu-action')].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Show on page', 'Choose another', 'Use exact area']);
    expect(targetMenu.textContent).not.toContain('Matching details');

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    document.querySelector<HTMLElement>('[data-action="target-more-options"]')?.click();
    await flushPreviewPatchQueue();
    const troubleshootTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (button) => button.textContent?.trim() === 'Troubleshoot',
    );
    expect(troubleshootTab).toBeTruthy();
    troubleshootTab!.click();
    await flushPreviewPatchQueue();
    document.querySelector<HTMLButtonElement>('[data-action="target-health"]')?.click();

    const request = vi.mocked(peer.postMessage).mock.calls[0]?.[0] as BridgeMessage;
    expect(request).toMatchObject({
      sessionId,
      type: 'target.inspect.request',
      blockId: 'block_step_1',
      targetId: 'target_new_project',
      action: 'health',
      fingerprint: expect.objectContaining({ accessibleName: 'New project' }),
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: request.documentId,
          correlationId: 'ack_target_inspection',
          type: 'ack',
          ackOf: request.correlationId,
        },
      }),
    );

    window.dispatchEvent(
      new MessageEvent('message', {
        source: peer,
        origin: window.location.origin,
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId,
          documentId: request.documentId,
          correlationId: 'target_inspect_result_1',
          type: 'target.inspect.result',
          requestCorrelationId: request.correlationId,
          blockId: 'block_step_1',
          targetId: 'target_new_project',
          action: 'health',
          diagnostic: {
            state: 'found',
            confidence: 94,
            candidateCount: 1,
            resolutionMethod: 'role_and_name',
            message: 'Found by role and label',
          },
        },
      }),
    );
    await flushPreviewPatchQueue();

    expect(document.querySelector('.target-chip')?.textContent).toContain('Verified');
    expect(document.querySelector('#status')?.textContent).toBe('Placement verified.');

    document.querySelector<HTMLElement>('.target-matching-details > summary')?.click();
    await flushPreviewPatchQueue();
    expect(document.querySelector('.target-advanced')?.textContent).toContain('New project');
    expect(document.querySelector('.target-advanced')?.textContent).toContain(
      '1 candidate observed',
    );
    expect(document.querySelector('.target-advanced')?.textContent).toContain('Uses page label');

    vi.mocked(peer.postMessage).mockClear();
    const behaviorTab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (button) => button.textContent?.trim() === 'Before it appears',
    );
    expect(behaviorTab).toBeTruthy();
    behaviorTab!.click();
    await flushPreviewPatchQueue();
    const waitForText = document.querySelector<HTMLInputElement>(
      '[data-action="set-lifecycle-wait-text"]',
    )!;
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    waitForText.focus();
    setInputValue?.call(waitForText, 'Projects loaded');
    waitForText.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPreviewPatchQueue();
    expect(document.activeElement).toBe(waitForText);
    expect(
      document.querySelector<HTMLInputElement>('[data-action="set-lifecycle-wait-text"]'),
    ).toBe(waitForText);
    expect(peer.postMessage).not.toHaveBeenCalled();

    waitForText.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushPreviewPatchQueue();
    expect(document.activeElement).toBe(waitForText);
    expect(peer.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId,
        type: 'preview.patch',
        patch: {
          ops: [
            expect.objectContaining({
              op: 'setTargetLifecycle',
              targetId: 'target_new_project',
              lifecycle: expect.objectContaining({ waitForText: 'Projects loaded' }),
            }),
          ],
        },
      }),
      window.location.origin,
    );

    expect(
      vi
        .mocked(peer.postMessage)
        .mock.calls.map(([message]) => message as BridgeMessage)
        .flatMap((message) =>
          message.type === 'preview.patch' ? message.patch.ops.map((op) => op.op) : [],
        ),
    ).not.toContain('replaceDocument');

    window.dispatchEvent(new Event('pagehide'));
  });

  it('exposes labels and live status for the local authoring controls', async () => {
    await loadFrame();

    expect(document.querySelector('[aria-live="polite"]')?.id).toBe('status');
    expect(document.querySelector('section[aria-label="Add step"]')).toBeTruthy();
    expect(
      document
        .querySelector('input[aria-label="Experience composer"]')
        ?.getAttribute('aria-controls'),
    ).toBe('slash-command-menu');
    expect(
      document
        .querySelector('input[aria-label="Experience composer"]')
        ?.getAttribute('aria-haspopup'),
    ).toBe('listbox');
    expect(
      document.querySelector('[role="listbox"][aria-label="Step insert commands"]'),
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLButtonElement>('[data-command="step"]')?.textContent,
    ).toContain('Step');
    expect(document.querySelector('section[aria-label="Experience content"]')).toBeTruthy();
    expect(document.querySelector('textarea[aria-label="Editable backup"]')).toBeTruthy();
    expect(document.body.textContent).toContain('Support package');
    expect(document.body.textContent).toContain('Preview package');
    expect(document.body.textContent).toContain('Update package');
    expect([...document.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'New step',
    );
    const anchorHeader = document.querySelector<HTMLElement>('.block-header');
    const pickButton = anchorHeader?.querySelector('[data-action="target-pick"]');
    const attachedChip = anchorHeader?.querySelector('.target-chip');
    expect(Boolean(pickButton) || Boolean(attachedChip)).toBe(true);
    expect(Boolean(pickButton) && Boolean(attachedChip)).toBe(false);
    expect([...document.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Create activity report',
    );
  });

  it('does not force composer focus from document chrome clicks', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Experience composer"]',
    )!;
    expect(document.activeElement).not.toBe(input);

    document
      .querySelector<HTMLElement>('.document-hero')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.activeElement).not.toBe(input);
  });

  it('creates an activity report', async () => {
    await loadFrame();

    document.querySelector<HTMLButtonElement>('[data-action="export-metrics"]')?.click();
    await flushPreviewPatchQueue();

    const report = JSON.parse(
      document.querySelector<HTMLElement>('.metrics-output')!.textContent ?? '',
    ) as {
      sessions: Array<{ sessionId: string; summary: { documentId: string } | null }>;
    };
    expect(report.sessions).toHaveLength(1);
    expect(report.sessions[0]?.sessionId).toMatch(/^local_authoring_session:/);
    expect(report.sessions[0]?.summary?.documentId).toBe('doc_tour_welcome');
    expect(document.querySelector('#status')?.textContent).toBe('Activity report ready');
  });

  it('restores, exports recovery data, saves, and resets drafts', async () => {
    await loadFrame();

    const textarea = documentJson();
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save"]');
    const resetButton = document.querySelector<HTMLButtonElement>('[data-action="reset"]');

    expect(textarea).toBeTruthy();
    textarea!.value = textarea!.value.replace('Welcome tour', 'Imported tour');
    importButton?.click();
    await flushPreviewPatchQueue();

    expect(document.querySelector('#status')?.textContent).toBe('Backup restored');
    expect(textarea?.value).toContain('Imported tour');

    saveButton?.click();
    await flushPreviewPatchQueue();
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toContain('Imported tour');

    resetButton?.click();
    await flushPreviewPatchQueue();
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toBeNull();
    expect(textarea?.value).toContain('Welcome tour');
  });

  it('rejects draft backups from another experience or workspace', async () => {
    await loadFrame();

    const textarea = documentJson();
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const exportButton = document.querySelector<HTMLButtonElement>('[data-action="export"]');
    const originalJson = textarea.value;

    const wrongDocument = JSON.parse(originalJson) as LodariqDocument;
    wrongDocument.id = 'doc_wrong';
    textarea.value = JSON.stringify(wrongDocument);
    importButton?.click();
    await flushPreviewPatchQueue();

    expect(document.querySelector('#status')?.textContent).toBe(
      'This backup belongs to a different experience.',
    );
    exportButton?.click();
    await flushPreviewPatchQueue();
    expect(documentJson().value).toBe(originalJson);
    expect(localStorage.getItem('lodariq:doc:doc_wrong')).toBeNull();

    const wrongWorkspace = JSON.parse(originalJson) as LodariqDocument;
    wrongWorkspace.workspaceId = 'wk_wrong';
    textarea.value = JSON.stringify(wrongWorkspace);
    importButton?.click();
    await flushPreviewPatchQueue();

    expect(document.querySelector('#status')?.textContent).toBe(
      'This backup belongs to a different workspace.',
    );
    exportButton?.click();
    await flushPreviewPatchQueue();
    expect(documentJson().value).toBe(originalJson);
  });

  it('supports transform controls, property chips, and undo/redo', async () => {
    await loadFrame();
    await importTwoBlocks();

    expect(document.querySelector('.property-chip')).toBeNull();

    document
      .querySelector<HTMLButtonElement>(
        '[data-block-id="block_a_copy"] [aria-label="Text move and format"]',
      )
      ?.click();
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>(
          '[data-block-id="block_a_copy"] [aria-label="Turn content into button"]',
        ),
      ).not.toBeNull();
    });
    document
      .querySelector<HTMLButtonElement>(
        '[data-block-id="block_a_copy"] [aria-label="Turn content into button"]',
      )
      ?.click();
    await flushPreviewPatchQueue();
    expect(documentJson().value).toContain('"type": "button"');
    expect(documentJson().value).toContain('"status": "incomplete"');

    document.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    await flushPreviewPatchQueue();
    expect(documentJson().value).toContain('"type": "paragraph"');

    document.querySelector<HTMLButtonElement>('[data-action="redo"]')?.click();
    await flushPreviewPatchQueue();
    expect(documentJson().value).toContain('"type": "button"');

    document
      .querySelector<HTMLElement>('.block[data-block-id="block_a"]')
      ?.querySelector<HTMLButtonElement>('[aria-label="Step actions"]')
      ?.click();
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLButtonElement>(
          '[data-action="move-block"][data-block-id="block_a"][data-direction="down"]',
        ),
      ).not.toBeNull();
    });
    document
      .querySelector<HTMLButtonElement>(
        '[data-action="move-block"][data-block-id="block_a"][data-direction="down"]',
      )
      ?.click();
    await flushPreviewPatchQueue();
    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('supports top-level keyboard reorder without losing block focus', async () => {
    await loadFrame();
    await importTwoBlocks();

    const firstBlock = document.querySelector<HTMLElement>('.block[data-block-id="block_a"]')!;
    firstBlock.focus();
    firstBlock.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
    expect(document.activeElement).toBe(
      document.querySelector<HTMLElement>('.block[data-block-id="block_a"]'),
    );
  });

  it('supports top-level drag and drop reorder', async () => {
    await loadFrame();
    await importTwoBlocks();

    const blocks = document.querySelectorAll<HTMLElement>('.block');
    blocks[1]
      ?.querySelector<HTMLElement>('.block-grip')
      ?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    blocks[0]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('supports dragging the first block below the second block', async () => {
    await loadFrame();
    await importTwoBlocks();

    const blocks = document.querySelectorAll<HTMLElement>('.block');
    blocks[0]
      ?.querySelector<HTMLElement>('.block-grip')
      ?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    blocks[1]?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();
    expect(blocks[1]?.dataset['dropPosition']).toBe('after');
    blocks[1]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('supports dropping a dragged step on the bottom insert row', async () => {
    await loadFrame();
    await importTwoBlocks();

    const blocks = document.querySelectorAll<HTMLElement>('.block');
    const insertRows = document.querySelectorAll<HTMLElement>(
      '.document > .document-block-group > .inline-insert',
    );
    const bottomInsertRow = insertRows[insertRows.length - 1];

    blocks[0]
      ?.querySelector<HTMLElement>('.block-grip')
      ?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    bottomInsertRow?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();
    expect(bottomInsertRow?.dataset['dropPosition']).toBe('after');
    const activeBottomInsertRow = document.querySelector<HTMLElement>(
      '.document > .document-block-group:last-child > .inline-insert[data-drop-position="after"]',
    );
    activeBottomInsertRow?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('scrolls the authoring frame downward while dragging near the bottom edge', async () => {
    await loadFrame();
    await importTwoBlocks();

    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    const blocks = document.querySelectorAll<HTMLElement>('.block');
    const insertRows = document.querySelectorAll<HTMLElement>(
      '.document > .document-block-group > .inline-insert',
    );
    const bottomInsertRow = insertRows[insertRows.length - 1];
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOver, 'clientY', { value: 495 });

    blocks[0]
      ?.querySelector<HTMLElement>('.block-grip')
      ?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    bottomInsertRow?.dispatchEvent(dragOver);
    await flushPreviewPatchQueue();

    expect(scrollBy).toHaveBeenCalled();
    const calls = vi.mocked(scrollBy).mock.calls;
    expect(calls[calls.length - 1]?.[1]).toBeGreaterThan(0);
  });

  it('supports dropping a dragged step onto content inside another step', async () => {
    await loadFrame();
    await importTwoBlocks();

    const firstStep = document.querySelector<HTMLElement>('.block[data-block-id="block_a"]')!;
    const secondStepContent = document.querySelector<HTMLElement>(
      '[data-block-id="block_b"] .step-child',
    )!;

    firstStep
      .querySelector<HTMLElement>('.block-grip')
      ?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    secondStepContent.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    secondStepContent.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('supports dragging content lines inside a step', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const children = step.querySelectorAll<HTMLElement>('.step-child');
    children[0]
      ?.querySelector<HTMLElement>('.step-child-drag-handle')
      ?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    children[1]?.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();
    expect(children[1]?.dataset['dropPosition']).toBe('after');
    children[1]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ children: Array<{ children: Array<{ type: string }> }> }>;
    };
    expect(doc.blocks[0]?.children[0]?.children.map((block) => block.type)).toEqual([
      'paragraph',
      'heading',
      'button',
    ]);
  });

  it(
    'exposes direct duplicate and delete controls on top-level items',
    async () => {
      const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
      await loadFrame();
      await importTwoBlocks();
      await flushPreviewPatchQueue();
      postMessage.mockClear();

      const firstBlock = document.querySelector<HTMLElement>('.block[data-block-id="block_a"]')!;
      firstBlock.querySelector<HTMLButtonElement>('[aria-label="Step actions"]')?.click();
      await flushPreviewPatchQueue();

      await vi.waitFor(() => {
        expect(document.querySelector<HTMLElement>('.block-action-popover')).not.toBeNull();
      });
      const popover = document.querySelector<HTMLElement>('.block-action-popover');
      expect(popover?.textContent).toContain('Move up');
      expect(popover?.textContent).toContain('Move down');
      expect(popover?.textContent).not.toContain('Duplicate');
      expect(popover?.textContent).not.toContain('Delete');

      document
        .querySelector<HTMLButtonElement>('[data-block-id="block_a"] [aria-label="Duplicate step"]')
        ?.click();
      await flushPreviewPatchQueue();

      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'preview.patch',
          patch: {
            ops: [
              expect.objectContaining({
                op: 'insertBlock',
                anchorBlockId: 'block_a',
                position: 'after',
              }),
            ],
          },
        }),
        window.location.origin,
      );
      expect(
        postMessage.mock.calls
          .map(([message]) => message as BridgeMessage)
          .flatMap((message) =>
            message.type === 'preview.patch' ? message.patch.ops.map((op) => op.op) : [],
          ),
      ).not.toContain('replaceDocument');

      let doc = JSON.parse(documentJson().value) as {
        blocks: Array<{
          id: string;
          type: string;
          children?: Array<{ children?: Array<{ content?: string }> }>;
        }>;
      };
      expect(doc.blocks).toHaveLength(3);
      expect(doc.blocks[1]).toMatchObject({ type: 'tourStep' });
      expect(doc.blocks[1]?.children?.[0]?.children?.[0]?.content).toBe('Alpha');

      const duplicatedBlockId = doc.blocks[1]?.id;
      expect(duplicatedBlockId).toBeTruthy();
      postMessage.mockClear();
      document
        .querySelector<HTMLButtonElement>(
          `[data-block-id="${duplicatedBlockId}"] [aria-label="Delete step"]`,
        )
        ?.click();
      await flushPreviewPatchQueue();

      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'preview.patch',
          blockId: duplicatedBlockId,
          patch: { ops: [{ op: 'removeBlock' }] },
        }),
        window.location.origin,
      );

      doc = JSON.parse(documentJson().value) as {
        blocks: Array<{ id: string; type: string }>;
      };
      expect(doc.blocks.map((block) => block.id)).toEqual(['block_a', 'block_b']);
      postMessage.mockRestore();
    },
    HEAVY_FIXTURE_TEST_TIMEOUT_MS,
  );

  it('renders creator-facing validation badges', async () => {
    await loadFrame();

    const textarea = documentJson();
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const doc = JSON.parse(textarea!.value) as {
      blocks: Array<Record<string, unknown>>;
    };
    doc.blocks = [
      {
        id: 'step_ready',
        type: 'tourStep',
        props: { index: 0 },
        status: 'ready',
        children: [
          {
            id: 'tooltip_ready',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_ready' },
            status: 'ready',
            children: [
              {
                id: 'heading_ready',
                type: 'heading',
                content: 'Ready',
                props: { level: 2 },
                children: [],
                status: 'ready',
              },
            ],
          },
        ],
      },
      {
        id: 'step_incomplete',
        type: 'tourStep',
        props: { index: 1 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_incomplete',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_incomplete' },
            status: 'incomplete',
            children: [
              {
                id: 'button_incomplete',
                type: 'button',
                content: 'Continue',
                props: { variant: 'primary' },
                children: [],
                status: 'incomplete',
              },
            ],
          },
        ],
      },
      {
        id: 'step_invalid',
        type: 'tourStep',
        props: { index: 2 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_invalid',
            type: 'tooltip',
            props: { placement: 'bottom', targetId: 'target_invalid' },
            status: 'incomplete',
            children: [
              {
                id: 'copy_invalid',
                type: 'paragraph',
                content: 'Invalid',
                props: {},
                children: [],
                status: 'invalid',
              },
            ],
          },
        ],
      },
    ];
    textarea!.value = JSON.stringify(doc);
    importButton?.click();
    await flushPreviewPatchQueue();

    const badges = [...document.querySelectorAll('.badge')].map((badge) => badge.textContent);
    expect(badges).toEqual(['Needs review', 'Needs fix']);
  });

  it('sets a bridge-picked placement as canonical JSON and a placement chip', async () => {
    await loadFrame();

    const stepBlock = document.querySelector<HTMLElement>('[data-block-type="tourStep"]');
    expect(stepBlock?.querySelector('.block-header .target-chip')).toBeTruthy();
    expect(stepBlock?.querySelector('.block-header [data-action="target-pick"]')).toBeNull();
    expect(stepBlock?.querySelector('.block-section-target')).toBeNull();

    const message: BridgeMessage = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      documentId: 'doc_tour_welcome',
      correlationId: 'target_pick_result_1',
      type: 'target.pick.result',
      blockId: 'block_step_1',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'New project',
        label: 'New project',
        stableAttributes: { 'data-lodariq-id': 'new-project' },
      },
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: message,
        origin: window.location.origin,
        source: window,
      }),
    );
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      targets: Array<{ id: string; fingerprint: { accessibleName?: string } }>;
      blocks: Array<{ children: Array<{ props: Record<string, unknown> }> }>;
    };

    const target = doc.targets[doc.targets.length - 1];
    expect(target?.fingerprint.accessibleName).toBe('New project');
    expect(doc.blocks[0]?.children[0]?.props.targetId).toBe(target?.id);
    expect(stepBlock?.querySelector('.block-header [data-action="target-pick"]')).toBeNull();
    expect(stepBlock?.querySelector('.block-header .target-chip')).toBeTruthy();
    expect(document.querySelector('.target-chip-label')?.textContent).toBe('New project');
    expect(document.querySelector('#status')?.textContent).toBe(
      'Open the editor on a preview page to check placements',
    );
  });

  it('ignores bridge-picked targets outside the active local frame scope', async () => {
    await loadFrame();
    const before = documentJson().value;
    const beforeChipCount = document.querySelectorAll('.target-chip').length;
    const message: BridgeMessage = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: 'wrong_session',
      documentId: 'doc_tour_welcome',
      correlationId: 'target_pick_result_wrong_session',
      type: 'target.pick.result',
      blockId: 'block_step_1',
      fingerprint: {
        tagName: 'button',
        role: 'button',
        accessibleName: 'New project',
        stableAttributes: { 'data-lodariq-id': 'new-project' },
      },
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: message,
        origin: window.location.origin,
        source: window,
      }),
    );

    expect(documentJson().value).toBe(before);
    expect(document.querySelectorAll('.target-chip')).toHaveLength(beforeChipCount);
  });

  it('pastes safe text and strips unsupported HTML formatting', async () => {
    await loadFrame();

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: (type: string) =>
          type === 'text/html'
            ? '<p onclick="alert(1)">Safe <strong>copy</strong><script>alert(1)</script></p>'
            : '',
      },
    });

    document.querySelector('.shell')?.dispatchEvent(event);
    await flushPreviewPatchQueue();

    const json = documentJson().value;
    expect(json).toContain('Safe copy');
    expect(json).not.toContain('onclick');
    expect(json).not.toContain('<strong>');
    expect(json).not.toContain('<script>');
  });
});
