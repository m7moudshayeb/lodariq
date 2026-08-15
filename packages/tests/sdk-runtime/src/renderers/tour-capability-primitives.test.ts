import { describe, expect, it, vi } from 'vitest';
import type { CompiledStep, StepChoreography, StepTransition } from '@lodariq/schema';
import { applyStepMotion, resolveResponsiveTourStep } from '@lodariq/sdk-runtime/renderers/tour';
import { executeStepChoreography } from '@lodariq/sdk-runtime/renderers/tour-choreography';
import { resolveStepTransition } from '@lodariq/sdk-runtime/renderers/tour-flow';
import {
  chooseLowestCollisionCandidate,
  protectedSurfaceCollisionScore,
} from '@lodariq/sdk-runtime/renderers/protected-surface';

describe('Tour runtime capability primitives', () => {
  it('executes trigger, waits in authored order, and transitions once', async () => {
    const calls: string[] = [];
    await executeStepChoreography(
      sequence(),
      {
        runTrigger: async (trigger) => void calls.push(`trigger:${trigger.type}`),
        runWait: async (wait) => void calls.push(`wait:${wait.type}`),
        runTransition: (transition) => void calls.push(`transition:${transition.type}`),
      },
      new AbortController().signal,
    );

    expect(calls).toEqual(['trigger:manual', 'wait:networkIdle', 'transition:next']);
  });

  it('aborts an in-flight sequence without running its transition', async () => {
    const controller = new AbortController();
    const transition = vi.fn();
    const pending = executeStepChoreography(
      sequence(),
      {
        runTrigger: async () => {},
        runWait: async (_wait, _timeout, signal) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
        runTransition: transition,
      },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(transition).not.toHaveBeenCalled();
  });

  it('chooses the placement with the lowest weighted overlap', () => {
    const obstacles = [{ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }];
    const candidates = [
      { x: 10, y: 10, width: 60, height: 60, value: 'overlap' },
      { x: 110, y: 10, width: 60, height: 60, value: 'clear' },
    ];
    expect(protectedSurfaceCollisionScore(candidates[0]!, obstacles)).toBe(3_600);
    expect(chooseLowestCollisionCandidate(candidates, obstacles)?.value).toBe('clear');
  });

  it('evaluates ordered branch rules and a deterministic fallback', () => {
    const transition = {
      rules: [
        {
          all: [{ source: 'identifyTrait', key: 'plan', operator: 'equals', value: 'pro' }],
          to: { type: 'step', stepId: 'step-pro' },
        },
      ],
      fallback: { type: 'complete' },
    } satisfies StepTransition;
    expect(
      resolveStepTransition(transition, {
        identifyTraits: { plan: 'pro' },
        locale: 'en',
        completedStepIds: new Set(),
      }),
    ).toEqual({ destination: { type: 'step', stepId: 'step-pro' }, ruleIndex: 0 });
    expect(
      resolveStepTransition(transition, {
        identifyTraits: { plan: 'free' },
        locale: 'en',
        completedStepIds: new Set(),
      }),
    ).toEqual({ destination: { type: 'complete' }, ruleIndex: null });
  });

  it('resolves compact presentation without mutating the compiled step', () => {
    const step: CompiledStep = {
      id: 'step-1',
      placement: 'top',
      responsive: {
        compact: { placement: 'bottom', widthPx: 296, actionLayout: 'stack', mediaVisible: false },
      },
      body: [
        {
          id: 'media-1',
          type: 'media',
          props: {
            media: { kind: 'image', assetId: 'asset-1', accessibilityName: 'Example' },
          },
        },
      ],
    };
    const resolved = resolveResponsiveTourStep(step, 480);
    expect(resolved.placement).toBe('bottom');
    expect(resolved.tooltipLayout?.widthPx).toBe(296);
    expect(resolved.tooltipLayout?.actionLayout).toBe('stack');
    expect(resolved.body).toEqual([]);
    expect(step.body).toHaveLength(1);
  });

  it('maps each motion easing role to a distinct bounded renderer value', () => {
    const motionProperties = new Map<string, string>();
    const card = {
      dataset: {} as DOMStringMap,
      style: {
        getPropertyValue: (name: string) => motionProperties.get(name) ?? '',
        removeProperty: (name: string) => motionProperties.delete(name),
        setProperty: (name: string, value: string) => void motionProperties.set(name, value),
      },
    } as unknown as HTMLElement;
    const step = {
      id: 'step-motion',
      body: [],
      motion: {
        recipe: 'lift',
        durationMs: 240,
        easing: 'emphasized',
        reducedMotion: 'none',
      },
    } satisfies CompiledStep;

    applyStepMotion(card, step);

    expect(card.dataset['lodariqMotion']).toBe('lift');
    expect(card.style.getPropertyValue('--lq-step-motion-duration')).toBe('240ms');
    expect(card.style.getPropertyValue('--lq-step-motion-easing')).toBe(
      'cubic-bezier(0.16, 1, 0.3, 1)',
    );
  });
});

function sequence(): StepChoreography {
  return {
    trigger: { type: 'manual' },
    waitFor: [{ type: 'networkIdle' }],
    transition: { type: 'next' },
    timeoutMs: 1_000,
    onTimeout: 'stay',
  };
}
