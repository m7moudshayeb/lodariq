import { compileDocument } from '@lodariq/compiler';
import {
  LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
  LodariqDocument,
  RENDERER_CONTRACT_VERSION,
  validate,
  type BrandThemeSnapshot,
  type AuthoringDiagnosticAttributes,
  type AuthoringDiagnosticEventName,
  type NewCompiledDocument,
  type LodariqDocument as LodariqDocumentType,
} from '@lodariq/schema';

/**
 * Local development helpers (PRD §9.1, §16.1).
 *
 * Provides local persistence, fixture import/export, and BROWSER-SIDE preview
 * compilation. Browser compilation is preview-only — real publications are
 * always compiled server-side and content-addressed (PRD §9.1, §20).
 */
const STORAGE_PREFIX = 'lodariq:doc:';
const METRICS_PREFIX = 'lodariq:metrics:';

export type LocalMetricName = AuthoringDiagnosticEventName;

export interface LocalMetricEvent {
  sessionId: string;
  documentId: string;
  name: LocalMetricName;
  attributes?: AuthoringDiagnosticAttributes;
  at: number;
}

export interface LocalMetricsSummary {
  sessionId: string;
  documentId: string;
  timeToFirstBlockMs: number | null;
  timeToAttachFirstTargetMs: number | null;
  failedTargetPicks: number;
  previewOpenRate: number;
  cancelRate: number;
}

export interface LocalMetricsReportSession {
  sessionId: string;
  documentId: string | null;
  summary: LocalMetricsSummary | null;
  events: LocalMetricEvent[];
}

export interface LocalMetricsReport {
  exportedAt: string;
  sessions: LocalMetricsReportSession[];
}

export interface ExportLocalMetricsReportOptions {
  sessionId?: string;
  exportedAt?: string;
}

export function saveDocument(doc: LodariqDocumentType): void {
  localStorage.setItem(`${STORAGE_PREFIX}${doc.id}`, JSON.stringify(doc));
}

export function loadDocument(id: string): LodariqDocumentType | null {
  const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as LodariqDocumentType) : null;
}

export function exportDocument(doc: LodariqDocumentType): string {
  return JSON.stringify(doc, null, 2);
}

export function importDocument(json: string): LodariqDocumentType {
  const parsed = JSON.parse(json) as unknown;
  const result = validate(LodariqDocument, parsed);
  if (!result.valid) {
    throw new Error(`Invalid Lodariq document import: ${result.errors[0]?.message}`);
  }
  return result.value;
}

/** Browser-only preview compile. Real publication remains server-side (PRD §20). */
export async function compilePreview(
  doc: LodariqDocumentType,
  theme: BrandThemeSnapshot = LODARIQ_ACCESSIBLE_FALLBACK_THEME_V1,
): Promise<NewCompiledDocument> {
  return compileDocument({
    document: doc,
    theme,
    rendererContractVersion: RENDERER_CONTRACT_VERSION,
  });
}

export function resetLocalDocuments(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  }
}

export function recordLocalMetric(event: Omit<LocalMetricEvent, 'at'> & { at?: number }): void {
  const next: LocalMetricEvent = { ...event, at: event.at ?? Date.now() };
  const events = listLocalMetrics(event.sessionId);
  events.push(next);
  localStorage.setItem(metricKey(event.sessionId), JSON.stringify(events));
}

export function listLocalMetrics(sessionId?: string): LocalMetricEvent[] {
  if (sessionId) return readMetricEvents(metricKey(sessionId));
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(METRICS_PREFIX))
    .flatMap((key) => readMetricEvents(key));
}

export function summarizeLocalMetrics(events: LocalMetricEvent[]): LocalMetricsSummary | null {
  const opened = events.find((event) => event.name === 'authoring.opened');
  if (!opened) return null;
  const firstBlock = events.find((event) => event.name === 'block.inserted');
  const firstTarget = events.find((event) => event.name === 'target.pick.succeeded');
  const targetStarts = events.filter((event) => event.name === 'target.pick.started').length;
  const failedTargetPicks = events.filter((event) => event.name === 'target.pick.failed').length;
  const canceledTargetPicks = events.filter(
    (event) => event.name === 'target.pick.canceled',
  ).length;
  const previewOpened = events.some((event) => event.name === 'preview.opened');

  return {
    sessionId: opened.sessionId,
    documentId: opened.documentId,
    timeToFirstBlockMs: firstBlock ? firstBlock.at - opened.at : null,
    timeToAttachFirstTargetMs: firstTarget ? firstTarget.at - opened.at : null,
    failedTargetPicks,
    previewOpenRate: previewOpened ? 1 : 0,
    cancelRate: targetStarts ? canceledTargetPicks / targetStarts : 0,
  };
}

export function createLocalMetricsReport(
  options: ExportLocalMetricsReportOptions = {},
): LocalMetricsReport {
  const events = listLocalMetrics(options.sessionId);
  const sessions = [...groupMetricEvents(events).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sessionId, sessionEvents]) => {
      const sortedEvents = [...sessionEvents].sort(
        (a, b) => a.at - b.at || a.name.localeCompare(b.name),
      );
      const summary = summarizeLocalMetrics(sortedEvents);
      return {
        sessionId,
        documentId: summary?.documentId ?? sortedEvents[0]?.documentId ?? null,
        summary,
        events: sortedEvents,
      };
    });

  return {
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    sessions,
  };
}

export function exportLocalMetricsReport(options: ExportLocalMetricsReportOptions = {}): string {
  return JSON.stringify(createLocalMetricsReport(options), null, 2);
}

export function resetLocalMetrics(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(METRICS_PREFIX)) localStorage.removeItem(key);
  }
}

function metricKey(sessionId: string): string {
  return `${METRICS_PREFIX}${sessionId}`;
}

function groupMetricEvents(events: LocalMetricEvent[]): Map<string, LocalMetricEvent[]> {
  const grouped = new Map<string, LocalMetricEvent[]>();
  for (const event of events) {
    const sessionEvents = grouped.get(event.sessionId) ?? [];
    sessionEvents.push(event);
    grouped.set(event.sessionId, sessionEvents);
  }
  return grouped;
}

function readMetricEvents(key: string): LocalMetricEvent[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMetricEvent);
  } catch {
    return [];
  }
}

function isMetricEvent(value: unknown): value is LocalMetricEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<LocalMetricEvent>;
  return (
    typeof event.sessionId === 'string' &&
    typeof event.documentId === 'string' &&
    typeof event.name === 'string' &&
    typeof event.at === 'number'
  );
}
