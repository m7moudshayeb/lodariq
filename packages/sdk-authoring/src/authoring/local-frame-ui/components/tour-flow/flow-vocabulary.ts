import type {
  LodariqBlock,
  StepChoreography,
  StepChoreographyTrigger,
  StepChoreographyWait,
} from '@lodariq/schema';
import { authoringText } from '../../../../i18n';

export interface ExperienceFlowVocabulary {
  actionTypeLabel: (type: string | undefined) => string;
  branchLabel: (
    kind: 'implicit' | 'rule' | 'fallback' | 'action',
    conditions: number,
    index: number,
  ) => string | undefined;
  outcomeSubtitle: (sequence: StepChoreography) => string;
  outcomeTitle: (sequence: StepChoreography) => string;
  terminalSubtitle: (type: 'complete' | 'dismiss') => string;
  terminalTitle: (type: 'complete' | 'dismiss') => string;
  triggerSubtitle: (trigger: StepChoreographyTrigger, block: LodariqBlock) => string;
  waitSubtitle: (wait: StepChoreographyWait, sequence: StepChoreography) => string;
  waitTitle: (wait: StepChoreographyWait) => string;
}

export const TOUR_FLOW_VOCABULARY: ExperienceFlowVocabulary = {
  actionTypeLabel(type) {
    if (type === 'back') return authoringText('Go back');
    if (type === 'complete') return authoringText('Complete tour');
    if (type === 'clickTarget') return authoringText('Click target');
    if (type === 'openPage') return authoringText('Open page');
    if (type === 'dismiss') return authoringText('Close experience');
    return authoringText('Go to next step');
  },
  branchLabel(kind, conditions, index) {
    if (kind === 'rule') return authoringText('Rule {number}', { number: index + 1 });
    if (kind === 'fallback') return authoringText('Fallback path');
    if (conditions > 0) return authoringText('{count} conditions', { count: conditions });
    return undefined;
  },
  outcomeSubtitle(sequence) {
    if (sequence.transition.type === 'step') return sequence.transition.stepId;
    return authoringText('Continue with');
  },
  outcomeTitle(sequence) {
    if (sequence.transition.type === 'complete') return authoringText('Complete tour');
    if (sequence.transition.type === 'stay') return authoringText('Stay on this step');
    if (sequence.transition.type === 'step') return authoringText('Go to a recovery step');
    return authoringText('Continue to the next step');
  },
  terminalSubtitle(type) {
    return type === 'dismiss' ? authoringText('Close the tour') : authoringText('Completion');
  },
  terminalTitle(type) {
    return type === 'dismiss' ? authoringText('Close experience') : authoringText('Complete tour');
  },
  triggerSubtitle(trigger, block) {
    if (trigger.type === 'manual') return block.content?.trim() || authoringText('Use this button');
    if (trigger.type === 'activateTarget') return authoringText('Activate the step target');
    if (trigger.type === 'observeTargetClick') return authoringText('Wait for a target click');
    return authoringText('Wait for target focus');
  },
  waitSubtitle(wait, sequence) {
    if (wait.type === 'route') return wait.value;
    if (wait.type === 'textVisible') return wait.value;
    if (wait.type === 'event') return wait.eventName;
    return authoringText('Time limit') + ` · ${sequence.timeoutMs / 1_000}s`;
  },
  waitTitle(wait) {
    if (wait.type === 'targetAvailable') return authoringText('Target becomes available');
    if (wait.type === 'route') return authoringText('Route matches');
    if (wait.type === 'textVisible') return authoringText('Text becomes visible');
    if (wait.type === 'event') return authoringText('Named product event occurs');
    return authoringText('Network becomes idle');
  },
};
