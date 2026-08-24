// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { LodariqBlock, LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import {
  focusableWithin,
  OverlayStepInspector,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/components/overlay-step-inspector';
import { solveInspector } from '../../../../../packages/sdk-authoring/src/authoring/overlay/solver';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('inspector focus behaviour (§9.1)', () => {
  it('opens focus on the first section and restores it to the opener on close', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { root, host, onClose } = await mount();

    expect(document.activeElement?.tagName).toBe('SUMMARY');

    await act(async () => root.unmount());
    expect(document.activeElement).toBe(opener);
    expect(onClose).not.toHaveBeenCalled();
    host.remove();
  });

  it('dismisses on Escape', async () => {
    const { root, host, onClose } = await mount();
    const panel = host.querySelector<HTMLElement>('.overlay-step-inspector-panel')!;

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    host.remove();
  });

  it('cycles Tab within the popover rather than letting focus escape', async () => {
    const { root, host } = await mount();
    const panel = host.querySelector<HTMLElement>('.overlay-step-inspector-panel')!;
    const stops = focusableWithin(panel);
    expect(stops.length).toBeGreaterThan(1);
    const first = stops[0]!;
    const last = stops[stops.length - 1]!;

    last.focus();
    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => {
      panel.dispatchEvent(forward);
    });
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      panel.dispatchEvent(backward);
    });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    await act(async () => root.unmount());
    host.remove();
  });

  it('does not re-open on a re-render, so an edit keeps the creator where they were', async () => {
    const { root, host, rerender } = await mount();
    const panel = host.querySelector<HTMLElement>('.overlay-step-inspector-panel')!;
    const stops = focusableWithin(panel);
    const chosen = stops[stops.length - 1]!;
    chosen.focus();
    const body = host.querySelector<HTMLElement>('.overlay-step-inspector-body')!;
    body.scrollTop = 120;

    /*
     * The caller writes `onClose` inline, so every snapshot hands this component
     * a new function. As a dependency of the focus trap it tore the trap down
     * and set it up again on each one — focus to the opener, then back to the
     * first section, which took the creator's scroll position with it. One edit
     * is one of these.
     */
    await rerender();

    expect(document.activeElement).toBe(chosen);
    expect(body.scrollTop).toBe(120);

    await act(async () => root.unmount());
    host.remove();
  });

  it('still closes on Escape after re-rendering, so the latest handler is the one called', async () => {
    const { root, host, onClose, rerender } = await mount();
    await rerender();
    const panel = host.querySelector<HTMLElement>('.overlay-step-inspector-panel')!;

    await act(async () => {
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.unmount());
    host.remove();
  });

  it('leaves an unrelated Tab alone, so the trap is a cycle and not a cage', async () => {
    const { root, host } = await mount();
    const panel = host.querySelector<HTMLElement>('.overlay-step-inspector-panel')!;
    const stops = focusableWithin(panel);
    stops[0]!.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => {
      panel.dispatchEvent(event);
    });
    // Mid-list Tab is the browser's job; the trap only closes the loop at the ends.
    expect(event.defaultPrevented).toBe(false);

    await act(async () => root.unmount());
    host.remove();
  });
});

describe('inspector anchoring falls back to a corner (§4.3)', () => {
  it('takes the preferred side when it fits', () => {
    const solution = solveInspector(
      { left: 40, top: 40, width: 360, height: 300 },
      { width: 1_280, height: 800 },
      400,
    );
    expect(solution.anchor).toBe('right');
    expect(solution.needsLeader).toBe(false);
  });

  it('flips to the other side rather than hanging off the edge', () => {
    const solution = solveInspector(
      { left: 900, top: 40, width: 360, height: 300 },
      { width: 1_280, height: 800 },
      400,
    );
    expect(solution.anchor).toBe('left');
  });

  it('corners with a leader line when neither side fits', () => {
    const solution = solveInspector(
      { left: 8, top: 40, width: 360, height: 300 },
      { width: 420, height: 800 },
      400,
    );
    expect(solution.anchor).toBe('corner');
    expect(solution.needsLeader).toBe(true);
  });
});

async function mount(): Promise<{
  root: ReturnType<typeof createRoot>;
  host: HTMLElement;
  onClose: ReturnType<typeof vi.fn>;
  /** Renders again the way a snapshot does: same content, a fresh `onClose`. */
  rerender: () => Promise<void>;
}> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onClose = vi.fn();
  const controller = createController();
  const snapshot = controller.getSnapshot();
  const step = snapshot.documentState.blocks[0]!;
  const tooltip = step.children.find((child) => child.type === 'tooltip') as LodariqBlock;
  const render = async (close: () => void): Promise<void> => {
    await act(async () => {
      root.render(
        createElement(OverlayStepInspector, {
          controller,
          onClose: close,
          popupThemeColors: {
            borderColor: '#d1d5db',
            surfaceColor: '#ffffff',
            textColor: '#111827',
          },
          snapshot,
          step,
          stepIndex: 0,
          tooltip,
        }),
      );
    });
  };

  await render(onClose);
  return { root, host, onClose, rerender: () => render(() => onClose()) };
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
    sessionId: 'session_focus_trap',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function stepDocument(): LodariqDocument {
  return {
    id: 'doc_focus',
    workspaceId: 'wk_focus',
    type: 'tour',
    status: 'draft',
    title: 'Focus',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: 'step_focus',
        type: 'tourStep',
        props: { index: 0 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_focus',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'incomplete',
            children: [
              {
                id: 'body_focus',
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
  };
}
