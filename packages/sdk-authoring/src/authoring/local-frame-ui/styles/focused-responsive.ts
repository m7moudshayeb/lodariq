/** Responsive adaptations for focused authoring modes. */
export const AUTHORING_FOCUSED_RESPONSIVE_CSS = `
  @container authoring-frame (max-width: 920px) {
    .storyboard-tray-identity strong {
      max-width: 44vw;
    }

    .storyboard-tab-panel.popup-layout[data-section='appearance'] {
      grid-template-columns: repeat(2, minmax(220px, 1fr));
    }
  }

  @container authoring-frame (max-width: 700px) {
    .storyboard-tray-identity strong {
      max-width: 52vw;
    }

    .storyboard-tray-context {
      display: none;
    }

    .storyboard-tab-panel.behavior
      .storyboard-property-control[data-property-id='button.action']
      .ui-segmented {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .storyboard-property-tray > .storyboard-tab-panel.behavior {
      grid-template-columns: minmax(0, 1fr);
    }

    .transition-editor {
      border-top: 1px solid var(--lq-color-border-soft);
      border-left: 0;
      padding-top: 10px;
      padding-left: 0;
    }

    .storyboard-tab-panel.popup-layout,
    .storyboard-tab-panel.popup-layout[data-section='appearance'],
    .storyboard-tab-panel.step-presentation {
      grid-template-columns: minmax(0, 1fr);
    }

    .storyboard-property-tray > .rich-step-inspector.compact {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container authoring-frame (max-width: 800px) {
    .tour-storyboard-utilities .experience-language-picker {
      display: none;
    }

    .tour-flow-heading small,
    .tour-flow-toolbar button:not(.tour-flow-return) {
      display: none;
    }

    .tour-batch-card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container authoring-frame (max-width: 620px) {
    .tour-storyboard {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .tour-storyboard-step {
      min-width: 104px;
    }

    .tour-storyboard-utilities {
      padding-inline: 8px;
    }

    .tour-flow-map-toggle {
      width: 36px;
      overflow: hidden;
      padding: 0 10px;
    }

    .tour-flow-map-toggle svg {
      flex: 0 0 auto;
    }

    .tour-step-batch-actions .ui-button-label {
      display: none;
    }

    .tour-batch-card-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .tour-batch-workspace-heading {
      align-items: start;
      flex-direction: column;
    }

    .tour-flow-toolbar-actions .tour-flow-tool-group,
    .tour-flow-toolbar-actions > button:not(.tour-flow-return) {
      display: none;
    }
  }
`;
