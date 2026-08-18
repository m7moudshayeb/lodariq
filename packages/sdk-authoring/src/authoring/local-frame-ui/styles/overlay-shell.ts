import { AUTHORING_CONTEXT_SURFACE_TOKENS } from '../../../creator-chrome-tokens';

const overlayTokens = `
    --lq-color-ink: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
    --lq-color-ink-soft: #3d4a5c;
    --lq-color-muted: ${AUTHORING_CONTEXT_SURFACE_TOKENS.muted};
    --lq-color-panel: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
    --lq-color-border: ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
    --lq-color-border-soft: ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
    --lq-color-primary: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    --lq-color-primary-hover: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentHover};
    --lq-color-primary-soft: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
    --lq-color-blue: ${AUTHORING_CONTEXT_SURFACE_TOKENS.focus};
    color: var(--lq-color-ink);
    color-scheme: light;
`;

export const AUTHORING_OVERLAY_SHELL_CSS = `
  html:has(.shell-overlay),
  html:has(.shell-operations) {
    ${overlayTokens}
  }

  html:has(.shell-overlay),
  html:has(.shell-overlay) body,
  .shell.shell-overlay,
  .shell-overlay .workspace,
  .shell-overlay .overlay-step-shell,
  .shell-overlay .canvas,
  .shell-overlay .panel-canvas {
    background: transparent !important;
  }

  html:has(.shell-overlay),
  html:has(.shell-overlay) body {
    position: relative;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    --lq-color-page: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
  }

  .shell.shell-overlay {
    position: absolute !important;
    inset: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  .shell-overlay .workspace,
  .overlay-step-shell {
    position: absolute;
    inset: 0;
    height: auto;
    min-height: 0;
    overflow: visible;
    padding: 0;
  }

  html:has(.shell-operations),
  html:has(.shell-operations) body {
    --lq-color-page: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
  }

  .shell-overlay {
    min-height: 0;
    height: 100%;
    padding: 0;
    overflow: hidden;
  }

  .shell-panel.shell-overlay {
    container-type: normal;
  }

  .shell-overlay .workspace {
    height: 100%;
    min-height: 0;
    padding: 0;
  }

  .overlay-step-shell {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 8px;
    padding: 12px;
    pointer-events: none;
  }

  .overlay-step-shell.inspector-left {
    flex-direction: row-reverse;
  }

  .overlay-step-main {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }

  .overlay-step-main.toolbar-below,
  .overlay-step-shell.toolbar-below .overlay-step-main {
    flex-direction: column-reverse;
  }

  .overlay-step-toolbar,
  .overlay-step-card,
  .overlay-choose-target,
  .overlay-step-empty,
  .overlay-step-inspector:not(:empty) {
    pointer-events: auto;
  }

  .overlay-step-inspector:empty {
    display: none;
  }

  .overlay-step-inspector:not(:empty) {
    flex: 0 0 320px;
    width: 320px;
    min-width: 320px;
    max-height: 100%;
    overflow: auto;
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
    border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
    border-radius: 12px;
    box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
    color-scheme: light;
  }

  .overlay-step-inspector .storyboard-tray-handle {
    display: none;
  }

  .overlay-step-inspector .storyboard-property-tray {
    width: 100%;
    height: 100%;
    max-height: none;
    border: 0;
    box-shadow: none;
  }

  .overlay-step-inspector .storyboard-property-tray[data-tool-mode='content'] > .storyboard-tab-panel.behavior,
  .overlay-step-inspector
    .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='action'],
  .overlay-step-inspector
    .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='field'],
  .overlay-step-inspector
    .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='media'] {
    grid-template-columns: minmax(0, 1fr);
  }

  .overlay-step-inspector .storyboard-property-color-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  html:has(.shell-overlay) .rich-content-button-config-trigger,
  html:has(.shell-overlay) .rich-content-media-fit-control {
    display: none;
  }

  html:has(.shell-overlay) .rich-content-media-preview:not([data-fixed-height]) img,
  html:has(.shell-overlay) .rich-content-media-preview:not([data-fixed-height]) video {
    height: auto;
    max-height: none;
    object-fit: var(--rich-media-fit, contain);
  }

  .overlay-step-toolbar {
    flex: 0 0 44px;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 44px;
    padding: 4px 8px;
    overflow-x: auto;
    overflow-y: hidden;
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
    color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
    border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.border};
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(15, 36, 31, 0.12);
    color-scheme: light;
  }

  .overlay-step-toolbar-slot {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .overlay-step-toolbar-slot .rich-content-toolbar {
    flex-wrap: nowrap;
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .overlay-step-card.rich-step-content {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    max-height: none;
    overflow: auto;
    resize: none;
    padding-left: var(--lq-tour-composition-padding, var(--lq-space-3, 12px));
    background: var(--lq-tour-surface, #fff);
    color: var(--lq-tour-text-color, ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink});
    border-radius: 12px;
    box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
  }

  .overlay-step-card.rich-step-content[data-lodariq-popup-radius='square'] {
    border-radius: 0;
  }

  .overlay-step-card.rich-step-content[data-lodariq-popup-radius='soft'] {
    border-radius: 8px;
  }

  .overlay-step-card.rich-step-content[data-lodariq-popup-radius='round'] {
    border-radius: 16px;
  }

  .overlay-step-card.rich-step-content:focus-within {
    box-shadow: ${AUTHORING_CONTEXT_SURFACE_TOKENS.shadow};
  }

  .overlay-step-card .rich-content-editor {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .overlay-step-card .rich-content-canvas {
    min-height: 0;
    caret-color: var(--lq-tour-text-color, currentColor);
    font-size: 14px;
  }

  .overlay-step-card .rich-content-placeholder {
    font-size: 14px;
    color: color-mix(in srgb, var(--lq-tour-text-color, currentColor) 42%, transparent);
  }

  .overlay-step-toolbar .rich-content-block-style-trigger {
    min-width: 0;
  }

  html:has(.shell-overlay) .rich-content-block-handles > .rich-content-toolbar-popover > button {
    width: 24px;
    height: 24px;
  }

  .overlay-step-empty {
    margin: 16px;
    color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.muted};
  }

  .overlay-choose-target {
    flex: 0 0 auto;
    height: 36px;
    border: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    border-radius: 999px;
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
    color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
    cursor: pointer;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .shell-operations,
  .shell-operations .workspace,
  .shell-operations .panel-canvas,
  .shell-operations .document-page {
    background: #ffffff;
    height: 100%;
    min-height: 0;
  }

  .shell-operations .panel-mode-shell {
    height: 100%;
    min-height: 0;
    background: #ffffff;
  }

  .shell-operations .panel-mode-header {
    min-height: 56px;
    background: #ffffff;
  }

  .shell-operations .panel-mode-header small {
    font-size: 10px;
  }

  .shell-operations .panel-mode-header strong {
    font-size: 16px;
    font-weight: 600;
  }

  .operations-hub .panel-mode-body {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    align-content: stretch;
    align-items: stretch;
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  .operations-hub-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    overflow: auto;
    border-right: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.elevated};
    padding: 16px 12px;
  }

  .operations-hub-nav button {
    display: flex;
    min-height: 40px;
    align-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.ink};
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    padding: 8px 12px;
    text-align: left;
  }

  .operations-hub-nav button:hover {
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.surface};
  }

  .operations-hub-nav button[aria-current='page'] {
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accentSoft};
    color: ${AUTHORING_CONTEXT_SURFACE_TOKENS.accent};
  }

  .operations-hub-body {
    min-height: 0;
    overflow: auto;
    padding: 24px;
  }

  .operations-hub-body:has(.tour-flow-map-workspace) {
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
  }

  .operations-hub-body .tour-flow-map-workspace {
    flex: 1 1 auto;
    min-height: 0;
  }

  .shell-operations .panel-reference-workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .shell-operations .panel-reference-workspace > :not(.panel-workspace-footer) {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .shell-operations .panel-workspace-footer {
    flex: 0 0 auto;
    border-top: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
    background: ${AUTHORING_CONTEXT_SURFACE_TOKENS.elevated};
  }

  @media (max-width: 720px) {
    .operations-hub .panel-mode-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .operations-hub-nav {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      border-right: 0;
      border-bottom: 1px solid ${AUTHORING_CONTEXT_SURFACE_TOKENS.borderSoft};
      padding: 12px;
    }

    .operations-hub-nav button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
  }
`;
