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
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
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
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
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
    font-size: var(--lq-font-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-tray-identity small,
  .storyboard-tray-context {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
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
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
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
