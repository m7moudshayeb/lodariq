export const AUTHORING_BLOCK_INSPECTOR_CSS = `
  .rich-step-toolbar button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
  }

  .rich-step-toolbar-divider {
    width: 1px;
    height: var(--lq-space-5);
    margin: 0 var(--lq-space-1);
    background: var(--lq-color-border-soft);
  }

  .rich-step-color {
    position: relative;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .rich-step-color::after {
    position: absolute;
    right: var(--lq-space-2);
    bottom: var(--lq-space-1);
    left: var(--lq-space-2);
    height: var(--lq-space-1);
    border-radius: 999px;
    background: var(--rich-text-color, #162033);
    content: '';
  }

  .rich-step-color input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .rich-step-content {
    box-sizing: border-box;
    min-height: 160px;
    max-height: 480px;
    overflow: auto;
    resize: vertical;
    cursor: text;
    outline: 0;
    padding: var(--lq-space-3);
  }

  .rich-step-content[data-lodariq-content-align='center'] {
    text-align: center;
  }

  .rich-step-content[data-lodariq-content-align='right'] {
    text-align: right;
  }

  .rich-step-content[data-lodariq-composition-padding='compact'] {
    --lq-tour-composition-padding: var(--lq-tour-space-sm);
  }

  .rich-step-content[data-lodariq-composition-padding='relaxed'] {
    --lq-tour-composition-padding: var(--lq-tour-space-lg);
  }

  .rich-step-block-row[data-lodariq-spacing-before='none'] {
    margin-top: 0;
  }

  .rich-step-block-row[data-lodariq-spacing-before='tight'] {
    margin-top: var(--lq-tour-space-xs);
  }

  .rich-step-block-row[data-lodariq-spacing-before='normal'] {
    margin-top: var(--lq-tour-space-sm);
  }

  .rich-step-block-row[data-lodariq-spacing-before='relaxed'] {
    margin-top: var(--lq-tour-space-md);
  }

  .rich-step-block-row[data-lodariq-spacing-after='none'] {
    margin-bottom: 0;
  }

  .rich-step-block-row[data-lodariq-spacing-after='tight'] {
    margin-bottom: var(--lq-tour-space-xs);
  }

  .rich-step-block-row[data-lodariq-spacing-after='normal'] {
    margin-bottom: var(--lq-tour-space-sm);
  }

  .rich-step-block-row[data-lodariq-spacing-after='relaxed'] {
    margin-bottom: var(--lq-tour-space-md);
  }

  .rich-step-block-row[data-lodariq-spacing-after-px] {
    margin-bottom: var(--lq-block-spacing-after);
  }

  .rich-step-content:focus-within {
    box-shadow: 0 0 0 2px var(--lq-color-blue) inset;
  }

  .rich-step-block-row {
    display: grid;
    min-width: 0;
    grid-template-columns: var(--lq-space-5) minmax(0, 1fr) var(--lq-space-6);
    align-items: start;
    gap: var(--lq-space-1);
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    padding: var(--lq-space-1);
    transition: background 120ms ease, border-color 120ms ease;
  }

  .rich-step-block-stack > .inline-insert,
  .rich-step-content > .inline-insert {
    min-height: var(--lq-space-3);
    margin: 0;
  }

  .rich-step-block-stack > .inline-insert .inline-insert-trigger,
  .rich-step-content > .inline-insert .inline-insert-trigger {
    width: var(--lq-space-5);
    height: var(--lq-space-5);
    min-height: var(--lq-space-5);
  }

  .rich-step-block-row:hover,
  .rich-step-block-row.active,
  .rich-step-block-row.selected {
    border-color: var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
  }

  .rich-step-block-row.active {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .rich-step-block-drag {
    display: inline-grid;
    width: var(--lq-space-5);
    height: var(--lq-control-sm);
    place-items: center;
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-subtle);
    cursor: grab;
    opacity: 0.4;
    padding: 0;
  }

  .rich-step-block-row:hover .rich-step-block-drag,
  .rich-step-block-row.active .rich-step-block-drag,
  .rich-step-block-drag:focus-visible {
    opacity: 1;
  }

  .rich-step-block-actions.ui-button {
    width: var(--lq-space-6);
    min-width: var(--lq-space-6);
    min-height: var(--lq-control-sm);
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    opacity: 0;
    padding: 0;
  }

  .rich-step-block-row:hover .rich-step-block-actions,
  .rich-step-block-row.active .rich-step-block-actions,
  .rich-step-block-actions:focus-visible,
  .rich-step-block-actions[aria-expanded='true'] {
    opacity: 1;
  }

  .rich-step-block {
    min-height: var(--lq-control-sm);
    color: var(--lq-color-ink);
    line-height: 1.5;
    outline: 0;
    padding: var(--lq-space-1) var(--lq-space-2);
  }

  .rich-step-block.heading {
    margin: 0 0 calc(var(--lq-tour-spacing) * 0.5);
    color: var(--lq-tour-text-color, var(--lq-color-ink));
    font-size: var(--lq-tour-base-font-size, var(--lq-font-xl));
    font-weight: var(--lq-tour-heading-font-weight, var(--lq-weight-bold));
    line-height: var(--lq-tour-heading-line-height, 1.3);
  }

  .rich-step-block.paragraph {
    margin: 0 0 var(--lq-tour-spacing, var(--lq-space-3));
    color: var(--lq-tour-muted-text-color, var(--lq-color-ink-soft));
    font-size: var(--lq-tour-small-font-size, var(--lq-font-sm));
    line-height: var(--lq-tour-body-line-height, 1.5);
  }

  .rich-step-toolbar-context {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-2);
  }

  .rich-step-toolbar button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .rich-step-highlight::after {
    background: #fff0a8;
  }

  .rich-step-link-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto 36px;
    align-items: center;
    gap: var(--lq-space-2);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-2);
  }

  .rich-step-link-editor input,
  .rich-step-link-editor button,
  .rich-step-plain-field,
  .rich-step-special-block input,
  .rich-step-url-field input {
    box-sizing: border-box;
    min-height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: #ffffff;
    color: var(--lq-color-ink);
    font: inherit;
    padding: var(--lq-space-2);
  }

  .rich-step-link-editor button {
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .rich-step-plain-field {
    width: 100%;
    min-height: 80px;
    resize: vertical;
  }

  .rich-step-special-block {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--lq-space-2);
    min-height: var(--lq-control-md);
  }

  .rich-step-special-block > span {
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: var(--lq-space-1) var(--lq-space-2);
    text-transform: uppercase;
  }

  .rich-step-special-block.button input {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: #ffffff;
    font-weight: var(--lq-weight-bold);
    text-align: center;
  }

  .rich-step-special-block.action {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .rich-step-action-stage {
    display: flex;
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
  }

  .rich-step-action-stage[data-lodariq-action-align='center'] {
    justify-content: center;
  }

  .rich-step-action-stage[data-lodariq-action-align='end'] {
    justify-content: flex-end;
  }

  .rich-step-action-preview {
    position: relative;
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    min-height: var(--lq-control-md);
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    border: var(--lq-tour-border-width, 1px) solid transparent;
    border-radius: var(--lq-tour-radius, var(--lq-radius-sm));
    background: var(--lq-action-fill, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    color: var(--lq-action-text, var(--lq-tour-primary-text, #ffffff));
    font-weight: var(--lq-tour-action-font-weight, var(--lq-weight-bold));
    padding: var(--lq-tour-space-xs, var(--lq-space-2)) var(--lq-tour-space-sm, var(--lq-space-3));
  }

  .rich-step-action-preview[data-lodariq-action-width='fill'],
  .rich-step-action-stage[data-lodariq-action-align='stretch'] .rich-step-action-preview {
    width: 100%;
  }

  .rich-step-action-preview[data-lodariq-action-width='custom'] {
    width: min(100%, var(--lq-action-width, 100%));
  }

  .storyboard-action-resize-handle {
    position: absolute;
    z-index: 6;
    top: 50%;
    width: 12px;
    min-width: 12px;
    height: 12px;
    min-height: 12px;
    border: 2px solid var(--lq-color-blue);
    border-radius: 999px;
    background: #ffffff;
    cursor: ew-resize;
    padding: 0;
    touch-action: none;
    transform: translateY(-50%);
  }

  .storyboard-action-resize-handle.start {
    left: -10px;
  }

  .storyboard-action-resize-handle.end {
    right: -10px;
  }

  .storyboard-action-resize-handle:hover,
  .storyboard-action-resize-handle:focus-visible {
    background: var(--lq-color-blue);
    box-shadow: 0 0 0 3px #ffffff;
  }

  .storyboard-action-resize-value {
    position: absolute;
    z-index: 5;
    bottom: -32px;
    left: 50%;
    min-width: 48px;
    height: 24px;
    border: 1px solid var(--lq-color-blue-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-blue);
    font-size: 10px;
    font-weight: 700;
    line-height: 22px;
    padding: 0 8px;
    text-align: center;
    transform: translateX(-50%);
  }

  .rich-step-action-preview[data-lodariq-action-size='compact'] {
    min-height: var(--lq-control-sm);
    padding-inline: var(--lq-tour-space-xs, var(--lq-space-2));
  }

  .rich-step-action-preview[data-lodariq-action-radius='square'] {
    border-radius: 0;
  }

  .rich-step-action-preview[data-lodariq-action-radius='soft'] {
    border-radius: var(--lq-tour-radius-sm, var(--lq-radius-md));
  }

  .rich-step-action-preview[data-lodariq-action-radius='round'] {
    border-radius: 999px;
  }

  .rich-step-action-preview[data-lodariq-action-variant='secondary'] {
    border-color: var(--lq-action-border, var(--lq-tour-border-color, var(--lq-color-border)));
    background: var(--lq-action-fill, var(--lq-tour-secondary-surface, var(--lq-color-panel-strong)));
    color: var(--lq-action-text, var(--lq-tour-secondary-text, var(--lq-color-ink)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='subtle'] {
    background: var(--lq-action-fill, color-mix(in srgb, var(--lq-tour-primary-surface) 12%, transparent));
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='outline'] {
    border-color: var(--lq-action-border, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='link'] {
    min-height: var(--lq-control-sm);
    border-color: transparent;
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    padding: 0;
    text-decoration: underline;
  }

  .rich-step-action-preview input,
  .rich-step-special-block.button .rich-step-action-preview input {
    width: auto;
    min-width: 80px;
    max-width: 100%;
    min-height: 0;
    field-sizing: content;
    border: 0;
    border-radius: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font-weight: var(--lq-weight-bold);
    padding: 0;
    text-align: inherit;
    -webkit-text-fill-color: currentColor;
  }

  .rich-step-divider-preview {
    height: 1px;
    align-self: center;
    background: var(--lq-color-border);
    margin: var(--lq-space-4) var(--lq-space-1);
  }

  .rich-step-inspector {
    margin: 0 var(--lq-space-2) var(--lq-space-2);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-3);
  }
`;
