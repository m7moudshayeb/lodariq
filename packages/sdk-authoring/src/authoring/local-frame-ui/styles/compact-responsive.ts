export const AUTHORING_COMPACT_RESPONSIVE_CSS = `
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

    .storyboard-canvas
      .rich-step-editor:has(.storyboard-property-tray)
      .storyboard-editor-stage {
      padding-top: 12px;
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
