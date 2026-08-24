import type { LodariqBlock } from '@lodariq/schema';
import type { EditableActionType, LocalAuthoringFrameSnapshot } from './types';
import { blockStatus, targetDiagnosticIsDrift, targetIdOf } from './utils';
import { authoringText } from '../../i18n';
import type { AuthoringTargetHealthPresentation } from '../target-health-ledger';
import {
  targetVerificationPresentation,
  type TargetVerificationState,
} from '../target-verification';

export type StepHealthTone = 'ready' | 'repair' | 'review';

export function elementActionLabelFor(needsRepair: boolean, hasTarget: boolean): string {
  if (!hasTarget) return authoringText('Choose element');
  if (needsRepair) return authoringText('Fix element');
  return authoringText('Change element');
}

export function targetActionLabelFor(needsRepair: boolean, hasTarget: boolean): string {
  if (!hasTarget) return authoringText('Choose target');
  return needsRepair ? authoringText('Fix placement') : authoringText('Change target');
}

export function storyboardStepPreview(step: LodariqBlock): { body: string; action: string | null } {
  const tooltip = stepTooltip(step);
  if (!tooltip) return { body: authoringText('Add popup content'), action: null };
  const bodyBlock = tooltip.children.find(
    (child) => child.type === 'paragraph' || child.type === 'heading',
  );
  const actionBlock = tooltip.children.find(
    (child) => child.type === 'button' || child.type === 'link',
  );
  return {
    body: bodyBlock?.content?.trim() || authoringText('Add popup content'),
    action: actionBlock?.content?.trim() || null,
  };
}

export function stepPlacementFact(
  targetId: string | null,
  targetLabel: string,
  health: { label: string },
): string {
  if (!targetId) return authoringText('Not placed yet');
  const status =
    health.label === authoringText('Verified') ? authoringText('Placed') : health.label;
  return `${targetLabel} · ${status}`;
}

/**
 * Step verification in the creator's three states (§4.4, audit #2).
 *
 * The build used to distinguish `Unverified`, `Unavailable in current context`,
 * `Drift detected`, `Ambiguous` and `Missing` — five words for three situations,
 * and the audit caught the worst of it: a modal `Close` button reported as a
 * failure because it was simply not on screen at that moment.
 *
 * Verified · Needs context · Can’t find. Each says what to do about it.
 */
export function stepHealth(
  step: LodariqBlock,
  snapshot: LocalAuthoringFrameSnapshot,
): { label: string; repair: boolean; tone: StepHealthTone } {
  const targetId = targetIdOf(step);
  if (!targetId) return { label: authoringText('Not placed'), repair: true, tone: 'repair' };

  const presentation = targetPresentationFor(targetId, snapshot);
  if (presentation) return healthFromPresentation(presentation);

  const status = blockStatus(step);
  if (status === 'invalid') {
    return { label: authoringText('Needs fix'), repair: false, tone: 'repair' };
  }
  if (status === 'incomplete') {
    return { label: authoringText('Needs review'), repair: false, tone: 'review' };
  }
  return healthFromPresentation('verified');
}

/** The ledger's view when it has one, otherwise the last raw diagnostic. */
function targetPresentationFor(
  targetId: string,
  snapshot: LocalAuthoringFrameSnapshot,
): AuthoringTargetHealthPresentation | null {
  const health = snapshot.targetHealth.get(targetId);
  if (health) {
    // A drifted observation is a failure even when the ledger still says unverified.
    if (health.presentation === 'unverified') {
      const diagnostic = health.currentObservation;
      return diagnostic && targetDiagnosticIsDrift(diagnostic) ? 'drifted' : 'unverified';
    }
    return health.presentation;
  }
  const diagnostic = snapshot.targetDiagnostics.get(targetId)?.diagnostic;
  if (diagnostic?.state === 'found') return 'verified';
  if (diagnostic?.state === 'missing') return 'missing';
  if (diagnostic?.state === 'ambiguous') return 'ambiguous';
  return null;
}

const HEALTH_TONE_BY_STATE: Readonly<Record<TargetVerificationState, StepHealthTone>> = {
  verified: 'ready',
  'needs-context': 'review',
  'cannot-find': 'repair',
  checking: 'review',
};

function healthFromPresentation(presentation: AuthoringTargetHealthPresentation): {
  label: string;
  repair: boolean;
  tone: StepHealthTone;
} {
  const shown = targetVerificationPresentation(presentation);
  return {
    label: shown.label,
    repair: shown.state === 'cannot-find',
    tone: HEALTH_TONE_BY_STATE[shown.state],
  };
}

export function stepTooltip(step: LodariqBlock): LodariqBlock | null {
  if (step.type === 'tooltip') return step;
  return step.children.find((child) => child.type === 'tooltip') ?? null;
}

export function stepPrimaryButton(step: LodariqBlock): LodariqBlock | null {
  return stepTooltip(step)?.children.find((child) => child.type === 'button') ?? null;
}

export function buttonAdvanceValue(
  button: LodariqBlock | null,
): Extract<EditableActionType, 'next' | 'clickTarget'> {
  return button?.props.action?.type === 'clickTarget' ? 'clickTarget' : 'next';
}
