/** Approved target placement inspector layout. */
export const AUTHORING_AGREED_PLACEMENT_CSS = `
  /* Placement is a compact inspector under the canvas, not a second page. */
  .storyboard-canvas .rich-step-editor:has(.storyboard-property-tray[data-tool-mode='placement']) {
    grid-template-rows: minmax(136px, 1fr) 188px;
  }

  .storyboard-property-tray[data-tool-mode='placement'] {
    width: 100%;
    height: 188px;
    max-height: 188px;
    margin: 0;
    overflow: hidden;
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: none;
  }

  .storyboard-property-tray[data-tool-mode='placement'] > .storyboard-tray-handle,
  .storyboard-property-tray[data-tool-mode='placement'] > .storyboard-tray-header {
    display: none;
  }

  .storyboard-property-tray[data-tool-mode='placement'] > .placement-section {
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-columns: minmax(200px, 0.75fr) minmax(360px, 1.25fr);
    grid-template-rows: auto minmax(0, 1fr);
    align-items: start;
    gap: 8px 20px;
    padding: 12px 16px;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-config-heading {
    grid-column: 1 / -1;
    margin: 0;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-live-target,
  .storyboard-property-tray[data-tool-mode='placement'] .tour-placement-card {
    align-self: start;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-position-group {
    align-self: start;
    margin: 0;
  }

  .storyboard-property-tray[data-tool-mode='placement'] .tour-position-options button {
    min-height: 68px;
  }

`;
