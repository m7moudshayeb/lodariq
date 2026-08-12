export const AUTHORING_POPUP_TRANSFORM_CSS = `

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
`;
