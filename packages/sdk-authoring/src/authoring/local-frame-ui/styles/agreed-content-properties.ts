/** Approved freeform rich content and sequence property forms. */
export const AUTHORING_AGREED_CONTENT_PROPERTIES_CSS = `
  .rich-step-content .rich-content-editor {
    display: block;
    min-width: 0;
  }

  .rich-content-editor-chrome {
    display: flex;
    z-index: 9;
    min-width: 0;
    align-items: center;
    align-self: start;
    gap: 8px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-page);
    padding: 8px 12px;
  }

  .rich-content-editor-chrome [data-rich-content-toolbar-slot] {
    flex: 1 1 240px;
    min-width: 0;
  }

  [data-rich-content-inspector-slot]:empty {
    display: none;
  }

  [data-rich-content-inspector-slot] {
    min-width: 0;
  }

  /*
   * One column: the second held a "configure" button that opened the inspector
   * a click on the field already opens, and it sat outside the card where it
   * read as part of the customer's page rather than as authoring chrome.
   */
  .rich-content-form-field-preview {
    position: relative;
    display: grid;
    align-items: start;
    gap: var(--lq-field-gap, 6px);
    width: 100%;
    /*
     * The card wears the customer's theme, so its text is the tour's ink. This
     * fell back to the creator chrome's ink — pale, because that one is written
     * for dark glass — and every unstyled field label rendered near-invisible on
     * a white card.
     */
    color: var(--lq-field-label, var(--lq-tour-text-color, var(--lq-color-ink)));
    outline: none;
  }

  .rich-content-form-field-preview[data-lodariq-block-align='center'] {
    justify-self: center;
  }

  .rich-content-form-field-preview[data-lodariq-block-align='end'] {
    justify-self: end;
  }

  .rich-content-form-field-preview fieldset,
  .rich-content-form-field-preview > label {
    display: grid;
    gap: var(--lq-field-gap, 6px);
    margin: 0;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
  }

  .rich-content-form-field-preview legend,
  .rich-content-form-field-preview > label > span {
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  /* A checkbox's caption reads as body copy, not as a field label. */
  .rich-content-form-field-preview[data-control='checkbox'] > label > span {
    font-size: var(--lq-font-md);
    font-weight: inherit;
  }

  /* Label beside the control: caption takes its own width, the box takes the rest. */
  .rich-content-form-field-preview[data-control='text'][data-lodariq-field-label='beside'] > label {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }

  /*
   * Hidden means off the screen, never removed: the caption is still the field's
   * accessible name, so a bare box still says what it asks for.
   */
  .rich-content-form-field-preview[data-lodariq-field-label='hidden'] [data-lodariq-field-caption] {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .rich-content-form-field-preview[data-lodariq-field-label-size='small'] [data-lodariq-field-caption] {
    font-size: var(--lq-font-sm);
  }

  .rich-content-form-field-preview[data-lodariq-field-label-size='large'] [data-lodariq-field-caption] {
    font-size: var(--lq-font-md);
  }

  .rich-content-form-field-preview[data-lodariq-field-label-weight='regular'] [data-lodariq-field-caption] {
    font-weight: var(--lq-weight-regular);
  }

  .rich-content-form-field-preview[data-lodariq-field-label-weight='medium'] [data-lodariq-field-caption] {
    font-weight: var(--lq-weight-semibold);
  }

  .rich-content-form-field-preview[data-lodariq-field-label-weight='bold'] [data-lodariq-field-caption] {
    font-weight: var(--lq-weight-bold);
  }

  .rich-content-form-field-preview[data-lodariq-field-control-width='half'] input[type='text'] {
    width: 50%;
  }

  .rich-content-form-field-preview[data-lodariq-field-control-width='auto'] input[type='text'] {
    width: auto;
  }

  /*
   * The options inside a radio group, and a checkbox's own row — box then words.
   * This was written as a bare descendant selector, so it also caught the text
   * field's outer label and laid its caption beside the box no matter what the
   * creator chose. The runtime never had the bug, so the preview was lying.
   */
  .rich-content-form-field-preview fieldset label,
  .rich-content-form-field-preview[data-control='checkbox'] > label {
    display: flex;
    align-items: center;
    gap: var(--lq-field-gap, 8px);
    font-size: var(--lq-font-md);
  }

  .rich-content-form-field-preview input[type='text'] {
    box-sizing: border-box;
    width: 100%;
    height: 34px;
    border: 1px solid var(--lq-field-border, var(--lq-color-border));
    border-radius: 8px;
    background: var(--lq-field-fill, #ffffff);
    color: var(--lq-field-text, var(--lq-color-ink));
    font: inherit;
    padding: 0 10px;
  }

  .rich-content-form-field-preview[data-lodariq-field-radius='square'] input[type='text'] {
    border-radius: 0;
  }

  .rich-content-form-field-preview[data-lodariq-field-radius='soft'] input[type='text'] {
    border-radius: var(--lq-radius-sm);
  }

  .rich-content-form-field-preview[data-lodariq-field-radius='round'] input[type='text'] {
    border-radius: 999px;
  }

  .rich-content-form-field-preview[data-lodariq-field-size='compact'] input[type='text'] {
    height: 28px;
  }

  .rich-content-form-field-preview input[type='checkbox'],
  .rich-content-form-field-preview input[type='radio'] {
    width: 16px;
    height: 16px;
    accent-color: var(--lq-field-fill, var(--lq-color-primary));
  }

  .rich-content-form-field-preview[data-lodariq-field-size='compact'] input[type='checkbox'],
  .rich-content-form-field-preview[data-lodariq-field-size='compact'] input[type='radio'] {
    width: 14px;
    height: 14px;
  }

  .rich-content-form-field-options {
    display: grid;
    gap: 6px;
  }

  .rich-content-form-field-options > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
  }

  .rich-content-form-field-options .ui-button {
    min-height: var(--lq-control-sm);
    font-size: var(--lq-font-sm);
  }

  .storyboard-property-tray[data-tool-mode='content']
    .storyboard-property-control[data-property-id='formField.options'],
  .storyboard-property-tray[data-tool-mode='content'] .rich-content-form-field-note {
    grid-column: 1 / -1;
  }

  .rich-content-form-field-note {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.4;
  }

  .rich-content-toolbar {
    position: relative;
    z-index: 4;
    display: flex;
    min-width: 0;
    min-height: var(--lq-control-sm);
    flex-wrap: nowrap;
    align-items: center;
    gap: 4px;
    /*
     * No scrollbar. A control parked off the right edge of a 36px-tall bar is a
     * control nobody finds, and the horizontal scroll that revealed it was the
     * least discoverable affordance on the surface. Overflow belongs in the
     * More menu, which already re-offers whatever does not fit.
     */
    overflow: hidden;
    background: transparent;
    padding: 0;
  }

  .rich-content-toolbar-spacer {
    flex: 1 0 8px;
    min-width: 8px;
  }

  .rich-content-toolbar > button,
  .rich-content-toolbar-popover > button,
  .rich-content-color-control {
    display: inline-grid;
    width: var(--lq-control-sm);
    height: var(--lq-control-sm);
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
  }

  .rich-content-toolbar > button:hover,
  .rich-content-toolbar-popover > button:hover,
  .rich-content-color-control:hover,
  .rich-content-toolbar button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-content-toolbar button:disabled {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .rich-content-block-style-trigger {
    display: inline-flex !important;
    width: auto !important;
    min-width: 132px;
    justify-content: flex-start;
    gap: 8px;
    border: 1px solid var(--lq-color-border) !important;
    border-radius: var(--lq-radius-sm) !important;
    background: var(--lq-color-page) !important;
    color: var(--lq-color-ink) !important;
    padding: 0 12px;
  }

  .rich-content-block-style-trigger > span {
    flex: 1;
    text-align: left;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  /* Set by the bar's own measurement when the fixed items alone do not fit. */
  .rich-content-toolbar[data-block-type-label='hidden'] .rich-content-block-style-trigger {
    min-width: 0 !important;
    padding: 0 6px;
  }

  .rich-content-toolbar[data-block-type-label='hidden'] .rich-content-block-style-trigger > span {
    display: none;
  }

  .rich-content-toolbar-divider {
    width: 1px;
    height: 22px;
    flex: 0 0 1px;
    margin: 0 3px;
    background: var(--lq-color-border);
  }

  .rich-content-toolbar .ui-select-trigger {
    display: inline-flex;
    width: auto;
    min-width: 72px;
    height: var(--lq-control-sm);
    min-height: var(--lq-control-sm);
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 0 8px 0 12px;
  }

  .rich-content-font-size-trigger {
    width: 72px;
    min-width: 72px;
    flex: 0 0 72px;
  }

  .rich-content-color-control {
    position: relative;
  }

  .rich-content-color-control input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
    opacity: 0;
  }

  .rich-content-toolbar-popover {
    position: relative;
    display: inline-flex;
  }

  .rich-content-floating-layer {
    z-index: 340;
    box-sizing: border-box;
    width: max-content;
    max-width: min(var(--rich-content-floating-available-width, calc(100vw - 16px)), calc(100vw - 16px));
    max-height: var(--rich-content-floating-available-height, calc(100vh - 16px));
  }

  /**
   * panel, not page: a menu is a surface, and the page is the ground it floats
   * over. They happened to be the same white in the workspace, so the distinction
   * cost nothing there — but over a customer's product the ground is transparent,
   * and the menu rendered as bare text on whatever was underneath.
   */
  .rich-content-menu,
  .rich-content-emoji-picker,
  .rich-content-picker-loading {
    box-sizing: border-box;
    max-width: 100%;
    max-height: var(--rich-content-floating-available-height, calc(100vh - 16px));
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    box-shadow: var(--lq-shadow-popover);
    color: var(--lq-color-ink);
  }

  .rich-content-picker-loading {
    display: inline-flex;
    min-width: 120px;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    padding: 8px;
  }

  /* Failure stays the size of the panel that failed, and offers the way out. */
  .rich-content-picker-error {
    display: grid;
    min-width: 180px;
    justify-items: start;
    gap: 8px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    padding: 12px;
  }

  .rich-content-picker-error button {
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    cursor: pointer;
    font: inherit;
    font-weight: var(--lq-weight-semibold);
    padding: 5px 10px;
  }

  .rich-content-picker-error button:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink-strong);
  }

  .rich-content-menu {
    display: grid;
    min-width: 190px;
    gap: 4px;
    overflow: auto;
    padding: 8px;
  }

  .rich-content-menu button,
  .rich-content-upload-button {
    display: flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    font: inherit;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 0 12px;
  }

  .rich-content-menu button:hover,
  .rich-content-upload-button:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .rich-content-link-menu {
    width: 276px;
  }

  .rich-content-link-menu label,
  .rich-content-animation-menu label {
    display: grid;
    gap: 4px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .rich-content-link-menu input,
  .rich-content-animation-menu input,
  .rich-content-icon-menu > input,
  .rich-content-emoji-picker > input {
    box-sizing: border-box;
    width: 100%;
    height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    outline: none;
    padding: 0 12px;
  }

  .rich-content-animation-menu {
    width: 242px;
  }

  .rich-content-more-menu {
    min-width: 252px;
    max-width: 320px;
  }

  .rich-content-more-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .rich-content-slash-hint {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 4px 12px 0;
  }

  .rich-content-floating-layer.rich-content-inspector-popover {
    width: 320px;
    max-width: min(320px, calc(100vw - 24px));
  }

  .rich-content-inspector-popover .storyboard-property-tray {
    width: 320px;
    max-height: 360px;
    overflow: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-page);
    box-shadow: var(--lq-shadow-popover);
  }

  .rich-content-inspector-popover .storyboard-tray-handle {
    display: none;
  }

  .rich-content-animation-select {
    width: 100%;
  }

  .rich-content-animation-number {
    display: flex;
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    padding-right: 12px;
  }

  .rich-content-animation-number input {
    border: 0;
  }

  .rich-content-icon-menu {
    width: 310px;
  }

  .rich-content-icon-grid {
    display: grid;
    max-height: 214px;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    overflow-y: auto;
  }

  .rich-content-icon-color-control {
    display: flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    padding: 0 12px;
  }

  .rich-content-icon-color-control input {
    width: 36px;
    height: 24px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    cursor: pointer;
    padding: 2px;
  }

  .rich-content-icon-grid > button {
    width: 36px;
    height: 36px;
    justify-content: center;
    padding: 0;
  }

  .rich-content-media-error {
    margin: 0;
    border-radius: var(--lq-radius-sm);
    background: #fff3f1;
    color: #9f2f25;
    font-size: var(--lq-font-xs);
    line-height: 1.35;
    padding: 8px 12px;
  }

  .rich-content-library-option {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    cursor: pointer;
    margin: 2px 4px 6px;
    padding: 8px;
  }

  .rich-content-library-option > input {
    width: 14px;
    height: 14px;
    margin: 1px 0 0;
    accent-color: var(--lq-color-primary);
  }

  .rich-content-library-option > span {
    display: grid;
    gap: 2px;
  }

  .rich-content-library-option strong {
    font-size: var(--lq-font-sm);
    line-height: 1.25;
  }

  .rich-content-library-option small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.35;
  }

  .rich-content-upload-button {
    position: relative;
  }

  .rich-content-upload-button input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .rich-content-emoji-picker {
    display: grid;
    width: min(330px, var(--rich-content-floating-available-width, 330px));
    height: min(310px, var(--rich-content-floating-available-height, 310px));
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    padding: 8px;
  }

  .rich-content-emoji-picker > input {
    margin-bottom: 7px;
  }

  .rich-content-emoji-picker [role='grid'],
  .rich-content-emoji-picker [role='listbox'] {
    overflow-y: auto;
  }

  .rich-content-emoji-picker button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    font-size: var(--lq-font-xl);
  }

  .rich-content-emoji-picker button:hover {
    background: var(--lq-color-primary-soft);
  }

  .rich-content-canvas-shell {
    position: relative;
    min-width: 0;
    min-height: 132px;
  }

  .rich-content-canvas {
    position: relative;
    z-index: 1;
    min-height: 112px;
    color: inherit;
    font: inherit;
    line-height: 1.55;
    outline: none;
  }

  .rich-content-canvas ::selection {
    background: color-mix(
      in srgb,
      var(--lq-popup-text, var(--lq-tour-text-color, var(--lq-color-primary))) 28%,
      transparent
    );
    color: inherit;
    text-shadow: none;
  }

  .rich-content-placeholder {
    position: absolute;
    top: 2px;
    left: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-md);
    pointer-events: none;
  }

  /*
   * A 22px column in the card's own gutter (§4.2a rule 6). Grip, insert, options
   * — stacked, so the block's first line stays the leftmost thing a creator
   * reads, and nothing Lodariq draws sits inside the published card box.
   */
  .rich-content-block-handles {
    z-index: 330;
    display: flex;
    width: 22px;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .rich-content-block-handles button,
  .rich-content-block-handles > .rich-content-toolbar-popover > button {
    display: inline-grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border: 0;
    border-radius: 5px;
    background: color-mix(in srgb, var(--lq-color-chrome) 90%, transparent);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    padding: 0;
  }

  .rich-content-block-handles button:hover,
  .rich-content-block-handles > .rich-content-toolbar-popover > button:hover,
  .rich-content-block-handles > .rich-content-toolbar-popover > button[aria-expanded='true'] {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink-strong);
  }

  .rich-content-block-grip {
    cursor: grab;
    -webkit-user-drag: element;
  }

  .rich-content-drop-indicator {
    z-index: 335;
    height: 3px;
    border-radius: 2px;
    background: var(--lq-color-primary);
    box-shadow: 0 0 6px color-mix(in srgb, var(--lq-color-primary) 45%, transparent);
    pointer-events: none;
    transform: translateY(-1px);
  }

  /*
   * Sized by the grid, not by a column of rows: four tiles wide enough to hold
   * "Icon + text" on one line is what the menu measures, and 236px forced every
   * two-word label to wrap.
   */
  .rich-content-insert-menu {
    width: max-content;
    min-width: 236px;
    max-width: 360px;
    padding: 5px;
    gap: 0;
  }

  .rich-content-insert-menu > input,
  .rich-content-insert-menu .rich-content-icon-menu > input {
    box-sizing: border-box;
    width: 100%;
    height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    outline: none;
    padding: 0 12px;
  }

  .rich-content-insert-options {
    display: grid;
    max-height: 250px;
    gap: 2px;
    overflow-y: auto;
  }

  /*
   * Four-up (§4.2a). A block type is recognised by its shape before its label is
   * read, so the insert menu is a grid of shapes rather than a column of rows —
   * fourteen rows is a list nobody scans to the bottom of.
   */
  .rich-content-insert-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 4px;
  }

  .rich-content-insert-grid > button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    /* Regular: the tile is read by its shape, and bold labels fought the icons. */
    font-weight: var(--lq-weight-regular);
    padding: 8px 4px;
    text-align: center;
  }

  .rich-content-insert-grid > button:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink-strong);
  }

  .rich-content-insert-heading {
    margin: 0;
    padding: 7px 9px 5px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .rich-content-insert-separator {
    height: 1px;
    margin: 4px 0;
    background: var(--lq-color-menu-border);
  }

  .rich-content-insert-note {
    margin: 0;
    padding: 6px 9px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .rich-content-insert-empty {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    padding: 8px 12px;
  }

  .rich-content-insert-media {
    display: grid;
    gap: 4px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 8px;
  }

  .rich-content-insert-media > small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    padding: 0 12px 4px;
  }

  .rich-content-insert-back {
    width: max-content;
    min-height: var(--lq-control-sm) !important;
    color: var(--lq-color-muted) !important;
    font-size: var(--lq-font-sm) !important;
  }

  .rich-content-emoji-menu {
    display: grid;
    gap: 5px;
  }

  .rich-content-emoji-menu .rich-content-emoji-picker {
    border: 0;
    box-shadow: none;
  }

  .rich-content-block-settings-menu {
    width: 196px;
  }

  .rich-content-block-settings-menu > .rich-content-spacing-control {
    display: flex;
    justify-content: space-between;
    padding: 2px 9px;
  }

  .rich-content-block-delete {
    color: #9f2f25 !important;
  }

  .rich-content-block-delete:hover {
    background: #fff3f1 !important;
  }

  .rich-content-paragraph,
  .rich-content-heading,
  .rich-content-list,
  .rich-content-callout,
  .rich-content-stat {
    margin: 0 0 var(--lq-tour-spacing, 8px);
  }

  .rich-content-heading {
    color: inherit;
    font-size: var(--lq-tour-base-font-size, 20px);
    font-weight: var(--lq-tour-heading-font-weight, 720);
    line-height: var(--lq-tour-heading-line-height, 1.25);
    margin-bottom: calc(var(--lq-tour-spacing, 8px) * 0.5);
  }

  .rich-content-paragraph {
    color: var(--lq-popup-muted-text, var(--lq-tour-muted-text-color, inherit));
    font-size: var(--lq-tour-small-font-size, inherit);
    line-height: var(--lq-tour-body-line-height, 1.55);
  }

  .rich-content-list {
    color: inherit;
    font-size: var(--lq-tour-small-font-size, inherit);
    line-height: var(--lq-tour-body-line-height, 1.55);
    padding-left: 24px;
  }

  .rich-content-callout {
    border-left: 3px solid var(--lq-tour-focus-color, var(--lq-color-primary));
    border-radius: var(--lq-tour-radius-sm, 8px);
    background: var(--lq-tour-secondary-surface, var(--lq-color-primary-soft));
    color: inherit;
    padding: var(--lq-tour-space-sm, 9px);
  }

  /*
   * The chip that names what this step points at. It takes the brand accent
   * rather than creator chrome: it renders inside the published card, so it has
   * to look like part of the customer's product, not part of Lodariq.
   */
  .rich-content-target-chip {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    width: fit-content;
    border: 1px solid
      color-mix(in srgb, var(--lq-tour-focus-color, var(--lq-color-primary)) 22%, transparent);
    border-radius: 20px;
    background: color-mix(
      in srgb,
      var(--lq-tour-focus-color, var(--lq-color-primary)) 12%,
      var(--lq-tour-secondary-surface, transparent)
    );
    color: var(--lq-tour-focus-color, var(--lq-color-primary));
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 4px 9px;
  }

  /*
   * The crosshair is drawn as a mask rather than an inline SVG child: Lexical
   * owns this element's children and would export any DOM added here as content.
   */
  .rich-content-target-chip::before {
    display: block;
    width: 13px;
    height: 13px;
    flex: none;
    background: currentColor;
    content: '';
    mask: var(--lq-glyph-target) center / contain no-repeat;
    -webkit-mask: var(--lq-glyph-target) center / contain no-repeat;
  }

  /* The three states are the document's own ValidationLevel, no more. */
  .rich-content-validation-badge {
    display: flex;
    width: fit-content;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    border: 1px solid;
    border-radius: 7px;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 4px 9px;
  }

  .rich-content-validation-badge[data-validation-state='ready'] {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success-ink);
  }

  .rich-content-validation-badge[data-validation-state='incomplete'] {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning-ink);
  }

  .rich-content-validation-badge[data-validation-state='invalid'] {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger-ink);
  }

  .rich-content-stat {
    color: inherit;
    font-size: 24px;
    font-weight: var(--lq-weight-bold);
    line-height: 1.2;
  }

  .rich-content-link {
    color: var(--lq-color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .rich-content-button-preview-shell {
    position: relative;
    display: grid;
    width: fit-content;
    max-width: 100%;
    gap: 8px;
    outline: none;
  }

  .rich-content-button-preview-shell::after {
    position: absolute;
    inset: -2px;
    border: 1px dashed transparent;
    border-radius: 10px;
    content: '';
    pointer-events: none;
  }

  .rich-content-button-preview-shell:hover::after,
  .rich-content-button-preview-shell:focus-visible::after,
  .rich-content-button-preview-shell[data-resizing]::after {
    border-color: var(--lq-color-primary);
  }

  .rich-content-button-preview-shell[data-resizing] {
    user-select: none;
  }

  .rich-content-button-preview-shell[data-lodariq-action-width='fill'] {
    width: 100%;
  }

  .rich-content-button-preview-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .rich-content-button-preview {
    min-height: 40px;
    border: var(--lq-tour-border-width, 1px) solid var(--lq-action-border, transparent);
    border-radius: var(--lq-tour-radius, 8px);
    background: var(--lq-action-fill, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    color: var(--lq-action-text, var(--lq-tour-primary-text, #ffffff));
    cursor: pointer;
    font: inherit;
    font-size: inherit;
    font-weight: var(--lq-tour-action-font-weight, 700);
    padding: var(--lq-tour-space-xs, 8px) var(--lq-tour-space-sm, 16px);
  }

  .rich-content-button-preview-shell[data-lodariq-action-width='fill'] .rich-content-button-preview,
  .rich-content-button-preview-shell[data-lodariq-action-width='custom'] .rich-content-button-preview {
    width: 100%;
  }

  /*
   * A definite width, not a percentage. The decorator span that wraps this shell
   * hugs its contents, so a percentage measured the button's own label — a
   * dragged width committed to the document and changed nothing on screen. The
   * shell's own max-width still holds it inside the card.
   */
  .rich-content-button-preview-shell[data-lodariq-action-width='custom'] {
    width: var(--lq-action-width, 100%);
  }

  .rich-content-button-preview[data-variant='secondary'] {
    border-color: var(--lq-action-border, var(--lq-tour-border-color, var(--lq-color-border)));
    background: var(--lq-action-fill, var(--lq-tour-secondary-surface, var(--lq-color-primary-soft)));
    color: var(--lq-action-text, var(--lq-tour-secondary-text, var(--lq-color-primary)));
  }

  .rich-content-button-preview[data-variant='subtle'],
  .rich-content-button-preview[data-variant='link'] {
    background: var(--lq-action-fill, transparent);
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-content-button-preview[data-variant='outline'] {
    border-color: var(--lq-action-border, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-content-bold { font-weight: var(--lq-weight-bold); }
  .rich-content-italic { font-style: italic; }
  .rich-content-underline { text-decoration: underline; }

  .rich-content-canvas [style*='--lq-inline-motion: fade'] {
    animation: lq-rich-inline-fade var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) both;
  }

  .rich-content-canvas [style*='--lq-inline-motion: lift'] {
    animation: lq-rich-inline-lift var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) both;
  }

  .rich-content-canvas [style*='--lq-inline-motion: scale'] {
    animation: lq-rich-inline-scale var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) both;
  }

  .rich-content-canvas [style*='--lq-inline-motion: pulse'] {
    animation: lq-rich-inline-pulse var(--lq-inline-motion-duration)
      var(--lq-inline-motion-timing) 2;
  }

  @keyframes lq-rich-inline-fade { from { opacity: 0; } }
  @keyframes lq-rich-inline-lift { from { opacity: 0; transform: translateY(8px); } }
  @keyframes lq-rich-inline-scale { from { opacity: 0; transform: scale(0.97); } }
  @keyframes lq-rich-inline-pulse { 50% { transform: scale(1.03); } }

  @media (prefers-reduced-motion: reduce) {
    .rich-content-canvas [style*='--lq-inline-motion'] {
      animation: none;
    }
  }

  .rich-content-icon-node {
    display: inline-flex;
    margin: 0 4px 0 0;
    vertical-align: middle;
  }

  .rich-content-media-node,
  .rich-content-form-field-node {
    display: inline-block;
    width: 100%;
    max-width: 100%;
    vertical-align: middle;
  }

  .rich-content-button-node {
    display: inline-block;
    width: auto;
    max-width: 100%;
    vertical-align: middle;
  }

  /* ponytail: group consecutive Lexical button paragraphs with CSS instead of an action-group node. Ceiling: a paragraph that mixes text and a button joins the action row. Upgrade: wrap consecutive action nodes like runtime appendStepBody. */
  .rich-step-content[data-lodariq-composition-gap='none'] {
    --lq-tour-action-gap: 0px;
  }

  .rich-step-content[data-lodariq-composition-gap='tight'] {
    --lq-tour-action-gap: var(--lq-tour-space-xs, 4px);
  }

  .rich-step-content[data-lodariq-composition-gap='normal'] {
    --lq-tour-action-gap: var(--lq-tour-space-sm, 8px);
  }

  .rich-step-content[data-lodariq-composition-gap='relaxed'] {
    --lq-tour-action-gap: var(--lq-tour-space-md, 16px);
  }

  .rich-step-content[data-lodariq-content-align='center'] .rich-content-paragraph,
  .rich-step-content[data-lodariq-content-align='center'] .rich-content-heading,
  .rich-step-content[data-lodariq-content-align='center'] .rich-content-callout,
  .rich-step-content[data-lodariq-content-align='center'] .rich-content-list,
  .rich-step-content[data-lodariq-content-align='center'] .rich-content-stat {
    text-align: center;
  }

  .rich-step-content[data-lodariq-content-align='right'] .rich-content-paragraph,
  .rich-step-content[data-lodariq-content-align='right'] .rich-content-heading,
  .rich-step-content[data-lodariq-content-align='right'] .rich-content-callout,
  .rich-step-content[data-lodariq-content-align='right'] .rich-content-list,
  .rich-step-content[data-lodariq-content-align='right'] .rich-content-stat {
    text-align: right;
  }

  .rich-content-canvas > :has(.rich-content-button-node),
  .rich-content-canvas > :has(.rich-content-media-node) {
    margin-bottom: 0;
  }

  .rich-content-canvas > :has(.rich-content-media-node) {
    margin: var(--lq-tour-spacing, 8px) 0;
  }

  .rich-step-content[data-lodariq-action-layout='inline'] .rich-content-editor,
  .rich-step-content[data-lodariq-action-layout='inline'] .rich-content-canvas-shell,
  .rich-step-content[data-lodariq-action-layout='inline'] .rich-content-canvas {
    width: 100%;
  }

  .rich-step-content[data-lodariq-action-layout='inline'] .rich-content-canvas {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--lq-tour-action-gap, var(--lq-tour-space-sm, 8px));
  }

  .rich-step-content[data-lodariq-action-layout='inline']
    .rich-content-canvas
    > :not(:has(.rich-content-button-node)) {
    flex: 1 1 100%;
  }

  .rich-step-content[data-lodariq-action-layout='inline']
    .rich-content-canvas
    > :has(.rich-content-button-node) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--lq-tour-action-gap, var(--lq-tour-space-sm, 8px));
    flex: 0 0 auto;
    width: max-content;
    max-width: 100%;
    min-width: 0;
  }

  .rich-step-content[data-lodariq-action-layout='inline']
    .rich-content-canvas
    > :has(.rich-content-button-node ~ .rich-content-button-node) {
    flex: 1 1 100%;
    width: 100%;
  }

  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='center']
    .rich-content-canvas {
    justify-content: center;
  }

  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='end']
    .rich-content-canvas {
    justify-content: flex-end;
  }

  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas {
    justify-content: space-between;
  }

  /* ponytail: each Lexical button lives in a hug paragraph, so flex-grow eats the
     free space space-between needs. Auto margin on every action except the last in a
     run matches runtime .tour-action-group { justify-content: space-between }. Ceiling:
     a non-action sibling on the same flex line steals the trailing edge. Upgrade: wrap
     consecutive actions like appendStepBody. */
  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node):has(+ :has(.rich-content-button-node)) {
    flex: 0 0 auto;
    width: max-content;
    margin-inline-end: auto;
  }

  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node ~ .rich-content-button-node) {
    flex: 1 1 100%;
    width: 100%;
    margin-inline-end: 0;
    justify-content: space-between;
  }

  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node):has([data-lodariq-action-width='fill']),
  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node):has([data-lodariq-action-width='custom']) {
    flex: 1 1 0;
    width: auto;
    margin-inline-end: 0;
  }

  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node):has([data-lodariq-action-width='fill'])
    .rich-content-button-preview-shell,
  .rich-step-content[data-lodariq-action-layout='inline'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node):has([data-lodariq-action-width='fill'])
    .rich-content-button-preview {
    width: 100%;
  }

  .rich-step-content[data-lodariq-action-layout='stack'] .rich-content-canvas {
    display: flex;
    flex-direction: column;
  }

  .rich-step-content[data-lodariq-action-layout='stack']
    .rich-content-canvas
    > :has(.rich-content-button-node) {
    width: max-content;
    max-width: 100%;
  }

  .rich-step-content[data-lodariq-action-layout='stack']
    .rich-content-canvas
    > :has(.rich-content-button-node)
    + :has(.rich-content-button-node) {
    margin-block-start: var(--lq-tour-action-gap, var(--lq-tour-space-sm, 8px));
  }

  .rich-step-content[data-lodariq-action-layout='stack'][data-lodariq-action-align='center']
    .rich-content-canvas
    > :has(.rich-content-button-node) {
    align-self: center;
  }

  .rich-step-content[data-lodariq-action-layout='stack'][data-lodariq-action-align='end']
    .rich-content-canvas
    > :has(.rich-content-button-node) {
    align-self: flex-end;
  }

  .rich-step-content[data-lodariq-action-layout='stack'][data-lodariq-action-align='stretch']
    .rich-content-canvas
    > :has(.rich-content-button-node),
  .rich-step-content[data-lodariq-action-layout='stack'][data-lodariq-action-align='stretch']
    .rich-content-button-node,
  .rich-step-content[data-lodariq-action-layout='stack'][data-lodariq-action-align='stretch']
    .rich-content-button-preview-shell,
  .rich-step-content[data-lodariq-action-layout='stack'][data-lodariq-action-align='stretch']
    .rich-content-button-preview {
    width: 100%;
  }

  .rich-content-icon-preview {
    display: inline-grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 9px;
    background: var(--lq-color-panel);
    color: var(--lq-color-primary);
  }

  .rich-content-icon-node[data-rich-selected='true'] .rich-content-icon-preview,
  .rich-content-divider-node[data-rich-selected='true'] .rich-content-divider,
  .rich-content-icon-preview:focus-visible,
  .rich-content-divider:focus-visible {
    background: color-mix(in srgb, var(--lq-color-primary) 12%, #ffffff);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lq-color-primary) 20%, transparent);
  }

  .rich-content-media-node[data-rich-selected='true'] .rich-content-media-frame::after {
    border-color: var(--lq-color-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--lq-color-primary) 18%, transparent);
  }

  .rich-content-media-preview {
    position: relative;
    display: grid;
    width: var(--rich-media-width, 100%);
    box-sizing: border-box;
    gap: 6px;
    margin: 2px 0 6px;
    outline: none;
  }

  .rich-content-media-frame {
    position: relative;
    width: 100%;
    height: var(--rich-media-height, auto);
    min-height: 0;
  }

  .rich-content-media-preview[data-uploading='true'] .rich-content-media-frame {
    overflow: hidden;
    border-radius: 9px;
    background: var(--lq-color-panel);
  }

  .rich-content-media-upload-progress {
    position: absolute;
    z-index: 5;
    top: 0;
    right: 0;
    left: 0;
    height: 3px;
    overflow: hidden;
    background: color-mix(in srgb, var(--lq-color-primary) 18%, transparent);
  }

  .rich-content-media-upload-progress > span {
    display: block;
    height: 100%;
    background: var(--lq-color-primary);
    box-shadow: 0 0 8px color-mix(in srgb, var(--lq-color-primary) 55%, transparent);
    transition: width 140ms ease;
  }

  .rich-content-media-frame::after {
    position: absolute;
    inset: -2px;
    border: 1px dashed transparent;
    border-radius: 10px;
    content: '';
    pointer-events: none;
  }

  .rich-content-media-preview:hover .rich-content-media-frame::after,
  .rich-content-media-preview:focus-visible .rich-content-media-frame::after,
  .rich-content-media-preview[data-resizing] .rich-content-media-frame::after {
    border-color: var(--lq-color-primary);
  }

  .rich-content-media-preview[data-resizing] {
    user-select: none;
  }

  .rich-content-media-preview[data-resizing='e'],
  .rich-content-media-preview[data-resizing='w'] {
    cursor: ew-resize;
  }

  .rich-content-media-preview[data-resizing='n'],
  .rich-content-media-preview[data-resizing='s'] {
    cursor: ns-resize;
  }

  .rich-content-media-preview[data-resizing='ne'],
  .rich-content-media-preview[data-resizing='sw'] {
    cursor: nesw-resize;
  }

  .rich-content-media-preview[data-resizing='nw'],
  .rich-content-media-preview[data-resizing='se'] {
    cursor: nwse-resize;
  }

  .rich-content-media-preview[data-resizing] video {
    pointer-events: none;
  }

  .rich-content-media-preview img,
  .rich-content-media-preview video {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: var(--lq-tour-radius-sm, 9px);
    background: var(--lq-color-panel);
    object-fit: var(--rich-media-fit, contain);
  }

  .rich-content-media-preview:not([data-fixed-height]) img,
  .rich-content-media-preview:not([data-fixed-height]) video {
    height: auto;
    max-height: 220px;
  }

  .rich-content-media-unavailable small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .edge-resize-handle,
  .rich-content-media-resize-edge {
    position: absolute;
    z-index: 3;
    touch-action: none;
  }

  .edge-resize-handle[data-edge='n'],
  .edge-resize-handle[data-edge='s'],
  .rich-content-media-resize-edge[data-edge='n'],
  .rich-content-media-resize-edge[data-edge='s'] {
    right: 10px;
    left: 10px;
    height: 10px;
    cursor: ns-resize;
  }

  .edge-resize-handle[data-edge='n'] { top: -5px; }
  .edge-resize-handle[data-edge='s'] { bottom: -5px; }

  .edge-resize-handle[data-edge='e'],
  .edge-resize-handle[data-edge='w'] {
    top: 10px;
    bottom: 10px;
    width: 10px;
    cursor: ew-resize;
  }

  .edge-resize-handle[data-edge='e'] { right: -5px; }
  .edge-resize-handle[data-edge='w'] { left: -5px; }

  .edge-resize-handle:is([data-edge='ne'], [data-edge='se'], [data-edge='sw'], [data-edge='nw']) {
    width: 14px;
    height: 14px;
  }

  .edge-resize-handle[data-edge='ne'] {
    top: -7px;
    right: -7px;
    cursor: nesw-resize;
  }

  .edge-resize-handle[data-edge='se'] {
    right: -7px;
    bottom: -7px;
    cursor: nwse-resize;
  }

  .edge-resize-handle[data-edge='sw'] {
    bottom: -7px;
    left: -7px;
    cursor: nesw-resize;
  }

  .edge-resize-handle[data-edge='nw'] {
    top: -7px;
    left: -7px;
    cursor: nwse-resize;
  }

  .rich-content-media-fit-control {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 4;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    opacity: 0;
    padding: 4px 6px;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  .rich-content-media-preview:hover .rich-content-media-fit-control,
  .rich-content-media-preview:focus-within .rich-content-media-fit-control,
  .rich-content-media-preview[data-resizing] .rich-content-media-fit-control {
    opacity: 1;
    pointer-events: auto;
  }

  .rich-content-media-fit-select {
    max-width: 142px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font: inherit;
    outline: none;
    padding: 0 4px;
  }

  .rich-content-media-unavailable {
    display: grid;
    min-height: 88px;
    place-content: center;
    gap: 3px;
    border: 1px dashed var(--lq-color-border);
    border-radius: 9px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    text-align: center;
  }

  .rich-content-divider {
    margin: 12px 0;
    border: 0;
    border-top: 1px solid var(--lq-color-border);
    outline: none;
  }

  .rich-content-spacing-control {
    display: inline-flex;
    height: var(--lq-control-sm);
    align-items: center;
    gap: 8px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);

    span {
      white-space: nowrap;
    }
  }

  .rich-content-spacing-control > span:last-child {
    display: inline-flex;
    height: var(--lq-control-sm);
    align-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-muted);
    padding-right: 8px;
  }

  .rich-content-spacing-control input {
    width: 42px;
    height: 32px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font: inherit;
    outline: none;
    padding-left: 7px;
  }

  .sequence-property-editor {
    gap: 10px;
    border-color: var(--lq-color-border-soft);
    background: #ffffff;
    padding: 12px;
  }

  .sequence-summary-header > span {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .sequence-summary-header small {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .sequence-summary-header strong {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .sequence-summary-strip {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr) auto minmax(150px, 1fr);
    align-items: center;
    gap: 8px;
  }

  .sequence-summary-card {
    display: grid;
    min-width: 0;
    min-height: 56px;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 9px;
    background: #ffffff;
    padding: 8px 10px;
  }

  .sequence-summary-card > svg {
    color: var(--lq-color-primary);
  }

  .sequence-summary-card > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .sequence-summary-card strong {
    overflow: hidden;
    font-size: var(--lq-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-summary-card small {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-summary-arrow {
    color: #98a2b3;
  }

  .sequence-details {
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 8px;
  }

  .sequence-details > summary {
    width: max-content;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .sequence-details-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    padding-top: 12px;
  }

  .sequence-editor-actions {
    display: flex;
    justify-content: flex-end;
  }

  .sequence-guided-card,
  .sequence-recovery-card {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: var(--lq-space-2);
    margin: 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    padding: var(--lq-space-3);
  }

  .sequence-guided-card > legend,
  .sequence-recovery-card > legend {
    display: inline-flex;
    align-items: center;
    gap: var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding-inline: var(--lq-space-1);
  }

  .sequence-guided-card > legend > span {
    display: inline-grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: 8px;
  }

  .sequence-guided-card > .ui-field,
  .sequence-guided-card > .ui-select-trigger,
  .sequence-recovery-card .ui-field,
  .sequence-recovery-card .ui-select-trigger,
  .sequence-wait-row > .ui-field,
  .sequence-wait-row > .ui-select-trigger {
    width: 100%;
    min-width: 0;
  }

  .sequence-guided-card .ui-input,
  .sequence-guided-card .ui-select-trigger,
  .sequence-recovery-card .ui-input,
  .sequence-recovery-card .ui-select-trigger {
    min-height: var(--lq-control-sm);
    font-size: var(--lq-font-xs);
  }

  .sequence-wait-row {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-2);
  }

  .sequence-wait-row > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .sequence-wait-row > .ui-button {
    min-height: var(--lq-control-sm);
    justify-self: end;
  }

  .sequence-recovery-card,
  .sequence-details-grid > .sequence-recovery-card,
  .sequence-details-grid > .ui-button {
    grid-column: 1 / -1;
  }

  .sequence-timeout-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-3);
  }

  .sequence-native-field {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .sequence-native-field > span {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
  }

`;
