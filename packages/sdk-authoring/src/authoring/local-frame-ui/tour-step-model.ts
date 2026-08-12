import type { LodariqBlock } from '@lodariq/schema';
import type { EditableActionType, LocalAuthoringFrameSnapshot } from './types';
import { blockStatus, targetDiagnosticIsDrift, targetIdOf } from './utils';
import { authoringText } from '../../i18n';

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

export function stepHealth(
  step: LodariqBlock,
  snapshot: LocalAuthoringFrameSnapshot,
): { label: string; repair: boolean; tone: StepHealthTone } {
  const targetId = targetIdOf(step);
  if (!targetId) return { label: authoringText('Not placed'), repair: true, tone: 'repair' };

  const diagnostic = snapshot.targetDiagnostics.get(targetId)?.diagnostic;
  if (!diagnostic) return { label: authoringText('Unverified'), repair: false, tone: 'review' };
  if (diagnostic.state === 'missing') {
    return { label: authoringText('Missing'), repair: true, tone: 'repair' };
  }
  if (diagnostic.state === 'ambiguous') {
    return { label: authoringText('Ambiguous'), repair: true, tone: 'repair' };
  }
  if (diagnostic.state === 'needs_review') {
    return targetDiagnosticIsDrift(diagnostic)
      ? { label: authoringText('Drift detected'), repair: true, tone: 'repair' }
      : { label: authoringText('Needs verification'), repair: true, tone: 'review' };
  }

  const status = blockStatus(step);
  if (status === 'invalid') {
    return { label: authoringText('Needs fix'), repair: false, tone: 'repair' };
  }
  if (status === 'incomplete') {
    return { label: authoringText('Needs review'), repair: false, tone: 'review' };
  }
  return { label: authoringText('Verified'), repair: false, tone: 'ready' };
}

export function stepTooltip(step: LodariqBlock): LodariqBlock | null {
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
