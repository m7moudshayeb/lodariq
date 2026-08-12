import type { PublishReadinessIssue, PublishReadinessIssueCode } from '@lodariq/schema';
import type { FocusRevealTarget } from './types';

export interface PublishIssueRepairIntent {
  action: 'add-step' | 'focus-editor';
  actionLabel: string;
  focusTarget: 'block' | 'edit';
  propertyId?: string;
  reveal: FocusRevealTarget;
}

const PUBLISH_ISSUE_REPAIR_INTENTS = {
  unsupported_document_type: editorIntent('Review document'),
  empty_tour: {
    action: 'add-step',
    actionLabel: 'Add first step',
    focusTarget: 'edit',
    reveal: 'content',
  },
  unsupported_tour_block: editorIntent('Review block'),
  empty_step: contentIntent('Add content'),
  missing_step_tooltip: editorIntent('Review step'),
  missing_step_target: placementIntent('Choose target'),
  broken_target_reference: placementIntent('Replace target'),
  target_unverified: placementIntent('Verify target'),
  target_needs_review: placementIntent('Review target'),
  target_unresolved: placementIntent('Repair target'),
  target_ambiguous: placementIntent('Choose target'),
  button_missing_action: behaviorIntent('Choose action', 'button.action'),
  link_missing_action: behaviorIntent('Choose action', 'button.action'),
  open_page_missing_url: behaviorIntent('Add destination', 'button.destination'),
  open_page_unsafe_url: behaviorIntent('Fix destination', 'button.destination'),
  action_not_allowed: behaviorIntent('Choose action', 'button.action'),
  incomplete_media: contentIntent('Complete media'),
  unresolved_lifecycle_hint: placementIntent('Review timing'),
  invalid_presentation_anchor: placementIntent('Fix popup area'),
  invalid_block: editorIntent('Review block'),
  incomplete_block: editorIntent('Complete block'),
} as const satisfies Record<PublishReadinessIssueCode, PublishIssueRepairIntent>;

export function publishIssueRepairIntent(
  issue: Pick<PublishReadinessIssue, 'code'>,
): PublishIssueRepairIntent {
  return PUBLISH_ISSUE_REPAIR_INTENTS[issue.code];
}

export function publishIssueKey(issue: PublishReadinessIssue): string {
  return [issue.code, issue.blockId, issue.targetId, issue.message].filter(Boolean).join(':');
}

function editorIntent(actionLabel: string): PublishIssueRepairIntent {
  return {
    action: 'focus-editor',
    actionLabel,
    focusTarget: 'block',
    reveal: 'content',
  };
}

function behaviorIntent(actionLabel: string, propertyId: string): PublishIssueRepairIntent {
  return {
    action: 'focus-editor',
    actionLabel,
    focusTarget: 'block',
    propertyId,
    reveal: 'behavior',
  };
}

function contentIntent(actionLabel: string): PublishIssueRepairIntent {
  return {
    action: 'focus-editor',
    actionLabel,
    focusTarget: 'edit',
    reveal: 'content',
  };
}

function placementIntent(actionLabel: string): PublishIssueRepairIntent {
  return {
    action: 'focus-editor',
    actionLabel,
    focusTarget: 'block',
    reveal: 'placement',
  };
}
