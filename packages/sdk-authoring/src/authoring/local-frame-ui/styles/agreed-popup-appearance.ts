/** Approved popup appearance workspace and contrast presentation. */
export const AUTHORING_AGREED_POPUP_APPEARANCE_CSS = `
  .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray[data-tool-mode='popup']) {
    grid-template-rows: auto minmax(128px, 1fr) auto;
  }

  .rich-step-editor:has(.storyboard-property-tray[data-tool-mode='popup'])
    > .storyboard-editor-stage {
    overflow: hidden;
    padding-top: 28px;
    padding-bottom: 12px;
  }

  .storyboard-property-tray[data-tool-mode='popup'] {
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

  .storyboard-property-tray[data-tool-mode='popup'] > .storyboard-tray-handle,
  .storyboard-property-tray[data-tool-mode='popup'] > .storyboard-tray-header {
    display: none;
  }

  .storyboard-property-tray[data-tool-mode='popup'] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .storyboard-property-tray[data-tool-mode='popup'] > .popup-inspector-tabs {
    position: relative;
    top: 0;
    grid-column: 1;
    grid-row: 1;
    height: 44px;
    min-height: 44px;
    align-items: stretch;
    padding: 0 20px;
  }

  .storyboard-property-tray[data-tool-mode='popup'] > .storyboard-tray-close {
    grid-column: 2;
    grid-row: 1;
    align-self: center;
    margin-inline-end: 12px;
  }

  .storyboard-property-tray[data-tool-mode='popup'] > .popup-inspector-tabs ~ * {
    grid-column: 1 / -1;
  }

  .storyboard-property-tray[data-tool-mode='popup'] > .popup-inspector-tabs button {
    display: grid;
    min-height: 44px;
    place-items: center;
    padding: 0;
  }

  .storyboard-property-tray[data-tool-mode='popup'] > .storyboard-tab-panel {
    height: auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: visible;
    padding: 8px 16px 10px;
  }

  .storyboard-property-tray[data-tool-mode='popup']
    > .storyboard-tab-panel.popup-layout
    .rich-step-choice-field {
    gap: 3px;
  }

  .storyboard-property-tray[data-tool-mode='popup']
    > .storyboard-tab-panel.popup-layout
    .ui-segmented {
    padding: 2px;
  }

  .storyboard-property-tray[data-tool-mode='popup']
    > .storyboard-tab-panel.popup-layout
    .ui-segmented-option {
    min-height: 28px;
    padding-block: 2px;
  }

  .storyboard-property-tray[data-tool-mode='popup']
    > .storyboard-tab-panel.popup-layout[data-section='layout'] {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    align-content: start;
    gap: var(--lq-space-2);
  }

  .popup-appearance-workspace {
    display: grid;
    width: 100%;
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1.55fr) minmax(176px, 0.45fr);
    align-items: start;
    gap: 12px;
  }

  .popup-appearance-controls {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(2, minmax(220px, 1fr));
    gap: 16px;
  }

  .popup-appearance-progressive,
  .progressive-setting-panel {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: var(--lq-space-2);
  }

  .progressive-setting-tabs {
    display: flex;
    min-width: 0;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--lq-space-1);
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-1);
  }

  .progressive-setting-tabs button {
    min-width: 0;
    min-height: var(--lq-control-sm);
    flex: 1 1 0;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: var(--lq-radius-xs);
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
    padding-inline: var(--lq-space-2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-tab-panel.step-presentation .progressive-setting-tabs {
    align-items: stretch;
  }

  .storyboard-tab-panel.step-presentation .progressive-setting-tabs button {
    min-height: 42px;
    overflow: visible;
    line-height: 1.15;
    padding: 4px 6px;
    text-overflow: clip;
    white-space: normal;
  }

  .progressive-setting-tabs button[aria-current='page'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .progressive-setting-panel {
    min-height: 80px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: var(--lq-space-2);
  }

  .popup-appearance-progressive .popup-style-reset {
    min-height: var(--lq-control-sm);
    justify-self: start;
  }

  .popup-appearance-controls > * {
    min-width: 0;
  }

  .popup-appearance-controls .popup-style-reset {
    min-height: 40px;
    align-self: end;
    justify-self: start;
  }

  .popup-contrast-check {
    display: grid;
    min-width: 0;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: #ffffff;
    padding: 12px;
  }

  .popup-contrast-check > small,
  .step-presentation-preview-heading > small,
  .step-presentation-settings > small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .popup-contrast-check > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 12px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 12px;
  }

  .popup-contrast-check > div > strong {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xl);
    line-height: 1;
  }

  .popup-contrast-check > div > span {
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
  }

  .popup-contrast-check > div > small {
    grid-column: 1 / -1;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

`;
