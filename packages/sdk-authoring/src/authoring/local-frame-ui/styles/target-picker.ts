export const AUTHORING_TARGET_PICKER_CSS = `

  .ui-select-trigger:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
  }

  .ui-select-content {
    z-index: 2147483647;
    min-width: var(--radix-select-trigger-width);
    max-height: min(280px, var(--radix-select-content-available-height));
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    box-shadow: var(--lq-shadow-popover);
  }

  .ui-select-viewport {
    padding: 4px;
  }

  .ui-select-item {
    position: relative;
    display: flex;
    min-height: 36px;
    align-items: center;
    border-radius: var(--lq-radius-xs);
    color: var(--lq-color-ink);
    cursor: default;
    font-size: 12px;
    line-height: 1.2;
    padding: 8px 32px 8px 8px;
    user-select: none;
  }

  .ui-select-item[data-highlighted] {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .ui-select-indicator {
    position: absolute;
    right: 8px;
    display: inline-grid;
    place-items: center;
  }

  .ui-native-select-mirror {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .badge,
  .target-chip,
  .property-chip {
    max-width: 100%;
    overflow: hidden;
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    border: 1px solid var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
    font-weight: 700;
    text-transform: none;
  }

  .block-title .badge {
    min-height: 24px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
  }

  .badge.incomplete {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .badge.invalid {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .anchor-button {
    min-height: 24px;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 700;
    padding: 4px 8px;
    white-space: nowrap;
    box-shadow: none;
  }

  .anchor-button-empty {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-warning);
  }

  .anchor-button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
    box-shadow: none;
  }

  .target-control {
    --target-accent: var(--lq-color-warning);
    display: inline-flex;
    min-width: 0;
    max-width: min(300px, 100%);
    min-height: 36px;
    align-items: center;
    gap: 0;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    overflow: visible;
    box-shadow: none;
  }

  .target-control:hover,
  .target-control:focus-within {
    background: transparent;
  }

  .target-control.found {
    --target-accent: var(--lq-color-success);
    border-color: transparent;
    background: transparent;
  }

  .target-control.missing,
  .target-control.ambiguous,
  .target-control.needs_review {
    --target-accent: var(--lq-color-warning);
    border-color: transparent;
    background: transparent;
  }

  .target-chip {
    display: inline-flex;
    max-width: 246px;
    min-width: 0;
    align-items: center;
    gap: 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font-weight: 700;
    padding: 4px 4px 4px 8px;
  }

  .target-chip-icon {
    flex: 0 0 auto;
    color: var(--target-accent);
  }

  .target-chip-label,
  .target-chip-anchor-mode,
  .target-chip-status {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-chip-label {
    max-width: 136px;
  }

  .target-control.exact-area .target-chip-label {
    max-width: 92px;
  }

  .target-chip-anchor-mode {
    flex: 0 0 auto;
    border: 1px solid var(--lq-color-blue-border);
    border-radius: 999px;
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
    font-size: 8px;
    font-weight: 700;
    line-height: 1.2;
    padding: 4px 4px;
  }

  .target-chip-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-left: 0;
    color: var(--target-accent);
    font-size: 10px;
    font-weight: 700;
    padding-left: 4px;
  }

  .target-control.found .target-chip-status {
    width: 9px;
    gap: 0;
    overflow: hidden;
    color: var(--target-accent);
    font-size: 0;
    padding-left: 0;
  }

  .target-chip-status::before {
    display: inline-block;
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: currentColor;
    content: "";
  }

  .target-menu-trigger {
    width: auto;
    min-width: 0;
    min-height: 36px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0 4px 0 0;
  }

  .target-menu-trigger:hover {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    box-shadow: none;
  }

  .target-control.missing .target-menu-trigger,
  .target-control.ambiguous .target-menu-trigger,
  .target-control.needs_review .target-menu-trigger {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-panel);
  }

  .target-combo-trigger .ui-button-label {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
    overflow: hidden;
  }

  .target-chip-more {
    flex: 0 0 auto;
    color: var(--lq-color-subtle);
  }

  .target-popover {
    width: min(348px, calc(100vw - 32px));
    max-height: min(540px, var(--radix-popover-content-available-height, 540px));
    padding: 0;
    overflow: hidden;
  }

  .target-menu {
    display: grid;
    gap: 8px;
    max-height: min(528px, calc(var(--radix-popover-content-available-height, 540px) - 12px));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px;
    scrollbar-color: var(--lq-color-border) transparent;
    scrollbar-width: thin;
  }

  .target-menu::-webkit-scrollbar {
    width: 10px;
  }

  .target-menu::-webkit-scrollbar-track {
    background: transparent;
  }

  .target-menu::-webkit-scrollbar-thumb {
    border: 3px solid var(--lq-color-page);
    border-radius: 999px;
    background: var(--lq-color-border);
  }

  .target-menu::-webkit-scrollbar-thumb:hover {
    background: var(--lq-color-border);
  }

  .target-menu-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    padding: 4px 4px 8px;
  }

  .target-menu-eyebrow {
    grid-column: 1 / -1;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    text-transform: none;
  }

  .target-menu-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-menu-status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    align-self: center;
    color: var(--lq-color-blue);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .target-menu-status.found {
    color: var(--lq-color-success);
  }

  .target-menu-status.missing,
  .target-menu-status.ambiguous,
  .target-menu-status.needs_review {
    color: var(--lq-color-warning);
  }

  .target-menu-status::before {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    content: "";
  }

  .target-menu .ui-tabs {
    gap: 8px;
  }

  .target-menu .ui-tabs-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .target-menu .ui-tabs-trigger {
    min-width: 0;
    min-height: 36px;
    justify-content: center;
    font-size: 12px;
    padding: 4px 8px;
  }

  .target-menu-panel {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .ui-popover-content {
    z-index: 2147483000;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    isolation: isolate;
    pointer-events: auto;
    box-shadow: var(--lq-shadow-popover);
  }

  .ui-popover-content[data-state="closed"] {
    display: none;
  }

  .ui-popover-close {
    position: absolute;
    z-index: 4;
    top: 8px;
    right: 8px;
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
    box-shadow: 0 0 0 1px var(--lq-color-border);
  }

  .ui-popover-close:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .ui-popover-arrow {
    fill: var(--lq-color-page);
    stroke: var(--lq-color-border);
    stroke-width: 1px;
  }

  .target-menu-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .target-menu-action {
    align-items: center;
    justify-content: center;
    min-width: 0;
    width: 100%;
    border-color: transparent;
    border-radius: 8px;
    background: transparent;
    min-height: 44px;
    padding: 8px;
    text-align: center;
    white-space: nowrap;
  }
`;
