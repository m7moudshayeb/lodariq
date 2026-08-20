/** Flow workbench and flow-settings overlays. */
export const AUTHORING_AGREED_FLOW_WORKBENCH_CSS = `
  .tour-flow-workbench,
  .tour-flow-settings {
    position: absolute;
    z-index: 8;
    display: grid;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-card);
    background: var(--lq-color-panel);
    box-shadow: 0 16px 36px rgba(15, 36, 31, 0.15);
  }

  .tour-flow-workbench {
    right: 50%;
    bottom: 12px;
    width: min(760px, calc(100% - 32px));
    max-height: none;
    overflow: visible;
    transform: translateX(50%);
  }

  .tour-flow-workbench[data-mode='branch'] {
    top: 12px;
    bottom: auto;
    width: min(820px, calc(100% - 32px));
  }

  .tour-flow-workbench-header,
  .tour-flow-workbench-title,
  .tour-flow-workbench-actions,
  .tour-flow-workbench-tabs {
    display: flex;
    align-items: center;
  }

  .tour-flow-workbench-header {
    min-height: 42px;
    gap: 10px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 6px 10px 6px 14px;
  }

  .tour-flow-workbench-title {
    gap: 7px;
    color: var(--lq-color-primary);
  }

  .tour-flow-workbench-title strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .tour-flow-workbench-actions {
    gap: 2px;
    margin-left: auto;
  }

  .tour-flow-workbench-actions button {
    display: grid;
    width: 30px;
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    padding: 0;
    place-items: center;
  }

  .tour-flow-workbench-actions button:hover,
  .tour-flow-workbench-actions button:focus-visible {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-flow-workbench-actions button.danger {
    color: var(--lq-color-danger);
  }

  .tour-flow-workbench-actions button.danger:hover,
  .tour-flow-workbench-actions button.danger:focus-visible {
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .tour-flow-workbench-tabs {
    gap: 2px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-control);
    background: var(--lq-color-page);
    padding: 2px;
  }

  .tour-flow-workbench-tabs button,
  .tour-flow-workbench-close,
  .tour-flow-settings header button,
  .tour-flow-settings nav button {
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    font: inherit;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 9px;
  }

  .tour-flow-workbench-tabs button[aria-selected='true'],
  .tour-flow-settings nav button[aria-current='page'] {
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
    box-shadow: 0 1px 3px rgba(15, 36, 31, 0.08);
  }

  .tour-flow-workbench-close,
  .tour-flow-settings header button {
    display: grid;
    width: 30px;
    padding: 0;
    place-items: center;
  }

  .tour-flow-workbench > .sequence-property-editor,
  .tour-flow-workbench > .transition-editor {
    border: 0;
    padding: 8px 12px;
  }

  .tour-flow-workbench > .transition-editor {
    gap: 6px;
  }

  .tour-flow-workbench > .transition-editor > .transition-editor-header {
    min-height: 28px;
  }

  .tour-flow-workbench
    > .transition-editor[data-branch-state='configured']
    > .transition-editor-header {
    display: none;
  }

  .tour-flow-workbench > .transition-editor .transition-editor-heading {
    display: none;
  }

  .tour-flow-workbench > .transition-editor .transition-rule-tabs {
    margin: 0;
  }

  .tour-flow-workbench > .transition-editor .transition-path-list {
    grid-template-columns: minmax(0, 1.45fr) minmax(180px, 0.55fr);
    gap: 8px;
  }

  .tour-flow-workbench > .transition-editor .transition-condition-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .tour-flow-workbench > .transition-editor .transition-condition {
    grid-template-columns: minmax(0, 1fr) var(--lq-control-sm);
    gap: 6px;
  }

  .tour-flow-workbench > .transition-editor .transition-condition-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tour-flow-workbench > .transition-editor .transition-condition-fields > *,
  .tour-flow-workbench > .transition-editor .transition-condition-fields .ui-select-trigger {
    min-width: 0;
  }

  .tour-flow-workbench > .transition-editor .transition-condition .ui-select-trigger {
    width: 100%;
  }

  .tour-flow-workbench > .transition-editor .transition-header-actions .ui-button:has(.lucide-eye) {
    display: none;
  }

  .tour-flow-workbench > .transition-editor .transition-condition-list {
    position: relative;
  }

  .transition-condition-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .transition-condition-tabs button {
    display: grid;
    width: 24px;
    min-height: 24px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    cursor: pointer;
    font: inherit;
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    padding: 0;
    place-items: center;
  }

  .transition-condition-tabs button[aria-current='page'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .ui-native-select-mirror {
    position: absolute;
    width: 1px;
    max-width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .tour-flow-workbench .sequence-summary-header {
    justify-content: flex-end;
  }

  .tour-flow-workbench .sequence-summary-header > span:first-child {
    display: none;
  }

  .tour-flow-workbench .sequence-summary-strip {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
  }

  .tour-flow-workbench .sequence-details[open] {
    margin-top: 0;
  }

  .tour-flow-workbench .sequence-property-editor[data-variant='canvas'] .sequence-details > summary {
    display: none;
  }

  .tour-flow-workbench .sequence-details-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding-top: 0;
  }

  .tour-flow-workbench .sequence-details-grid > *,
  .tour-flow-workbench .sequence-details-grid .ui-field,
  .tour-flow-workbench .sequence-details-grid .ui-select-trigger {
    min-width: 0;
  }

  .tour-flow-workbench .sequence-details-grid .ui-select-trigger {
    width: 100%;
  }

  .tour-flow-workbench .sequence-wait-list {
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .tour-flow-workbench .sequence-timeout-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-column: 1 / -1;
  }

  .tour-flow-workbench .sequence-guided-card,
  .tour-flow-workbench .sequence-recovery-card {
    padding: var(--lq-space-2);
  }

  .tour-flow-workbench .sequence-editor-actions .ui-button {
    min-height: var(--lq-control-sm);
  }

  .tour-flow-workbench[data-expanded='true'] .sequence-summary-strip {
    display: none;
  }

  .tour-flow-workbench[data-expanded='true'] .sequence-details {
    border-top: 0;
    padding-top: 0;
  }

  .sequence-wait-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sequence-wait-tabs button {
    display: grid;
    width: 22px;
    min-height: 22px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    cursor: pointer;
    font: inherit;
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    padding: 0;
    place-items: center;
  }

  .sequence-wait-tabs button[aria-current='page'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-flow-settings {
    top: 16px;
    right: 16px;
    width: min(480px, calc(100% - 32px));
  }

  .tour-flow-settings > header {
    display: flex;
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 6px 10px 6px 14px;
  }

  .tour-flow-settings > header strong {
    font-size: var(--lq-font-sm);
  }

  .tour-flow-settings > nav {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 2px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-page);
    padding: 4px;
  }

  .tour-flow-settings-content {
    padding: var(--lq-space-4);
  }

  .tour-flow-settings-content > .flow-settings-editor {
    display: grid;
    gap: var(--lq-space-3);
    margin: 0;
    border: 0;
    padding: 0;
  }

  .tour-flow-settings-content legend {
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .tour-flow-settings-content p {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.45;
    margin: 0;
  }

  .tour-flow-settings-content .ui-input,
  .tour-flow-settings-content .ui-select-trigger,
  .tour-flow-settings-content .ui-button {
    min-height: var(--lq-control-sm);
    font-size: var(--lq-font-xs);
  }

  .tour-flow-settings-content > .flow-settings-editor > .ui-button {
    justify-self: end;
  }

  .tour-flow-simulation-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .tour-checkpoint-selection {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .tour-checkpoint-selection > span {
    display: flex;
    gap: 4px;
  }

  .tour-review-detail .tour-checkpoint-selection {
    grid-column: 1 / -1;
  }

`;
