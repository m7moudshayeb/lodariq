import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { CompiledDocument, CompiledStep, RuntimeLifecycleHints } from '@lodariq/schema';
import { createNonceStyleElement } from '@lodariq/schema/dom';
import { resolve } from '../resolver';

const NETWORK_IDLE_QUIET_MS = 80;
const NETWORK_IDLE_POLL_MS = 20;

/**
 * Linear tour renderer (PRD §9.3, §16.1).
 *
 * Renders overlays into a Shadow DOM root and positions them with Floating UI.
 * Shadow DOM is used for style isolation of overlays only — it is NOT claimed
 * as a JavaScript sandbox (PRD §20).
 */
export interface TourPlayerOptions {
  initialStepId?: string;
  initialStepIndex?: number;
  onStepChange?: (index: number, step: CompiledStep) => void;
  onBeforeStepChange?: (index: number, step: CompiledStep) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
}

export class TourPlayer {
  private static active: TourPlayer | null = null;

  private index: number;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly card: HTMLDivElement;
  private readonly cleanups: Array<() => void> = [];
  private renderId = 0;

  constructor(
    private readonly doc: CompiledDocument,
    private readonly options: TourPlayerOptions = {},
  ) {
    this.index = initialStepIndex(doc, options);
    this.host = document.createElement('lodariq-tour');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.card = document.createElement('div');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'Lodariq tour');
    this.card.setAttribute('aria-live', 'polite');
    this.card.tabIndex = -1;
    this.shadow.appendChild(createStyles());
    this.shadow.appendChild(this.card);
  }

  start(): void {
    if (TourPlayer.active && TourPlayer.active !== this) TourPlayer.active.stop();
    TourPlayer.active = this;
    if (!this.host.isConnected) document.body.appendChild(this.host);
    this.render();
  }

  next(): void {
    this.advanceToNext(true);
  }

  private advanceToNext(notify: boolean): void {
    const nextIndex = this.index + 1;
    const nextStep = this.doc.steps[nextIndex];
    if (!nextStep) {
      this.stop();
      this.options.onComplete?.();
      return;
    }
    if (notify) this.notifyBeforeStepChange(nextIndex, nextStep);
    this.index = nextIndex;
    this.render();
  }

  stop(): void {
    this.clearStepEffects();
    if (TourPlayer.active === this) TourPlayer.active = null;
    this.host.remove();
  }

  private render(): void {
    const renderId = ++this.renderId;
    const step = this.doc.steps[this.index];
    if (!step) return;
    this.clearStepEffects();
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    for (const node of step.body) {
      const el = document.createElement(node.type === 'button' ? 'button' : 'div');
      el.dataset['lodariqNodeType'] = node.type;
      el.textContent = node.text ?? '';
      if (node.type === 'button') this.configureButton(el as HTMLButtonElement, node.props.action);
      this.card.appendChild(el);
    }

    (this.card.querySelector<HTMLElement>('button') ?? this.card).focus();
    void this.findTarget(step).then((target) => {
      if (!target || renderId !== this.renderId || !this.host.isConnected) return;
      this.scrollForLifecycle(target, step.lifecycle);
      if (stepWaitsForTargetClick(step)) this.armTargetClickAdvance(target);
      this.position(target, (step.placement as Placement) ?? 'bottom');
    });
  }

  private configureButton(
    button: HTMLButtonElement,
    action: CompiledStep['body'][number]['props']['action'],
  ): void {
    if (!action) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      return;
    }
    if (action.type === 'dismiss') {
      button.addEventListener('click', () => this.dismiss());
      return;
    }
    if (action.type === 'clickTarget') {
      button.addEventListener('click', () => this.focusCurrentTarget());
      return;
    }
    button.addEventListener('click', () => this.next());
  }

  private dismiss(): void {
    this.stop();
    this.options.onDismiss?.();
  }

  private async findTarget(step: CompiledStep): Promise<Element | null> {
    await this.waitForLifecycle(step.lifecycle);
    if (!step.targetId) return null;
    const target = this.doc.targets.find((t) => t.id === step.targetId);
    if (!target) return null;
    const deadline = Date.now() + (step.lifecycle ? (step.lifecycle.timeoutMs ?? 1000) : 0);
    let result = resolve(target.fingerprint);
    while (!result.element && Date.now() < deadline) {
      this.nudgeVirtualizedContainer(step.lifecycle);
      await delay(50);
      result = resolve(target.fingerprint);
    }
    return result.element;
  }

  private position(target: Element, placement: Placement): void {
    const update = (): void => {
      void computePosition(target, this.card, {
        placement,
        strategy: 'fixed',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(this.card.style, { position: 'fixed', left: `${x}px`, top: `${y}px` });
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    this.addCleanup(() => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    });
  }

  private armTargetClickAdvance(target: Element): void {
    let consumed = false;
    const onClick = (): void => {
      if (consumed) return;
      consumed = true;
      const nextIndex = this.index + 1;
      const nextStep = this.doc.steps[nextIndex];
      if (nextStep) this.notifyBeforeStepChange(nextIndex, nextStep);
      window.setTimeout(() => {
        if (this.host.isConnected) this.advanceToNext(false);
      }, 0);
    };
    target.addEventListener('click', onClick, true);
    this.addCleanup(() => target.removeEventListener('click', onClick, true));
  }

  private notifyBeforeStepChange(index: number, step: CompiledStep): void {
    try {
      this.options.onBeforeStepChange?.(index, step);
    } catch {
      /* Persistence hooks must never block the host application's click flow. */
    }
  }

  private focusCurrentTarget(): void {
    const step = this.doc.steps[this.index];
    if (!step) return;
    void this.findTarget(step).then((target) => {
      if (!target || !this.host.isConnected) return;
      this.scrollForLifecycle(target, step.lifecycle);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    });
  }

  private addCleanup(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  private clearStepEffects(): void {
    while (this.cleanups.length) this.cleanups.pop()?.();
  }

  private async waitForLifecycle(lifecycle?: RuntimeLifecycleHints): Promise<void> {
    if (!lifecycle) return;
    const timeoutMs = lifecycle.timeoutMs ?? 1000;
    const expectedRoute = lifecycle.expectedRoute;
    const networkTracker = lifecycle.waitForNetworkIdle ? acquireNetworkActivityTracker() : null;
    try {
      if (expectedRoute) await waitUntil(() => routeMatches(expectedRoute), timeoutMs);
      if (lifecycle.openPanel) await activateLifecycleControl(lifecycle.openPanel, timeoutMs);
      if (lifecycle.selectTab) await activateLifecycleControl(lifecycle.selectTab, timeoutMs);
      if (networkTracker) await networkTracker.waitForIdle(timeoutMs);
      if (lifecycle.waitForText) {
        await waitUntil(
          () => document.body.textContent?.includes(lifecycle.waitForText!) ?? false,
          timeoutMs,
        );
      }
      if (lifecycle.waitForElement)
        await waitForResolvedElement(lifecycle.waitForElement, timeoutMs);
    } finally {
      networkTracker?.release();
    }
  }

  private scrollForLifecycle(target: Element, lifecycle?: RuntimeLifecycleHints): void {
    const explicitContainer = lifecycle?.scrollContainer
      ? resolve(lifecycle.scrollContainer).element
      : null;
    const container = explicitContainer ?? nearestScrollable(target);
    const block = scrollBlockFor(lifecycle?.scrollStrategy);
    scrollIntoView(container ?? target, { block, inline: 'nearest' });
    if (container && container !== target)
      scrollIntoView(target, { block: 'nearest', inline: 'nearest' });
  }

  private nudgeVirtualizedContainer(lifecycle?: RuntimeLifecycleHints): void {
    if (lifecycle?.scrollStrategy !== 'virtualized-search' || !lifecycle.scrollContainer) return;
    const container = resolve(lifecycle.scrollContainer).element;
    if (!(container instanceof HTMLElement)) return;
    container.scrollTop += container.clientHeight || 200;
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
  }
}

function stepWaitsForTargetClick(step: CompiledStep): boolean {
  return step.body.some((node) => node.props.action?.type === 'clickTarget');
}

function initialStepIndex(doc: CompiledDocument, options: TourPlayerOptions): number {
  if (typeof options.initialStepIndex === 'number') {
    return Math.min(Math.max(0, options.initialStepIndex), Math.max(0, doc.steps.length - 1));
  }
  if (options.initialStepId) {
    const index = doc.steps.findIndex((step) => step.id === options.initialStepId);
    if (index >= 0) return index;
  }
  return 0;
}

function routeMatches(expectedRoute: string): boolean {
  return `${location.pathname}${location.search}${location.hash}` === expectedRoute;
}

function scrollBlockFor(
  strategy: RuntimeLifecycleHints['scrollStrategy'] | undefined,
): ScrollLogicalPosition {
  if (strategy === 'top') return 'start';
  if (strategy === 'bottom') return 'end';
  if (strategy === 'nearest' || strategy === 'virtualized-search') return 'nearest';
  return 'center';
}

interface NetworkActivityTrackerHandle {
  waitForIdle: (timeoutMs: number) => Promise<void>;
  release: () => void;
}

class NetworkActivityTracker {
  private static shared: NetworkActivityTracker | null = null;

  static acquire(): NetworkActivityTrackerHandle {
    const tracker = (NetworkActivityTracker.shared ??= new NetworkActivityTracker());
    tracker.references += 1;
    tracker.install();
    return {
      waitForIdle: (timeoutMs: number) => tracker.waitForIdle(timeoutMs),
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

  private async waitForIdle(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const quietForMs = Date.now() - this.lastActivityAt;
      if (this.activeRequests === 0 && quietForMs >= NETWORK_IDLE_QUIET_MS) return;
      await delay(NETWORK_IDLE_POLL_MS);
    }
  }
}

function acquireNetworkActivityTracker(): NetworkActivityTrackerHandle {
  return NetworkActivityTracker.acquire();
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await delay(50);
}

async function activateLifecycleControl(
  fingerprint: RuntimeLifecycleHints['openPanel'] | RuntimeLifecycleHints['selectTab'],
  timeoutMs: number,
): Promise<void> {
  if (!fingerprint) return;
  const element = await waitForResolvedElement(fingerprint, timeoutMs);
  if (element instanceof HTMLElement) element.click();
}

async function waitForResolvedElement(
  fingerprint: NonNullable<RuntimeLifecycleHints['waitForElement']>,
  timeoutMs: number,
): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs;
  let result = resolve(fingerprint);
  while (!result.element && Date.now() < deadline) {
    await delay(50);
    result = resolve(fingerprint);
  }
  return result.element;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function nearestScrollable(element: Element): Element | null {
  let current = element.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`))
      return current;
    current = current.parentElement;
  }
  return null;
}

function scrollIntoView(element: Element, options: ScrollIntoViewOptions): void {
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView(options);
  }
}

function createStyles(): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--lodariq-tour-z-index, 2147483647);
      pointer-events: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    div[role="dialog"] {
      width: min(320px, calc(100vw - 24px));
      padding: 14px;
      border: 1px solid #d7dbe7;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
      color: #172033;
      pointer-events: auto;
    }

    [data-lodariq-node-type="heading"] {
      margin-bottom: 6px;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.3;
    }

    [data-lodariq-node-type="paragraph"] {
      margin-bottom: 12px;
      color: #4b5563;
      font-size: 14px;
      line-height: 1.45;
    }

    [data-lodariq-node-type="media"] {
      margin: 8px 0 12px;
      padding: 14px;
      border: 1px dashed #cbd5e1;
      border-radius: 7px;
      background: #f8fafc;
      color: #64748b;
      font-size: 13px;
      line-height: 1.35;
      text-align: center;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 7px 12px;
      border: 0;
      border-radius: 6px;
      background: #2563eb;
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
  `,
  );
}
