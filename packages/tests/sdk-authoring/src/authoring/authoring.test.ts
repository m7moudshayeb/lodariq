// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile, compileDocument, computeBrandThemeContentHash } from '@lodariq/compiler';
import {
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_CHROME_ACTION_REQUEST_TYPE,
  AUTHORING_SHELL_STEP_COMMAND_TYPE,
  AUTHORING_SAVE_STATE_UPDATE_TYPE,
  AUTHORING_THEME_PREVIEW_APPLY_TYPE,
  BridgeMessage as BridgeMessageSchema,
  BRIDGE_PROTOCOL_VERSION,
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  RENDERER_CONTRACT_VERSION,
  validate,
  type BridgeMessage,
  type CompiledDocument,
  type LodariqDocument,
} from '@lodariq/schema';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';
import {
  LOCAL_AUTHORING_SESSION_ID,
  openLocalAuthoringPanel,
  saveAndCloseActiveLocalAuthoringPanel,
} from '@lodariq/sdk-authoring/lodariq-authoring';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import { createTargetIdentityV2 } from '../../../fixtures/target-identity-v2';

const baseDocument: LodariqDocument = {
  id: 'doc_tour_welcome',
  workspaceId: 'wk_local_dev',
  type: 'tour',
  status: 'draft',
  title: 'Welcome tour',
  trigger: { type: 'manual' },
  audience: { environments: ['development', 'staging'] },
  schemaVersion: '1.0.0',
  targets: [],
  blocks: [
    {
      id: 'step_1',
      type: 'tourStep',
      props: { index: 0 },
      status: 'incomplete',
      children: [
        {
          id: 'tooltip_1',
          type: 'tooltip',
          props: { placement: 'bottom' },
          status: 'incomplete',
          children: [
            {
              id: 'heading_1',
              type: 'heading',
              content: 'Create your first project',
              props: { level: 2 },
              status: 'ready',
              children: [],
            },
            {
              id: 'button_1',
              type: 'button',
              content: 'Continue',
              props: { variant: 'primary', action: { type: 'next' } },
              status: 'ready',
              children: [],
            },
          ],
        },
      ],
    },
  ],
};

