export const AUTHORING_RICH_TEXT_CSS = `

  /* The light workspace's ground. Excluded for the same two roots as the palette
     itself (advanced-shell.ts) — both paint their own. */
  .shell-panel:not(.shell-overlay):not(.shell-operations),
  .shell-panel:not(.shell-operations) .panel-canvas,
  .shell-panel:not(.shell-operations) .document-page,
  .shell-panel:not(.shell-operations) .panel-reference-workspace,
  .shell-panel:not(.shell-operations) .authoring-workspace,
  .shell-panel:not(.shell-operations) .tour-sequence-rail,
  .shell-panel:not(.shell-operations) .tour-step-inspector {
    background: #ffffff;
    color: var(--lq-color-ink);
  }

  .panel-reference-workspace {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .shell-panel .panel-reference-workspace .panel-hybrid-workspace {
    height: auto;
    min-height: 0;
  }

  .panel-workspace-footer {
    display: flex;
    min-width: 0;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid var(--lq-color-border);
    background: #ffffff;
    padding: 8px 16px;
  }

  .panel-footer-state {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
  }

  .panel-save-status {
    display: grid;
    min-width: 0;
    max-width: 146px;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: var(--lq-color-ink);
  }

  .panel-save-status-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .panel-save-status-copy strong {
    overflow: hidden;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-save-status[data-state='saving'] {
    color: var(--lq-color-muted);
  }

  .panel-save-status[data-state='error'] {
    color: var(--lq-color-danger);
  }

  .panel-save-status > svg {
    flex: none;
  }

  .panel-save-state-spinner {
    animation: lq-release-spin 900ms linear infinite;
  }

  .panel-release-summary {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-semibold);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-release-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .panel-save-exit,
  .panel-release-actions button {
    display: inline-flex;
    min-width: 94px;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-primary);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    padding: 0 12px;
  }

  .panel-save-exit {
    min-width: 116px;
    border-color: #d97706;
    background: #fff7ed;
    color: #9a3412;
  }

  .panel-release-short {
    display: none;
  }

  .panel-release-actions button.publish {
    min-width: 142px;
    background: var(--lq-color-primary);
    color: #ffffff;
    box-shadow: 0 5px 14px rgba(0, 107, 88, 0.18);
  }

  .panel-release-actions button.review-recovery {
    min-width: 160px;
  }

  .panel-release-actions button:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-soft);
  }

  .panel-save-exit:hover {
    border-color: #c2410c;
    background: #ffedd5;
    color: #7c2d12;
  }

  .panel-release-actions button.publish:hover {
    background: var(--lq-color-primary-hover);
    color: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .compact-header {
    min-height: 48px;
    border-bottom-color: transparent;
    background: #ffffff;
    padding: 0 16px;
  }

  .shell-panel .tour-sequence-rail.compact .compact-header > strong {
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
  }

  .shell-panel .tour-sequence-rail.compact .compact-header > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-list {
    flex: 0 1 auto;
    gap: 4px;
    padding: 0 16px 8px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row {
    border-color: transparent;
    border-radius: 8px;
    background: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row.active,
  .shell-panel .tour-sequence-rail.compact .tour-step-row.expanded {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    box-shadow: none;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-select {
    min-height: 52px;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 4px;
  }

  .tour-step-grip {
    color: #9aa4b2;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-number {
    width: 26px;
    height: 24px;
    border-color: #c8d0d6;
    background: #ffffff;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-row.active .tour-step-number {
    border-color: #003f35;
    background: #003f35;
    color: #ffffff;
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-copy strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-health {
    min-width: 34px;
    color: var(--lq-color-muted);
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-health-dot {
    width: 7px;
    height: 7px;
  }

  .tour-step-chevron {
    color: var(--lq-color-ink-soft);
  }

  .shell-panel .tour-sequence-rail.compact .tour-contextual-actions {
    margin: 8px 12px 12px;
  }

  .shell-panel .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step {
    min-height: 36px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 8px;
    background: #ffffff;
    color: var(--lq-color-primary);
    box-shadow: none;
  }

  .live-step-header {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    min-height: 80px;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-3);
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.96);
    padding: var(--lq-space-3) var(--lq-space-4);
    backdrop-filter: blur(12px);
  }

  .live-step-header > span:first-child,
  .tour-step-section-heading > span:first-child,
  .tour-config-heading > span:first-child {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .live-step-header small,
  .tour-config-heading small {
    color: var(--lq-color-primary);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .live-step-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-lg);
    font-weight: var(--lq-weight-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-step-header > span:first-child > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .live-step-status,
  .tour-config-status {
    display: inline-flex;
    min-height: var(--lq-space-5);
    flex: 0 0 auto;
    align-items: center;
    border: 1px solid var(--lq-color-success-border);
    border-radius: 999px;
    background: var(--lq-color-success-soft);
    color: #167553;
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-2);
  }

  .live-step-status.review,
  .tour-config-status.review {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
    color: #8b5c08;
  }

  .live-step-status.repair,
  .tour-config-status.repair {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
    color: #a33a3a;
  }

  .tour-step-editor-section {
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: var(--lq-color-panel-strong);
    padding: var(--lq-space-4);
  }

  .tour-step-config-section {
    margin: var(--lq-space-3) var(--lq-space-4) 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    /* Token, not a literal: this section also renders inside the dark glass
       inspector, where a hardcoded white left its text unreadable. */
    background: var(--lq-color-panel);
    padding: var(--lq-space-3);
    box-shadow: 0 var(--lq-space-1) var(--lq-space-3) rgba(15, 36, 31, 0.04);
  }

  .tour-step-section-heading,
  .tour-config-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-3);
    margin-bottom: var(--lq-space-3);
  }

  .tour-step-section-heading strong,
  .tour-config-heading strong {
    margin: 0;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
    line-height: 1.25;
  }

  .tour-step-section-heading small {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.4;
  }

  .tour-step-section-heading > span:last-child {
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    padding: var(--lq-space-1) var(--lq-space-2);
    text-transform: uppercase;
  }

  .rich-step-editor {
    overflow: hidden;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
    box-shadow: 0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.08);
  }
`;
