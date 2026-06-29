import type { TalmehDocument } from '@talmeh/schema';

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
  loadDocument: (id: string) => TalmehDocument | null;
  saveDocument: (doc: TalmehDocument) => void;
  exportDocument: (doc: TalmehDocument) => string;
  importDocument: (json: string) => TalmehDocument;
  resetDocuments: () => void;
  compilePreview: (doc: TalmehDocument) => Promise<unknown>;
  recordMetric: (event: LocalAuthoringFrameMetricEvent) => void;
  getMetricsSummary: (sessionId: string) => unknown;
  exportMetricsReport: (sessionId: string) => string;
}

export interface LocalAuthoringFrameOptions {
  root: HTMLElement;
  baseDocument: TalmehDocument;
  services: LocalAuthoringFrameServices;
  sessionId?: string;
  peerWindow?: Window;
  allowedOrigins?: string[];
  targetOrigin?: string;
  now?: () => number;
}
