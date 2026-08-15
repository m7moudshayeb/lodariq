import type { BlockActionProps } from './block';
import type { DocumentType } from './common';
import type { StepTransitionDestination } from './flow';

export const TOUR_FLOW_ISSUE_CODES = [
  'invalid_flow_edge',
  'unreachable_step',
  'non_terminating_flow',
  'missing_terminal_completion',
] as const;
export type TourFlowIssueCode = (typeof TOUR_FLOW_ISSUE_CODES)[number];

export const TOUR_FLOW_DOCUMENT_TYPES = ['tour'] as const satisfies readonly DocumentType[];

export function documentTypeSupportsTourFlow(type: DocumentType): boolean {
  return (TOUR_FLOW_DOCUMENT_TYPES as readonly DocumentType[]).includes(type);
}

/** Leaf blocks copied into compiled Tour step bodies, in canonical traversal order. */
export const TOUR_RENDERABLE_LEAF_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'list',
  'divider',
  'button',
  'link',
  'media',
  'callout',
  'stat',
  'icon',
  'formField',
] as const;

export interface TourFlowActionNodeInput {
  action?: BlockActionProps;
  id: string;
}

export interface TourFlowStepInput {
  actionNodes: readonly TourFlowActionNodeInput[];
  id: string;
}

export interface TourFlowEdge {
  actionBlockId?: string;
  actionNodeIndex?: number;
  conditionCount: number;
  fromStepId: string;
  kind: 'implicit' | 'rule' | 'fallback' | 'action';
  to: StepTransitionDestination;
}

export interface TourFlowNode {
  edges: readonly TourFlowEdge[];
  id: string;
  index: number;
}

export interface TourFlowIssue {
  actionBlockId?: string;
  actionNodeIndex?: number;
  code: TourFlowIssueCode;
  severity: 'blocker' | 'warning';
  stepId: string;
  stepIndex: number;
}

export interface TourFlowAnalysis {
  findings: readonly TourFlowIssue[];
  nodes: readonly TourFlowNode[];
}

export interface AnalyzeTourFlowOptions {
  completionStepId?: string;
}
