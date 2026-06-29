import type { LodariqDocument } from '@lodariq/schema';
import {
  compilePreview,
  exportDocument,
  exportLocalMetricsReport,
  importDocument,
  listLocalMetrics,
  loadDocument,
  recordLocalMetric,
  resetLocalDocuments,
  saveDocument,
  summarizeLocalMetrics,
} from '@lodariq/sdk-runtime/lodariq-local-dev';
import { LOCAL_AUTHORING_SESSION_ID } from '../authoring/constants';
import {
  mountLocalAuthoringFrame,
  type LocalAuthoringFrameServices,
} from '../authoring/local-frame';

export interface MountLocalAuthoringDevFrameOptions {
  root: HTMLElement;
  baseDocument: LodariqDocument;
  sessionId?: string;
  targetOrigin?: string;
  peerWindow?: Window;
  now?: () => number;
  services?: Partial<LocalAuthoringFrameServices>;
}

export function mountLocalAuthoringDevFrame(options: MountLocalAuthoringDevFrameOptions): void {
  mountLocalAuthoringFrame({
    root: options.root,
    baseDocument: options.baseDocument,
    sessionId: options.sessionId ?? LOCAL_AUTHORING_SESSION_ID,
    targetOrigin: options.targetOrigin,
    peerWindow: options.peerWindow,
    now: options.now,
    services: createLocalAuthoringDevFrameServices(options.services),
  });
}

function createLocalAuthoringDevFrameServices(
  overrides: Partial<LocalAuthoringFrameServices> = {},
): LocalAuthoringFrameServices {
  return {
    loadDocument,
    saveDocument,
    exportDocument,
    importDocument,
    resetDocuments: resetLocalDocuments,
    compilePreview,
    recordMetric: recordLocalMetric,
    getMetricsSummary: (sessionId) => summarizeLocalMetrics(listLocalMetrics(sessionId)),
    exportMetricsReport: (sessionId) => exportLocalMetricsReport({ sessionId }),
    ...overrides,
  };
}
