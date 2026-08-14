/** Focused flow-map workspace, nodes, inspectors, and utilities. */
export const AUTHORING_FOCUSED_FLOW_CSS = `
  .tour-flow-map-workspace {
    position: relative;
    display: grid;
    min-height: 0;
    grid-template-rows: 48px minmax(0, 1fr) auto;
    overflow: hidden;
    background: #ffffff;
  }

  .tour-flow-toolbar {
    position: relative;
    z-index: 4;
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    padding: 4px 12px;
  }

  .tour-flow-heading,
  .tour-flow-toolbar-actions,
  .tour-flow-tool-group {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
  }

  .tour-flow-heading {
    gap: 8px;
  }

  .tour-flow-heading > svg {
    color: var(--lq-color-primary);
  }

  .tour-flow-heading strong {
    font-size: 12px;
  }

  .tour-flow-heading small {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-flow-toolbar button,
  .tour-flow-tool-group output {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    padding: 0 8px;
    white-space: nowrap;
  }

  .tour-flow-tool-group button + button,
  .tour-flow-tool-group output + button {
    margin-left: -5px;
  }

  .tour-flow-tool-group button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-flow-tool-group output {
    min-width: 48px;
    border-radius: 0;
  }

  .tour-flow-toolbar .tour-flow-return {
    margin-left: 4px;
  }

  .tour-flow-canvas {
    position: relative;
    min-height: 0;
    overflow: hidden;
    background: #fbfcfb;
    touch-action: none;
  }

  .tour-flow-canvas[data-tool='pan'] {
    cursor: grab;
  }

  .tour-flow-canvas[data-tool='pan']:active {
    cursor: grabbing;
  }

  .tour-flow-viewport {
    position: absolute;
    width: 2200px;
    height: 900px;
    transform: translate(var(--flow-pan-x), var(--flow-pan-y)) scale(var(--flow-zoom));
    transform-origin: 0 0;
  }

  .tour-flow-edge-icon {
    position: absolute;
    z-index: 1;
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    color: #94a3b8;
    pointer-events: none;
    transform-origin: center;
  }

  .tour-flow-node,
  .tour-flow-completion {
    position: absolute;
    display: grid;
    width: 176px;
    height: 64px;
    grid-template-columns: 24px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink);
    padding: 8px 12px;
    text-align: left;
  }

  button.tour-flow-node {
    cursor: pointer;
  }

  .tour-flow-node[aria-current='step'] {
    border-color: var(--lq-color-blue);
    box-shadow: 0 0 0 2px #eef4ff;
  }

  .tour-flow-node[data-finding='true'] > svg {
    color: var(--lq-color-warning);
  }

  .tour-flow-node-number {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: 10px;
    font-weight: 700;
  }

  .tour-flow-node > span:nth-child(2),
  .tour-flow-completion > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-flow-node strong,
  .tour-flow-completion strong {
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-flow-node small,
  .tour-flow-completion small {
    color: var(--lq-color-muted);
    font-size: 8px;
  }

  .tour-flow-node > svg,
  .tour-flow-completion > svg {
    color: var(--lq-color-primary);
  }

  .tour-flow-completion {
    width: 144px;
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .tour-flow-node-inspector {
    position: absolute;
    z-index: 3;
    display: grid;
    width: 240px;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    padding: 12px;
    box-shadow: 0 12px 24px rgba(15, 36, 31, 0.12);
  }

  .tour-flow-node-inspector header,
  .tour-flow-node-inspector header > span:first-child {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .tour-flow-node-inspector header > span:first-child {
    display: grid;
    justify-content: start;
    gap: 4px;
  }

  .tour-flow-node-inspector header small,
  .tour-flow-node-inspector dt {
    color: var(--lq-color-muted);
    font-size: 8px;
  }

  .tour-flow-node-inspector header > span:last-child {
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: 8px;
    font-weight: 600;
    padding: 4px 8px;
  }

  .tour-flow-node-inspector header > span:last-child.repair {
    background: var(--lq-color-warning-soft);
    color: #8b5c08;
  }

  .tour-flow-node-inspector dl,
  .tour-flow-node-inspector dl > div {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .tour-flow-node-inspector dl > div {
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 12px;
  }

  .tour-flow-node-inspector dd {
    overflow: hidden;
    font-size: 10px;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-flow-finding {
    color: var(--lq-color-danger);
    font-size: 8px;
    margin: 0;
  }

  .tour-flow-node-inspector-actions {
    display: flex;
    gap: 8px;
  }

  .tour-flow-node-inspector-actions button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    gap: 4px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
    padding: 0 8px;
  }

  .tour-flow-utilities {
    position: relative;
    z-index: 4;
    border-top: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
  }

  .tour-flow-utilities summary {
    display: flex;
    min-height: 40px;
    align-items: center;
    cursor: pointer;
    padding: 4px 16px;
  }

  .tour-flow-utilities summary > span {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .tour-flow-utilities summary strong {
    font-size: 10px;
  }

  .tour-flow-utilities summary small {
    color: var(--lq-color-muted);
    font-size: 8px;
  }

  .tour-flow-utility-grid {
    display: grid;
    max-height: 280px;
    grid-template-columns: repeat(4, minmax(220px, 1fr));
    gap: 12px;
    overflow: auto;
    border-top: 1px solid var(--lq-color-border-soft);
    padding: 12px 16px;
  }

  .tour-flow-utility-grid fieldset {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 8px;
    margin: 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
    padding: 12px;
  }

  .tour-flow-utility-grid legend {
    font-size: 10px;
    font-weight: 700;
  }

  .tour-flow-utility-grid label {
    display: grid;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: 8px;
  }

  .tour-flow-utility-grid input,
  .tour-flow-utility-grid select,
  .tour-flow-utility-grid button {
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink);
    font-size: 10px;
    padding: 0 8px;
  }

  .tour-flow-utility-grid p {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.5;
    margin: 0;
  }

  .tour-checkpoint-editor ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tour-checkpoint-editor li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    gap: 4px;
  }

  .tour-checkpoint-editor li strong {
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

`;
