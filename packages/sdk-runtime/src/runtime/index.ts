import type {
  AnalyticsEvent,
  CompiledDocument,
  ManifestPointer,
  SdkAnalyticsEvent,
} from '@lodariq/schema';
import { SDK_VERSION } from '../version';
import { createRuntimeAnalyticsEvent, type RuntimeAnalyticsDocumentPointer } from './analytics';
import { activeContentLocale, clearActiveContentLocale } from './content-locale-state';

export type { RuntimeAnalyticsDocumentPointer } from './analytics';

/**
 * Production runtime/player surface (PRD §9.3).
 *
 * Exposes identify/track, batches analytics over HTTP + sendBeacon (never
 * WebSockets, PRD §11.1), and owns playback lifecycle. Framework-free.
 */

export interface IdentifyTraits {
  userId: string;
  email?: string;
  [key: string]: unknown;
}

export interface RuntimeConfig {
  workspaceId: string;
  environment: 'development' | 'staging' | 'production';
  /** Publication or authoring-session trace key propagated into emitted events. */
  correlationId?: string;
  observability?: RuntimeObservabilitySink;
  /** Where batched analytics are flushed. Omitted in local-dev. */
  ingestUrl?: string;
  /** Public environment token used only for SDK ingestion endpoints. */
  authorizationToken?: string;
  /** Revocable public installation identity used by the permanent SDK path. */
  publicInstallationId?: string;
  /** Active document pointers used only as untrusted ingestion assertions. */
  analyticsPointers?: readonly RuntimeAnalyticsDocumentPointer[];
}

export interface RuntimeObservabilityEvent {
  name: string;
  timestamp: string;
  correlationId?: string;
  documentId?: string;
  stepId?: string;
  attributes?: Record<string, unknown>;
}

export interface RuntimeObservabilitySink {
  emit(event: RuntimeObservabilityEvent): void;
}

export interface RuntimeErrorContext {
  phase?: 'authoring' | 'playback' | 'resume' | 'runtime';
  documentId?: string;
  stepId?: string;
  correlationId?: string;
}

/** Bounded resolver fields accepted by the runtime telemetry adapter. */
export interface RuntimeTargetResolutionDiagnostic {
  state: string;
  confidence: number;
  candidateCount: number;
  reasonCode: string;
  evidenceFamilies: readonly string[];
  currentLocale: string | null;
}

const MAX_ERROR_MESSAGE_LENGTH = 240;
const TOUR_RESUME_PREFIX = 'lodariq:tour-resume:';
const TOUR_RESUME_MAX_AGE_MS = 30 * 60 * 1000;

interface TourResumeState {
  documentId: string;
  manifestVersion: string;
  contentHash: string;
  stepId: string;
  updatedAt: number;
}

export class LodariqRuntime {
  private traits: IdentifyTraits | null = null;
  private readonly queue: Array<SdkAnalyticsEvent | AnalyticsEvent> = [];
  private readonly analyticsPointers = new Map<string, RuntimeAnalyticsDocumentPointer>();

