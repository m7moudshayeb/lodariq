import type { CompiledStep, StepChoreography } from '@lodariq/schema';
import type { ChoreographyStageUpdate } from './tour-choreography';

export type TourSequenceExecutionResult =
  'aborted' | 'completed' | 'dismiss' | 'recover' | 'retry' | 'skip' | { stepId: string };

export interface ExecuteTourSequenceOptions {
  onStageUpdate?: (update: ChoreographyStageUpdate) => void;
  resolveTarget: (
    targetId: string,
    requiredAction: 'activate' | 'observe-click' | 'focus' | 'anchor',
  ) => Element | null;
  runTransition: () => void;
  sequence: StepChoreography;
  signal: AbortSignal;
  step: CompiledStep;
}

export async function executeTourSequence({
  onStageUpdate,
  resolveTarget,
  runTransition,
  sequence,
  signal,
  step,
}: ExecuteTourSequenceOptions): Promise<TourSequenceExecutionResult> {
  const choreography = await import('./tour-choreography-runtime');
  if (signal.aborted) return 'aborted';
  try {
    await choreography.executeRuntimeChoreography(
      sequence,
      step,
      { resolveTarget, runTransition, onStageUpdate },
      signal,
    );
    return signal.aborted ? 'aborted' : 'completed';
  } catch (error) {
    if (signal.aborted) return 'aborted';
    if (!(error instanceof choreography.ChoreographyStageTimeoutError)) return 'recover';
    if (sequence.onTimeout === 'dismiss') return 'dismiss';
    if (sequence.onTimeout === 'skip') return 'skip';
    if (sequence.onTimeout === 'retry') return 'retry';
    if (sequence.onTimeout === 'goToStep') return { stepId: sequence.timeoutStepId };
    return 'recover';
  }
}
