// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringOperationsServices } from '@lodariq/sdk-authoring';
import type { LodariqDocument } from '@lodariq/schema';
import tourFixture from '@lodariq/schema/fixtures/tour.linear.v1.json';
import { LocalAuthoringFrameController } from '../../../../../packages/sdk-authoring/src/authoring/local-frame-ui/controller';
import { LOCAL_AUTHORING_SESSION_ID } from '../../../../../packages/sdk-authoring/src/authoring/constants';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('step lock lease lifecycle', () => {
  it('renews the selected step and releases it when the frame closes', async () => {
    vi.useFakeTimers();
    const documentState = structuredClone(tourFixture) as LodariqDocument;
    const second = structuredClone(documentState.blocks[0]!);
    second.id = 'block_step_2';
    second.props = { ...second.props, index: 1 };
    documentState.blocks.push(second);
    const claimStepLock = vi.fn(async (stepId: string) => ({
      lock: {
        stepId,
        holderName: 'Ada Lovelace',
        holderUserId: 'user_ada',
        expiresAt: '2099-01-01T00:03:00.000Z',
      },
      acquired: true,
      canTakeover: true,
    }));
    const releaseStepLock = vi.fn(async () => {});
    const operations = operationsServices({ claimStepLock, releaseStepLock });
    const controller = new LocalAuthoringFrameController({
      root: document.body,
      baseDocument: documentState,
      services: {
        loadDocument: () => structuredClone(documentState),
        saveDocument: vi.fn(),
        exportDocument: (value) => JSON.stringify(value),
        importDocument: (value) => JSON.parse(value) as LodariqDocument,
        resetDocuments: vi.fn(),
        compilePreview: vi.fn(),
        recordMetric: vi.fn(),
        getMetricsSummary: vi.fn(() => ({})),
        exportMetricsReport: vi.fn(() => '{}'),
        operations,
      },
      frameMode: 'panel',
      sessionId: LOCAL_AUTHORING_SESSION_ID,
      peerWindow: window,
      allowedOrigins: [window.location.origin],
      targetOrigin: window.location.origin,
    });

    controller.selectBlock('block_step_2');
    await flushPromises();
    expect(claimStepLock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90_000);
    await flushPromises();
    expect(claimStepLock).toHaveBeenCalledTimes(2);

    controller.destroy();
    expect(releaseStepLock).toHaveBeenCalledWith('block_step_2');
  });
});

function operationsServices(
  overrides: Pick<AuthoringOperationsServices, 'claimStepLock' | 'releaseStepLock'>,
): AuthoringOperationsServices {
  return {
    readMeasurement: async () => ({
      documentId: 'doc_tour_linear',
      adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
    }),
    updateMeasurement: async () => ({
      documentId: 'doc_tour_linear',
      adaptivePolicy: { enabled: false, minimumOccurrences: 2, lookbackDays: 30 },
    }),
    readAnalytics: async () => ({
      documentId: 'doc_tour_linear',
      environmentId: 'env_staging',
      shown: 0,
      completed: 0,
      dismissed: 0,
      funnel: [],
      adoption: [],
      formResponses: [],
    }),
    readExperiment: async () => ({ experiment: null, results: null }),
    createExperiment: async () => Promise.reject(new Error('not used')),
    updateExperiment: async () => Promise.reject(new Error('not used')),
    listComments: async () => [],
    addComment: async () => Promise.reject(new Error('not used')),
    replyToComment: async () => Promise.reject(new Error('not used')),
    resolveComment: async () => Promise.reject(new Error('not used')),
    listStepLocks: async () => [],
    listApplications: async () => [],
    ...overrides,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
