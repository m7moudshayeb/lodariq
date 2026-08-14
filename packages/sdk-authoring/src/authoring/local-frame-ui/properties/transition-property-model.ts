import type {
  LodariqBlock,
  StepTransitionCondition,
  StepTransitionDestination,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { blockDisplayTitle } from '../utils';

export function blockIsInside(block: LodariqBlock, blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => blockIsInside(child, blockId));
}

export function destinationOptions(steps: readonly LodariqBlock[]) {
  return [
    { value: 'next', label: authoringText('Next step') },
    { value: 'complete', label: authoringText('Complete the tour') },
    { value: 'dismiss', label: authoringText('Close the tour') },
    ...steps.map((step) => ({
      value: `step:${step.id}`,
      label: authoringText('Step: {name}', { name: blockDisplayTitle(step) }),
    })),
  ];
}

export function defaultCondition(
  source: StepTransitionCondition['source'] = 'identifyTrait',
): StepTransitionCondition {
  if (source === 'namedEvent') return { source, eventName: 'product.event' };
  if (source === 'locale') return { source, locale: 'en' };
  if (source === 'completedStep') return { source, stepId: 'step-1' };
  return { source, key: 'key', operator: 'exists' };
}

export function destinationValue(destination: StepTransitionDestination): string {
  return destination.type === 'step' ? `step:${destination.stepId}` : destination.type;
}

export function destinationFromValue(value: string): StepTransitionDestination {
  if (value.startsWith('step:')) return { type: 'step', stepId: value.slice(5) };
  if (value === 'complete' || value === 'dismiss') return { type: value };
  return { type: 'next' };
}

export function normalizeIdentifier(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/gu, '-')
    .slice(0, 128);
  return normalized || 'key';
}
