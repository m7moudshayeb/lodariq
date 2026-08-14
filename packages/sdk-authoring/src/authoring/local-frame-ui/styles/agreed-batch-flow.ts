/** Approved batch workspace and base flow-map composition. */
export const AUTHORING_AGREED_BATCH_FLOW_CSS = `
  /* Batch mode keeps the approved rail and moves selection detail to cards. */
  .tour-storyboard[data-batch-mode='true'] {
    grid-template-rows: 56px 48px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-scroll,
  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-utilities,
  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-list {
    height: 56px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-list {
    align-items: center;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-step {
    min-width: 100px;
    max-width: 124px;
    height: 40px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-select {
    display: flex;
    padding: 0 8px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-preview {
    display: none;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-add-item {
    height: 40px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-utilities {
    align-items: center;
    padding-top: 8px;
  }

  .tour-batch-workspace {
    background: #f8f7f2;
    padding: 16px 20px 20px;
  }

  .tour-batch-workspace-heading {
    margin-bottom: 12px;
  }

  .tour-batch-card-grid {
    gap: 12px;
  }

  .tour-batch-card-open {
    gap: 14px;
    padding: 14px;
  }

  .tour-batch-card-facts {
    gap: 8px;
  }

  .tour-step-batch-menu.batch-fields > span {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-1);
  }

  .tour-step-batch-menu.batch-fields > span > strong {
    grid-column: 1 / -1;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
  }

  /* Flow map is a canvas workspace with draggable nodes and readable edges. */
  .tour-flow-map-workspace {
    grid-template-rows: 48px minmax(0, 1fr) auto;
  }

  .tour-flow-canvas {
    background: #fbfcfb;
  }

  .tour-flow-edges {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
  }

  .tour-flow-edges path:not([d^='M0']) {
    fill: none;
    stroke: #98a2b3;
    stroke-width: 1.5;
  }

  .tour-flow-edges marker path {
    fill: #98a2b3;
  }

  .tour-flow-node,
  .tour-flow-completion {
    z-index: 2;
  }

  .tour-flow-node-inspector {
    right: 16px;
    bottom: 16px;
    left: auto;
    width: 252px;
  }

  .tour-flow-branch-workbench {
    display: grid;
    height: 224px;
    max-height: 224px;
    overflow: hidden;
    border-top: 1px solid var(--lq-color-border);
    background: var(--lq-color-panel);
    padding: var(--lq-space-2) var(--lq-space-3);
  }

  .tour-flow-branch-workbench > .transition-editor {
    grid-template-rows: 32px minmax(0, 1fr) 28px;
    align-content: start;
    gap: var(--lq-space-1);
    overflow: hidden;
    border: 0;
    padding: 0;
  }

  .tour-flow-branch-workbench .transition-editor-header {
    min-height: 32px;
  }

  .tour-flow-branch-workbench .transition-editor-heading {
    display: none;
  }

  .tour-flow-branch-workbench .transition-rule-tabs {
    display: none;
  }

  .tour-flow-branch-workbench .transition-header-actions {
    margin-left: auto;
  }

  .tour-flow-branch-workbench .transition-path-list {
    grid-template-columns: minmax(0, 1.55fr) minmax(200px, 0.45fr);
  }

  .tour-flow-branch-workbench .transition-condition-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tour-flow-branch-workbench .transition-condition {
    grid-template-columns: minmax(0, 1fr) var(--lq-control-sm);
    gap: var(--lq-space-1);
    padding: var(--lq-space-1);
  }

  .tour-flow-branch-workbench .transition-condition-fields {
    min-width: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tour-flow-branch-workbench .transition-condition-remove {
    grid-column: 2;
    grid-row: 1;
  }

  .tour-flow-branch-workbench .transition-rule {
    padding: var(--lq-space-1) var(--lq-space-2);
  }

  .tour-flow-branch-workbench .transition-rule-footer {
    margin-top: var(--lq-space-1);
    padding-top: var(--lq-space-1);
  }

  .tour-flow-branch-workbench .transition-editor-actions {
    align-items: center;
  }

  .tour-flow-branch-workbench .ui-input,
  .tour-flow-branch-workbench .transition-editor select {
    min-height: 30px;
  }

  .tour-flow-branch-workbench .ui-field-label,
  .tour-flow-branch-workbench .transition-editor label > span {
    font-size: var(--lq-font-2xs);
  }

`;
