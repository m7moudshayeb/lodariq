/** The assist prompt and its preview strip (§7.4, §7.5). */
export const AUTHORING_ASSIST_CSS = `
  .rich-step-assist {
    display: grid;
    gap: var(--lq-space-2);
    padding: 0 var(--lq-space-4) var(--lq-space-3);
  }

  .assist-prompt {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: end;
    gap: var(--lq-space-2);
  }

  .assist-prompt button.assist-prompt-close {
    display: grid;
    width: var(--lq-control-md);
    border: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel);
    padding: 0;
    color: var(--lq-color-muted);
    place-items: center;
  }

  .assist-prompt button.assist-prompt-close:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  .assist-prompt label,
  .assist-preview-refine label {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .assist-prompt label > span,
  .assist-preview-refine label > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .assist-prompt input,
  .assist-preview-refine input {
    height: var(--lq-control-md);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    padding: 0 var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .assist-prompt button {
    height: var(--lq-control-md);
    border: 1px solid var(--lq-color-primary-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-primary);
    padding: 0 var(--lq-space-3);
    color: var(--lq-color-on-primary);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-medium);
    cursor: pointer;
  }

  .assist-preview {
    position: relative;
    display: grid;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-3);
  }

  .assist-preview-close {
    position: absolute;
    top: 6px;
    right: 6px;
    display: grid;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: none;
    color: var(--lq-color-muted);
    cursor: pointer;
    place-items: center;
  }

  .assist-preview-close:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  .assist-preview p {
    display: flex;
    align-items: center;
    gap: var(--lq-space-2);
    margin: 0;
    font-size: var(--lq-font-sm);
  }

  .assist-preview-error {
    color: var(--lq-color-danger);
  }

  .assist-preview-confirm {
    color: var(--lq-color-warning);
  }

  .assist-preview-edits {
    display: grid;
    gap: var(--lq-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .assist-preview-edits > li {
    display: grid;
    gap: 2px;
    font-size: var(--lq-font-xs);
  }

  .assist-preview-edits del {
    color: var(--lq-color-muted);
  }

  .assist-preview-edits ins {
    color: var(--lq-color-ink);
    text-decoration: none;
  }

  .assist-preview-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--lq-space-2);
  }

  .assist-preview-actions button {
    display: inline-flex;
    height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 0 var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    cursor: pointer;
  }

  .assist-preview-actions button[data-assist-action='accept'],
  .assist-preview-actions button[data-assist-action='confirm'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .rich-content-assist-menu {
    display: grid;
    min-width: 168px;
    gap: 2px;
  }

  .rich-content-assist-menu button {
    height: var(--lq-control-sm);
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    padding: 0 var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    text-align: start;
    cursor: pointer;
  }

  .rich-content-assist-menu button:hover {
    background: var(--lq-color-panel-strong);
  }

  .rich-content-menu-divider {
    height: 1px;
    margin: var(--lq-space-1) 0;
    background: var(--lq-color-border-soft);
  }
`;

/** The Narration section (§7.7). Script first, then what follows from it. */
export const AUTHORING_NARRATION_CSS = `
  .step-narration-section {
    display: grid;
    gap: var(--lq-space-2);
  }

  .step-narration-script,
  .step-narration-voice {
    display: grid;
    gap: var(--lq-space-1);
  }

  .step-narration-script > span,
  .step-narration-voice > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .step-narration-script textarea {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-2);
    color: var(--lq-color-ink);
    font-family: inherit;
    font-size: var(--lq-font-sm);
    resize: vertical;
  }

  .step-narration-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--lq-space-2);
  }

  .step-narration-actions button {
    height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 0 var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    cursor: pointer;
  }

  .step-narration-voice select {
    height: var(--lq-control-md);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    padding: 0 var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .step-narration-language,
  .step-narration-note {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }
`;
