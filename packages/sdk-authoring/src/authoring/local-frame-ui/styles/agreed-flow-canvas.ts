/** React Flow canvas controls, nodes, handles, and edges. */
export const AUTHORING_AGREED_FLOW_CANVAS_CSS = `
  .tour-flow-map-workspace {
    grid-template-rows: 52px minmax(0, 1fr);
  }

  .tour-flow-toolbar-actions {
    gap: var(--lq-space-2);
  }

  .tour-flow-toolbar-actions > button,
  .tour-flow-toolbar-actions > .tour-flow-tool-group {
    margin: 0;
  }

  .tour-flow-toolbar-actions > .tour-flow-tool-group {
    gap: var(--lq-space-1);
  }

  .tour-flow-toolbar-actions > .tour-flow-tool-group button + button {
    margin-left: 0;
  }

  .tour-flow-canvas {
    position: relative;
    min-height: 0;
    overflow: hidden;
    background: #fbfcfb;
  }

  .tour-flow-canvas > .react-flow {
    position: absolute;
    inset: 0;
  }

  .tour-flow-canvas-controls {
    position: absolute;
    z-index: 7;
    bottom: var(--lq-space-3);
    left: var(--lq-space-3);
    display: flex;
    align-items: center;
    gap: var(--lq-space-2);
    pointer-events: auto;
  }

  .tour-flow-zoom-group {
    display: grid;
    grid-template-columns: var(--lq-control-sm) 48px var(--lq-control-sm);
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    box-shadow: 0 6px 18px rgba(15, 36, 31, 0.1);
  }

  .tour-flow-canvas-controls button,
  .tour-flow-canvas-controls output {
    display: inline-grid;
    min-height: var(--lq-control-sm);
    place-items: center;
    border: 0;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .tour-flow-canvas-controls button {
    cursor: pointer;
  }

  .tour-flow-canvas-controls button:hover,
  .tour-flow-canvas-controls button:focus-visible {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-flow-zoom-group output {
    border-inline: 1px solid var(--lq-color-border-soft);
    font-variant-numeric: tabular-nums;
  }

  .tour-flow-canvas-controls .tour-flow-fit-view {
    display: inline-flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    padding-inline: var(--lq-space-3);
    box-shadow: 0 6px 18px rgba(15, 36, 31, 0.1);
  }

  .tour-flow-canvas:has(.tour-flow-workbench[data-mode='sequence'][data-expanded='false'])
    > .react-flow {
    height: calc(100% - 150px);
  }

  .tour-flow-canvas:has(.tour-flow-workbench[data-mode='branch']) > .react-flow,
  .tour-flow-canvas:has(.tour-flow-workbench[data-mode='sequence'][data-expanded='true'])
    > .react-flow {
    visibility: hidden;
  }

  .react-flow__node-tour {
    width: 208px;
    border: 0;
    background: transparent;
  }

  .react-flow__node-tour:focus,
  .react-flow__node-tour:focus-visible {
    outline: none;
  }

  .tour-flow-node-card {
    display: grid;
    min-height: 72px;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-card);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    padding: 10px 12px;
    box-shadow: 0 4px 12px rgba(15, 36, 31, 0.04);
  }

  .tour-flow-node-card[data-kind='step'] {
    min-height: 82px;
    border-color: var(--lq-color-primary-border);
  }

  .react-flow__node.selected .tour-flow-node-card,
  .tour-flow-node-card[data-selected='true'] {
    border-color: var(--lq-color-blue);
    box-shadow: 0 0 0 2px #eef4ff, 0 8px 18px rgba(15, 36, 31, 0.08);
  }

  .tour-flow-node-icon {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
  }

  .tour-flow-node-card[data-kind='step'] .tour-flow-node-icon {
    border: 0;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-flow-node-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-flow-node-copy strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-flow-node-copy small {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-flow-node-health {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-flow-node-health.warning {
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .tour-flow-handle {
    width: 7px;
    height: 7px;
    min-width: 7px;
    min-height: 7px;
    border: 2px solid var(--lq-color-panel);
    border-radius: 999px;
    background: var(--lq-color-blue);
    opacity: 0;
  }

  .react-flow__node.selected .tour-flow-handle {
    opacity: 1;
  }

  .react-flow__edge-textbg {
    fill: var(--lq-color-panel);
    stroke: var(--lq-color-border-soft);
    stroke-width: 1px;
  }

  .react-flow__edge-text {
    fill: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
  }

`;
