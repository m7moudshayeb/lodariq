import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  EDGE_RESIZE_EDGES,
  type EdgeResizeEdge,
} from '../authoring/canvas/edge-resize';

export function EdgeResizeHandles({
  className,
  onPointerDown,
}: {
  className: string;
  onPointerDown: (edge: EdgeResizeEdge, event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      {EDGE_RESIZE_EDGES.map((edge) => (
        <div
          aria-hidden="true"
          className={className}
          data-edge={edge}
          key={edge}
          onPointerDown={(event) => onPointerDown(edge, event)}
        />
      ))}
    </>
  );
}
