// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompiledStep, StepEmphasis } from '@lodariq/schema';
import {
  applyStepOutlineEmphasis,
  applyViewportZoom,
  armBackdropClick,
  createTourBackdrop,
  outlineOffsetPx,
  positionTourBackdrop,
} from '../../../../../packages/sdk-runtime/src/renderers/tour-emphasis';
import {
  createTargetOutline,
  positionTargetOutline,
} from '../../../../../packages/sdk-runtime/src/renderers/tour-positioning';

function targetAt(rect: { x: number; y: number; width: number; height: number }): HTMLElement {
  const element = document.createElement('button');
  document.body.appendChild(element);
  element.getBoundingClientRect = () =>
    ({
      x: rect.x,
      y: rect.y,
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
  return element;
}

describe('step emphasis', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('leaves the ring on the theme default when a step declares no emphasis', () => {
    const outline = createTargetOutline(document);
    applyStepOutlineEmphasis(outline, undefined);
    expect(outline.style.getPropertyValue('--lq-outline-weight')).toBe('');
    expect(outline.style.getPropertyValue('--lq-outline-color')).toBe('');
    expect(outline.hasAttribute('data-lodariq-outline-line')).toBe(false);
    expect(outline.hasAttribute('data-lodariq-outline-glow')).toBe(false);
  });

  it('drives the ring from tokens, never a literal colour', () => {
    const outline = createTargetOutline(document);
    applyStepOutlineEmphasis(outline, {
      targetOutline: { colorRole: 'accent', weightPx: 3, offsetPx: 6, line: 'dashed', glow: true },
    });
    expect(outline.style.getPropertyValue('--lq-outline-color')).toBe('var(--lq-tour-focus-color)');
    expect(outline.style.getPropertyValue('--lq-outline-weight')).toBe('3px');
    expect(outline.getAttribute('data-lodariq-outline-line')).toBe('dashed');
    expect(outline.getAttribute('data-lodariq-outline-glow')).toBe('true');
  });

  it('clears a previous step’s treatment so emphasis never leaks forward', () => {
    const outline = createTargetOutline(document);
    applyStepOutlineEmphasis(outline, {
      targetOutline: { colorRole: 'ink', line: 'dotted', glow: true, radiusPx: 12 },
    });
    applyStepOutlineEmphasis(outline, { backdrop: { dimPercent: 40, clickBehavior: 'none' } });
    expect(outline.style.getPropertyValue('--lq-outline-color')).toBe('');
    expect(outline.style.getPropertyValue('--lq-outline-radius')).toBe('');
    expect(outline.hasAttribute('data-lodariq-outline-line')).toBe(false);
    expect(outline.hasAttribute('data-lodariq-outline-glow')).toBe(false);
  });

  it('punches the hole at the same offset as the ring, so no seam shows', () => {
    const emphasis: StepEmphasis = {
      backdrop: { dimPercent: 60, clickBehavior: 'none' },
      targetOutline: { offsetPx: 8 },
    };
    const target = targetAt({ x: 100, y: 200, width: 240, height: 48 });
    const outline = createTargetOutline(document);
    const backdrop = createTourBackdrop(document);
    const offset = outlineOffsetPx(emphasis, 3);

    positionTargetOutline(outline, target, offset);
    positionTourBackdrop(backdrop, target, emphasis, offset);

    expect(offset).toBe(8);
    expect(backdrop.style.left).toBe(outline.style.left);
    expect(backdrop.style.top).toBe(outline.style.top);
    expect(backdrop.style.width).toBe(outline.style.width);
    expect(backdrop.style.height).toBe(outline.style.height);
    expect(backdrop.hidden).toBe(false);
  });

  it('dims with the declared percentage and stays out of the hit test', () => {
    const backdrop = createTourBackdrop(document);
    positionTourBackdrop(
      backdrop,
      targetAt({ x: 0, y: 0, width: 10, height: 10 }),
      { backdrop: { dimPercent: 55, clickBehavior: 'dismiss', tintRole: 'ink' } },
      3,
    );
    expect(backdrop.style.boxShadow).toContain('55%');
    expect(backdrop.style.boxShadow).toContain('var(--lq-tour-text-color)');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
  });

  it('stays hidden when the step asks for no backdrop', () => {
    const backdrop = createTourBackdrop(document);
    positionTourBackdrop(backdrop, targetAt({ x: 0, y: 0, width: 10, height: 10 }), undefined, 3);
    expect(backdrop.hidden).toBe(true);
  });

  it('acts on a click outside the hole and ignores one on the target', () => {
    const backdrop = createTourBackdrop(document);
    const target = targetAt({ x: 100, y: 100, width: 100, height: 50 });
    positionTourBackdrop(
      backdrop,
      target,
      { backdrop: { dimPercent: 50, clickBehavior: 'dismiss' } },
      0,
    );
    backdrop.getBoundingClientRect = () =>
      ({ left: 100, top: 100, right: 200, bottom: 150 }) as DOMRect;

    const advance = vi.fn();
    const dismiss = vi.fn();
    const release = armBackdropClick(
      backdrop,
      { dimPercent: 50, clickBehavior: 'dismiss' },
      { advance, dismiss },
    );

    document.dispatchEvent(new MouseEvent('click', { clientX: 150, clientY: 120, bubbles: true }));
    expect(dismiss).not.toHaveBeenCalled();

    document.dispatchEvent(new MouseEvent('click', { clientX: 400, clientY: 400, bubbles: true }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();

    release();
    document.dispatchEvent(new MouseEvent('click', { clientX: 400, clientY: 400, bubbles: true }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('binds nothing when the backdrop swallows no clicks', () => {
    const backdrop = createTourBackdrop(document);
    const dismiss = vi.fn();
    armBackdropClick(
      backdrop,
      { dimPercent: 50, clickBehavior: 'none' },
      { advance: vi.fn(), dismiss },
    );
    document.dispatchEvent(new MouseEvent('click', { clientX: 900, clientY: 900, bubbles: true }));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('only transforms the page when a step opts into zoom, and always restores it', () => {
    const scrolling = {
      id: 'step_1',
      emphasis: { viewportFocus: { behavior: 'scroll-into-view' } },
    };
    expect(applyViewportZoom(scrolling as unknown as CompiledStep, document)).toBeInstanceOf(
      Function,
    );
    expect(document.documentElement.style.transform).toBe('');

    const zooming = {
      id: 'step_2',
      emphasis: { viewportFocus: { behavior: 'zoom', scalePercent: 150 } },
    };
    const restore = applyViewportZoom(zooming as unknown as CompiledStep, document);
    expect(document.documentElement.style.transform).toBe('scale(1.5)');
    restore();
    expect(document.documentElement.style.transform).toBe('');
  });
});
