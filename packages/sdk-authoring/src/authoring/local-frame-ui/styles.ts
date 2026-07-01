export const LOCAL_AUTHORING_FRAME_CSS = `
  :root {
    --lq-color-ink: #18212f;
    --lq-color-ink-soft: #3d4656;
    --lq-color-muted: #5f6b7d;
    --lq-color-subtle: #8490a2;
    --lq-color-canvas: #edf2f5;
    --lq-color-page: #ffffff;
    --lq-color-panel: #eef4f7;
    --lq-color-panel-strong: #dfe9ee;
    --lq-color-border: #d7e0e8;
    --lq-color-border-soft: #edf2f6;
    --lq-color-chrome: #071916;
    --lq-color-chrome-soft: #102a27;
    --lq-color-chrome-text: #f3fbf9;
    --lq-color-chrome-muted: #a8bab6;
    --lq-color-primary: #174f55;
    --lq-color-primary-hover: #123f44;
    --lq-color-primary-soft: #e5f3f2;
    --lq-color-primary-border: #b8d9d6;
    --lq-color-blue: #2458c7;
    --lq-color-blue-soft: #eef5ff;
    --lq-color-blue-border: #c9dcff;
    --lq-color-success: #087443;
    --lq-color-success-soft: #eefaf4;
    --lq-color-success-border: #bfe9d4;
    --lq-color-warning: #8a520c;
    --lq-color-warning-soft: #fff7e6;
    --lq-color-warning-border: #f5d99b;
    --lq-color-danger: #b42318;
    --lq-color-danger-soft: #fff1f1;
    --lq-color-danger-border: #f1b8b8;
    --lq-radius-xs: 6px;
    --lq-radius-sm: 7px;
    --lq-radius-md: 8px;
    --lq-shadow-popover: 0 18px 44px rgba(15, 23, 42, 0.14);
    --lq-shadow-raised: 0 10px 28px rgba(15, 23, 42, 0.08);
    font-family: "Plus Jakarta Sans", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--lq-color-ink);
    background: var(--lq-color-page);
    color-scheme: light;
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
    background: linear-gradient(180deg, var(--lq-color-chrome), #091f1c);
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
  .block-title,
  .target-menu-shell,
  .preview-panel {
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
    background: rgba(255, 255, 255, 0.72);
    box-shadow: inset 0 0 0 1px rgba(215, 224, 232, 0.7);
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
  .target-row,
  .block-meta,
  .document-stats {
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
    border-color: #c4ceda;
    background: #f8fafc;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
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
    border-color: #e9a9a1;
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
    border: 1px solid rgba(220, 226, 234, 0.72);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.78);
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
    background: rgba(255, 255, 255, 0.94);
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

  .document-action-popover {
    width: 210px;
    padding: 6px;
  }

  .document-action-menu {
    display: grid;
    gap: 4px;
  }

  .document-action-menu .ui-button {
    justify-content: flex-start;
    width: 100%;
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

  .document-hero-copy {
    display: grid;
    gap: 8px;
  }

  .document-hero-meta {
    display: grid;
    justify-items: end;
    gap: 10px;
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

  .document-stats span {
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 680;
    line-height: 1.35;
    padding: 0;
  }

  .document-stats {
    justify-content: flex-end;
    gap: 9px;
  }

  .document-stats span + span::before {
    display: inline-block;
    width: 3px;
    height: 3px;
    margin-right: 9px;
    border-radius: 999px;
    background: var(--lq-color-subtle);
    vertical-align: 0.18em;
    content: "";
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
    border-top: 1px solid rgba(238, 241, 245, 0.72);
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
    background: #f8fafc;
    box-shadow: inset 0 0 0 1px rgba(215, 224, 232, 0.52);
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
    background: #f8fafc;
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
    background: #fbfcfd;
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
    box-shadow: 0 1px 0 rgba(237, 242, 246, 0.95);
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
    background: #f8fafc;
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
    border: 1px solid #d5dee7;
    border-radius: 10px;
    background: #f8fafc;
    padding: 14px 18px 16px 36px;
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 10px 28px rgba(15, 23, 42, 0.035);
  }

  .block[data-block-type="tourStep"]:first-child {
    border-top-color: #d5dee7;
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
    border-color: #b9d7d5;
    background: #ffffff;
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 12px 30px rgba(15, 23, 42, 0.07);
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

  .block-header,
  .panel-header {
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
    background: #f7fafb;
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
    border-color: rgba(215, 224, 232, 0.78);
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
  }

  .block-quick-actions {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 1px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.82);
    padding: 2px;
    box-shadow: 0 1px 1px rgba(15, 23, 42, 0.03);
  }

  .block-quick-action {
    width: 24px;
    min-width: 24px;
    min-height: 24px;
    border-color: transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--lq-color-subtle);
    padding: 0;
  }

  .block-quick-action:hover {
    border-color: transparent;
    background: #eef4f7;
    color: var(--lq-color-ink);
    box-shadow: none;
  }

  .block-quick-action-danger {
    color: var(--lq-color-danger);
  }

  .block-quick-action-danger:hover {
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
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
    background: #f8fafc;
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
    background: #f8fafc;
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
    gap: 1px;
    padding: 2px 0 0;
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
    color: #9aa5b4;
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
    background: #f8fafc;
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
    background: #f8fafc;
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
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 260;
    display: grid;
    width: min(430px, calc(100vw - 72px));
    max-height: min(360px, calc(100vh - 150px));
    gap: 5px;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: var(--lq-color-page);
    padding: 8px;
    box-shadow: var(--lq-shadow-popover);
  }

  .step-command-menu[hidden] {
    display: none;
  }

  .step-command-menu .command-copy strong,
  .step-command-menu .command-copy small {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .step-command-menu .command-item .ui-button-label {
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: start;
    overflow: visible;
  }

  .step-command-menu .command-item {
    align-items: flex-start;
  }

  .step-command-menu .command-copy {
    padding-top: 1px;
  }

  .step-command-menu .command-description {
    display: none;
  }

  .step-child {
    position: relative;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    min-width: 0;
    align-items: start;
    column-gap: 3px;
    row-gap: 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    margin: 0;
    padding: 3px 0 8px;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .step-child::before {
    position: absolute;
    top: 7px;
    bottom: 7px;
    left: 3px;
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
    background: rgba(248, 250, 252, 0.52);
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
    top: 4px;
    right: 4px;
    left: -24px;
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
    min-height: 18px;
    margin: 4px 0 0;
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
    border: 1px solid rgba(215, 224, 232, 0.82);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
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
    background: #f8fafc;
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
    background: #f8fafc;
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
    background: #f8fafc;
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

  .block-section-target {
    margin-top: 4px;
    border-top: 0;
    padding: 2px 0 4px;
  }

  .block-section-label {
    color: var(--lq-color-subtle);
    font-size: 11px;
    font-weight: 780;
    line-height: 28px;
    text-transform: uppercase;
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
    padding: 4px 6px;
    transition:
      background 120ms ease,
      box-shadow 120ms ease,
      color 120ms ease;
  }

  .block-input:hover,
  .block-input:focus {
    background: rgba(248, 250, 252, 0.78);
    box-shadow: none;
  }

  .block-input:focus {
    box-shadow: inset 0 0 0 1px var(--lq-color-border-soft);
  }

  .block-input-heading,
  .block-input[aria-label="Heading"] {
    color: var(--lq-color-ink);
    font-size: 18px;
    font-weight: 740;
    line-height: 1.22;
  }

  textarea.block-input {
    field-sizing: content;
    min-height: 30px;
    overflow: hidden;
    resize: none;
  }

  textarea.block-input-heading,
  textarea.block-input[aria-label="Heading"] {
    min-height: 32px;
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
    background: rgba(248, 250, 252, 0.78);
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
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: min(100%, 320px);
    min-width: 0;
    align-items: stretch;
    gap: 2px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    padding: 2px 0 0;
  }

  .button-field-shell.incomplete {
    background: transparent;
  }

  .button-label-field {
    min-width: 0;
  }

  .cta-panel {
    display: inline-grid;
    grid-template-columns: auto minmax(130px, max-content);
    align-items: center;
    justify-self: start;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    gap: 4px;
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
    width: 100%;
    min-height: 26px;
    justify-self: stretch;
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
    border-color: #c2c9d3;
    background: #f8fafc;
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
  .property-chip,
  .target-empty {
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

  .target-row {
    gap: 8px;
    padding-top: 1px;
  }

  .target-row button[data-action="target-pick"],
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
    border-color: #ead8aa;
    background: #fffaf0;
    color: var(--lq-color-warning);
  }

  .anchor-button:hover {
    border-color: var(--lq-color-primary-border);
    background: #f5fbfb;
    color: #0f5f65;
    box-shadow: none;
  }

  .target-empty {
    color: var(--lq-color-subtle);
    padding-left: 0;
  }

  .target-control {
    --target-accent: var(--lq-color-blue);
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
  .target-control.ambiguous {
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
  .target-chip-status {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .target-chip-label {
    max-width: 136px;
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

  .target-control.unchecked .target-chip-status,
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
    background: #f8fafc;
    color: var(--lq-color-ink);
    box-shadow: none;
  }

  .target-control.missing .target-menu-trigger,
  .target-control.ambiguous .target-menu-trigger {
    border-color: #ead8aa;
    background: #fffaf0;
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
    width: min(274px, calc(100vw - 32px));
    max-height: min(348px, var(--radix-popover-content-available-height, 348px));
    padding: 0;
    overflow: hidden;
  }

  .target-menu {
    display: grid;
    gap: 6px;
    max-height: min(336px, calc(var(--radix-popover-content-available-height, 348px) - 12px));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px;
    scrollbar-color: #c8d0dc transparent;
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
    background: #c8d0dc;
  }

  .target-menu::-webkit-scrollbar-thumb:hover {
    background: #aeb8c6;
  }

  .target-menu-header {
    display: grid;
    gap: 2px;
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    padding: 4px 4px 7px;
  }

  .target-menu-header span {
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

  .ui-popover-content {
    z-index: 240;
    gap: 6px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
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
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
  }

  .target-menu-action {
    align-items: flex-start;
    justify-content: flex-start;
    min-width: 0;
    width: 100%;
    border-color: transparent;
    border-radius: 7px;
    background: transparent;
    min-height: 42px;
    padding: 7px 8px;
    text-align: left;
    white-space: normal;
  }

  .target-menu-action:hover {
    border-color: var(--lq-color-border);
    background: #f8fafc;
    box-shadow: none;
  }

  .target-menu-action-featured {
    min-height: 42px;
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
  }

  .target-menu-action-danger {
    min-height: 40px;
    margin-top: 2px;
    border-color: transparent;
    color: var(--lq-color-danger);
  }

  .target-menu-action-danger:hover {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
  }

  .target-menu-action .ui-button-icon {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .target-menu-action-featured .ui-button-icon {
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-menu-action-danger .ui-button-icon {
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .target-menu-action .ui-button-label {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .target-action-copy {
    display: grid;
    min-width: 0;
    gap: 0;
  }

  .target-action-copy strong,
  .target-action-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .target-action-copy strong {
    color: var(--lq-color-ink);
    font-size: 13px;
    line-height: 1.2;
  }

  .target-action-copy small {
    display: block;
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 560;
    line-height: 1.2;
    white-space: normal;
  }

  .target-menu-action-danger .target-action-copy strong {
    color: var(--lq-color-danger);
  }

  .target-health,
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
    background: #fafbfc;
    padding: 8px 9px;
  }

  .target-health.found {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .target-health.missing,
  .target-health.ambiguous {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .target-health strong {
    display: block;
    margin-bottom: 2px;
    color: var(--lq-color-ink);
  }

  .target-advanced {
    display: grid;
    gap: 6px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: #fbfcfd;
    padding: 8px 9px;
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
    background: #f8fafc;
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
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid #d8e9e6;
    border-radius: var(--lq-radius-sm);
    background: #f6fbfa;
    padding: 10px;
    box-shadow: 0 1px 2px rgba(9, 76, 68, 0.05);
  }

  .preview-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 150px));
    justify-content: end;
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
    background: #f8fafc;
    color: var(--lq-color-ink);
  }

  .preview-copy strong,
  .panel-header strong,
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

  .preview-state {
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--lq-color-chrome-muted);
    font-size: 12px;
    font-weight: 700;
    padding: 6px 10px;
    text-align: center;
    white-space: nowrap;
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
    padding-left: 18px;
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

  .document-utilities,
  .document-review {
    background: transparent;
    padding: 0;
  }

  .review-drawer {
    min-width: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0 0 12px 12px;
    background: var(--lq-color-page);
    box-shadow: none;
  }

  .review-drawer > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    align-items: center;
    gap: 12px;
    list-style: none;
    min-height: 56px;
    padding: 10px 18px;
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
    background: var(--lq-color-page);
    padding: 0 18px 16px;
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
    background: #ffffff;
    padding: 8px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
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
    background: #fbfcfd;
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
    background: #f7f8fa;
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
    background: #f7f8fa;
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
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
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

    .document-hero-meta {
      justify-items: start;
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
      grid-template-columns: 1fr;
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
`;
