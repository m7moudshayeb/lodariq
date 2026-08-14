import { MarkerType, Position } from '@xyflow/react';
import { authoringText } from '../../../../i18n';
import type {
  TourFlowCanvasEdge,
  TourFlowCanvasNode,
  TourFlowCanvasNodeData,
} from './flow-element-types';

export function canvasNode({
  data,
  id,
  x,
  y,
}: {
  data: TourFlowCanvasNodeData;
  id: string;
  x: number;
  y: number;
}): TourFlowCanvasNode {
  return {
    ariaLabel: `${data.title}. ${data.subtitle}`,
    data,
    id,
    position: { x, y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    type: 'tour',
  };
}

export function flowEdge({
  actionBlockId,
  branch = false,
  id,
  label,
  source,
  stepId,
  target,
}: {
  actionBlockId?: string;
  branch?: boolean;
  id: string;
  label?: string;
  source: string;
  stepId: string;
  target: string;
}): TourFlowCanvasEdge {
  return {
    ariaLabel: label ?? authoringText('Flow connection'),
    data: { actionBlockId, branch, stepId },
    id,
    label,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    source,
    target,
    type: 'smoothstep',
  };
}

export function stepNodeId(stepId: string): string {
  return `step:${stepId}`;
}

export function actionNodeId(actionBlockId: string, stage: string): string {
  return `action:${actionBlockId}:${stage}`;
}

export function terminalNodeId(type: 'complete' | 'dismiss' | 'next'): string {
  return `terminal:${type}`;
}
