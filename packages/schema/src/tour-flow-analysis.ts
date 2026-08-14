import type { BlockActionProps, LodariqBlock } from './block';
import type { LodariqDocument } from './document';
import type { StepTransitionDestination } from './flow';
import {
  TOUR_RENDERABLE_LEAF_BLOCK_TYPES,
  type AnalyzeTourFlowOptions,
  type TourFlowActionNodeInput,
  type TourFlowAnalysis,
  type TourFlowEdge,
  type TourFlowIssue,
  type TourFlowIssueCode,
  type TourFlowNode,
  type TourFlowStepInput,
} from './tour-flow-contract';

const TOUR_RENDERABLE_LEAF_BLOCK_TYPE_SET = new Set<string>(TOUR_RENDERABLE_LEAF_BLOCK_TYPES);

/**
 * Analyze canonical Tour topology without compiling presentation or theme data.
 * Compiler preflight, authoring, control-plane, and dashboard surfaces share this result.
 */
export function analyzeTourFlow(
  steps: readonly TourFlowStepInput[],
  options: AnalyzeTourFlowOptions = {},
): TourFlowAnalysis {
  const findings: TourFlowIssue[] = [];
  const stepIndexById = new Map(steps.map((step, index) => [step.id, index]));
  const nodes = steps.map((step, stepIndex): TourFlowNode => ({
    id: step.id,
    index: stepIndex,
    edges:
      step.id === options.completionStepId
        ? [terminalEdge(step.id)]
        : deriveStepEdges(step, stepIndex, steps, stepIndexById, findings),
  }));
  if (nodes.length === 0) return { findings, nodes };

  const reachable = new Set<number>();
  visitReachable(0, nodes, stepIndexById, reachable);
  const completionStepIndex = options.completionStepId
    ? stepIndexById.get(options.completionStepId)
    : undefined;
  if (completionStepIndex !== undefined) {
    visitReachable(completionStepIndex, nodes, stepIndexById, reachable);
  }
  for (const node of nodes) {
    if (!reachable.has(node.index)) {
      findings.push(flowIssue('unreachable_step', 'warning', node));
    }
  }

  const allPathsTerminate = pathTerminates(
    0,
    nodes,
    stepIndexById,
    new Set<number>(),
    new Map<number, boolean>(),
    findings,
  );
  if (!allPathsTerminate) {
    findings.push(flowIssue('missing_terminal_completion', 'blocker', nodes[0]!));
  }
  return { findings: dedupeFindings(findings), nodes };
}

export function analyzeTourDocumentFlow(document: LodariqDocument): TourFlowAnalysis {
  if (document.type !== 'tour') return { findings: [], nodes: [] };
  const completionStepId =
    document.completion?.type === 'showStep' ? document.completion.stepId : undefined;
  return analyzeTourFlow(tourFlowStepInputs(document.blocks), {
    ...(completionStepId ? { completionStepId } : {}),
  });
}

export function tourFlowStepInputs(blocks: readonly LodariqBlock[]): TourFlowStepInput[] {
  return blocks
    .filter((block) => block.type === 'tourStep')
    .map((step) => ({ id: step.id, actionNodes: collectRenderableLeafNodes(step) }));
}

function collectRenderableLeafNodes(step: LodariqBlock): TourFlowActionNodeInput[] {
  const nodes: TourFlowActionNodeInput[] = [];
  for (const child of step.children) collectRenderableLeafNode(child, nodes);
  return nodes;
}

function collectRenderableLeafNode(block: LodariqBlock, nodes: TourFlowActionNodeInput[]): void {
  if (TOUR_RENDERABLE_LEAF_BLOCK_TYPE_SET.has(block.type)) {
    nodes.push({ id: block.id, ...(block.props.action ? { action: block.props.action } : {}) });
  }
  for (const child of block.children) collectRenderableLeafNode(child, nodes);
}

function deriveStepEdges(
  step: TourFlowStepInput,
  stepIndex: number,
  steps: readonly TourFlowStepInput[],
  stepIndexById: ReadonlyMap<string, number>,
  findings: TourFlowIssue[],
): TourFlowEdge[] {
  const actionNodes = step.actionNodes
    .map((node, actionNodeIndex) => ({ ...node, actionNodeIndex }))
    .filter((node) => node.action);
  if (actionNodes.length === 0) return [implicitEdge(step.id, stepIndex, steps)];

  const edges: TourFlowEdge[] = [];
  for (const actionNode of actionNodes) {
    const action = actionNode.action;
    if (!action) continue;
    if (action.transition) {
      action.transition.rules.forEach((rule) => {
        edges.push(
          destinationEdge(
            rule.to,
            'rule',
            rule.all.length,
            step,
            stepIndex,
            actionNode,
            steps,
            stepIndexById,
            findings,
          ),
        );
      });
      edges.push(
        destinationEdge(
          action.transition.fallback,
          'fallback',
          0,
          step,
          stepIndex,
          actionNode,
          steps,
          stepIndexById,
          findings,
        ),
      );
      continue;
    }
    edges.push(actionEdge(action, step, stepIndex, actionNode, steps, stepIndexById, findings));
  }
  return edges;
}

