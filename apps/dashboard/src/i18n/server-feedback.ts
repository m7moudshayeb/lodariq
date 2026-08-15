import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';

interface PublishIssueCopy {
  label: MessageDescriptor;
  message: MessageDescriptor;
}

const UNKNOWN_PUBLISH_ISSUE: PublishIssueCopy = {
  label: msg({ id: 'dashboard.publishIssue.unknown.label', message: 'Publish check' }),
  message: msg({
    id: 'dashboard.publishIssue.unknown.message',
    message: 'This publish check needs attention before release.',
  }),
};

const PUBLISH_ISSUE_COPY: Readonly<Record<string, PublishIssueCopy>> = {
  unsupported_document_type: publishIssue(
    msg({
      id: 'dashboard.publishIssue.unsupportedDocumentType.label',
      message: 'Unsupported document',
    }),
    msg({
      id: 'dashboard.publishIssue.unsupportedDocumentType.message',
      message: 'Only tour experiences can be published right now.',
    }),
  ),
  empty_tour: publishIssue(
    msg({ id: 'dashboard.publishIssue.emptyTour.label', message: 'Empty tour' }),
    msg({
      id: 'dashboard.publishIssue.emptyTour.message',
      message: 'Add at least one step before publishing.',
    }),
  ),
  unsupported_tour_block: publishIssue(
    msg({ id: 'dashboard.publishIssue.unsupportedTourBlock.label', message: 'Unsupported block' }),
    msg({
      id: 'dashboard.publishIssue.unsupportedTourBlock.message',
      message: 'Remove or change the unsupported block before publishing.',
    }),
  ),
  empty_step: publishIssue(
    msg({ id: 'dashboard.publishIssue.emptyStep.label', message: 'Empty step' }),
    msg({
      id: 'dashboard.publishIssue.emptyStep.message',
      message: 'Add content to this step before publishing.',
    }),
  ),
  missing_step_tooltip: publishIssue(
    msg({ id: 'dashboard.publishIssue.missingStepContent.label', message: 'Missing step content' }),
    msg({
      id: 'dashboard.publishIssue.missingStepContent.message',
      message: 'Add visible content to this step before publishing.',
    }),
  ),
  missing_step_target: publishIssue(
    msg({ id: 'dashboard.publishIssue.missingTarget.label', message: 'Missing target' }),
    msg({
      id: 'dashboard.publishIssue.missingTarget.message',
      message: 'Choose where this step appears before publishing.',
    }),
  ),
  broken_target_reference: publishIssue(
    msg({ id: 'dashboard.publishIssue.brokenTarget.label', message: 'Broken target' }),
    msg({
      id: 'dashboard.publishIssue.brokenTarget.message',
      message: 'Choose the placement again so Lodariq can verify it.',
    }),
  ),
  target_unverified: publishIssue(
    msg({ id: 'dashboard.publishIssue.unverifiedTarget.label', message: 'Unverified target' }),
    msg({
      id: 'dashboard.publishIssue.unverifiedTarget.message',
      message: 'Verify this placement in the current environment before publishing.',
    }),
  ),
  target_needs_review: publishIssue(
    msg({ id: 'dashboard.publishIssue.targetNeedsReview.label', message: 'Target needs review' }),
    msg({
      id: 'dashboard.publishIssue.targetNeedsReview.message',
      message: 'Review and verify this placement before publishing.',
    }),
  ),
  target_unresolved: publishIssue(
    msg({ id: 'dashboard.publishIssue.unresolvedTarget.label', message: 'Unresolved target' }),
    msg({
      id: 'dashboard.publishIssue.unresolvedTarget.message',
      message: 'Choose the placement again on the page where it appears.',
    }),
  ),
  target_ambiguous: publishIssue(
    msg({ id: 'dashboard.publishIssue.ambiguousTarget.label', message: 'Ambiguous target' }),
    msg({
      id: 'dashboard.publishIssue.ambiguousTarget.message',
      message: 'Choose a more specific placement before publishing.',
    }),
  ),
  button_missing_action: publishIssue(
    msg({
      id: 'dashboard.publishIssue.buttonMissingAction.label',
      message: 'Incomplete button action',
    }),
    msg({
      id: 'dashboard.publishIssue.buttonMissingAction.message',
      message: 'Choose what happens when this button is selected.',
    }),
  ),
  link_missing_action: publishIssue(
    msg({
      id: 'dashboard.publishIssue.linkMissingAction.label',
      message: 'Incomplete link action',
    }),
    msg({
      id: 'dashboard.publishIssue.linkMissingAction.message',
      message: 'Choose what happens when this link is selected.',
    }),
  ),
  open_page_missing_url: publishIssue(
    msg({ id: 'dashboard.publishIssue.missingUrl.label', message: 'Missing URL' }),
    msg({
      id: 'dashboard.publishIssue.missingUrl.message',
      message: 'Add a safe page URL before publishing.',
    }),
  ),
  open_page_unsafe_url: publishIssue(
    msg({ id: 'dashboard.publishIssue.unsafeUrl.label', message: 'Unsafe URL' }),
    msg({
      id: 'dashboard.publishIssue.unsafeUrl.message',
      message: 'Use an HTTPS URL or a safe relative path.',
    }),
  ),
  action_not_allowed: publishIssue(
    msg({ id: 'dashboard.publishIssue.unsupportedAction.label', message: 'Unsupported action' }),
    msg({
      id: 'dashboard.publishIssue.unsupportedAction.message',
      message: 'Choose a supported action before publishing.',
    }),
  ),
  incomplete_media: publishIssue(
    msg({ id: 'dashboard.publishIssue.incompleteMedia.label', message: 'Incomplete media' }),
    msg({
      id: 'dashboard.publishIssue.incompleteMedia.message',
      message: 'Finish configuring this media block before publishing.',
    }),
  ),
  unresolved_lifecycle_hint: publishIssue(
    msg({
      id: 'dashboard.publishIssue.unresolvedLifecycleHint.label',
      message: 'Unresolved lifecycle hint',
    }),
    msg({
      id: 'dashboard.publishIssue.unresolvedLifecycleHint.message',
      message: 'Update the placement setup so the target can be prepared reliably.',
    }),
  ),
  invalid_presentation_anchor: publishIssue(
    msg({
      id: 'dashboard.publishIssue.invalidPresentationArea.label',
      message: 'Invalid presentation area',
    }),
    msg({
      id: 'dashboard.publishIssue.invalidPresentationArea.message',
      message: 'Choose a valid area inside the selected element.',
    }),
  ),
  invalid_block: publishIssue(
    msg({ id: 'dashboard.publishIssue.invalidBlock.label', message: 'Invalid block' }),
    msg({
      id: 'dashboard.publishIssue.invalidBlock.message',
      message: 'Fix this block’s configuration before publishing.',
    }),
  ),
  incomplete_block: publishIssue(
    msg({ id: 'dashboard.publishIssue.incompleteBlock.label', message: 'Incomplete block' }),
    msg({
      id: 'dashboard.publishIssue.incompleteBlock.message',
      message: 'Complete the required fields before publishing.',
    }),
  ),
  invalid_flow_edge: publishIssue(
    msg({ id: 'dashboard.publishIssue.invalidFlowEdge.label', message: 'Broken flow connection' }),
    msg({
      id: 'dashboard.publishIssue.invalidFlowEdge.message',
      message: 'Reconnect this action to a step that still exists.',
    }),
  ),
  unreachable_step: publishIssue(
    msg({ id: 'dashboard.publishIssue.unreachableStep.label', message: 'Unreachable step' }),
    msg({
      id: 'dashboard.publishIssue.unreachableStep.message',
      message: 'Connect this step to a path people can reach.',
    }),
  ),
  non_terminating_flow: publishIssue(
    msg({ id: 'dashboard.publishIssue.nonTerminatingFlow.label', message: 'Flow does not finish' }),
    msg({
      id: 'dashboard.publishIssue.nonTerminatingFlow.message',
      message: 'Add an outcome that lets this repeating path finish.',
    }),
  ),
  missing_terminal_completion: publishIssue(
    msg({
      id: 'dashboard.publishIssue.missingTerminalCompletion.label',
      message: 'Missing completion path',
    }),
    msg({
      id: 'dashboard.publishIssue.missingTerminalCompletion.message',
      message: 'Make sure every possible path can complete or dismiss the tour.',
    }),
  ),
};

