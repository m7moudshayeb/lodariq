import type { BrandThemeSnapshot, LodariqDocument } from '@lodariq/schema';
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
  previewTheme?: BrandThemeSnapshot;
  frameMode?: 'standalone' | 'panel';
  sessionId?: string;
  targetOrigin?: string;
  peerWindow?: Window;
  now?: () => number;
  services?: Partial<LocalAuthoringFrameServices>;
}

export async function mountLocalAuthoringDevFrame(
  options: MountLocalAuthoringDevFrameOptions,
): Promise<void> {
  const services = createLocalAuthoringDevFrameServices(options.services);
  const frameContext = localFrameContextFromLocation(options.root.ownerDocument.defaultView);
  let contextDocument: LodariqDocument | null = null;
  if (frameContext.documentId === options.baseDocument.id) {
    contextDocument = options.baseDocument;
  } else if (frameContext.documentId) {
    contextDocument = services.loadDocument(frameContext.documentId);
  }
  if (frameContext.documentId && !contextDocument) {
    throw new Error(`Lodariq local authoring document not found: ${frameContext.documentId}`);
  }
  await mountLocalAuthoringFrame({
    root: options.root,
    baseDocument: contextDocument ?? options.baseDocument,
    ...(options.previewTheme ? { previewTheme: structuredClone(options.previewTheme) } : {}),
    frameMode: options.frameMode ?? frameModeFromLocation(options.root.ownerDocument.defaultView),
    sessionId: options.sessionId ?? frameContext.sessionId ?? LOCAL_AUTHORING_SESSION_ID,
    targetOrigin: options.targetOrigin,
    peerWindow: options.peerWindow,
    now: options.now,
    services,
  });
}

interface LocalFrameContext {
  documentId: string | null;
  sessionId: string | null;
}

function localFrameContextFromLocation(view: Window | null): LocalFrameContext {
  if (!view) return { documentId: null, sessionId: null };
  try {
    const params = new URLSearchParams(view.location.search);
    return {
      documentId: nonEmptyParam(params.get('lodariqDocument')),
      sessionId: nonEmptyParam(params.get('lodariqSession')),
    };
  } catch {
    return { documentId: null, sessionId: null };
  }
}

function nonEmptyParam(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function frameModeFromLocation(view: Window | null): 'standalone' | 'panel' {
  if (!view) return 'standalone';
  try {
    return new URLSearchParams(view.location.search).get('lodariqFrame') === 'panel'
      ? 'panel'
      : 'standalone';
  } catch {
    return 'standalone';
  }
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
