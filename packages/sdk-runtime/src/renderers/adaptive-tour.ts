import type { AdaptiveDecisionContext, CompiledDocument, CompiledStep } from '@lodariq/schema';
import {
  planAdaptiveSteps,
  type AdaptiveStepDecision,
} from '@lodariq/schema/adaptive-runtime';
import {
  TourPlayer as BaseTourPlayer,
  type TourPlayerOptions,
} from './tour';

export interface AdaptiveTourPlayerOptions extends Omit<TourPlayerOptions, 'skipStep'> {
  adaptiveContext?: AdaptiveDecisionContext;
  onAdaptiveDecision?: (step: CompiledStep, decision: AdaptiveStepDecision) => void;
  onAdaptiveSkip?: (step: CompiledStep, decision: AdaptiveStepDecision) => void;
}

/** Adds evidence planning only when a tour renderer is actually requested. */
export class TourPlayer extends BaseTourPlayer {
  constructor(document: CompiledDocument, options: AdaptiveTourPlayerOptions = {}) {
    const { adaptiveContext, onAdaptiveDecision, onAdaptiveSkip, ...playback } = options;
    const decisions = new Map(
      planAdaptiveSteps(document.steps, adaptiveContext).map((decision) => [
        decision.stepId,
        decision,
      ]),
    );
    const notified = new Set<string>();
    super(document, {
      ...playback,
      skipStep: (step) => {
        const decision = decisions.get(step.id);
        if (decision && !notified.has(step.id)) {
          notified.add(step.id);
          notify(onAdaptiveDecision, step, decision);
          if (decision.action === 'skip') notify(onAdaptiveSkip, step, decision);
        }
        return decision?.action === 'skip';
      },
    });
  }
}

function notify(
  callback: AdaptiveTourPlayerOptions['onAdaptiveDecision'] | undefined,
  step: CompiledStep,
  decision: AdaptiveStepDecision,
): void {
  try {
    callback?.(step, decision);
  } catch {
    // Hooks never alter deterministic playback.
  }
}
