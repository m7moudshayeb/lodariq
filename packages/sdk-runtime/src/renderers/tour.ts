import { computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import type { CompiledDocument, CompiledStep } from '@talmeh/schema';
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
  private index = 0;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly card: HTMLDivElement;
  private cleanup: (() => void) | null = null;

  constructor(
    private readonly doc: CompiledDocument,
    private readonly options: TourPlayerOptions = {},
  ) {
    this.host = document.createElement('talmeh-tour');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.card = document.createElement('div');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-live', 'polite');
    this.shadow.appendChild(this.card);
  }

  start(): void {
    document.body.appendChild(this.host);
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
    this.host.remove();
  }

  private render(): void {
    const step = this.doc.steps[this.index];
    if (!step) return;
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    for (const node of step.body) {
      const el = document.createElement(node.type === 'button' ? 'button' : 'div');
      el.textContent = node.text ?? '';
      if (node.type === 'button') el.addEventListener('click', () => this.next());
      this.card.appendChild(el);
    }

    const target = this.findTarget(step);
    if (target) this.position(target, (step.placement as Placement) ?? 'bottom');
  }

  private findTarget(step: CompiledStep): Element | null {
    if (!step.targetId) return null;
    const target = this.doc.targets.find((t) => t.id === step.targetId);
    if (!target) return null;
    const result = resolve(target.fingerprint);
    return result.element;
  }

  private position(target: Element, placement: Placement): void {
    this.cleanup?.();
    const update = (): void => {
      void computePosition(target, this.card, {
        placement,
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        Object.assign(this.card.style, { position: 'absolute', left: `${x}px`, top: `${y}px` });
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
}
