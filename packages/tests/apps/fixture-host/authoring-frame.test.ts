// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type BridgeMessage, type LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import {
  LOCAL_AUTHORING_SESSION_ID,
  mountLocalAuthoringFrame,
  type LocalAuthoringFrameServices,
} from '@lodariq/sdk-authoring';

async function loadFrame(): Promise<void> {
  vi.resetModules();
  document.body.innerHTML = '<div id="authoring"></div>';
  localStorage.clear();
  await import('../../../../apps/fixture-host/src/authoring-frame');
}

function documentJson(): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Document JSON"]')!;
}

function importTwoBlocks(): void {
  const textarea = documentJson();
  const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]')!;
  const doc = JSON.parse(textarea.value) as { blocks: Array<Record<string, unknown>> };
  doc.blocks = [
    {
      id: 'block_a',
      type: 'paragraph',
      content: 'Alpha',
      props: {},
      children: [],
      status: 'ready',
    },
    {
      id: 'block_b',
      type: 'heading',
      content: 'Beta',
      props: { level: 2 },
      children: [],
      status: 'ready',
    },
  ];
  textarea.value = JSON.stringify(doc);
  importButton.click();
}

async function flushPreviewPatchQueue(): Promise<void> {
  await Promise.resolve();
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
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns a slash command gesture into a rendered block', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]');
    const menu = document.querySelector<HTMLElement>('.menu');
    const heading = document.querySelector<HTMLButtonElement>('[data-command="heading"]');

    expect(input).toBeTruthy();
    input!.value = '/';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(menu?.hidden).toBe(false);
    heading?.firstChild?.dispatchEvent(
      new Event('pointerdown', { bubbles: true, cancelable: true }),
    );

    const renderedHeadings = [
      ...document.querySelectorAll<HTMLInputElement>('[aria-label="Heading"]'),
    ];
    expect(renderedHeadings[renderedHeadings.length - 1]?.value).toBe('Untitled heading');
    expect(documentJson().value).toContain('Untitled heading');
    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ type: string; content?: string }>;
    };
    expect(doc.blocks[doc.blocks.length - 1]).toMatchObject({
      type: 'heading',
      content: 'Untitled heading',
    });
  });

  it('applies the host CSP nonce to local authoring frame styles', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_local_frame">';
    await loadFrame();

    expect(document.head.querySelector('style')?.nonce).toBe('nonce_local_frame');
  });

  it('turns a typed slash command into a rendered block and persists it', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]')!;
    input.value = '/heading';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const json = documentJson().value;
    const renderedHeadings = [
      ...document.querySelectorAll<HTMLInputElement>('[aria-label="Heading"]'),
    ];
    expect(renderedHeadings[renderedHeadings.length - 1]?.value).toBe('Untitled heading');
    expect(json).toContain('"type": "heading"');
    expect(json).toContain('Untitled heading');
    expect(json).not.toContain('/heading');
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toContain('Untitled heading');
  });

  it('authors a real editable tour step with text and a continue button', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]')!;
    input.value = '/step';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const renderedBlocks = [...document.querySelectorAll<HTMLElement>('.block')];
    const step = renderedBlocks[renderedBlocks.length - 1]!;
    expect(step.getAttribute('aria-label')).toBe('Tour step block');
    expect(step.querySelector<HTMLInputElement>('[aria-label="Heading"]')?.value).toBe(
      'Untitled step',
    );
    expect(step.querySelector<HTMLTextAreaElement>('[aria-label="Body text"]')?.value).toBe(
      'Write supporting copy',
    );
    expect(step.querySelector<HTMLInputElement>('[aria-label="Button label"]')?.value).toBe(
      'Continue',
    );
    expect(step.querySelector<HTMLSelectElement>('[aria-label="Button action"]')?.value).toBe(
      'next',
    );

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

  it('inserts blocks between top-level blocks without manual reordering', async () => {
    await loadFrame();
    importTwoBlocks();

    document
      .querySelector<HTMLButtonElement>('[aria-label="Insert block after this block"]')
      ?.click();
    await Promise.resolve();
    const headingCommand = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.inline-command-menu:not([hidden]) .inline-command',
      ),
    ].find((button) => button.textContent?.includes('Heading'));
    headingCommand?.click();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string; type: string; content?: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual([
      'block_a',
      expect.stringMatching(/^block_/),
      'block_b',
    ]);
    expect(doc.blocks.map((block) => block.type)).toEqual(['paragraph', 'heading', 'heading']);
    expect(doc.blocks[1]?.content).toBe('Untitled heading');
  });

  it('inserts nested paragraph, button, and media placeholders inside a step', async () => {
    await loadFrame();

    const step = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    step.querySelector<HTMLButtonElement>('[aria-label="Insert content at end of step"]')?.click();
    await Promise.resolve();
    const mediaCommand = [
      ...step.querySelectorAll<HTMLButtonElement>(
        '.inline-command-menu:not([hidden]) .inline-command',
      ),
    ].find((button) => button.textContent?.includes('Media'));
    mediaCommand?.click();

    const mediaInput = step.querySelector<HTMLInputElement>('[aria-label="Media placeholder"]');
    expect(mediaInput?.value).toBe('Media placeholder');
    expect(step.textContent).toContain('Placeholder only');

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{
        children: Array<{ children: Array<{ type: string; content?: string; status?: string }> }>;
      }>;
    };
    const childTypes = doc.blocks[0]?.children[0]?.children.map((block) => block.type);
    expect(childTypes).toEqual(['heading', 'paragraph', 'button', 'media']);
    expect(doc.blocks[0]?.children[0]?.children[3]).toMatchObject({
      type: 'media',
      content: 'Media placeholder',
      status: 'incomplete',
    });
  });

  it('saves incomplete button actions and sends typed setAction patches', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]')!;
    input.value = '/button';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const renderedBlocks = [...document.querySelectorAll<HTMLElement>('.block')];
    const buttonBlock = renderedBlocks[renderedBlocks.length - 1]!;
    const actionSelect = buttonBlock.querySelector<HTMLSelectElement>(
      '[data-action="set-action"][aria-label="Button action"]',
    )!;
    expect(buttonBlock.textContent).toContain('Needs purpose');
    expect(actionSelect.value).toBe('');

    actionSelect.value = 'clickTarget';
    actionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ type: string; status?: string; props: { action?: { type: string } } }>;
    };
    const authoredButton = doc.blocks[doc.blocks.length - 1]!;
    expect(authoredButton).toMatchObject({
      type: 'button',
      status: 'ready',
      props: { variant: 'primary', action: { type: 'clickTarget' } },
    });
    const updatedBlocks = [...document.querySelectorAll<HTMLElement>('.block')];
    const updatedButtonBlock = updatedBlocks[updatedBlocks.length - 1]!;
    expect(updatedButtonBlock.textContent).toContain('Waits for target click');
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        patch: {
          ops: expect.arrayContaining([{ op: 'setAction', action: { type: 'clickTarget' } }]),
        },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it('does not treat pasted slash text inside the slash input as document content', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]');
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

  it('keeps unknown slash text as ordinary paragraph content', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]')!;
    input.value = '/not-a-command';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const json = documentJson().value;
    expect(json).toContain('"type": "paragraph"');
    expect(json).toContain('/not-a-command');
  });

  it('resets to a fresh fixture after inserted blocks', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]');
    const heading = document.querySelector<HTMLButtonElement>('[data-command="heading"]');
    const reset = document.querySelector<HTMLButtonElement>('[data-action="reset"]');
    const textarea = documentJson();

    input!.value = '/';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    heading?.click();
    expect(textarea?.value).toContain('Untitled heading');

    reset?.click();

    const doc = JSON.parse(textarea!.value) as { blocks: Array<{ id: string }> };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_step_1']);
    expect(textarea?.value).not.toContain('Untitled heading');
  });

  it('sends semantic preview patches for block transactions, not keystrokes', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();
    postMessage.mockClear();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]');
    const heading = document.querySelector<HTMLButtonElement>('[data-command="heading"]');
    input!.value = '/';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(postMessage).not.toHaveBeenCalled();

    heading?.click();
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

  it('batches consecutive semantic preview patches for the same block', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();
    importTwoBlocks();
    await flushPreviewPatchQueue();
    postMessage.mockClear();

    const transform = document.querySelector<HTMLSelectElement>('select[data-block-id="block_a"]');
    transform!.value = 'button';
    transform!.dispatchEvent(new Event('change', { bubbles: true }));
    document
      .querySelector<HTMLButtonElement>(
        '[data-action="move-block"][data-block-id="block_a"][data-direction="down"]',
      )
      ?.click();

    expect(postMessage).not.toHaveBeenCalled();
    await flushPreviewPatchQueue();

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_a',
        patch: {
          ops: [
            { op: 'transformBlock', type: 'button' },
            { op: 'moveBlock', direction: 'down' },
          ],
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

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]')!;
    input.value = '/heading';
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

  it('requests target inspection and renders scoped health diagnostics', async () => {
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

    expect(document.querySelector('.target-chip')?.textContent).toContain('Healthy');
    expect(document.querySelector('#status')?.textContent).toBe('Found by role and label');

    document.querySelector<HTMLButtonElement>('[data-action="target-advanced"]')?.click();
    expect(document.querySelector('.target-advanced')?.textContent).toContain('New project');

    window.dispatchEvent(new Event('pagehide'));
  });

  it('exposes labels and live status for the local authoring controls', async () => {
    await loadFrame();

    expect(document.querySelector('[aria-live="polite"]')?.id).toBe('status');
    expect(document.querySelector('section[aria-label="Insert blocks"]')).toBeTruthy();
    expect(
      document.querySelector('input[aria-label="Block composer"]')?.getAttribute('aria-controls'),
    ).toBe('slash-command-menu');
    expect(
      document.querySelector('input[aria-label="Block composer"]')?.getAttribute('aria-haspopup'),
    ).toBe('listbox');
    expect(
      document.querySelector('[role="listbox"][aria-label="Block insert commands"]'),
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLButtonElement>('[data-command="step"]')?.textContent,
    ).toContain('/step');
    expect(document.querySelector('section[aria-label="Canonical document blocks"]')).toBeTruthy();
    expect(document.querySelector('textarea[aria-label="Document JSON"]')).toBeTruthy();
    expect([...document.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Add step',
    );
    expect(
      [...document.querySelectorAll('button')]
        .map((button) => button.textContent)
        .some((label) => label === 'Select target' || label === 'Change target'),
    ).toBe(true);
    expect([...document.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Export metrics',
    );
  });

  it('focuses the slash composer from blank document canvas clicks', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Block composer"]')!;
    expect(document.activeElement).not.toBe(input);

    document
      .querySelector<HTMLElement>('.document-hero')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.activeElement).toBe(input);
  });

  it('exports a local metrics report for Phase 0 sign-off evidence', async () => {
    await loadFrame();

    document.querySelector<HTMLButtonElement>('[data-action="export-metrics"]')?.click();

    const report = JSON.parse(
      document.querySelector<HTMLElement>('.metrics-output')!.textContent ?? '',
    ) as {
      sessions: Array<{ sessionId: string; summary: { documentId: string } | null }>;
    };
    expect(report.sessions).toHaveLength(1);
    expect(report.sessions[0]?.sessionId).toMatch(/^local_authoring_session:/);
    expect(report.sessions[0]?.summary?.documentId).toBe('doc_tour_welcome');
    expect(document.querySelector('#status')?.textContent).toBe('Exported metrics report');
  });

  it('imports, exports, saves, and resets canonical document JSON', async () => {
    await loadFrame();

    const textarea = documentJson();
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save"]');
    const resetButton = document.querySelector<HTMLButtonElement>('[data-action="reset"]');

    expect(textarea).toBeTruthy();
    textarea!.value = textarea!.value.replace('Welcome tour', 'Imported tour');
    importButton?.click();

    expect(document.querySelector('#status')?.textContent).toBe('Imported JSON');
    expect(textarea?.value).toContain('Imported tour');

    saveButton?.click();
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toContain('Imported tour');

    resetButton?.click();
    expect(localStorage.getItem('lodariq:doc:doc_tour_welcome')).toBeNull();
    expect(textarea?.value).toContain('Welcome tour');
  });

  it('rejects imported documents outside the active local frame scope', async () => {
    await loadFrame();

    const textarea = documentJson();
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const exportButton = document.querySelector<HTMLButtonElement>('[data-action="export"]');
    const originalJson = textarea.value;

    const wrongDocument = JSON.parse(originalJson) as LodariqDocument;
    wrongDocument.id = 'doc_wrong';
    textarea.value = JSON.stringify(wrongDocument);
    importButton?.click();

    expect(document.querySelector('#status')?.textContent).toBe(
      'Import rejected: document id must remain doc_tour_welcome',
    );
    exportButton?.click();
    expect(documentJson().value).toBe(originalJson);
    expect(localStorage.getItem('lodariq:doc:doc_wrong')).toBeNull();

    const wrongWorkspace = JSON.parse(originalJson) as LodariqDocument;
    wrongWorkspace.workspaceId = 'wk_wrong';
    textarea.value = JSON.stringify(wrongWorkspace);
    importButton?.click();

    expect(document.querySelector('#status')?.textContent).toBe(
      'Import rejected: workspace id must remain wk_local_dev',
    );
    exportButton?.click();
    expect(documentJson().value).toBe(originalJson);
  });

  it('supports transform controls, property chips, and undo/redo', async () => {
    await loadFrame();
    importTwoBlocks();

    expect(document.querySelector('.property-chip')?.textContent).toBe('Heading level 2');

    const transform = document.querySelector<HTMLSelectElement>('select[data-block-id="block_a"]');
    transform!.value = 'button';
    transform!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(documentJson().value).toContain('"type": "button"');
    expect(documentJson().value).toContain('"status": "incomplete"');

    document.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    expect(documentJson().value).toContain('"type": "paragraph"');

    document.querySelector<HTMLButtonElement>('[data-action="redo"]')?.click();
    expect(documentJson().value).toContain('"type": "button"');

    document
      .querySelector<HTMLButtonElement>(
        '[data-action="move-block"][data-block-id="block_a"][data-direction="down"]',
      )
      ?.click();
    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('supports top-level keyboard reorder without losing block focus', async () => {
    await loadFrame();
    importTwoBlocks();

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
    importTwoBlocks();

    const blocks = document.querySelectorAll<HTMLElement>('.block');
    blocks[1]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    blocks[0]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));

    const doc = JSON.parse(documentJson().value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('renders ready, incomplete, and invalid validation badges', async () => {
    await loadFrame();

    const textarea = documentJson();
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const doc = JSON.parse(textarea!.value) as {
      blocks: Array<Record<string, unknown>>;
    };
    doc.blocks = [
      {
        id: 'block_ready',
        type: 'paragraph',
        content: 'Ready',
        props: {},
        children: [],
        status: 'ready',
      },
      {
        id: 'block_incomplete',
        type: 'paragraph',
        content: 'Incomplete',
        props: {},
        children: [],
        status: 'incomplete',
      },
      {
        id: 'block_invalid',
        type: 'paragraph',
        content: 'Invalid',
        props: {},
        children: [],
        status: 'invalid',
      },
    ];
    textarea!.value = JSON.stringify(doc);
    importButton?.click();

    const badges = [...document.querySelectorAll('.badge')].map((badge) => badge.textContent);
    expect(badges).toEqual(['ready', 'incomplete', 'invalid']);
  });

  it('attaches a bridge-picked target as canonical JSON and a target chip', async () => {
    await loadFrame();

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

    const doc = JSON.parse(documentJson().value) as {
      targets: Array<{ id: string; fingerprint: { accessibleName?: string } }>;
      blocks: Array<{ children: Array<{ props: Record<string, unknown> }> }>;
    };

    const target = doc.targets[doc.targets.length - 1];
    expect(target?.fingerprint.accessibleName).toBe('New project');
    expect(doc.blocks[0]?.children[0]?.props.targetId).toBe(target?.id);
    expect(document.querySelector('.target-chip-label')?.textContent).toBe('New project');
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

    const json = documentJson().value;
    expect(json).toContain('Safe copy');
    expect(json).not.toContain('onclick');
    expect(json).not.toContain('<strong>');
    expect(json).not.toContain('<script>');
  });
});
