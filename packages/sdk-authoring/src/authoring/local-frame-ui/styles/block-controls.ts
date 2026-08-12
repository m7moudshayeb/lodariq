export const AUTHORING_BLOCK_CONTROL_CSS = `
  .step-child-drag-handle {
    display: inline-grid;
    width: 20px;
    min-width: 20px;
    height: 20px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-subtle);
    cursor: grab;
    pointer-events: auto;
    padding: 0;
  }

  .step-child-drag-handle:hover {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .step-child-drag-handle:active {
    cursor: grabbing;
  }

  .step-child-inline-action,
  .step-child-menu-trigger {
    width: 22px;
    min-width: 22px;
    min-height: 24px;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
  }

  .step-child-inline-action:hover,
  .step-child-menu-trigger:hover {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    box-shadow: none;
  }

  .step-child-inline-action-danger {
    color: var(--lq-color-danger);
  }

  .step-child-inline-action-danger:hover {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .step-child-action-popover {
    width: 236px;
    padding: 8px;
  }

  .step-child-menu {
    display: grid;
    gap: 4px;
  }

  .step-child-menu-header {
    display: grid;
    gap: 1px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    margin-bottom: 4px;
    padding: 4px 8px 8px;
  }

  .step-child-menu-header span,
  .step-child-menu-label {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
  }

  .step-child-menu-header strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.25;
  }

  .step-child-menu-section {
    display: grid;
    gap: 4px;
  }

  .step-child-menu-transform {
    border-top: 1px solid var(--lq-color-border-soft);
    margin-top: 4px;
    padding-top: 8px;
  }

  .step-child-menu-label {
    padding: 4px 8px 4px;
  }

  .step-child-menu-item {
    justify-content: flex-start;
    width: 100%;
    min-height: 36px;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    padding: 8px 8px;
    text-align: left;
  }

  .step-child-menu-item:hover,
  .step-child-menu-item.active {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    box-shadow: none;
  }

  .step-child-menu-item.active {
    color: var(--lq-color-primary);
  }

  .block-section,
  .block-footer {
    margin-left: 0;
  }

  .block-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    padding: 4px 0;
  }

  .block-section-content {
    padding-top: 4px;
  }

  .block-footer {
    margin-left: 0;
  }

  .content-field {
    position: relative;
    display: grid;
    gap: 4px;
  }

  .field-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .block-input {
    width: 100%;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.4;
    padding: 4px 8px;
    transition:
      background 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .block-input:hover,
  .block-input:focus {
    background: rgba(255, 255, 255, 0.05);
    box-shadow: none;
  }

  .block-input:focus {
    box-shadow: inset 0 0 0 1px var(--lq-color-border-soft);
  }

  .block-input[aria-label="Heading"] {
    color: var(--lq-color-ink);
    font-size: 18px;
    font-weight: 700;
    line-height: 1.22;
  }

  textarea.block-input {
    field-sizing: content;
    min-height: 24px;
    overflow: hidden;
    resize: none;
  }

  textarea.block-input[aria-label="Heading"] {
    min-height: 36px;
  }

  .block-input-button,
  .block-input[aria-label="Button label"] {
    width: 100%;
    min-height: 36px;
    border: 1px solid rgba(7, 25, 22, 0.08);
    border-radius: 8px;
    background: var(--lq-color-primary);
    color: var(--lq-color-page);
    box-shadow: 0 2px 8px rgba(23, 79, 85, 0.1);
    font-size: 14px;
    font-weight: 700;
    padding: 8px 12px;
    text-align: center;
  }

  .block-input-button:hover,
  .block-input-button:focus,
  .block-input[aria-label="Button label"]:hover,
  .block-input[aria-label="Button label"]:focus {
    background: var(--lq-color-primary-hover);
    box-shadow:
      0 5px 14px rgba(23, 79, 85, 0.16),
      inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }

  .block-input-link,
  .block-input[aria-label="Link label"] {
    width: 100%;
    min-height: 24px;
    color: var(--lq-color-primary);
    font-size: 14px;
    font-weight: 700;
    padding: 4px 8px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .divider-field {
    min-height: 12px;
    justify-content: center;
    padding: 4px 8px 4px;
  }

  .divider-preview {
    width: 100%;
    height: 1px;
    background: var(--lq-color-border);
  }

  .media-field {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    padding: 4px 8px;
  }

  .media-field:hover,
  .media-field:focus-within {
    border-color: var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.05);
  }

  .media-placeholder-icon {
    display: inline-grid;
    width: 28px;
    height: 36px;
    place-items: center;
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .media-field .block-input {
    min-height: 36px;
    padding: 4px 4px;
  }

  .media-placeholder-state {
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 600;
    padding: 0;
    white-space: nowrap;
  }

  .button-field-shell {
    display: flex;
    flex-direction: column;
    width: min(100%, 320px);
    min-width: 0;
    align-items: stretch;
    gap: 4px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 0;
  }

  .button-field-shell.incomplete {
    background: transparent;
  }

  .button-config-row {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }

  .button-style-control .ui-select-trigger {
    min-width: 96px;
  }

  .button-label-field {
    min-width: 0;
  }

  .link-field-shell {
    width: min(100%, 360px);
    gap: 0;
  }

  .action-url-field {
    width: min(100%, 190px);
    min-width: 0;
    max-width: 100%;
    padding-left: 0;
  }

  .cta-panel .action-url-field {
    flex: 0 1 140px;
    width: auto;
    min-width: 120px;
    max-width: 190px;
  }

  .block-input-url {
    min-height: 24px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    padding: 4px 8px;
  }

  .cta-panel {
    display: flex;
    align-items: center;
    justify-self: start;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    gap: 4px 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 0 0 0 1px;
    opacity: 0.68;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      opacity 120ms ease;
  }

  .step-child-button:hover .cta-panel,
  .step-child-button:focus-within .cta-panel,
  .step-child-button.selected .cta-panel {
    border-color: transparent;
    background: transparent;
    opacity: 1;
  }

  .cta-panel.incomplete {
    border-color: transparent;
    background: transparent;
    opacity: 1;
  }

  .cta-panel-icon {
    display: none;
    width: 22px;
    height: 36px;
    place-items: center;
    color: var(--lq-color-subtle);
  }

  .cta-panel-label {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--lq-color-subtle);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
  }

  .cta-panel .ui-select-trigger {
    width: auto;
    min-width: 132px;
    min-height: 24px;
    flex: 0 0 auto;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 600;
    padding: 4px 8px;
    box-shadow: none;
  }

  .cta-panel.incomplete .ui-select-trigger {
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-warning);
  }

  .cta-panel .ui-select-trigger:hover,
  .cta-panel .ui-select-trigger:focus {
    border-color: var(--lq-color-border);
    background: var(--lq-color-page);
    color: var(--lq-color-ink-soft);
  }

  .ui-select-trigger {
    display: inline-flex;
    width: 100%;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: 12px;
    padding: 8px 8px 8px 12px;
    text-align: left;
  }
`;
