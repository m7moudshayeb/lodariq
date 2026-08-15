import type {
  StepChoreography,
  StepChoreographyTransition,
  StepChoreographyTrigger,
  StepChoreographyWait,
} from '@lodariq/schema';
import { TourPresentationCanceledError } from './tour-errors';

export type ChoreographyStageKind = 'trigger' | 'wait' | 'transition';
export type ChoreographyStageStatus = 'started' | 'completed' | 'timed_out' | 'failed';

export interface ChoreographyStageUpdate {
  stage: ChoreographyStageKind;
  stageIndex: number;
  status: ChoreographyStageStatus;
  elapsedMs: number;
}

export interface ChoreographyExecutionEnvironment {
  runTrigger(
    trigger: StepChoreographyTrigger,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<void>;
  runWait(wait: StepChoreographyWait, timeoutMs: number, signal: AbortSignal): Promise<void>;
  runTransition(transition: StepChoreographyTransition): void;
  onStageUpdate?: (update: ChoreographyStageUpdate) => void;
}

export class ChoreographyStageTimeoutError extends Error {
  constructor(
    readonly stage: ChoreographyStageKind,
    readonly stageIndex: number,
  ) {
    super(`Tour choreography ${stage} stage timed out`);
    this.name = 'ChoreographyStageTimeoutError';
  }
}

/** Executes one closed sequence. Recovery policy stays with the Tour player. */
export async function executeStepChoreography(
  sequence: StepChoreography,
  environment: ChoreographyExecutionEnvironment,
  signal: AbortSignal,
): Promise<void> {
  await executeStage('trigger', 0, sequence.timeoutMs, signal, environment, (stageSignal) =>
    environment.runTrigger(sequence.trigger, sequence.timeoutMs, stageSignal),
  );
  for (const [index, wait] of sequence.waitFor.entries()) {
    await executeStage('wait', index, sequence.timeoutMs, signal, environment, (stageSignal) =>
      environment.runWait(wait, sequence.timeoutMs, stageSignal),
    );
  }
  await executeStage('transition', 0, sequence.timeoutMs, signal, environment, async () => {
    environment.runTransition(sequence.transition);
  });
}

async function executeStage(
  stage: ChoreographyStageKind,
  stageIndex: number,
  timeoutMs: number,
  signal: AbortSignal,
  environment: ChoreographyExecutionEnvironment,
  operation: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  throwIfAborted(signal);
  const startedAt = performance.now();
  environment.onStageUpdate?.({ stage, stageIndex, status: 'started', elapsedMs: 0 });
  const stageController = new AbortController();
  const abortStage = (): void => stageController.abort(signal.reason);
  signal.addEventListener('abort', abortStage, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation(stageController.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          stageController.abort();
          reject(new ChoreographyStageTimeoutError(stage, stageIndex));
        }, timeoutMs);
      }),
    ]);
    environment.onStageUpdate?.({
      stage,
      stageIndex,
      status: 'completed',
      elapsedMs: elapsedSince(startedAt),
    });
  } catch (error) {
    const normalized = normalizeStageError(error, signal, stage, stageIndex);
    environment.onStageUpdate?.({
      stage,
      stageIndex,
      status: normalized instanceof ChoreographyStageTimeoutError ? 'timed_out' : 'failed',
      elapsedMs: elapsedSince(startedAt),
    });
    throw normalized;
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', abortStage);
  }
}

function normalizeStageError(
  error: unknown,
  parentSignal: AbortSignal,
  stage: ChoreographyStageKind,
  stageIndex: number,
): Error {
  if (parentSignal.aborted) return new TourPresentationCanceledError();
  if (error instanceof ChoreographyStageTimeoutError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new ChoreographyStageTimeoutError(stage, stageIndex);
  }
  return error instanceof Error ? error : new Error('Tour choreography failed');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new TourPresentationCanceledError();
}

function elapsedSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
