export const AUTHORING_STORYBOARD_PROPERTY_CSS = `
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
      grid-template-rows: auto minmax(0, 1fr) auto;
    }

    .storyboard-editor-stage {
      padding: 72px var(--lq-space-3) var(--lq-space-5);
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
      bottom: var(--lq-space-3);
      width: auto;
      grid-template-columns: repeat(2, var(--lq-control-lg));
    }

    .rich-step-editor:has(.storyboard-property-tray) .storyboard-tool-dock {
      bottom: calc(52% + var(--lq-space-3));
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
      grid-template-rows: auto minmax(160px, 1fr) minmax(112px, 144px);
      overflow: visible;
    }

    .storyboard-editor-stage {
      padding: 64px 80px var(--lq-space-2) var(--lq-space-5);
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
    font-size: var(--lq-font-sm);
    line-height: 1.2;
  }

  .panel-more-actions-menu small {
    color: #667085;
    font-size: var(--lq-font-xs);
    line-height: 1.3;
  }

  .storyboard-canvas .rich-step-editor {
    grid-template-rows: auto minmax(180px, 1fr) auto;
  }

  .storyboard-canvas-zoom {
    position: relative;
    z-index: 8;
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
    z-index: 7;
    top: 8px;
    right: 8px;
    display: grid;
    width: 28px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-popup-muted-text, var(--lq-tour-muted-text-color, var(--lq-color-subtle)));
    cursor: grab;
    touch-action: none;
    padding: 0;
  }

  .storyboard-popup-drag-handle:hover,
  .storyboard-popup-drag-handle:focus-visible {
    background: color-mix(
      in srgb,
      var(--lq-popup-surface, var(--lq-tour-surface, #ffffff)) 80%,
      transparent
    );
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
`;
