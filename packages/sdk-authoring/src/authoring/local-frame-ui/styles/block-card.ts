export const AUTHORING_BLOCK_CARD_CSS = `

  .block-action-trigger:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
  }

  .block-action-popover {
    width: 220px;
    padding: 8px;
  }

  .block-action-menu {
    display: grid;
    gap: 4px;
  }

  .block-action-menu-header {
    display: grid;
    gap: 1px;
    padding: 4px 8px 8px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    margin-bottom: 4px;
  }

  .block-action-menu-header span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .block-action-menu-header strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .block-action-menu-item {
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

  .block-action-menu-item:hover {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    box-shadow: none;
  }

  .block[data-block-type="heading"] .block-title strong,
  .block[data-block-type="paragraph"] .block-title strong,
  .block[data-block-type="button"] .block-title strong {
    color: var(--lq-color-ink-soft);
    font-weight: var(--lq-weight-semibold);
  }

  .block-body,
  .step-document {
    display: grid;
    gap: 4px;
  }

  .step-document {
    gap: 0;
    padding: 1px 0 0;
  }

  .step-composer {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
  }

  .step-composer-plus {
    display: inline-grid;
    width: 18px;
    height: 36px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
    cursor: pointer;
  }

  .step-composer-plus:hover,
  .step-composer-plus[aria-expanded="true"] {
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink);
  }

  .step-composer-body {
    position: relative;
    display: grid;
    gap: 4px;
    min-width: 0;
    overflow: visible;
  }

  .step-composer-input {
    width: 100%;
    min-height: 36px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    padding: 8px 8px 8px 4px;
  }

  .step-composer-input:hover,
  .step-composer-input:focus {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
  }

  .step-composer-input::placeholder {
    color: var(--lq-color-subtle);
  }

  .step-quick-insert {
    display: flex;
    min-width: 0;
    min-height: 28px;
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    opacity: 0;
    padding: 0 0 4px;
    overflow: hidden;
    pointer-events: none;
    transform: translateY(-2px);
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .step-composer[data-command-menu-open] .step-quick-insert {
    opacity: 0;
    pointer-events: none;
  }

  .step-composer:hover .step-quick-insert,
  .step-composer:focus-within .step-quick-insert {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .step-quick-insert-button.ui-button,
  .step-quick-insert-button {
    width: 28px;
    min-width: 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    padding: 0;
  }

  .step-quick-insert-button:hover {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    box-shadow: none;
  }

  .step-quick-insert-button .ui-button-icon {
    width: 17px;
    height: 17px;
    color: var(--lq-color-subtle);
  }

  .step-quick-insert-button:hover .ui-button-icon {
    color: var(--lq-color-ink-soft);
  }

  .step-command-menu {
    position: fixed;
    z-index: 260;
    display: grid;
    width: min(236px, calc(100vw - 16px));
    max-width: 236px;
    max-height: min(220px, calc(100vh - 16px));
    justify-self: start;
    gap: 4px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-page);
    padding: 4px;
    box-shadow: var(--lq-shadow-popover);
  }

  .step-command-menu[hidden] {
    display: none;
  }

  .step-command-menu .command-menu-header {
    font-size: var(--lq-font-xs);
    padding: 4px 4px 8px;
  }

  .step-command-menu .command-menu-header kbd {
    font-size: 8px;
    padding: 4px 4px;
  }

  .step-command-menu .command-item .ui-button-label {
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .step-command-menu .command-item {
    min-height: 36px;
    align-items: center;
    border-radius: 8px;
    padding: 4px;
  }

  .step-command-menu .command-icon {
    width: 22px;
    height: 24px;
    border-radius: 8px;
  }

  .step-command-menu .command-icon svg {
    width: 14px;
    height: 14px;
  }

  .step-command-menu .command-copy {
    gap: 0;
    padding-top: 1px;
  }

  .step-command-menu .command-copy strong {
    font-size: var(--lq-font-sm);
  }

  .step-command-menu .command-copy small {
    font-size: var(--lq-font-xs);
  }

  .step-command-menu .command-description {
    display: none;
  }

  .step-child {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-width: 0;
    align-items: start;
    column-gap: 4px;
    row-gap: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    margin: 0;
    padding: 1px 0;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .step-child::before {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 2px;
    width: 2px;
    border-radius: 999px;
    background: transparent;
    content: "";
    transition: background 120ms ease;
  }

  .step-child.drop-before::after,
  .step-child.drop-after::after {
    position: absolute;
    right: 4px;
    left: 4px;
    z-index: 11;
    height: 2px;
    border-radius: 999px;
    background: var(--lq-color-primary);
    box-shadow: 0 0 0 4px rgba(23, 79, 85, 0.1);
    content: "";
    pointer-events: none;
  }

  .step-child.drop-before::after {
    top: -1px;
  }

  .step-child.drop-after::after {
    bottom: -1px;
  }

  .step-child:hover,
  .step-child:focus-within,
  .step-child.selected {
    border-color: transparent;
    background: transparent;
  }

  .step-child.selected {
    background: rgba(255, 255, 255, 0.04);
  }

  .step-child.selected::before {
    background: var(--lq-color-primary);
  }

  .step-child + .inline-insert,
  .step-child .inline-insert {
    margin-top: 0;
  }

  .step-child-toolbar {
    position: absolute;
    top: 2px;
    right: 4px;
    left: -20px;
    z-index: 12;
    display: flex;
    min-width: 0;
    width: auto;
    height: 24px;
    flex-wrap: nowrap;
    align-items: center;
    align-self: start;
    justify-content: flex-start;
    gap: 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    opacity: 0;
    pointer-events: none;
    padding: 0;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
    transform: translateY(-1px);
  }

  .step-child > .content-field,
  .step-child > .button-field-shell {
    grid-column: 2;
    grid-row: 1;
  }

  .step-child > .content-field {
    padding-right: 40px;
  }

  .step-child > .cta-panel,
  .step-child > .inline-insert {
    grid-column: 1 / -1;
  }

  .step-child > .inline-insert {
    position: absolute;
    right: 30px;
    bottom: -10px;
    left: 18px;
    min-height: 0;
    margin: 0;
  }

  .step-child > .inline-insert.open,
  .step-child > .inline-insert:focus-within,
  .step-child:hover > .inline-insert {
    min-height: 16px;
  }

  .step-child-heading {
    margin-bottom: 4px;
  }

  .step-child-paragraph,
  .step-child-list,
  .step-child-link,
  .step-child-divider {
    margin-bottom: 4px;
  }

  .step-child-button {
    margin-top: 8px;
    margin-bottom: 8px;
  }

  .step-child:hover .step-child-toolbar,
  .step-child:focus-within .step-child-toolbar,
  .step-child.selected .step-child-toolbar {
    opacity: 1;
    transform: translateY(0);
  }

  .step-child-secondary-actions {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 1px;
    margin-left: auto;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28);
    padding: 4px;
    pointer-events: auto;
  }

  .step-child-inline-actions {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 1px;
  }
`;
