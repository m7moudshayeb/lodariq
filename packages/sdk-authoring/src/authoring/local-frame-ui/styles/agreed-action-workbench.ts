/** Approved contextual action workbench. */
export const AUTHORING_AGREED_ACTION_WORKBENCH_CSS = `
  /* Action creation is the compact bottom workbench from the approved design. */
  .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray[data-workspace='action']) {
    grid-template-rows: minmax(104px, 1fr) auto;
  }

  .rich-step-editor:has(.storyboard-property-tray[data-workspace='action'])
    > .storyboard-editor-stage {
    overflow: hidden;
    padding-top: 28px;
    padding-bottom: 12px;
  }

  .storyboard-property-tray[data-workspace='action'] {
    position: relative;
    inset: auto;
    width: 100%;
    height: auto;
    max-height: none;
    margin: 0;
    overflow: visible;
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: none;
  }

  .storyboard-property-tray[data-tool-mode='content'] {
    width: 100%;
    height: auto;
    max-height: none;
    overflow: visible;
  }

  .storyboard-canvas
    .rich-step-editor:has(> .storyboard-property-tray[data-tool-mode='content']) {
    grid-template-rows: minmax(160px, 1fr) auto;
  }

  .storyboard-property-tray[data-tool-mode='content'] > .storyboard-tab-panel {
    overflow-y: visible;
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--lq-space-3);
    overflow-x: hidden;
    overflow-y: visible;
    padding: var(--lq-space-3) var(--lq-space-4) var(--lq-space-4);
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior:has([data-property-id='button.destination']) {
    grid-template-columns: minmax(260px, 1fr) minmax(240px, 0.8fr);
    gap: var(--lq-space-2) var(--lq-space-3);
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior:has([data-property-id='button.destination'])
    .storyboard-property-control[data-property-id='button.action'] {
    grid-column: 1 / -1;
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.destination'],
  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.navigationBehavior'] {
    width: 100%;
    max-width: none;
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.destination']
    .ui-field {
    gap: var(--lq-space-1);
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.destination']
    .ui-input {
    height: var(--lq-control-sm);
    font-size: var(--lq-font-xs);
    padding-inline: var(--lq-space-2);
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.destination']
    .ui-input::placeholder {
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action'] {
    display: grid;
    gap: var(--lq-space-2);
    border: 0;
    padding: 0;
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .rich-step-choice-list,
  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented {
    display: flex;
    min-width: 0;
    flex-wrap: nowrap;
    gap: var(--lq-space-1);
    overflow-x: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: var(--lq-space-1);
    scrollbar-width: thin;
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented-option {
    min-width: max-content;
    min-height: var(--lq-control-sm);
    flex: 0 0 auto;
    border: 1px solid transparent;
    border-radius: var(--lq-radius-xs);
    padding-inline: var(--lq-space-2);
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented-option[aria-checked='true'],
  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented-option[data-state='checked'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

`;
