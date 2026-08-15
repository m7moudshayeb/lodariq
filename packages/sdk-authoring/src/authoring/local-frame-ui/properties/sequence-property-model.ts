import type { LodariqBlock, StepChoreography, StepChoreographyWait } from '@lodariq/schema';
import { authoringText } from '../../../i18n';

export const TRIGGER_OPTIONS = [
  { value: 'manual', label: authoringText('Use this button') },
  { value: 'activateTarget', label: authoringText('Activate the step target') },
  { value: 'observeTargetClick', label: authoringText('Wait for a target click') },
  { value: 'observeTargetFocus', label: authoringText('Wait for target focus') },
  { value: 'observeTargetInput', label: authoringText('Wait for target input') },
] as const;

export const WAIT_OPTIONS = [
  { value: 'targetAvailable', label: authoringText('Target becomes available') },
  { value: 'route', label: authoringText('Route matches') },
  { value: 'textVisible', label: authoringText('Text becomes visible') },
  { value: 'event', label: authoringText('Named product event occurs') },
  { value: 'networkIdle', label: authoringText('Network becomes idle') },
] as const;

export const TRANSITION_OPTIONS = [
  { value: 'next', label: authoringText('Continue to the next step') },
  { value: 'complete', label: authoringText('Complete the tour') },
  { value: 'stay', label: authoringText('Stay on this step') },
] as const;

export const TIMEOUT_OPTIONS = [
  { value: 'retry', label: authoringText('Retry once') },
  { value: 'stay', label: authoringText('Offer recovery choices') },
  { value: 'skip', label: authoringText('Skip this step') },
  { value: 'dismiss', label: authoringText('Exit the tour') },
  { value: 'goToStep', label: authoringText('Go to a recovery step') },
] as const;

export type WaitType = (typeof WAIT_OPTIONS)[number]['value'];

export function currentSequence(
  block: LodariqBlock,
  targetId: string | undefined,
): StepChoreography {
  if (block.props.action?.type === 'runSequence' && block.props.action.sequence) {
    return block.props.action.sequence;
  }
  return {
    trigger: targetId ? { type: 'activateTarget', targetId } : { type: 'manual' },
    waitFor: [],
    transition: { type: 'next' },
    timeoutMs: 3_000,
    onTimeout: 'stay',
  };
}

export function createWait(
  type: WaitType,
  targetId: string | undefined,
): StepChoreographyWait | null {
  if (type === 'targetAvailable') return targetId ? { type, targetId } : null;
  if (type === 'route') return { type, match: 'exact', value: '/' };
  if (type === 'textVisible') return { type, value: authoringText('Ready'), locale: 'en' };
  if (type === 'event') return { type, eventName: 'product.ready' };
  return { type: 'networkIdle' };
}

export function waitLabelFor(wait: StepChoreographyWait): string {
  return (
    WAIT_OPTIONS.find((option) => option.value === wait.type)?.label ?? authoringText('Condition')
  );
}

export function isWaitType(value: string): value is WaitType {
  return WAIT_OPTIONS.some((option) => option.value === value);
}

export function isTriggerType(value: string): value is (typeof TRIGGER_OPTIONS)[number]['value'] {
  return TRIGGER_OPTIONS.some((option) => option.value === value);
}