  constructor(private readonly config: RuntimeConfig) {
    for (const pointer of config.analyticsPointers ?? []) this.registerAnalyticsPointer(pointer);
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush(true));
    }
  }

  identify(traits: IdentifyTraits): void {
    this.traits = traits;
  }

  track(name: string, props?: Record<string, unknown>): void {
    const correlationId = this.config.correlationId;
    const requestedDocumentId =
      typeof props?.['documentId'] === 'string' ? props['documentId'].trim() : undefined;
    const pointer = this.resolveAnalyticsPointer(requestedDocumentId);
    const contentLocale = name.startsWith('tour_') ? activeContentLocale() : null;
    const event = createRuntimeAnalyticsEvent({
      name,
      sdkVersion: SDK_VERSION,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
      ...(pointer ? { documentId: pointer.documentId, pointer } : {}),
      ...(props || contentLocale
        ? { props: { ...props, ...(contentLocale ? { locale: contentLocale } : {}) } }
        : {}),
    });
    if (this.config.ingestUrl) this.queue.push(event);
    this.emitObservability(`runtime.${name}`, {
      ...(correlationId ? { correlationId } : {}),
      ...(requestedDocumentId ? { documentId: requestedDocumentId } : {}),
      ...(event.stepId ? { stepId: event.stepId } : {}),
      ...(event.props ? { attributes: event.props } : {}),
    });
  }

  /**
   * Registers a server-issued active pointer without trusting it as identity.
   * Lower generations and conflicting same-generation updates are ignored so
   * a late playback request cannot regress the assertion used for new events.
   */
  registerAnalyticsPointer(pointer: RuntimeAnalyticsDocumentPointer): void {
    const existing = this.analyticsPointers.get(pointer.documentId);
    if (existing && existing.generation > pointer.generation) return;
    if (
      existing &&
      existing.generation === pointer.generation &&
      (existing.publicationId !== pointer.publicationId ||
        existing.contentHash !== pointer.contentHash)
    ) {
      return;
    }
    this.analyticsPointers.set(pointer.documentId, { ...pointer });
  }

  trackTargetResolution(
    documentId: string,
    stepId: string,
    targetId: string | undefined,
    result: RuntimeTargetResolutionDiagnostic,
  ): void {
    this.track('target_resolution', {
      documentId,
      stepId,
      ...(targetId ? { targetId } : {}),
      result: result.state,
      reasonCode: result.reasonCode,
      evidenceFamilies: result.evidenceFamilies,
      scoreBucket: targetScoreBucket(result.confidence),
      candidateCountBucket: targetCandidateCountBucket(result.candidateCount),
      ...(result.currentLocale ? { locale: result.currentLocale } : {}),
    });
  }

  readTourResume(manifest: ManifestPointer): TourResumeState | null {
    try {
      const raw = sessionStorage.getItem(this.tourResumeKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<TourResumeState>;
      const fresh =
        typeof parsed.updatedAt === 'number' &&
        Date.now() - parsed.updatedAt <= TOUR_RESUME_MAX_AGE_MS;
      if (
        fresh &&
        parsed.documentId === manifest.documentId &&
        parsed.manifestVersion === manifest.currentVersion &&
        typeof parsed.contentHash === 'string' &&
        typeof parsed.stepId === 'string'
      ) {
        return parsed as TourResumeState;
      }
      this.clearTourResume();
    } catch {
      this.clearTourResume();
    }
    return null;
  }

  writeTourResume(
    manifest: ManifestPointer,
    document: CompiledDocument,
    step: CompiledDocument['steps'][number],
  ): void {
    try {
      sessionStorage.setItem(
        this.tourResumeKey(),
        JSON.stringify({
          documentId: document.documentId,
          manifestVersion: manifest.currentVersion,
          contentHash: document.contentHash,
          stepId: step.id,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      /* Tour resume is best-effort and must never break the host app. */
    }
  }

  clearTourResume(): void {
    try {
      sessionStorage.removeItem(this.tourResumeKey());
    } catch {
      /* Ignore unavailable storage. */
    }
  }

  endTour(eventName: string, documentId: string): void {
    this.clearTourResume();
    this.track(eventName, { documentId });
    clearActiveContentLocale();
  }

  canResumeTour(resume: TourResumeState, tour: CompiledDocument): boolean {
    return (
      resume.documentId === tour.documentId &&
      resume.contentHash === tour.contentHash &&
      tour.steps.some((step) => step.id === resume.stepId)
    );
  }

  reportError(error: unknown, context: RuntimeErrorContext = {}): void {
    const normalized = normalizeRuntimeError(error);
    const correlationId = context.correlationId ?? this.config.correlationId;
    const pointer = this.resolveAnalyticsPointer(context.documentId);
    if (this.config.ingestUrl) {
      this.queue.push(
        createRuntimeAnalyticsEvent({
          name: 'sdk_error',
          sdkVersion: SDK_VERSION,
          timestamp: new Date().toISOString(),
          ...(context.documentId ? { documentId: context.documentId } : {}),
          ...(context.stepId ? { stepId: context.stepId } : {}),
          ...(correlationId ? { correlationId } : {}),
          ...(pointer ? { pointer } : {}),
          props: {
            phase: context.phase ?? 'runtime',
            errorName: normalized.name,
            message: normalized.message,
          },
        }),
      );
    }
    this.emitObservability('runtime.sdk_error', {
      ...(correlationId ? { correlationId } : {}),
      ...(context.documentId ? { documentId: context.documentId } : {}),
      ...(context.stepId ? { stepId: context.stepId } : {}),
      attributes: {
        phase: context.phase ?? 'runtime',
        errorName: normalized.name,
        message: normalized.message,
      },
    });
    this.flush();
  }

  /** Flush queued events. Uses sendBeacon on page exit (PRD §9.3). */
  flush(onExit = false): void {
    if (this.queue.length === 0 || !this.config.ingestUrl) return;
    const batch = this.queue.splice(0, this.queue.length);
    const payload = JSON.stringify({ events: batch });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.config.authorizationToken) {
      headers['authorization'] = `Bearer ${this.config.authorizationToken}`;
    }
    if (this.config.publicInstallationId) {
      headers['x-lodariq-installation-id'] = this.config.publicInstallationId;
    }

    if (
      onExit &&
      !this.config.authorizationToken &&
      !this.config.publicInstallationId &&
      typeof navigator !== 'undefined' &&
      'sendBeacon' in navigator
    ) {
      navigator.sendBeacon(this.config.ingestUrl, payload);
      return;
    }
    void fetch(this.config.ingestUrl, {
      method: 'POST',
      headers,
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* swallow: analytics must never break the host app */
    });
  }

  getTraits(): IdentifyTraits | null {
    return this.traits;
  }

  private emitObservability(
    name: string,
    event: Omit<RuntimeObservabilityEvent, 'name' | 'timestamp'>,
  ): void {
    this.config.observability?.emit({
      name,
      timestamp: new Date().toISOString(),
      ...event,
    });
  }

  private tourResumeKey(): string {
    return `${TOUR_RESUME_PREFIX}${this.config.workspaceId}:${this.config.environment}`;
  }

  private resolveAnalyticsPointer(
    requestedDocumentId: string | undefined,
  ): RuntimeAnalyticsDocumentPointer | undefined {
    if (requestedDocumentId) return this.analyticsPointers.get(requestedDocumentId);
    return this.analyticsPointers.values().next().value;
  }
}

function normalizeRuntimeError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: sanitizeErrorName(error.name),
      message: sanitizeErrorMessage(error.message),
    };
  }
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: sanitizeErrorMessage(error),
    };
  }
  return {
    name: 'Error',
    message: 'Unknown SDK error',
  };
}

function sanitizeErrorName(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_. -]/g, '').trim();
  return safe ? safe.slice(0, 80) : 'Error';
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/[^\s"'<>]+/g, sanitizeUrl)
    .replace(/lod_(?:development|staging|production|authoring)_[a-zA-Z0-9_-]+/g, 'lod_<redacted>')
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, '<email>')
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.length > 120 ? `${url.pathname.slice(0, 120)}...` : url.pathname;
    return `${url.origin}${path}`;
  } catch {
    return '<url>';
  }
}

function targetScoreBucket(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 90) return 'high';
  if (confidence >= 55) return 'medium';
  return 'low';
}

function targetCandidateCountBucket(candidateCount: number): 'zero' | 'one' | 'many' {
  if (candidateCount <= 0) return 'zero';
  if (candidateCount === 1) return 'one';
  return 'many';
}
