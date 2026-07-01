// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '@lodariq/compiler';
import type { CompiledDocument, LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { exportDocument, importDocument } from '@lodariq/sdk-runtime/local-dev';
import { TourPlayer } from '@lodariq/sdk-runtime/renderers/tour';

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

describe('tour renderer (PRD §16.1)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = `
      <button data-lodariq-id="new-project" aria-label="New project">New project</button>
    `;
  });

  it('keeps only one active tour host in the page', () => {
    new TourPlayer(compiledDoc).start();
    new TourPlayer(compiledDoc).start();

    expect(document.querySelectorAll('lodariq-tour')).toHaveLength(1);
  });

  it('renders a styled dialog and completes the tour from the button', () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="nonce_runtime">';
    let completed = false;
    const player = new TourPlayer(compiledDoc, {
      onComplete: () => {
        completed = true;
      },
    });

    player.start();

    const host = document.querySelector('lodariq-tour');
    const dialog = host?.shadowRoot?.querySelector('[role="dialog"]');
    const button = host?.shadowRoot?.querySelector('button');

    const styles = host?.shadowRoot?.querySelector('style');
    expect(styles?.textContent).toContain('position: fixed');
    expect(styles?.nonce).toBe('nonce_runtime');
    expect(dialog?.getAttribute('aria-label')).toBe('Lodariq tour');
    expect(dialog?.textContent).toContain('Create your first project');
    expect(host?.shadowRoot?.activeElement).toBe(button);

    button?.click();

    expect(completed).toBe(true);
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
      ...compile(imported),
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

  it('complete action closes playback and fires completion', () => {
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
    expect(document.querySelector('lodariq-tour')?.shadowRoot?.textContent).toContain('Update plan');
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
              timeoutMs: 220,
            },
          },
        ],
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(target.scrollIntoView).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 140));
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(responseText).toBe('loaded');
      expect(target.scrollIntoView).toHaveBeenCalled();
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
              timeoutMs: 220,
            },
          },
        ],
      }).start();

      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(target.scrollIntoView).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 140));
      expect(send).toHaveBeenCalledOnce();
      expect(target.scrollIntoView).toHaveBeenCalled();
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
