/** Focused contextual property-tray layouts and controls. */
export const AUTHORING_FOCUSED_PROPERTY_TRAY_CSS = `
  .storyboard-property-tray {
    max-height: 320px;
  }

  .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray) {
    grid-template-rows: auto minmax(112px, 1fr) minmax(0, 320px);
  }

  .storyboard-tray-header {
    min-height: 56px;
  }

  .popup-inspector-tabs {
    position: sticky;
    top: 56px;
    z-index: 2;
    display: flex;
    min-height: 40px;
    align-items: end;
    gap: 24px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    padding: 0 16px;
  }

  .popup-inspector-tabs button {
    position: relative;
    min-height: 40px;
    border: 0;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 0 8px;
  }

  .popup-inspector-tabs button[aria-current='page'] {
    color: var(--lq-color-ink);
  }

  .popup-inspector-tabs button[aria-current='page']::after {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 2px;
    background: var(--lq-color-primary);
    content: '';
  }

  .storyboard-property-tray .step-presentation > header {
    display: none;
  }

  .storyboard-tray-header {
    box-sizing: border-box;
    height: 56px;
    min-height: 56px;
    overflow: hidden;
    padding: 12px 16px 8px;
  }

  .storyboard-tray-title,
  .storyboard-tray-identity,
  .storyboard-tray-context {
    max-width: 100%;
  }

  .storyboard-tray-identity strong {
    display: block;
    max-width: min(54vw, 560px);
  }

  .storyboard-tray-context {
    overflow: hidden;
  }

  .storyboard-placement-summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-property-tray > .storyboard-tab-panel {
    overflow-x: hidden;
    overflow-y: auto;
  }

  .storyboard-property-tray > .storyboard-tab-panel.behavior {
    grid-template-columns: minmax(0, 1fr) minmax(176px, 224px);
    gap: 12px;
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented-option {
    justify-content: flex-start;
    padding-inline: 6px;
  }

  .storyboard-tab-panel.behavior
    .storyboard-property-control[data-property-id='button.action']
    .ui-segmented-option
    > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .transition-editor {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 8px;
    border-left: 1px solid var(--lq-color-border-soft);
    padding-left: 12px;
  }

  .transition-editor > header {
    display: grid;
    gap: 4px;
  }

  .transition-editor > header strong,
  .transition-editor > header span {
    display: block;
  }

  .transition-editor > header strong {
    font-size: var(--lq-font-sm);
  }

  .transition-editor > header span,
  .storyboard-property-note {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .transition-editor > .ui-button {
    width: max-content;
    min-height: 32px;
  }

  .transition-editor label,
  .transition-rule,
  .transition-condition {
    display: grid;
    min-width: 0;
    gap: 6px;
  }

  .transition-editor select {
    min-width: 0;
    min-height: 32px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    padding: 0 8px;
  }

  .transition-rule {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
    padding: 8px;
  }

  .transition-editor-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .storyboard-tab-panel.popup-layout,
  .storyboard-tab-panel.step-presentation {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    align-items: start;
    gap: 12px;
  }

  .storyboard-tab-panel.popup-layout[data-section='appearance'] {
    grid-template-columns: repeat(3, minmax(220px, 1fr));
  }

  .storyboard-tab-panel.popup-layout .rich-step-choice-field,
  .storyboard-tab-panel.popup-layout .rich-step-color-field,
  .storyboard-tab-panel.step-presentation > * {
    min-width: 0;
  }

  .storyboard-tab-panel.popup-layout .rich-step-choice-list,
  .storyboard-tab-panel.step-presentation .rich-step-choice-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
    gap: 4px;
  }

  .storyboard-tab-panel.popup-layout .ui-segmented,
  .storyboard-tab-panel.step-presentation .ui-segmented {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
  }

  .storyboard-tab-panel.popup-layout .ui-segmented-option,
  .storyboard-tab-panel.step-presentation .ui-segmented-option {
    height: auto;
    min-height: 32px;
    padding: 4px 8px;
    white-space: normal;
  }

  .storyboard-tab-panel.popup-layout .rich-step-color-field {
    min-width: 0;
  }

  .storyboard-tab-panel.popup-layout .rich-step-color-swatches {
    gap: 6px;
  }

  .storyboard-tab-panel.popup-layout .rich-step-color-swatches > button:not(.rich-step-theme-color) {
    width: 30px;
    height: 30px;
  }

  .storyboard-tab-panel.popup-layout .popup-style-reset {
    align-self: center;
  }

  .storyboard-tab-panel.step-presentation > label,
  .storyboard-tab-panel.step-presentation > .ui-field {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .storyboard-tab-panel.step-presentation input,
  .storyboard-tab-panel.step-presentation select {
    width: 100%;
    min-width: 0;
    min-height: 32px;
  }

  .storyboard-tab-panel.step-presentation .sequence-property-editor {
    grid-column: 1 / -1;
  }

  .storyboard-property-tray > .rich-step-inspector.compact {
    display: grid;
    grid-template-columns: minmax(132px, 180px) minmax(0, 1fr);
    align-items: end;
    gap: 12px;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: #ffffff;
    padding: 12px 16px 16px;
  }

  .storyboard-property-tray > .rich-step-inspector.compact > header {
    display: none;
  }

  .storyboard-property-tray > .rich-step-inspector.compact > label {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .storyboard-property-tray > .rich-step-inspector.compact > label > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .storyboard-property-tray > .rich-step-inspector.compact select {
    width: 100%;
    min-width: 0;
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    padding: 0 10px;
  }

  .storyboard-property-tray > .rich-step-inspector.compact .rich-step-inspector-grid.two {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .storyboard-property-tray
    > .rich-step-inspector.compact
    .rich-step-inspector-grid.two
    .ui-segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .storyboard-property-tray
    > .rich-step-inspector.compact
    .rich-step-inspector-grid.two
    .ui-segmented-option {
    min-height: 32px;
    padding-inline: 6px;
  }

`;
