// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, type BridgeMessage } from '@talmeh/schema';
import { LOCAL_AUTHORING_SESSION_ID } from '@talmeh/sdk-authoring';

async function loadFrame(): Promise<void> {
  vi.resetModules();
  document.body.innerHTML = '<div id="authoring"></div>';
  localStorage.clear();
  await import('../../../../apps/fixture-host/src/authoring-frame');
}

function importTwoBlocks(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea')!;
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

describe('fixture host authoring frame (PRD §16.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('turns a slash command gesture into a rendered block', async () => {
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Slash command"]');
    const menu = document.querySelector<HTMLElement>('.menu');
    const heading = document.querySelector<HTMLButtonElement>('[data-command="heading"]');

    expect(input).toBeTruthy();
    input!.value = '/';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(menu?.hidden).toBe(false);
    heading?.click();

    expect(document.querySelector('.document')?.textContent).toContain('Untitled heading');
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain(
      'Untitled heading',
    );
  });

  it('sends semantic preview patches for block transactions, not keystrokes', async () => {
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    await loadFrame();

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Slash command"]');
    const heading = document.querySelector<HTMLButtonElement>('[data-command="heading"]');
    input!.value = '/';
    input!.dispatchEvent(new Event('input', { bubbles: true }));

    expect(postMessage).not.toHaveBeenCalled();

    heading?.click();

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

  it('exposes labels and live status for the local authoring controls', async () => {
    await loadFrame();

    expect(document.querySelector('[aria-live="polite"]')?.id).toBe('status');
    expect(document.querySelector('section[aria-label="Slash commands"]')).toBeTruthy();
    expect(document.querySelector('input[aria-label="Slash command"]')).toBeTruthy();
    expect(document.querySelector('section[aria-label="Canonical document blocks"]')).toBeTruthy();
    expect(document.querySelector('textarea[aria-label="Document JSON"]')).toBeTruthy();
    expect([...document.querySelectorAll('button')].map((button) => button.textContent)).toContain(
      'Target',
    );
  });

  it('imports, exports, saves, and resets canonical document JSON', async () => {
    await loadFrame();

    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
    const importButton = document.querySelector<HTMLButtonElement>('[data-action="import"]');
    const saveButton = document.querySelector<HTMLButtonElement>('[data-action="save"]');
    const resetButton = document.querySelector<HTMLButtonElement>('[data-action="reset"]');

    expect(textarea).toBeTruthy();
    textarea!.value = textarea!.value.replace('Welcome tour', 'Imported tour');
    importButton?.click();

    expect(document.querySelector('#status')?.textContent).toBe('Imported JSON');
    expect(textarea?.value).toContain('Imported tour');

    saveButton?.click();
    expect(localStorage.getItem('talmeh:doc:doc_tour_welcome')).toContain('Imported tour');

    resetButton?.click();
    expect(localStorage.getItem('talmeh:doc:doc_tour_welcome')).toBeNull();
    expect(textarea?.value).toContain('Welcome tour');
  });

  it('supports transform controls, property chips, keyboard reorder, and undo/redo', async () => {
    await loadFrame();
    importTwoBlocks();

    expect(document.querySelector('.property-chip')?.textContent).toBe('level: 2');

    const transform = document.querySelector<HTMLSelectElement>('select[data-block-id="block_a"]');
    transform!.value = 'button';
    transform!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain(
      '"type": "button"',
    );

    document.querySelector<HTMLButtonElement>('[data-action="undo"]')?.click();
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain(
      '"type": "paragraph"',
    );

    document.querySelector<HTMLButtonElement>('[data-action="redo"]')?.click();
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toContain(
      '"type": "button"',
    );

    document
      .querySelector<HTMLButtonElement>(
        '[data-action="move-block"][data-block-id="block_a"][data-direction="down"]',
      )
      ?.click();
    const doc = JSON.parse(document.querySelector<HTMLTextAreaElement>('textarea')!.value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('supports top-level drag and drop reorder', async () => {
    await loadFrame();
    importTwoBlocks();

    const blocks = document.querySelectorAll<HTMLElement>('.block');
    blocks[1]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    blocks[0]?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));

    const doc = JSON.parse(document.querySelector<HTMLTextAreaElement>('textarea')!.value) as {
      blocks: Array<{ id: string }>;
    };
    expect(doc.blocks.map((block) => block.id)).toEqual(['block_b', 'block_a']);
  });

  it('renders ready, incomplete, and invalid validation badges', async () => {
    await loadFrame();

    const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
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
        stableAttributes: { 'data-talmeh-id': 'new-project' },
      },
    };

    window.dispatchEvent(
      new MessageEvent('message', {
        data: message,
        origin: window.location.origin,
        source: window,
      }),
    );

    const doc = JSON.parse(document.querySelector<HTMLTextAreaElement>('textarea')!.value) as {
      targets: Array<{ id: string; fingerprint: { accessibleName?: string } }>;
      blocks: Array<{ children: Array<{ props: Record<string, unknown> }> }>;
    };

    expect(doc.targets.at(-1)?.fingerprint.accessibleName).toBe('New project');
    expect(doc.blocks[0]?.children[0]?.props['targetId']).toBe(doc.targets.at(-1)?.id);
    expect(document.querySelector('.target-chip')?.textContent).toBe('New project');
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

    const json = document.querySelector<HTMLTextAreaElement>('textarea')?.value ?? '';
    expect(json).toContain('Safe copy');
    expect(json).not.toContain('onclick');
    expect(json).not.toContain('<strong>');
    expect(json).not.toContain('<script>');
  });
});
