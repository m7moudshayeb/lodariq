import type { LodariqBlock, StepTransitionDestination } from '@lodariq/schema';
import { authoringText } from '../../../../i18n';
import type { DerivedTourFlowMap, DerivedTourFlowNode } from '../../../tour-flow-map';
import {
  actionNodeId,
  canvasNode,
  flowEdge,
  stepNodeId,
  terminalNodeId,
} from './flow-element-factories';
import type {
  TourFlowCanvasEdge,
  TourFlowCanvasNode,
  TourFlowElements,
} from './flow-element-types';
import { TOUR_FLOW_VOCABULARY, type ExperienceFlowVocabulary } from './flow-vocabulary';

export type {
  TourFlowCanvasEdge,
  TourFlowCanvasEdgeData,
  TourFlowCanvasNode,
  TourFlowCanvasNodeData,
  TourFlowCanvasNodeKind,
  TourFlowElements,
} from './flow-element-types';
export { stepNodeId } from './flow-element-factories';

const STEP_X = 48;
const ACTION_X = 360;
const ACTION_GAP = 232;
const ROW_GAP = 176;

export function buildTourFlowElements(
  flow: DerivedTourFlowMap,
  steps: readonly LodariqBlock[],
): TourFlowElements {
  return buildExperienceFlowElements(flow, steps, TOUR_FLOW_VOCABULARY);
}

export function buildExperienceFlowElements(
  flow: DerivedTourFlowMap,
  steps: readonly LodariqBlock[],
  vocabulary: ExperienceFlowVocabulary,
): TourFlowElements {
  const nodes: TourFlowCanvasNode[] = [];
  const edges: TourFlowCanvasEdge[] = [];
  const terminalIds = new Set<string>();

  flow.nodes.forEach((flowNode, stepIndex) => {
    const step = steps.find((candidate) => candidate.id === flowNode.id);
    if (!step) return;
    const rowY = 48 + stepIndex * ROW_GAP;
    const findings = flow.findings.filter((finding) => finding.stepId === flowNode.id);
    nodes.push(
      canvasNode({
        id: stepNodeId(flowNode.id),
        x: STEP_X,
        y: rowY,
        data: {
          finding: findings.length > 0,
          kind: 'step',
          stepId: flowNode.id,
          subtitle: authoringText('Step {number}', { number: flowNode.index + 1 }),
          title: flowNode.title,
          tone: findings.length ? 'warning' : 'healthy',
        },
      }),
    );

    const actionBlocks = actionDescendants(step);
    if (!actionBlocks.length) {
      for (const edge of flowNode.edges) {
        connectToDestination({
          destination: edge.to,
          edges,
          fromId: stepNodeId(flowNode.id),
          nextStepId: flow.nodes[flowNode.index + 1]?.id,
          nodes,
          rowY,
          sourceStep: flowNode,
          stepId: flowNode.id,
          terminalIds,
          vocabulary,
        });
      }
      return;
    }

    actionBlocks.forEach((actionBlock, actionIndex) => {
      const actionEdges = flowNode.edges.filter((edge) => edge.actionBlockId === actionBlock.id);
      const actionY = rowY + actionIndex * 84;
      const chain = actionChain(actionBlock, flowNode, actionY, vocabulary);
      nodes.push(...chain.nodes);
      edges.push(
        flowEdge({
          id: `${flowNode.id}:${actionBlock.id}:entry`,
          source: stepNodeId(flowNode.id),
          target: chain.firstId,
          stepId: flowNode.id,
          actionBlockId: actionBlock.id,
        }),
        ...chain.edges,
      );

      for (const [edgeIndex, edge] of actionEdges.entries()) {
        connectToDestination({
          actionBlockId: actionBlock.id,
          branch: edge.kind === 'rule' || edge.kind === 'fallback',
          destination: edge.to,
          edgeId: `${flowNode.id}:${actionBlock.id}:destination:${edgeIndex}`,
          edgeLabel: vocabulary.branchLabel(edge.kind, edge.conditionCount, edgeIndex),
          edges,
          fromId: chain.lastId,
          nextStepId: flow.nodes[flowNode.index + 1]?.id,
          nodes,
          rowY: actionY,
          sourceStep: flowNode,
          stepId: flowNode.id,
          terminalIds,
          vocabulary,
        });
      }
    });
  });

  return { nodes, edges };
}

