export const AUTHORING_STEP_SETTINGS_CSS = `

  .rich-step-inspector > header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--lq-space-3);
    margin-bottom: var(--lq-space-2);
  }

  .rich-step-inspector > header strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .rich-step-inspector > header span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .rich-step-inspector-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--lq-space-2);
  }

  .rich-step-inspector-grid.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .rich-step-inspector-grid label,
  .rich-step-url-field {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .rich-step-inspector-grid label > span,
  .rich-step-url-field > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .rich-step-choice-field,
  .rich-step-color-field {
    min-width: 0;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .rich-step-choice-field legend,
  .rich-step-color-field legend {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    margin-bottom: var(--lq-space-2);
  }

  .rich-step-choice-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-2);
  }

  .rich-step-choice-list button {
    display: inline-flex;
    min-width: 0;
    min-height: var(--lq-control-md);
    align-items: center;
    justify-content: flex-start;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
    text-align: left;
  }

  .rich-step-choice-list button:hover,
  .rich-step-choice-list button.selected,
  .rich-step-choice-list button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-step-choice-list button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rich-step-color-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--lq-space-2);
    margin-top: var(--lq-space-2);
  }

  .rich-step-color-swatches {
    display: flex;
    min-height: var(--lq-control-md);
    flex-wrap: wrap;
    align-items: center;
    gap: var(--lq-space-2);
  }

  .rich-step-color-swatches > button:not(.rich-step-theme-color) {
    display: inline-grid;
    width: var(--lq-control-sm);
    height: var(--lq-control-sm);
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--storyboard-swatch, #ffffff);
    color: var(--storyboard-swatch-ink, #ffffff);
    cursor: pointer;
    padding: 0;
  }

  .rich-step-color-swatches > button.selected:not(.rich-step-theme-color) {
    border-color: var(--lq-color-primary-border);
    box-shadow: 0 0 0 2px #ffffff inset;
  }

  .rich-step-custom-color {
    position: relative;
    display: inline-flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
  }

  .rich-step-custom-color input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .rich-step-theme-color {
    min-height: var(--lq-control-sm);
    border: 0;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-1);
  }

  .rich-step-theme-color:disabled {
    color: var(--lq-color-muted);
    cursor: default;
    opacity: 0.5;
  }

  .storyboard-tab-panel.popup-layout .rich-step-color-field {
    min-width: 248px;
  }

  .popup-style-reset {
    min-width: max-content;
    min-height: var(--lq-control-sm);
    align-self: end;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-3);
  }

  .popup-style-reset:disabled {
    color: var(--lq-color-muted);
    cursor: default;
    opacity: 0.5;
  }

  .rich-step-color-value {
    display: flex;
    height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    padding: 0 var(--lq-space-2);
  }

  .rich-step-color-value input {
    width: var(--lq-space-4);
    height: var(--lq-space-4);
    border: 0;
    background: transparent;
    padding: 0;
  }

  .rich-step-color-value code {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    text-overflow: ellipsis;
  }

  .rich-step-color-value button {
    min-height: var(--lq-space-5);
    border: 0;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    padding: 0;
  }

  .rich-step-color-value button:disabled {
    color: var(--lq-color-muted);
    cursor: default;
    opacity: 0.5;
  }

  .rich-step-url-field {
    margin-top: var(--lq-space-2);
  }

  .rich-step-url-field.prominent {
    width: min(480px, 100%);
    margin-top: 0;
  }

  .rich-step-url-field.prominent input {
    width: 100%;
    height: 36px;
    min-height: 36px;
    padding: 0 12px;
  }

  .rich-step-url-field.prominent small {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.4;
  }

  .rich-step-inspector.compact {
    padding-block: var(--lq-space-2);
  }

  .rich-step-inspector.popup {
    background: var(--lq-color-primary-soft);
  }

  .tour-placement-card {
    display: grid;
    width: 100%;
    min-height: var(--lq-control-lg);
    grid-template-columns: var(--lq-space-5) minmax(0, 1fr) var(--lq-space-5);
    align-items: center;
    gap: var(--lq-space-3);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: var(--lq-space-2) var(--lq-space-3);
    text-align: left;
  }

  .tour-placement-card:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-placement-card > span {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .tour-placement-card strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  .tour-placement-card small {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-live-target .target-control,
  .tour-live-target .target-menu-trigger.ui-button {
    width: 100%;
    max-width: none;
  }

  .tour-live-target .target-menu-trigger.ui-button {
    min-height: var(--lq-control-lg);
    justify-content: space-between;
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel-strong);
    padding: 0 var(--lq-space-2);
  }

  .tour-live-target .target-combo-trigger .ui-button-label,
  .tour-live-target .target-chip {
    width: 100%;
    max-width: none;
  }

  .tour-live-target .target-chip-label,
  .tour-live-target .target-control.exact-area .target-chip-label {
    max-width: none;
  }

  .tour-position-group {
    margin-top: var(--lq-space-3);
  }

  .tour-position-group h4 {
    margin: 0 0 var(--lq-space-2);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .tour-position-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--lq-space-2);
  }

  .tour-position-options button {
    display: grid;
    min-height: 64px;
    place-items: center;
    align-content: center;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .tour-position-options button:hover {
    background: var(--lq-color-panel-strong);
  }

  .tour-position-options button.selected,
  .tour-position-options button[aria-pressed='true'] {
    border-color: var(--lq-color-blue);
    background: var(--lq-color-blue-soft);
    box-shadow: 0 0 0 1px var(--lq-color-blue) inset;
    color: var(--lq-color-blue);
  }

  .tour-advance-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-2);
  }

  .tour-advance-options button {
    position: relative;
    display: grid;
    min-height: 80px;
    grid-template-columns: var(--lq-space-5) var(--lq-space-6) minmax(0, 1fr);
    align-items: start;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: var(--lq-space-3);
    text-align: left;
  }

  .tour-advance-options button:hover {
    background: var(--lq-color-panel-strong);
  }

  .tour-advance-options button.selected,
  .tour-advance-options button[aria-pressed='true'] {
    border-color: var(--lq-color-blue);
    background: var(--lq-color-blue-soft);
    box-shadow: 0 0 0 1px var(--lq-color-blue) inset;
  }

  .tour-advance-radio {
    width: var(--lq-space-4);
    height: var(--lq-space-4);
    margin-top: var(--lq-space-1);
    border: 2px solid var(--lq-color-subtle);
    border-radius: 999px;
    background: #ffffff;
  }

  .tour-advance-options button.selected .tour-advance-radio {
    border: var(--lq-space-1) solid var(--lq-color-blue);
  }

  .tour-advance-options button > span:last-child {
    display: grid;
    gap: var(--lq-space-1);
  }

  .tour-advance-options strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .tour-advance-options small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .tour-advanced-settings-row {
    display: grid;
    width: auto;
    grid-template-columns: var(--lq-space-5) minmax(0, 1fr) var(--lq-space-5);
    align-items: center;
    gap: var(--lq-space-3);
    margin: var(--lq-space-3) var(--lq-space-4) var(--lq-space-4);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: var(--lq-space-3);
    text-align: left;
  }

  .tour-advanced-settings-row > span {
    display: grid;
    gap: var(--lq-space-1);
  }

  .tour-advanced-settings-row strong {
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .tour-advanced-settings-row small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }
`;
