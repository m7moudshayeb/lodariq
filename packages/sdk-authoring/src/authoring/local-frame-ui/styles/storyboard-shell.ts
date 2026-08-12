export const AUTHORING_STORYBOARD_SHELL_CSS = `
  .tour-advanced-settings-row:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  @container authoring-frame (max-width: 620px) {
    .rich-step-inspector-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-height: 720px) {
    .panel-reference-workspace {
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .tour-step-editor-section,
    .tour-step-config-section {
      padding: var(--lq-space-2) var(--lq-space-4);
    }

    .tour-step-section-heading,
    .tour-config-heading {
      margin-bottom: var(--lq-space-2);
    }

    .rich-step-toolbar {
      min-height: var(--lq-control-md);
      padding-block: var(--lq-space-1);
    }

    .rich-step-content {
      min-height: 80px;
      padding-block: var(--lq-space-2);
    }

    .tour-position-group {
      margin-top: var(--lq-space-3);
    }

    .tour-position-options button {
      min-height: 48px;
      gap: var(--lq-space-1);
    }

    .tour-advance-options button {
      min-height: 64px;
      padding-block: var(--lq-space-2);
    }

    .tour-advanced-settings-row {
      min-height: var(--lq-control-lg);
      padding-block: var(--lq-space-2);
    }

    .panel-workspace-footer {
      padding-block: var(--lq-space-2);
    }
  }

  @keyframes lq-release-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tour-release-spinner,
    .panel-save-state-spinner {
      animation: none;
    }
  }

  @media (max-width: 760px) {
    .authoring-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .tour-sequence-rail {
      position: static;
      height: auto;
      max-height: 48vh;
      border-right: 0;
      border-bottom: 1px solid var(--lq-color-border);
    }

    .document-main {
      min-height: 52vh;
      padding: 16px 12px 32px;
    }
  }

  @container authoring-frame (min-width: 620px) {
    .shell-panel .panel-hybrid-workspace {
      grid-template-columns: 230px minmax(0, 1fr);
    }

    .shell-panel .panel-hybrid-workspace > .tour-sequence-rail {
      display: flex;
      border-right: 1px solid var(--lq-color-border-soft);
    }

    .shell-panel .tour-sequence-rail.compact .tour-step-copy strong {
      display: -webkit-box;
      overflow: hidden;
      line-height: 1.3;
      text-overflow: initial;
      white-space: normal;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .shell-panel .panel-hybrid-workspace .tour-step-accordion {
      display: none;
    }

    .tour-step-inspector {
      display: flex;
      height: 100%;
      min-height: 0;
      min-width: 0;
      flex-direction: column;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--lq-color-panel);
      padding: 0;
      scrollbar-gutter: stable;
    }

    .panel-advanced-workspace .panel-advanced-editor {
      min-width: 0;
    }
  }

  @container authoring-frame (min-width: 800px) {
    .shell-panel .panel-hybrid-workspace {
      grid-template-columns: 280px minmax(0, 1fr);
    }
  }

  @container authoring-frame (max-width: 619px) {
    .panel-reference-workspace {
      grid-template-rows: minmax(0, 1fr) auto;
    }

    .panel-workspace-footer {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      min-height: 0;
      padding: 8px 12px;
    }

    .panel-footer-state {
      gap: 12px;
    }

    .panel-release-actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
    }

    .panel-release-actions button {
      min-height: 48px;
      flex-direction: column;
      gap: 4px;
      font-size: 10px;
      line-height: 1.1;
      padding: 4px;
      text-align: center;
    }

    .panel-save-exit,
    .panel-release-actions button {
      min-width: 0;
      min-height: 36px;
      padding-inline: 8px;
    }

    .panel-release-actions button.publish {
      min-width: 0;
    }

    .panel-release-actions button.review-recovery {
      min-width: 0;
    }
  }

  @container authoring-frame (max-width: 390px) {
    .panel-release-full {
      display: none;
    }

    .panel-release-short {
      display: inline;
    }

    .panel-release-actions button.publish {
      min-width: 0;
    }

    .rich-step-toolbar-divider,
    .rich-step-toolbar select:nth-child(2) {
      display: none;
    }

    .rich-step-block-row {
      grid-template-columns: 20px minmax(0, 1fr) 26px;
    }
  }

  /* Storyboard Studio: selected Editorial Air authoring composition. */
  html:has(.shell-panel),
  body:has(.shell-panel),
  .shell-panel,
  .shell-panel .panel-canvas,
  .shell-panel .document-page,
  .shell-panel .panel-reference-workspace {
    background: transparent;
  }

  .shell-panel .panel-reference-workspace {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .shell-panel .panel-reference-workspace > .panel-mode-shell {
    height: 100%;
    min-height: 0;
  }

  .panel-storyboard-workspace {
    display: grid;
    width: 100%;
    height: 100%;
    min-height: 0;
    grid-template-rows: 160px minmax(0, 1fr);
    overflow: hidden;
    background: transparent;
  }

  .tour-storyboard {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    overflow: hidden;
    border-bottom: 1px solid var(--lq-color-border);
    background: #ffffff;
  }

  .tour-storyboard-scroll {
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }

  .tour-storyboard-list {
    display: flex;
    min-width: max-content;
    height: 100%;
    align-items: stretch;
    gap: var(--lq-space-3);
    list-style: none;
    margin: 0;
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .tour-storyboard-language {
    position: relative;
    z-index: 1;
    display: grid;
    width: clamp(304px, 24vw, 360px);
    min-width: 304px;
    align-content: center;
    gap: 6px;
    border-left: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    box-shadow: calc(var(--lq-space-3) * -1) 0 var(--lq-space-5)
      calc(var(--lq-space-4) * -1) rgba(15, 36, 31, 0.18);
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .tour-storyboard-language-label {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    letter-spacing: 0.08em;
    line-height: 1.2;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .tour-storyboard-language .experience-language-picker.studio {
    display: grid;
    width: 100%;
    gap: 6px;
  }

  .tour-storyboard-language .experience-language-controls {
    width: 100%;
    align-items: flex-start;
    gap: var(--lq-space-2);
  }

  .tour-storyboard-language .ui-select-trigger {
    width: auto;
    min-width: 0;
    height: var(--lq-control-sm);
    min-height: var(--lq-control-sm);
    background: var(--lq-color-page);
  }

  .experience-translate-action {
    display: grid;
    width: var(--lq-control-sm);
    flex: 0 0 var(--lq-control-sm);
    justify-items: center;
    gap: 4px;
  }

  .experience-translate-label {
    width: max-content;
    max-width: 64px;
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .experience-language-status {
    display: flex;
    width: 100%;
    min-height: 24px;
    align-items: center;
    gap: var(--lq-space-2);
    overflow: hidden;
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-medium);
    line-height: 1.2;
    padding: var(--lq-space-1) var(--lq-space-2);
  }

  .experience-language-status > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .experience-language-status-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: currentcolor;
  }

  .experience-language-status.error {
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .tour-storyboard-step {
    position: relative;
    display: grid;
    width: 240px;
    min-width: 240px;
    grid-template-columns: minmax(0, 1fr);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-md);
    background: #ffffff;
  }

  .tour-storyboard-step.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-storyboard-step.repair:not(.active) {
    border-color: var(--lq-color-danger-border);
  }

  .tour-storyboard-select {
    display: grid;
    min-width: 0;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--lq-space-2);
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: var(--lq-space-3);
    text-align: left;
  }

  .tour-storyboard-heading {
    display: grid;
    min-width: 0;
    grid-template-columns: var(--lq-space-5) minmax(0, 1fr) var(--lq-space-4);
    align-items: center;
    gap: var(--lq-space-2);
  }

  .tour-storyboard-heading strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-storyboard-number {
    display: grid;
    width: var(--lq-space-5);
    height: var(--lq-space-5);
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .tour-storyboard-step.active .tour-storyboard-number {
    border-color: #0c211c;
    background: #0c211c;
    color: #ffffff;
  }

  .tour-storyboard-health {
    display: grid;
    width: var(--lq-space-4);
    height: var(--lq-space-4);
    place-items: center;
    color: var(--lq-color-primary);
  }

  .tour-storyboard-health.repair {
    color: var(--lq-color-danger);
  }

  .tour-storyboard-preview {
    display: grid;
    min-width: 0;
    min-height: var(--lq-space-7);
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--lq-space-3);
    overflow: hidden;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-2xs);
    padding: var(--lq-space-2) var(--lq-space-3);
  }

  .tour-storyboard-preview > span {
    display: -webkit-box;
    overflow: hidden;
    line-height: 1.4;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .tour-storyboard-preview strong {
    max-width: 80px;
    overflow: hidden;
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-primary);
    color: #ffffff;
    font-size: var(--lq-font-2xs);
    font-weight: var(--lq-weight-bold);
    padding: var(--lq-space-1) var(--lq-space-2);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-storyboard-drag,
  .tour-storyboard-step .tour-step-action-trigger.ui-button {
    position: absolute;
    z-index: 2;
    top: var(--lq-space-2);
    width: var(--lq-space-5);
    min-width: var(--lq-space-5);
    min-height: var(--lq-space-5);
    border: 0;
    background: transparent;
    color: var(--lq-color-muted);
    opacity: 0;
    padding: 0;
  }

  .tour-storyboard-drag {
    left: var(--lq-space-1);
    cursor: grab;
  }

  .tour-storyboard-step .tour-step-action-trigger.ui-button {
    right: 2px;
  }

  .tour-storyboard-step:hover .tour-storyboard-drag,
  .tour-storyboard-step:hover .tour-step-action-trigger,
  .tour-storyboard-drag:focus-visible,
  .tour-storyboard-step .tour-step-action-trigger:focus-visible,
  .tour-storyboard-step .tour-step-action-trigger[aria-expanded='true'] {
    opacity: 1;
  }

  .tour-storyboard-add-item {
    display: grid;
    width: var(--lq-space-7);
    min-width: var(--lq-space-7);
    place-items: center;
  }

  .tour-storyboard-add {
    display: grid;
    width: var(--lq-control-lg);
    height: var(--lq-control-lg);
    place-items: center;
    border: 1px dashed var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
  }

  .tour-storyboard-add:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .storyboard-step-inspector,
  .shell-panel .storyboard-step-inspector {
    display: block;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: transparent;
  }

  .canvas-editor-loading {
    display: flex;
    min-height: 160px;
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .canvas-editor-loading svg {
    animation: panel-spin 900ms linear infinite;
  }
`;
