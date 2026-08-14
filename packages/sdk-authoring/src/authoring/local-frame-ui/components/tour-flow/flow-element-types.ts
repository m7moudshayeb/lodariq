import type { Edge, Node } from '@xyflow/react';

export type TourFlowCanvasNodeKind = 'step' | 'trigger' | 'wait' | 'outcome' | 'terminal';

export interface TourFlowCanvasNodeData extends Record<string, unknown> {
  actionBlockId?: string;
  finding: boolean;
  kind: TourFlowCanvasNodeKind;
  stepId?: string;
  subtitle: string;
  title: string;
  tone?: 'healthy' | 'warning';
}

export interface TourFlowCanvasEdgeData extends Record<string, unknown> {
  actionBlockId?: string;
  branch: boolean;
  stepId: string;
}

export type TourFlowCanvasNode = Node<TourFlowCanvasNodeData, 'tour'>;
export type TourFlowCanvasEdge = Edge<TourFlowCanvasEdgeData>;

export interface TourFlowElements {
  edges: TourFlowCanvasEdge[];
  nodes: TourFlowCanvasNode[];
}
