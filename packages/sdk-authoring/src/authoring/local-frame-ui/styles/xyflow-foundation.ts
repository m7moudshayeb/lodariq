/**
 * Required React Flow base layout rules, embedded because the authoring frame
 * injects nonce-bound CSS instead of loading a standalone stylesheet.
 * Source contract: @xyflow/react 12.x dist/base.css (MIT).
 */
export const AUTHORING_XYFLOW_FOUNDATION_CSS = `
  .react-flow {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    direction: ltr;
    --xy-edge-stroke-default: #98a2b3;
    --xy-edge-stroke-width-default: 1.5;
    --xy-edge-stroke-selected-default: var(--lq-color-blue);
    --xy-background-color-default: transparent;
    --xy-background-pattern-dots-color-default: #cbd5d1;
    --xy-handle-background-color-default: var(--lq-color-blue);
    background-color: var(--xy-background-color, var(--xy-background-color-default));
  }

  .react-flow__container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .react-flow__pane {
    z-index: 1;
    touch-action: none;
  }

  .react-flow__pane.draggable {
    cursor: grab;
  }

  .react-flow__pane.dragging {
    cursor: grabbing;
  }

  .react-flow__pane.selection {
    cursor: pointer;
  }

  .react-flow__viewport {
    z-index: 2;
    transform-origin: 0 0;
    pointer-events: none;
  }

  .react-flow__renderer {
    z-index: 4;
  }

  .react-flow__background {
    z-index: -1;
    background-color: var(--xy-background-color, var(--xy-background-color-default));
    pointer-events: none;
  }

  .react-flow__background-pattern.dots {
    fill: var(--xy-background-pattern-color-props, var(--xy-background-pattern-dots-color-default));
  }

  .react-flow .react-flow__edges {
    position: absolute;
  }

  .react-flow .react-flow__edges svg {
    position: absolute;
    overflow: visible;
    pointer-events: none;
  }

  .react-flow__edge {
    pointer-events: visibleStroke;
  }

  .react-flow__edge.selectable {
    cursor: pointer;
  }

  .react-flow__edge-path {
    fill: none;
    stroke: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
    stroke-width: var(--xy-edge-stroke-width, var(--xy-edge-stroke-width-default));
  }

  .react-flow__edge.selected .react-flow__edge-path,
  .react-flow__edge.selectable:focus .react-flow__edge-path,
  .react-flow__edge.selectable:focus-visible .react-flow__edge-path {
    outline: none;
    stroke: var(--xy-edge-stroke-selected, var(--xy-edge-stroke-selected-default));
  }

  .react-flow__arrowhead polyline {
    stroke: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
  }

  .react-flow__arrowhead polyline.arrowclosed {
    fill: var(--xy-edge-stroke, var(--xy-edge-stroke-default));
  }

  .react-flow__nodes {
    transform-origin: 0 0;
    pointer-events: none;
  }

  .react-flow__node {
    position: absolute;
    box-sizing: border-box;
    transform-origin: 0 0;
    pointer-events: all;
    user-select: none;
  }

  .react-flow__node.selectable {
    cursor: pointer;
  }

  .react-flow__node.draggable {
    cursor: grab;
  }

  .react-flow__node.draggable.dragging {
    cursor: grabbing;
  }

  .react-flow__handle {
    position: absolute;
    min-width: 5px;
    min-height: 5px;
    background: var(--xy-handle-background-color, var(--xy-handle-background-color-default));
    pointer-events: none;
  }

  .react-flow__handle-left {
    top: 50%;
    left: 0;
    transform: translate(-50%, -50%);
  }

  .react-flow__handle-right {
    top: 50%;
    right: 0;
    transform: translate(50%, -50%);
  }

  .react-flow__edgelabel-renderer,
  .react-flow__viewport-portal {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    user-select: none;
  }

  .react-flow__edge-textwrapper {
    pointer-events: all;
  }

  .react-flow__edge-text {
    font-family: inherit;
    font-size: var(--lq-font-2xs);
    pointer-events: none;
    user-select: none;
  }

  .react-flow__selection,
  .react-flow__nodesselection-rect {
    border: 1px dashed var(--lq-color-blue);
    background: rgba(37, 99, 235, 0.06);
  }
`;
