import type { AnalyticsEvent } from '@lodariq/schema';
import { SDK_VERSION } from '../version';

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

const MAX_ERROR_MESSAGE_LENGTH = 240;

export class LodariqRuntime {
  private traits: IdentifyTraits | null = null;
  private readonly queue: AnalyticsEvent[] = [];

  constructor(private readonly config: RuntimeConfig) {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush(true));
    }
  }

  identify(traits: IdentifyTraits): void {
    this.traits = traits;
  }

  track(name: string, props?: Record<string, unknown>): void {
    const correlationId = this.config.correlationId;
    this.queue.push({
      name,
      sdkVersion: SDK_VERSION,
      timestamp: new Date().toISOString(),
      ...(correlationId ? { correlationId } : {}),
      ...(props ? { props } : {}),
    });
    this.emitObservability(`runtime.${name}`, {
      ...(correlationId ? { correlationId } : {}),
      ...(props?.['documentId'] && typeof props['documentId'] === 'string'
        ? { documentId: props['documentId'] }
        : {}),
      attributes: props,
    });
  }

  reportError(error: unknown, context: RuntimeErrorContext = {}): void {
    const normalized = normalizeRuntimeError(error);
    const correlationId = context.correlationId ?? this.config.correlationId;
    this.queue.push({
      name: 'sdk_error',
      sdkVersion: SDK_VERSION,
      timestamp: new Date().toISOString(),
      ...(context.documentId ? { documentId: context.documentId } : {}),
      ...(context.stepId ? { stepId: context.stepId } : {}),
      ...(correlationId ? { correlationId } : {}),
      props: {
        phase: context.phase ?? 'runtime',
        errorName: normalized.name,
        message: normalized.message,
      },
    });
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

    if (
      onExit &&
      !this.config.authorizationToken &&
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
