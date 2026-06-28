// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '@talmeh/compiler';
import type { CompiledDocument, TalmehDocument } from '@talmeh/schema';
import tourFixture from '@talmeh/schema/fixtures/tour.linear.v1.json';
import { exportDocument, importDocument } from '@talmeh/sdk-runtime/local-dev';
import { TourPlayer } from '@talmeh/sdk-runtime/renderers/tour';

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
        stableAttributes: { 'data-talmeh-id': 'new-project' },
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
          props: {},
        },
      ],
    },
  ],
};

describe('tour renderer (PRD §16.1)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button data-talmeh-id="new-project" aria-label="New project">New project</button>
    `;
  });

  it('keeps only one active tour host in the page', () => {
    new TourPlayer(compiledDoc).start();
    new TourPlayer(compiledDoc).start();

    expect(document.querySelectorAll('talmeh-tour')).toHaveLength(1);
  });

  it('renders a styled dialog and completes the tour from the button', () => {
    let completed = false;
    const player = new TourPlayer(compiledDoc, {
      onComplete: () => {
        completed = true;
      },
    });

    player.start();

    const host = document.querySelector('talmeh-tour');
    const dialog = host?.shadowRoot?.querySelector('[role="dialog"]');
    const button = host?.shadowRoot?.querySelector('button');

    expect(host?.shadowRoot?.querySelector('style')?.textContent).toContain('position: fixed');
    expect(dialog?.getAttribute('aria-label')).toBe('Talmeh tour');
    expect(dialog?.textContent).toContain('Create your first project');
    expect(host?.shadowRoot?.activeElement).toBe(button);

    button?.click();

    expect(completed).toBe(true);
    expect(document.querySelector('talmeh-tour')).toBeNull();
  });

  it('replays an exported, re-imported, and recompiled tour fixture', () => {
    document.body.innerHTML = `
      <button data-talmeh-id="new-project" aria-label="New project">New project</button>
    `;
    const fixture = tourFixture as TalmehDocument;
    const imported = importDocument(exportDocument(fixture));
    const compiled: CompiledDocument = {
      ...compile(imported),
      contentHash: 'local-preview',
    };

    new TourPlayer(compiled).start();

    expect(compiled.steps.map((step) => step.id)).toEqual(fixture.blocks.map((block) => block.id));
    expect(document.querySelector('talmeh-tour')?.shadowRoot?.textContent).toContain(
      'Create your first project',
    );
  });

  it('waits for lifecycle text before resolving an async target', async () => {
    document.body.innerHTML = '<main></main>';
    const scrollIntoView = vi.fn();
    const button = document.createElement('button');
    button.dataset['talmehId'] = 'new-project';
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

  it('scrolls the declared lifecycle container before positioning a target', async () => {
    document.body.innerHTML = `
      <main data-talmeh-id="scroll-pane" style="overflow: auto">
        <button data-talmeh-id="new-project" aria-label="New project">New project</button>
      </main>
    `;
    const container = document.querySelector<HTMLElement>('[data-talmeh-id="scroll-pane"]')!;
    const button = document.querySelector<HTMLButtonElement>('[data-talmeh-id="new-project"]')!;
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
            stableAttributes: { 'data-talmeh-id': 'scroll-pane' },
          },
        },
      ],
      steps: [
        {
          ...compiledDoc.steps[0]!,
          lifecycle: {
            scrollContainer: {
              tagName: 'main',
              stableAttributes: { 'data-talmeh-id': 'scroll-pane' },
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
        <button data-talmeh-id="new-project" aria-label="New project">New project</button>
      `;
      const button = document.querySelector<HTMLButtonElement>('[data-talmeh-id="new-project"]')!;
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
    document.body.innerHTML = '<main data-talmeh-id="virtual-list" style="overflow: auto"></main>';
    const container = document.querySelector<HTMLElement>('[data-talmeh-id="virtual-list"]')!;
    const scrollIntoView = vi.fn();
    container.addEventListener(
      'scroll',
      () => {
        if (container.querySelector('[data-talmeh-id="new-project"]')) return;
        const button = document.createElement('button');
        button.dataset['talmehId'] = 'new-project';
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
            stableAttributes: { 'data-talmeh-id': 'virtual-list' },
          },
        },
      ],
      steps: [
        {
          ...compiledDoc.steps[0]!,
          lifecycle: {
            scrollContainer: {
              tagName: 'main',
              stableAttributes: { 'data-talmeh-id': 'virtual-list' },
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