describe('local authoring panel (PRD §16.1)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lodariq-authoring-panel-open');
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a same-origin iframe panel and closes it', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_authoring">';
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const shell = host?.shadowRoot?.querySelector('[data-overlay-root]');
    const iframe = host?.querySelector('iframe');

    expect(shell?.getAttribute('aria-label')).toBe('Lodariq authoring');
    expect(host?.getAttribute('data-lodariq-shell')).toBe('overlay');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    const iframeUrl = new URL(iframe?.getAttribute('src') ?? '');
    expect(iframeUrl.pathname).toBe('/lodariq-local/authoring.html');
    expect(iframeUrl.searchParams.get('lodariqFrame')).toBe('panel');
    expect(iframe?.getAttribute('slot')).toBe('authoring-frame');
    const styles = host?.shadowRoot?.querySelector('style')?.textContent ?? '';
    expect(styles).toContain('.overlay-filmstrip');
    expect(styles).toContain('.overlay-drag-ring');
    expect(styles).toContain('height: 10px');
    expect(styles).not.toContain('inset: -8px');
    expect(styles).toContain('slot[name="authoring-frame"]');
    expect(styles).toContain('pointer-events: auto');
    expect(styles).toContain('[data-lodariq-target-picking="true"]');
    expect(styles).toContain('color-scheme: light');
    expect(host?.getAttribute('data-lodariq-panel-layout')).toBeNull();
    expect(host?.shadowRoot?.querySelector('.overlay-filmstrip')).not.toBeNull();
    expect(host?.shadowRoot?.querySelector<HTMLElement>('.overlay-filmstrip')?.hidden).toBe(false);
    expect(host?.shadowRoot?.querySelector('[data-filmstrip-add-step]')).not.toBeNull();
    // Operations and Close are document-scoped, so they live in the mode pill's menu.
    expect(host?.shadowRoot?.querySelector('[data-filmstrip-operations]')).toBeNull();
    expect(host?.shadowRoot?.querySelector('.overlay-mode-pill')).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('[data-pill-operations]')).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('[data-pill-mode="browsing"]')).not.toBeNull();
    expect(host?.shadowRoot?.querySelector('.save-state')).toBeNull();
    expect(host?.shadowRoot?.querySelector('[data-panel-save-state-label]')).toBeNull();
    expect(host?.shadowRoot?.querySelector('[data-panel-document-title]')).toBeNull();
    expect(host?.shadowRoot?.querySelector('[data-panel-action="zoom"]')).toBeNull();
    expect(host?.shadowRoot?.querySelector('[data-panel-action="layout"]')).toBeNull();
    expect(host?.shadowRoot?.querySelector('.panel-drag-handle')).toBeNull();
    expect(host?.shadowRoot?.querySelector('.panel-resize-handle')).toBeNull();
    expect(host?.shadowRoot?.querySelector('style')?.nonce).toBe('nonce_authoring');
    expect(document.documentElement.hasAttribute('data-lodariq-authoring-panel-open')).toBe(true);
    const hostLayerStyles = document.getElementById('lodariq-authoring-host-layer-style');
    expect(hostLayerStyles?.getAttribute('nonce')).toBe('nonce_authoring');
    expect(hostLayerStyles?.textContent).toContain('lodariq-tour');
    expect(hostLayerStyles?.textContent).toContain('--lodariq-tour-z-index: 2147483644');

    panel.close();

    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
    expect(document.documentElement.hasAttribute('data-lodariq-authoring-panel-open')).toBe(false);
  });

  it('keeps overlay chrome on the host without duplicating iframe actions', () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    if (!host) throw new Error('authoring panel missing');
    expect(host.shadowRoot?.querySelector('[data-pill-operations]')).not.toBeNull();
    expect(host.shadowRoot?.querySelector('[data-filmstrip-add-step]')).not.toBeNull();
    expect(host.shadowRoot?.querySelector('[data-panel-action="zoom"]')).toBeNull();
    expect(host.shadowRoot?.querySelector('[data-panel-action="layout"]')).toBeNull();
    expect(host.shadowRoot?.querySelector('[data-panel-action="preview"]')).toBeNull();
    expect(host.shadowRoot?.querySelector('[data-panel-action="release"]')).toBeNull();
    expect(host.shadowRoot?.querySelector('[data-panel-action="appearance"]')).toBeNull();
    expect(host.shadowRoot?.querySelector('[data-panel-action="save-and-exit"]')).toBeNull();

    panel.close();
  });

  it('reorders both steps and rich-text rows through the drag handlers', () => {
    const documentWithMixedOrder = structuredClone(baseDocument);
    const firstTooltip = documentWithMixedOrder.blocks[0]?.children[0];
    if (!firstTooltip) throw new Error('tooltip fixture missing');
    firstTooltip.children.splice(1, 0, {
      id: 'paragraph_1',
      type: 'paragraph',
      content: 'Supporting copy',
      props: {},
      status: 'ready',
      children: [],
    });
    documentWithMixedOrder.blocks.push(
      {
        ...structuredClone(documentWithMixedOrder.blocks[0]!),
        id: 'step_2',
        props: { index: 1 },
        children: [],
      },
      {
        ...structuredClone(documentWithMixedOrder.blocks[0]!),
        id: 'step_3',
        props: { index: 2 },
        children: [],
      },
    );
    const saveDocument = vi.fn();
    const recordMetric = vi.fn();
    const controller = new LocalAuthoringFrameController({
      root: document.body,
      baseDocument: documentWithMixedOrder,
      services: {
        loadDocument: () => structuredClone(documentWithMixedOrder),
        saveDocument,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn(),
        recordMetric,
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      peerWindow: window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });
    const dropEvent = {
      clientY: 0,
      currentTarget: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: null,
    } as unknown as Parameters<LocalAuthoringFrameController['handleBlockDrop']>[0];

    controller.startDraggingBlock('step_3');
    controller.handleBlockDragOver({
      ...dropEvent,
      currentTarget: { dataset: { blockId: 'step_1' } },
    } as unknown as Parameters<LocalAuthoringFrameController['handleBlockDragOver']>[0]);
    expect(saveDocument).not.toHaveBeenCalled();
    controller.handleBlockDrop(dropEvent, 'step_1');
    expect(controller.getSnapshot().documentState.blocks.map((block) => block.id)).toEqual([
      'step_3',
      'step_1',
      'step_2',
    ]);
    expect(saveDocument).toHaveBeenCalledOnce();
    expect(recordMetric).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'transaction.committed' }),
    );

    controller.undo();
    expect(controller.getSnapshot().documentState.blocks.map((block) => block.id)).toEqual([
      'step_1',
      'step_2',
      'step_3',
    ]);
    controller.redo();
    expect(controller.getSnapshot().documentState.blocks.map((block) => block.id)).toEqual([
      'step_3',
      'step_1',
      'step_2',
    ]);

    controller.startDraggingStepContent('step_1', 'paragraph_1');
    controller.handleStepContentDrop(dropEvent, 'step_1', 'heading_1');
    const reorderedTooltip = controller
      .getSnapshot()
      .documentState.blocks.find((block) => block.id === 'step_1')?.children[0];
    expect(reorderedTooltip?.children.map((block) => block.id)).toEqual([
      'paragraph_1',
      'heading_1',
      'button_1',
    ]);
  });

  it('auto-translates missing copy into the selected language without publishing', async () => {
    const translateDocument = vi.fn(async (request) => ({
      document: {
        ...structuredClone(request.document),
        localization: {
          defaultLocale: 'en',
          variants: [
            {
              locale: 'fr',
              fallbackLocale: 'en',
              title: 'Visite de bienvenue',
              blocks: [
                { blockId: 'heading_1', content: 'Créez votre premier projet' },
                { blockId: 'button_1', content: 'Continuer' },
              ],
            },
          ],
        },
      },
      sourceLocale: 'en',
      targetLocale: 'fr',
      translatedTitle: true,
      translatedBlockCount: 2,
      translatedCharacterCount: 52,
    }));
    const saveDocument = vi.fn();
    const controller = new LocalAuthoringFrameController({
      root: document.body,
      baseDocument,
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument,
        translateDocument,
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn(),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      peerWindow: window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    controller.setContentLocale('fr');
    await controller.translateMissingCopy();

    expect(controller.getSnapshot().translation.available).toBe(true);
    expect(translateDocument).toHaveBeenCalledWith(expect.objectContaining({
      document: expect.objectContaining({ id: baseDocument.id }),
      targetLocale: 'fr',
      mode: 'missing',
      operationId: expect.stringMatching(/^aiop_/u),
    }));
    expect(saveDocument).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().documentState.title).toBe('Visite de bienvenue');
    expect(controller.getSnapshot().translation.state).toBe('idle');
    expect(controller.getSnapshot().status).toBe('Translated 3 items to fr');
  });

  it('opens operations from the mode pill without publishing', () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    const operations = host?.shadowRoot?.querySelector<HTMLButtonElement>('[data-pill-operations]');
    if (!host || !iframe || !operations) throw new Error('authoring overlay missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    operations.click();

    expect(host.getAttribute('data-lodariq-shell')).toBe('operations');
    expect(host.shadowRoot?.querySelector<HTMLElement>('.overlay-filmstrip')?.hidden).toBe(true);
    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: AUTHORING_CHROME_ACTION_REQUEST_TYPE,
        action: 'open-operations',
      }),
      window.location.origin,
    );
    expect(peer.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'authoring.publish.staging.request' }),
      window.location.origin,
    );

    panel.close();
  });

  it('leaves the customer page interactive while the overlay editor is open', () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
      },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    if (!host) throw new Error('authoring panel missing');
    host.setAttribute('data-lodariq-shell', 'overlay');
    const pageButton = document.createElement('button');
    pageButton.textContent = 'Product';
    const click = vi.fn();
    pageButton.addEventListener('click', click);
    document.body.append(pageButton);

    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, 'button', { value: 0 });
    pageButton.dispatchEvent(pointerDown);
    pageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    /* The shell is modeless: the creator navigates the product with the editor
       still open, so an outside press must reach the page untouched. */
    expect(host.getAttribute('data-lodariq-shell')).toBe('overlay');
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    pageButton.remove();
    panel.close();
  });

  it('honors iframe operations presentation without a layout dialog', () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!host || !iframe) throw new Error('authoring panel missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'shell_operations',
          type: 'authoring.shell.presentation',
          presentation: 'operations',
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    expect(host.getAttribute('data-lodariq-shell')).toBe('operations');
    expect(host.getAttribute('data-lodariq-panel-layout')).toBeNull();

    panel.close();
  });

  it('discards local unsaved state when the overlay shell closes', () => {
    const onSave = vi
      .fn<(document: LodariqDocument) => Promise<void>>()
      .mockResolvedValue(undefined);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!host || !iframe) throw new Error('authoring panel missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    panel.close();

    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(outboundMessages(peer, 'authoring.save.request')).toHaveLength(0);
  });

  it('keeps the experience title out of step-scoped host chrome', () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
      },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    if (!host) throw new Error('authoring panel missing');
    expect(host.shadowRoot?.querySelector('[data-panel-document-title]')).toBeNull();
    expect(host.shadowRoot?.querySelector('.overlay-filmstrip')?.textContent).not.toContain(
      baseDocument.title,
    );

    panel.close();
  });

  it('adds a step from the filmstrip through a semantic shell command', () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
      },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    const addStep = host?.shadowRoot?.querySelector<HTMLButtonElement>('[data-filmstrip-add-step]');
    if (!host || !iframe || !addStep) throw new Error('authoring overlay missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    addStep.click();

    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: AUTHORING_SHELL_STEP_COMMAND_TYPE, command: 'add' }),
      window.location.origin,
    );
    panel.close();
  });

  it('collapses overlay chrome without replacing the authoring iframe', () => {
    const session = {
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      documentId: 'doc_tour_welcome',
      workspaceId: 'wk_local_dev',
      environment: 'development' as const,
    };
    const panel = openLocalAuthoringPanel(session, {
      iframeSrc: '/lodariq-local/authoring.html',
      initialDocument: structuredClone(baseDocument),
    });
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!host || !iframe) throw new Error('authoring panel missing');

    panel.minimize();

    expect(panel.isMinimized()).toBe(true);
    expect(host.hasAttribute('data-lodariq-panel-minimized')).toBe(true);
    expect(host.getAttribute('data-lodariq-shell')).toBe('collapsed');
    expect(host.shadowRoot?.querySelector<HTMLElement>('.overlay-filmstrip')?.hidden).toBe(true);

    const reopenedPanel = openLocalAuthoringPanel(session, {
      iframeSrc: '/lodariq-local/authoring.html',
    });

    expect(reopenedPanel).toBe(panel);
    expect(panel.isMinimized()).toBe(false);
    expect(host.querySelector('iframe')).toBe(iframe);
    expect(host.getAttribute('data-lodariq-shell')).toBe('overlay');

    panel.close();
  });

  it('saves and closes the active panel and no-ops when none is open', async () => {
    await expect(saveAndCloseActiveLocalAuthoringPanel()).resolves.toBeUndefined();

    openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );

    expect(document.querySelector('lodariq-authoring-panel')).not.toBeNull();
    await expect(saveAndCloseActiveLocalAuthoringPanel()).resolves.toBeUndefined();
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
  });

  it('does not replace an open draft with a different authoring session', () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );

    expect(() =>
      openLocalAuthoringPanel(
        {
          sessionId: 'local_authoring_session_2',
          documentId: 'doc_other',
          workspaceId: 'wk_local_dev',
          environment: 'development',
        },
        { iframeSrc: '/lodariq-local/authoring.html' },
      ),
    ).toThrow(
      'Another Lodariq draft is already open. Save and exit before opening a different experience.',
    );
    expect(document.querySelectorAll('lodariq-authoring-panel')).toHaveLength(1);

    panel.close();
  });

  it('opens directly into a live preview of the first placed step', async () => {
    const placedDocument = structuredClone(baseDocument);
    placedDocument.targets = [
      {
        id: 'target_1',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'New project',
          stableAttributes: { 'data-lodariq-id': 'new-project' },
        },
      },
    ];
    placedDocument.blocks[0]!.status = 'ready';
    placedDocument.blocks[0]!.children[0]!.status = 'ready';
    placedDocument.blocks[0]!.children[0]!.props.targetId = 'target_1';
    const compilePreview = vi.fn((document: LodariqDocument) =>
      compileDocument({
        document,
        theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
    );
    const playPreview = vi.fn(() => Promise.resolve());
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: placedDocument.id,
        workspaceId: placedDocument.workspaceId,
        environment: 'development',
      },
      {
        autoPreview: true,
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: placedDocument,
        preview: {
          loadDocument: () => structuredClone(placedDocument),
          compilePreview,
          playPreview,
        },
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());
    expect(compilePreview).toHaveBeenCalledWith(
      expect.objectContaining({ id: placedDocument.id }),
      undefined,
    );
    expect(playPreview).toHaveBeenCalledWith(
      expect.objectContaining({ steps: [expect.objectContaining({ id: 'step_1' })] }),
      expect.objectContaining({ stepId: 'step_1' }),
    );

    panel.close();
  });

  it('does not launch an empty popup for a fresh experience', async () => {
    const emptyDocument = { ...structuredClone(baseDocument), blocks: [] };
    const compilePreview = vi.fn();
    const playPreview = vi.fn(() => Promise.resolve());
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: emptyDocument.id,
        workspaceId: emptyDocument.workspaceId,
        environment: 'development',
      },
      {
        autoPreview: true,
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: emptyDocument,
        preview: {
          loadDocument: () => structuredClone(emptyDocument),
          compilePreview,
          playPreview,
        },
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(compilePreview).not.toHaveBeenCalled();
    expect(playPreview).not.toHaveBeenCalled();

    panel.close();
  });

  it('adopts only current persisted Brand draft revisions and refreshes the live preview', async () => {
    const placedDocument = structuredClone(baseDocument);
    placedDocument.targets = [
      {
        id: 'target_1',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'New project',
          stableAttributes: { 'data-lodariq-id': 'new-project' },
        },
      },
    ];
    placedDocument.blocks[0]!.status = 'ready';
    placedDocument.blocks[0]!.children[0]!.status = 'ready';
    placedDocument.blocks[0]!.children[0]!.props.targetId = 'target_1';
    const initialTheme = structuredClone(LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1);
    const compilePreview = vi.fn((document: LodariqDocument, theme = initialTheme) =>
      compileDocument({
        document,
        theme,
        rendererContractVersion: RENDERER_CONTRACT_VERSION,
      }),
    );
    const playPreview = vi.fn(() => Promise.resolve());
    const postMessage = vi.fn();
    const peer = { postMessage } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: placedDocument.id,
        workspaceId: placedDocument.workspaceId,
        environment: 'development',
      },
      {
        autoPreview: true,
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: placedDocument,
        initialTheme,
        preview: {
          loadDocument: () => structuredClone(placedDocument),
          compilePreview,
          playPreview,
        },
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: placedDocument.id,
          correlationId: 'brand_preview_bridge_probe',
          type: 'authoring.panel-layout.request',
          mode: 'standard',
        },
        origin: window.location.origin,
        source: peer,
      }),
    );
    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ ackOf: 'brand_preview_bridge_probe', type: 'ack' }),
      window.location.origin,
    );

    const sendTheme = async (revision: number, hashCharacter: string): Promise<void> => {
      const previewTheme = structuredClone(initialTheme);
      previewTheme.themeVersionId = `themev_draft_${revision}`;
      previewTheme.version = revision;
      previewTheme.definition.tokens.modes.light.colors.accent =
        revision % 2 === 0 ? '#0f766e' : '#7c3aed';
      previewTheme.contentHash = await computeBrandThemeContentHash(previewTheme);
      const data = {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: placedDocument.id,
        correlationId: `brand_preview_${revision}_${hashCharacter}`,
        type: AUTHORING_THEME_PREVIEW_APPLY_TYPE,
        draftRevision: revision,
        previewTheme,
      } as const;
      expect(validate(BridgeMessageSchema, data)).toMatchObject({ valid: true });
      expect(new TextEncoder().encode(JSON.stringify(data)).byteLength).toBeLessThan(64 * 1024);
      window.dispatchEvent(
        new MessageEvent('message', {
          data,
          origin: window.location.origin,
          source: peer,
        }),
      );
    };

    const refreshDurations: number[] = [];
    for (let revision = 2; revision <= 11; revision += 1) {
      const startedAt = performance.now();
      await sendTheme(revision, (revision % 10).toString());
      if (revision === 2) {
        await vi.waitFor(() =>
          expect(postMessage.mock.calls.map((call) => call[0])).toContainEqual(
            expect.objectContaining({ ackOf: 'brand_preview_2_2', type: 'ack' }),
          ),
        );
      }
      await vi.waitFor(() => expect(playPreview).toHaveBeenCalledTimes(revision));
      refreshDurations.push(performance.now() - startedAt);
    }
    const p95Index = Math.ceil(refreshDurations.length * 0.95) - 1;
    const p95 = [...refreshDurations].sort((left, right) => left - right)[p95Index] ?? Infinity;
    expect(p95).toBeLessThan(250);
    expect(compilePreview.mock.calls[compilePreview.mock.calls.length - 1]?.[1]).toMatchObject({
      themeVersionId: 'themev_draft_11',
      version: 11,
    });

    await sendTheme(4, 'd');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(playPreview).toHaveBeenCalledTimes(11);

    panel.close();
  });

  it('keeps rendered tooltip content output-only while authoring stays in the iframe', async () => {
    document.body.innerHTML = `
      <button data-lodariq-id="new-project" aria-label="New project">New project</button>
    `;
    const customerTarget = document.querySelector<HTMLButtonElement>(
      '[data-lodariq-id="new-project"]',
    );
    if (!customerTarget) throw new Error('customer target missing');
    customerTarget.getBoundingClientRect = () =>
      ({
        x: 24,
        y: 48,
        left: 24,
        top: 48,
        right: 264,
        bottom: 96,
        width: 240,
        height: 48,
        toJSON: () => ({}),
      }) as DOMRect;

    const placedDocument = structuredClone(baseDocument);
    placedDocument.targets = [
      {
        id: 'target_1',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'New project',
          stableAttributes: { 'data-lodariq-id': 'new-project' },
        },
      },
    ];
    placedDocument.blocks[0]!.status = 'ready';
    const tooltip = placedDocument.blocks[0]!.children[0]!;
    tooltip.status = 'ready';
    tooltip.props.targetId = 'target_1';

    const peer = { postMessage: vi.fn() } as unknown as Window;
    let player: TourPlayer | null = null;
    const playPreview = vi.fn(async (compiled: CompiledDocument): Promise<void> => {
      player?.stop();
      player = new TourPlayer(compiled, {
        authoringPreviewOwnerId: LOCAL_AUTHORING_SESSION_ID,
      });
      player.start();
      await player.waitUntilReady();
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: placedDocument.id,
        workspaceId: placedDocument.workspaceId,
        environment: 'development',
      },
      {
        autoPreview: true,
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: placedDocument,
        preview: {
          loadDocument: () => structuredClone(placedDocument),
          compilePreview: (document) =>
            compileDocument({
              document,
              theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
              rendererContractVersion: RENDERER_CONTRACT_VERSION,
            }),
          playPreview,
          stopPreview: () => player?.stop(),
        },
      },
    );

    const authoringHost = document.querySelector('lodariq-authoring-panel');
    const iframe = authoringHost?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());
    const tourRoot = document.querySelector('lodariq-tour')?.shadowRoot;
    const heading = tourRoot?.querySelector<HTMLElement>('[data-lodariq-node-id="heading_1"]');
    const action = tourRoot?.querySelector<HTMLElement>('[data-lodariq-node-id="button_1"]');
    if (!heading || !action) throw new Error('preview output missing');

    expect(heading.hasAttribute('contenteditable')).toBe(false);
    expect(action.hasAttribute('contenteditable')).toBe(false);
    expect(tourRoot?.querySelector('[data-lodariq-authoring-context-toolbar="true"]')).toBeNull();
    expect(tourRoot?.querySelector('[data-lodariq-authoring-inline-style="true"]')).toBeNull();

    heading.textContent = 'This DOM mutation is not an authoring commit';
    heading.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    heading.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await Promise.resolve();
    expect(outboundMessages(peer, AUTHORING_INLINE_CONTENT_COMMIT_TYPE)).toHaveLength(0);

    panel.close();
    expect(document.querySelector('lodariq-tour')).toBeNull();
  });
  it('debounces semantic document autosaves and persists the latest state', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn<(document: LodariqDocument) => Promise<void>>(() => Promise.resolve());
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchPreviewPatch(peer, 'autosave_title', 'step_1', [
      { op: 'setDocumentTitle', title: 'Onboarding tour' },
    ]);
    dispatchPreviewPatch(peer, 'autosave_heading', 'heading_1', [
      { op: 'updateContent', content: 'Create a workspace' },
    ]);

    await vi.advanceTimersByTimeAsync(649);
    expect(onSave).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledOnce();
    const savedDocument = onSave.mock.calls[0]?.[0];
    expect(savedDocument).toMatchObject({
      id: 'doc_tour_welcome',
      title: 'Onboarding tour',
    });
    expect(savedDocument?.blocks[0]?.children[0]?.children[0]?.content).toBe('Create a workspace');
    expectLastSaveStateUpdate(peer, 'saved', 'Draft saved');

    panel.close();
  });

  it('serializes autosaves without dropping a newer semantic document', async () => {
    vi.useFakeTimers();
    let resolveFirstSave: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const onSave = vi
      .fn<(document: LodariqDocument) => Promise<void>>()
      .mockImplementationOnce(() => firstSave)
      .mockResolvedValue(undefined);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchPreviewPatch(peer, 'serialize_first', 'step_1', [
      { op: 'setDocumentTitle', title: 'First revision' },
    ]);
    await vi.advanceTimersByTimeAsync(650);
    expect(onSave).toHaveBeenCalledOnce();

    dispatchPreviewPatch(peer, 'serialize_second', 'step_1', [
      { op: 'setDocumentTitle', title: 'Second revision' },
    ]);
    await vi.advanceTimersByTimeAsync(650);
    expect(onSave).toHaveBeenCalledOnce();

    resolveFirstSave?.();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls.map(([document]) => document.title)).toEqual([
      'First revision',
      'Second revision',
    ]);

    panel.close();
  });

  it('surfaces an autosave error and retries the same semantic document', async () => {
    vi.useFakeTimers();
    const saveError = new Error('draft unavailable');
    const errors: unknown[] = [];
    const onSaveError = (event: Event): void => {
      errors.push((event as CustomEvent<{ error: unknown }>).detail.error);
    };
    window.addEventListener('lodariq:authoring-save-error', onSaveError);
    const onSave = vi
      .fn<(document: LodariqDocument) => Promise<void>>()
      .mockRejectedValueOnce(saveError)
      .mockResolvedValue(undefined);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchPreviewPatch(peer, 'retry_title', 'step_1', [
      { op: 'setDocumentTitle', title: 'Retry this revision' },
    ]);
    await vi.advanceTimersByTimeAsync(650);

    expect(onSave).toHaveBeenCalledOnce();
    expect(errors).toEqual([saveError]);
    expectLastSaveStateUpdate(peer, 'error', 'Save failed · retrying');

    await vi.advanceTimersByTimeAsync(1_200);
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]?.[0].title).toBe('Retry this revision');
    expectLastSaveStateUpdate(peer, 'saved', 'Draft saved');

    panel.close();
    window.removeEventListener('lodariq:authoring-save-error', onSaveError);
  });

  it('waits for the iframe save result and the latest serialized save before exiting', async () => {
    vi.useFakeTimers();
    let resolveFirstSave: (() => void) | undefined;
    let resolveLatestSave: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const latestSave = new Promise<void>((resolve) => {
      resolveLatestSave = resolve;
    });
    const onSave = vi
      .fn<(document: LodariqDocument) => Promise<void>>()
      .mockImplementationOnce(() => firstSave)
      .mockImplementationOnce(() => latestSave);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchPreviewPatch(peer, 'exit_autosave', 'step_1', [
      { op: 'setDocumentTitle', title: 'Autosave revision' },
    ]);
    await vi.advanceTimersByTimeAsync(650);
    expect(onSave).toHaveBeenCalledOnce();

    let didClose = false;
    const closePromise = panel.saveAndClose().then(() => {
      didClose = true;
    });
    const saveRequest = outboundMessages(peer, 'authoring.save.request')[0];
    if (!saveRequest) throw new Error('save request missing');

    const latestDocument = structuredClone(baseDocument);
    latestDocument.title = 'Iframe latest revision';
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'exit_save_result',
          type: 'authoring.save.result',
          requestCorrelationId: saveRequest.correlationId,
          document: latestDocument,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    expect(didClose).toBe(false);
    expect(document.querySelector('lodariq-authoring-panel')).not.toBeNull();
    resolveFirstSave?.();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0].title).toBe('Iframe latest revision');
    expect(document.querySelector('lodariq-authoring-panel')).not.toBeNull();

    resolveLatestSave?.();
    await closePromise;
    expect(didClose).toBe(true);
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
  });

  it('persists a late iframe snapshot after the fallback save before closing once', async () => {
    vi.useFakeTimers();
    let resolveFallbackSave: (() => void) | undefined;
    let resolveIframeSave: (() => void) | undefined;
    const fallbackSave = new Promise<void>((resolve) => {
      resolveFallbackSave = resolve;
    });
    const iframeSave = new Promise<void>((resolve) => {
      resolveIframeSave = resolve;
    });
    const onSave = vi
      .fn<(document: LodariqDocument) => Promise<void>>()
      .mockImplementationOnce(() => fallbackSave)
      .mockImplementationOnce(() => iframeSave);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!host || !iframe) throw new Error('authoring panel missing');
    const removeSpy = vi.spyOn(host, 'remove');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    let didClose = false;
    const closePromise = panel.saveAndClose().then(() => {
      didClose = true;
    });
    const saveRequest = outboundMessages(peer, 'authoring.save.request')[0];
    if (!saveRequest) throw new Error('save request missing');

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].title).toBe('Welcome tour');
    expect(didClose).toBe(false);

    const lateIframeDocument = structuredClone(baseDocument);
    lateIframeDocument.title = 'Late iframe revision';
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'late_iframe_save_result',
          type: 'authoring.save.result',
          requestCorrelationId: saveRequest.correlationId,
          document: lateIframeDocument,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    resolveFallbackSave?.();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]?.[0].title).toBe('Late iframe revision');
    expectLastSaveStateUpdate(peer, 'saving', 'Saving draft…');
    expect(didClose).toBe(false);
    expect(removeSpy).not.toHaveBeenCalled();

    resolveIframeSave?.();
    await closePromise;
    expect(didClose).toBe(true);
    expect(removeSpy).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('keeps Save & exit pending through a failed save and closes after its retry succeeds', async () => {
    vi.useFakeTimers();
    const onSave = vi
      .fn<(document: LodariqDocument) => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary draft failure'))
      .mockResolvedValue(undefined);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        onSave,
      },
    );

    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!host || !iframe) throw new Error('authoring panel missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    let didClose = false;
    const closePromise = panel.saveAndClose().then(() => {
      didClose = true;
    });
    const saveRequest = outboundMessages(peer, 'authoring.save.request')[0];
    if (!saveRequest) throw new Error('save request missing');

    const latestDocument = structuredClone(baseDocument);
    latestDocument.title = 'Retry before exit';
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'retry_exit_save_result',
          type: 'authoring.save.result',
          requestCorrelationId: saveRequest.correlationId,
          document: latestDocument,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]?.[0].title).toBe('Retry before exit');
    expect(didClose).toBe(false);
    expect(document.querySelector('lodariq-authoring-panel')).not.toBeNull();
    expectLastSaveStateUpdate(peer, 'error', 'Save failed · retrying');

    await vi.advanceTimersByTimeAsync(1_199);
    expect(onSave).toHaveBeenCalledOnce();
    expect(didClose).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await closePromise;
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1]?.[0].title).toBe('Retry before exit');
    expect(didClose).toBe(true);
    expect(document.querySelector('lodariq-authoring-panel')).toBeNull();
  });

  it('uses the iframe origin for bridge messages', () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: 'https://editor.lodariq.io/authoring.html' },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_pick_start_1',
          type: 'target.pick.start',
          blockId: 'block_1',
        },
        origin: 'https://editor.lodariq.io',
        source: peer,
      }),
    );

    expect(peer.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ack', ackOf: 'target_pick_start_1' }),
      'https://editor.lodariq.io',
    );

    panel.close();
  });

  it('samples the host application state for each target capture and merges exact variants', async () => {
    const main = document.createElement('main');
    const surface = document.createElement('section');
    surface.dataset['testid'] = 'stateful-summary';
    surface.innerHTML = '<h2>Workspace summary</h2><p>Three projects need review.</p>';
    main.appendChild(surface);
    document.body.appendChild(main);
    let surfaceWidth = 360;
    main.getBoundingClientRect = () =>
      ({
        x: 80,
        y: 60,
        left: 80,
        top: 60,
        right: 1_180,
        bottom: 760,
        width: 1_100,
        height: 700,
        toJSON: () => ({}),
      }) as DOMRect;
    surface.getBoundingClientRect = () =>
      ({
        x: 120,
        y: 120,
        left: 120,
        top: 120,
        right: 120 + surfaceWidth,
        bottom: 300,
        width: surfaceWidth,
        height: 180,
        toJSON: () => ({}),
      }) as DOMRect;

    let currentStateId = 'workspace.collapsed';
    const getTargetStateId = vi.fn(() => {
      if (currentStateId === 'throw') throw new Error('Customer state unavailable');
      return currentStateId;
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        getTargetStateId,
      },
    );
    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    const requestPick = async (
      correlationId: string,
      previous?: Extract<BridgeMessage, { type: 'target.pick.result' }>,
    ): Promise<Extract<BridgeMessage, { type: 'target.pick.result' }>> => {
      const previousResultCount = outboundMessages(peer, 'target.pick.result').length;
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            protocol: BRIDGE_PROTOCOL_VERSION,
            sessionId: LOCAL_AUTHORING_SESSION_ID,
            documentId: 'doc_tour_welcome',
            correlationId,
            type: 'target.pick.start',
            blockId: 'step_1',
            requiredAction: 'anchor',
            ...(previous?.fingerprint ? { fingerprint: previous.fingerprint } : {}),
            ...(previous?.identity ? { identity: previous.identity } : {}),
          },
          origin: window.location.origin,
          source: peer,
        }),
      );
      await vi.waitFor(() =>
        expect(document.documentElement.getAttribute('data-lodariq-target-picker')).toBe('active'),
      );
      surface.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await vi.waitFor(() =>
        expect(outboundMessages(peer, 'target.pick.result')).toHaveLength(previousResultCount + 1),
      );
      const result = outboundMessages(peer, 'target.pick.result')[previousResultCount]!;
      ackOutboundMessage(peer, result);
      return result;
    };

    const collapsed = await requestPick('target_pick_collapsed');
    expect(collapsed.identity?.visualTopologies?.map((variant) => variant.stateId)).toEqual([
      'workspace.collapsed',
    ]);

    currentStateId = 'workspace.expanded';
    surfaceWidth = 760;
    const expanded = await requestPick('target_pick_expanded', collapsed);
    expect(new Set(expanded.identity?.visualTopologies?.map((variant) => variant.stateId))).toEqual(
      new Set(['workspace.collapsed', 'workspace.expanded']),
    );
    expect(expanded.identity?.context.stateId).toBeUndefined();
    expect(getTargetStateId).toHaveBeenCalledTimes(3);

    currentStateId = 'https://customer.example/private-state';
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_pick_invalid_state',
          type: 'target.pick.start',
          blockId: 'step_1',
          requiredAction: 'anchor',
          fingerprint: expanded.fingerprint,
          identity: expanded.identity,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );
    await vi.waitFor(() => expect(outboundMessages(peer, 'target.pick.canceled')).toHaveLength(1));
    expect(outboundMessages(peer, 'target.pick.result')).toHaveLength(2);
    expect(document.documentElement.hasAttribute('data-lodariq-target-picker')).toBe(false);

    currentStateId = 'throw';
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_pick_throwing_state',
          type: 'target.pick.start',
          blockId: 'step_1',
          requiredAction: 'anchor',
          fingerprint: expanded.fingerprint,
          identity: expanded.identity,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );
    await vi.waitFor(() => expect(outboundMessages(peer, 'target.pick.canceled')).toHaveLength(2));
    expect(outboundMessages(peer, 'target.pick.result')).toHaveLength(2);
    expect(getTargetStateId).toHaveBeenCalledTimes(5);

    panel.close();
  });

  it('restores overlay presentation after target selection is canceled', async () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
      },
    );
    const host = document.querySelector<HTMLElement>('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!host || !iframe) throw new Error('authoring panel missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_pick_geometry_start',
          type: 'target.pick.start',
          blockId: 'step_1',
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    expect(host.hasAttribute('data-lodariq-target-picking')).toBe(true);
    expect(host.getAttribute('data-lodariq-shell')).toBe('picking');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_pick_geometry_cancel',
          type: 'target.pick.canceled',
          blockId: 'step_1',
        },
        origin: window.location.origin,
        source: peer,
      }),
    );
    await new Promise((resolve) => window.setTimeout(resolve, 20));

    expect(host.hasAttribute('data-lodariq-target-picking')).toBe(false);
    expect(host.getAttribute('data-lodariq-shell')).not.toBe('picking');

    panel.close();
  });

  it('removes its owned preview while target picking and restores it after cancellation', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    let player: TourPlayer | null = null;
    const stopPreview = vi.fn((ownerId: string) => {
      expect(ownerId).toMatch(/^authoring_preview_owner_/);
      player?.stop();
      player = null;
    });
    const playPreview = vi.fn(
      async (
        compiled: CompiledDocument,
        previewOptions?: { ownerId: string; stepId?: string },
      ): Promise<void> => {
        player?.stop();
        player = new TourPlayer(compiled, {
          ...(previewOptions?.ownerId ? { authoringPreviewOwnerId: previewOptions.ownerId } : {}),
          ...(previewOptions?.stepId ? { initialStepId: previewOptions.stepId } : {}),
        });
        player.start();
        await player.waitUntilReady();
      },
    );
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: baseDocument.id,
        workspaceId: baseDocument.workspaceId,
        environment: 'development',
      },
      {
        autoPreview: true,
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: structuredClone(baseDocument),
        preview: {
          loadDocument: () => structuredClone(baseDocument),
          compilePreview: (document) =>
            compileDocument({
              document,
              theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
              rendererContractVersion: RENDERER_CONTRACT_VERSION,
            }),
          playPreview,
          stopPreview,
        },
      },
    );
    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());
    expect(document.querySelector('lodariq-tour')).not.toBeNull();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: baseDocument.id,
          correlationId: 'target_pick_preview_suspend',
          type: 'target.pick.start',
          blockId: 'step_1',
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    expect(stopPreview).toHaveBeenCalledOnce();
    expect(document.querySelector('lodariq-tour')).toBeNull();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: baseDocument.id,
          correlationId: 'target_pick_preview_cancel',
          type: 'target.pick.canceled',
          blockId: 'step_1',
        },
        origin: window.location.origin,
        source: peer,
      }),
    );
    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledTimes(2));
    expect(document.querySelector('lodariq-tour')).not.toBeNull();

    panel.close();
  });

  it('emits page lifecycle updates from the host bridge', async () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));

    const initial = await waitForOutboundMessage(peer, 'page.lifecycle.update');
    expect(initial).toMatchObject({
      type: 'page.lifecycle.update',
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      documentId: 'doc_tour_welcome',
      route: '/',
      scrollState: { x: 0, y: 0 },
    });

    ackOutboundMessage(peer, initial);
    panel.close();
  });

  it('coalesces page lifecycle updates while waiting for iframe acknowledgement', async () => {
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));
    const initial = await waitForOutboundMessage(peer, 'page.lifecycle.update');
    vi.mocked(peer.postMessage).mockClear();

    window.history.pushState(null, '', '#first');
    window.history.pushState(null, '', '#second');
    window.dispatchEvent(new Event('resize'));
    await new Promise((resolve) => window.setTimeout(resolve, 32));

    expect(outboundMessages(peer, 'page.lifecycle.update')).toHaveLength(0);

    ackOutboundMessage(peer, initial);

    const update = await waitForOutboundMessage(peer, 'page.lifecycle.update');
    expect(update).toMatchObject({
      type: 'page.lifecycle.update',
      route: '/#second',
    });
    expect(outboundMessages(peer, 'page.lifecycle.update')).toHaveLength(1);

    ackOutboundMessage(peer, update);
    panel.close();
  });

  it('resolves target inspection requests through the host bridge', async () => {
    const productButton = document.createElement('button');
    productButton.dataset['lodariqId'] = 'new-project';
    productButton.textContent = 'New project';
    document.body.appendChild(productButton);

    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      { iframeSrc: '/lodariq-local/authoring.html' },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    const peer = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });

    iframe.dispatchEvent(new Event('load'));
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'target_inspect_request_1',
          type: 'target.inspect.request',
          blockId: 'step_1',
          targetId: 'target_1',
          action: 'view',
          fingerprint: {
            tagName: 'button',
            role: 'button',
            accessibleName: 'New project',
            stableAttributes: { 'data-lodariq-id': 'new-project' },
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    const result = await waitForOutboundMessage(peer, 'target.inspect.result');

    expect(result).toMatchObject({
      type: 'target.inspect.result',
      blockId: 'step_1',
      targetId: 'target_1',
      action: 'view',
      diagnostic: expect.objectContaining({
        state: 'found',
        confidence: expect.any(Number),
        candidateCount: 1,
        resolutionMethod: 'lodariq_id',
      }),
    });
    expect(
      (result as { diagnostic?: { confidence?: number } }).diagnostic?.confidence,
    ).toBeGreaterThanOrEqual(100);
    expect(document.querySelector('[data-lodariq-bridge="target-reveal"]')).toBeTruthy();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'ack_target_inspect_result',
          type: 'ack',
          ackOf: result?.correlationId,
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    panel.close();
    expect(document.querySelector('[data-lodariq-bridge="target-reveal"]')).toBeNull();
  });

  it('applies semantic preview patches and plays the affected step', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const playPreview = vi.fn(() => Promise.resolve());
    const stopPreview = vi.fn();
    const compilePreview = vi.fn(async (doc: LodariqDocument): Promise<CompiledDocument> => {
      return {
        ...compile({
          document: doc,
          theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
          rendererContractVersion: RENDERER_CONTRACT_VERSION,
        }),
        contentHash: 'local-preview',
      };
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        preview: {
          loadDocument: () => structuredClone(baseDocument),
          compilePreview,
          playPreview,
          stopPreview,
        },
      },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_1',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: {
            ops: [
              {
                op: 'attachTarget',
                targetId: 'target_1',
                fingerprint: {
                  tagName: 'button',
                  role: 'button',
                  accessibleName: 'New project',
                  stableAttributes: { 'data-lodariq-id': 'new-project' },
                },
              },
            ],
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());

    expect(compilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            id: 'target_1',
            fingerprint: expect.objectContaining({ accessibleName: 'New project' }),
          }),
        ],
      }),
      undefined,
    );
    expect(playPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.objectContaining({ id: 'step_1', targetId: 'target_1' })],
      }),
      expect.objectContaining({ stepId: 'step_1' }),
    );

    compilePreview.mockClear();
    playPreview.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_target_evidence',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: {
            ops: [
              {
                op: 'updateTargetEvidence',
                targetId: 'target_1',
                fingerprint: {
                  tagName: 'button',
                  role: 'button',
                  accessibleName: 'New project stabilized',
                  stableAttributes: { 'data-lodariq-id': 'new-project' },
                },
                identity: createTargetIdentityV2('target_1'),
              },
            ],
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() =>
      expect(
        outboundMessages(peer, 'ack').some(
          (message) => message.ackOf === 'preview_patch_target_evidence',
        ),
      ).toBe(true),
    );
    expect(compilePreview).not.toHaveBeenCalled();
    expect(playPreview).not.toHaveBeenCalled();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_lifecycle',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: {
            ops: [
              {
                op: 'setTargetLifecycle',
                targetId: 'target_1',
                lifecycle: {
                  waitForText: 'Projects loaded',
                  scrollStrategy: 'center',
                },
              },
            ],
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());
    expect(compilePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            id: 'target_1',
            fingerprint: expect.objectContaining({ accessibleName: 'New project stabilized' }),
            identity: expect.objectContaining({ targetId: 'target_1' }),
            lifecycle: { waitForText: 'Projects loaded', scrollStrategy: 'center' },
          }),
        ],
      }),
      undefined,
    );
    expect(playPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [
          expect.objectContaining({
            id: 'step_1',
            lifecycle: { waitForText: 'Projects loaded', scrollStrategy: 'center' },
          }),
        ],
      }),
      expect.objectContaining({ stepId: 'step_1' }),
    );

    compilePreview.mockClear();
    playPreview.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_remove_target',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: { ops: [{ op: 'removeTarget', targetId: 'target_1' }] },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(playPreview).toHaveBeenCalledOnce());
    const removedTargetDocument = compilePreview.mock.calls[0]?.[0];
    const tooltip = removedTargetDocument?.blocks[0]?.children[0];
    expect(removedTargetDocument?.targets).toEqual([]);
    expect(removedTargetDocument?.blocks[0]).toMatchObject({
      id: 'step_1',
      status: 'incomplete',
    });
    expect(tooltip).toMatchObject({
      type: 'tooltip',
      status: 'incomplete',
      props: { placement: 'bottom' },
    });
    expect(tooltip?.props).not.toHaveProperty('targetId');
    expect(JSON.stringify(removedTargetDocument)).toContain('Create your first project');
    expect(playPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: [expect.not.objectContaining({ targetId: expect.any(String) })],
      }),
      expect.objectContaining({ stepId: 'step_1' }),
    );
    expect(stopPreview).not.toHaveBeenCalled();

    panel.close();
  });

  it('persists placement removal before acknowledging the destructive preview patch', async () => {
    let finishSave: (() => void) | undefined;
    const save = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const onSave = vi.fn<(document: LodariqDocument) => Promise<void>>(() => save);
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const documentWithTarget = structuredClone(baseDocument);
    documentWithTarget.targets = [
      {
        id: 'target_1',
        fingerprint: {
          tagName: 'button',
          role: 'button',
          accessibleName: 'New project',
          stableAttributes: { 'data-lodariq-id': 'new-project' },
        },
      },
    ];
    documentWithTarget.blocks[0]!.children[0]!.props.targetId = 'target_1';
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        initialDocument: documentWithTarget,
        onSave,
      },
    );

    const iframe = document.querySelector('lodariq-authoring-panel iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    dispatchPreviewPatch(peer, 'preview_patch_remove_persisted', 'step_1', [
      { op: 'removeTarget', targetId: 'target_1' },
    ]);

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]?.[0].targets).toEqual([]);
    expect(
      outboundMessages(peer, 'ack').some(
        (message) => message.ackOf === 'preview_patch_remove_persisted',
      ),
    ).toBe(false);

    finishSave?.();
    await vi.waitFor(() =>
      expect(
        outboundMessages(peer, 'ack').some(
          (message) => message.ackOf === 'preview_patch_remove_persisted',
        ),
      ).toBe(true),
    );

    panel.close();
  });

  it('applies structural semantic preview patches without replacing the document', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const playPreview = vi.fn(() => Promise.resolve());
    const compilePreview = vi.fn(async (doc: LodariqDocument): Promise<CompiledDocument> => {
      return {
        ...compile({
          document: doc,
          theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
          rendererContractVersion: RENDERER_CONTRACT_VERSION,
        }),
        contentHash: 'local-preview',
      };
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        preview: {
          loadDocument: () => structuredClone(baseDocument),
          compilePreview,
          playPreview,
        },
      },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_structural_1',
          type: 'preview.patch',
          blockId: 'heading_1',
          patch: {
            ops: [
              { op: 'setDocumentTitle', title: 'Updated tour' },
              { op: 'updateContent', content: 'Updated heading' },
              {
                op: 'insertStepContent',
                stepBlockId: 'step_1',
                index: 1,
                block: {
                  id: 'paragraph_inserted',
                  type: 'paragraph',
                  content: 'Inserted body',
                  props: {},
                  status: 'ready',
                  children: [],
                },
              },
            ],
          },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(compilePreview).toHaveBeenCalledOnce());
    let previewDocument = compilePreview.mock.calls[0]?.[0];
    expect(previewDocument?.title).toBe('Updated tour');
    expect(previewDocument?.blocks[0]?.children[0]?.children.map((block) => block.id)).toEqual([
      'heading_1',
      'paragraph_inserted',
      'button_1',
    ]);
    expect(previewDocument?.blocks[0]?.children[0]?.children[0]?.content).toBe('Updated heading');

    compilePreview.mockClear();
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: LOCAL_AUTHORING_SESSION_ID,
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_structural_2',
          type: 'preview.patch',
          blockId: 'button_1',
          patch: { ops: [{ op: 'removeBlock', stepBlockId: 'step_1' }] },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await vi.waitFor(() => expect(compilePreview).toHaveBeenCalledOnce());
    previewDocument = compilePreview.mock.calls[0]?.[0];
    expect(previewDocument?.blocks[0]?.children[0]?.children.map((block) => block.id)).toEqual([
      'heading_1',
      'paragraph_inserted',
    ]);
    expect(JSON.stringify(previewDocument)).not.toContain('button_1');

    panel.close();
  });

  it('ignores iframe messages outside the active authoring session scope', async () => {
    const peer = { postMessage: vi.fn() } as unknown as Window;
    const playPreview = vi.fn(() => Promise.resolve());
    const compilePreview = vi.fn(async (doc: LodariqDocument): Promise<CompiledDocument> => {
      return {
        ...compile({
          document: doc,
          theme: LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
          rendererContractVersion: RENDERER_CONTRACT_VERSION,
        }),
        contentHash: 'local-preview',
      };
    });
    const panel = openLocalAuthoringPanel(
      {
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        workspaceId: 'wk_local_dev',
        environment: 'development',
      },
      {
        iframeSrc: '/lodariq-local/authoring.html',
        preview: {
          loadDocument: () => structuredClone(baseDocument),
          compilePreview,
          playPreview,
        },
      },
    );

    const host = document.querySelector('lodariq-authoring-panel');
    const iframe = host?.querySelector('iframe');
    if (!iframe) throw new Error('iframe missing');
    Object.defineProperty(iframe, 'contentWindow', { value: peer, configurable: true });
    iframe.dispatchEvent(new Event('load'));

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: 'wrong_session',
          documentId: 'doc_tour_welcome',
          correlationId: 'preview_patch_wrong_session',
          type: 'preview.patch',
          blockId: 'step_1',
          patch: { ops: [{ op: 'updateContent', content: 'Wrong session' }] },
        },
        origin: window.location.origin,
        source: peer,
      }),
    );

    await Promise.resolve();

    expect(compilePreview).not.toHaveBeenCalled();
    expect(playPreview).not.toHaveBeenCalled();
    expect(peer.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ack', ackOf: 'preview_patch_wrong_session' }),
      window.location.origin,
    );

    panel.close();
  });
});

