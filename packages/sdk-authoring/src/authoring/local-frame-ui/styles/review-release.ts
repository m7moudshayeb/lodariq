export const AUTHORING_REVIEW_RELEASE_CSS = `

  .target-menu-action:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    box-shadow: none;
  }

  .target-menu-action-featured {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
  }

  .target-menu-action-exact {
    grid-column: 1 / -1;
  }

  .target-menu-action .ui-button-icon {
    width: 20px;
    height: 20px;
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink-soft);
  }

  .target-menu-action-featured .ui-button-icon {
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-menu-action .ui-button-label {
    display: inline-flex;
    min-width: 0;
    align-items: center;
  }

  .target-menu-secondary-actions {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .target-menu-disclosure {
    min-width: 0;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 4px;
  }

  .target-menu-disclosure > summary,
  .target-matching-details > summary {
    display: flex;
    min-height: 40px;
    align-items: center;
    gap: 8px;
    border-radius: 8px;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    list-style: none;
    padding: 8px 8px;
  }

  .target-menu-disclosure > summary::-webkit-details-marker,
  .target-matching-details > summary::-webkit-details-marker {
    display: none;
  }

  .target-menu-disclosure > summary:hover,
  .target-menu-disclosure > summary:focus-visible,
  .target-matching-details > summary:hover,
  .target-matching-details > summary:focus-visible {
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    outline: none;
  }

  .target-menu-disclosure[open] > summary {
    margin-bottom: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .target-menu-disclosure-content,
  .target-troubleshoot {
    display: grid;
    min-width: 0;
    gap: 8px;
  }

  .target-secondary-action {
    min-height: 36px;
    min-width: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    padding: 4px 8px;
  }

  .target-secondary-action:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
  }

  .target-secondary-action-danger {
    color: var(--lq-color-danger);
  }

  .target-secondary-action-danger:hover {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
  }

  .target-health,
  .target-lifecycle,
  .target-advanced {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.4;
  }

  .target-health {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px 8px;
  }

  .target-health.found,
  .target-health.verified {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .target-health.missing,
  .target-health.ambiguous,
  .target-health.needs_review,
  .target-health.drifted {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .target-health.checking,
  .target-health.unavailable-current-context {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-health strong {
    display: block;
    margin-bottom: 4px;
    color: var(--lq-color-ink);
  }

  .target-lifecycle {
    display: grid;
    gap: 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 8px 8px;
  }

  .target-lifecycle-header {
    display: grid;
    gap: 1px;
  }

  .target-lifecycle-header strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .target-lifecycle-header span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .target-lifecycle-field {
    display: grid;
    gap: 4px;
  }

  .target-lifecycle-control-group {
    display: grid;
    gap: 4px;
  }

  .target-lifecycle-field > span,
  .target-lifecycle-control-group > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .target-lifecycle-field input,
  .target-lifecycle-field .ui-select-trigger {
    width: 100%;
    min-height: 36px;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-page);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .target-lifecycle-field input {
    padding: 8px 8px;
  }

  .target-lifecycle-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .target-lifecycle-action {
    min-width: 0;
    justify-content: center;
    min-height: 40px;
    padding: 8px;
  }

  .target-lifecycle-action.selected {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
    color: var(--lq-color-blue);
  }

  .target-advanced {
    display: grid;
    gap: 8px;
    padding: 0 8px 8px;
  }

  .target-advanced strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .target-advanced span {
    color: var(--lq-color-muted);
  }

  .target-advanced dl {
    display: grid;
    gap: 4px;
    margin: 0;
  }

  .target-advanced dl div {
    display: grid;
    grid-template-columns: minmax(72px, 0.42fr) minmax(0, 1fr);
    gap: 8px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 4px;
  }

  .target-advanced dt,
  .target-advanced dd {
    margin: 0;
    min-width: 0;
  }

  .target-advanced dt {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .target-advanced dd {
    color: var(--lq-color-ink);
    font-weight: var(--lq-weight-semibold);
  }

  .target-matching-details {
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
  }

  .target-matching-details[open] > summary {
    color: var(--lq-color-ink);
  }

  .target-troubleshoot .target-menu-secondary-actions {
    justify-content: flex-end;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 4px;
  }

  .property-chip {
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
  }

  .block-footer {
    display: none;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0 0;
    opacity: 0;
    transition: opacity 120ms ease;
  }

  .block:hover .block-footer,
  .block:focus-within .block-footer {
    display: flex;
    opacity: 1;
  }

  .block-tools .ui-select-trigger {
    width: 146px;
    min-height: 36px;
    background: transparent;
  }

  .block-tools .ui-button {
    min-height: 36px;
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 4px 8px;
  }

  .block-tools .ui-button:hover {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .block-meta {
    gap: 4px;
  }

  .preview-copy {
    display: grid;
    gap: 4px;
  }

  .preview-workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    border: 1px solid var(--lq-color-panel-strong);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 12px;
    box-shadow: 0 1px 2px rgba(9, 76, 68, 0.05);
  }

  .preview-actions {
    display: grid;
    width: 100%;
    grid-template-columns: repeat(3, minmax(112px, 1fr));
    gap: 8px;
  }

  .preview-actions .ui-button {
    width: 100%;
  }

  .preview-workbench .ui-button:not(.ui-button-primary) {
    border-color: var(--lq-color-border);
    background: var(--lq-color-page);
    color: var(--lq-color-ink-soft);
  }

  .preview-workbench .ui-button:not(.ui-button-primary):hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
  }

  .preview-copy strong,
  summary {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
  }

  .preview-copy span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .preview-workbench .preview-copy strong {
    color: var(--lq-color-ink);
  }

  .preview-workbench .preview-copy span {
    color: var(--lq-color-muted);
  }

  .issue-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    border: 1px solid var(--lq-color-warning-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-warning-soft);
    padding: 12px;
  }

  .issue-panel p,
  .issue-panel li {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.4;
  }

  .issue-panel ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  .issue-panel li {
    display: grid;
    gap: 1px;
  }

  .issue-panel li.publish-issue-row,
  .panel-check-list li.publish-issue-row {
    display: block;
  }

  .publish-issue-action {
    display: grid;
    width: 100%;
    min-height: 44px;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 8px;
    text-align: left;
  }

  .publish-issue-action:hover {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-surface);
  }

  .publish-issue-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }

  .publish-issue-cta {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
  }

  .issue-panel li strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  .issue-panel li span {
    color: var(--lq-color-muted);
  }

  .issue-panel .publish-issue-cta {
    color: var(--lq-color-primary);
  }

  .issue-panel .publish-issue-action small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.4;
  }

  .compiled-output {
    grid-column: 1 / -1;
  }

  .inspector {
    display: grid;
    gap: 0;
    align-content: start;
    min-width: 0;
    border-top: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-page);
  }
`;
