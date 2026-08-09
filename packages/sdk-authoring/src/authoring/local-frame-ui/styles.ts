import { CREATOR_CHROME_FONT_STACK, CREATOR_CHROME_TOKENS } from '../../creator-chrome-tokens';

export const LOCAL_AUTHORING_FRAME_CSS = `
  :root {
    --lq-color-ink: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-ink-soft: #c6cbd3;
    --lq-color-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-subtle: #7a828d;
    --lq-color-page: ${CREATOR_CHROME_TOKENS.canvas};
    --lq-color-panel: ${CREATOR_CHROME_TOKENS.surface};
    --lq-color-panel-strong: #26292f;
    --lq-color-border: ${CREATOR_CHROME_TOKENS.border};
    --lq-color-border-soft: #26292f;
    --lq-color-chrome: #101216;
    --lq-color-chrome-text: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-chrome-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-primary: ${CREATOR_CHROME_TOKENS.action};
    --lq-color-primary-hover: ${CREATOR_CHROME_TOKENS.actionHover};
    --lq-color-on-primary: ${CREATOR_CHROME_TOKENS.onAction};
    --lq-color-primary-soft: rgba(61, 232, 176, 0.1);
    --lq-color-primary-border: rgba(61, 232, 176, 0.32);
    --lq-color-blue: ${CREATOR_CHROME_TOKENS.focus};
    --lq-color-blue-soft: rgba(61, 232, 176, 0.1);
    --lq-color-blue-border: rgba(61, 232, 176, 0.32);
    --lq-color-success: #34c98e;
    --lq-color-success-soft: rgba(52, 201, 142, 0.12);
    --lq-color-success-border: rgba(52, 201, 142, 0.34);
    --lq-color-warning: #f5b84d;
    --lq-color-warning-soft: rgba(245, 184, 77, 0.12);
    --lq-color-warning-border: rgba(245, 184, 77, 0.34);
    --lq-color-danger: #f26d6d;
    --lq-color-danger-soft: rgba(242, 109, 109, 0.12);
    --lq-color-danger-border: rgba(242, 109, 109, 0.34);
    --lq-radius-xs: 6px;
    --lq-radius-sm: 7px;
    --lq-radius-md: 8px;
    --lq-shadow-popover: 0 18px 44px rgba(0, 0, 0, 0.44);
    font-family: ${CREATOR_CHROME_FONT_STACK};
    color: var(--lq-color-ink);
    background: var(--lq-color-page);
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    background: var(--lq-color-page);
    overflow-x: clip;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button,
  input,
  textarea,
  select {
    max-width: 100%;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  .block:focus-visible,
  .ui-select-trigger:focus-visible,
  .ui-select-item:focus-visible,
  .ui-tabs-trigger:focus-visible {
    outline: 2px solid var(--lq-color-blue);
    outline-offset: 2px;
  }

  .document-title-input:focus-visible,
  .slash input:focus-visible,
  .step-composer-input:focus-visible,
  .block-input:focus-visible,
  .inline-command-search:focus-visible {
    outline: 0;
  }

  .shell {
    position: relative;
    min-height: 100vh;
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
    padding: 0 0 28px;
    background: var(--lq-color-page);
  }

  lodariq-tour {
    --lodariq-tour-z-index: 8;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid rgba(7, 25, 22, 0.85);
    background: linear-gradient(180deg, var(--lq-color-chrome), #101216);
    padding: 11px 24px;
    backdrop-filter: blur(16px);
  }

  .brand,
  .brand-copy,
  .canvas,
  .document-page,
  .document-title-input,
  .inspector,
  .slash,
  .panel,
  .block-title {
    min-width: 0;
  }

  .brand-copy {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
  }

  .topbar h1 {
    color: var(--lq-color-chrome-text);
  }

  .topbar .eyebrow {
    color: var(--lq-color-chrome-muted);
  }

  .eyebrow {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 780;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    color: var(--lq-color-ink);
    letter-spacing: 0;
  }

  h1 {
    font-size: 14px;
    line-height: 1.18;
  }

  h2 {
    font-size: 30px;
    font-weight: 760;
    line-height: 1.08;
  }

  .document-title-input {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: 30px;
    font-weight: 760;
    line-height: 1.08;
    padding: 3px 6px;
    transform: translateX(-6px);
    transition:
      background 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .document-title-input:hover,
  .document-title-input:focus {
    border-color: var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .document-title-input::placeholder {
    color: var(--lq-color-subtle);
  }

  p {
    margin: 0;
  }

  #status {
    max-width: 58ch;
    overflow-wrap: anywhere;
    color: var(--lq-color-chrome-muted);
    font-size: 12px;
    line-height: 1.35;
  }

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
    gap: 6px;
  }

  .ui-button {
    display: inline-flex;
    min-width: 0;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: 13px;
    font-weight: 650;
    line-height: 1.2;
    padding: 6px 10px;
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

  .ui-button-primary {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-page);
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

  .workspace {
    display: grid;
    gap: 0;
    min-width: 0;
    padding: 0 18px 24px;
    background: var(--lq-color-page);
  }

  .shell-panel .workspace {
    padding: 0 12px 22px;
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
    gap: 2px;
    margin: 12px 18px -50px 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    padding: 3px;
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
    margin: 14px 14px -46px 0;
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
    min-height: 30px;
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
    padding: 18px 20px 4px;
    box-shadow: none;
  }

  .shell-panel .document-hero {
    margin-top: 0;
    padding: 20px 18px 8px;
  }

  .document-context {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .document-context span {
    display: inline-flex;
    min-height: 22px;
    align-items: center;
    border: 1px solid var(--lq-color-primary-border);
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: 11px;
    font-weight: 720;
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
    padding: 12px 18px 16px;
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
    height: 38px;
    place-items: center;
    color: var(--lq-color-subtle);
  }

  .slash {
    position: relative;
  }

  .slash input {
    width: 100%;
    min-height: 38px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: 14px;
    padding: 7px 9px;
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
    gap: 5px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-page);
    box-shadow: var(--lq-shadow-popover);
  }

  .menu {
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    width: min(460px, calc(100vw - 44px));
    padding: 7px;
  }

  .menu[hidden] {
    display: none;
  }

  .command-menu-header {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 740;
    padding: 4px 5px 8px;
    text-transform: none;
  }

  .command-menu kbd {
    border: 1px solid var(--lq-color-border);
    border-radius: 5px;
    background: var(--lq-color-panel);
    color: var(--lq-color-muted);
    font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 3px 5px;
    text-transform: none;
  }

  .command-item {
    justify-content: stretch;
    width: 100%;
    min-height: 44px;
    border-color: transparent;
    background: transparent;
    padding: 7px;
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
    gap: 9px;
  }

  .command-icon {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 7px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .command-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .command-copy strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-copy small,
  .command-description {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-description {
    justify-self: end;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-panel);
    padding: 3px 8px;
  }

  .command-empty {
    color: var(--lq-color-muted);
    font-size: 13px;
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
    min-height: 32px;
    padding: 6px 10px;
  }

  .add-step {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-page);
  }

  .document {
    display: grid;
    gap: 10px;
    padding: 12px 0 14px;
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
    margin: -3px 20px;
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
    min-height: 28px;
    margin-bottom: 2px;
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
    height: 18px;
  }

  .inline-insert-trigger:hover,
  .inline-insert-trigger[aria-expanded="true"],
  .inline-insert.drop-active .inline-insert-trigger {
    border-color: var(--lq-color-primary-border);
    color: var(--lq-color-primary);
  }

  .inline-command-menu {
    position: absolute;
    top: calc(50% + 16px);
    left: 50%;
    z-index: 260;
    display: grid;
    width: min(360px, calc(100vw - 52px));
    max-height: min(360px, calc(100vh - 140px));
    transform: translateX(-50%);
    gap: 5px;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: var(--lq-color-page);
    overscroll-behavior: contain;
    overflow-y: auto;
    padding: 8px;
    box-shadow: var(--lq-shadow-popover);
  }

  .inline-insert.compact .inline-command-menu {
    top: calc(50% + 14px);
    bottom: auto;
  }

  .inline-command-menu[hidden] {
    display: none;
  }

  .inline-command {
    justify-content: flex-start;
    min-height: 44px;
    border-color: transparent;
    background: transparent;
    padding: 7px 8px;
    text-align: left;
    white-space: normal;
  }

  .inline-command .ui-button-label {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .inline-command-search {
    position: sticky;
    top: -8px;
    z-index: 1;
    width: 100%;
    min-height: 38px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: 13px;
    margin-bottom: 2px;
    padding: 8px 10px;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .inline-command-search::placeholder {
    color: var(--lq-color-subtle);
  }

  .inline-command-empty {
    color: var(--lq-color-muted);
    font-size: 13px;
    padding: 9px;
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
    font-size: 13px;
  }

  .inline-command-copy small {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 560;
  }

  .block {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    border-top: 1px solid transparent;
    background: transparent;
    padding: 5px 14px 5px 0;
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
    border-radius: 10px;
    background: var(--lq-color-panel);
    padding: 14px 18px 16px 36px;
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
    border-radius: 10px;
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
    gap: 5px;
    min-height: 24px;
    opacity: 1;
  }

  .block-grip {
    display: inline-grid;
    width: 18px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 6px;
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
    gap: 6px;
  }

  .block-anchor-slot {
    display: inline-flex;
    flex: 0 1 auto;
    min-width: 0;
    align-items: center;
    gap: 5px;
    justify-content: flex-start;
  }

  .block-kicker {
    display: inline-flex;
    min-height: 22px;
    align-items: center;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    font-size: 11px;
    font-weight: 760;
    line-height: 1;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .block[data-block-type="tourStep"] .block-kicker {
    min-height: 18px;
    border-color: transparent;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 780;
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
    font-weight: 680;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .block-header-actions {
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
    align-items: center;
    gap: 2px;
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
    padding: 2px;
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
    min-height: 26px;
    border-color: transparent;
    border-radius: 7px;
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
    min-height: 26px;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
  }

  .block-action-trigger:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
  }

  .block-action-popover {
    width: 220px;
    padding: 6px;
  }

  .block-action-menu {
    display: grid;
    gap: 3px;
  }

  .block-action-menu-header {
    display: grid;
    gap: 1px;
    padding: 5px 6px 7px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    margin-bottom: 3px;
  }

  .block-action-menu-header span {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 720;
  }

  .block-action-menu-header strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 760;
  }

  .block-action-menu-item {
    justify-content: flex-start;
    width: 100%;
    min-height: 36px;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    padding: 7px 8px;
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
    font-weight: 680;
  }

  .block-body,
  .step-document {
    display: grid;
    gap: 2px;
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
    gap: 6px;
    margin: 5px 0 0;
    padding: 0;
  }

  .step-composer-plus {
    display: inline-grid;
    width: 18px;
    height: 34px;
    place-items: center;
    border: 0;
    border-radius: 5px;
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
    gap: 5px;
    min-width: 0;
    overflow: visible;
  }

  .step-composer-input {
    width: 100%;
    min-height: 34px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: 14px;
    padding: 6px 8px 6px 2px;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    opacity: 0;
    padding: 0 0 2px;
    pointer-events: none;
    transform: translateY(-2px);
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .step-composer:hover .step-quick-insert,
  .step-composer:focus-within .step-quick-insert {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .step-quick-insert-button {
    width: 28px;
    min-width: 28px;
    min-height: 26px;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: 12px;
    font-weight: 700;
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
    gap: 2px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-page);
    padding: 5px;
    box-shadow: var(--lq-shadow-popover);
  }

  .step-command-menu[hidden] {
    display: none;
  }

  .step-command-menu .command-menu-header {
    font-size: 10px;
    padding: 3px 4px 6px;
  }

  .step-command-menu .command-menu-header kbd {
    font-size: 9px;
    padding: 2px 4px;
  }

  .step-command-menu .command-item .ui-button-label {
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    overflow: hidden;
  }

  .step-command-menu .command-item {
    min-height: 34px;
    align-items: center;
    border-radius: 6px;
    padding: 4px;
  }

  .step-command-menu .command-icon {
    width: 22px;
    height: 22px;
    border-radius: 5px;
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
    font-size: 12px;
  }

  .step-command-menu .command-copy small {
    font-size: 10px;
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
    column-gap: 2px;
    row-gap: 0;
    border: 1px solid transparent;
    border-radius: 4px;
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
    height: 26px;
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
    padding-right: 92px;
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
    min-height: 18px;
  }

  .step-child-heading {
    margin-bottom: 4px;
  }

  .step-child-paragraph,
  .step-child-list,
  .step-child-link,
  .step-child-divider {
    margin-bottom: 2px;
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
    padding: 2px;
    pointer-events: auto;
  }

  .step-child-inline-actions {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 1px;
  }

  .step-child-drag-handle {
    display: inline-grid;
    width: 20px;
    min-width: 20px;
    height: 20px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 6px;
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
    min-height: 22px;
    border-color: transparent;
    border-radius: 6px;
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
    padding: 6px;
  }

  .step-child-menu {
    display: grid;
    gap: 4px;
  }

  .step-child-menu-header {
    display: grid;
    gap: 1px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    margin-bottom: 2px;
    padding: 5px 6px 7px;
  }

  .step-child-menu-header span,
  .step-child-menu-label {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 720;
    line-height: 1.2;
  }

  .step-child-menu-header strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 760;
    line-height: 1.25;
  }

  .step-child-menu-section {
    display: grid;
    gap: 2px;
  }

  .step-child-menu-transform {
    border-top: 1px solid var(--lq-color-border-soft);
    margin-top: 2px;
    padding-top: 6px;
  }

  .step-child-menu-label {
    padding: 2px 7px 4px;
  }

  .step-child-menu-item {
    justify-content: flex-start;
    width: 100%;
    min-height: 34px;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    padding: 7px 8px;
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
    gap: 6px;
    padding: 4px 0;
  }

  .block-section-content {
    padding-top: 2px;
  }

  .block-footer {
    margin-left: 0;
  }

  .content-field {
    position: relative;
    display: grid;
    gap: 2px;
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
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-ink);
    font-family: inherit;
    font-size: 15px;
    line-height: 1.4;
    padding: 2px 6px;
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
    font-weight: 740;
    line-height: 1.22;
  }

  textarea.block-input {
    field-sizing: content;
    min-height: 26px;
    overflow: hidden;
    resize: none;
  }

  textarea.block-input[aria-label="Heading"] {
    min-height: 30px;
  }

  .block-input-button,
  .block-input[aria-label="Button label"] {
    width: 100%;
    min-height: 34px;
    border: 1px solid rgba(7, 25, 22, 0.08);
    border-radius: 7px;
    background: var(--lq-color-primary);
    color: var(--lq-color-page);
    box-shadow: 0 2px 8px rgba(23, 79, 85, 0.1);
    font-size: 14px;
    font-weight: 740;
    padding: 7px 12px;
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
    min-height: 26px;
    color: var(--lq-color-primary);
    font-size: 14px;
    font-weight: 720;
    padding: 2px 6px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .divider-field {
    min-height: 12px;
    justify-content: center;
    padding: 3px 6px 2px;
  }

  .divider-preview {
    width: 100%;
    height: 1px;
    background: var(--lq-color-border);
  }

  .media-field {
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    padding: 4px 6px;
  }

  .media-field:hover,
  .media-field:focus-within {
    border-color: var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.05);
  }

  .media-placeholder-icon {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 6px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .media-field .block-input {
    min-height: 32px;
    padding: 4px 2px;
  }

  .media-placeholder-state {
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 680;
    padding: 0;
    white-space: nowrap;
  }

  .button-field-shell {
    display: flex;
    flex-direction: column;
    width: min(100%, 320px);
    min-width: 0;
    align-items: stretch;
    gap: 2px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    padding: 0;
  }

  .button-field-shell.incomplete {
    background: transparent;
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
    min-height: 26px;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    padding: 2px 7px;
  }

  .cta-panel {
    display: flex;
    align-items: center;
    justify-self: start;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    gap: 2px 6px;
    border: 0;
    border-radius: 7px;
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
    height: 30px;
    place-items: center;
    color: var(--lq-color-subtle);
  }

  .cta-panel-label {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--lq-color-subtle);
    font-size: 11px;
    font-weight: 680;
    line-height: 1;
  }

  .cta-panel .ui-select-trigger {
    width: auto;
    min-width: 132px;
    min-height: 26px;
    flex: 0 0 auto;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 680;
    padding: 2px 6px;
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
    min-height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: 13px;
    padding: 6px 9px 6px 10px;
    text-align: left;
  }

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
    min-height: 32px;
    align-items: center;
    border-radius: var(--lq-radius-xs);
    color: var(--lq-color-ink);
    cursor: default;
    font-size: 13px;
    line-height: 1.2;
    padding: 6px 28px 6px 9px;
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
    padding: 3px 8px;
    font-size: 12px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    border: 1px solid var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
    font-weight: 740;
    text-transform: none;
  }

  .block-title .badge {
    min-height: 22px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 760;
    padding: 3px 7px;
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
    min-height: 26px;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 760;
    padding: 4px 7px;
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
    /* Unverified/unknown reads as attention, not the mint "acting on" accent. */
    --target-accent: var(--lq-color-warning);
    display: inline-flex;
    min-width: 0;
    max-width: min(300px, 100%);
    min-height: 28px;
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
    gap: 5px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font-weight: 720;
    padding: 3px 5px 3px 7px;
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
    font-size: 9px;
    font-weight: 780;
    line-height: 1.2;
    padding: 2px 5px;
  }

  .target-chip-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-left: 0;
    color: var(--target-accent);
    font-size: 11px;
    font-weight: 760;
    padding-left: 2px;
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
    min-height: 28px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0 3px 0 0;
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
    gap: 2px;
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
    gap: 6px;
    max-height: min(528px, calc(var(--radix-popover-content-available-height, 540px) - 12px));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px;
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
    gap: 2px 8px;
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    padding: 4px 4px 7px;
  }

  .target-menu-eyebrow {
    grid-column: 1 / -1;
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 760;
    text-transform: none;
  }

  .target-menu-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 13px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-menu-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    align-self: center;
    color: var(--lq-color-blue);
    font-size: 11px;
    font-weight: 780;
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
    min-height: 28px;
    justify-content: center;
    font-size: 12px;
    padding: 5px 6px;
  }

  .target-menu-panel {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .ui-popover-content {
    z-index: 2147483000;
    gap: 6px;
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

  .ui-popover-arrow {
    fill: var(--lq-color-page);
    stroke: var(--lq-color-border);
    stroke-width: 1px;
  }

  .target-menu-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .target-menu-action {
    align-items: center;
    justify-content: center;
    min-width: 0;
    width: 100%;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    min-height: 44px;
    padding: 8px;
    text-align: center;
    white-space: nowrap;
  }

  .target-menu-action:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    box-shadow: none;
  }

  .target-menu-action-featured {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
  }

  .target-menu-action-exact {
    grid-column: 1 / -1;
  }

  .target-menu-action .ui-button-icon {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .target-menu-action-featured .ui-button-icon {
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-menu-action .ui-button-label {
    display: inline-flex;
    min-width: 0;
    align-items: center;
  }

  .target-menu-secondary-actions {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .target-menu-disclosure {
    min-width: 0;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 2px;
  }

  .target-menu-disclosure > summary,
  .target-matching-details > summary {
    display: flex;
    min-height: 40px;
    align-items: center;
    gap: 7px;
    border-radius: 7px;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: 11px;
    font-weight: 720;
    list-style: none;
    padding: 7px 8px;
  }

  .target-menu-disclosure > summary::-webkit-details-marker,
  .target-matching-details > summary::-webkit-details-marker {
    display: none;
  }

  .target-menu-disclosure > summary:hover,
  .target-menu-disclosure > summary:focus-visible,
  .target-matching-details > summary:hover,
  .target-matching-details > summary:focus-visible {
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    outline: none;
  }

  .target-menu-disclosure[open] > summary {
    margin-bottom: 6px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .target-menu-disclosure-content,
  .target-troubleshoot {
    display: grid;
    min-width: 0;
    gap: 8px;
  }

  .target-secondary-action {
    min-height: 30px;
    min-width: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    padding: 5px 7px;
  }

  .target-secondary-action:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
  }

  .target-secondary-action-danger {
    color: var(--lq-color-danger);
  }

  .target-secondary-action-danger:hover {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
  }

  .target-health,
  .target-lifecycle,
  .target-advanced {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--lq-color-muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .target-health {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px 9px;
  }

  .target-health.found {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .target-health.missing,
  .target-health.ambiguous,
  .target-health.needs_review {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .target-health strong {
    display: block;
    margin-bottom: 2px;
    color: var(--lq-color-ink);
  }

  .target-lifecycle {
    display: grid;
    gap: 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px 9px;
  }

  .target-lifecycle-header {
    display: grid;
    gap: 1px;
  }

  .target-lifecycle-header strong {
    color: var(--lq-color-ink);
    font-size: 12px;
  }

  .target-lifecycle-header span {
    color: var(--lq-color-muted);
    font-size: 11px;
  }

  .target-lifecycle-field {
    display: grid;
    gap: 4px;
  }

  .target-lifecycle-control-group {
    display: grid;
    gap: 5px;
  }

  .target-lifecycle-field > span,
  .target-lifecycle-control-group > span {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 740;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .target-lifecycle-field input,
  .target-lifecycle-field .ui-select-trigger {
    width: 100%;
    min-height: 30px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: 12px;
  }

  .target-lifecycle-field input {
    padding: 6px 8px;
  }

  .target-lifecycle-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .target-lifecycle-action {
    min-width: 0;
    justify-content: center;
    min-height: 40px;
    padding: 7px;
  }

  .target-lifecycle-action.selected {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-advanced {
    display: grid;
    gap: 6px;
    padding: 0 8px 8px;
  }

  .target-advanced strong {
    color: var(--lq-color-ink);
    font-size: 12px;
  }

  .target-advanced span {
    color: var(--lq-color-muted);
  }

  .target-advanced dl {
    display: grid;
    gap: 4px;
    margin: 0;
  }

  .target-advanced dl div {
    display: grid;
    grid-template-columns: minmax(72px, 0.42fr) minmax(0, 1fr);
    gap: 8px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 5px;
  }

  .target-advanced dt,
  .target-advanced dd {
    margin: 0;
    min-width: 0;
  }

  .target-advanced dt {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .target-advanced dd {
    color: var(--lq-color-ink);
    font-weight: 650;
  }

  .target-matching-details {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
  }

  .target-matching-details[open] > summary {
    color: var(--lq-color-ink);
  }

  .target-troubleshoot .target-menu-secondary-actions {
    justify-content: flex-end;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 4px;
  }

  .property-chip {
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
  }

  .block-footer {
    display: none;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0 0;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .block:hover .block-footer,
  .block:focus-within .block-footer {
    display: flex;
    opacity: 1;
  }

  .block-tools .ui-select-trigger {
    width: 146px;
    min-height: 28px;
    background: transparent;
  }

  .block-tools .ui-button {
    min-height: 28px;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 4px 7px;
  }

  .block-tools .ui-button:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .block-meta {
    gap: 5px;
  }

  .preview-copy {
    display: grid;
    gap: 2px;
  }

  .preview-workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    border: 1px solid var(--lq-color-panel-strong);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 10px;
    box-shadow: 0 1px 2px rgba(9, 76, 68, 0.05);
  }

  .preview-actions {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(112px, 1fr));
    gap: 8px;
  }

  .preview-actions .ui-button {
    width: 100%;
  }

  .preview-workbench .ui-button:not(.ui-button-primary) {
    border-color: var(--lq-color-border);
    background: var(--lq-color-page);
    color: var(--lq-color-ink-soft);
  }

  .preview-workbench .ui-button:not(.ui-button-primary):hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .preview-copy strong,
  summary {
    color: var(--lq-color-ink);
    font-size: 14px;
    font-weight: 740;
  }

  .preview-copy span {
    color: var(--lq-color-muted);
    font-size: 12px;
  }

  .preview-workbench .preview-copy strong {
    color: var(--lq-color-ink);
  }

  .preview-workbench .preview-copy span {
    color: var(--lq-color-muted);
  }

  .issue-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    border: 1px solid var(--lq-color-warning-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-warning-soft);
    padding: 12px;
  }

  .issue-panel p,
  .issue-panel li {
    color: var(--lq-color-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .issue-panel ul {
    display: grid;
    gap: 5px;
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  .issue-panel li {
    display: grid;
    gap: 1px;
  }

  .issue-panel li strong {
    color: var(--lq-color-ink);
    font-size: 12px;
  }

  .issue-panel li span {
    color: var(--lq-color-muted);
  }

  .compiled-output {
    grid-column: 1 / -1;
  }

  .inspector {
    display: grid;
    gap: 0;
    align-content: start;
    min-width: 0;
    border-top: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-page);
  }

  .document-review {
    background: transparent;
    padding: 0;
  }

  .review-drawer {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: var(--lq-color-panel);
    box-shadow: 0 1px 2px rgba(9, 76, 68, 0.05);
  }

  .review-drawer > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    align-items: center;
    gap: 12px;
    list-style: none;
    min-height: 56px;
    background: var(--lq-color-panel);
    cursor: pointer;
    padding: 10px 14px;
    transition: background-color 120ms ease, border-color 120ms ease;
  }

  .review-drawer > summary:hover {
    background: var(--lq-color-primary-soft);
  }

  .review-drawer > summary:focus-visible {
    outline: 2px solid var(--lq-color-primary);
    outline-offset: -3px;
  }

  .review-drawer > summary::-webkit-details-marker {
    display: none;
  }

  .review-summary-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .review-summary-copy strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 14px;
    font-weight: 780;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-summary-copy span {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    font-weight: 620;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-summary-end {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .review-summary-chevron {
    flex: 0 0 auto;
    color: var(--lq-color-muted);
    transition: transform 140ms ease;
  }

  .review-drawer[open] .review-summary-chevron {
    transform: rotate(180deg);
  }

  .review-status {
    min-width: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    font-size: 12px;
    font-weight: 760;
    line-height: 1;
    padding: 5px 9px;
    white-space: nowrap;
  }

  .review-status.ready {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .review-status.needs-work {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .review-panel {
    display: grid;
    min-width: 0;
    gap: 10px;
    border-top: 1px solid var(--lq-color-border-soft);
    background: #f8faf9;
    padding: 12px;
  }

  .utilities-drawer {
    min-width: 0;
    border: 0;
    border-top: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    padding: 4px 0 0;
    box-shadow: none;
  }

  .utilities-drawer > summary {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    list-style: none;
    border-radius: 7px;
    padding: 7px 8px;
  }

  .utilities-drawer > summary::-webkit-details-marker {
    display: none;
  }

  .utilities-drawer > summary span {
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 720;
  }

  .utilities-drawer > summary small {
    overflow: hidden;
    color: var(--lq-color-subtle);
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .utilities-drawer .ui-tabs {
    margin-top: 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.23);
  }

  .utilities-drawer .ui-tabs-list {
    width: 100%;
  }

  .utilities-drawer .ui-tabs-trigger {
    flex: 1 1 0;
    min-width: 0;
  }

  summary {
    cursor: pointer;
  }

  .panel-actions {
    margin-top: 8px;
  }

  .utility-panel {
    display: grid;
    gap: 10px;
    min-width: 0;
  }

  .preview-utility {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
  }

  textarea[data-action="edit-draft-backup"] {
    width: 100%;
    min-height: 190px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.45;
    padding: 10px;
    resize: vertical;
  }

  pre {
    max-height: 190px;
    overflow: auto;
    margin: 8px 0 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.45;
    padding: 10px;
  }

  .ui-tabs {
    display: grid;
    gap: 8px;
  }

  .ui-tabs-content[data-state="inactive"] {
    display: none;
  }

  .ui-tabs-list {
    display: inline-flex;
    min-width: 0;
    gap: 4px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 3px;
  }

  .ui-tabs-trigger {
    min-height: 30px;
    border: 0;
    border-radius: var(--lq-radius-xs);
    background: transparent;
    color: var(--lq-color-muted);
    padding: 5px 9px;
  }

  .ui-tabs-trigger[data-state="active"] {
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  }

  .ui-tabs-content {
    min-width: 0;
  }

  @media (min-width: 920px) {
    .shell {
      padding: 0 0 32px;
    }

    .topbar {
      padding: 10px 44px;
    }
  }

  @media (max-width: 1100px) {
    .authoring-workspace {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 680px) {
    .topbar {
      padding-left: 18px;
      padding-right: 18px;
    }

    .workspace {
      padding-right: 12px;
      padding-left: 12px;
    }

    h2,
    .document-title-input {
      font-size: 28px;
    }

    .document-hero {
      grid-template-columns: 1fr;
      margin-top: 12px;
      padding-left: 18px;
      padding-right: 18px;
    }

    .authoring-workspace {
      grid-template-columns: 1fr;
    }

    .insert-bar,
    .block {
      padding-left: 12px;
      padding-right: 12px;
    }

    .block {
      grid-template-columns: minmax(0, 1fr);
    }

    .block::before {
      left: -2px;
    }

    .block-side-rail {
      left: -6px;
    }

    .block[data-block-type="tourStep"] {
      padding-left: 34px;
    }

    .block[data-block-type="tourStep"]::before {
      left: 7px;
    }

    .block[data-block-type="tourStep"] .block-side-rail {
      left: 10px;
    }

    .block-header {
      flex-wrap: wrap;
    }

    .block-anchor-slot {
      flex-basis: 100%;
      order: 3;
    }

    .block-title strong {
      white-space: normal;
    }

    .step-child {
      position: relative;
      grid-template-columns: 15px minmax(0, 1fr);
      column-gap: 2px;
    }

    .step-child > .content-field,
    .step-child > .button-field-shell {
      grid-column: 2;
      grid-row: 1;
    }

    .step-child-toolbar {
      position: absolute;
      top: 4px;
      right: 2px;
      left: -18px;
      width: auto;
      justify-content: flex-start;
    }

    .block-section,
    .block-footer {
      margin-left: 0;
    }

    .block-section {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .quick-insert {
      padding-left: 0;
    }

    .preview-workbench,
    .preview-utility,
    .issue-panel {
      grid-template-columns: 1fr;
    }

    .inline-insert {
      margin-right: 18px;
      margin-left: 18px;
    }

    .media-field {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .media-placeholder-state {
      grid-column: 2;
      justify-self: start;
    }

    .button-field-shell {
      width: min(100%, 340px);
    }

    .command-item .ui-button-label {
      grid-template-columns: 28px minmax(0, 1fr);
    }

    .command-description {
      grid-column: 2;
      justify-self: start;
    }

    .actions {
      width: 100%;
    }
  }

  @media (max-width: 480px) {
    .review-drawer > summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    .review-status {
      justify-self: start;
    }

    .preview-actions {
      grid-template-columns: 1fr;
    }

    .composer-line {
      grid-template-columns: 20px minmax(0, 1fr);
    }

    .quick-insert {
      grid-column: 2;
      justify-self: start;
    }

    .cta-panel {
      width: 100%;
      max-width: 100%;
      border: 0;
      background: transparent;
      padding: 0;
    }

    .cta-panel-icon,
    .cta-panel-label {
      display: none;
    }

    .cta-panel .ui-select-trigger {
      width: 100%;
    }

  }

  /* Live-product tour workspace — concept 02 / PRD §7.3. */
  .workspace,
  .shell-panel .workspace {
    padding: 0;
    background: var(--lq-color-panel);
  }

  .document-page {
    display: block;
    width: 100%;
    max-width: none;
  }

  .authoring-workspace {
    display: grid;
    grid-template-columns: 356px minmax(0, 1fr);
    min-height: calc(100vh - 47px);
    gap: 0;
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail {
    position: sticky;
    top: 47px;
    z-index: 12;
    display: flex;
    height: calc(100vh - 47px);
    min-width: 0;
    flex-direction: column;
    align-self: start;
    border-right: 1px solid var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .tour-sequence-header.document-hero {
    display: flex;
    width: auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 20px 20px 16px;
  }

  .tour-sequence-title {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 5px;
  }

  .tour-sequence-kicker.document-context {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 760;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .tour-sequence-header .document-title-input {
    width: 100%;
    border-radius: 6px;
    font-size: 18px;
    font-weight: 720;
    line-height: 1.3;
    padding: 2px 4px;
    transform: translateX(-4px);
  }

  .tour-health-count {
    flex: 0 0 auto;
    margin-top: 18px;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 680;
    white-space: nowrap;
  }

  .tour-step-list {
    display: grid;
    align-content: start;
    gap: 7px;
    margin: 0;
    padding: 14px 14px 8px;
    list-style: none;
    overflow-y: auto;
  }

  .tour-step-row {
    display: grid;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
  }

  .tour-step-row-main {
    display: grid;
    min-width: 0;
    grid-template-columns: 26px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 2px;
  }

  .tour-step-drag-handle {
    display: inline-grid;
    width: 26px;
    height: 34px;
    place-items: center;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: grab;
    padding: 0;
    touch-action: none;
  }

  .tour-step-drag-handle:hover,
  .tour-step-drag-handle:focus-visible {
    background: rgba(36, 88, 199, 0.08);
    color: var(--lq-color-primary);
  }

  .tour-step-drag-handle:active {
    cursor: grabbing;
  }

  .tour-step-row.active {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-blue-soft);
    box-shadow: 0 0 0 1px rgba(63, 114, 223, 0.16);
  }

  .tour-step-row.repair:not(.active) {
    background: var(--lq-color-warning-soft);
  }

  .tour-step-select {
    display: grid;
    min-width: 0;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 10px 10px;
    text-align: left;
  }

  .tour-step-action-trigger.ui-button {
    width: 28px;
    min-width: 28px;
    min-height: 30px;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0;
  }

  .tour-step-action-trigger.ui-button:hover,
  .tour-step-action-trigger.ui-button[aria-expanded='true'] {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .tour-step-action-menu,
  .rich-step-block-action-menu {
    display: grid;
    min-width: 156px;
    gap: 3px;
    padding: 5px;
  }

  .tour-step-action-menu .ui-button,
  .rich-step-block-action-menu .ui-button {
    width: 100%;
    min-height: 32px;
    justify-content: flex-start;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-ink-soft);
  }

  .tour-step-action-menu .ui-button:hover,
  .rich-step-block-action-menu .ui-button:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-ink);
  }

  .tour-step-action-menu .ui-button.danger,
  .rich-step-block-action-menu .ui-button.danger {
    color: var(--lq-color-danger);
  }

  .tour-step-select:hover {
    background: rgba(36, 88, 199, 0.045);
  }

  .tour-step-number {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 760;
  }

  .tour-step-row.active .tour-step-number {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .tour-step-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .tour-step-copy strong,
  .tour-step-placement {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-copy strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 680;
  }

  .tour-step-placement {
    color: var(--lq-color-muted);
    font-size: 10px;
  }

  .tour-step-health {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 720;
    white-space: nowrap;
  }

  .tour-step-health.ready {
    color: var(--lq-color-success);
  }

  .tour-step-health.repair {
    color: var(--lq-color-warning);
  }

  .tour-add-step {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    align-self: flex-start;
    gap: 7px;
    margin: 4px 20px 16px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    padding: 7px 9px;
  }

  .tour-add-step:hover {
    background: var(--lq-color-primary-soft);
  }

  .tour-active-step-footer {
    display: grid;
    gap: 12px;
    margin: auto 14px 14px;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: var(--lq-color-panel);
    padding: 12px;
  }

  .tour-active-step-footer.ready {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
  }

  .tour-active-step-footer.repair {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
  }

  .tour-active-target {
    display: grid;
    min-width: 0;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
  }

  .tour-active-target-icon {
    display: inline-grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .tour-active-target-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .tour-active-target small {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 720;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tour-active-target strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-active-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
  }

  .tour-active-actions button,
  .panel-advanced-back {
    min-height: 32px;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 6px 8px;
  }

  .tour-active-actions button:hover,
  .panel-advanced-back:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .document-main {
    width: 100%;
    max-width: none;
    min-height: calc(100vh - 47px);
    align-content: start;
    background: var(--lq-color-panel);
    padding: 54px clamp(20px, 4vw, 68px) 40px;
  }

  .document {
    width: min(100%, 680px);
    justify-self: center;
    padding: 0;
  }

  .document-block-group.inactive-step {
    display: none;
  }

  .document-block-group.active-step {
    display: grid;
  }

  .document-block-group.active-step > .block[data-block-type="tourStep"] {
    border: 1px solid var(--lq-color-border);
    border-radius: 11px;
    background: var(--lq-color-panel);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.27);
  }

  .document-block-group.active-step > .block[data-block-type="tourStep"].selected {
    border-color: var(--lq-color-primary-border);
    box-shadow:
      0 0 0 2px rgba(36, 88, 199, 0.12),
      0 14px 34px rgba(0, 0, 0, 0.28);
  }

  .insert-bar,
  .document-review {
    width: min(100%, 680px);
    justify-self: center;
  }

  .insert-bar {
    margin-top: 14px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 9px;
  }

  .canvas-actionbar {
    position: fixed;
    top: 62px;
    right: 18px;
    margin: 0;
  }

  .shell-panel {
    height: 100vh;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  .shell-panel .authoring-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100vh;
    min-height: 0;
    overflow: hidden;
  }

  .shell-panel .tour-sequence-rail {
    position: static;
    height: 100%;
    max-height: none;
    overflow-x: hidden;
    overflow-y: auto;
    border-right: 0;
    border-bottom: 0;
  }

  .shell-panel .tour-step-list {
    flex: 0 1 auto;
    min-height: 0;
  }

  .panel-advanced-editor {
    display: grid;
    width: 100%;
    height: 100vh;
    min-height: 0;
    min-width: 0;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--lq-color-panel);
  }

  .panel-advanced-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--lq-color-border);
    background: var(--lq-color-panel);
    padding: 12px;
  }

  .panel-advanced-header > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .panel-advanced-header small {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 720;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .panel-advanced-header strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-advanced-back {
    min-width: 54px;
  }

  .shell-panel .document-main {
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 18px 12px 28px;
    scrollbar-gutter: stable;
  }

  .shell-panel .panel-advanced-main {
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  .shell-panel .panel-advanced-main > .document,
  .shell-panel .panel-advanced-main > .insert-bar,
  .shell-panel .panel-advanced-main > .inspector,
  .shell-panel .panel-advanced-main .review-drawer,
  .shell-panel .panel-advanced-main .review-panel {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .shell-panel .canvas-actionbar {
    position: absolute;
    top: 14px;
    right: 12px;
    margin: 0;
  }

  .shell-panel .canvas-actionbar [data-action="save"],
  .shell-panel .canvas-actionbar [data-action="reset"] {
    display: none;
  }

  .shell-panel .tour-sequence-header.document-hero {
    padding-right: 96px;
  }

  .shell-panel .tour-health-count {
    display: none;
  }

  .shell-panel,
  .shell-panel .workspace,
  .shell-panel .document-page,
  .shell-panel .authoring-workspace,
  .shell-panel .tour-sequence-rail {
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail.compact .compact-header {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.04);
    padding: 0 14px;
  }

  .tour-sequence-rail.compact .compact-header > strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 760;
    letter-spacing: -0.01em;
  }

  .tour-sequence-rail.compact .compact-header > span {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 680;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-list {
    flex: 1 1 auto;
    min-height: 76px;
    max-height: none;
    overflow-y: auto;
    gap: 6px;
    padding: 12px 12px 7px;
  }

  .tour-sequence-rail.compact .tour-step-row {
    border-color: var(--lq-color-border-soft);
    border-radius: 11px;
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail.compact .tour-step-row.active,
  .tour-sequence-rail.compact .tour-step-row.expanded {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-panel-strong);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
  }

  .tour-sequence-rail.compact .tour-step-row.active .tour-step-number {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .tour-sequence-rail.compact .tour-step-row.repair:not(.active) {
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail.compact .tour-step-select {
    min-height: 40px;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 9px;
    padding: 8px 11px;
  }

  .tour-sequence-rail.compact .tour-step-number {
    width: 22px;
    height: 22px;
    border-color: var(--lq-color-border);
    font-size: 11px;
  }

  .tour-sequence-rail.compact .tour-step-copy {
    gap: 0;
  }

  .tour-sequence-rail.compact .tour-step-copy strong {
    font-size: 13px;
  }

  .tour-sequence-rail.compact .tour-step-placement {
    display: none;
  }

  .tour-sequence-rail.compact .tour-step-health {
    display: inline-flex;
    min-width: 18px;
    justify-content: flex-end;
    gap: 0;
    color: var(--lq-color-success);
    font-size: 0;
  }

  .tour-sequence-rail.compact .tour-step-health.repair,
  .tour-sequence-rail.compact .tour-step-health.review {
    color: var(--lq-color-warning);
  }

  .tour-step-health-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }

  .tour-step-accordion {
    display: grid;
    gap: 8px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding: 10px 11px 11px;
  }

  .tour-step-detail-row {
    display: grid;
    gap: 5px;
  }

  .tour-step-detail-label {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 720;
    letter-spacing: 0.02em;
  }

  .tour-step-detail-fact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .tour-step-detail-status {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    color: var(--lq-color-ink);
  }

  .tour-step-detail-status.ready {
    color: var(--lq-color-success);
  }

  .tour-step-detail-status.repair,
  .tour-step-detail-status.review {
    color: var(--lq-color-warning);
  }

  .tour-step-detail-status strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.3;
  }

  .tour-step-detail-change {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 0 10px;
  }

  .tour-step-detail-change:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-behavior-summary {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
  }

  .tour-step-edit-on-page {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 0 12px;
  }

  .tour-step-edit-on-page:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-contextual-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    margin: 4px 14px 14px;
  }

  .tour-contextual-actions .tour-add-step {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 10px;
  }

  .tour-contextual-actions .tour-add-step:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-sequence-rail.compact .tour-contextual-actions {
    grid-template-columns: minmax(0, 1fr);
    margin-top: auto;
  }

  .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    box-shadow: 0 8px 20px rgba(61, 232, 176, 0.18);
  }

  .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
    color: var(--lq-color-on-primary);
  }

  .tour-appearance-entry {
    display: grid;
    min-height: 58px;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    margin: 6px 14px 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 8px 10px;
    text-align: left;
  }

  .tour-appearance-entry:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-appearance-icon,
  .panel-mode-card-icon {
    display: inline-grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 9px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-primary);
  }

  .tour-appearance-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .tour-appearance-copy small,
  .panel-mode-card-heading small,
  .panel-mode-section-heading small {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.055em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .tour-appearance-copy strong {
    overflow: hidden;
    font-size: 11px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-appearance-copy > span {
    color: var(--lq-color-muted);
    font-size: 9px;
    line-height: 1.3;
  }

  .panel-mode-shell {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--lq-color-panel);
  }

  .panel-mode-header {
    display: grid;
    min-height: 64px;
    grid-template-columns: 44px minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.06);
    padding: 9px 14px 9px 10px;
  }

  .panel-mode-header > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .panel-mode-header small {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }

  .panel-mode-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 780;
    line-height: 1.35;
    outline: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-mode-header strong:focus-visible {
    border-radius: 4px;
    box-shadow: 0 0 0 2px var(--lq-color-blue);
  }

  .panel-mode-back {
    display: inline-grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
  }

  .panel-mode-back:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .panel-mode-body {
    display: grid;
    min-height: 0;
    align-content: start;
    gap: 12px;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 14px 14px 22px;
    scrollbar-gutter: stable;
  }

  .panel-feedback {
    border: 1px solid var(--lq-color-success-border);
    border-radius: 9px;
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
    font-size: 10px;
    font-weight: 680;
    line-height: 1.45;
    padding: 9px 10px;
  }

  .panel-feedback.error {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .panel-mode-card,
  .panel-mode-section,
  .panel-mode-disclosure {
    display: grid;
    gap: 11px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    padding: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.24);
  }

  .panel-mode-disclosure {
    padding: 0;
  }

  .panel-mode-disclosure > summary {
    display: grid;
    min-height: 58px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-radius: 11px;
    cursor: pointer;
    list-style: none;
    padding: 11px 12px;
  }

  .panel-mode-disclosure > summary::-webkit-details-marker {
    display: none;
  }

  .panel-mode-disclosure > summary:hover {
    background: var(--lq-color-primary-soft);
  }

  .panel-mode-disclosure > summary > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .panel-mode-disclosure > summary small {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .panel-mode-disclosure > summary strong {
    color: var(--lq-color-ink);
    font-size: 11px;
    line-height: 1.35;
  }

  .panel-mode-disclosure > summary span > span {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 9px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-mode-disclosure-chevron {
    color: var(--lq-color-muted);
    transition: transform 140ms ease;
  }

  .panel-mode-disclosure[open] .panel-mode-disclosure-chevron {
    transform: rotate(90deg);
  }

  .panel-mode-disclosure-body {
    display: grid;
    gap: 11px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding: 12px;
  }

  .panel-mode-card-heading {
    display: grid;
    min-width: 0;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .panel-mode-card-heading > span:nth-child(2),
  .panel-mode-section-heading > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .panel-mode-card-heading strong,
  .panel-mode-section-heading strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 11px;
    line-height: 1.35;
    text-overflow: ellipsis;
  }

  .panel-status-pill,
  .panel-confidence-pill {
    display: inline-flex;
    min-height: 22px;
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 780;
    line-height: 1;
    padding: 5px 7px;
    white-space: nowrap;
  }

  .panel-status-pill.approved,
  .panel-status-pill.passed,
  .panel-status-pill.current,
  .panel-confidence-pill.high {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .panel-status-pill.draft,
  .panel-status-pill.waiting-approval,
  .panel-status-pill.failed,
  .panel-confidence-pill.medium,
  .panel-confidence-pill.low {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .panel-status-pill.running {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .panel-source-line {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 5px 8px;
    color: var(--lq-color-primary);
    font-size: 9px;
    font-weight: 720;
    line-height: 1.4;
  }

  .panel-source-line > span + span::before {
    content: "·";
    margin-right: 8px;
    color: var(--lq-color-subtle);
  }

  .panel-mode-help,
  .panel-mode-inline-note {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.5;
  }

  .panel-mode-inline-note {
    padding: 0 2px;
  }

  .panel-mode-primary-actions,
  .panel-mode-sticky-actions {
    display: grid;
    gap: 8px;
  }

  .panel-mode-sticky-actions {
    position: sticky;
    bottom: -22px;
    z-index: 2;
    margin: 2px -14px -22px;
    border-top: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    padding: 11px 14px 14px;
    backdrop-filter: blur(12px);
  }

  .panel-mode-primary-button,
  .panel-mode-secondary-button {
    display: inline-flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 10px;
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    cursor: pointer;
    font-size: 11px;
    font-weight: 760;
    padding: 9px 12px;
    box-shadow: 0 8px 20px rgba(61, 232, 176, 0.18);
  }

  .panel-mode-secondary-button {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    box-shadow: none;
  }

  .panel-mode-primary-button:hover:not(:disabled) {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
  }

  .panel-mode-secondary-button:hover:not(:disabled) {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .panel-mode-primary-button:disabled,
  .panel-mode-secondary-button:disabled {
    cursor: not-allowed;
    opacity: 0.54;
  }

  .panel-mode-section-heading {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .panel-mode-text-button {
    min-height: 44px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 9px;
    font-weight: 760;
    padding: 6px 8px;
  }

  .panel-mode-text-button:hover {
    background: var(--lq-color-primary-soft);
  }

  .appearance-choice-group {
    display: grid;
    gap: 6px;
    margin: 0;
    border: 0;
    padding: 0;
  }

  .appearance-choice-group legend {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.3;
    padding: 0;
  }

  .appearance-choice-group > div {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    gap: 5px;
  }

  .appearance-choice-group button {
    min-height: 44px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 9px;
    font-weight: 700;
    padding: 6px;
  }

  .appearance-choice-group button:hover,
  .appearance-choice-group button.selected {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .brand-change-list {
    display: grid;
    gap: 7px;
  }

  .brand-change-row {
    display: grid;
    gap: 6px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 9px;
    background: var(--lq-color-page);
    padding: 9px;
  }

  .brand-change-label {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 760;
  }

  .brand-change-values {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }

  .brand-change-values > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .brand-change-values small,
  .brand-change-consequence {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.35;
  }

  .brand-change-values strong {
    overflow: hidden;
    font-size: 10px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-mode-callout,
  .exact-artifact-banner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    border: 1px solid var(--lq-color-primary-border);
    border-radius: 10px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    padding: 10px;
  }

  .panel-mode-callout p {
    color: var(--lq-color-ink-soft);
    font-size: 9px;
    line-height: 1.5;
  }

  .panel-empty-state {
    display: grid;
    justify-items: center;
    gap: 8px;
    border: 1px dashed var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    padding: 28px 18px;
    text-align: center;
  }

  .panel-empty-state strong {
    font-size: 12px;
  }

  .panel-empty-state p {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.5;
  }

  .panel-release-truth {
    overflow-wrap: anywhere;
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 720;
    line-height: 1.4;
    padding: 0 2px;
  }

  .panel-mode-card-icon.warning {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .panel-check-list,
  .promotion-change-list {
    display: grid;
    gap: 7px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .panel-check-list li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 7px;
    color: var(--lq-color-muted);
  }

  .panel-check-list li.passed {
    color: var(--lq-color-success);
  }

  .panel-check-list li.failed {
    color: var(--lq-color-danger);
  }

  .panel-check-list li.warning {
    color: var(--lq-color-warning);
  }

  .panel-check-list li > span {
    display: grid;
    gap: 1px;
  }

  .panel-check-list strong {
    color: var(--lq-color-ink);
    font-size: 10px;
    line-height: 1.35;
  }

  .panel-check-list small {
    color: var(--lq-color-muted);
    font-size: 9px;
    line-height: 1.4;
  }

  .artifact-inline-facts,
  .panel-fact-list {
    display: grid;
    gap: 0;
    margin: 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 9px;
  }

  .artifact-inline-facts > div,
  .panel-fact-list > div {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(90px, 0.7fr) minmax(0, 1fr);
    gap: 8px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 8px 9px;
  }

  .artifact-inline-facts > div:last-child,
  .panel-fact-list > div:last-child {
    border-bottom: 0;
  }

  .artifact-inline-facts dt,
  .panel-fact-list dt {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 720;
  }

  .artifact-inline-facts dd,
  .panel-fact-list dd {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--lq-color-ink);
    font-size: 9px;
    font-weight: 650;
    line-height: 1.35;
    margin: 0;
  }

  .exact-artifact-banner {
    align-items: center;
  }

  .exact-artifact-banner > span {
    display: grid;
    gap: 2px;
  }

  .exact-artifact-banner strong {
    color: var(--lq-color-ink);
    font-size: 11px;
  }

  .exact-artifact-banner small {
    color: var(--lq-color-muted);
    font-size: 9px;
    line-height: 1.35;
  }

  .promotion-change-list li {
    position: relative;
    color: var(--lq-color-ink-soft);
    font-size: 9px;
    line-height: 1.45;
    padding-left: 14px;
  }

  .promotion-change-list li::before {
    position: absolute;
    top: 0.52em;
    left: 2px;
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--lq-color-primary);
    content: "";
  }

  .tour-sequence-rail.compact .tour-release-strip {
    gap: 0;
    margin: 0 12px 12px;
    padding: 8px 10px;
  }

  .tour-sequence-rail.compact .tour-release-truth,
  .tour-sequence-rail.compact .tour-release-copy span {
    display: none;
  }

  .tour-sequence-rail.compact .tour-release-summary {
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .tour-sequence-rail.compact .tour-release-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }

  .tour-sequence-rail.compact .tour-release-copy strong {
    font-size: 12px;
  }

  .tour-release-strip {
    display: grid;
    flex: 0 0 auto;
    gap: 10px;
    margin: 0 14px 14px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    padding: 11px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.26);
  }

  .tour-release-strip.ready {
    border-color: var(--lq-color-border);
  }

  .tour-release-strip.success {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
  }

  .tour-release-strip.warning {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
  }

  .tour-release-strip.danger {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
  }

  .tour-release-strip.neutral {
    background: rgba(255, 255, 255, 0.04);
    box-shadow: none;
  }

  .tour-release-strip.busy {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
  }

  .tour-release-truth {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 720;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-release-summary {
    display: grid;
    min-width: 0;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: start;
    gap: 9px;
  }

  .tour-release-icon {
    display: inline-grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 9px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-primary);
  }

  .tour-release-strip.success .tour-release-icon {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-success);
  }

  .tour-release-strip.warning .tour-release-icon {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-warning);
  }

  .tour-release-strip.danger .tour-release-icon {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-danger);
  }

  .tour-release-strip.neutral .tour-release-icon {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-muted);
  }

  .tour-release-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .tour-release-copy small {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.06em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .tour-release-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 760;
    line-height: 1.35;
  }

  .tour-release-copy > span {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.4;
  }

  .tour-release-findings {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0 0 0 41px;
    list-style: none;
  }

  .tour-release-findings li {
    display: grid;
    min-width: 0;
    grid-template-columns: 6px minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.3;
  }

  .tour-release-findings li > span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--lq-color-warning);
  }

  .tour-release-findings li.blocker > span {
    background: var(--lq-color-danger);
  }

  .tour-release-action {
    display: inline-flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 10px;
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 760;
    padding: 9px 12px;
    box-shadow: 0 8px 20px rgba(61, 232, 176, 0.2);
  }

  .tour-release-action:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
  }

  .tour-release-spinner {
    animation: lq-release-spin 900ms linear infinite;
  }

  .panel-hybrid-workspace {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    background: var(--lq-color-panel);
  }

  .panel-advanced-workspace > .tour-sequence-rail,
  .tour-step-inspector {
    display: none;
  }

  .tour-step-inspector-header {
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 12px 16px;
  }

  .tour-step-inspector-header > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .tour-step-inspector-header small,
  .tour-step-open-details small {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.35;
  }

  .tour-step-inspector-header > span > small {
    font-size: 9px;
    font-weight: 760;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .tour-step-inspector-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 15px;
    font-weight: 720;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-inspector-header button {
    display: inline-flex;
    min-height: 36px;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    padding: 0 10px;
  }

  .tour-step-inspector-header button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-content-summary {
    display: grid;
    gap: 4px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 13px 16px 14px;
  }

  .tour-step-content-summary strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.4;
  }

  .tour-step-content-summary > span:last-child {
    display: -webkit-box;
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

  .tour-step-inspector-properties {
    display: grid;
  }

  .tour-step-inspector-row {
    display: grid;
    min-height: 58px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 10px 16px;
  }

  .tour-step-inspector-row > span:first-child {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-inspector-row small {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 720;
    letter-spacing: 0.02em;
    line-height: 1.25;
  }

  .tour-step-inspector-row > span > strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-inspector-row > button {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    padding: 0 10px;
  }

  .tour-step-inspector-row > button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-on-canvas-hint {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 650;
    white-space: nowrap;
  }

  .tour-step-open-details {
    display: grid;
    min-height: 48px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink);
    cursor: pointer;
    margin: 12px 16px;
    padding: 8px 11px;
    text-align: left;
  }

  .tour-step-open-details:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-step-open-details > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .tour-step-open-details strong {
    font-size: 12px;
    font-weight: 720;
  }

  .tour-step-accordion .tour-step-open-details.compact-details {
    min-height: 44px;
    margin: 0;
  }

  /* Reference-matched light authoring workspace. */
  .shell-panel {
    --lq-color-ink: #162033;
    --lq-color-ink-soft: #334155;
    --lq-color-muted: #667085;
    --lq-color-subtle: #8b95a5;
    --lq-color-page: #ffffff;
    --lq-color-panel: #ffffff;
    --lq-color-panel-strong: #f7faf9;
    --lq-color-border: #d8dfe3;
    --lq-color-border-soft: #e8ecee;
    --lq-color-primary: #006b58;
    --lq-color-primary-hover: #005647;
    --lq-color-on-primary: #ffffff;
    --lq-color-primary-soft: #edf8f5;
    --lq-color-primary-border: #3b8d7e;
    --lq-color-blue: #367bf5;
    --lq-color-blue-soft: #eef4ff;
    --lq-color-blue-border: #367bf5;
    container-name: authoring-frame;
    container-type: inline-size;
    color-scheme: light;
  }

  .shell-panel,
  .shell-panel .panel-canvas,
  .shell-panel .document-page,
  .shell-panel .panel-reference-workspace,
  .shell-panel .authoring-workspace,
  .shell-panel .tour-sequence-rail,
  .shell-panel .tour-step-inspector {
    background: #ffffff;
    color: var(--lq-color-ink);
  }

  .panel-reference-workspace {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) 58px;
    overflow: hidden;
  }

  .shell-panel .panel-reference-workspace .panel-hybrid-workspace {
    height: auto;
    min-height: 0;
  }

  .panel-workspace-footer {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid var(--lq-color-border);
    background: #ffffff;
    padding: 9px 40px 9px 18px;
  }

  .panel-draft-state {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--lq-color-primary);
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }

  .panel-release-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .panel-release-actions button {
    display: inline-flex;
    min-width: 94px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 0 13px;
  }

  .panel-release-actions button.publish {
    min-width: 142px;
    background: var(--lq-color-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(0, 107, 88, 0.18);
  }

  .panel-release-actions button:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-soft);
  }

  .panel-release-actions button.publish:hover {
    background: var(--lq-color-primary-hover);
    color: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .compact-header {
    min-height: 48px;
    border-bottom-color: transparent;
    background: #ffffff;
    padding: 0 16px;
  }

  .shell-panel .tour-sequence-rail.compact .compact-header > strong {
    font-size: 14px;
    font-weight: 720;
  }

  .shell-panel .tour-sequence-rail.compact .compact-header > span {
    color: var(--lq-color-muted);
    font-size: 12px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-list {
    flex: 0 1 auto;
    gap: 5px;
    padding: 0 16px 8px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row {
    border-color: transparent;
    border-radius: 8px;
    background: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row.active,
  .shell-panel .tour-sequence-rail.compact .tour-step-row.expanded {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    box-shadow: none;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-select {
    min-height: 52px;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 7px;
    padding: 6px 4px;
  }

  .tour-step-grip {
    color: #9aa4b2;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-number {
    width: 26px;
    height: 26px;
    border-color: #c8d0d6;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    font-size: 13px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row.active .tour-step-number {
    border-color: #003f35;
    background: #003f35;
    color: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 650;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-health {
    min-width: 34px;
    color: var(--lq-color-muted);
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-health-dot {
    width: 7px;
    height: 7px;
  }

  .tour-step-chevron {
    color: var(--lq-color-ink-soft);
  }

  .shell-panel .tour-sequence-rail.compact .tour-contextual-actions {
    margin: 7px 12px 12px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step {
    min-height: 34px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-primary);
    box-shadow: none;
  }

  .tour-step-editor-section,
  .tour-step-config-section {
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 12px 18px;
  }

  .tour-step-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 9px;
  }

  .tour-step-section-heading strong,
  .tour-step-config-section > h3 {
    margin: 0;
    color: var(--lq-color-ink);
    font-size: 14px;
    font-weight: 720;
    line-height: 1.25;
  }

  .tour-step-section-heading span {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 650;
  }

  .rich-step-editor {
    overflow: visible;
    border: 1px solid #cfd7dc;
    border-radius: 8px;
    background: #ffffff;
  }

  .rich-step-toolbar {
    display: flex;
    min-height: 38px;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #f8faf9;
    padding: 3px 6px;
  }

  .rich-step-toolbar select {
    height: 28px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 11px;
    font-weight: 650;
    padding: 0 6px;
  }

  .rich-step-toolbar select:first-child {
    width: 94px;
  }

  .rich-step-toolbar select:nth-child(2) {
    width: 65px;
  }

  .rich-step-toolbar button,
  .rich-step-color {
    display: inline-grid;
    width: 27px;
    height: 27px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
  }

  .rich-step-toolbar button:hover,
  .rich-step-toolbar button[aria-pressed='true'],
  .rich-step-color:hover {
    border-color: #cbd5db;
    background: #ffffff;
    color: var(--lq-color-primary);
  }

  .rich-step-toolbar-divider {
    width: 1px;
    height: 20px;
    margin: 0 3px;
    background: #dce2e5;
  }

  .rich-step-color {
    position: relative;
    font-size: 13px;
    font-weight: 760;
  }

  .rich-step-color::after {
    position: absolute;
    right: 7px;
    bottom: 4px;
    left: 7px;
    height: 3px;
    border-radius: 2px;
    background: var(--rich-text-color, #162033);
    content: '';
  }

  .rich-step-color input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .rich-step-content {
    box-sizing: border-box;
    min-height: 96px;
    max-height: 400px;
    overflow: auto;
    resize: vertical;
    cursor: text;
    outline: 0;
    padding: 8px;
  }

  .rich-step-content:focus-within {
    box-shadow: 0 0 0 2px var(--lq-color-blue) inset;
  }

  .rich-step-block-row {
    display: grid;
    min-width: 0;
    grid-template-columns: 22px minmax(0, 1fr) 28px;
    align-items: start;
    gap: 3px;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 3px 2px;
  }

  .rich-step-block-row + .rich-step-block-row {
    margin-top: 2px;
  }

  .rich-step-block-row:hover,
  .rich-step-block-row.active,
  .rich-step-block-row.selected {
    border-color: var(--lq-color-border-soft);
    background: #f8faf9;
  }

  .rich-step-block-drag {
    display: inline-grid;
    width: 22px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #9aa4b2;
    cursor: grab;
    opacity: 0.4;
    padding: 0;
  }

  .rich-step-block-row:hover .rich-step-block-drag,
  .rich-step-block-row.active .rich-step-block-drag,
  .rich-step-block-drag:focus-visible {
    opacity: 1;
  }

  .rich-step-block-actions.ui-button {
    width: 26px;
    min-width: 26px;
    min-height: 28px;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    opacity: 0;
    padding: 0;
  }

  .rich-step-block-row:hover .rich-step-block-actions,
  .rich-step-block-row.active .rich-step-block-actions,
  .rich-step-block-actions:focus-visible,
  .rich-step-block-actions[aria-expanded='true'] {
    opacity: 1;
  }

  .rich-step-block {
    min-height: 1.4em;
    color: var(--lq-color-ink);
    line-height: 1.45;
    outline: 0;
    padding: 2px 3px;
  }

  .rich-step-block.heading {
    margin-bottom: 8px;
    font-size: 18px;
    font-weight: 720;
    line-height: 1.3;
  }

  .rich-step-block.paragraph {
    color: var(--lq-color-ink-soft);
    font-size: 13px;
  }

  .tour-step-config-section > h3 {
    margin-bottom: 9px;
  }

  .tour-placement-card {
    display: grid;
    width: 100%;
    min-height: 38px;
    grid-template-columns: 20px auto minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 0 13px;
    text-align: left;
  }

  .tour-placement-card > strong {
    font-size: 13px;
    font-weight: 650;
  }

  .tour-placement-card > span {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-placement-card > span.repair,
  .tour-placement-card > span.review {
    color: #8b6b1b;
  }

  .tour-position-group {
    margin-top: 10px;
  }

  .tour-position-group h4 {
    margin: 0 0 8px;
    color: var(--lq-color-ink-soft);
    font-size: 13px;
    font-weight: 650;
  }

  .tour-position-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .tour-position-options button {
    display: grid;
    min-height: 56px;
    place-items: center;
    align-content: center;
    gap: 4px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 12px;
    font-weight: 650;
  }

  .tour-position-options button.selected,
  .tour-position-options button[aria-pressed='true'] {
    border-color: var(--lq-color-blue);
    background: #f7faff;
    box-shadow: 0 0 0 1px var(--lq-color-blue) inset;
    color: var(--lq-color-blue);
  }

  .tour-advance-options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .tour-advance-options button {
    position: relative;
    display: grid;
    min-height: 80px;
    grid-template-columns: 20px 30px minmax(0, 1fr);
    align-items: start;
    gap: 9px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 9px 10px;
    text-align: left;
  }

  .tour-advance-options button.selected,
  .tour-advance-options button[aria-pressed='true'] {
    border-color: var(--lq-color-blue);
    box-shadow: 0 0 0 1px var(--lq-color-blue) inset;
  }

  .tour-advance-radio {
    width: 16px;
    height: 16px;
    margin-top: 2px;
    border: 1.5px solid #98a2b3;
    border-radius: 999px;
    background: #ffffff;
  }

  .tour-advance-options button.selected .tour-advance-radio {
    border: 5px solid var(--lq-color-blue);
  }

  .tour-advance-options button > span:last-child {
    display: grid;
    gap: 4px;
  }

  .tour-advance-options strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    font-weight: 700;
  }

  .tour-advance-options small {
    color: var(--lq-color-muted);
    font-size: 11px;
    line-height: 1.45;
  }

  .tour-advanced-settings-row {
    display: grid;
    width: 100%;
    min-height: 52px;
    grid-template-columns: 24px minmax(0, 1fr) 18px;
    align-items: center;
    gap: 10px;
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 9px 18px;
    text-align: left;
  }

  .tour-advanced-settings-row > span {
    display: grid;
    gap: 3px;
  }

  .tour-advanced-settings-row strong {
    font-size: 13px;
    font-weight: 700;
  }

  .tour-advanced-settings-row small {
    color: var(--lq-color-muted);
    font-size: 11px;
  }

  .tour-advanced-settings-row:hover {
    background: #f8faf9;
  }

  @media (max-height: 720px) {
    .panel-reference-workspace {
      grid-template-rows: minmax(0, 1fr) 54px;
    }

    .tour-step-editor-section,
    .tour-step-config-section {
      padding: 9px 16px;
    }

    .tour-step-section-heading,
    .tour-step-config-section > h3 {
      margin-bottom: 9px;
    }

    .rich-step-toolbar {
      min-height: 38px;
      padding-block: 3px;
    }

    .rich-step-content {
      min-height: 82px;
      padding-block: 8px;
    }

    .tour-position-group {
      margin-top: 11px;
    }

    .tour-position-options button {
      min-height: 48px;
      gap: 4px;
    }

    .tour-advance-options button {
      min-height: 68px;
      padding-block: 7px;
    }

    .tour-advanced-settings-row {
      min-height: 46px;
      padding-block: 7px;
    }

    .panel-workspace-footer {
      padding-block: 9px;
    }
  }

  @keyframes lq-release-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tour-release-spinner {
      animation: none;
    }
  }

  @media (max-width: 760px) {
    .authoring-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .tour-sequence-rail {
      position: static;
      height: auto;
      max-height: 48vh;
      border-right: 0;
      border-bottom: 1px solid var(--lq-color-border);
    }

    .document-main {
      min-height: 52vh;
      padding: 18px 12px 30px;
    }
  }

  @container authoring-frame (min-width: 620px) {
    .shell-panel .panel-hybrid-workspace {
      grid-template-columns: 230px minmax(0, 1fr);
    }

    .shell-panel .panel-hybrid-workspace > .tour-sequence-rail {
      display: flex;
      border-right: 1px solid var(--lq-color-border-soft);
    }

    .shell-panel .tour-sequence-rail.compact .tour-step-copy strong {
      display: -webkit-box;
      overflow: hidden;
      line-height: 1.3;
      text-overflow: initial;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .shell-panel .panel-hybrid-workspace .tour-step-accordion {
      display: none;
    }

    .tour-step-inspector {
      display: flex;
      height: 100%;
      min-height: 0;
      min-width: 0;
      flex-direction: column;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--lq-color-panel);
      padding: 0;
      scrollbar-gutter: stable;
    }

    .panel-advanced-workspace .panel-advanced-editor {
      min-width: 0;
    }
  }

  @container authoring-frame (min-width: 800px) {
    .shell-panel .panel-hybrid-workspace {
      grid-template-columns: 280px minmax(0, 1fr);
    }
  }

  @container authoring-frame (max-width: 619px) {
    .panel-reference-workspace {
      grid-template-rows: minmax(0, 1fr) 52px;
    }

    .panel-workspace-footer {
      gap: 6px;
      padding: 7px 40px 7px 10px;
    }

    .panel-draft-state {
      gap: 4px;
      font-size: 10px;
    }

    .panel-release-actions {
      flex: 0 0 auto;
      gap: 5px;
    }

    .panel-release-actions button {
      min-width: 70px;
      min-height: 32px;
      padding-inline: 9px;
    }

    .panel-release-actions button.publish {
      min-width: 122px;
    }

    .panel-release-actions button svg {
      display: none;
    }
  }

  @container authoring-frame (max-width: 390px) {
    .panel-draft-state {
      font-size: 0;
    }

    .panel-release-actions button.publish {
      min-width: 112px;
    }

    .rich-step-toolbar-divider,
    .rich-step-toolbar select:nth-child(2) {
      display: none;
    }

    .rich-step-block-row {
      grid-template-columns: 20px minmax(0, 1fr) 26px;
    }
  }
`;