function dispatchPreviewPatch(
  peer: Window,
  correlationId: string,
  blockId: string,
  ops: Extract<BridgeMessage, { type: 'preview.patch' }>['patch']['ops'],
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: LOCAL_AUTHORING_SESSION_ID,
        documentId: 'doc_tour_welcome',
        correlationId,
        type: 'preview.patch',
        blockId,
        patch: { ops },
      },
      origin: window.location.origin,
      source: peer,
    }),
  );
}

function outboundMessages<TType extends BridgeMessage['type']>(
  peer: Window,
  type: TType,
): Extract<BridgeMessage, { type: TType }>[] {
  return vi
    .mocked(peer.postMessage)
    .mock.calls.map((call) => call[0] as BridgeMessage)
    .filter((message): message is Extract<BridgeMessage, { type: TType }> => {
      return message.type === type;
    });
}

async function waitForOutboundMessage<TType extends BridgeMessage['type']>(
  peer: Window,
  type: TType,
): Promise<Extract<BridgeMessage, { type: TType }>> {
  await vi.waitFor(() => expect(outboundMessages(peer, type)).toHaveLength(1));
  return outboundMessages(peer, type)[0]!;
}

function expectLastSaveStateUpdate(
  peer: Window,
  state: Extract<BridgeMessage, { type: typeof AUTHORING_SAVE_STATE_UPDATE_TYPE }>['state'],
  label: string,
): void {
  const updates = outboundMessages(peer, AUTHORING_SAVE_STATE_UPDATE_TYPE);
  const update = updates[updates.length - 1];
  expect(update).toMatchObject({ state, label });
  expect(validate(BridgeMessageSchema, update)).toMatchObject({ valid: true });
}

function ackOutboundMessage(peer: Window, message: BridgeMessage): void {
  if (message.type === 'ack') return;
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: message.sessionId,
        documentId: message.documentId,
        correlationId: `ack_${message.correlationId}`,
        type: 'ack',
        ackOf: message.correlationId,
      },
      origin: window.location.origin,
      source: peer,
    }),
  );
}
