/** Approved compact storyboard rail and step-selection states. */
export const AUTHORING_AGREED_STORYBOARD_CSS = `
  /* The compact rail stays recognizable at every authoring mode. */
  .tour-storyboard-step {
    min-width: 100px;
    max-width: 124px;
  }

  .tour-storyboard-select {
    padding-inline: 8px;
  }

  .tour-storyboard-heading {
    grid-template-columns: 20px minmax(0, 1fr) 18px;
    gap: 6px;
  }

  .tour-storyboard-step:hover .tour-storyboard-health,
  .tour-storyboard-step:focus-within .tour-storyboard-health {
    opacity: 0;
    pointer-events: none;
  }

  .tour-storyboard-step:hover .tour-storyboard-heading strong,
  .tour-storyboard-step:focus-within .tour-storyboard-heading strong {
    padding-inline: 0;
  }

  .tour-storyboard-step .tour-step-action-trigger.ui-button {
    z-index: 5;
    right: 4px;
    width: 24px;
    min-width: 24px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-panel);
  }

  .tour-storyboard-step:hover .tour-step-action-trigger.ui-button,
  .tour-storyboard-step:focus-within .tour-step-action-trigger.ui-button,
  .tour-storyboard-step .tour-step-action-trigger.ui-button:focus-visible,
  .tour-storyboard-step .tour-step-action-trigger.ui-button[aria-expanded='true'] {
    visibility: visible;
    opacity: 1;
    pointer-events: auto;
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .tour-step-multi-select {
    position: absolute;
    z-index: 6;
    top: 10px;
    left: 8px;
    display: grid;
    width: 20px;
    min-height: 20px;
    place-items: center;
    opacity: 0;
    pointer-events: none;
  }

  .tour-step-multi-select input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--lq-color-primary);
    cursor: pointer;
  }

  .tour-storyboard-step:hover .tour-step-multi-select,
  .tour-storyboard-step:focus-within .tour-step-multi-select,
  .tour-storyboard-step[data-batch-selected='true'] .tour-step-multi-select {
    opacity: 1;
    pointer-events: auto;
  }

  .tour-storyboard-step:hover .tour-storyboard-number,
  .tour-storyboard-step:focus-within .tour-storyboard-number,
  .tour-storyboard-step[data-batch-selected='true'] .tour-storyboard-number {
    opacity: 0;
  }

  .storyboard-editor-stage .action-context-toolbar .action-context-type strong {
    overflow: hidden;
    max-width: 104px;
    color: currentcolor;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    text-overflow: ellipsis;
  }

  .tour-storyboard-utilities {
    gap: 6px;
    padding-inline: 8px;
  }

  .tour-storyboard-utilities .ui-select-trigger {
    width: 92px;
  }

  .tour-flow-map-toggle {
    padding-inline: 10px;
  }

`;
