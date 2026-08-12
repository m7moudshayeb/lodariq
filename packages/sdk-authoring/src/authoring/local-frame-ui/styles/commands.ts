export const AUTHORING_COMMAND_CSS = `
  .inline-command-menu {
    position: fixed;
    inset: auto;
    z-index: 320;
    display: grid;
    width: min(288px, calc(100vw - 24px));
    max-height: min(320px, calc(100vh - 24px));
    gap: 4px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    margin: 0;
    overscroll-behavior: contain;
    overflow-y: auto;
    padding: 8px;
    box-shadow: var(--lq-shadow-popover);
  }

  .inline-insert.compact .inline-command-menu {
    width: min(288px, calc(100vw - 24px));
  }

  .inline-command-menu[hidden] {
    display: none;
  }

  .inline-command-header {
    position: sticky;
    z-index: 2;
    top: -8px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px;
    gap: 8px;
    background: var(--lq-color-page);
    padding-bottom: 4px;
  }

  .inline-command {
    justify-content: flex-start;
    min-height: 44px;
    border-color: transparent;
    background: transparent;
    padding: 8px 8px;
    text-align: left;
    white-space: normal;
  }

  .inline-command .ui-button-label {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .inline-command-search {
    width: 100%;
    height: 36px;
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: 12px;
    padding: 8px 12px;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .inline-command-search::placeholder {
    color: var(--lq-color-subtle);
  }

  .inline-command-close {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-page);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
  }

  .inline-command-close:hover {
    border-color: var(--lq-color-primary-border);
    color: var(--lq-color-primary);
  }

  .inline-command-empty {
    color: var(--lq-color-muted);
    font-size: 12px;
    padding: 8px;
  }

  .inline-command:hover,
  .inline-command.active,
  .inline-command[aria-selected="true"] {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    box-shadow: none;
  }

  .command-item.active .command-icon,
  .command-item[aria-selected="true"] .command-icon,
  .inline-command.active .ui-button-icon,
  .inline-command[aria-selected="true"] .ui-button-icon {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .inline-command-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .inline-command-copy strong,
  .inline-command-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inline-command-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
  }

  .inline-command-copy small {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 500;
  }

  .block {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    border-top: 1px solid transparent;
    background: transparent;
    padding: 4px 16px 4px 0;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .block::before {
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: -10px;
    width: 2px;
    border-radius: 999px;
    background: transparent;
    content: "";
    transition: background 120ms ease;
  }

  .block:hover,
  .block:focus-within,
  .block.selected {
    border-color: transparent;
    background: transparent;
  }

  .block[data-block-type="tourStep"] {
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    padding: 16px 16px 16px 40px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.24),
      0 10px 28px rgba(0, 0, 0, 0.23);
  }

  .block[data-block-type="tourStep"]:first-child {
    border-top-color: var(--lq-color-border);
  }

  .block[data-block-type="tourStep"]::before {
    top: 12px;
    bottom: 12px;
    left: 7px;
  }

  .block[data-block-type="tourStep"] .block-side-rail {
    top: 17px;
    left: 11px;
    width: 18px;
    transform: translateX(-1px);
  }

  .block[data-block-type="tourStep"]:hover,
  .block[data-block-type="tourStep"]:focus-within,
  .block[data-block-type="tourStep"].selected {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.24),
      0 12px 30px rgba(0, 0, 0, 0.27);
  }

  .block:hover::before,
  .block:focus-within::before,
  .block.selected::before {
    background: var(--lq-color-primary-border);
  }

  .block.incomplete::before {
    background: var(--lq-color-warning);
  }

  .block.invalid::before {
    background: var(--lq-color-danger);
  }

  .block.drop-before::after,
  .block.drop-after::after {
    position: absolute;
    right: 16px;
    left: 16px;
    z-index: 4;
    height: 2px;
    border-radius: 999px;
    background: var(--lq-color-primary);
    box-shadow: 0 0 0 4px rgba(23, 79, 85, 0.1);
    content: "";
    pointer-events: none;
  }

  .block.drop-before::after {
    top: 0;
  }

  .block.drop-after::after {
    bottom: 0;
  }

  .block-side-rail {
    position: absolute;
    top: 8px;
    left: -22px;
    z-index: 20;
    display: grid;
    width: 18px;
    justify-items: center;
    align-content: start;
    gap: 4px;
    opacity: 0;
    padding-top: 0;
    pointer-events: none;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
    transform: translateX(2px);
  }

  .block:hover .block-side-rail,
  .block:focus-within .block-side-rail,
  .block.selected .block-side-rail {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
  }

  .block-content {
    display: grid;
    min-width: 0;
    gap: 0;
    border-radius: 12px;
  }

  .block-header {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .block-header {
    position: relative;
    z-index: 12;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    opacity: 1;
  }

  .block-grip {
    display: inline-grid;
    width: 18px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-subtle);
    cursor: grab;
    padding: 0;
    opacity: 1;
    transition: opacity 120ms ease;
  }

  .block-grip:active {
    cursor: grabbing;
  }

  .block:hover .block-grip,
  .block:focus-within .block-grip,
  .block.selected .block-grip {
    opacity: 1;
  }

  .block-title {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .block-anchor-slot {
    display: inline-flex;
    flex: 0 1 auto;
    min-width: 0;
    align-items: center;
    gap: 4px;
    justify-content: flex-start;
  }

  .block-kicker {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .block[data-block-type="tourStep"] .block-kicker {
    min-height: 16px;
    border-color: transparent;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
    padding: 0;
  }

  .block:hover .block-kicker,
  .block:focus-within .block-kicker,
  .block.selected .block-kicker {
    color: var(--lq-color-ink-soft);
  }

  .field-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .block-title strong {
    display: none;
    min-width: 0;
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .block-header-actions {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    opacity: 0;
    pointer-events: none;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
    transform: translateX(2px);
  }

  .block[data-block-type="tourStep"] .block-header-actions {
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    padding: 4px;
  }

  .block:hover .block-header-actions,
  .block:focus-within .block-header-actions,
  .block.selected .block-header-actions {
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
  }

  .block[data-block-type="tourStep"]:hover .block-header-actions,
  .block[data-block-type="tourStep"]:focus-within .block-header-actions,
  .block[data-block-type="tourStep"].selected .block-header-actions {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.27);
  }

  .block-inline-actions {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 1px;
    opacity: 1;
    pointer-events: auto;
    transition: opacity 120ms ease;
  }

  .block:hover .block-inline-actions,
  .block:focus-within .block-inline-actions,
  .block.selected .block-inline-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .block-inline-action {
    width: 26px;
    min-width: 26px;
    min-height: 24px;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
  }

  .block-inline-action:hover {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    box-shadow: none;
  }

  .block-inline-action-danger {
    color: var(--lq-color-danger);
  }

  .block-inline-action-danger:hover {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .block-action-trigger {
    width: 26px;
    min-width: 26px;
    min-height: 24px;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
  }
`;
