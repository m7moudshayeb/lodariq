import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { CompiledDocument, CompiledStep, RuntimeLifecycleHints } from '@talmeh/schema';
import { resolve } from '../resolver';

/**
 * Linear tour renderer (PRD §9.3, §16.1).
 *
 * Renders overlays into a Shadow DOM root and positions them with Floating UI.
 * Shadow DOM is used for style isolation of overlays only — it is NOT claimed
 * as a JavaScript sandbox (PRD §20).
 */
export interface TourPlayerOptions {
  onStepChange?: (index: number, step: CompiledStep) => void;
  onComplete?: () => void;
}

export class TourPlayer {
  private static active: TourPlayer | null = null;

  private index = 0;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly card: HTMLDivElement;
  private cleanup: (() => void) | null = null;
  private renderId = 0;

  constructor(
    private readonly doc: CompiledDocument,
    private readonly options: TourPlayerOptions = {},
  ) {
    this.host = document.createElement('talmeh-tour');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.card = document.createElement('div');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', 'Talmeh tour');
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
    if (this.index >= this.doc.steps.length - 1) {
      this.stop();
      this.options.onComplete?.();
      return;
    }
    this.index += 1;
    this.render();
  }

  stop(): void {
    this.cleanup?.();
    this.cleanup = null;
    if (TourPlayer.active === this) TourPlayer.active = null;
    this.host.remove();
  }

  private render(): void {
    const renderId = ++this.renderId;
    const step = this.doc.steps[this.index];
    if (!step) return;
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    for (const node of step.body) {
      const el = document.createElement(node.type === 'button' ? 'button' : 'div');
      el.dataset['talmehNodeType'] = node.type;
      el.textContent = node.text ?? '';
      if (node.type === 'button') el.addEventListener('click', () => this.next());
      this.card.appendChild(el);
    }

    (this.card.querySelector<HTMLElement>('button') ?? this.card).focus();
    void this.findTarget(step).then((target) => {
      if (!target || renderId !== this.renderId || !this.host.isConnected) return;
      this.scrollForLifecycle(target, step.lifecycle);
      this.position(target, (step.placement as Placement) ?? 'bottom');
    });
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
    this.cleanup?.();
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
    this.cleanup = (): void => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }

  private async waitForLifecycle(lifecycle?: RuntimeLifecycleHints): Promise<void> {
    if (!lifecycle) return;
    const timeoutMs = lifecycle.timeoutMs ?? 1000;
    const expectedRoute = lifecycle.expectedRoute;
    const waitForText = lifecycle.waitForText;
    const waitForElement = lifecycle.waitForElement;
    await Promise.all([
      expectedRoute ? waitUntil(() => routeMatches(expectedRoute), timeoutMs) : undefined,
      waitForText
        ? waitUntil(() => document.body.textContent?.includes(waitForText) ?? false, timeoutMs)
        : undefined,
      waitForElement
        ? waitUntil(() => resolve(waitForElement).state === 'found', timeoutMs)
        : undefined,
    ]);
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

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await delay(50);
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
  const style = document.createElement('style');
  style.textContent = `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
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

    [data-talmeh-node-type="heading"] {
      margin-bottom: 6px;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.3;
    }

    [data-talmeh-node-type="paragraph"] {
      margin-bottom: 12px;
      color: #4b5563;
      font-size: 14px;
      line-height: 1.45;
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
  `;
  return style;
}
