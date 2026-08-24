/** Focused storyboard rail, batch toolbar, and batch workspace. */
export const AUTHORING_FOCUSED_STORYBOARD_CSS = `
  .panel-storyboard-workspace {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .panel-storyboard-workspace[data-flow-map-open='true'] {
    grid-template-rows: minmax(0, 1fr);
  }

  .tour-storyboard {
    min-height: 56px;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: 56px;
    overflow: visible;
  }

  .tour-storyboard-scroll {
    height: 56px;
    scrollbar-width: none;
  }

  .tour-storyboard-scroll::-webkit-scrollbar {
    display: none;
  }

  .tour-storyboard-list {
    height: 56px;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
  }

  .tour-storyboard-step {
    width: auto;
    min-width: 112px;
    max-width: 168px;
    height: 40px;
    border-color: var(--lq-color-border-soft);
    border-radius: 8px;
  }

  .tour-storyboard-step.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-storyboard-select {
    display: flex;
    height: 100%;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
  }

  .tour-storyboard-heading {
    display: grid;
    width: 100%;
    grid-template-columns: 20px minmax(0, 1fr) 16px;
    gap: 8px;
  }

  .tour-storyboard-heading strong {
    font-size: var(--lq-font-sm);
  }

  .tour-storyboard-number {
    width: 20px;
    height: 20px;
    font-size: var(--lq-font-xs);
  }

  .tour-storyboard-step.active .tour-storyboard-number {
    border-color: #0c211c;
    background: #0c211c;
  }

  .tour-storyboard-health {
    width: 16px;
    height: 16px;
  }

  .tour-storyboard-drag,
  .tour-storyboard-step .tour-step-action-trigger.ui-button {
    top: 8px;
    min-height: 24px;
    opacity: 0;
  }

  .tour-storyboard-step:hover .tour-storyboard-heading strong,
  .tour-storyboard-step:focus-within .tour-storyboard-heading strong {
    padding-inline: 4px;
  }

  .tour-storyboard-add-item {
    display: grid;
    height: 40px;
    place-items: center;
  }

  .tour-storyboard-add {
    width: 36px;
    min-width: 36px;
    height: 36px;
    min-height: 36px;
    border-radius: 8px;
  }

  .tour-storyboard-utilities {
    display: flex;
    height: 56px;
    align-items: center;
    gap: 8px;
    border-left: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    padding: 8px 12px;
  }

  .tour-storyboard-utilities .experience-language-picker,
  .tour-storyboard-utilities .experience-language-controls {
    display: flex;
    width: auto;
  }

  .tour-storyboard-utilities .ui-select-trigger {
    width: 112px;
    min-height: 36px;
    background: #ffffff;
  }

  .tour-storyboard-utilities .experience-translate-button {
    width: 36px;
    min-width: 36px;
    min-height: 36px;
  }

  .tour-flow-map-toggle {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    gap: 8px;
    margin: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 12px;
    white-space: nowrap;
  }

  .tour-flow-map-toggle:hover,
  .tour-flow-map-toggle[aria-expanded='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-storyboard[data-batch-mode='true'] {
    grid-template-rows: 112px 48px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-scroll,
  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-utilities {
    height: 112px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-list {
    height: 112px;
    align-items: stretch;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-step {
    min-width: 144px;
    max-width: 176px;
    height: 96px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-select {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-content: start;
    padding: 12px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-preview {
    display: grid;
    min-height: 40px;
    align-items: end;
    gap: 4px;
    border: 0;
    background: transparent;
    padding: 4px 28px 0;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-preview > span {
    -webkit-line-clamp: 1;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-preview small {
    color: var(--lq-color-primary);
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-add-item {
    height: 96px;
  }

  .tour-storyboard[data-batch-mode='true'] .tour-storyboard-utilities {
    align-items: flex-start;
    padding-top: 12px;
  }

  .tour-step-multi-select {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 4;
    width: 24px;
    min-height: 24px;
  }

  .tour-step-batch-toolbar {
    display: flex;
    min-width: 0;
    min-height: 48px;
    grid-column: 1 / -1;
    align-items: center;
    gap: 8px;
    margin: 0;
    border-width: 1px 0 0;
    border-radius: 0;
    padding: 4px 12px;
  }

  .tour-step-batch-toolbar > strong {
    min-width: 96px;
    font-size: var(--lq-font-xs);
    white-space: nowrap;
  }

  .tour-step-batch-actions {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 4px;
  }

  .tour-step-batch-toolbar .ui-button {
    min-height: 36px;
    border-color: transparent;
    background: transparent;
    font-size: var(--lq-font-xs);
  }

  .tour-step-batch-toolbar .ui-button:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel-strong);
  }

  .tour-step-batch-toolbar .tour-step-batch-done {
    min-width: 72px;
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: #ffffff;
  }

  .tour-step-batch-menu {
    display: grid;
    min-width: 200px;
    gap: 4px;
    padding: 4px;
  }

  .tour-step-batch-menu .ui-button {
    justify-content: flex-start;
    border-color: transparent;
    background: transparent;
  }

  .tour-step-batch-menu.batch-fields {
    width: 280px;
    gap: 12px;
    padding: 12px;
  }

  .tour-step-batch-menu label {
    display: grid;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .tour-step-batch-menu select {
    width: 100%;
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink);
    padding: 0 8px;
  }

`;
