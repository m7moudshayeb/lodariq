// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompiledStep } from '@lodariq/schema';
import { applyStepMotion } from '../../../../../packages/sdk-runtime/src/renderers/tour-presentation';
import {
  positionStepMotionOrigin,
  startStepExitMotion,
} from '../../../../../packages/sdk-runtime/src/renderers/tour-presentation-effects';

const motionStep = {
  id: 'step-motion',
  body: [],
  motion: {
    recipe: 'lift',
    durationMs: 240,
    easing: 'emphasized',
    reducedMotion: 'none',
  },
} satisfies CompiledStep;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tour presentation motion', () => {
  it('derives slide and scale origins from the semantic target', () => {
    const card = document.createElement('div');
    card.getBoundingClientRect = () => domRect({ x: 100, y: 200, width: 200, height: 100 });

    positionStepMotionOrigin(
      card,
      domRect({ x: 500, y: 250, width: 100, height: 40 }),
      { x: 100, y: 200 },
    );

    expect(Number.parseFloat(card.style.getPropertyValue('--lq-step-slide-x'))).toBeGreaterThan(31);
    expect(Number.parseFloat(card.style.getPropertyValue('--lq-step-slide-y'))).toBeGreaterThan(0);
    expect(card.style.getPropertyValue('--lq-step-origin-x')).toBe('400px');
    expect(card.style.getPropertyValue('--lq-step-origin-y')).toBe('70px');
  });

  it('waits for the closed exit animation and settles only once', () => {
    const card = document.createElement('div');
    applyStepMotion(card, motionStep);
    const complete = vi.fn();

    const cancel = startStepExitMotion(card, motionStep, complete);

    expect(cancel).toBeTypeOf('function');
    expect(card.dataset['lodariqMotionPhase']).toBe('exit');
    expect(complete).not.toHaveBeenCalled();
    card.dispatchEvent(new Event('animationend'));
    card.dispatchEvent(new Event('animationend'));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('cancels an exit without applying its pending transition', () => {
    const card = document.createElement('div');
    applyStepMotion(card, motionStep);
    const complete = vi.fn();
    const cancel = startStepExitMotion(card, motionStep, complete);

    cancel?.();
    card.dispatchEvent(new Event('animationend'));

    expect(complete).not.toHaveBeenCalled();
  });

  it('uses the immediate equivalent when reduced motion is active', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    const card = document.createElement('div');
    applyStepMotion(card, motionStep);

    expect(startStepExitMotion(card, motionStep, vi.fn())).toBeNull();
  });

  it('clears a targeted origin before a targetless motion recipe renders', () => {
    const card = document.createElement('div');
    card.style.setProperty('--lq-step-origin-x', '200px');
    card.style.setProperty('--lq-step-slide-x', '20px');

    applyStepMotion(card, motionStep);

    expect(card.style.getPropertyValue('--lq-step-origin-x')).toBe('');
    expect(card.style.getPropertyValue('--lq-step-slide-x')).toBe('');
  });
});

function domRect(rect: { x: number; y: number; width: number; height: number }): DOMRect {
  return {
    ...rect,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    toJSON: () => ({}),
  } as DOMRect;
}
