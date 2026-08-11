import {
  AUTHORING_CONTEXT_SURFACE_TOKENS,
  AUTHORING_CONTROL_HEIGHT,
  AUTHORING_FONT_WEIGHT,
  AUTHORING_RADIUS_SCALE,
  AUTHORING_SPACE_SCALE,
  AUTHORING_TYPE_SCALE,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_TOKENS,
} from '../../creator-chrome-tokens';

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
    --lq-radius-xs: ${AUTHORING_RADIUS_SCALE[0]}px;
    --lq-radius-sm: ${AUTHORING_RADIUS_SCALE[0]}px;
    --lq-radius-md: ${AUTHORING_RADIUS_SCALE[1]}px;
    --lq-space-1: ${AUTHORING_SPACE_SCALE[0]}px;
    --lq-space-2: ${AUTHORING_SPACE_SCALE[1]}px;
    --lq-space-3: ${AUTHORING_SPACE_SCALE[2]}px;
    --lq-space-4: ${AUTHORING_SPACE_SCALE[3]}px;
    --lq-space-5: ${AUTHORING_SPACE_SCALE[4]}px;
    --lq-space-6: ${AUTHORING_SPACE_SCALE[5]}px;
    --lq-space-7: ${AUTHORING_SPACE_SCALE[6]}px;
    --lq-font-2xs: ${AUTHORING_TYPE_SCALE[0]}px;
    --lq-font-xs: ${AUTHORING_TYPE_SCALE[1]}px;
    --lq-font-sm: ${AUTHORING_TYPE_SCALE[2]}px;
    --lq-font-md: ${AUTHORING_TYPE_SCALE[3]}px;
    --lq-font-lg: ${AUTHORING_TYPE_SCALE[4]}px;
    --lq-font-xl: ${AUTHORING_TYPE_SCALE[5]}px;
    --lq-font-2xl: ${AUTHORING_TYPE_SCALE[6]}px;
    --lq-font-3xl: ${AUTHORING_TYPE_SCALE[7]}px;
    --lq-font-4xl: ${AUTHORING_TYPE_SCALE[8]}px;
    --lq-weight-regular: ${AUTHORING_FONT_WEIGHT.regular};
    --lq-weight-medium: ${AUTHORING_FONT_WEIGHT.medium};
    --lq-weight-semibold: ${AUTHORING_FONT_WEIGHT.semibold};
    --lq-weight-bold: ${AUTHORING_FONT_WEIGHT.bold};
    --lq-control-sm: ${AUTHORING_CONTROL_HEIGHT.sm}px;
    --lq-control-md: ${AUTHORING_CONTROL_HEIGHT.md}px;
    --lq-control-lg: ${AUTHORING_CONTROL_HEIGHT.lg}px;
    --lq-shadow-popover: 0 16px 40px rgba(0, 0, 0, 0.44);
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
    padding: 0 0 32px;
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
    padding: 12px 24px;
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
    gap: 8px 12px;
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
    font-size: 10px;
    font-weight: 700;
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
    font-size: 28px;
    font-weight: 700;
    line-height: 1.08;
  }

  .document-title-input {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: 28px;
    font-weight: 700;
    line-height: 1.08;
    padding: 4px 8px;
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
    gap: 8px;
  }

  .ui-button {
    display: inline-flex;
    min-width: 0;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    padding: 8px 12px;
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
    font-size: 10px;
    font-weight: 700;
  }

  .block-action-menu-header strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
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
    font-weight: 600;
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
    font-size: 14px;
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
    font-size: 10px;
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
    border-radius: 8px;
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
    padding-top: 4px;
  }

  .target-menu-disclosure > summary,
  .target-matching-details > summary {
    display: flex;
    min-height: 40px;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    list-style: none;
    padding: 8px 8px;
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
    margin-bottom: 8px;
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
    min-height: 36px;
    min-width: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    padding: 4px 8px;
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
    padding: 8px 8px;
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
    margin-bottom: 4px;
    color: var(--lq-color-ink);
  }

  .target-lifecycle {
    display: grid;
    gap: 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px 8px;
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
    font-size: 10px;
  }

  .target-lifecycle-field {
    display: grid;
    gap: 4px;
  }

  .target-lifecycle-control-group {
    display: grid;
    gap: 4px;
  }

  .target-lifecycle-field > span,
  .target-lifecycle-control-group > span {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .target-lifecycle-field input,
  .target-lifecycle-field .ui-select-trigger {
    width: 100%;
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: 12px;
  }

  .target-lifecycle-field input {
    padding: 8px 8px;
  }

  .target-lifecycle-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .target-lifecycle-action {
    min-width: 0;
    justify-content: center;
    min-height: 40px;
    padding: 8px;
  }

  .target-lifecycle-action.selected {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-advanced {
    display: grid;
    gap: 8px;
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
    padding-top: 4px;
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
    font-weight: 600;
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
    padding: 4px 0 0;
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
    min-height: 36px;
    background: transparent;
  }

  .block-tools .ui-button {
    min-height: 36px;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 4px 8px;
  }

  .block-tools .ui-button:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .block-meta {
    gap: 4px;
  }

  .preview-copy {
    display: grid;
    gap: 4px;
  }

  .preview-workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    border: 1px solid var(--lq-color-panel-strong);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 12px;
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
    font-weight: 700;
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
    gap: 12px;
    border: 1px solid var(--lq-color-warning-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-warning-soft);
    padding: 12px;
  }

  .issue-panel p,
  .issue-panel li {
    color: var(--lq-color-muted);
    font-size: 12px;
    line-height: 1.4;
  }

  .issue-panel ul {
    display: grid;
    gap: 4px;
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
    border-radius: 12px;
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
    padding: 12px 16px;
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
    gap: 4px;
  }

  .review-summary-copy strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 14px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-summary-copy span {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    font-weight: 600;
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
    font-weight: 700;
    line-height: 1;
    padding: 4px 8px;
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
    gap: 12px;
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
    gap: 12px;
    list-style: none;
    border-radius: 8px;
    padding: 8px 8px;
  }

  .utilities-drawer > summary::-webkit-details-marker {
    display: none;
  }

  .utilities-drawer > summary span {
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 700;
  }

  .utilities-drawer > summary small {
    overflow: hidden;
    color: var(--lq-color-subtle);
    font-size: 10px;
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
    gap: 12px;
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
    padding: 12px;
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
    padding: 12px;
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
    padding: 4px;
  }

  .ui-tabs-trigger {
    min-height: 36px;
    border: 0;
    border-radius: var(--lq-radius-xs);
    background: transparent;
    color: var(--lq-color-muted);
    padding: 4px 8px;
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
      padding: 12px 40px;
    }
  }

  @media (max-width: 1100px) {
    .authoring-workspace {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 680px) {
    .topbar {
      padding-left: 16px;
      padding-right: 16px;
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
      padding-left: 16px;
      padding-right: 16px;
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
      padding-left: 32px;
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
      column-gap: 4px;
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
      margin-right: 16px;
      margin-left: 16px;
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
    padding: 24px 24px 16px;
  }

  .tour-sequence-title {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
  }

  .tour-sequence-kicker.document-context {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .tour-sequence-header .document-title-input {
    width: 100%;
    border-radius: 8px;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.3;
    padding: 4px 4px;
    transform: translateX(-4px);
  }

  .tour-health-count {
    flex: 0 0 auto;
    margin-top: 16px;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .tour-step-list {
    display: grid;
    align-content: start;
    gap: 8px;
    margin: 0;
    padding: 16px 16px 8px;
    list-style: none;
    overflow-y: auto;
  }

  .tour-step-row {
    display: grid;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
  }

  .tour-step-row-main {
    display: grid;
    min-width: 0;
    grid-template-columns: 26px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 4px;
  }

  .tour-step-drag-handle {
    display: inline-grid;
    width: 26px;
    height: 36px;
    place-items: center;
    border: 0;
    border-radius: 8px;
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
    gap: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 12px 12px;
    text-align: left;
  }

  .tour-step-action-trigger.ui-button {
    width: 28px;
    min-width: 28px;
    min-height: 36px;
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
    gap: 4px;
    padding: 4px;
  }

  .tour-step-action-menu .ui-button,
  .rich-step-block-action-menu .ui-button {
    width: 100%;
    min-height: 36px;
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
    height: 36px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    font-size: 12px;
    font-weight: 700;
  }

  .tour-step-row.active .tour-step-number {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .tour-step-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-copy strong,
  .tour-step-placement {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 600;
  }

  .tour-step-placement {
    color: var(--lq-color-muted);
    font-size: 10px;
  }

  .tour-step-health {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
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
    gap: 8px;
    margin: 4px 24px 16px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 8px;
  }

  .tour-add-step:hover {
    background: var(--lq-color-primary-soft);
  }

  .tour-active-step-footer {
    display: grid;
    gap: 12px;
    margin: auto 16px 16px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
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
    gap: 8px;
  }

  .tour-active-target-icon {
    display: inline-grid;
    width: 28px;
    height: 36px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .tour-active-target-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-active-target small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .tour-active-target strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-active-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .tour-active-actions button {
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 8px 8px;
  }

  .tour-active-actions button:hover {
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
    padding: 40px clamp(24px, 4vw, 40px) 40px;
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
    border-radius: 12px;
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
    margin-top: 16px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
    margin-bottom: 8px;
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
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--lq-space-3);
    border-bottom: 1px solid var(--lq-color-border);
    background: var(--lq-color-panel);
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .panel-advanced-title {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .panel-advanced-header small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .panel-advanced-header strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-advanced-back {
    display: inline-flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-2);
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-2);
  }

  .panel-advanced-back:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .panel-advanced-save-status {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: var(--lq-space-2);
    color: var(--lq-color-success);
    font-size: var(--lq-font-xs);
    white-space: nowrap;
  }

  .panel-advanced-save-status[data-state="saving"] {
    color: var(--lq-color-muted);
  }

  .panel-advanced-save-status[data-state="error"] {
    color: var(--lq-color-danger);
  }

  .panel-advanced-save-status strong {
    max-width: 112px;
    overflow: hidden;
    font-size: var(--lq-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shell-panel .document-main {
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--lq-space-4) var(--lq-space-3) var(--lq-space-6);
    scrollbar-gutter: stable;
  }

  .shell-panel .panel-advanced-main {
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
    gap: var(--lq-space-4);
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

  .shell-panel .panel-advanced-main > .inspector {
    overflow: hidden;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
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
    padding-right: 40px;
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
    padding: 0 16px;
  }

  .tour-sequence-rail.compact .compact-header > strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .tour-sequence-rail.compact .compact-header > span {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 600;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-list {
    flex: 1 1 auto;
    min-height: 76px;
    max-height: none;
    overflow-y: auto;
    gap: 8px;
    padding: 12px 12px 8px;
  }

  .tour-sequence-rail.compact .tour-step-row {
    border-color: var(--lq-color-border-soft);
    border-radius: 12px;
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
    gap: 8px;
    padding: 8px 12px;
  }

  .tour-sequence-rail.compact .tour-step-number {
    width: 22px;
    height: 24px;
    border-color: var(--lq-color-border);
    font-size: 10px;
  }

  .tour-sequence-rail.compact .tour-step-copy {
    gap: 0;
  }

  .tour-sequence-rail.compact .tour-step-copy strong {
    font-size: 12px;
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
    padding: 12px 12px 12px;
  }

  .tour-step-detail-row {
    display: grid;
    gap: 4px;
  }

  .tour-step-detail-label {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
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
    font-weight: 600;
    line-height: 1.3;
  }

  .tour-step-detail-change {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 0 12px;
  }

  .tour-step-detail-change:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-behavior-summary {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
  }

  .tour-step-edit-on-page {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
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
    margin: 4px 16px 16px;
  }

  .tour-contextual-actions .tour-add-step {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 12px;
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
    gap: 8px;
    margin: 8px 16px 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 8px 12px;
    text-align: left;
  }

  .tour-appearance-entry:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-appearance-icon {
    display: inline-grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-primary);
  }

  .tour-appearance-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .tour-appearance-copy small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.055em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .tour-appearance-copy strong {
    overflow: hidden;
    font-size: 10px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-appearance-copy > span {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.3;
  }

  .tour-sequence-rail.compact .tour-release-strip {
    gap: 0;
    margin: 0 12px 12px;
    padding: 8px 12px;
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
    height: 36px;
    border-radius: 8px;
  }

  .tour-sequence-rail.compact .tour-release-copy strong {
    font-size: 12px;
  }

  .tour-release-strip {
    display: grid;
    flex: 0 0 auto;
    gap: 12px;
    margin: 0 16px 16px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    padding: 12px;
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
    font-size: 8px;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-release-summary {
    display: grid;
    min-width: 0;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
  }

  .tour-release-icon {
    display: inline-grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
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
    gap: 4px;
  }

  .tour-release-copy small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .tour-release-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .tour-release-copy > span {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.4;
  }

  .tour-release-findings {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0 0 0 40px;
    list-style: none;
  }

  .tour-release-findings li {
    display: grid;
    min-width: 0;
    grid-template-columns: 6px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
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
    gap: 8px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 12px;
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 12px;
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
    gap: 4px;
  }

  .tour-step-inspector-header small,
  .tour-step-open-details small {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.35;
  }

  .tour-step-inspector-header > span > small {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .tour-step-inspector-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-inspector-header button {
    display: inline-flex;
    min-height: 36px;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 0 12px;
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
    padding: 12px 16px 16px;
  }

  .tour-step-content-summary strong {
    color: var(--lq-color-ink);
    font-size: 12px;
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
    padding: 12px 16px;
  }

  .tour-step-inspector-row > span:first-child {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-inspector-row small {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.25;
  }

  .tour-step-inspector-row > span > strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-inspector-row > button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 0 12px;
  }

  .tour-step-inspector-row > button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-on-canvas-hint {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .tour-step-open-details {
    display: grid;
    min-height: 48px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink);
    cursor: pointer;
    margin: 12px 16px;
    padding: 8px 12px;
    text-align: left;
  }

  .tour-step-open-details:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-step-open-details > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-open-details strong {
    font-size: 12px;
    font-weight: 700;
  }

  .tour-step-accordion .tour-step-open-details.compact-details {
    min-height: 44px;
    margin: 0;
  }

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
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .shell-panel .panel-reference-workspace .panel-hybrid-workspace {
    height: auto;
    min-height: 0;
  }

  .panel-workspace-footer {
    display: flex;
    min-width: 0;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid var(--lq-color-border);
    background: #ffffff;
    padding: 8px 16px;
  }

  .panel-footer-state {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
  }

  .panel-save-status {
    display: grid;
    min-width: 0;
    max-width: 146px;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: var(--lq-color-ink);
  }

  .panel-save-status-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .panel-save-status-copy strong {
    overflow: hidden;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-save-status[data-state='saving'] {
    color: var(--lq-color-muted);
  }

  .panel-save-status[data-state='error'] {
    color: var(--lq-color-danger);
  }

  .panel-save-status > svg {
    flex: none;
  }

  .panel-save-state-spinner {
    animation: lq-release-spin 900ms linear infinite;
  }

  .panel-release-summary {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-release-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .panel-save-exit,
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
    padding: 0 12px;
  }

  .panel-save-exit {
    min-width: 116px;
    border-color: #d97706;
    background: #fff7ed;
    color: #9a3412;
  }

  .panel-release-short {
    display: none;
  }

  .panel-release-actions button.publish {
    min-width: 142px;
    background: var(--lq-color-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(0, 107, 88, 0.18);
  }

  .panel-release-actions button.review-recovery {
    min-width: 160px;
  }

  .panel-release-actions button:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-soft);
  }

  .panel-save-exit:hover {
    border-color: #c2410c;
    background: #ffedd5;
    color: #7c2d12;
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
    font-weight: 700;
  }

  .shell-panel .tour-sequence-rail.compact .compact-header > span {
    color: var(--lq-color-muted);
    font-size: 12px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-list {
    flex: 0 1 auto;
    gap: 4px;
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
    gap: 8px;
    padding: 8px 4px;
  }

  .tour-step-grip {
    color: #9aa4b2;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-number {
    width: 26px;
    height: 24px;
    border-color: #c8d0d6;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    font-size: 12px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row.active .tour-step-number {
    border-color: #003f35;
    background: #003f35;
    color: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 600;
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
    margin: 8px 12px 12px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step {
    min-height: 36px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-primary);
    box-shadow: none;
  }

  .live-step-header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    min-height: 80px;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-3);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.96);
    padding: var(--lq-space-3) var(--lq-space-4);
    backdrop-filter: blur(12px);
  }

  .live-step-header > span:first-child,
  .tour-step-section-heading > span:first-child,
  .tour-config-heading > span:first-child {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .live-step-header small,
  .tour-config-heading small {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .live-step-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-lg);
    font-weight: var(--lq-weight-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-step-header > span:first-child > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .live-step-status,
  .tour-config-status {
    display: inline-flex;
    min-height: var(--lq-space-5);
    flex: 0 0 auto;
    align-items: center;
    border: 1px solid var(--lq-color-success-border);
    border-radius: 999px;
    background: var(--lq-color-success-soft);
    color: #167553;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-2);
  }

  .live-step-status.review,
  .tour-config-status.review {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: #8b5c08;
  }

  .live-step-status.repair,
  .tour-config-status.repair {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: #a33a3a;
  }

  .tour-step-editor-section {
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-4);
  }

  .tour-step-config-section {
    margin: var(--lq-space-3) var(--lq-space-4) 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
    padding: var(--lq-space-3);
    box-shadow: 0 var(--lq-space-1) var(--lq-space-3) rgba(15, 36, 31, 0.04);
  }

  .tour-step-section-heading,
  .tour-config-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-3);
    margin-bottom: var(--lq-space-3);
  }

  .tour-step-section-heading strong,
  .tour-config-heading strong {
    margin: 0;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
    line-height: 1.25;
  }

  .tour-step-section-heading small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .tour-step-section-heading > span:last-child {
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    padding: var(--lq-space-1) var(--lq-space-2);
    text-transform: uppercase;
  }

  .rich-step-editor {
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.08);
  }

  .rich-step-toolbar {
    display: flex;
    min-height: var(--lq-control-lg);
    flex-wrap: wrap;
    align-items: center;
    gap: var(--lq-space-1);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    padding: var(--lq-space-1) var(--lq-space-2);
  }

  .rich-step-toolbar select {
    height: var(--lq-control-sm);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
  }

  .rich-step-toolbar select:first-child {
    width: 112px;
  }

  .rich-step-toolbar select:nth-child(2) {
    width: 72px;
  }

  .rich-step-toolbar button,
  .rich-step-color {
    display: inline-grid;
    width: var(--lq-control-sm);
    height: var(--lq-control-sm);
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
  }

  .rich-step-toolbar button:hover,
  .rich-step-toolbar button[aria-pressed='true'],
  .rich-step-color:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-step-toolbar button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
  }

  .rich-step-toolbar-divider {
    width: 1px;
    height: var(--lq-space-5);
    margin: 0 var(--lq-space-1);
    background: var(--lq-color-border-soft);
  }

  .rich-step-color {
    position: relative;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .rich-step-color::after {
    position: absolute;
    right: var(--lq-space-2);
    bottom: var(--lq-space-1);
    left: var(--lq-space-2);
    height: var(--lq-space-1);
    border-radius: 999px;
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
    min-height: 160px;
    max-height: 480px;
    overflow: auto;
    resize: vertical;
    cursor: text;
    outline: 0;
    padding: var(--lq-space-3);
  }

  .rich-step-content[data-lodariq-content-align='center'] {
    text-align: center;
  }

  .rich-step-content[data-lodariq-content-align='right'] {
    text-align: right;
  }

  .rich-step-content[data-lodariq-composition-padding='compact'] {
    --lq-tour-composition-padding: var(--lq-tour-space-sm);
  }

  .rich-step-content[data-lodariq-composition-padding='relaxed'] {
    --lq-tour-composition-padding: var(--lq-tour-space-lg);
  }

  .rich-step-block-row[data-lodariq-spacing-before='none'] {
    margin-top: 0;
  }

  .rich-step-block-row[data-lodariq-spacing-before='tight'] {
    margin-top: var(--lq-tour-space-xs);
  }

  .rich-step-block-row[data-lodariq-spacing-before='normal'] {
    margin-top: var(--lq-tour-space-sm);
  }

  .rich-step-block-row[data-lodariq-spacing-before='relaxed'] {
    margin-top: var(--lq-tour-space-md);
  }

  .rich-step-block-row[data-lodariq-spacing-after='none'] {
    margin-bottom: 0;
  }

  .rich-step-block-row[data-lodariq-spacing-after='tight'] {
    margin-bottom: var(--lq-tour-space-xs);
  }

  .rich-step-block-row[data-lodariq-spacing-after='normal'] {
    margin-bottom: var(--lq-tour-space-sm);
  }

  .rich-step-block-row[data-lodariq-spacing-after='relaxed'] {
    margin-bottom: var(--lq-tour-space-md);
  }

  .rich-step-block-row[data-lodariq-spacing-after-px] {
    margin-bottom: var(--lq-block-spacing-after);
  }

  .rich-step-content:focus-within {
    box-shadow: 0 0 0 2px var(--lq-color-blue) inset;
  }

  .rich-step-block-row {
    display: grid;
    min-width: 0;
    grid-template-columns: var(--lq-space-5) minmax(0, 1fr) var(--lq-space-6);
    align-items: start;
    gap: var(--lq-space-1);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    padding: var(--lq-space-1);
    transition: background 120ms ease, border-color 120ms ease;
  }

  .rich-step-block-stack > .inline-insert,
  .rich-step-content > .inline-insert {
    min-height: var(--lq-space-3);
    margin: 0;
  }

  .rich-step-block-stack > .inline-insert .inline-insert-trigger,
  .rich-step-content > .inline-insert .inline-insert-trigger {
    width: var(--lq-space-5);
    height: var(--lq-space-5);
    min-height: var(--lq-space-5);
  }

  .rich-step-block-row:hover,
  .rich-step-block-row.active,
  .rich-step-block-row.selected {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
  }

  .rich-step-block-row.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .rich-step-block-drag {
    display: inline-grid;
    width: var(--lq-space-5);
    height: var(--lq-control-sm);
    place-items: center;
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-subtle);
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
    width: var(--lq-space-6);
    min-width: var(--lq-space-6);
    min-height: var(--lq-control-sm);
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
    min-height: var(--lq-control-sm);
    color: var(--lq-color-ink);
    line-height: 1.5;
    outline: 0;
    padding: var(--lq-space-1) var(--lq-space-2);
  }

  .rich-step-block.heading {
    margin: 0 0 calc(var(--lq-tour-spacing) * 0.5);
    color: var(--lq-tour-text-color, var(--lq-color-ink));
    font-size: var(--lq-tour-base-font-size, var(--lq-font-xl));
    font-weight: var(--lq-tour-heading-font-weight, var(--lq-weight-bold));
    line-height: var(--lq-tour-heading-line-height, 1.3);
  }

  .rich-step-block.paragraph {
    margin: 0 0 var(--lq-tour-spacing, var(--lq-space-3));
    color: var(--lq-tour-muted-text-color, var(--lq-color-ink-soft));
    font-size: var(--lq-tour-small-font-size, var(--lq-font-sm));
    line-height: var(--lq-tour-body-line-height, 1.5);
  }

  .rich-step-toolbar-context {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-2);
  }

  .rich-step-toolbar button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .rich-step-highlight::after {
    background: #fff0a8;
  }

  .rich-step-link-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto 36px;
    align-items: center;
    gap: var(--lq-space-2);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-2);
  }

  .rich-step-link-editor input,
  .rich-step-link-editor button,
  .rich-step-plain-field,
  .rich-step-special-block input,
  .rich-step-url-field input {
    box-sizing: border-box;
    min-height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink);
    font: inherit;
    padding: var(--lq-space-2);
  }

  .rich-step-link-editor button {
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .rich-step-plain-field {
    width: 100%;
    min-height: 80px;
    resize: vertical;
  }

  .rich-step-special-block {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--lq-space-2);
    min-height: var(--lq-control-md);
  }

  .rich-step-special-block > span {
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: var(--lq-space-1) var(--lq-space-2);
    text-transform: uppercase;
  }

  .rich-step-special-block.button input {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: #ffffff;
    font-weight: var(--lq-weight-bold);
    text-align: center;
  }

  .rich-step-special-block.action {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .rich-step-action-stage {
    display: flex;
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
  }

  .rich-step-action-stage[data-lodariq-action-align='center'] {
    justify-content: center;
  }

  .rich-step-action-stage[data-lodariq-action-align='end'] {
    justify-content: flex-end;
  }

  .rich-step-action-preview {
    position: relative;
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    min-height: var(--lq-control-md);
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    border: var(--lq-tour-border-width, 1px) solid transparent;
    border-radius: var(--lq-tour-radius, var(--lq-radius-sm));
    background: var(--lq-action-fill, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    color: var(--lq-action-text, var(--lq-tour-primary-text, #ffffff));
    font-weight: var(--lq-tour-action-font-weight, var(--lq-weight-bold));
    padding: var(--lq-tour-space-xs, var(--lq-space-2)) var(--lq-tour-space-sm, var(--lq-space-3));
  }

  .rich-step-action-preview[data-lodariq-action-width='fill'],
  .rich-step-action-stage[data-lodariq-action-align='stretch'] .rich-step-action-preview {
    width: 100%;
  }

  .rich-step-action-preview[data-lodariq-action-width='custom'] {
    width: min(100%, var(--lq-action-width, 100%));
  }

  .storyboard-action-resize-handle {
    position: absolute;
    z-index: 6;
    top: 50%;
    width: 12px;
    min-width: 12px;
    height: 12px;
    min-height: 12px;
    border: 2px solid var(--lq-color-blue);
    border-radius: 999px;
    background: #ffffff;
    cursor: ew-resize;
    padding: 0;
    touch-action: none;
    transform: translateY(-50%);
  }

  .storyboard-action-resize-handle.start {
    left: -10px;
  }

  .storyboard-action-resize-handle.end {
    right: -10px;
  }

  .storyboard-action-resize-handle:hover,
  .storyboard-action-resize-handle:focus-visible {
    background: var(--lq-color-blue);
    box-shadow: 0 0 0 3px #ffffff;
  }

  .storyboard-action-resize-value {
    position: absolute;
    z-index: 5;
    bottom: -32px;
    left: 50%;
    min-width: 48px;
    height: 24px;
    border: 1px solid var(--lq-color-blue-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-blue);
    font-size: 10px;
    font-weight: 700;
    line-height: 22px;
    padding: 0 8px;
    text-align: center;
    transform: translateX(-50%);
  }

  .rich-step-action-preview[data-lodariq-action-size='compact'] {
    min-height: var(--lq-control-sm);
    padding-inline: var(--lq-tour-space-xs, var(--lq-space-2));
  }

  .rich-step-action-preview[data-lodariq-action-radius='square'] {
    border-radius: 0;
  }

  .rich-step-action-preview[data-lodariq-action-radius='soft'] {
    border-radius: var(--lq-tour-radius-sm, var(--lq-radius-md));
  }

  .rich-step-action-preview[data-lodariq-action-radius='round'] {
    border-radius: 999px;
  }

  .rich-step-action-preview[data-lodariq-action-variant='secondary'] {
    border-color: var(--lq-action-border, var(--lq-tour-border-color, var(--lq-color-border)));
    background: var(--lq-action-fill, var(--lq-tour-secondary-surface, var(--lq-color-panel-strong)));
    color: var(--lq-action-text, var(--lq-tour-secondary-text, var(--lq-color-ink)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='subtle'] {
    background: var(--lq-action-fill, color-mix(in srgb, var(--lq-tour-primary-surface) 12%, transparent));
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='outline'] {
    border-color: var(--lq-action-border, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='link'] {
    min-height: var(--lq-control-sm);
    border-color: transparent;
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    padding: 0;
    text-decoration: underline;
  }

  .rich-step-action-preview input,
  .rich-step-special-block.button .rich-step-action-preview input {
    width: auto;
    min-width: 80px;
    max-width: 100%;
    min-height: 0;
    field-sizing: content;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font-weight: var(--lq-weight-bold);
    padding: 0;
    text-align: inherit;
    -webkit-text-fill-color: currentColor;
  }

  .rich-step-divider-preview {
    height: 1px;
    align-self: center;
    background: var(--lq-color-border);
    margin: var(--lq-space-4) var(--lq-space-1);
  }

  .rich-step-inspector {
    margin: 0 var(--lq-space-2) var(--lq-space-2);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-3);
  }

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

  .tour-advanced-settings-row:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  @container authoring-frame (max-width: 620px) {
    .rich-step-inspector-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-height: 720px) {
    .panel-reference-workspace {
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .tour-step-editor-section,
    .tour-step-config-section {
      padding: var(--lq-space-2) var(--lq-space-4);
    }

    .tour-step-section-heading,
    .tour-config-heading {
      margin-bottom: var(--lq-space-2);
    }

    .rich-step-toolbar {
      min-height: var(--lq-control-md);
      padding-block: var(--lq-space-1);
    }

    .rich-step-content {
      min-height: 80px;
      padding-block: var(--lq-space-2);
    }

    .tour-position-group {
      margin-top: var(--lq-space-3);
    }

    .tour-position-options button {
      min-height: 48px;
      gap: var(--lq-space-1);
    }

    .tour-advance-options button {
      min-height: 64px;
      padding-block: var(--lq-space-2);
    }

    .tour-advanced-settings-row {
      min-height: var(--lq-control-lg);
      padding-block: var(--lq-space-2);
    }

    .panel-workspace-footer {
      padding-block: var(--lq-space-2);
    }
  }

  @keyframes lq-release-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tour-release-spinner,
    .panel-save-state-spinner {
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
      padding: 16px 12px 32px;
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
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .panel-workspace-footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      min-height: 0;
      padding: 8px 12px;
    }

    .panel-footer-state {
      gap: 12px;
    }

    .panel-release-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }

    .panel-release-actions button {
      min-height: 48px;
      flex-direction: column;
      gap: 4px;
      font-size: 10px;
      line-height: 1.1;
      padding: 4px;
      text-align: center;
    }

    .panel-save-exit,
    .panel-release-actions button {
      min-width: 0;
      min-height: 36px;
      padding-inline: 8px;
    }

    .panel-release-actions button.publish {
      min-width: 0;
    }

    .panel-release-actions button.review-recovery {
      min-width: 0;
    }
  }

  @container authoring-frame (max-width: 390px) {
    .panel-release-full {
      display: none;
    }

    .panel-release-short {
      display: inline;
    }

    .panel-release-actions button.publish {
      min-width: 0;
    }

    .rich-step-toolbar-divider,
    .rich-step-toolbar select:nth-child(2) {
      display: none;
    }

    .rich-step-block-row {
      grid-template-columns: 20px minmax(0, 1fr) 26px;
    }
  }

  /* Storyboard Studio: selected Editorial Air authoring composition. */
  html:has(.shell-panel),
  body:has(.shell-panel),
  .shell-panel,
  .shell-panel .panel-canvas,
  .shell-panel .document-page,
  .shell-panel .panel-reference-workspace {
    background: transparent;
  }

  .shell-panel .panel-reference-workspace {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .shell-panel .panel-reference-workspace > .panel-mode-shell {
    height: 100%;
    min-height: 0;
  }

  .panel-storyboard-workspace {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 0;
    grid-template-rows: 160px minmax(0, 1fr);
    overflow: hidden;
    background: transparent;
  }

  .tour-storyboard {
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    border-bottom: 1px solid var(--lq-color-border);
    background: #ffffff;
    scrollbar-width: thin;
  }

  .tour-storyboard-list {
    display: flex;
    min-width: max-content;
    height: 100%;
    align-items: stretch;
    gap: var(--lq-space-3);
    list-style: none;
    margin: 0;
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .tour-storyboard-step {
    position: relative;
    display: grid;
    width: 240px;
    min-width: 240px;
    grid-template-columns: minmax(0, 1fr);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-md);
    background: #ffffff;
  }

  .tour-storyboard-step.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-storyboard-step.repair:not(.active) {
    border-color: var(--lq-color-danger-border);
  }

  .tour-storyboard-select {
    display: grid;
    min-width: 0;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--lq-space-2);
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: var(--lq-space-3);
    text-align: left;
  }

  .tour-storyboard-heading {
    display: grid;
    min-width: 0;
    grid-template-columns: var(--lq-space-5) minmax(0, 1fr) var(--lq-space-4);
    align-items: center;
    gap: var(--lq-space-2);
  }

  .tour-storyboard-heading strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-storyboard-number {
    display: grid;
    width: var(--lq-space-5);
    height: var(--lq-space-5);
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .tour-storyboard-step.active .tour-storyboard-number {
    border-color: #0c211c;
    background: #0c211c;
    color: #ffffff;
  }

  .tour-storyboard-health {
    display: grid;
    width: var(--lq-space-4);
    height: var(--lq-space-4);
    place-items: center;
    color: var(--lq-color-primary);
  }

  .tour-storyboard-health.repair {
    color: var(--lq-color-danger);
  }

  .tour-storyboard-preview {
    display: grid;
    min-width: 0;
    min-height: var(--lq-space-7);
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--lq-space-3);
    overflow: hidden;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    padding: var(--lq-space-2) var(--lq-space-3);
  }

  .tour-storyboard-preview > span {
    display: -webkit-box;
    overflow: hidden;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .tour-storyboard-preview strong {
    max-width: 80px;
    overflow: hidden;
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-primary);
    color: #ffffff;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    padding: var(--lq-space-1) var(--lq-space-2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-storyboard-drag,
  .tour-storyboard-step .tour-step-action-trigger.ui-button {
    position: absolute;
    z-index: 2;
    top: var(--lq-space-2);
    width: var(--lq-space-5);
    min-width: var(--lq-space-5);
    min-height: var(--lq-space-5);
    border: 0;
    background: transparent;
    color: var(--lq-color-muted);
    opacity: 0;
    padding: 0;
  }

  .tour-storyboard-drag {
    left: var(--lq-space-1);
    cursor: grab;
  }

  .tour-storyboard-step .tour-step-action-trigger.ui-button {
    right: var(--lq-space-1);
  }

  .tour-storyboard-step:hover .tour-storyboard-drag,
  .tour-storyboard-step:hover .tour-step-action-trigger,
  .tour-storyboard-drag:focus-visible,
  .tour-storyboard-step .tour-step-action-trigger:focus-visible,
  .tour-storyboard-step .tour-step-action-trigger[aria-expanded='true'] {
    opacity: 1;
  }

  .tour-storyboard-add-item {
    display: grid;
    width: var(--lq-space-7);
    min-width: var(--lq-space-7);
    place-items: center;
  }

  .tour-storyboard-add {
    display: grid;
    width: var(--lq-control-lg);
    height: var(--lq-control-lg);
    place-items: center;
    border: 1px dashed var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
  }

  .tour-storyboard-add:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .storyboard-step-inspector,
  .shell-panel .storyboard-step-inspector {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .storyboard-canvas {
    position: relative;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
    border: 0;
    background: rgba(248, 247, 242, 0.92);
    backdrop-filter: blur(var(--lq-space-1));
    padding: 0;
  }

  .storyboard-canvas-heading {
    display: none;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-3);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.92);
    padding: 0 calc(var(--lq-space-7) * 2) 0 var(--lq-space-4);
  }

  .storyboard-canvas-heading > span:first-child {
    display: inline-flex;
    min-width: 0;
    align-items: baseline;
    gap: var(--lq-space-2);
  }

  .storyboard-canvas-heading small {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    text-transform: uppercase;
  }

  .storyboard-canvas-heading strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-canvas .rich-step-editor {
    position: relative;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(240px, 1fr) auto;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .storyboard-editor-stage {
    position: relative;
    display: grid;
    min-height: 0;
    align-items: start;
    justify-items: center;
    overflow: auto;
    padding: 72px 96px var(--lq-space-5) var(--lq-space-5);
  }

  .storyboard-editor-stage .rich-step-toolbar {
    position: absolute;
    z-index: 4;
    top: var(--storyboard-toolbar-top, 16px);
    left: var(--storyboard-toolbar-left, 50%);
    width: max-content;
    max-width: calc(100% - 160px);
    min-height: var(--lq-control-lg);
    flex-wrap: nowrap;
    overflow-x: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    transform: translateX(-50%);
  }

  .storyboard-editor-stage .rich-step-link-editor {
    position: absolute;
    z-index: 5;
    top: calc(var(--storyboard-toolbar-top, 16px) + 56px);
    left: var(--storyboard-toolbar-left, 50%);
    width: min(560px, calc(100% - 160px));
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    transform: translateX(-50%);
  }

  .storyboard-editor-stage .rich-step-popup-frame {
    position: relative;
    box-sizing: border-box;
    width: min(
      var(--storyboard-popup-width, var(--lq-tour-width, 520px)),
      calc(100% - 160px)
    );
    height: var(--storyboard-popup-height, auto);
    min-height: 240px;
    max-height: none;
    overflow: visible;
    resize: none;
    transform: translate3d(var(--storyboard-popup-x, 0), var(--storyboard-popup-y, 0), 0);
    will-change: transform;
    zoom: var(--storyboard-canvas-zoom, 1);
  }

  .storyboard-editor-stage .rich-step-content {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    min-height: 240px;
    overflow: visible;
    border: var(--lq-tour-border-width, 1px) solid var(--lq-tour-border-color, var(--lq-color-border));
    border-radius: var(--lq-tour-radius, var(--lq-radius-md));
    background: var(--lq-tour-surface, #ffffff);
    box-shadow: var(--lq-tour-elevation, 0 var(--lq-space-4) var(--lq-space-7) rgba(15, 36, 31, 0.12));
    color: var(--lq-tour-text-color, var(--lq-color-ink));
    font-family: var(--lq-tour-font-family, inherit);
    font-size: var(--lq-tour-base-font-size, var(--lq-font-sm));
    padding: var(--lq-tour-composition-padding, var(--lq-tour-spacing, var(--lq-space-4)));
  }

  .storyboard-editor-stage .rich-step-popup-frame[data-popup-height-custom='true'] {
    min-height: 0;
  }

  .storyboard-editor-stage
    .rich-step-popup-frame[data-popup-height-custom='true']
    > .rich-step-content {
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .storyboard-editor-stage .rich-step-popup-frame:focus-within > .rich-step-content,
  .storyboard-editor-stage
    .rich-step-popup-frame[data-popup-selected='true']
    > .rich-step-content {
    box-shadow:
      0 0 0 2px var(--lq-color-blue) inset,
      0 var(--lq-space-4) var(--lq-space-7) rgba(15, 36, 31, 0.12);
  }

  .storyboard-editor-stage .rich-step-block-row.active {
    border-style: dashed;
    border-color: var(--lq-color-blue);
    background: var(--lq-color-blue-soft);
  }

  .storyboard-editor-stage .rich-step-content .inline-insert {
    height: var(--lq-space-1);
    min-height: var(--lq-space-1);
    margin: 0;
  }

  .storyboard-editor-stage .rich-step-content .inline-insert-trigger {
    position: absolute;
  }

  .storyboard-editor-stage .rich-step-special-block.action {
    display: block;
  }

  .storyboard-editor-stage .rich-step-block-kind {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .storyboard-tool-dock {
    position: absolute;
    z-index: 6;
    top: 80px;
    right: var(--lq-space-4);
    display: grid;
    width: 80px;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    padding: var(--lq-space-1);
  }

  .storyboard-tool-dock button {
    display: grid;
    min-height: 64px;
    place-items: center;
    align-content: center;
    gap: var(--lq-space-1);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
  }

  .storyboard-tool-dock button:hover,
  .storyboard-tool-dock button.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .storyboard-property-tray {
    min-width: 0;
    max-height: 360px;
    overflow: auto;
    border-top: 1px solid var(--lq-color-border);
    background: #ffffff;
  }

  .storyboard-tray-header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-4);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    padding: var(--lq-space-2) var(--lq-space-4);
  }

  .storyboard-tray-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: var(--lq-space-3);
  }

  .storyboard-tray-title > strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-placement-summary {
    overflow: hidden;
    border-left: 1px solid var(--lq-color-border);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    padding-left: var(--lq-space-3);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-verification {
    color: #8b5c08;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  .storyboard-verification.ready {
    color: #167553;
  }

  .storyboard-verification.repair {
    color: #a33a3a;
  }

  .storyboard-advanced-toggle {
    display: inline-flex;
    min-height: var(--lq-control-sm);
    flex: 0 0 auto;
    align-items: center;
    gap: var(--lq-space-2);
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
  }

  .storyboard-advanced-toggle[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }

  .storyboard-quick-controls {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(240px, 2fr) minmax(160px, 1fr) minmax(160px, 1fr) minmax(240px, 2fr) minmax(240px, 2fr);
    gap: 0;
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .storyboard-control-group {
    min-width: 0;
    border: 0;
    border-right: 1px solid var(--lq-color-border-soft);
    margin: 0;
    padding: 0 var(--lq-space-3);
  }

  .storyboard-control-group:first-child {
    padding-left: 0;
  }

  .storyboard-control-group:last-child {
    border-right: 0;
    padding-right: 0;
  }

  .storyboard-control-group legend {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    margin-bottom: var(--lq-space-2);
  }

  .storyboard-control-group > div {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: var(--lq-space-2);
  }

  .storyboard-control-group button,
  .storyboard-custom-color {
    display: inline-flex;
    min-height: var(--lq-control-lg);
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
  }

  .storyboard-control-group button:hover,
  .storyboard-control-group button.selected,
  .storyboard-control-group button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .action-group button,
  .width-group button {
    flex: 1 1 80px;
    min-height: calc(var(--lq-control-lg) * 2);
    flex-direction: column;
  }

  .alignment-group button {
    width: var(--lq-control-lg);
    min-height: calc(var(--lq-control-lg) * 2);
    padding: 0;
  }

  .color-group button:not(.storyboard-theme-reset) {
    width: var(--lq-control-lg);
    padding: 0;
    border-radius: 999px;
    background: var(--storyboard-swatch, #ffffff);
    color: var(--storyboard-swatch-ink, #ffffff);
  }

  .color-group button.selected:not(.storyboard-theme-reset) {
    box-shadow: 0 0 0 2px #ffffff inset;
  }

  .storyboard-custom-color {
    position: relative;
    width: auto;
    min-width: var(--lq-control-lg);
    flex-direction: column;
    border: 0;
    color: var(--lq-color-primary);
    padding: 0;
  }

  .storyboard-custom-color span {
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  .storyboard-custom-color input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .storyboard-control-group .storyboard-theme-reset {
    min-height: var(--lq-control-sm);
    border: 0;
    color: var(--lq-color-primary);
  }

  .storyboard-spacing-control {
    display: grid !important;
    min-height: calc(var(--lq-control-lg) * 2);
    grid-template-columns: var(--lq-space-5) minmax(120px, 1fr) var(--lq-space-5);
    align-items: center;
    gap: var(--lq-space-2);
  }

  .storyboard-spacing-control input {
    width: 100%;
    accent-color: var(--lq-color-primary);
  }

  .storyboard-spacing-control output {
    grid-column: 1 / -1;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    text-align: center;
  }

  .storyboard-action-url {
    width: 100%;
    min-height: var(--lq-control-sm);
    margin-top: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink);
    padding: 0 var(--lq-space-3);
  }

  .storyboard-property-tray .tour-step-config-section,
  .storyboard-behavior-tray {
    margin: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .storyboard-property-tray .tour-position-group {
    margin-top: var(--lq-space-3);
  }

  .storyboard-advanced-panel {
    display: grid;
    gap: var(--lq-space-2);
    border-top: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .storyboard-advanced-panel .rich-step-inspector {
    margin: 0;
    background: #ffffff;
  }

  .panel-advanced-workspace .panel-advanced-editor {
    min-height: 0;
    overflow: auto;
  }

  @container authoring-frame (max-width: 1000px) {
    .tour-storyboard-step {
      width: 200px;
      min-width: 200px;
    }

    .storyboard-quick-controls {
      grid-template-columns: repeat(3, minmax(200px, 1fr));
      overflow-x: auto;
    }

    .storyboard-control-group {
      border-right: 0;
      border-bottom: 1px solid var(--lq-color-border-soft);
      padding: var(--lq-space-3);
    }
  }

  @container authoring-frame (max-width: 619px) {
    .panel-storyboard-workspace {
      grid-template-rows: 144px minmax(0, 1fr);
    }

    .tour-storyboard-list {
      padding: var(--lq-space-2) var(--lq-space-3);
    }

    .tour-storyboard-step {
      width: 200px;
      min-width: 200px;
    }

    .storyboard-canvas {
      grid-template-rows: minmax(0, 1fr);
    }

    .storyboard-canvas .rich-step-editor {
      position: relative;
      grid-template-rows: minmax(0, 1fr);
    }

    .storyboard-editor-stage {
      padding: 72px var(--lq-space-3) var(--lq-space-5);
    }

    .storyboard-editor-stage .rich-step-toolbar {
      max-width: calc(100% - var(--lq-space-5));
    }

    .storyboard-editor-stage .rich-step-popup-frame {
      width: min(var(--storyboard-popup-width, 100%), 100%);
      min-height: 200px;
    }

    .storyboard-editor-stage .rich-step-content {
      min-height: 200px;
    }

    .storyboard-tool-dock {
      top: auto;
      right: var(--lq-space-3);
      bottom: calc(52% + var(--lq-space-3));
      width: auto;
      grid-template-columns: repeat(3, var(--lq-control-lg));
    }

    .storyboard-tool-dock button {
      width: var(--lq-control-lg);
      min-height: var(--lq-control-lg);
    }

    .storyboard-tool-dock button span {
      display: none;
    }

    .storyboard-tray-title {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--lq-space-1);
    }

    .storyboard-placement-summary {
      border-left: 0;
      padding-left: 0;
    }

    .storyboard-quick-controls {
      grid-template-columns: minmax(240px, 1fr);
    }

    .storyboard-property-tray {
      position: absolute;
      z-index: 7;
      right: 0;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 52%;
      max-height: 52%;
      box-shadow: 0 calc(var(--lq-space-2) * -1) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    }

    .storyboard-control-group,
    .storyboard-control-group:first-child,
    .storyboard-control-group:last-child {
      padding: var(--lq-space-3) 0;
    }

    .storyboard-property-tray .tour-position-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 620px) and (max-height: 760px) {
    .panel-storyboard-workspace {
      grid-template-rows: 144px minmax(0, 1fr);
    }

    .storyboard-editor-stage {
      padding: 64px 80px var(--lq-space-4) var(--lq-space-5);
    }

    .storyboard-editor-stage .rich-step-toolbar {
      top: 64px;
    }

    .storyboard-editor-stage .rich-step-link-editor {
      top: 120px;
    }

    .storyboard-editor-stage .rich-step-popup-frame,
    .storyboard-editor-stage .rich-step-content {
      min-height: 192px;
      max-height: none;
    }

    .storyboard-editor-stage .rich-step-content {
      overflow: visible;
    }

    .storyboard-tool-dock {
      top: 64px;
      width: 72px;
    }

    .storyboard-tool-dock button {
      min-height: 48px;
    }

    .storyboard-tray-header {
      min-height: 48px;
      padding: var(--lq-space-1) var(--lq-space-4);
    }

    .storyboard-quick-controls {
      grid-template-columns: minmax(240px, 2fr) minmax(160px, 1fr) minmax(160px, 1fr) minmax(240px, 2fr) minmax(240px, 2fr);
      overflow-x: auto;
      padding: var(--lq-space-2) var(--lq-space-4);
    }

    .storyboard-control-group,
    .storyboard-control-group:first-child,
    .storyboard-control-group:last-child {
      border-right: 1px solid var(--lq-color-border-soft);
      border-bottom: 0;
      padding: 0 var(--lq-space-3);
    }

    .storyboard-control-group:first-child {
      padding-left: 0;
    }

    .storyboard-control-group:last-child {
      border-right: 0;
      padding-right: 0;
    }

    .action-group button,
    .width-group button,
    .alignment-group button,
    .storyboard-spacing-control {
      min-height: 64px;
    }
  }

  @media (min-width: 620px) and (max-height: 640px) {
    .storyboard-step-inspector,
    .shell-panel .storyboard-step-inspector {
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    .panel-storyboard-workspace {
      grid-template-rows: 112px minmax(0, 1fr);
    }

    .tour-storyboard-list {
      padding-block: var(--lq-space-2);
    }

    .tour-storyboard-step {
      height: 96px;
    }

    .tour-storyboard-preview {
      min-height: 48px;
    }

    .storyboard-canvas .rich-step-editor {
      grid-template-rows: minmax(160px, 1fr) minmax(112px, 144px);
      overflow: visible;
    }

    .storyboard-editor-stage {
      padding: 64px 80px var(--lq-space-2) var(--lq-space-5);
    }

    .storyboard-editor-stage .rich-step-toolbar {
      top: var(--lq-space-5);
    }

    .storyboard-editor-stage .rich-step-link-editor {
      top: 72px;
    }

    .storyboard-editor-stage .rich-step-popup-frame,
    .storyboard-editor-stage .rich-step-content {
      min-height: 144px;
      max-height: none;
    }

    .storyboard-editor-stage .rich-step-content {
      overflow: visible;
      padding: var(--lq-space-3);
    }

    .storyboard-tool-dock {
      top: var(--lq-space-5);
    }

    .storyboard-tool-dock button {
      min-height: 40px;
    }

    .storyboard-property-tray {
      max-height: 144px;
    }

    .storyboard-tray-header {
      min-height: 40px;
    }

    .storyboard-control-group legend {
      margin-bottom: var(--lq-space-1);
    }

    .action-group button,
    .width-group button,
    .alignment-group button,
    .storyboard-spacing-control {
      min-height: 48px;
    }
  }

  /* Focused contextual configuration: one selected item, one compact tray. */
  .panel-workspace-footer {
    min-height: 56px;
    padding: 8px 16px;
  }

  .panel-save-exit {
    min-width: 120px;
  }

  .panel-release-actions > button:not(.publish) {
    min-width: 120px;
  }

  .panel-release-actions button.publish {
    min-width: 152px;
  }

  .panel-release-actions > button.panel-more-actions-trigger {
    width: 36px;
    min-width: 36px;
    max-width: 36px;
    height: 36px;
    min-height: 36px;
    max-height: 36px;
    flex: 0 0 36px;
    padding: 0;
  }

  .ui-popover-content.panel-more-actions-popover {
    z-index: 80;
    width: 280px;
    overflow: hidden;
    border: 1px solid #d8dfe3;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 16px 32px rgba(15, 36, 31, 0.16);
    padding: 8px;
  }

  .panel-more-actions-menu {
    display: grid;
    gap: 4px;
  }

  .panel-more-actions-menu > button {
    display: grid;
    min-height: 56px;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #162033;
    cursor: pointer;
    padding: 8px 12px;
    text-align: left;
  }

  .panel-more-actions-menu > button:hover,
  .panel-more-actions-menu > button:focus-visible {
    background: #edf8f5;
    color: #006b58;
    outline: none;
  }

  .panel-more-actions-menu > button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .panel-more-actions-menu > button > span {
    display: grid;
    gap: 4px;
  }

  .panel-more-actions-menu strong {
    font-size: 12px;
    line-height: 1.2;
  }

  .panel-more-actions-menu small {
    color: #667085;
    font-size: 10px;
    line-height: 1.3;
  }

  .storyboard-canvas .rich-step-editor {
    grid-template-rows: minmax(180px, 1fr) auto;
  }

  .storyboard-canvas-zoom {
    position: absolute;
    z-index: 8;
    top: 12px;
    left: 12px;
    display: inline-flex;
    width: max-content;
    height: 36px;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 8px 20px rgba(15, 36, 31, 0.1);
  }

  .storyboard-popup-drag-handle {
    position: absolute;
    z-index: 3;
    top: 8px;
    left: 50%;
    display: grid;
    width: 28px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-tour-muted-text-color, var(--lq-color-subtle));
    cursor: grab;
    touch-action: none;
    transform: translateX(-50%);
    padding: 0;
  }

  .storyboard-popup-drag-handle:hover,
  .storyboard-popup-drag-handle:focus-visible {
    background: color-mix(in srgb, var(--lq-tour-surface, #ffffff) 80%, transparent);
    color: var(--lq-tour-primary-surface, var(--lq-color-primary));
    outline: 2px solid var(--lq-color-blue);
    outline-offset: 2px;
  }

  .storyboard-popup-drag-handle[data-dragging='true'] {
    cursor: grabbing;
  }

  .storyboard-popup-resize-handle {
    position: absolute;
    z-index: 6;
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border: 1px solid var(--lq-color-blue);
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(15, 36, 31, 0.14);
    color: var(--lq-color-blue);
    opacity: 0.4;
    padding: 0;
    touch-action: none;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .storyboard-popup-resize-handle[data-corner='north-west'] {
    top: -10px;
    left: -10px;
    cursor: nwse-resize;
  }

  .storyboard-popup-resize-handle[data-corner='north-east'] {
    top: -10px;
    right: -10px;
    cursor: nesw-resize;
  }

  .storyboard-popup-resize-handle[data-corner='south-west'] {
    bottom: -10px;
    left: -10px;
    cursor: nesw-resize;
  }

  .storyboard-popup-resize-handle[data-corner='south-east'] {
    right: -10px;
    bottom: -10px;
    cursor: nwse-resize;
  }

  .storyboard-popup-resize-handle[data-corner='north-west'] svg,
  .storyboard-popup-resize-handle[data-corner='south-east'] svg {
    transform: rotate(90deg);
  }

  .rich-step-popup-frame:hover > .storyboard-popup-resize-handle,
  .rich-step-popup-frame[data-popup-selected='true'] > .storyboard-popup-resize-handle,
  .rich-step-popup-frame[data-resizing='true'] > .storyboard-popup-resize-handle,
  .storyboard-popup-resize-handle:focus-visible {
    opacity: 1;
  }

  .storyboard-popup-resize-handle:hover,
  .storyboard-popup-resize-handle:focus-visible {
    outline: 2px solid var(--lq-color-blue);
    outline-offset: 2px;
    transform: scale(1.08);
  }

  .storyboard-popup-size {
    position: absolute;
    z-index: 7;
    bottom: -36px;
    left: 50%;
    min-height: 24px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 4px 12px rgba(15, 36, 31, 0.12);
    color: var(--lq-color-ink-soft);
    font-size: 11px;
    font-weight: 700;
    line-height: 24px;
    padding: 0 10px;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .storyboard-canvas-zoom button {
    display: grid;
    width: 36px;
    min-width: 36px;
    height: 36px;
    place-items: center;
    border: 0;
    border-right: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
  }

  .storyboard-canvas-zoom button:last-child {
    border-right: 0;
  }

  .storyboard-canvas-zoom button:hover:not(:disabled) {
    background: #edf8f5;
    color: var(--lq-color-primary);
  }

  .storyboard-canvas-zoom button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .storyboard-canvas-zoom .storyboard-canvas-zoom-value {
    width: 48px;
    min-width: 48px;
    color: var(--lq-color-ink);
    font-size: 11px;
    font-weight: 700;
  }

  .storyboard-editor-stage .rich-step-toolbar[data-positioned='false'] {
    visibility: hidden;
    pointer-events: none;
  }

  .storyboard-editor-stage .text-context-toolbar {
    top: var(--storyboard-toolbar-top, 16px);
    left: var(--storyboard-toolbar-left, 50%);
  }

  .storyboard-editor-stage .text-context-toolbar::after {
    position: absolute;
    bottom: -8px;
    left: 50%;
    width: 16px;
    height: 16px;
    border-right: 1px solid var(--lq-color-border);
    border-bottom: 1px solid var(--lq-color-border);
    background: #ffffff;
    content: '';
    transform: translateX(-50%) rotate(45deg);
  }

  .storyboard-editor-stage .action-context-toolbar {
    top: var(--storyboard-toolbar-top, 112px);
    left: var(--storyboard-toolbar-left, 50%);
    display: flex;
    width: max-content;
    max-width: calc(100% - 48px);
    min-height: 48px;
    align-items: stretch;
    overflow: visible;
    border-radius: 10px;
    background: #ffffff;
    padding: 4px;
    transform: translateX(-50%);
  }

  .storyboard-editor-stage .action-context-toolbar::after {
    position: absolute;
    bottom: -8px;
    left: 50%;
    width: 16px;
    height: 16px;
    border-right: 1px solid var(--lq-color-border);
    border-bottom: 1px solid var(--lq-color-border);
    background: #ffffff;
    content: '';
    transform: translateX(-50%) rotate(45deg);
  }

  .storyboard-editor-stage .action-context-toolbar button {
    position: relative;
    z-index: 1;
    display: inline-flex;
    width: auto;
    min-width: 40px;
    min-height: 40px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-left: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    color: var(--lq-color-ink-soft);
    font-size: 11px;
    font-weight: 600;
    padding: 0 12px;
    white-space: nowrap;
  }

  .storyboard-editor-stage .action-context-toolbar .action-context-identity {
    position: relative;
    z-index: 1;
    display: inline-flex;
    min-width: 0;
    min-height: 40px;
    flex: 0 1 auto;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    white-space: nowrap;
  }

  .storyboard-editor-stage .action-context-toolbar button:hover,
  .storyboard-editor-stage .action-context-toolbar button[aria-pressed='true'] {
    background: #f7faf9;
    color: var(--lq-color-primary);
  }

  .storyboard-editor-stage .action-context-toolbar .action-context-identity {
    max-width: 208px;
    justify-content: flex-start;
    border-radius: 8px 0 0 8px;
    color: var(--lq-color-blue);
  }

  .storyboard-editor-stage .action-context-toolbar .action-context-close,
  .storyboard-editor-stage .rich-step-toolbar .rich-step-toolbar-close {
    width: 36px;
    min-width: 36px;
    padding: 0;
  }

  .storyboard-editor-stage .action-context-toolbar .action-context-color {
    width: 20px;
    height: 20px;
    border: 1px solid rgba(15, 36, 31, 0.12);
    border-radius: 999px;
    background: var(--storyboard-action-color, #006b58);
    box-shadow: 0 0 0 2px #ffffff inset;
  }

  .action-quick-property-popover.ui-popover-content {
    z-index: 30;
    width: max-content;
    max-width: min(720px, calc(100vw - 24px));
    overflow: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 12px 32px rgba(15, 36, 31, 0.16);
    padding: 0;
  }

  .action-quick-property-popover .storyboard-tab-panel {
    min-height: 0;
    align-items: flex-end;
    gap: 16px;
    padding: 12px;
  }

  .action-quick-property-popover .storyboard-tab-panel.behavior {
    width: min(520px, calc(100vw - 24px));
    padding-right: 48px;
  }

  .action-quick-property-popover .storyboard-tab-panel.spacing {
    width: 320px;
  }

  .action-quick-property-popover .rich-step-choice-list button {
    height: 30px;
    min-height: 30px;
  }

  .action-context-identity span,
  .action-context-identity small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .action-context-identity small {
    color: currentColor;
    font-size: 11px;
    white-space: nowrap;
  }

  .storyboard-editor-stage .rich-step-block-row.active:has(.rich-step-special-block.action) {
    border-color: transparent;
    background: transparent;
  }

  .storyboard-editor-stage
    .rich-step-block-row.active:has(.rich-step-special-block.action)
    .rich-step-action-preview {
    outline: 2px solid var(--lq-color-blue);
    outline-offset: 4px;
    box-shadow: 0 0 0 8px rgba(54, 123, 245, 0.08);
  }

  .storyboard-property-tray {
    position: relative;
    z-index: 7;
    right: auto;
    bottom: auto;
    left: auto;
    width: min(1000px, calc(100% - 48px));
    height: auto;
    max-height: 320px;
    margin: 0 auto 12px;
    overflow: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 12px 32px rgba(15, 36, 31, 0.12);
  }

  .storyboard-tray-handle {
    position: absolute;
    z-index: 5;
    top: 8px;
    left: 50%;
    width: 48px;
    height: 4px;
    border-radius: 999px;
    background: #d8dfe3;
    transform: translateX(-50%);
  }

  .storyboard-tray-header {
    min-height: 64px;
    padding: 16px 16px 8px;
  }

  .storyboard-tray-title {
    display: grid;
    align-items: start;
    gap: 4px;
  }

  .storyboard-tray-identity,
  .storyboard-tray-context {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .storyboard-tray-identity strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-tray-identity small,
  .storyboard-tray-context {
    color: var(--lq-color-muted);
    font-size: 11px;
  }

  .storyboard-placement-summary {
    border-left: 0;
    padding-left: 0;
  }

  .storyboard-tray-close {
    display: grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
  }

  .storyboard-tray-close:hover {
    background: var(--lq-color-panel-strong);
  }

  .storyboard-property-tabs {
    display: flex;
    min-width: 0;
    min-height: 44px;
    align-items: stretch;
    overflow-x: auto;
    border-bottom: 1px solid var(--lq-color-border-soft);
    scrollbar-width: thin;
    padding: 0 12px;
  }

  .storyboard-property-tabs button {
    position: relative;
    display: inline-flex;
    min-width: max-content;
    min-height: 44px;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    padding: 0 12px;
  }

  .storyboard-property-tabs button::after {
    position: absolute;
    right: 8px;
    bottom: 0;
    left: 8px;
    height: 2px;
    border-radius: 999px;
    background: transparent;
    content: '';
  }

  .storyboard-property-tabs button:hover,
  .storyboard-property-tabs button.active {
    color: var(--lq-color-primary);
  }

  .storyboard-property-tabs button.active::after {
    background: var(--lq-color-primary);
  }

  .storyboard-property-tabs-more {
    flex: 0 0 auto;
    align-self: center;
    color: var(--lq-color-ink-soft);
    margin-inline: 8px;
  }

  .storyboard-tab-panel {
    display: flex;
    min-height: 96px;
    align-items: flex-start;
    gap: 20px;
    overflow-x: auto;
    padding: 12px 16px 16px;
    scrollbar-width: thin;
  }

  .storyboard-tab-panel.behavior {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(280px, 480px);
    align-items: start;
    overflow: visible;
  }

  .storyboard-tab-panel.behavior .rich-step-choice-list {
    flex-wrap: wrap;
  }

  .storyboard-tab-panel > .rich-step-choice-field,
  .storyboard-tab-panel > .rich-step-color-field,
  .storyboard-tab-panel > .rich-step-url-field {
    flex: 0 0 auto;
  }

  .storyboard-tab-panel .rich-step-choice-list {
    display: flex;
    grid-template-columns: none;
    flex-wrap: nowrap;
    gap: 8px;
  }

  .storyboard-tab-panel .rich-step-choice-list button {
    min-width: max-content;
    min-height: 30px;
    height: 30px;
    justify-content: center;
    border-radius: 8px;
    font-size: 11px;
    padding: 0 12px;
  }

  .storyboard-tab-panel.colors {
    align-items: stretch;
  }

  .storyboard-tab-panel.colors .rich-step-color-field {
    min-width: 248px;
  }

  .storyboard-tab-panel.spacing {
    display: grid;
    max-height: 208px;
    gap: 12px;
    overflow: auto;
  }

  .storyboard-spacing-slider {
    min-width: 240px;
    border: 0;
    margin: 0;
    padding: 0;
  }

  .storyboard-spacing-slider legend {
    color: var(--lq-color-muted);
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 8px;
  }

  .storyboard-spacing-slider > div {
    display: grid;
    min-height: 36px;
    grid-template-columns: 16px minmax(120px, 1fr) 16px 40px;
    align-items: center;
    gap: 8px;
  }

  .storyboard-spacing-slider input {
    width: 100%;
    accent-color: var(--lq-color-primary);
  }

  .storyboard-spacing-slider output {
    color: var(--lq-color-ink-soft);
    font-size: 11px;
    font-weight: 700;
    text-align: right;
  }

  .storyboard-empty-property {
    color: var(--lq-color-muted);
    font-size: 12px;
    margin: 0;
    padding: 16px;
  }

  @container authoring-frame (max-width: 760px) {
    .panel-workspace-footer {
      display: flex;
      min-height: 56px;
      gap: 8px;
      padding: 8px;
    }

    .panel-footer-state {
      gap: 8px;
    }

    .panel-save-status {
      width: 16px;
      max-width: 16px;
      grid-template-columns: 16px;
    }

    .panel-save-status-copy {
      display: none;
    }

    .panel-save-exit {
      min-width: 104px;
      padding-inline: 8px;
    }

    .panel-release-actions {
      display: inline-flex;
      grid-template-columns: none;
      gap: 4px;
    }

    .panel-release-actions > button:not(.publish),
    .panel-release-actions button.publish {
      width: 40px;
      min-width: 40px;
      font-size: 0;
      padding: 0;
    }

    .panel-release-actions > button.panel-more-actions-trigger {
      width: 36px;
      min-width: 36px;
      max-width: 36px;
      height: 36px;
      min-height: 36px;
      max-height: 36px;
      flex: 0 0 36px;
      padding: 0;
    }

    .panel-release-actions .panel-release-full,
    .panel-release-actions .panel-release-short {
      display: none;
    }

    .storyboard-canvas .rich-step-editor {
      position: relative;
      grid-template-rows: minmax(0, 1fr);
      overflow: hidden;
    }

    .storyboard-editor-stage {
      padding-inline: 12px;
    }

    .storyboard-editor-stage .action-context-toolbar {
      max-width: calc(100% - 16px);
      overflow-x: auto;
      overflow-y: visible;
      scrollbar-width: thin;
    }

    .storyboard-editor-stage .action-context-toolbar button {
      min-width: 36px;
      min-height: 36px;
      gap: 4px;
      padding: 0 8px;
    }

    .storyboard-editor-stage .action-context-toolbar button:not(.action-context-identity) span {
      display: none;
    }

    .storyboard-editor-stage .action-context-toolbar .action-context-identity {
      max-width: 152px;
    }

    .action-context-identity small {
      display: none;
    }

    .storyboard-property-tray {
      position: absolute;
      z-index: 7;
      right: 8px;
      bottom: 8px;
      left: 8px;
      width: auto;
      height: auto;
      max-height: 224px;
      margin: 0;
    }

    .storyboard-tray-header {
      min-height: 56px;
      padding: 16px 12px 8px;
    }

    .storyboard-tray-context {
      max-width: 240px;
    }

    .storyboard-verification {
      display: none;
    }

    .storyboard-property-tabs {
      padding-inline: 4px;
    }

    .storyboard-property-tabs button {
      padding-inline: 8px;
    }

    .storyboard-property-tabs button span {
      display: none;
    }

    .storyboard-tab-panel {
      min-height: 104px;
      gap: 16px;
      padding: 8px 12px 12px;
    }

    .storyboard-tab-panel.spacing {
      max-height: 120px;
    }
  }

  @media (max-height: 640px) {
    .storyboard-editor-stage .action-context-toolbar {
      display: flex;
    }

    .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray) {
      grid-template-rows: minmax(88px, 1fr) minmax(0, 184px);
    }

    @container authoring-frame (max-width: 760px) {
      .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray) {
        grid-template-rows: minmax(0, 1fr);
      }
    }

    .storyboard-property-tray {
      max-height: 184px;
      margin-bottom: 8px;
    }

    .storyboard-tray-header {
      min-height: 56px;
    }

    .storyboard-tab-panel {
      min-height: 80px;
    }
  }
`;
