/** Approved typography, spacing, and sequence property forms. */
export const AUTHORING_AGREED_CONTENT_PROPERTIES_CSS = `
  /* Block typography and spacing share one compact, scan-friendly form. */
  .storyboard-property-tray > .rich-step-inspector.compact {
    display: grid;
    grid-template-columns: minmax(144px, 180px) minmax(320px, 560px);
    align-items: start;
    justify-content: start;
    gap: var(--lq-space-3) var(--lq-space-4);
    padding: var(--lq-space-3) var(--lq-space-4) var(--lq-space-4);
  }

  .storyboard-property-tray > .rich-step-inspector.compact[data-has-font-size='false'] {
    grid-template-columns: minmax(320px, 560px);
  }

  .storyboard-property-tray > .rich-step-inspector.compact > .rich-step-font-size-field {
    align-self: start;
  }

  .storyboard-property-tray
    > .rich-step-inspector.compact
    > .rich-step-font-size-field
    .ui-number-combobox {
    height: var(--lq-control-sm);
    max-width: 180px;
    font-size: var(--lq-font-xs);
  }

  .storyboard-property-tray
    > .rich-step-inspector.compact
    > .rich-step-font-size-field
    .ui-number-combobox input {
    font-size: var(--lq-font-xs);
  }

  .block-spacing-rows {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-2);
  }

  .block-spacing-row {
    display: grid;
    min-width: 0;
    grid-template-columns: 56px minmax(0, 1fr);
    align-items: center;
    gap: var(--lq-space-2);
  }

  .block-spacing-row > span {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .block-spacing-row .ui-segmented {
    display: grid;
    width: 100%;
    min-width: 0;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .block-spacing-row .ui-segmented-option {
    min-width: 0;
    min-height: var(--lq-control-sm);
    padding-inline: var(--lq-space-2);
  }

  .sequence-property-editor {
    gap: 10px;
    border-color: var(--lq-color-border-soft);
    background: #ffffff;
    padding: 12px;
  }

  .sequence-summary-header > span {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .sequence-summary-header small {
    color: var(--lq-color-ink);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .sequence-summary-header strong {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 500;
  }

  .sequence-summary-strip {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr) auto minmax(150px, 1fr);
    align-items: center;
    gap: 8px;
  }

  .sequence-summary-card {
    display: grid;
    min-width: 0;
    min-height: 56px;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 9px;
    background: #ffffff;
    padding: 8px 10px;
  }

  .sequence-summary-card > svg {
    color: var(--lq-color-primary);
  }

  .sequence-summary-card > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .sequence-summary-card strong {
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-summary-card small {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-summary-arrow {
    color: #98a2b3;
  }

  .sequence-details {
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 8px;
  }

  .sequence-details > summary {
    width: max-content;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
  }

  .sequence-details-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 12px;
  }

  .sequence-editor-actions {
    display: flex;
    justify-content: flex-end;
  }

  .sequence-guided-card,
  .sequence-recovery-card {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: var(--lq-space-2);
    margin: 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    padding: var(--lq-space-3);
  }

  .sequence-guided-card > legend,
  .sequence-recovery-card > legend {
    display: inline-flex;
    align-items: center;
    gap: var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding-inline: var(--lq-space-1);
  }

  .sequence-guided-card > legend > span {
    display: inline-grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-2xs);
  }

  .sequence-guided-card > .ui-field,
  .sequence-guided-card > .ui-select-trigger,
  .sequence-recovery-card .ui-field,
  .sequence-recovery-card .ui-select-trigger,
  .sequence-wait-row > .ui-field,
  .sequence-wait-row > .ui-select-trigger {
    width: 100%;
    min-width: 0;
  }

  .sequence-guided-card .ui-input,
  .sequence-guided-card .ui-select-trigger,
  .sequence-recovery-card .ui-input,
  .sequence-recovery-card .ui-select-trigger {
    min-height: var(--lq-control-sm);
    font-size: var(--lq-font-xs);
  }

  .sequence-wait-row {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-2);
  }

  .sequence-wait-row > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .sequence-wait-row > .ui-button {
    min-height: var(--lq-control-sm);
    justify-self: end;
  }

  .sequence-recovery-card,
  .sequence-details-grid > .sequence-recovery-card,
  .sequence-details-grid > .ui-button {
    grid-column: 1 / -1;
  }

  .sequence-timeout-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-3);
  }

  .sequence-native-field {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .sequence-native-field > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
  }

`;
