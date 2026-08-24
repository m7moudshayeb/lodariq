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
    expect(document.querySelector('.tour-flow-node-inspector')?.textContent).toContain(
      'Create your first project',
    );
    expect(document.querySelector('.tour-storyboard')).toBeNull();
  });

  it('consumes a review deep link once and allows the creator to close it', async () => {
    const baseDocument = structuredClone(tourFixture) as LodariqDocument;

    await mountLocalAuthoringFrame({
      root: document.getElementById('authoring')!,
      baseDocument,
      initialWorkspace: { kind: 'reviewRecovery', focusBlockId: baseDocument.blocks[0]!.id },
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

    await vi.waitFor(() => expect(document.querySelector('.tour-review-workspace')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('.operations-hub-close')?.click();
    await vi.waitFor(() => expect(document.querySelector('.operations-hub')).toBeNull());
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(document.querySelector('.operations-hub')).toBeNull();
  });
});
