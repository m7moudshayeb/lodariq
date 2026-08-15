import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Check, CircleAlert, CircleCheck, MousePointerClick, RotateCcw } from '../../design-system';
import type { TourFlowCanvasNode } from './flow-elements';

export function TourFlowNode({ data, selected }: NodeProps<TourFlowCanvasNode>) {
  const Icon = nodeIcon(data.kind);
  return (
    <article
      className="tour-flow-node-card"
      data-finding={data.finding ? 'true' : 'false'}
      data-kind={data.kind}
      data-selected={selected ? 'true' : 'false'}
    >
      <Handle className="tour-flow-handle" position={Position.Left} type="target" />
      <span className="tour-flow-node-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="tour-flow-node-copy">
        <strong>{data.title}</strong>
        <small>{data.subtitle}</small>
      </span>
      {data.kind === 'step' ? (
        <span
          className={
            data.tone === 'warning' ? 'tour-flow-node-health warning' : 'tour-flow-node-health'
          }
        >
          {data.finding ? (
            <CircleAlert size={13} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          )}
        </span>
      ) : null}
      <Handle className="tour-flow-handle" position={Position.Right} type="source" />
    </article>
  );
}

function nodeIcon(kind: TourFlowCanvasNode['data']['kind']) {
  if (kind === 'trigger') return MousePointerClick;
  if (kind === 'wait') return RotateCcw;
  if (kind === 'outcome' || kind === 'terminal') return CircleCheck;
  return Check;
}
