/** Approved review and recovery workspace. */
export const AUTHORING_AGREED_REVIEW_CSS = `
  /* Review and recovery is a proper workspace, not an empty disclosure. */
  .panel-review-workspace {
    grid-template-rows: 56px minmax(0, 1fr);
  }

  .tour-review-workspace {
    display: grid;
    min-height: 0;
    height: 100%;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    background: #ffffff;
    padding: 0;
  }

  .panel-advanced-workspace .tour-review-workspace.panel-advanced-editor,
  .tour-review-workspace {
    overflow: hidden;
  }

  .tour-review-main {
    display: grid;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 14px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 20px 14px;
    scrollbar-gutter: stable;
  }

  .tour-review-main:not([data-active-section='none']) {
    grid-template-columns: minmax(260px, 0.38fr) minmax(0, 1fr);
    align-items: start;
  }

  .tour-review-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding-bottom: 12px;
  }

  .tour-review-header > button {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: 10px;
    padding-inline: 10px;
  }

  .tour-review-header > span:nth-child(2) {
    display: grid;
    gap: 3px;
  }

  .tour-review-header small {
    color: var(--lq-color-muted);
    font-size: 8px;
    text-transform: uppercase;
  }

  .tour-review-header strong {
    font-size: 12px;
  }

  .tour-review-save {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--lq-color-primary);
    font-size: 9px;
    font-weight: 700;
  }

  .tour-review-list {
    display: grid;
    min-width: 0;
    align-content: start;
  }

  .tour-review-row {
    display: grid;
    min-height: 50px;
    grid-template-columns: 28px minmax(0, 1fr) auto 18px;
    align-items: center;
    gap: 9px;
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: #ffffff;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 6px;
    text-align: left;
  }

  .tour-review-row:hover,
  .tour-review-row:focus-visible,
  .tour-review-row[aria-expanded='true'] {
    background: #f7faf9;
  }

  .tour-review-row[aria-expanded='true'] {
    box-shadow: inset 2px 0 0 var(--lq-color-primary);
  }

  .tour-review-row-icon {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    color: var(--lq-color-primary);
  }

  .tour-review-row[data-tone='attention'] .tour-review-row-icon,
  .tour-review-row[data-tone='attention'] .tour-review-row-detail {
    color: #a14f14;
  }

  .tour-review-row-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .tour-review-row-copy strong {
    font-size: 10px;
  }

  .tour-review-row-copy small,
  .tour-review-row-detail {
    color: var(--lq-color-muted);
    font-size: 9px;
  }

  .tour-review-row-detail {
    color: var(--lq-color-primary);
    font-weight: 700;
  }

  .tour-review-detail {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 10px;
  }

  .tour-review-detail > .ui-button:first-child {
    min-height: 30px;
    justify-self: start;
  }

  .tour-review-detail > .flow-settings-editor {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(220px, 1fr) auto;
    align-items: end;
    gap: 10px 12px;
    margin: 0;
    border: 1px solid var(--lq-color-primary-border);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-primary-soft);
    padding: 12px;
  }

  .tour-review-detail > .flow-settings-editor > legend {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding-inline: 4px;
  }

  .tour-review-detail > .flow-settings-editor > label,
  .tour-review-detail > .flow-settings-editor > .ui-field {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .tour-review-detail > .flow-settings-editor > label > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .tour-review-detail > .tour-checkpoint-editor > ul {
    display: grid;
    grid-column: 1 / -1;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tour-review-detail > .tour-checkpoint-editor > ul > li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
    align-items: center;
    gap: 6px;
  }

  .tour-review-detail > .tour-completion-editor > .ui-field,
  .tour-review-detail > .tour-completion-editor > label:nth-of-type(n + 2) {
    grid-column: 1 / -1;
  }

  .tour-review-note {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid #e8c5aa;
    border-radius: 10px;
    background: #fff9f4;
    color: #8a4211;
    padding: 10px 12px;
  }

  .tour-review-note > span {
    display: grid;
    gap: 3px;
  }

  .tour-review-note strong {
    font-size: 10px;
  }

  .tour-review-note small {
    font-size: 9px;
  }

`;
