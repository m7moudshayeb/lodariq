// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { mountLocalAuthoringFrame } from '@lodariq/sdk-authoring';

describe('local authoring initial workspace', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverStub {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="authoring"></div>';
  });

  afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens the requested Flow Map and focuses the requested tour step', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;
    const focusBlockId = baseDocument.blocks[0]!.id;

    await mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      initialWorkspace: { kind: 'flowMap', focusBlockId },
      services: {
        loadDocument: () => structuredClone(baseDocument),
        saveDocument: vi.fn(),
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn().mockResolvedValue({}),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
      },
      frameMode: 'panel',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[aria-label="Flow Map"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-flow-map-open="true"]')).not.toBeNull();
    expect(document.querySelector('.tour-flow-node-inspector')?.textContent).toContain(
      'Create your first project',
    );
    expect(document.querySelector('.tour-storyboard')).toBeNull();
  });
});
