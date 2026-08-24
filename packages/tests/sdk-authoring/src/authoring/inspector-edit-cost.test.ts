// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import { StepStyleHeader } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/step-style-header';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * What one inspector edit costs, and what it is allowed to leave alone.
 *
 * A creator changing a colour produced two snapshots — one for the document, one
 * for the status line — and each rebuilt the whole document twice over, once
 * localized and once deep-cloned. The emits that were not document changes at
 * all paid the same price.
 */
describe('the cost of one inspector edit', () => {
  it('emits once for a property change, not again for the status line', () => {
    const controller = createController();
    const tooltip = tooltipOf(controller);
    const snapshots: unknown[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    controller.setTooltipStyle(tooltip.id, { surfaceColor: '#123456' });

    expect(snapshots).toHaveLength(1);
    expect(controller.getSnapshot().status).toBe('Popup styling updated');
  });

  it('carries the change and the status line in the same snapshot', () => {
    const controller = createController();
    const tooltip = tooltipOf(controller);
    let seen: { status: string; surfaceColor?: string } | null = null;
    controller.subscribe((snapshot) => {
      seen = {
        status: snapshot.status,
        surfaceColor: tooltipIn(snapshot.documentState).props.tooltipStyle?.surfaceColor,
      };
    });

    controller.setTooltipStyle(tooltip.id, { surfaceColor: '#123456' });

    // The status used to arrive one snapshot after the change it describes.
    expect(seen).toEqual({ status: 'Popup styling updated', surfaceColor: '#123456' });
  });

  it('hands back the same document copies when the document did not change', () => {
    const controller = createController();
    const before = controller.getSnapshot();

    controller.setSlashText('anything');
    const after = controller.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.documentState).toBe(before.documentState);
    expect(after.canonicalDocumentState).toBe(before.canonicalDocumentState);
  });

  it('rebuilds them when the document does change', () => {
    const controller = createController();
    const tooltip = tooltipOf(controller);
    const before = controller.getSnapshot();

    controller.setTooltipStyle(tooltip.id, { surfaceColor: '#654321' });
    const after = controller.getSnapshot();

    expect(after.documentState).not.toBe(before.documentState);
    expect(after.canonicalDocumentState).not.toBe(before.canonicalDocumentState);
    expect(tooltipIn(after.documentState).props.tooltipStyle?.surfaceColor).toBe('#654321');
  });
});

/**
 * The scheme row held its choice in local state and wrote nothing, so a creator
 * picking one moved a pill and repainted no card.
 */
describe('the Style section header', () => {
  it('writes the colour scheme to the experience', async () => {
    const controller = createController();
    const setDocumentAppearance = vi.spyOn(controller, 'setDocumentAppearance');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const snapshot = controller.getSnapshot();
    const step = snapshot.documentState.blocks[0]!;

    await act(async () => {
      root.render(
        createElement(StepStyleHeader, {
          controller,
          snapshot,
          step,
          tooltip: tooltipIn(snapshot.documentState),
        }),
      );
    });

    const scheme = [...host.querySelectorAll<HTMLElement>('.rich-step-choice-field')].find(
      (row) => row.querySelector('.rich-step-field-label')?.textContent === 'Colour scheme',
    );
    expect(scheme).toBeDefined();
    const select = scheme!.querySelector<HTMLSelectElement>('select')!;
    // Only the presets the theme actually names — `surface` and `muted` were invented.
    expect([...select.options].map((option) => option.value)).toEqual([
      'default',
      'accent',
      'inverse',
    ]);

    await act(async () => {
      select.value = 'inverse';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(setDocumentAppearance).toHaveBeenCalledWith(
      expect.objectContaining({ preset: 'inverse' }),
    );
    expect(controller.getSnapshot().documentState.appearance?.preset).toBe('inverse');

    await act(async () => root.unmount());
    host.remove();
  });
});

function tooltipOf(controller: LocalAuthoringFrameController): LodariqBlock {
  return tooltipIn(controller.getSnapshot().documentState);
}

function tooltipIn(document: LodariqDocument): LodariqBlock {
  const step = document.blocks[0]!;
  return step.children.find((child) => child.type === 'tooltip') as LodariqBlock;
}

function createController(): LocalAuthoringFrameController {
  const root = document.createElement('div');
  document.body.append(root);
  const controller = new LocalAuthoringFrameController({
    root,
    baseDocument: stepDocument(),
    services: {
      loadDocument: () => null,
      saveDocument: vi.fn(),
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
    },
    sessionId: 'session_edit_cost',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function stepDocument(): LodariqDocument {
  return {
    id: 'doc_cost',
    workspaceId: 'wk_cost',
    type: 'tour',
    status: 'draft',
    title: 'Cost',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: 'step_cost',
        type: 'tourStep',
        props: { index: 0 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_cost',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'incomplete',
            children: [
              {
                id: 'body_cost',
                type: 'paragraph',
                props: {},
                status: 'ready',
                content: 'Body',
                children: [],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as LodariqDocument;
}