function actionEdge(
  action: BlockActionProps,
  step: TourFlowStepInput,
  stepIndex: number,
  actionNode: TourFlowActionNodeInput & { actionNodeIndex: number },
  steps: readonly TourFlowStepInput[],
  stepIndexById: ReadonlyMap<string, number>,
  findings: TourFlowIssue[],
): TourFlowEdge {
  if (action.type === 'complete' || action.type === 'openPage') {
    return actionDestinationEdge(step, actionNode, { type: 'complete' });
  }
  if (action.type === 'dismiss') {
    return actionDestinationEdge(step, actionNode, { type: 'dismiss' });
  }
  if (action.type === 'back') {
    const previous = steps[Math.max(0, stepIndex - 1)];
    const destination = previous
      ? ({ type: 'step', stepId: previous.id } as const)
      : ({ type: 'complete' } as const);
    return actionDestinationEdge(step, actionNode, destination);
  }
  if (action.type === 'runSequence') {
    const transition = action.sequence.transition;
    let destination: StepTransitionDestination;
    if (transition.type === 'stay') destination = { type: 'step', stepId: step.id };
    else if (transition.type === 'step') destination = transition;
    else destination = transition;
    return destinationEdge(
      destination,
      'action',
      0,
      step,
      stepIndex,
      actionNode,
      steps,
      stepIndexById,
      findings,
    );
  }
  return {
    ...implicitEdge(step.id, stepIndex, steps),
    actionBlockId: actionNode.id,
    actionNodeIndex: actionNode.actionNodeIndex,
    kind: 'action',
  };
}

function destinationEdge(
  destination: StepTransitionDestination,
  kind: TourFlowEdge['kind'],
  conditionCount: number,
  step: TourFlowStepInput,
  stepIndex: number,
  actionNode: TourFlowActionNodeInput & { actionNodeIndex: number },
  steps: readonly TourFlowStepInput[],
  stepIndexById: ReadonlyMap<string, number>,
  findings: TourFlowIssue[],
): TourFlowEdge {
  if (destination.type === 'step' && !stepIndexById.has(destination.stepId)) {
    findings.push({
      actionBlockId: actionNode.id,
      actionNodeIndex: actionNode.actionNodeIndex,
      code: 'invalid_flow_edge',
      severity: 'blocker',
      stepId: step.id,
      stepIndex,
    });
  }
  const resolvedDestination =
    destination.type === 'next' ? implicitDestination(stepIndex, steps) : destination;
  return {
    actionBlockId: actionNode.id,
    actionNodeIndex: actionNode.actionNodeIndex,
    conditionCount,
    fromStepId: step.id,
    kind,
    to: resolvedDestination,
  };
}

function actionDestinationEdge(
  step: TourFlowStepInput,
  actionNode: TourFlowActionNodeInput & { actionNodeIndex: number },
  to: StepTransitionDestination,
): TourFlowEdge {
  return {
    actionBlockId: actionNode.id,
    actionNodeIndex: actionNode.actionNodeIndex,
    conditionCount: 0,
    fromStepId: step.id,
    kind: 'action',
    to,
  };
}

function implicitEdge(
  stepId: string,
  stepIndex: number,
  steps: readonly TourFlowStepInput[],
): TourFlowEdge {
  return {
    conditionCount: 0,
    fromStepId: stepId,
    kind: 'implicit',
    to: implicitDestination(stepIndex, steps),
  };
}

function terminalEdge(stepId: string): TourFlowEdge {
  return {
    conditionCount: 0,
    fromStepId: stepId,
    kind: 'implicit',
    to: { type: 'complete' },
  };
}

function implicitDestination(
  stepIndex: number,
  steps: readonly TourFlowStepInput[],
): StepTransitionDestination {
  const next = steps[stepIndex + 1];
  return next ? { type: 'step', stepId: next.id } : { type: 'complete' };
}

function visitReachable(
  stepIndex: number,
  nodes: readonly TourFlowNode[],
  stepIndexById: ReadonlyMap<string, number>,
  visited: Set<number>,
): void {
  if (visited.has(stepIndex) || !nodes[stepIndex]) return;
  visited.add(stepIndex);
  for (const edge of nodes[stepIndex].edges) {
    const destinationIndex = destinationStepIndex(edge.to, stepIndex, nodes, stepIndexById);
    if (destinationIndex !== undefined) {
      visitReachable(destinationIndex, nodes, stepIndexById, visited);
    }
  }
}

function pathTerminates(
  stepIndex: number,
  nodes: readonly TourFlowNode[],
  stepIndexById: ReadonlyMap<string, number>,
  visiting: Set<number>,
  memo: Map<number, boolean>,
  findings: TourFlowIssue[],
): boolean {
  const cached = memo.get(stepIndex);
  if (cached !== undefined) return cached;
  const node = nodes[stepIndex];
  if (!node) return true;
  if (visiting.has(stepIndex)) {
    findings.push(flowIssue('non_terminating_flow', 'blocker', node));
    return false;
  }
  const nextVisiting = new Set(visiting).add(stepIndex);
  const terminates =
    node.edges.length > 0 &&
    node.edges.every((edge) => {
      const destinationIndex = destinationStepIndex(edge.to, stepIndex, nodes, stepIndexById);
      if (destinationIndex === undefined) return true;
      return pathTerminates(destinationIndex, nodes, stepIndexById, nextVisiting, memo, findings);
    });
  memo.set(stepIndex, terminates);
  return terminates;
}

function destinationStepIndex(
  destination: StepTransitionDestination,
  sourceStepIndex: number,
  nodes: readonly TourFlowNode[],
  stepIndexById: ReadonlyMap<string, number>,
): number | undefined {
  if (destination.type === 'step') return stepIndexById.get(destination.stepId);
  if (destination.type !== 'next') return undefined;
  return nodes[sourceStepIndex + 1]?.index;
}

function flowIssue(
  code: TourFlowIssueCode,
  severity: TourFlowIssue['severity'],
  node: TourFlowNode,
): TourFlowIssue {
  return { code, severity, stepId: node.id, stepIndex: node.index };
}

function dedupeFindings(findings: readonly TourFlowIssue[]): TourFlowIssue[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.stepIndex}:${finding.actionNodeIndex ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
