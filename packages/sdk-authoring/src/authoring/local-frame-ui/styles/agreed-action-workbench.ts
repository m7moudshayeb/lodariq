/** Approved contextual action workbench. */
export const AUTHORING_AGREED_ACTION_WORKBENCH_CSS = `
  /* Action creation is the compact bottom workbench from the approved design. */
  .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray[data-workspace='action']) {
    grid-template-rows: auto minmax(104px, 1fr) auto;
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
    max-height: 280px;
    overflow: auto;
  }

  .storyboard-canvas
    .rich-step-editor:has(.storyboard-property-tray[data-tool-mode='content']) {
    grid-template-rows: auto minmax(160px, 1fr) auto;
  }

  .storyboard-property-tray[data-tool-mode='content'] > .storyboard-tab-panel {
    overflow-y: visible;
  }

  .storyboard-property-tray[data-tool-mode='content']:has(.popup-inspector-tabs)
    > .storyboard-tray-handle {
    display: none;
  }

  .storyboard-property-tray[data-tool-mode='content'] > .content-inspector-chrome {
    display: flex;
    min-width: 0;
    align-items: stretch;
    border-bottom: 1px solid var(--lq-color-border-soft);
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .content-inspector-chrome
    > .popup-inspector-tabs {
    position: relative;
    top: 0;
    height: 44px;
    min-height: 44px;
    flex: 1 1 auto;
    align-items: stretch;
    border-bottom: 0;
    background: transparent;
    padding: 0 20px;
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .content-inspector-chrome
    > .popup-inspector-tabs
    button {
    display: grid;
    min-height: 44px;
    place-items: center;
    font-size: var(--lq-font-xs);
    padding: 0;
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .content-inspector-chrome
    > .storyboard-tray-close {
    align-self: center;
    margin-inline-end: 12px;
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-content: start;
    gap: var(--lq-space-3);
    overflow-x: hidden;
    overflow-y: visible;
    padding: var(--lq-space-3) var(--lq-space-4) var(--lq-space-4);
  }

  .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='action'],
  .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='field'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .storyboard-property-color-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: inherit;
  }

  .storyboard-property-tray[data-tool-mode='content'] .storyboard-property-control {
    display: grid;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .storyboard-property-tray[data-tool-mode='content'] .storyboard-property-control .ui-input,
  .storyboard-property-tray[data-tool-mode='content'] .storyboard-property-control input[type='text'],
  .storyboard-property-tray[data-tool-mode='content'] .storyboard-property-control input[type='url'] {
    box-sizing: border-box;
    width: 100%;
    height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    padding: 0 12px;
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
