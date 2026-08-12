export const AUTHORING_STORYBOARD_CANVAS_CSS = `

  .storyboard-canvas {
    position: relative;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
    border: 0;
    background: rgba(248, 247, 242, 0.92);
    backdrop-filter: blur(var(--lq-space-1));
    padding: 0;
  }

  .storyboard-canvas-heading {
    display: none;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-3);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.92);
    padding: 0 calc(var(--lq-space-7) * 2) 0 var(--lq-space-4);
  }

  .storyboard-canvas-heading > span:first-child {
    display: inline-flex;
    min-width: 0;
    align-items: baseline;
    gap: var(--lq-space-2);
  }

  .storyboard-canvas-heading small {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    text-transform: uppercase;
  }

  .storyboard-canvas-heading strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-canvas .rich-step-editor {
    position: relative;
    display: grid;
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(240px, 1fr) auto;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .storyboard-editor-stage {
    position: relative;
    display: grid;
    min-height: 0;
    align-items: start;
    justify-items: center;
    overflow: auto;
    padding: 72px 96px var(--lq-space-5) var(--lq-space-5);
  }

  .storyboard-editor-stage .rich-step-toolbar {
    position: absolute;
    z-index: 4;
    top: var(--storyboard-toolbar-top, 16px);
    left: var(--storyboard-toolbar-left, 50%);
    width: max-content;
    max-width: calc(100% - 160px);
    min-height: var(--lq-control-lg);
    flex-wrap: nowrap;
    overflow-x: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    transform: translateX(-50%);
  }

  .storyboard-editor-stage .rich-step-link-editor {
    position: absolute;
    z-index: 5;
    top: calc(var(--storyboard-toolbar-top, 16px) + 56px);
    left: var(--storyboard-toolbar-left, 50%);
    width: min(560px, calc(100% - 160px));
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    transform: translateX(-50%);
  }

  .storyboard-editor-stage .rich-step-popup-frame {
    position: relative;
    box-sizing: border-box;
    width: min(
      var(--storyboard-popup-width, var(--lq-tour-width, 520px)),
      calc(100% - 160px)
    );
    height: var(--storyboard-popup-height, auto);
    min-height: 240px;
    max-height: none;
    overflow: visible;
    resize: none;
    transform: translate3d(var(--storyboard-popup-x, 0), var(--storyboard-popup-y, 0), 0);
    will-change: transform;
    zoom: var(--storyboard-canvas-zoom, 1);
  }

  .storyboard-editor-stage .rich-step-content {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    min-height: 240px;
    overflow: visible;
    border: var(--lq-tour-border-width, 1px) solid var(--lq-tour-border-color, var(--lq-color-border));
    border-radius: var(--lq-tour-radius, var(--lq-radius-md));
    background: var(--lq-tour-surface, #ffffff);
    box-shadow: var(--lq-tour-elevation, 0 var(--lq-space-4) var(--lq-space-7) rgba(15, 36, 31, 0.12));
    color: var(--lq-tour-text-color, var(--lq-color-ink));
    font-family: var(--lq-tour-font-family, inherit);
    font-size: var(--lq-tour-base-font-size, var(--lq-font-sm));
    padding: var(--lq-tour-composition-padding, var(--lq-tour-spacing, var(--lq-space-4)));
  }

  .storyboard-editor-stage .rich-step-content[data-lodariq-popup-radius='square'] {
    border-radius: 0;
  }

  .storyboard-editor-stage .rich-step-content[data-lodariq-popup-radius='soft'] {
    border-radius: var(--lq-tour-radius-sm, var(--lq-radius-sm));
  }

  .storyboard-editor-stage .rich-step-content[data-lodariq-popup-radius='round'] {
    border-radius: var(--lq-tour-radius-lg, 16px);
  }

  .storyboard-editor-stage .rich-step-popup-frame[data-popup-height-custom='true'] {
    min-height: 0;
  }

  .storyboard-editor-stage
    .rich-step-popup-frame[data-popup-height-custom='true']
    > .rich-step-content {
    height: 100%;
    min-height: 0;
    overflow: auto;
  }

  .storyboard-editor-stage .rich-step-popup-frame:focus-within > .rich-step-content,
  .storyboard-editor-stage
    .rich-step-popup-frame[data-popup-selected='true']
    > .rich-step-content {
    box-shadow:
      0 0 0 2px var(--lq-color-blue) inset,
      0 var(--lq-space-4) var(--lq-space-7) rgba(15, 36, 31, 0.12);
  }

  .storyboard-editor-stage .rich-step-block-row.active {
    border-style: dashed;
    border-color: var(--lq-color-blue);
    background: var(--lq-color-blue-soft);
  }

  .storyboard-editor-stage .rich-step-content .inline-insert {
    height: var(--lq-space-1);
    min-height: var(--lq-space-1);
    margin: 0;
  }

  .storyboard-editor-stage .rich-step-content .inline-insert-trigger {
    position: absolute;
  }

  .storyboard-editor-stage .rich-step-special-block.action {
    display: block;
  }

  .storyboard-editor-stage .rich-step-block-kind {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .storyboard-tool-dock {
    position: absolute;
    z-index: 6;
    top: 80px;
    right: var(--lq-space-4);
    display: grid;
    width: 80px;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.12);
    padding: var(--lq-space-1);
  }

  .storyboard-tool-dock button {
    display: grid;
    min-height: 64px;
    place-items: center;
    align-content: center;
    gap: var(--lq-space-1);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
  }

  .storyboard-tool-dock button:hover,
  .storyboard-tool-dock button.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .storyboard-property-tray {
    min-width: 0;
    max-height: 360px;
    overflow: auto;
    border-top: 1px solid var(--lq-color-border);
    background: #ffffff;
  }

  .storyboard-tray-header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-4);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    padding: var(--lq-space-2) var(--lq-space-4);
  }

  .storyboard-tray-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: var(--lq-space-3);
  }

  .storyboard-tray-title > strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-placement-summary {
    overflow: hidden;
    border-left: 1px solid var(--lq-color-border);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    padding-left: var(--lq-space-3);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .storyboard-verification {
    color: #8b5c08;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  .storyboard-verification.ready {
    color: #167553;
  }

  .storyboard-verification.repair {
    color: #a33a3a;
  }

  .storyboard-advanced-toggle {
    display: inline-flex;
    min-height: var(--lq-control-sm);
    flex: 0 0 auto;
    align-items: center;
    gap: var(--lq-space-2);
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
  }

  .storyboard-advanced-toggle[aria-expanded='true'] svg {
    transform: rotate(180deg);
  }

  .storyboard-quick-controls {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(240px, 2fr) minmax(160px, 1fr) minmax(160px, 1fr) minmax(240px, 2fr) minmax(240px, 2fr);
    gap: 0;
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .storyboard-control-group {
    min-width: 0;
    border: 0;
    border-right: 1px solid var(--lq-color-border-soft);
    margin: 0;
    padding: 0 var(--lq-space-3);
  }

  .storyboard-control-group:first-child {
    padding-left: 0;
  }

  .storyboard-control-group:last-child {
    border-right: 0;
    padding-right: 0;
  }

  .storyboard-control-group legend {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    margin-bottom: var(--lq-space-2);
  }

  .storyboard-control-group > div {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: var(--lq-space-2);
  }

  .storyboard-control-group button,
  .storyboard-custom-color {
    display: inline-flex;
    min-height: var(--lq-control-lg);
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 var(--lq-space-2);
  }

  .storyboard-control-group button:hover,
  .storyboard-control-group button.selected,
  .storyboard-control-group button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .action-group button,
  .width-group button {
    flex: 1 1 80px;
    min-height: calc(var(--lq-control-lg) * 2);
    flex-direction: column;
  }

  .alignment-group button {
    width: var(--lq-control-lg);
    min-height: calc(var(--lq-control-lg) * 2);
    padding: 0;
  }

  .color-group button:not(.storyboard-theme-reset) {
    width: var(--lq-control-lg);
    padding: 0;
    border-radius: 999px;
    background: var(--storyboard-swatch, #ffffff);
    color: var(--storyboard-swatch-ink, #ffffff);
  }

  .color-group button.selected:not(.storyboard-theme-reset) {
    box-shadow: 0 0 0 2px #ffffff inset;
  }

  .storyboard-custom-color {
    position: relative;
    width: auto;
    min-width: var(--lq-control-lg);
    flex-direction: column;
    border: 0;
    color: var(--lq-color-primary);
    padding: 0;
  }

  .storyboard-custom-color span {
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  .storyboard-custom-color input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .storyboard-control-group .storyboard-theme-reset {
    min-height: var(--lq-control-sm);
    border: 0;
    color: var(--lq-color-primary);
  }

  .storyboard-spacing-control {
    display: grid !important;
    min-height: calc(var(--lq-control-lg) * 2);
    grid-template-columns: var(--lq-space-5) minmax(120px, 1fr) var(--lq-space-5);
    align-items: center;
    gap: var(--lq-space-2);
  }

  .storyboard-spacing-control input {
    width: 100%;
    accent-color: var(--lq-color-primary);
  }

  .storyboard-spacing-control output {
    grid-column: 1 / -1;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    text-align: center;
  }

  .storyboard-action-url {
    width: 100%;
    min-height: var(--lq-control-sm);
    margin-top: var(--lq-space-2);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink);
    padding: 0 var(--lq-space-3);
  }

  .storyboard-property-tray .tour-step-config-section,
`;
