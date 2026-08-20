/** Approved transition and branch rule editor. */
export const AUTHORING_AGREED_BRANCHING_CSS = `
  /* Branch rules are ordered path cards, never a cramped side column. */
  .transition-editor {
    display: grid;
    min-width: 0;
    gap: 12px;
    border-top: 1px solid var(--lq-color-border-soft);
    border-left: 0;
    padding: 12px 0 0;
  }

  .transition-editor[data-branch-state='empty'] {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 10px;
    background: #fbfcfb;
    padding: 10px 12px;
  }

  .transition-editor-header,
  .transition-editor-heading,
  .transition-header-actions {
    display: flex;
    min-width: 0;
    align-items: center;
  }

  .transition-editor-header {
    justify-content: space-between;
    gap: 16px;
  }

  .transition-editor-heading {
    gap: 10px;
  }

  .transition-editor-heading > svg {
    flex: 0 0 auto;
    color: var(--lq-color-primary);
  }

  .transition-editor-heading > span {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .transition-editor-heading strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .transition-editor-heading small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .transition-guidance {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .transition-header-actions {
    flex: 0 0 auto;
    gap: 4px;
  }

  .transition-header-actions .ui-button,
  .transition-editor[data-branch-state='empty'] .ui-button {
    min-height: 32px;
  }

  .transition-path-list {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 220px);
    align-items: start;
    gap: 10px;
  }

  .transition-rule-tabs {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding-bottom: 4px;
    scrollbar-width: thin;
  }

  .transition-rule-tabs button {
    display: inline-flex;
    min-height: 26px;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding-inline: 8px;
  }

  .transition-rule-tabs button > span {
    display: grid;
    width: 18px;
    height: 18px;
    place-items: center;
    border-radius: 999px;
    background: #eef2f1;
    font-size: 8px;
  }

  .transition-rule-tabs button[aria-current='page'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .transition-rule-tabs button[aria-current='page'] > span {
    background: var(--lq-color-primary);
    color: #ffffff;
  }

  .transition-rule,
  .transition-fallback-card {
    min-width: 0;
    margin: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 10px;
    background: #ffffff;
    padding: 8px;
  }

  .transition-rule > legend {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-inline: 2px;
  }

  .transition-rule > legend > span:last-child {
    display: grid;
    gap: 2px;
  }

  .transition-rule > legend strong {
    font-size: var(--lq-font-xs);
  }

  .transition-rule > legend small {
    color: var(--lq-color-muted);
    font-size: 8px;
  }

  .transition-rule-prompt {
    margin: var(--lq-space-1) 0 0;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
  }

  .transition-rule-number,
  .transition-fallback-mark {
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .transition-condition-list {
    display: grid;
    gap: 8px;
    padding-top: 4px;
  }

  .transition-condition {
    position: relative;
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) var(--lq-control-sm);
    align-items: start;
    gap: 8px;
    border-radius: 8px;
    background: #f7faf9;
    padding: var(--lq-space-2);
  }

  .transition-condition-fields {
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: var(--lq-space-2);
  }

  .transition-condition-fields > label,
  .transition-condition-fields > .ui-field,
  .transition-condition-fields > .transition-native-field {
    min-width: 0;
  }

  .transition-native-field,
  .transition-fallback-card > div {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .transition-native-field > span,
  .transition-fallback-card > div > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .transition-condition .transition-condition-remove {
    width: var(--lq-control-sm);
    min-width: var(--lq-control-sm);
    min-height: var(--lq-control-sm);
    align-self: start;
    margin-top: calc(var(--lq-font-xs) + var(--lq-space-2));
    padding: 0;
  }

  .transition-rule-footer {
    display: flex;
    min-width: 0;
    align-items: end;
    gap: 8px;
    border-top: 1px solid var(--lq-color-border-soft);
    margin-top: 4px;
    padding-top: 4px;
  }

  .transition-rule-footer > .ui-button {
    flex: 0 0 auto;
  }

  .transition-destination-arrow {
    flex: 0 0 auto;
    align-self: center;
    color: #98a2b3;
  }

  .transition-destination {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
  }

  .transition-editor label > span,
  .transition-destination > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .transition-editor select,
  .transition-editor .ui-input,
  .transition-editor .ui-select-trigger {
    width: 100%;
    min-width: 0;
    height: var(--lq-control-sm);
    min-height: var(--lq-control-sm);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .transition-fallback-card {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: end;
    gap: 10px;
    border-style: dashed;
    background: #fbfcfb;
  }

  .transition-editor-actions {
    display: flex;
    justify-content: flex-start;
  }

`;
