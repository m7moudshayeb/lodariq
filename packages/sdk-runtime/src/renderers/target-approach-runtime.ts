import type {
  CompiledDocument,
  CompiledStep,
  CompiledTargetApproach,
  StepChoreographyWait,
} from '@lodariq/schema';
import { tourRuntimeText } from '../tour-i18n';
import {
  TourPresentationCanceledError,
  TourPresentationUnavailableError,
} from './tour-errors';
import {
  waitForRuntimeChoreographyCondition,
  waitForRuntimeTarget,
  type ChoreographyTargetAction,
} from './tour-choreography-runtime';
import { nearestScrollable, scrollIntoView } from './tour-lifecycle';

export const TARGET_APPROACH_DEADLINE_MS = 15_000;

export interface TargetApproachStageUpdate {
  targetId: string;
  legIndex: number;
  label: string;
  stage: 'act' | 'wait';
  status: 'started' | 'completed' | 'failed';
  reason?: 'canceled' | 'deadline' | 'target-unavailable' | 'unsupported';
}

export type TargetApproachOutcome =
  | { state: 'pass'; completedLegs: number }
  | {
      state: 'fail';
      completedLegs: number;
      failedLegIndex: number;
      reason: NonNullable<TargetApproachStageUpdate['reason']>;
    };

export interface TargetApproachEnvironment {
  targetId: string;
  resolveTarget: (targetId: string, requiredAction: ChoreographyTargetAction) => Element | null;
  onStageUpdate?: (update: TargetApproachStageUpdate) => void;
}

export async function executeDocumentTargetApproach(
  document: CompiledDocument,
  environment: TargetApproachEnvironment,
  signal: AbortSignal,
): Promise<TargetApproachOutcome> {
  const target = document.targets.find((candidate) => candidate.id === environment.targetId);
  const approach = target && 'approach' in target ? target.approach : undefined;
  if (!approach || typeof approach !== 'object' || !('legs' in approach)) {
    return { state: 'pass', completedLegs: 0 };
  }
  if (!Array.isArray(approach.legs) || !approach.legs.length) {
    return { state: 'pass', completedLegs: 0 };
  }
  return executeTargetApproach(approach as CompiledTargetApproach, environment, signal);
}

export async function executeStepTargetApproach(
  document: CompiledDocument,
  step: CompiledStep,
  resolveTarget: TargetApproachEnvironment['resolveTarget'],
  signal: AbortSignal,
  onStage?: (step: CompiledStep, update: TargetApproachStageUpdate) => void,
  onOutcome?: (step: CompiledStep, outcome: TargetApproachOutcome) => void,
): Promise<void> {
  const outcome = await executeDocumentTargetApproach(
    document,
    {
      targetId: step.targetId!,
      resolveTarget,
      onStageUpdate: (update) => safeNotify(onStage, step, update),
    },
    signal,
  );
  safeNotify(onOutcome, step, outcome);
  if (outcome.state === 'fail') {
    throw new TourPresentationUnavailableError(
      tourRuntimeText('Lodariq could not find what this step points at on this page'),
    );
  }
}

export async function showTargetApproachRecovery(
  card: HTMLElement,
  active: () => boolean,
  actions: { retry: () => void; skip: () => void; dismiss: () => void },
): Promise<void> {
  const { showTourChoreographyRecovery } = await import('./tour-choreography-recovery');
  if (active() && card.isConnected) showTourChoreographyRecovery(card, actions);
}

/** Executes one immutable semantic recipe. It never accepts selectors or coordinates. */
export async function executeTargetApproach(
  approach: CompiledTargetApproach,
  environment: TargetApproachEnvironment,
  signal: AbortSignal,
  deadlineMs = TARGET_APPROACH_DEADLINE_MS,
): Promise<TargetApproachOutcome> {
  const deadline = performance.now() + Math.max(1, deadlineMs);
  let completedLegs = 0;
  for (const [legIndex, leg] of approach.legs.entries()) {
    let activeStage: TargetApproachStageUpdate['stage'] = 'act';
    try {
      if (leg.act.kind === 'activateTarget') {
        emit(environment, legIndex, leg.label, 'act', 'started');
        const remaining = remainingDeadline(deadline, signal);
        const target = await waitForRuntimeTarget(
          leg.act.targetId,
          'activate',
          environment.resolveTarget,
          signal,
          remaining,
        );
        if (!(target instanceof HTMLElement)) {
          throw new TourPresentationUnavailableError();
        }
        const scrollable = nearestScrollable(target);
        scrollIntoView(scrollable ?? target, { block: 'nearest', inline: 'nearest' });
        if (scrollable) scrollIntoView(target, { block: 'nearest', inline: 'nearest' });
        target.click();
        emit(environment, legIndex, leg.label, 'act', 'completed');
      }
      if (leg.wait) {
        activeStage = 'wait';
        emit(environment, legIndex, leg.label, 'wait', 'started');
        const remaining = remainingDeadline(deadline, signal);
        await waitWithDeadline(
          leg.wait,
          remaining,
          environment.resolveTarget,
          signal,
        );
        emit(environment, legIndex, leg.label, 'wait', 'completed');
      }
      completedLegs += 1;
    } catch (error) {
      const reason = failureReason(error, deadline, signal);
      emit(environment, legIndex, leg.label, activeStage, 'failed', reason);
      if (reason === 'canceled') throw new TourPresentationCanceledError();
      return { state: 'fail', completedLegs, failedLegIndex: legIndex, reason };
    }
  }
  return { state: 'pass', completedLegs };
}

async function waitWithDeadline(
  wait: StepChoreographyWait,
  timeoutMs: number,
  resolveTarget: TargetApproachEnvironment['resolveTarget'],
  signal: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    await waitForRuntimeChoreographyCondition(
      wait,
      timeoutMs,
      resolveTarget,
      controller.signal,
    );
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

function remainingDeadline(deadline: number, signal: AbortSignal): number {
  if (signal.aborted) throw new TourPresentationCanceledError();
  const remaining = Math.ceil(deadline - performance.now());
  if (remaining <= 0) {
    throw new TourPresentationUnavailableError(
      tourRuntimeText('Lodariq could not find what this step points at on this page'),
    );
  }
  return remaining;
}

function failureReason(
  error: unknown,
  deadline: number,
  signal: AbortSignal,
): NonNullable<TargetApproachStageUpdate['reason']> {
  if (signal.aborted) return 'canceled';
  if (error instanceof TourPresentationCanceledError || performance.now() >= deadline) {
    return 'deadline';
  }
  return 'target-unavailable';
}

function emit(
  environment: TargetApproachEnvironment,
  legIndex: number,
  label: string,
  stage: TargetApproachStageUpdate['stage'],
  status: TargetApproachStageUpdate['status'],
  reason?: TargetApproachStageUpdate['reason'],
): void {
  try {
    environment.onStageUpdate?.({
      targetId: environment.targetId,
      legIndex,
      label,
      stage,
      status,
      ...(reason ? { reason } : {}),
    });
  } catch {
    /* Diagnostic hooks cannot alter playback. */
  }
}

function safeNotify<T>(
  callback: ((step: CompiledStep, value: T) => void) | undefined,
  step: CompiledStep,
  value: T,
): void {
  try {
    callback?.(step, value);
  } catch {
    /* Diagnostics hooks cannot alter playback. */
  }
}
