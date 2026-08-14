import {
  analyzeTourFlow,
  tourFlowStepInputs,
  type LodariqBlock,
  type TourFlowEdge,
  type TourFlowIssue,
  type TourFlowIssueCode,
  type TourFlowNode,
} from '@lodariq/schema';

export type TourFlowFindingCode = TourFlowIssueCode;
export type DerivedTourFlowEdge = TourFlowEdge;

export interface DerivedTourFlowNode extends TourFlowNode {
  title: string;
}

export type DerivedTourFlowFinding = TourFlowIssue;

export interface DerivedTourFlowMap {
  nodes: readonly DerivedTourFlowNode[];
  findings: readonly DerivedTourFlowFinding[];
}

export interface DeriveTourFlowMapOptions {
  completionStepId?: string;
}

/** A presentation adapter over the canonical cross-system Tour flow analysis. */
export function deriveTourFlowMap(
  steps: readonly LodariqBlock[],
  options: DeriveTourFlowMapOptions = {},
): DerivedTourFlowMap {
  const analysis = analyzeTourFlow(tourFlowStepInputs(steps), options);
  const stepById = new Map(steps.map((step) => [step.id, step]));
  return {
    findings: analysis.findings,
    nodes: analysis.nodes.map((node) => {
      const step = stepById.get(node.id);
      return {
        ...node,
        title: firstHeading(step)?.content?.trim() || `Step ${node.index + 1}`,
      };
    }),
  };
}

function firstHeading(block: LodariqBlock | undefined): LodariqBlock | undefined {
  if (!block) return undefined;
  if (block.type === 'heading') return block;
  for (const child of block.children) {
    const heading = firstHeading(child);
    if (heading) return heading;
  }
  return undefined;
}
