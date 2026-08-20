/** Approved target placement inspector layout. */
export const AUTHORING_AGREED_PLACEMENT_CSS = `
  /* Placement stays a compact inspector under the canvas, sized to its controls. */
  .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray[data-tool-mode='placement']) {
    grid-template-rows: auto minmax(0, 1fr) minmax(168px, auto);
  }

  .storyboard-property-tray[data-tool-mode='placement'] {
    position: relative;
    inset: auto;
    width: 100%;
    height: auto;
    max-height: min(280px, 50vh);
    margin: 0;
    overflow: auto;
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: none;
  }

  .storyboard-property-tray[data-tool-mode='placement'] > .storyboard-tray-handle,
  .storyboard-property-tray[data-tool-mode='placement'] > .storyboard-tray-header {
    display: none;
  }

  .storyboard-property-tray[data-tool-mode='placement'] {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .storyboard-property-tray[data-tool-mode='placement'] > .storyboard-tray-close {
    z-index: 2;
    grid-column: 2;
    grid-row: 1;
    align-self: start;
    margin: 8px 8px 0 0;
  }

  .storyboard-property-tray[data-tool-mode='placement'] > .placement-section {
    display: grid;
    grid-column: 1 / -1;
    grid-row: 1;
    height: auto;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    align-items: start;
    gap: 8px 16px;
    padding: 10px 44px 12px 12px;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-config-heading {
    grid-column: 1;
    margin: 0;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-live-target,
  .storyboard-property-tray[data-tool-mode='placement'] .tour-placement-card,
  .storyboard-property-tray[data-tool-mode='placement'] .tour-position-group {
    min-width: 0;
    align-self: start;
    margin: 0;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-position-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-position-options button {
    min-height: 52px;
  }

  @container authoring-frame (min-width: 720px) {
    .storyboard-property-tray[data-tool-mode='placement'] > .placement-section {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.2fr);
    }

    .storyboard-property-tray[data-tool-mode='placement'] .tour-config-heading {
      grid-column: 1 / -1;
    }

    .storyboard-property-tray[data-tool-mode='placement'] .tour-position-options {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
`;
