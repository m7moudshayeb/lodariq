export const LOCAL_AUTHORING_FRAME_CSS = `
  :root {
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #20242c;
    background: #eef2f6;
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
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
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }

  .shell {
    min-height: 100vh;
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
    padding: 0 0 28px;
    background: #eef2f6;
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
    border-bottom: 1px solid rgba(226, 229, 234, 0.82);
    background: rgba(255, 255, 255, 0.94);
    padding: 8px 28px;
    backdrop-filter: blur(16px);
  }

  .brand,
  .brand-copy,
  .canvas,
  .document-page,
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
    color: #2f3541;
  }

  .eyebrow {
    margin: 0;
    color: #69707d;
    font-size: 11px;
    font-weight: 780;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    color: #171a21;
    letter-spacing: 0;
  }

  h1 {
    font-size: 14px;
    line-height: 1.18;
  }

  h2 {
    font-size: 34px;
    font-weight: 760;
    line-height: 1.08;
  }

  p {
    margin: 0;
  }

  #status {
    max-width: 58ch;
    overflow-wrap: anywhere;
    color: #69707d;
    font-size: 12px;
    line-height: 1.35;
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
    border: 1px solid #dce2ea;
    border-radius: 7px;
    background: #fff;
    color: #252a34;
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
    border-color: #c2c9d3;
    background: #f8fafc;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }

  .ui-button:active {
    transform: translateY(1px);
  }

  .ui-button-primary {
    border-color: #126451;
    background: #126451;
    color: #fff;
  }

  .ui-button-primary:hover {
    border-color: #0e5244;
    background: #0e5244;
  }

  .ui-button-ghost {
    border-color: transparent;
    background: transparent;
    color: #515967;
  }

  .ui-button-danger {
    border-color: #f1c5c0;
    color: #b42318;
  }

  .ui-button-danger:hover {
    border-color: #e9a9a1;
    background: #fff6f5;
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
  }

  .document-page {
    position: relative;
    display: grid;
    gap: 0;
    width: min(100%, 900px);
    margin: 0 auto;
    border-right: 1px solid rgba(213, 221, 232, 0.88);
    border-left: 1px solid rgba(213, 221, 232, 0.88);
    border-radius: 0;
    background: #fff;
    box-shadow: none;
  }

  .canvas-actionbar {
    position: sticky;
    top: 48px;
    z-index: 19;
    align-self: start;
    justify-self: end;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 14px 34px -48px 0;
    border: 1px solid rgba(220, 226, 234, 0.92);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    padding: 4px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(12px);
  }

  .canvas-icon-action {
    width: 32px;
    min-width: 32px;
    min-height: 32px;
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
    gap: 14px;
    padding: 58px 44px 22px;
  }

  .document-hero-copy {
    display: grid;
    gap: 8px;
  }

  .document-stats span {
    border: 1px solid #e0e5ec;
    border-radius: 999px;
    background: #f7f8fa;
    color: #535c6a;
    font-size: 12px;
    font-weight: 650;
    line-height: 1.35;
    padding: 4px 9px;
  }

  .insert-bar {
    display: grid;
    gap: 10px;
    border-top: 1px solid rgba(238, 241, 245, 0.95);
    border-bottom: 1px solid rgba(238, 241, 245, 0.95);
    background: #f8fafc;
    padding: 18px 44px;
  }

  .composer-line {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
  }

  .composer-plus {
    display: inline-grid;
    width: 24px;
    height: 40px;
    place-items: center;
    color: #8d97a6;
  }

  .slash {
    position: relative;
  }

  .slash input {
    width: 100%;
    min-height: 42px;
    border: 1px solid #d2dae6;
    border-radius: 10px;
    background: #fff;
    color: #252a34;
    font-size: 15px;
    padding: 8px 12px;
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.8) inset;
  }

  .slash input:hover,
  .slash input:focus {
    border-color: #aebbc9;
    background: #fff;
  }

  .slash input::placeholder,
  .block-input::placeholder {
    color: #9aa2af;
  }

  .menu {
    position: absolute;
    z-index: 30;
    gap: 5px;
    border: 1px solid #d7dee8;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 20px 48px rgba(15, 23, 42, 0.16);
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
    border-bottom: 1px solid #eef1f5;
    color: #69707d;
    font-size: 11px;
    font-weight: 780;
    padding: 4px 5px 8px;
    text-transform: uppercase;
  }

  .command-menu kbd {
    border: 1px solid #dde3ec;
    border-radius: 5px;
    background: #f7f8fa;
    color: #69707d;
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

  .command-item:hover {
    border-color: #e2e8f0;
    background: #f8fafc;
  }

  .command-item-primary {
    border-color: #cfe0f4;
    background: #f8fbff;
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
    background: #eef2f7;
    color: #425066;
  }

  .command-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .command-copy strong {
    overflow: hidden;
    color: #252a34;
    font-size: 13px;
    font-weight: 720;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-copy small,
  .command-description {
    overflow: hidden;
    color: #747d8c;
    font-size: 12px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .command-description {
    justify-self: end;
  }

  .command-empty {
    color: #747d8c;
    font-size: 13px;
    padding: 12px 8px;
  }

  .quick-insert {
    display: grid;
    grid-template-columns: 1.25fr repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding-left: 32px;
    opacity: 1;
  }

  .quick-insert .ui-button {
    width: 100%;
    min-height: 38px;
  }

  .add-step {
    border-color: #126451;
    background: #126451;
    color: #fff;
  }

  .document {
    display: grid;
    margin-bottom: 0;
  }

  .block {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 10px;
    border-top: 1px solid transparent;
    background: transparent;
    padding: 18px 44px;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .block::before {
    position: absolute;
    top: 16px;
    bottom: 16px;
    left: 24px;
    width: 2px;
    border-radius: 999px;
    background: transparent;
    content: "";
    transition: background 120ms ease;
  }

  .block:hover,
  .block:focus-within {
    border-color: rgba(238, 241, 245, 0.95);
    background: #fcfdff;
  }

  .block:hover::before,
  .block:focus-within::before {
    background: #cbd5e1;
  }

  .block.incomplete::before {
    background: #d9902f;
  }

  .block.invalid::before {
    background: #dc2626;
  }

  .block-side-rail {
    position: relative;
    z-index: 1;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 6px;
    padding-top: 1px;
  }

  .block-rail-moves {
    display: grid;
    gap: 3px;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .block:hover .block-rail-moves,
  .block:focus-within .block-rail-moves {
    opacity: 1;
  }

  .rail-button {
    width: 24px;
    min-width: 24px;
    min-height: 24px;
    border-color: transparent;
    border-radius: 6px;
    background: transparent;
    color: #8a93a3;
    padding: 0;
  }

  .rail-button:hover {
    border-color: #d8dde5;
    background: #fff;
    color: #252a34;
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
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    opacity: 0.82;
  }

  .block-collapse {
    display: inline-grid;
    width: 24px;
    min-width: 24px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #8a93a3;
    cursor: pointer;
    padding: 0;
  }

  .block-collapse:hover {
    background: #eef2f7;
    color: #252a34;
  }

  .block-grip {
    display: inline-grid;
    width: 24px;
    height: 24px;
    place-items: center;
    color: #a9b1bf;
    cursor: grab;
  }

  .block-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .block-kicker,
  .field-label {
    color: #69707d;
    font-size: 12px;
    font-weight: 720;
  }

  .block-title strong {
    min-width: 0;
    overflow: hidden;
    color: #394150;
    font-size: 13px;
    font-weight: 720;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .block-title-preview {
    min-width: 0;
    overflow: hidden;
    color: #8a93a3;
    font-size: 12px;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .block[data-block-type="heading"] .block-title strong,
  .block[data-block-type="paragraph"] .block-title strong,
  .block[data-block-type="button"] .block-title strong {
    color: #8a93a3;
    font-weight: 560;
  }

  .block-body,
  .step-fields {
    display: grid;
    gap: 8px;
  }

  .block-section,
  .block-footer {
    margin-left: 24px;
  }

  .block-section {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    align-items: start;
    gap: 16px;
    border-top: 1px solid #eef1f5;
    padding: 12px 0;
  }

  .block-section-content {
    border-top: 0;
    padding-top: 8px;
  }

  .block-section-target {
    padding-bottom: 8px;
  }

  .block-section-label {
    color: #8a93a3;
    font-size: 11px;
    font-weight: 780;
    line-height: 28px;
    text-transform: uppercase;
  }

  .block-footer {
    margin-left: 114px;
  }

  .content-field {
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
    border-radius: 6px;
    background: transparent;
    color: #20242c;
    font-family: inherit;
    font-size: 16px;
    line-height: 1.45;
    padding: 5px 6px;
  }

  .block-input:hover,
  .block-input:focus {
    background: #f7f8fa;
  }

  .block-input[aria-label="Heading"] {
    color: #171a21;
    font-size: 23px;
    font-weight: 740;
    line-height: 1.18;
  }

  textarea.block-input {
    min-height: 46px;
    resize: none;
  }

  .block-input[aria-label="Button label"] {
    width: min(100%, 280px);
    min-height: 38px;
    border: 1px solid #126451;
    border-radius: 7px;
    background: #126451;
    color: #fff;
    font-weight: 720;
    text-align: center;
  }

  .block-input[aria-label="Button label"]:hover,
  .block-input[aria-label="Button label"]:focus {
    background: #0e5244;
  }

  .button-action-control {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    align-items: center;
    gap: 8px;
    border: 1px solid #edf0f4;
    border-radius: 999px;
    background: #fbfcfd;
    padding: 3px;
  }

  .property-label {
    flex: 0 0 auto;
    color: #69707d;
    font-size: 12px;
    font-weight: 720;
    padding-left: 8px;
  }

  .button-action-control .ui-select-trigger {
    width: min(100%, 210px);
    min-height: 28px;
    border-color: transparent;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  }

  .ui-select-trigger {
    display: inline-flex;
    width: 100%;
    min-height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid #dce2ea;
    border-radius: 7px;
    background: #fff;
    color: #252a34;
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
    border: 1px solid #d9dee8;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16);
  }

  .ui-select-viewport {
    padding: 4px;
  }

  .ui-select-item {
    position: relative;
    display: flex;
    min-height: 32px;
    align-items: center;
    border-radius: 6px;
    color: #252a34;
    cursor: default;
    font-size: 13px;
    line-height: 1.2;
    padding: 6px 28px 6px 9px;
    user-select: none;
  }

  .ui-select-item[data-highlighted] {
    background: #edf7f4;
    color: #123f38;
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
  .target-health-chip,
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
    border: 1px solid #ccebdd;
    background: #f1fbf6;
    color: #087443;
    font-weight: 740;
    text-transform: lowercase;
  }

  .badge.incomplete,
  .target-health-chip.missing,
  .target-health-chip.ambiguous {
    border-color: #f5d99b;
    background: #fff7e6;
    color: #8a520c;
  }

  .badge.invalid {
    border-color: #f1b8b8;
    background: #fff1f1;
    color: #b91c1c;
  }

  .target-row {
    gap: 7px;
    padding-top: 1px;
  }

  .target-row button[data-action="target-pick"] {
    border-color: #d8e6f6;
    background: #f8fbff;
    color: #1d4ed8;
  }

  .target-empty {
    color: #747d8c;
    padding-left: 0;
  }

  .target-control {
    display: inline-flex;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    gap: 5px;
  }

  .target-chip {
    display: inline-block;
    max-width: 220px;
    border: 1px solid #c9dfff;
    background: #eef6ff;
    color: #1d4ed8;
    font-weight: 680;
  }

  .target-menu-trigger {
    width: 28px;
    min-width: 28px;
    min-height: 28px;
    border-color: #d8e6f6;
    border-radius: 999px;
    background: #fff;
    color: #1d4ed8;
    padding: 0;
  }

  .target-popover {
    width: min(318px, calc(100vw - 44px));
    max-height: min(430px, var(--radix-popover-content-available-height, 430px));
    padding: 0;
    overflow: hidden;
  }

  .target-menu {
    display: grid;
    gap: 7px;
    max-height: min(418px, calc(var(--radix-popover-content-available-height, 430px) - 12px));
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
    border: 3px solid #fff;
    border-radius: 999px;
    background: #c8d0dc;
  }

  .target-menu::-webkit-scrollbar-thumb:hover {
    background: #aeb8c6;
  }

  .target-menu-header {
    display: grid;
    gap: 2px;
    border: 1px solid #edf1f6;
    border-radius: 8px;
    background: #f8fafc;
    padding: 9px 10px;
  }

  .target-menu-header span {
    color: #69707d;
    font-size: 11px;
    font-weight: 760;
    text-transform: uppercase;
  }

  .target-menu-header strong {
    overflow: hidden;
    color: #252a34;
    font-size: 14px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ui-popover-content {
    z-index: 30;
    gap: 6px;
    border: 1px solid #d9dee8;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.16);
  }

  .ui-popover-content[data-state="closed"] {
    display: none;
  }

  .ui-popover-arrow {
    fill: #fff;
    stroke: #d9dee8;
    stroke-width: 1px;
  }

  .target-menu-actions {
    display: grid;
    gap: 2px;
  }

  .target-menu-action {
    justify-content: flex-start;
    min-width: 0;
    width: 100%;
    border-color: transparent;
    background: transparent;
    padding: 8px;
    text-align: left;
  }

  .target-menu-action:hover {
    border-color: #e5ebf3;
    background: #f8fafc;
    box-shadow: none;
  }

  .target-menu-action-featured {
    border-color: #d8e6f6;
    background: #f7fbff;
  }

  .target-menu-action-danger {
    margin-top: 2px;
    border-color: transparent;
    color: #b42318;
  }

  .target-menu-action-danger:hover {
    border-color: #f2c9c4;
    background: #fff6f5;
  }

  .target-menu-action .ui-button-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: #eef2f7;
    color: #334155;
  }

  .target-menu-action-featured .ui-button-icon {
    background: #e6f1ff;
    color: #1d4ed8;
  }

  .target-menu-action-danger .ui-button-icon {
    background: #fff0ef;
    color: #b42318;
  }

  .target-action-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .target-action-copy strong,
  .target-action-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .target-action-copy strong {
    color: #252a34;
    font-size: 13px;
    line-height: 1.2;
  }

  .target-action-copy small {
    color: #6b7280;
    font-size: 11px;
    font-weight: 560;
    line-height: 1.25;
    white-space: normal;
  }

  .target-menu-action-danger .target-action-copy strong {
    color: #b42318;
  }

  .target-health,
  .target-advanced {
    margin: 0;
    overflow-wrap: anywhere;
    color: #535c6a;
    font-size: 12px;
    line-height: 1.4;
  }

  .target-health {
    border: 1px solid #e5ebf3;
    border-radius: 8px;
    background: #fafbfc;
    padding: 9px 10px;
  }

  .target-health.found {
    border-color: #ccebdd;
    background: #f1fbf6;
    color: #087443;
  }

  .target-health.missing,
  .target-health.ambiguous {
    border-color: #f5d99b;
    background: #fff8ea;
    color: #8a520c;
  }

  .target-health strong {
    display: block;
    margin-bottom: 2px;
    color: #252a34;
  }

  .target-health-chip,
  .property-chip {
    background: #f0f3f7;
    color: #334155;
  }

  .target-health-chip.found {
    background: #e6f7ef;
    color: #067647;
  }

  .block-footer {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 0;
    opacity: 0.72;
    transition: opacity 120ms ease;
  }

  .block:hover .block-footer,
  .block:focus-within .block-footer {
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
    color: #69707d;
    padding: 4px 7px;
  }

  .block-tools .ui-button:hover {
    border-color: #d8dde5;
    background: #f8fafc;
    color: #252a34;
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
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    border: 1px solid #dfe6ef;
    border-radius: 10px;
    background: #fff;
    padding: 14px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }

  .preview-copy strong,
  .panel-header strong,
  summary {
    color: #252a34;
    font-size: 13px;
    font-weight: 740;
  }

  .preview-copy span {
    color: #747d8c;
    font-size: 12px;
  }

  .preview-state {
    min-width: 104px;
    border: 1px solid #dce2ea;
    border-radius: 999px;
    background: #f8fafc;
    color: #535c6a;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 10px;
    text-align: center;
    white-space: nowrap;
  }

  .compiled-output {
    grid-column: 1 / -1;
  }

  .inspector {
    display: grid;
    gap: 10px;
    align-content: start;
  }

  .document-utilities {
    border-top: 1px solid rgba(238, 241, 245, 0.95);
    background: #f8fafc;
    padding: 18px 44px 28px;
  }

  .utilities-drawer {
    min-width: 0;
    border: 1px solid #e1e7ef;
    border-radius: 8px;
    background: #fff;
    padding: 0;
  }

  .utilities-drawer > summary {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    list-style: none;
    padding: 11px 14px;
  }

  .utilities-drawer > summary::-webkit-details-marker {
    display: none;
  }

  .utilities-drawer > summary span {
    color: #252a34;
    font-size: 13px;
    font-weight: 760;
  }

  .utilities-drawer > summary small {
    overflow: hidden;
    color: #747d8c;
    font-size: 12px;
    font-weight: 620;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .utilities-drawer .ui-tabs {
    border-top: 1px solid #eef1f5;
    background: #fbfcfd;
    padding: 12px;
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

  textarea[aria-label="Document JSON"] {
    width: 100%;
    min-height: 190px;
    border: 1px solid #d8dde5;
    border-radius: 7px;
    background: #fbfcfd;
    color: #252a34;
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
    border: 1px solid #e5e9ef;
    border-radius: 8px;
    background: #f7f8fa;
    color: #252a34;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.45;
    padding: 10px;
  }

  .ui-tabs {
    display: grid;
    gap: 8px;
  }

  .ui-tabs-list {
    display: inline-flex;
    min-width: 0;
    gap: 4px;
    border: 1px solid #d8dde5;
    border-radius: 8px;
    background: #f7f8fa;
    padding: 3px;
  }

  .ui-tabs-trigger {
    min-height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #535c6a;
    padding: 5px 9px;
  }

  .ui-tabs-trigger[data-state="active"] {
    background: #fff;
    color: #252a34;
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

    .workspace {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }

    .document-page {
      margin-left: auto;
      margin-right: auto;
    }

  }

  @media (max-width: 680px) {
    .topbar {
      padding-left: 18px;
      padding-right: 18px;
    }

    .canvas-actionbar {
      top: 55px;
      margin-right: 14px;
    }

    h2 {
      font-size: 28px;
    }

    .document-hero,
    .insert-bar,
    .block,
    .document-utilities {
      padding-left: 18px;
      padding-right: 18px;
    }

    .block {
      grid-template-columns: 26px minmax(0, 1fr);
    }

    .block::before {
      left: 10px;
    }

    .block-header {
      grid-template-columns: 22px minmax(0, 1fr);
    }

    .block-header .badge {
      grid-column: 2;
      justify-self: start;
    }

    .block-section,
    .block-footer {
      margin-left: 22px;
    }

    .block-section {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .block-section-label {
      line-height: 1.2;
    }

    .quick-insert {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding-left: 32px;
    }

    .preview-workbench,
    .preview-utility {
      grid-template-columns: 1fr;
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
`;
