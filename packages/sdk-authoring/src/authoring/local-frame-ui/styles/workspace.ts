import { AUTHORING_CONTEXT_SURFACE_TOKENS } from '../../../creator-chrome-tokens';
import { AUTHORING_FOUNDATION_CSS } from './foundation';
import { AUTHORING_PRIMITIVE_CSS } from './primitives';
import { AUTHORING_SHELL_CSS } from './shell';

export const AUTHORING_WORKSPACE_CSS = `
  ${AUTHORING_FOUNDATION_CSS}
  ${AUTHORING_SHELL_CSS}
  ${AUTHORING_PRIMITIVE_CSS}

  .workspace {
    display: grid;
    gap: 0;
    min-width: 0;
    padding: 0 16px 24px;
    background: var(--lq-color-page);
  }

  .shell-panel .workspace {
    padding: 0 12px 24px;
  }

  .document-page {
    position: relative;
    display: grid;
    gap: 8px;
    width: min(100%, 1440px);
    margin: 0 auto;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .canvas-actionbar {
    position: sticky;
    top: 72px;
    z-index: 18;
    justify-self: end;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 12px 16px -40px 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    padding: 4px;
    box-shadow: 0 6px 18px rgba(7, 25, 22, 0.07);
    backdrop-filter: blur(12px);
    opacity: 0.82;
    transition:
      background 120ms ease,
      box-shadow 120ms ease,
      opacity 120ms ease;
  }

  .shell-panel .canvas-actionbar {
    top: 12px;
    margin: 16px 16px -40px 0;
  }

  .canvas-actionbar:hover,
  .canvas-actionbar:focus-within {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 8px 24px rgba(7, 25, 22, 0.12);
    opacity: 1;
  }

  .canvas-icon-action {
    width: 30px;
    min-width: 30px;
    min-height: 36px;
    border-radius: 999px;
    padding: 0;
  }

  .document-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 16px;
    width: min(100%, 920px);
    justify-self: center;
    margin-top: 12px;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 16px 24px 4px;
    box-shadow: none;
  }

  .shell-panel .document-hero {
    margin-top: 0;
    padding: 24px 16px 8px;
  }

  .document-context {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .document-context span {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    border: 1px solid var(--lq-color-primary-border);
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    padding: 4px 8px;
  }

  .authoring-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 16px;
  }

  .document-main {
    display: grid;
    width: min(100%, 920px);
    justify-self: center;
    min-width: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: var(--lq-color-page);
    box-shadow: none;
  }

  .insert-bar {
    display: grid;
    gap: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    background: var(--lq-color-page);
    padding: 12px 16px 16px;
  }

  .composer-line {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .composer-plus {
    display: inline-grid;
    width: 20px;
    height: 40px;
    place-items: center;
    color: var(--lq-color-subtle);
  }

  .slash {
    position: relative;
  }

  .slash input {
    width: 100%;
    min-height: 40px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: 14px;
    padding: 8px 8px;
  }

  .slash input:hover,
  .slash input:focus {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .slash input::placeholder,
  .block-input::placeholder {
    color: var(--lq-color-subtle);
  }

  .menu {
    position: absolute;
    z-index: 30;
    gap: 4px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-page);
    box-shadow: var(--lq-shadow-popover);
  }

  .menu,
  .inline-command-menu,
  .step-command-menu,
  .ui-select-content,
  .ui-popover-content {
    --lq-color-ink: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
    --lq-color-ink-soft: #334155;
    --lq-color-muted: ${AUTHORING_CONTEXT_SURFACE_TOKENS.muted};
    --lq-color-subtle: #8b95a5;
    --lq-color-page: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
    --lq-color-panel: ${AUTHORING_CONTEXT_SURFACE_TOKENS.elevated};
    --lq-color-panel-strong: ${AUTHORING_CONTEXT_SURFACE_TOKENS.elevated};
    --lq-color-border: ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
    --lq-color-border-soft: ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
    --lq-color-primary: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    --lq-color-primary-hover: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentHover};
    --lq-color-primary-soft: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
    --lq-color-primary-border: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    --lq-color-blue: ${AUTHORING_CONTEXT_SURFACE_TOKENS.focus};
    --lq-color-blue-soft: #eef4ff;
    --lq-color-blue-border: ${AUTHORING_CONTEXT_SURFACE_TOKENS.focus};
    --lq-shadow-popover: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
    color: var(--lq-color-ink);
    color-scheme: light;
  }

  .menu {
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    width: min(460px, calc(100vw - 44px));
    padding: 8px;
  }

  .menu[hidden] {
    display: none;
  }

  .command-menu-header {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    padding: 4px 4px 8px;
    text-transform: none;
  }

  .command-menu kbd {
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-muted);
    font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 4px 4px;
    text-transform: none;
  }

  .command-item {
    justify-content: stretch;
    width: 100%;
    min-height: 44px;
    border-color: transparent;
    background: transparent;
    padding: 8px;
    text-align: left;
    white-space: normal;
  }

  .command-item:hover,
  .command-item.active,
  .command-item[aria-selected="true"] {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
  }

  .command-item-primary {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
  }

  .command-item .ui-button-label {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    width: 100%;
    align-items: center;
    gap: 8px;
  }

  .command-icon {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .command-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .command-copy strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-copy small,
  .command-description {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-description {
    justify-self: end;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-panel);
    padding: 4px 8px;
  }

  .command-empty {
    color: var(--lq-color-muted);
    font-size: 12px;
    padding: 12px 8px;
  }

  .quick-insert {
    display: inline-flex;
    gap: 8px;
    justify-self: end;
    opacity: 0.72;
    transition: opacity 120ms ease;
  }

  .insert-bar:hover .quick-insert,
  .insert-bar:focus-within .quick-insert {
    opacity: 1;
  }

  .quick-insert .ui-button {
    min-height: 36px;
    padding: 8px 12px;
  }

  .add-step {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-page);
  }

  .document {
    display: grid;
    gap: 12px;
    padding: 12px 0 16px;
    margin-bottom: 0;
  }

  .document-block-group {
    display: grid;
    min-width: 0;
  }

  .document-block-group:has(.inline-insert.open),
  .step-child:has(.inline-insert.open),
  .step-document:has(.step-command-menu:not([hidden])) {
    position: relative;
    z-index: 96;
  }

  .inline-insert {
    position: relative;
    z-index: 5;
    display: grid;
    min-height: 12px;
    place-items: center;
    margin: -4px 24px;
    opacity: 0;
    pointer-events: auto;
    transition: opacity 120ms ease;
  }

  .inline-insert.open {
    z-index: 240;
    opacity: 1;
  }

  .inline-insert.drop-active {
    opacity: 1;
  }

  .document-block-group:last-child > .inline-insert {
    min-height: 36px;
    margin-bottom: 4px;
  }

  .inline-insert.compact {
    min-height: 12px;
    margin: -4px 0;
  }

  .inline-insert:hover,
  .inline-insert:focus-within,
  .step-child:hover > .inline-insert {
    opacity: 1;
  }

  .inline-insert::before {
    position: absolute;
    right: 0;
    left: 0;
    height: 1px;
    background: transparent;
    content: "";
    transition: background 120ms ease;
  }

  .inline-insert.compact::before {
    background: transparent;
  }

  .inline-insert.open::before,
  .inline-insert.drop-active::before,
  .inline-insert:hover::before,
  .inline-insert:focus-within::before,
  .step-child:hover > .inline-insert::before {
    background: var(--lq-color-border-soft);
  }

  .inline-insert.drop-active::before {
    height: 2px;
    background: var(--lq-color-primary);
  }

  .inline-insert-trigger {
    position: relative;
    z-index: 1;
    display: inline-grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    cursor: pointer;
    padding: 0;
    box-shadow: none;
  }

  .inline-insert.compact .inline-insert-trigger {
    position: relative;
    top: auto;
    width: 18px;
    height: 16px;
  }

  .inline-insert-trigger:hover,
  .inline-insert-trigger[aria-expanded="true"],
  .inline-insert.drop-active .inline-insert-trigger {
    border-color: var(--lq-color-primary-border);
    color: var(--lq-color-primary);
  }

`;
