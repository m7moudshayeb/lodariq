import type { LodariqDocument } from '@lodariq/schema';

export type LocalAuthoringFrameMetricName =
  | 'authoring.opened'
  | 'block.inserted'
  | 'target.pick.started'
  | 'target.pick.succeeded'
  | 'target.pick.failed'
  | 'target.pick.canceled'
  | 'preview.opened'
  | 'document.exported'
  | 'document.imported';

export interface LocalAuthoringFrameMetricEvent {
  sessionId: string;
  documentId: string;
  name: LocalAuthoringFrameMetricName;
}

export interface LocalAuthoringFrameServices {
  loadDocument: (id: string) => LodariqDocument | null;
  saveDocument: (doc: LodariqDocument) => void;
  exportDocument: (doc: LodariqDocument) => string;
  importDocument: (json: string) => LodariqDocument;
  resetDocuments: () => void;
  compilePreview: (doc: LodariqDocument) => Promise<unknown>;
  recordMetric: (event: LocalAuthoringFrameMetricEvent) => void;
  getMetricsSummary: (sessionId: string) => unknown;
  exportMetricsReport: (sessionId: string) => string;
}

export interface LocalAuthoringFrameOptions {
  root: HTMLElement;
  baseDocument: LodariqDocument;
  services: LocalAuthoringFrameServices;
  sessionId?: string;
  peerWindow?: Window;
  allowedOrigins?: string[];
  targetOrigin?: string;
  now?: () => number;
}
