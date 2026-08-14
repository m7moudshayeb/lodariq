/** Responsive adaptations shared by approved authoring modes. */
export const AUTHORING_AGREED_RESPONSIVE_CSS = `
  @container authoring-frame (max-width: 760px) {
    .storyboard-property-tray[data-tool-mode='placement'] > .placement-section,
    .storyboard-property-tray[data-tool-mode='popup'] > .step-presentation,
    .popup-appearance-workspace,
    .popup-appearance-controls,
    .transition-path-list {
      grid-template-columns: minmax(0, 1fr);
    }

    .storyboard-property-tray[data-tool-mode='placement'] {
      height: min(52%, 320px);
      max-height: min(52%, 320px);
    }

    .storyboard-property-tray > .rich-step-inspector.compact,
    .storyboard-property-tray
      > .rich-step-inspector.compact[data-has-font-size='false'] {
      grid-template-columns: minmax(0, 1fr);
    }

    .storyboard-property-tray
      > .rich-step-inspector.compact
      > .rich-step-font-size-field
      .ui-number-combobox {
      max-width: 100%;
    }

    .storyboard-property-tray[data-tool-mode='content']
      > .storyboard-tab-panel.behavior:has([data-property-id='button.destination']) {
      grid-template-columns: minmax(0, 1fr);
    }

    .storyboard-property-tray[data-tool-mode='content']
      > .storyboard-tab-panel.behavior:has([data-property-id='button.destination'])
      .storyboard-property-control[data-property-id='button.action'] {
      grid-column: 1;
    }

    .storyboard-property-tray[data-tool-mode='placement'] .tour-config-heading {
      grid-column: 1;
    }

    .tour-review-main:not([data-active-section='none']) {
      grid-template-columns: minmax(0, 1fr);
    }

    .tour-review-main:not([data-active-section='none']) > .tour-review-list {
      display: none;
    }

    .sequence-summary-strip {
      grid-template-columns: minmax(0, 1fr);
    }

    .sequence-summary-arrow {
      justify-self: center;
      transform: rotate(90deg);
    }

    .transition-condition {
      grid-template-columns: minmax(0, 1fr) var(--lq-control-sm);
    }

    .transition-condition-fields {
      grid-column: 1;
      grid-template-columns: minmax(0, 1fr);
    }

    .transition-condition-remove {
      grid-column: 2;
      grid-row: 1;
    }

    .tour-flow-workbench,
    .tour-flow-workbench[data-mode='branch'] {
      right: 8px;
      bottom: 8px;
      width: calc(100% - 16px);
      transform: none;
    }

    .tour-flow-workbench > .transition-editor .transition-path-list,
    .tour-flow-workbench .sequence-details-grid,
    .tour-flow-workbench .sequence-timeout-fields,
    .tour-flow-simulation-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .tour-flow-settings {
      top: 8px;
      right: 8px;
      width: calc(100% - 16px);
    }

    .tour-flow-settings > nav {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
