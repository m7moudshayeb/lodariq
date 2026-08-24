import type {
  RecordedFlowSegment,
  RecordedSemanticAction,
  RecordToAuthorProposal,
  TargetApproach,
} from '@lodariq/schema';

const MAX_ACTIONS = 1_000;
const MAX_SEGMENTS = 100;

export function createRecordToAuthorProposal(
  actions: readonly RecordedSemanticAction[],
  proposalId = createProposalId(),
): RecordToAuthorProposal | null {
  const boundedActions = actions.slice(0, MAX_ACTIONS).map((action) => structuredClone(action));
  if (!boundedActions.length) return null;

  const segments = segmentRecordedActions(boundedActions);
  return {
    proposalId,
    actions: boundedActions,
    segments,
    evidenceBound: true,
    reviewRequired: true,
  };
}

function segmentRecordedActions(actions: readonly RecordedSemanticAction[]): RecordedFlowSegment[] {
  const groups: number[][] = [];
  let current: number[] = [];
  let currentHasTarget = false;
  actions.forEach((action, index) => {
    if (action.kind === 'target-observed' && currentHasTarget) {
      groups.push(current);
      current = [];
      currentHasTarget = false;
    }
    current.push(index);
    if (action.kind === 'target-observed') currentHasTarget = true;
  });
  if (current.length) groups.push(current);

  const segments: RecordedFlowSegment[] = [];
  for (const group of groups) {
    for (let start = 0; start < group.length && segments.length < MAX_SEGMENTS; start += 100) {
      const indexes = group.slice(start, start + 100);
      segments.push(recordedSegment(actions, indexes, segments.length));
    }
  }
  return segments;
}

function recordedSegment(
  actions: readonly RecordedSemanticAction[],
  actionIndexes: readonly number[],
  index: number,
): RecordedFlowSegment {
  const segmentActions = actionIndexes.flatMap((actionIndex) => {
    const action = actions[actionIndex];
    return action ? [action] : [];
  });
  const target = segmentActions.find(
    (action): action is Extract<RecordedSemanticAction, { kind: 'target-observed' }> =>
      action.kind === 'target-observed',
  );
  const proposedTitle = target?.accessibleName ?? `Recorded step ${index + 1}`;
  const approach = target ? recordedApproach(segmentActions, target.targetId) : undefined;
  return {
    segmentId: `record_segment_${index + 1}`,
    actionIndexes: [...actionIndexes],
    proposedTitle: proposedTitle.slice(0, 240),
    proposedCopy: target
      ? `Guide the user through ${target.accessibleName}.`.slice(0, 2_000)
      : 'Guide the user through this recorded flow.',
    ...(target ? { targetId: target.targetId, targetLabel: target.accessibleName } : {}),
    ...(approach ? { approach } : {}),
  };
}

function recordedApproach(
  actions: readonly RecordedSemanticAction[],
  finalTargetId: string,
): TargetApproach | undefined {
  const legs: TargetApproach['legs'] = [];
  for (const action of actions) {
    if (action.kind === 'target-observed' || legs.length >= 8) continue;
    const semanticName = approachIdentifier(action.semanticName);
    if (!semanticName) continue;
    if (action.kind === 'wait-for-lifecycle') {
      legs.push(
        action.lifecycleKind === 'route'
          ? {
              act: { kind: 'navigate', routePatternId: semanticName },
              label: `Open ${action.semanticName}`.slice(0, 120),
            }
          : {
              act: { kind: 'observe' },
              wait: { type: 'event', eventName: semanticName },
              label: `Wait for ${action.semanticName}`.slice(0, 120),
            },
      );
      continue;
    }
    if (semanticName === finalTargetId) continue;
    legs.push({
      act: { kind: 'activateTarget', targetId: semanticName },
      wait: { type: 'targetAvailable', targetId: finalTargetId },
      label: `${recordedActionLabel(action.kind)} ${action.semanticName}`.slice(0, 120),
    });
  }
  return legs.length ? { legs } : undefined;
}

function approachIdentifier(value: string): string | null {
  const candidate = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(candidate) ? candidate : null;
}

function recordedActionLabel(kind: RecordedSemanticAction['kind']): string {
  if (kind === 'open-panel') return 'Open';
  if (kind === 'select-tab') return 'Select';
  return 'Reveal';
}

function createProposalId(): string {
  const uuid = globalThis.crypto?.randomUUID?.().replace(/-/gu, '');
  if (uuid) return `record_${uuid}`;
  return `record_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}