function actionChain(
  block: LodariqBlock,
  sourceStep: DerivedTourFlowNode,
  y: number,
  vocabulary: ExperienceFlowVocabulary,
): { edges: TourFlowCanvasEdge[]; firstId: string; lastId: string; nodes: TourFlowCanvasNode[] } {
  const action = block.props.action;
  if (action?.type !== 'runSequence') {
    const id = actionNodeId(block.id, 'trigger');
    return {
      edges: [],
      firstId: id,
      lastId: id,
      nodes: [
        canvasNode({
          id,
          x: ACTION_X,
          y,
          data: {
            actionBlockId: block.id,
            finding: false,
            kind: 'trigger',
            stepId: sourceStep.id,
            subtitle: block.content?.trim() || authoringText('Action'),
            title: vocabulary.actionTypeLabel(action?.type),
          },
        }),
      ],
    };
  }

  const sequence = action.sequence;
  const nodes: TourFlowCanvasNode[] = [];
  const edges: TourFlowCanvasEdge[] = [];
  const stages: Array<{
    id: string;
    kind: 'trigger' | 'wait' | 'outcome';
    subtitle: string;
    title: string;
  }> = [
    {
      id: actionNodeId(block.id, 'trigger'),
      kind: 'trigger',
      subtitle: vocabulary.triggerSubtitle(sequence.trigger, block),
      title: authoringText('On Next'),
    },
    ...sequence.waitFor.map((wait, index) => ({
      id: actionNodeId(block.id, `wait-${index}`),
      kind: 'wait' as const,
      subtitle: vocabulary.waitSubtitle(wait, sequence),
      title: vocabulary.waitTitle(wait),
    })),
    {
      id: actionNodeId(block.id, 'outcome'),
      kind: 'outcome',
      subtitle: vocabulary.outcomeSubtitle(sequence),
      title: vocabulary.outcomeTitle(sequence),
    },
  ];

  stages.forEach((stage, index) => {
    nodes.push(
      canvasNode({
        id: stage.id,
        x: ACTION_X + index * ACTION_GAP,
        y,
        data: {
          actionBlockId: block.id,
          finding: false,
          kind: stage.kind,
          stepId: sourceStep.id,
          subtitle: stage.subtitle,
          title: stage.title,
        },
      }),
    );
    const previous = stages[index - 1];
    if (previous) {
      edges.push(
        flowEdge({
          actionBlockId: block.id,
          id: `${block.id}:sequence:${index - 1}:${index}`,
          source: previous.id,
          stepId: sourceStep.id,
          target: stage.id,
        }),
      );
    }
  });

  return {
    edges,
    firstId: stages[0]!.id,
    lastId: stages[stages.length - 1]!.id,
    nodes,
  };
}

function connectToDestination({
  actionBlockId,
  branch = false,
  destination,
  edgeId,
  edgeLabel,
  edges,
  fromId,
  nodes,
  nextStepId,
  rowY,
  sourceStep,
  stepId,
  terminalIds,
  vocabulary,
}: {
  actionBlockId?: string;
  branch?: boolean;
  destination: StepTransitionDestination;
  edgeId?: string;
  edgeLabel?: string;
  edges: TourFlowCanvasEdge[];
  fromId: string;
  nodes: TourFlowCanvasNode[];
  nextStepId?: string;
  rowY: number;
  sourceStep: DerivedTourFlowNode;
  stepId: string;
  terminalIds: Set<string>;
  vocabulary: ExperienceFlowVocabulary;
}): void {
  const resolvedDestination =
    destination.type === 'next'
      ? nextStepId
        ? ({ type: 'step', stepId: nextStepId } as const)
        : ({ type: 'complete' } as const)
      : destination;
  const targetId =
    resolvedDestination.type === 'step'
      ? stepNodeId(resolvedDestination.stepId)
      : terminalNodeId(resolvedDestination.type);
  if (resolvedDestination.type !== 'step' && !terminalIds.has(targetId)) {
    terminalIds.add(targetId);
    nodes.push(
      canvasNode({
        id: targetId,
        x: ACTION_X + 3 * ACTION_GAP,
        y: resolvedDestination.type === 'dismiss' ? rowY + 88 : rowY,
        data: {
          finding: false,
          kind: 'terminal',
          subtitle: vocabulary.terminalSubtitle(resolvedDestination.type),
          title: vocabulary.terminalTitle(resolvedDestination.type),
        },
      }),
    );
  }
  edges.push(
    flowEdge({
      actionBlockId,
      branch,
      id: edgeId ?? `${sourceStep.id}:implicit:${targetId}`,
      label: edgeLabel,
      source: fromId,
      stepId,
      target: targetId,
    }),
  );
}

function actionDescendants(block: LodariqBlock): LodariqBlock[] {
  return descendants(block).filter(
    (candidate) =>
      (candidate.type === 'button' || candidate.type === 'link') && candidate.props.action,
  );
}

function descendants(block: LodariqBlock): LodariqBlock[] {
  return [block, ...block.children.flatMap(descendants)];
}
