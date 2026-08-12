import type { RuntimeLifecycleHints } from '@lodariq/schema';
import { resolve } from '../resolver';
import { TourPresentationCanceledError, throwIfTourPresentationCanceled } from './tour-errors';

const NETWORK_IDLE_QUIET_MS = 80;
const NETWORK_IDLE_POLL_MS = 20;

export function routeMatches(expectedRoute: string): boolean {
  return `${location.pathname}${location.search}${location.hash}` === expectedRoute;
}

export function scrollBlockFor(
  strategy: RuntimeLifecycleHints['scrollStrategy'] | undefined,
): ScrollLogicalPosition {
  if (strategy === 'top') return 'start';
  if (strategy === 'bottom') return 'end';
  if (strategy === 'nearest' || strategy === 'virtualized-search') return 'nearest';
  return 'center';
}

interface NetworkActivityTrackerHandle {
  waitForIdle: (timeoutMs: number, signal?: AbortSignal) => Promise<void>;
  release: () => void;
}

class NetworkActivityTracker {
  private static shared: NetworkActivityTracker | null = null;

  static acquire(): NetworkActivityTrackerHandle {
    const tracker = (NetworkActivityTracker.shared ??= new NetworkActivityTracker());
    tracker.references += 1;
    tracker.install();
    return {
      waitForIdle: (timeoutMs: number, signal?: AbortSignal) =>
        tracker.waitForIdle(timeoutMs, signal),
      release: () => tracker.release(),
    };
  }

  private references = 0;
  private activeRequests = 0;
  private lastActivityAt = Date.now();
  private originalFetch: typeof window.fetch | null = null;
  private trackedFetch: typeof window.fetch | null = null;
  private originalXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
  private trackedXhrSend: typeof XMLHttpRequest.prototype.send | null = null;

  private install(): void {
    if (!this.trackedFetch && typeof window.fetch === 'function') {
      this.originalFetch = window.fetch;
      const originalFetch = this.originalFetch;
      const beginRequest = (): void => this.beginRequest();
      const endRequest = (): void => this.endRequest();
      this.trackedFetch = function trackedFetch(
        this: Window,
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): ReturnType<typeof fetch> {
        beginRequest();
        try {
          return originalFetch.call(this, input, init).finally(endRequest);
        } catch (error) {
          endRequest();
          throw error;
        }
      };
      window.fetch = this.trackedFetch;
    }

    if (!this.trackedXhrSend && typeof XMLHttpRequest !== 'undefined') {
      this.originalXhrSend = XMLHttpRequest.prototype.send;
      const originalXhrSend = this.originalXhrSend;
      const beginRequest = (): void => this.beginRequest();
      const endRequest = (): void => this.endRequest();
      this.trackedXhrSend = function trackedXhrSend(
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null,
      ): void {
        beginRequest();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          endRequest();
        };
        this.addEventListener('loadend', finish, { once: true });
        try {
          originalXhrSend.call(this, body);
        } catch (error) {
          finish();
          throw error;
        }
      };
      XMLHttpRequest.prototype.send = this.trackedXhrSend;
    }
  }

  private release(): void {
    this.references = Math.max(0, this.references - 1);
    if (this.references > 0) return;
    if (this.trackedFetch && window.fetch === this.trackedFetch && this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    if (
      this.trackedXhrSend &&
      typeof XMLHttpRequest !== 'undefined' &&
      XMLHttpRequest.prototype.send === this.trackedXhrSend &&
      this.originalXhrSend
    ) {
      XMLHttpRequest.prototype.send = this.originalXhrSend;
    }
    this.trackedFetch = null;
    this.originalFetch = null;
    this.trackedXhrSend = null;
    this.originalXhrSend = null;
    NetworkActivityTracker.shared = null;
  }

  private beginRequest(): void {
    this.activeRequests += 1;
    this.lastActivityAt = Date.now();
  }

  private endRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.lastActivityAt = Date.now();
  }

  private async waitForIdle(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal) throwIfTourPresentationCanceled(signal);
      const quietForMs = Date.now() - this.lastActivityAt;
      if (this.activeRequests === 0 && quietForMs >= NETWORK_IDLE_QUIET_MS) return;
      await delay(NETWORK_IDLE_POLL_MS, signal);
    }
  }
}

export function acquireNetworkActivityTracker(): NetworkActivityTrackerHandle {
  return NetworkActivityTracker.acquire();
}

export async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    if (signal) throwIfTourPresentationCanceled(signal);
    await delay(50, signal);
  }
}

export async function activateLifecycleControl(
  fingerprint: RuntimeLifecycleHints['openPanel'] | RuntimeLifecycleHints['selectTab'],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!fingerprint) return;
  const element = await waitForResolvedElement(fingerprint, timeoutMs, signal);
  if (signal) throwIfTourPresentationCanceled(signal);
  if (element instanceof HTMLElement) element.click();
}

export async function waitForResolvedElement(
  fingerprint: NonNullable<RuntimeLifecycleHints['waitForElement']>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs;
  let result = resolve(fingerprint);
  while (!result.element && Date.now() < deadline) {
    if (signal) throwIfTourPresentationCanceled(signal);
    await delay(50, signal);
    result = resolve(fingerprint);
  }
  return result.element;
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
  if (signal.aborted) return Promise.reject(new TourPresentationCanceledError());
  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolveDelay();
    }, ms);
    const cancel = (): void => {
      clearTimeout(timer);
      rejectDelay(new TourPresentationCanceledError());
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export function lifecycleTextAppliesToCurrentLocale(lifecycle: RuntimeLifecycleHints): boolean {
  if (!lifecycle.waitForTextLocale) return true;
  const expected = canonicalLocale(lifecycle.waitForTextLocale);
  const current = canonicalLocale(document.documentElement.lang || navigator.language);
  if (!expected || !current) return false;
  return expected === current || expected.split('-')[0] === current.split('-')[0];
}

function canonicalLocale(value: string): string | null {
  const candidate = value.trim().replace(/_/g, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

export function nearestScrollable(element: Element): Element | null {
  let current = element.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`))
      return current;
    current = current.parentElement;
  }
  return null;
}

export function scrollIntoView(element: Element, options: ScrollIntoViewOptions): void {
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView(options);
  }
}
