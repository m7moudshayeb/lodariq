export const AUTHORING_TOUR_RAIL_CSS = `

  .workspace,
  .shell-panel .workspace {
    padding: 0;
    background: var(--lq-color-panel);
  }

  .document-page {
    display: block;
    width: 100%;
    max-width: none;
  }

  .authoring-workspace {
    display: grid;
    grid-template-columns: 356px minmax(0, 1fr);
    min-height: calc(100vh - 47px);
    gap: 0;
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail {
    position: sticky;
    top: 47px;
    z-index: 12;
    display: flex;
    height: calc(100vh - 47px);
    min-width: 0;
    flex-direction: column;
    align-self: start;
    border-right: 1px solid var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .tour-sequence-header.document-hero {
    display: flex;
    width: auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 24px 24px 16px;
  }

  .tour-sequence-title {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
  }

  .tour-sequence-title .ui-select-trigger {
    width: 100%;
    min-height: 32px;
    justify-content: space-between;
  }

  .experience-language-controls {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
  }

  .experience-language-picker {
    min-width: 0;
  }

  .experience-language-controls .ui-select-trigger {
    flex: 1;
    width: auto;
  }

  .experience-language-controls .ui-icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .tour-sequence-title .experience-language-picker,
  .tour-sequence-title .experience-language-controls {
    width: 100%;
  }

  .tour-sequence-compact-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tour-sequence-compact-actions .ui-select-trigger {
    min-width: 126px;
    min-height: 30px;
  }

  .tour-sequence-kicker.document-context {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .tour-sequence-header .document-title-input {
    width: 100%;
    border-radius: 8px;
    font-size: var(--lq-font-xl);
    font-weight: var(--lq-weight-bold);
    line-height: 1.3;
    padding: 4px 4px;
    transform: translateX(-4px);
  }

  .tour-health-count {
    flex: 0 0 auto;
    margin-top: 16px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  .tour-step-list {
    display: grid;
    align-content: start;
    gap: 8px;
    margin: 0;
    padding: 16px 16px 8px;
    list-style: none;
    overflow-y: auto;
  }

  .tour-step-row {
    display: grid;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
  }

  .tour-step-row.drop-before {
    box-shadow: inset 0 3px 0 var(--lq-color-primary);
  }

  .tour-step-row.drop-after {
    box-shadow: inset 0 -3px 0 var(--lq-color-primary);
  }

  .tour-step-row-main {
    display: grid;
    min-width: 0;
    grid-template-columns: 26px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 4px;
  }

  .tour-step-drag-handle {
    display: inline-grid;
    width: 26px;
    height: 36px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: grab;
    padding: 0;
    touch-action: none;
  }

  .tour-step-drag-handle:hover,
  .tour-step-drag-handle:focus-visible {
    background: rgba(36, 88, 199, 0.08);
    color: var(--lq-color-primary);
  }

  .tour-step-drag-handle:active {
    cursor: grabbing;
  }

  .tour-step-row.active {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-blue-soft);
    box-shadow: 0 0 0 1px rgba(63, 114, 223, 0.16);
  }

  .tour-step-row.repair:not(.active) {
    background: var(--lq-color-warning-soft);
  }

  .tour-step-select {
    display: grid;
    min-width: 0;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 12px 12px;
    text-align: left;
  }

  .tour-step-action-trigger.ui-button {
    width: 28px;
    min-width: 28px;
    min-height: 36px;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
  }

  .tour-step-action-trigger.ui-button:hover,
  .tour-step-action-trigger.ui-button[aria-expanded='true'] {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .tour-step-action-menu {
    display: grid;
    min-width: 156px;
    gap: 4px;
    padding: 4px;
  }

  .tour-step-action-menu .ui-button {
    width: 100%;
    min-height: 36px;
    justify-content: flex-start;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-ink-soft);
  }

  .tour-step-action-menu .ui-button:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-ink);
  }

  .tour-step-action-menu .ui-button.danger {
    color: var(--lq-color-danger);
  }

  .tour-step-select:hover {
    background: rgba(36, 88, 199, 0.045);
  }

  .tour-step-number {
    display: inline-grid;
    width: 28px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .tour-step-row.active .tour-step-number {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .tour-step-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-copy strong,
  .tour-step-placement {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-copy strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  .tour-step-placement {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .tour-step-health {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    white-space: nowrap;
  }

  .tour-step-health.ready {
    color: var(--lq-color-success);
  }

  .tour-step-health.repair {
    color: var(--lq-color-warning);
  }

  .tour-add-step {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    align-self: flex-start;
    gap: 8px;
    margin: 4px 24px 16px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    padding: 8px 8px;
  }

  .tour-add-step:hover {
    background: var(--lq-color-primary-soft);
  }

  .tour-active-step-footer {
    display: grid;
    gap: 12px;
    margin: auto 16px 16px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    padding: 12px;
  }

  .tour-active-step-footer.ready {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
  }

  .tour-active-step-footer.repair {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
  }

  .tour-active-target {
    display: grid;
    min-width: 0;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .tour-active-target-icon {
    display: inline-grid;
    width: 28px;
    height: 36px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .tour-active-target-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-active-target small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tour-active-target strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-active-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .tour-active-actions button {
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 8px 8px;
  }

  .tour-active-actions button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .document-main {
    width: 100%;
    max-width: none;
    min-height: calc(100vh - 47px);
    align-content: start;
    background: var(--lq-color-panel);
    padding: 40px clamp(24px, 4vw, 40px) 40px;
  }

  .document {
    width: min(100%, 680px);
    justify-self: center;
    padding: 0;
  }

  .document-block-group.inactive-step {
    display: none;
  }

  .document-block-group.active-step {
    display: grid;
  }

  .document-block-group.active-step > .block[data-block-type="tourStep"] {
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.27);
  }

  .document-block-group.active-step > .block[data-block-type="tourStep"].selected {
    border-color: var(--lq-color-primary-border);
    box-shadow:
      0 0 0 2px rgba(36, 88, 199, 0.12),
      0 14px 34px rgba(0, 0, 0, 0.28);
  }

  .insert-bar,
  .document-review {
    width: min(100%, 680px);
    justify-self: center;
  }

  .insert-bar {
    margin-top: 16px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .canvas-actionbar {
    position: fixed;
    top: 62px;
    right: 18px;
    margin: 0;
  }

  .shell-panel {
    height: 100vh;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  .shell-panel .authoring-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100vh;
    min-height: 0;
    overflow: hidden;
  }

  .tour-step-multi-select {
    display: inline-grid;
    width: var(--lq-control-sm);
    min-height: var(--lq-control-sm);
    flex: 0 0 auto;
    place-items: center;
  }

  .tour-step-multi-select input {
    width: 15px;
    height: 15px;
    accent-color: var(--lq-color-primary);
  }

  .tour-step-action-divider {
    height: 1px;
    margin: var(--lq-space-1) 0;
    background: var(--lq-color-border);
  }

  .style-recipe-thumbnail {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 3px solid;
    border-radius: 4px;
  }

  .style-recipe-menu-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--lq-space-1);
  }

  .tour-step-batch-toolbar,
  .tour-flow-map {
    display: grid;
    gap: var(--lq-space-2);
    margin: var(--lq-space-2);
    padding: var(--lq-space-3);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-lg);
    background: var(--lq-color-panel);
  }

  .tour-step-batch-toolbar label,
  .tour-flow-map header {
    display: grid;
    gap: var(--lq-space-1);
  }

  .tour-step-batch-toolbar select,
  .tour-flow-map-toggle {
    min-height: var(--lq-control-md);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-panel);
    color: var(--lq-color-text);
  }

  .tour-flow-map-toggle {
    margin: var(--lq-space-2);
  }

  .tour-flow-map ol,
  .tour-flow-map ul {
    display: grid;
    gap: var(--lq-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tour-flow-map > ol > li {
    display: grid;
    gap: var(--lq-space-2);
    padding: var(--lq-space-2);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
  }

  .tour-flow-map li button:first-child,
  .tour-flow-map li ul li {
    display: flex;
    align-items: center;
    gap: var(--lq-space-2);
  }

  .tour-flow-finding {
    color: var(--lq-color-danger-text);
    font-size: var(--lq-font-xs);
  }
`;