const UNKNOWN_RECOVERY_FAILURE = msg({
  id: 'dashboard.recovery.failure.unknown',
  message: 'Release recovery could not be completed.',
});

const RECOVERY_FAILURE_MESSAGES: Readonly<Record<string, MessageDescriptor>> = {
  capability_denied: msg({
    id: 'dashboard.recovery.failure.capabilityDenied',
    message: 'Your workspace role cannot perform this recovery action.',
  }),
  environment_not_configured: msg({
    id: 'dashboard.recovery.failure.environmentNotConfigured',
    message: 'This release environment is not configured.',
  }),
  document_not_found: msg({
    id: 'dashboard.recovery.failure.documentNotFound',
    message: 'The release document could not be found.',
  }),
  rollback_target_invalid: msg({
    id: 'dashboard.recovery.failure.rollbackTargetInvalid',
    message: 'Select an earlier successful publication from this release history.',
  }),
  artifact_incompatible: msg({
    id: 'dashboard.recovery.failure.artifactIncompatible',
    message: 'The selected publication is not supported by the current runtime.',
  }),
  deployment_changed: msg({
    id: 'dashboard.recovery.failure.deploymentChanged',
    message: 'The active deployment changed. Refresh the release history and try again.',
  }),
  already_inactive: msg({
    id: 'dashboard.recovery.failure.alreadyInactive',
    message: 'Delivery is already inactive for this document.',
  }),
  idempotency_conflict: msg({
    id: 'dashboard.recovery.failure.idempotencyConflict',
    message: 'This recovery request conflicts with an earlier request. Refresh and try again.',
  }),
  release_operation_in_progress: msg({
    id: 'dashboard.recovery.failure.operationInProgress',
    message: 'Another release operation is already in progress. Try again shortly.',
  }),
  internal_error: UNKNOWN_RECOVERY_FAILURE,
};

export function dashboardPublishIssueCopy(code: string): PublishIssueCopy {
  return PUBLISH_ISSUE_COPY[code] ?? UNKNOWN_PUBLISH_ISSUE;
}

export function dashboardRecoveryFailureMessage(code: string): MessageDescriptor {
  return RECOVERY_FAILURE_MESSAGES[code] ?? UNKNOWN_RECOVERY_FAILURE;
}

function publishIssue(label: MessageDescriptor, message: MessageDescriptor): PublishIssueCopy {
  return { label, message };
}
