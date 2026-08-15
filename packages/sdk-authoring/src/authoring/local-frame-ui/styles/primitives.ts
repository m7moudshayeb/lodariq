export const AUTHORING_PRIMITIVE_CSS = `
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .actions,
  .panel-actions,
  .quick-insert,
  .block-tools,
  .block-meta {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .ui-button {
    display: inline-flex;
    min-width: 0;
    min-height: var(--lq-control-sm);
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    line-height: 1.2;
    padding: var(--lq-space-2) var(--lq-space-3);
    white-space: nowrap;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      transform 120ms ease;
  }

  .ui-button:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }

  .ui-button:active {
    transform: translateY(1px);
  }

  .ui-button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .ui-button-primary {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .ui-button-primary:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
  }

  .ui-button-ghost {
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
  }

  .ui-button-danger {
    border-color: var(--lq-color-danger-border);
    color: var(--lq-color-danger);
  }

  .ui-button-danger:hover {
    border-color: var(--lq-color-danger);
    background: var(--lq-color-danger-soft);
  }

  .ui-button-icon,
  .ui-icon {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
  }

  .ui-button-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ui-icon-button {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    cursor: pointer;
  }

  .ui-icon-button:hover {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .ui-icon-button-compact {
    width: 30px;
    height: 30px;
  }

  .ui-icon-button-default {
    width: var(--lq-control-sm);
    height: var(--lq-control-sm);
  }

  .ui-segmented {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: var(--lq-space-1);
  }

  .ui-segmented-option {
    display: inline-flex;
    min-width: 0;
    height: 30px;
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-1);
    border: 1px solid transparent;
    border-radius: calc(var(--lq-radius-sm) - 2px);
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
    white-space: nowrap;
  }

  .ui-segmented-default .ui-segmented-option {
    height: var(--lq-control-sm);
    padding: 0 var(--lq-space-3);
  }

  .ui-segmented-option:hover {
    color: var(--lq-color-ink);
  }

  .ui-segmented-option[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
  }

  .ui-segmented-icon {
    display: inline-grid;
    place-items: center;
  }

  .ui-field,
  .ui-range {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .ui-field-label,
  .ui-range-header {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .ui-field-description {
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .ui-input {
    width: 100%;
    height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    padding: 0 var(--lq-space-3);
  }

  .ui-number-combobox {
    display: grid;
    width: 100%;
    min-width: 0;
    height: var(--lq-control-sm);
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
  }

  .ui-number-combobox:focus-within {
    border-color: var(--lq-color-primary);
    box-shadow: 0 0 0 2px var(--lq-color-primary-soft);
  }

  .ui-number-combobox input {
    width: 100%;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
    appearance: textfield;
    padding: 0 2px 0 var(--lq-space-3);
  }

  .ui-number-combobox input::-webkit-inner-spin-button,
  .ui-number-combobox input::-webkit-outer-spin-button {
    display: none;
    margin: 0;
    appearance: none;
  }

  .ui-number-combobox input::placeholder {
    color: var(--lq-color-muted);
    opacity: 1;
  }

  .ui-number-combobox-suffix {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    pointer-events: none;
  }

  .ui-number-combobox-trigger {
    display: grid;
    width: var(--lq-control-sm);
    height: 100%;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    padding: 0;
  }

  .ui-number-combobox-trigger:hover {
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink);
  }

  .ui-number-combobox-content {
    width: max(var(--radix-popover-trigger-width), 168px);
    min-width: 168px;
  }

  .ui-number-combobox-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    max-height: 248px;
    overflow-y: auto;
    padding: var(--lq-space-1);
  }

  .ui-number-combobox-option {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--lq-control-sm);
    border: 0;
    background: transparent;
    text-align: left;
  }

  .ui-number-combobox-option[data-kind='special'] {
    grid-column: 1 / -1;
  }

  .ui-range-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-2);
  }

  .ui-range output {
    color: var(--lq-color-ink);
    font-variant-numeric: tabular-nums;
  }

  .ui-range input {
    width: 100%;
    accent-color: var(--lq-color-primary);
  }
`;
