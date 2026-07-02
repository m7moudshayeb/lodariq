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
  return document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Editable backup"]')!;
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

  it('keeps top-level slash commands limited to tour steps', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]');
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
      blocks: Array<{ type: string; children?: Array<{ children?: Array<{ content?: string }> }> }>;
    };
    expect(doc.blocks[doc.blocks.length - 1]).toMatchObject({
      type: 'tourStep',
    });
    expect(doc.blocks[doc.blocks.length - 1]?.children?.[0]?.children?.[0]?.content).toBe(
      'Untitled step',
    );
  });

  it('applies the host CSP nonce to local authoring frame styles', async () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_local_frame">';
    await loadFrame();

    expect(document.head.querySelector('style')?.nonce).toBe('nonce_local_frame');
  });

  it('loads the local authoring frame with the editor theme styles', async () => {
    await loadFrame();

    const styles = document.head.querySelector('style')?.textContent ?? '';
    expect(styles).toContain('color-scheme: light');
    expect(styles).toContain('background: var(--lq-color-page)');
    expect(styles).toContain('background: linear-gradient(180deg, var(--lq-color-chrome), #091f1c)');
  });

  it('does not emit React flushSync warnings during lifecycle-driven updates', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await loadFrame();

    const composer = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]')!;
    composer.value = '/step';
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    const title = document.querySelector<HTMLInputElement>('input[aria-label="Experience title"]')!;
    title.value = 'Lifecycle warning regression';
    title.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPreviewPatchQueue();

    const errorText = consoleError.mock.calls
      .flat()
      .map((value) => String(value))
      .join('\n');
    expect(errorText).not.toContain('flushSync');
  });

  it('keeps focus inside the authoring field after committing content edits', async () => {
    await loadFrame();

    const heading = document.querySelector<HTMLTextAreaElement>(
      '[data-block-id="block_heading_1"][data-action="edit-content"]',
    )!;
    const setTextareaValue =
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

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

  it('removes duplicate inner chrome in embedded panel mode', async () => {
    window.history.replaceState(null, '', '/authoring.html?lodariqFrame=panel');
    await loadFrame();

    expect(document.querySelector('.shell-panel')).toBeTruthy();
    expect(document.querySelector('.topbar')).toBeNull();

    window.history.replaceState(null, '', '/');
  });

  it('turns typed top-level text into a titled tour step and rejects content commands', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]')!;
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
          ops: [
            { op: 'setDocumentTitle', title: 'Customer onboarding tour' },
          ],
        },
      }),
      window.location.origin,
    );
    postMessage.mockRestore();
  });

  it('authors a real editable tour step with text and a continue button', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]')!;
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
    expect(step.querySelector<HTMLSelectElement>('[aria-label="After click"]')?.value).toBe('next');

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

  it('inserts tour steps between top-level blocks without exposing content blocks', async () => {
    await loadFrame();
    await importTwoBlocks();

    document
      .querySelector<HTMLButtonElement>('[aria-label="Add step after this step"]')
      ?.click();
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
  });

  it('filters and closes inline insert menus like a document command palette', async () => {
    await loadFrame();
    await importTwoBlocks();

    document
      .querySelector<HTMLButtonElement>('[aria-label="Add step after this step"]')
      ?.click();
    await flushPreviewPatchQueue();

    const search = document.querySelector<HTMLInputElement>(
      '.inline-command-menu:not([hidden]) [aria-label="Search content"]',
    );
    expect(search).toBeTruthy();
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
    const composerUpdatedStep =
      document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    expect(composerUpdatedStep.querySelector('[aria-label="Add title to this step"]')).toBeTruthy();
    expect(composerUpdatedStep.querySelector('[aria-label="Add text to this step"]')).toBeTruthy();
    expect(composerUpdatedStep.querySelector('[aria-label="Add button to this step"]')).toBeTruthy();
    expect(composerUpdatedStep.querySelector('[aria-label="Add media to this step"]')).toBeTruthy();
    const mediaButton = composerUpdatedStep.querySelector<HTMLButtonElement>(
      '[aria-label="Add media to this step"]',
    )!;
    mediaButton.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    await flushPreviewPatchQueue();

    const updatedStep = document.querySelector<HTMLElement>('.block[data-block-type="tourStep"]')!;
    const mediaInput =
      updatedStep.querySelector<HTMLInputElement>('[aria-label="Media placeholder"]');
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

    const menu = step.querySelector<HTMLElement>('.step-command-menu:not([hidden])');
    expect(menu).toBeTruthy();
    const firstCommand = menu!.querySelector<HTMLButtonElement>('.command-item');
    expect(firstCommand).toBeTruthy();
    expect(firstCommand!.querySelector(':scope > .ui-button-icon')).toBeNull();
    expect(firstCommand!.querySelector('.ui-button-label > .command-icon')).toBeTruthy();
    expect(firstCommand!.querySelector('.ui-button-label > .command-copy strong')?.textContent).toBe(
      'Heading',
    );
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
    firstHeading.querySelector<HTMLButtonElement>('[aria-label="Insert content after this"]')?.click();
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
    const setTextareaValue =
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
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
    const setBodyValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
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

    const paragraphFields = [...document.querySelectorAll<HTMLTextAreaElement>(
      '.step-child-paragraph [aria-label="Body text"]',
    )];
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
    const setTextareaValue =
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

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
      '[data-action="set-action"][aria-label="After click"]',
    )!;
    expect(buttonBlock.textContent).toContain('Choose next action');
    expect(actionSelect.value).toBe('');

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
      props: { variant: 'primary', action: { type: 'clickTarget' } },
    });
    expect(buttonBlock.textContent).toContain('Wait for placement');
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

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]');
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

  it('keeps unknown top-level slash commands out of the document', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]')!;
    const before = documentJson().value;
    input.value = '/not-a-command';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPreviewPatchQueue();

    expect(documentJson().value).toBe(before);
    expect(document.querySelector('#status')?.textContent).toBe('Open a step to add content.');
  });

  it('resets to a fresh fixture after inserted blocks', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]');
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

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]');
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

  it('batches consecutive semantic preview patches for the same block', async () => {
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
    document
      .querySelector<HTMLButtonElement>(
        '[data-block-id="block_a_copy"] [aria-label="Turn content into button"]',
      )
      ?.click();
    await Promise.resolve();
    document
      .querySelector<HTMLSelectElement>(
        'select[aria-label="After click"][data-block-id="block_a_copy"]',
      )
      ?.dispatchEvent(new Event('change', { bubbles: true }));

    expect(postMessage).not.toHaveBeenCalled();
    await flushPreviewPatchQueue();

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview.patch',
        blockId: 'block_a_copy',
        patch: {
          ops: [
            { op: 'transformBlock', type: 'button' },
            { op: 'setAction' },
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
    await flushPreviewPatchQueue();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]')!;
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

  it('groups placement actions, behavior controls, and diagnostics in the target menu', async () => {
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

    const targetMenu = document.querySelector<HTMLElement>('.target-menu')!;
    expect(targetMenu.closest('.block')).toBeNull();
    expect(targetMenu.closest('.step-child')).toBeNull();
    expect(targetMenu.textContent).toContain('Find');
    expect(targetMenu.textContent).toContain('Conditions');
    expect(targetMenu.textContent).toContain('Debug');
    expect(
      [...targetMenu.querySelectorAll<HTMLButtonElement>('.target-menu-action')].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Highlight', 'Try click', 'Run check', 'Change']);

    const trigger = document.querySelector<HTMLButtonElement>(
      '[aria-label="Placement New project actions"]',
    )!;
    trigger.click();
    await flushPreviewPatchQueue();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
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

    expect(document.querySelector('.target-chip')?.textContent).toContain('Ready');
    expect(document.querySelector('#status')?.textContent).toBe('Placement is ready.');

    document.querySelector<HTMLButtonElement>('[data-action="target-advanced"]')?.click();
    await flushPreviewPatchQueue();
    expect(document.querySelector('.target-advanced')?.textContent).toContain('New project');
    expect(document.querySelector('.target-advanced')?.textContent).toContain('Match strength 94%');

    vi.mocked(peer.postMessage).mockClear();
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
      document.querySelector('input[aria-label="Experience composer"]')?.getAttribute('aria-controls'),
    ).toBe('slash-command-menu');
    expect(
      document.querySelector('input[aria-label="Experience composer"]')?.getAttribute('aria-haspopup'),
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

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Experience composer"]')!;
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

    const firstStep = document.querySelector<HTMLElement>('[data-block-id="block_a"]')!;
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

  it('exposes direct duplicate and delete controls on top-level items', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();
    await importTwoBlocks();
    await flushPreviewPatchQueue();
    postMessage.mockClear();

    const firstBlock = document.querySelector<HTMLElement>('[data-block-id="block_a"]')!;
    firstBlock.querySelector<HTMLButtonElement>('[aria-label="Step actions"]')?.click();
    await flushPreviewPatchQueue();

    const popover = document.querySelector<HTMLElement>('.block-action-popover');
    expect(popover?.textContent).toContain('Move up');
    expect(popover?.textContent).toContain('Move down');
    expect(popover?.textContent).not.toContain('Duplicate');
    expect(popover?.textContent).not.toContain('Delete');

    document
      .querySelector<HTMLButtonElement>(
        '[data-block-id="block_a"] [aria-label="Duplicate step"]',
      )
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
      blocks: Array<{ id: string; type: string; children?: Array<{ children?: Array<{ content?: string }> }> }>;
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
  });

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
    expect(document.querySelector('#status')?.textContent).toBe('Placement set: New project');
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
