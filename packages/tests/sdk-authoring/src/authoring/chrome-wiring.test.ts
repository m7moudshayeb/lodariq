// @vitest-environment jsdom
/**
 * The chrome rows that were drawn, were clickable, and reached nothing.
 *
 * Canvas zoom wrote a field no snapshot carried, so the mode pill's three zoom
 * rows moved nothing at all while a second zoom — local state inside the
 * storyboard — did the visible work. Recording set a flag nothing read, so one
 * step was appended and the pill went on saying "Recording".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import {
  CANVAS_ZOOM_LIMITS,
  DEFAULT_CANVAS_ZOOM,
  nearestCanvasZoomIndex,
  steppedCanvasZoom,
} from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/canvas-zoom';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the canvas zoom ladder', () => {
  it('steps in tens between 60 and 120, and stops at both ends', () => {
    expect(steppedCanvasZoom(DEFAULT_CANVAS_ZOOM, 'in')).toBe(90);
    expect(steppedCanvasZoom(DEFAULT_CANVAS_ZOOM, 'out')).toBe(70);
    expect(steppedCanvasZoom(CANVAS_ZOOM_LIMITS.max, 'in')).toBe(CANVAS_ZOOM_LIMITS.max);
    expect(steppedCanvasZoom(CANVAS_ZOOM_LIMITS.min, 'out')).toBe(CANVAS_ZOOM_LIMITS.min);
    expect(steppedCanvasZoom(115, 'reset')).toBe(DEFAULT_CANVAS_ZOOM);
  });

  /**
   * `findIndex` returned -1 for anything off the ladder, and -1 - 1 clamped to
   * 0 while -1 + 1 landed on the first rung — so "zoom out" from an off-ladder
   * percent jumped to the smallest and "zoom in" barely moved.
   */
  it('snaps a percent that is not on a rung to the nearest one', () => {
    expect(nearestCanvasZoomIndex(103)).toBe(nearestCanvasZoomIndex(100));
    expect(steppedCanvasZoom(103, 'in')).toBe(110);
    expect(steppedCanvasZoom(103, 'out')).toBe(90);
  });
});

describe('canvas zoom reaches the canvas', () => {
  it('publishes the percent on the snapshot, which nothing used to carry', () => {
    const controller = createController();
    expect(controller.getSnapshot().canvasZoomPercent).toBe(DEFAULT_CANVAS_ZOOM);

    controller.zoomCanvas('in');

    expect(controller.getSnapshot().canvasZoomPercent).toBe(90);
    expect(controller.getSnapshot().status).toBe('Canvas at 90%.');
  });

  it('is one value for both surfaces, whichever of the two moved it', () => {
    const controller = createController();

    // The storyboard's own control writes here…
    controller.setCanvasZoom(110);
    expect(controller.getSnapshot().canvasZoomPercent).toBe(110);

    // …and the mode pill's rows continue from where it left off.
    controller.zoomCanvas('out');
    expect(controller.getSnapshot().canvasZoomPercent).toBe(100);
  });

  it('emits once per click, not twice', () => {
    const controller = createController();
    let emits = 0;
    controller.subscribe(() => (emits += 1));

    controller.zoomCanvas('in');

    expect(emits).toBe(1);
  });

  it('says nothing and emits nothing when the value cannot move', () => {
    const controller = createController();
    controller.setCanvasZoom(CANVAS_ZOOM_LIMITS.max);
    let emits = 0;
    controller.subscribe(() => (emits += 1));

    controller.zoomCanvas('in');

    expect(emits).toBe(0);
    expect(controller.getSnapshot().canvasZoomPercent).toBe(CANVAS_ZOOM_LIMITS.max);
  });
});

describe('recording steps', () => {
  it('is on the snapshot, so a surface can tell a live run from a finished one', () => {
    const controller = createController();
    expect(controller.getSnapshot().recordingSteps).toBe(false);

    controller.toggleStepRecording();
    expect(controller.getSnapshot().recordingSteps).toBe(true);
    expect(controller.getSnapshot().status).toBe(
      'Recording. Every click you make on the product becomes a step.',
    );

    controller.toggleStepRecording();
    expect(controller.getSnapshot().recordingSteps).toBe(false);
    expect(controller.getSnapshot().status).toBe('Recording stopped.');
  });

  /**
   * Starting a run appends the first step. Without the pick-completed half, that
   * was the only step a "recording" ever produced.
   */
  it('appends a step when the run starts', () => {
    const controller = createController();
    const before = controller.getSnapshot().documentState.blocks.length;

    controller.toggleStepRecording();

    expect(controller.getSnapshot().documentState.blocks.length).toBe(before + 1);
  });
});

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
    sessionId: 'session_chrome_wiring',
    peerWindow: window,
  });
  controller.start();
  return controller;
}

function stepDocument(): LodariqDocument {
  return {
    id: 'doc_chrome',
    workspaceId: 'wk_chrome',
    type: 'tour',
    status: 'draft',
    title: 'Chrome',
    trigger: { type: 'manual' },
    audience: { environments: ['development'] },
    schemaVersion: '1.0.0',
    targets: [],
    blocks: [
      {
        id: 'step_chrome',
        type: 'tourStep',
        props: { index: 0 },
        status: 'incomplete',
        children: [
          {
            id: 'tooltip_chrome',
            type: 'tooltip',
            props: { placement: 'bottom' },
            status: 'incomplete',
            children: [
              {
                id: 'body_chrome',
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
