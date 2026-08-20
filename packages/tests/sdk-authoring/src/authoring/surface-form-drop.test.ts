// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentType, LodariqDocument } from '@lodariq/schema';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';

describe('dropping the card decides the form (§5)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  it('turns an announcement into a banner at the top edge and a modal in the middle', () => {
    const controller = createController('announcement');

    controller.setSurfaceFormFromDrop({ xRatio: 0.5, yRatio: 0.04 });
    expect(controller.getSnapshot().documentState.surfaceForm).toBe('banner');
    expect(controller.getSnapshot().status).toContain('banner');

    controller.setSurfaceFormFromDrop({ xRatio: 0.5, yRatio: 0.5 });
    expect(controller.getSnapshot().documentState.surfaceForm).toBe('modal');
  });

  it('turns a checklist into a drawer at an edge and a floating panel in the middle', () => {
    const controller = createController('checklist');

    controller.setSurfaceFormFromDrop({ xRatio: 0.97, yRatio: 0.5 });
    expect(controller.getSnapshot().documentState.surfaceForm).toBe('drawer');

    controller.setSurfaceFormFromDrop({ xRatio: 0.5, yRatio: 0.5 });
    expect(controller.getSnapshot().documentState.surfaceForm).toBe('floating');
  });

  it('ignores the drop for a type that does not answer the gesture', () => {
    const controller = createController('tour');
    controller.setSurfaceFormFromDrop({ xRatio: 0.5, yRatio: 0.02 });
    expect(controller.getSnapshot().documentState.surfaceForm).toBeUndefined();
  });

  it('does not write when the form is already what the drop implies', () => {
    const saveDocument = vi.fn();
    const controller = createController('announcement', saveDocument);

    controller.setSurfaceFormFromDrop({ xRatio: 0.5, yRatio: 0.04 });
    const writes = saveDocument.mock.calls.length;
    controller.setSurfaceFormFromDrop({ xRatio: 0.5, yRatio: 0.02 });

    expect(saveDocument.mock.calls.length).toBe(writes);
  });
});

function createController(
  type: DocumentType,
  saveDocument = vi.fn(),
): LocalAuthoringFrameController {
  const controller = new LocalAuthoringFrameController({
    root: document.getElementById('authoring')!,
    baseDocument: {
      id: 'doc_form',
      workspaceId: 'wk_form',
      type,
      status: 'draft',
      title: 'Form',
      trigger: { type: 'manual' },
      audience: { environments: ['development'] },
      schemaVersion: '1.0.0',
      targets: [],
      blocks: [],
    },
    services: {
      loadDocument: () => null,
      saveDocument,
      exportDocument: (value) => JSON.stringify(value),
      importDocument: (value) => JSON.parse(value) as LodariqDocument,
      resetDocuments: vi.fn(),
      compilePreview: vi.fn().mockResolvedValue({}),
      recordMetric: vi.fn(),
      getMetricsSummary: () => ({}),
      exportMetricsReport: () => '{}',
    },
    sessionId: 'session_form',
    peerWindow: window,
  });
  controller.start();
  return controller;
}
