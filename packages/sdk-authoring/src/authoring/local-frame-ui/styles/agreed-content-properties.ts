/** Approved freeform rich content and sequence property forms. */
export const AUTHORING_AGREED_CONTENT_PROPERTIES_CSS = `
  .storyboard-property-tray > .rich-content-editor {
    display: grid;
    min-width: 0;
    min-height: 190px;
    container-type: inline-size;
    grid-template-rows: auto minmax(132px, 1fr);
    overflow: visible;
    border-top: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
  }

  .rich-content-toolbar {
    position: relative;
    z-index: 4;
    display: flex;
    min-width: 0;
    min-height: 48px;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #fbfcfe;
    padding: 8px 16px;
  }

  .rich-content-toolbar > button,
  .rich-content-toolbar-popover > button,
  .rich-content-color-control {
    display: inline-grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
  }

  .rich-content-toolbar > button:hover,
  .rich-content-toolbar-popover > button:hover,
  .rich-content-color-control:hover,
  .rich-content-toolbar button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-content-toolbar button:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .rich-content-block-style-trigger {
    display: inline-flex !important;
    width: auto !important;
    min-width: 132px;
    justify-content: flex-start;
    gap: 7px;
    border-color: var(--lq-color-border) !important;
    background: #ffffff !important;
    padding: 0 9px;
  }

  .rich-content-block-style-trigger > span {
    flex: 1;
    text-align: left;
    font-size: 11px;
    font-weight: 650;
  }

  .rich-content-toolbar-divider {
    width: 1px;
    height: 22px;
    flex: 0 0 1px;
    margin: 0 3px;
    background: var(--lq-color-border);
  }

  .rich-content-toolbar-spacer {
    min-width: 8px;
    flex: 1 1 auto;
  }

  .rich-content-select-trigger {
    display: inline-flex;
    min-width: 70px;
    height: 32px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: #ffffff;
    color: var(--lq-color-ink);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    padding: 0 7px;
  }

  .rich-content-select-trigger:hover,
  .rich-content-select-trigger[data-state='open'] {
    border-color: var(--lq-color-primary-border);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--lq-color-primary) 10%, transparent);
  }

  .rich-content-select-trigger:focus-visible {
    border-color: var(--lq-color-primary);
    outline: 2px solid color-mix(in srgb, var(--lq-color-primary) 18%, transparent);
    outline-offset: 1px;
  }

  .rich-content-font-size-trigger {
    width: 70px;
    flex: 0 0 70px;
  }

  .rich-content-color-control {
    position: relative;
  }

  .rich-content-color-control input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
    opacity: 0;
  }

  .rich-content-toolbar-popover {
    position: relative;
    display: inline-flex;
  }

  .rich-content-floating-layer {
    z-index: 340;
    box-sizing: border-box;
    width: max-content;
    max-width: min(var(--rich-content-floating-available-width, calc(100vw - 16px)), calc(100vw - 16px));
    max-height: var(--rich-content-floating-available-height, calc(100vh - 16px));
  }

  .rich-content-menu,
  .rich-content-emoji-picker,
  .rich-content-picker-loading {
    box-sizing: border-box;
    max-width: 100%;
    max-height: var(--rich-content-floating-available-height, calc(100vh - 16px));
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: #ffffff;
    box-shadow: 0 14px 38px rgb(23 32 51 / 16%);
  }

  .rich-content-picker-loading {
    display: inline-flex;
    min-width: 120px;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    color: var(--lq-color-muted);
    font-size: 11px;
    padding: 10px;
  }

  .rich-content-menu {
    display: grid;
    min-width: 190px;
    gap: 5px;
    overflow: auto;
    padding: 7px;
  }

  .rich-content-select-content {
    z-index: 360;
    min-width: var(--radix-select-trigger-width);
    max-width: min(var(--radix-select-content-available-width), calc(100vw - 16px));
    max-height: min(260px, var(--radix-select-content-available-height));
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: 9px;
    background: #ffffff;
    box-shadow: 0 14px 38px rgb(23 32 51 / 16%);
    color: var(--lq-color-ink);
  }

  .rich-content-select-viewport {
    padding: 4px;
  }

  .rich-content-select-item {
    position: relative;
    display: flex;
    min-height: 32px;
    align-items: center;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    outline: none;
    padding: 0 28px 0 9px;
    user-select: none;
  }

  .rich-content-select-item[data-highlighted] {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-content-select-item[data-state='checked'] {
    font-weight: 700;
  }

  .rich-content-select-indicator {
    position: absolute;
    right: 8px;
    display: inline-grid;
    place-items: center;
    color: var(--lq-color-primary);
  }

  .rich-content-menu button,
  .rich-content-upload-button {
    display: flex;
    min-height: 34px;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    padding: 0 9px;
  }

  .rich-content-menu button:hover,
  .rich-content-upload-button:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-content-link-menu {
    width: 276px;
  }

  .rich-content-link-menu label,
  .rich-content-animation-menu label {
    display: grid;
    gap: 5px;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 650;
  }

  .rich-content-link-menu input,
  .rich-content-animation-menu input,
  .rich-content-icon-menu > input,
  .rich-content-emoji-picker > input {
    box-sizing: border-box;
    width: 100%;
    height: 34px;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: #ffffff;
    color: var(--lq-color-ink);
    font: inherit;
    font-size: 11px;
    outline: none;
    padding: 0 9px;
  }

  .rich-content-animation-menu {
    width: 242px;
  }

  .rich-content-animation-select {
    width: 100%;
  }

  .rich-content-animation-number {
    display: flex;
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: #ffffff;
    color: var(--lq-color-muted);
    padding-right: 9px;
  }

  .rich-content-animation-number input {
    border: 0;
  }

  .rich-content-icon-menu {
    width: 310px;
  }

  .rich-content-icon-grid {
    display: grid;
    max-height: 214px;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    overflow-y: auto;
  }

  .rich-content-icon-color-control {
    display: flex;
    min-height: 34px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 650;
    padding: 0 9px;
  }

  .rich-content-icon-color-control input {
    width: 34px;
    height: 26px;
    border: 1px solid var(--lq-color-border);
    border-radius: 6px;
    background: #ffffff;
    cursor: pointer;
    padding: 2px;
  }

  .rich-content-icon-grid > button {
    width: 36px;
    height: 36px;
    justify-content: center;
    padding: 0;
  }

  .rich-content-media-menu {
    width: 226px;
    overflow: hidden;
    padding-top: 6px;
  }

  .rich-content-media-menu > strong {
    color: var(--lq-color-ink);
    font-size: 11px;
    padding: 4px 9px;
  }

  .rich-content-media-error {
    margin: 0;
    border-radius: 6px;
    background: #fff3f1;
    color: #9f2f25;
    font-size: 10px;
    line-height: 1.35;
    padding: 7px 9px;
  }

  .rich-content-library-option {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    cursor: pointer;
    margin: 2px 4px 6px;
    padding: 8px;
  }

  .rich-content-library-option > input {
    width: 14px;
    height: 14px;
    margin: 1px 0 0;
    accent-color: var(--lq-color-primary);
  }

  .rich-content-library-option > span {
    display: grid;
    gap: 2px;
  }

  .rich-content-library-option strong {
    font-size: 11px;
    line-height: 1.25;
  }

  .rich-content-library-option small {
    color: var(--lq-color-muted);
    font-size: 9px;
    line-height: 1.35;
  }

  .rich-content-upload-button {
    position: relative;
  }

  .rich-content-upload-button input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .rich-content-emoji-picker {
    display: grid;
    width: min(330px, var(--rich-content-floating-available-width, 330px));
    height: min(310px, var(--rich-content-floating-available-height, 310px));
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    padding: 8px;
  }

  .rich-content-emoji-picker > input {
    margin-bottom: 7px;
  }

  .rich-content-emoji-picker [role='grid'],
  .rich-content-emoji-picker [role='listbox'] {
    overflow-y: auto;
  }

  .rich-content-emoji-picker button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-size: 19px;
  }

  .rich-content-emoji-picker button:hover {
    background: var(--lq-color-primary-soft);
  }

  .rich-content-canvas-shell {
    position: relative;
    min-width: 0;
    min-height: 132px;
    max-height: 290px;
    overflow-y: auto;
    background: #ffffff;
    padding: 15px 20px 18px;
  }

  .rich-content-canvas {
    position: relative;
    z-index: 1;
    min-height: 112px;
    color: var(--lq-color-ink);
    font-size: 14px;
    line-height: 1.55;
    outline: none;
  }

  .rich-content-canvas ::selection {
    background: color-mix(in srgb, var(--lq-color-primary) 24%, #ffffff);
    color: var(--lq-color-ink);
    text-shadow: 0 1px 1px rgb(12 33 28 / 22%);
  }

  .rich-content-placeholder {
    position: absolute;
    top: 15px;
    left: 20px;
    color: var(--lq-color-muted);
    font-size: 14px;
    pointer-events: none;
  }

  .rich-content-paragraph,
  .rich-content-heading,
  .rich-content-list,
  .rich-content-callout,
  .rich-content-media-node,
  .rich-content-button-node {
    margin: 0 0 8px;
  }

  .rich-content-heading {
    color: var(--lq-color-ink);
    font-size: 20px;
    font-weight: 720;
    line-height: 1.25;
  }

  .rich-content-list {
    padding-left: 24px;
  }

  .rich-content-callout {
    border-left: 3px solid var(--lq-color-primary);
    border-radius: 0 8px 8px 0;
    background: var(--lq-color-primary-soft);
    padding: 9px 11px;
  }

  .rich-content-link {
    color: var(--lq-color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .rich-content-button-preview-shell {
    display: grid;
    width: fit-content;
    max-width: 100%;
    gap: 8px;
    outline: none;
  }

  .rich-content-button-preview-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .rich-content-button-preview {
    min-height: 36px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: var(--lq-color-primary);
    color: #ffffff;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 0 16px;
  }

  .rich-content-button-preview[data-variant='secondary'] {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-content-button-preview[data-variant='subtle'],
  .rich-content-button-preview[data-variant='link'] {
    background: transparent;
    color: var(--lq-color-primary);
  }

  .rich-content-button-preview[data-variant='outline'] {
    border-color: var(--lq-color-primary);
    background: transparent;
    color: var(--lq-color-primary);
  }

  .rich-content-button-config-trigger {
    display: inline-grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: #ffffff;
    color: var(--lq-color-muted);
    cursor: pointer;
    opacity: 0;
  }

  .rich-content-button-preview-shell:hover .rich-content-button-config-trigger,
  .rich-content-button-preview-shell:focus-within .rich-content-button-config-trigger,
  .rich-content-button-preview-shell[data-config-open='true'] .rich-content-button-config-trigger {
    opacity: 1;
  }

  .rich-content-button-config {
    display: grid;
    width: min(320px, calc(100vw - 64px));
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: var(--lq-color-panel);
    box-shadow: 0 10px 28px rgb(23 32 51 / 10%);
    padding: 10px;
  }

  .rich-content-button-config label {
    display: grid;
    min-width: 0;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 650;
  }

  .rich-content-button-config input {
    box-sizing: border-box;
    width: 100%;
    height: 32px;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: #ffffff;
    color: var(--lq-color-ink);
    font: inherit;
    outline: none;
    padding: 0 8px;
  }

  .rich-content-button-config > small {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 5px;
    color: var(--lq-color-muted);
    font-size: 9px;
  }

  .rich-content-bold { font-weight: 700; }
  .rich-content-italic { font-style: italic; }
  .rich-content-underline { text-decoration: underline; }

  .rich-content-canvas [style*='--lq-inline-motion: fade'] {
    animation: lq-rich-inline-fade var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) both;
  }

  .rich-content-canvas [style*='--lq-inline-motion: lift'] {
    animation: lq-rich-inline-lift var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) both;
  }

  .rich-content-canvas [style*='--lq-inline-motion: scale'] {
    animation: lq-rich-inline-scale var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) both;
  }

  .rich-content-canvas [style*='--lq-inline-motion: pulse'] {
    animation: lq-rich-inline-pulse var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) 2;
  }

  @keyframes lq-rich-inline-fade { from { opacity: 0; } }
  @keyframes lq-rich-inline-lift { from { opacity: 0; transform: translateY(8px); } }
  @keyframes lq-rich-inline-scale { from { opacity: 0; transform: scale(0.97); } }
  @keyframes lq-rich-inline-pulse { 50% { transform: scale(1.03); } }

  @media (prefers-reduced-motion: reduce) {
    .rich-content-canvas [style*='--lq-inline-motion'] {
      animation: none;
    }
  }

  .rich-content-icon-node {
    display: inline-flex;
    margin: 2px 4px 8px 0;
    vertical-align: middle;
  }

  .rich-content-icon-preview {
    display: inline-grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 9px;
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .rich-content-icon-node[data-rich-selected='true'] .rich-content-icon-preview,
  .rich-content-button-node[data-rich-selected='true'] .rich-content-button-preview,
  .rich-content-divider-node[data-rich-selected='true'] .rich-content-divider,
  .rich-content-icon-preview:focus-visible,
  .rich-content-divider:focus-visible {
    background: color-mix(in srgb, var(--lq-color-primary) 12%, #ffffff);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lq-color-primary) 20%, transparent);
  }

  .rich-content-media-node[data-rich-selected='true'] .rich-content-media-frame::after {
    border-color: var(--lq-color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lq-color-primary) 18%, transparent);
  }

  .rich-content-media-preview {
    position: relative;
    display: grid;
    width: var(--rich-media-width, 100%);
    box-sizing: border-box;
    gap: 6px;
    margin: 2px 0 6px;
    outline: none;
  }

  .rich-content-media-frame {
    position: relative;
    width: 100%;
    height: var(--rich-media-height, auto);
    min-height: 0;
  }

  .rich-content-media-preview[data-uploading='true'] .rich-content-media-frame {
    overflow: hidden;
    border-radius: 9px;
    background: var(--lq-color-panel);
  }

  .rich-content-media-upload-progress {
    position: absolute;
    z-index: 5;
    top: 0;
    right: 0;
    left: 0;
    height: 3px;
    overflow: hidden;
    background: color-mix(in srgb, var(--lq-color-primary) 18%, transparent);
  }

  .rich-content-media-upload-progress > span {
    display: block;
    height: 100%;
    background: var(--lq-color-primary);
    box-shadow: 0 0 8px color-mix(in srgb, var(--lq-color-primary) 55%, transparent);
    transition: width 140ms ease;
  }

  .rich-content-media-frame::after {
    position: absolute;
    inset: -2px;
    border: 1px dashed transparent;
    border-radius: 10px;
    content: '';
    pointer-events: none;
  }

  .rich-content-media-preview:hover .rich-content-media-frame::after,
  .rich-content-media-preview:focus-visible .rich-content-media-frame::after,
  .rich-content-media-preview[data-resizing] .rich-content-media-frame::after {
    border-color: var(--lq-color-primary);
  }

  .rich-content-media-preview[data-resizing] {
    user-select: none;
  }

  .rich-content-media-preview[data-resizing='e'],
  .rich-content-media-preview[data-resizing='w'] {
    cursor: ew-resize;
  }

  .rich-content-media-preview[data-resizing='n'],
  .rich-content-media-preview[data-resizing='s'] {
    cursor: ns-resize;
  }

  .rich-content-media-preview[data-resizing='ne'],
  .rich-content-media-preview[data-resizing='sw'] {
    cursor: nesw-resize;
  }

  .rich-content-media-preview[data-resizing='nw'],
  .rich-content-media-preview[data-resizing='se'] {
    cursor: nwse-resize;
  }

  .rich-content-media-preview[data-resizing] video {
    pointer-events: none;
  }

  .rich-content-media-preview img,
  .rich-content-media-preview video {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 9px;
    background: var(--lq-color-panel);
    object-fit: var(--rich-media-fit, contain);
  }

  .rich-content-media-preview:not([data-fixed-height]) img,
  .rich-content-media-preview:not([data-fixed-height]) video {
    height: auto;
    max-height: 220px;
  }

  .rich-content-media-unavailable small {
    color: var(--lq-color-muted);
    font-size: 10px;
  }

  .rich-content-media-resize-edge {
    position: absolute;
    z-index: 3;
    touch-action: none;
  }

  .rich-content-media-resize-edge[data-edge='n'],
  .rich-content-media-resize-edge[data-edge='s'] {
    right: 10px;
    left: 10px;
    height: 10px;
    cursor: ns-resize;
  }

  .rich-content-media-resize-edge[data-edge='n'] { top: -5px; }
  .rich-content-media-resize-edge[data-edge='s'] { bottom: -5px; }

  .rich-content-media-resize-edge[data-edge='e'],
  .rich-content-media-resize-edge[data-edge='w'] {
    top: 10px;
    bottom: 10px;
    width: 10px;
    cursor: ew-resize;
  }

  .rich-content-media-resize-edge[data-edge='e'] { right: -5px; }
  .rich-content-media-resize-edge[data-edge='w'] { left: -5px; }

  .rich-content-media-resize-edge:is([data-edge='ne'], [data-edge='se'], [data-edge='sw'], [data-edge='nw']) {
    width: 14px;
    height: 14px;
  }

  .rich-content-media-resize-edge[data-edge='ne'] {
    top: -7px;
    right: -7px;
    cursor: nesw-resize;
  }

  .rich-content-media-resize-edge[data-edge='se'] {
    right: -7px;
    bottom: -7px;
    cursor: nwse-resize;
  }

  .rich-content-media-resize-edge[data-edge='sw'] {
    bottom: -7px;
    left: -7px;
    cursor: nesw-resize;
  }

  .rich-content-media-resize-edge[data-edge='nw'] {
    top: -7px;
    left: -7px;
    cursor: nwse-resize;
  }

  .rich-content-media-fit-control {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: rgb(255 255 255 / 94%);
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 650;
    opacity: 0;
    padding: 4px 6px;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  .rich-content-media-preview:hover .rich-content-media-fit-control,
  .rich-content-media-preview:focus-within .rich-content-media-fit-control,
  .rich-content-media-preview[data-resizing] .rich-content-media-fit-control {
    opacity: 1;
    pointer-events: auto;
  }

  .rich-content-media-fit-select {
    max-width: 142px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font: inherit;
    outline: none;
    padding: 0 4px;
  }

  .rich-content-media-unavailable {
    display: grid;
    min-height: 88px;
    place-content: center;
    gap: 3px;
    border: 1px dashed var(--lq-color-border);
    border-radius: 9px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    text-align: center;
  }

  .rich-content-divider {
    margin: 12px 0;
    border: 0;
    border-top: 1px solid var(--lq-color-border);
    outline: none;
  }

  .rich-content-spacing-control {
    display: inline-flex;
    height: 32px;
    align-items: center;
    gap: 7px;
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 650;
  }

  .rich-content-spacing-control > span:last-child {
    display: inline-flex;
    height: 30px;
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: #ffffff;
    color: var(--lq-color-muted);
    padding-right: 7px;
  }

  .rich-content-spacing-control input {
    width: 42px;
    height: 28px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font: inherit;
    outline: none;
    padding-left: 7px;
  }

  .rich-step-rendered-content {
    min-width: 0;
    cursor: text;
  }

  .rich-step-list-preview {
    margin: 0;
    padding-left: 20px;
  }

  .sequence-property-editor {
    gap: 10px;
    border-color: var(--lq-color-border-soft);
    background: #ffffff;
    padding: 12px;
  }

  .sequence-summary-header > span {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .sequence-summary-header small {
    color: var(--lq-color-ink);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .sequence-summary-header strong {
    color: var(--lq-color-muted);
    font-size: 9px;
    font-weight: 500;
  }

  .sequence-summary-strip {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr) auto minmax(150px, 1fr);
    align-items: center;
    gap: 8px;
  }

  .sequence-summary-card {
    display: grid;
    min-width: 0;
    min-height: 56px;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 9px;
    background: #ffffff;
    padding: 8px 10px;
  }

  .sequence-summary-card > svg {
    color: var(--lq-color-primary);
  }

  .sequence-summary-card > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .sequence-summary-card strong {
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-summary-card small {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-summary-arrow {
    color: #98a2b3;
  }

  .sequence-details {
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 8px;
  }

  .sequence-details > summary {
    width: max-content;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
  }

  .sequence-details-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 12px;
  }

  .sequence-editor-actions {
    display: flex;
    justify-content: flex-end;
  }

  .sequence-guided-card,
  .sequence-recovery-card {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: var(--lq-space-2);
    margin: 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    padding: var(--lq-space-3);
  }

  .sequence-guided-card > legend,
  .sequence-recovery-card > legend {
    display: inline-flex;
    align-items: center;
    gap: var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding-inline: var(--lq-space-1);
  }

  .sequence-guided-card > legend > span {
    display: inline-grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-2xs);
  }

  .sequence-guided-card > .ui-field,
  .sequence-guided-card > .ui-select-trigger,
  .sequence-recovery-card .ui-field,
  .sequence-recovery-card .ui-select-trigger,
  .sequence-wait-row > .ui-field,
  .sequence-wait-row > .ui-select-trigger {
    width: 100%;
    min-width: 0;
  }

  .sequence-guided-card .ui-input,
  .sequence-guided-card .ui-select-trigger,
  .sequence-recovery-card .ui-input,
  .sequence-recovery-card .ui-select-trigger {
    min-height: var(--lq-control-sm);
    font-size: var(--lq-font-xs);
  }

  .sequence-wait-row {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-2);
  }

  .sequence-wait-row > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .sequence-wait-row > .ui-button {
    min-height: var(--lq-control-sm);
    justify-self: end;
  }

  .sequence-recovery-card,
  .sequence-details-grid > .sequence-recovery-card,
  .sequence-details-grid > .ui-button {
    grid-column: 1 / -1;
  }

  .sequence-timeout-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-3);
  }

  .sequence-native-field {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .sequence-native-field > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
  }

`;
