import type { AnalyticsEvent } from '@talmeh/schema';
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
  /** Where batched analytics are flushed. Omitted in local-dev. */
  ingestUrl?: string;
}

export class TalmehRuntime {
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
    this.queue.push({
      name,
      sdkVersion: SDK_VERSION,
      timestamp: new Date().toISOString(),
      ...(props ? { props } : {}),
    });
  }

  /** Flush queued events. Uses sendBeacon on page exit (PRD §9.3). */
  flush(onExit = false): void {
    if (this.queue.length === 0 || !this.config.ingestUrl) return;
    const batch = this.queue.splice(0, this.queue.length);
    const payload = JSON.stringify({ workspaceId: this.config.workspaceId, events: batch });

    if (onExit && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(this.config.ingestUrl, payload);
      return;
    }
    void fetch(this.config.ingestUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* swallow: analytics must never break the host app */
    });
  }

  getTraits(): IdentifyTraits | null {
    return this.traits;
  }
}
