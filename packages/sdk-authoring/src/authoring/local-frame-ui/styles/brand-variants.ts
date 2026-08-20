/**
 * The §7.1 starting-point cards. The card *chrome* is creator-chrome tokens; the
 * colours inside each preview come from the sampled variant as inline values,
 * because they are data, not chrome.
 */
export const AUTHORING_BRAND_VARIANT_CSS = `
  .brand-variant-choice {
    display: grid;
    gap: var(--lq-space-3);
  }

  .brand-variant-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--lq-space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .brand-variant-list > li {
    min-width: 0;
  }

  .brand-variant-list button {
    display: grid;
    width: 100%;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--lq-space-3);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-3);
    color: var(--lq-color-ink);
    text-align: start;
    cursor: pointer;
  }

  .brand-variant-list button:hover {
    border-color: var(--lq-color-border);
  }

  .brand-variant-list button[aria-pressed='true'] {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .brand-variant-list button svg {
    flex: none;
    color: var(--lq-color-primary);
  }

  .brand-variant-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .brand-variant-copy strong {
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  .brand-variant-copy small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .brand-variant-preview {
    display: grid;
    width: 56px;
    align-content: center;
    gap: 4px;
    border: 1px solid transparent;
    border-style: solid;
    padding: var(--lq-space-2);
  }

  .brand-variant-preview-line {
    height: 3px;
    border-radius: 2px;
  }

  .brand-variant-preview-line.short {
    width: 60%;
  }

  .brand-variant-preview-action {
    height: 8px;
    width: 70%;
    margin-top: 2px;
  }

  @media (max-width: 640px) {
    .brand-variant-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;
