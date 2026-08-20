export const AUTHORING_PANEL_SHELL_CSS = `

  .document-review {
    background: transparent;
    padding: 0;
  }

  .review-drawer {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    box-shadow: 0 1px 2px rgba(9, 76, 68, 0.05);
  }

  .review-drawer > summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    align-items: center;
    gap: 12px;
    list-style: none;
    min-height: 56px;
    background: var(--lq-color-panel);
    cursor: pointer;
    padding: 12px 16px;
    transition: background-color 120ms ease, border-color 120ms ease;
  }

  .review-drawer > summary:hover {
    background: var(--lq-color-primary-soft);
  }

  .review-drawer > summary:focus-visible {
    outline: 2px solid var(--lq-color-primary);
    outline-offset: -3px;
  }

  .review-drawer > summary::-webkit-details-marker {
    display: none;
  }

  .review-summary-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .review-summary-copy strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-summary-copy span {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-summary-end {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .review-summary-chevron {
    flex: 0 0 auto;
    color: var(--lq-color-muted);
    transition: transform 140ms ease;
  }

  .review-drawer[open] .review-summary-chevron {
    transform: rotate(180deg);
  }

  .review-status {
    min-width: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    line-height: 1;
    padding: 4px 8px;
    white-space: nowrap;
  }

  .review-status.ready {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .review-status.needs-work {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .review-panel {
    display: grid;
    min-width: 0;
    gap: 12px;
    border-top: 1px solid var(--lq-color-border-soft);
    background: #f8faf9;
    padding: 12px;
  }

  .utilities-drawer {
    min-width: 0;
    border: 0;
    border-top: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    padding: 4px 0 0;
    box-shadow: none;
  }

  .utilities-drawer > summary {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    list-style: none;
    border-radius: 8px;
    padding: 8px 8px;
  }

  .utilities-drawer > summary::-webkit-details-marker {
    display: none;
  }

  .utilities-drawer > summary span {
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
  }

  .utilities-drawer > summary small {
    overflow: hidden;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .utilities-drawer .ui-tabs {
    margin-top: 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.23);
  }

  .utilities-drawer .ui-tabs-list {
    width: 100%;
  }

  .utilities-drawer .ui-tabs-trigger {
    flex: 1 1 0;
    min-width: 0;
  }

  summary {
    cursor: pointer;
  }

  .panel-actions {
    margin-top: 8px;
  }

  .utility-panel {
    display: grid;
    gap: 12px;
    min-width: 0;
  }

  .preview-utility {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
  }

  textarea[data-action="edit-draft-backup"] {
    width: 100%;
    min-height: 190px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--lq-font-sm);
    line-height: 1.45;
    padding: 12px;
    resize: vertical;
  }

  pre {
    max-height: 190px;
    overflow: auto;
    margin: 8px 0 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: var(--lq-font-sm);
    line-height: 1.45;
    padding: 12px;
  }

  .ui-tabs {
    display: grid;
    gap: 8px;
  }

  .ui-tabs-content[data-state="inactive"] {
    display: none;
  }

  .ui-tabs-list {
    display: inline-flex;
    min-width: 0;
    gap: 4px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 4px;
  }

  .ui-tabs-trigger {
    min-height: 36px;
    border: 0;
    border-radius: var(--lq-radius-xs);
    background: transparent;
    color: var(--lq-color-muted);
    padding: 4px 8px;
  }

  .ui-tabs-trigger[data-state="active"] {
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
  }

  .ui-tabs-content {
    min-width: 0;
  }

  @media (min-width: 920px) {
    .shell {
      padding: 0 0 32px;
    }

    .topbar {
      padding: 12px 40px;
    }
  }

  @media (max-width: 1100px) {
    .authoring-workspace {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 680px) {
    .topbar {
      padding-left: 16px;
      padding-right: 16px;
    }

    .workspace {
      padding-right: 12px;
      padding-left: 12px;
    }

    h2,
    .document-title-input {
      font-size: 28px;
    }

    .document-hero {
      grid-template-columns: 1fr;
      margin-top: 12px;
      padding-left: 16px;
      padding-right: 16px;
    }

    .authoring-workspace {
      grid-template-columns: 1fr;
    }

    .insert-bar,
    .block {
      padding-left: 12px;
      padding-right: 12px;
    }

    .block {
      grid-template-columns: minmax(0, 1fr);
    }

    .block::before {
      left: -2px;
    }

    .block-side-rail {
      left: -6px;
    }

    .block[data-block-type="tourStep"] {
      padding-left: 32px;
    }

    .block[data-block-type="tourStep"]::before {
      left: 7px;
    }

    .block[data-block-type="tourStep"] .block-side-rail {
      left: 10px;
    }

    .block-header {
      flex-wrap: wrap;
    }

    .block-anchor-slot {
      flex-basis: 100%;
      order: 3;
    }

    .block-title strong {
      white-space: normal;
    }

    .step-child {
      position: relative;
      grid-template-columns: 15px minmax(0, 1fr);
      column-gap: 4px;
    }

    .step-child > .content-field,
    .step-child > .button-field-shell {
      grid-column: 2;
      grid-row: 1;
    }

    .step-child-toolbar {
      position: absolute;
      top: 4px;
      right: 2px;
      left: -18px;
      width: auto;
      justify-content: flex-start;
    }

    .block-section,
    .block-footer {
      margin-left: 0;
    }

    .block-section {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .quick-insert {
      padding-left: 0;
    }

    .preview-workbench,
    .preview-utility,
    .issue-panel {
      grid-template-columns: 1fr;
    }

    .inline-insert {
      margin-right: 16px;
      margin-left: 16px;
    }

    .media-field {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .media-placeholder-state {
      grid-column: 2;
      justify-self: start;
    }

    .button-field-shell {
      width: min(100%, 340px);
    }

    .command-item .ui-button-label {
      grid-template-columns: 28px minmax(0, 1fr);
    }

    .command-description {
      grid-column: 2;
      justify-self: start;
    }

    .actions {
      width: 100%;
    }
  }

  @media (max-width: 480px) {
    .review-drawer > summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    .review-status {
      justify-self: start;
    }

    .preview-actions {
      grid-template-columns: 1fr;
    }

    .composer-line {
      grid-template-columns: 20px minmax(0, 1fr);
    }

    .quick-insert {
      grid-column: 2;
      justify-self: start;
    }

    .cta-panel {
      width: 100%;
      max-width: 100%;
      border: 0;
      background: transparent;
      padding: 0;
    }

    .cta-panel-icon,
    .cta-panel-label {
      display: none;
    }

    .cta-panel .ui-select-trigger {
      width: 100%;
    }

  }
`;
