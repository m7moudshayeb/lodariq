import { CREATOR_CHROME_TOKENS } from '../../../creator-chrome-tokens';
export const AUTHORING_TOUR_RELEASE_CSS = `

  .shell-panel .tour-sequence-rail {
    position: static;
    height: 100%;
    max-height: none;
    overflow-x: hidden;
    overflow-y: auto;
    border-right: 0;
    border-bottom: 0;
  }

  .shell-panel .tour-step-list {
    flex: 0 1 auto;
    min-height: 0;
  }

  .panel-advanced-editor {
    display: grid;
    width: 100%;
    height: 100vh;
    min-height: 0;
    min-width: 0;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--lq-color-panel);
  }

  .panel-advanced-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--lq-space-3);
    border-bottom: 1px solid var(--lq-color-border);
    background: var(--lq-color-panel);
    padding: var(--lq-space-3) var(--lq-space-4);
  }

  .panel-advanced-title {
    display: grid;
    min-width: 0;
    gap: var(--lq-space-1);
  }

  .panel-advanced-header small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .panel-advanced-header strong {
    overflow: hidden;
    font-size: var(--lq-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-advanced-back {
    display: inline-flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-2);
    border: 0;
    border-radius: var(--lq-radius-sm);
    background: transparent;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    padding: 0 var(--lq-space-2);
  }

  .panel-advanced-back:hover {
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .panel-advanced-save-status {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: var(--lq-space-2);
    color: var(--lq-color-success);
    font-size: var(--lq-font-xs);
    white-space: nowrap;
  }

  .panel-advanced-save-status[data-state="saving"] {
    color: var(--lq-color-muted);
  }

  .panel-advanced-save-status[data-state="error"] {
    color: var(--lq-color-danger);
  }

  .panel-advanced-save-status strong {
    max-width: 112px;
    overflow: hidden;
    font-size: var(--lq-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shell-panel .document-main {
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--lq-space-4) var(--lq-space-3) var(--lq-space-6);
    scrollbar-gutter: stable;
  }

  .shell-panel .panel-advanced-main {
    width: 100%;
    min-height: 0;
    box-sizing: border-box;
    gap: var(--lq-space-4);
  }

  .shell-panel .panel-advanced-main > .document,
  .shell-panel .panel-advanced-main > .insert-bar,
  .shell-panel .panel-advanced-main > .inspector,
  .shell-panel .panel-advanced-main .review-drawer,
  .shell-panel .panel-advanced-main .review-panel {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .shell-panel .panel-advanced-main > .inspector {
    overflow: hidden;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: #ffffff;
  }

  .shell-panel .canvas-actionbar {
    position: absolute;
    top: 14px;
    right: 12px;
    margin: 0;
  }

  .shell-panel .canvas-actionbar [data-action="save"],
  .shell-panel .canvas-actionbar [data-action="reset"] {
    display: none;
  }

  .shell-panel .tour-sequence-header.document-hero {
    padding-right: 40px;
  }

  .shell-panel .tour-health-count {
    display: none;
  }

  .shell-panel,
  .shell-panel .workspace,
  .shell-panel .document-page,
  .shell-panel .authoring-workspace,
  .shell-panel .tour-sequence-rail {
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail.compact .compact-header {
    display: flex;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.04);
    padding: 0 16px;
  }

  .tour-sequence-rail.compact .compact-header > strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    letter-spacing: -0.01em;
  }

  .tour-sequence-rail.compact .compact-header > span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-semibold);
  }

  .shell-panel .tour-sequence-rail.compact .tour-step-list {
    flex: 1 1 auto;
    min-height: 76px;
    max-height: none;
    overflow-y: auto;
    gap: 8px;
    padding: 12px 12px 8px;
  }

  .tour-sequence-rail.compact .tour-step-row {
    border-color: var(--lq-color-border-soft);
    border-radius: 12px;
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail.compact .tour-step-row.active,
  .tour-sequence-rail.compact .tour-step-row.expanded {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-panel-strong);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset;
  }

  .tour-sequence-rail.compact .tour-step-row.active .tour-step-number {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .tour-sequence-rail.compact .tour-step-row.repair:not(.active) {
    background: var(--lq-color-panel);
  }

  .tour-sequence-rail.compact .tour-step-select {
    min-height: 40px;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 8px;
    padding: 8px 12px;
  }

  .tour-sequence-rail.compact .tour-step-number {
    width: 22px;
    height: 24px;
    border-color: var(--lq-color-border);
    font-size: var(--lq-font-xs);
  }

  .tour-sequence-rail.compact .tour-step-copy {
    gap: 0;
  }

  .tour-sequence-rail.compact .tour-step-copy strong {
    font-size: var(--lq-font-sm);
  }

  .tour-sequence-rail.compact .tour-step-placement {
    display: none;
  }

  .tour-sequence-rail.compact .tour-step-health {
    display: inline-flex;
    min-width: 18px;
    justify-content: flex-end;
    gap: 0;
    color: var(--lq-color-success);
    font-size: 0;
  }

  .tour-sequence-rail.compact .tour-step-health.repair,
  .tour-sequence-rail.compact .tour-step-health.review {
    color: var(--lq-color-warning);
  }

  .tour-step-health-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }

  .tour-step-accordion {
    display: grid;
    gap: 8px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding: 12px 12px 12px;
  }

  .tour-step-detail-row {
    display: grid;
    gap: 4px;
  }

  .tour-step-detail-label {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.02em;
  }

  .tour-step-detail-fact {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .tour-step-detail-status {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    color: var(--lq-color-ink);
  }

  .tour-step-detail-status.ready {
    color: var(--lq-color-success);
  }

  .tour-step-detail-status.repair,
  .tour-step-detail-status.review {
    color: var(--lq-color-warning);
  }

  .tour-step-detail-status strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    line-height: 1.3;
  }

  .tour-step-detail-change {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    padding: 0 12px;
  }

  .tour-step-detail-change:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-behavior-summary {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    line-height: 1.35;
  }

  .tour-step-edit-on-page {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    padding: 0 12px;
  }

  .tour-step-edit-on-page:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-contextual-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    margin: 4px 16px 16px;
  }

  .tour-contextual-actions .tour-add-step {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-bold);
    padding: 8px 12px;
  }

  .tour-contextual-actions .tour-add-step:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-sequence-rail.compact .tour-contextual-actions {
    grid-template-columns: minmax(0, 1fr);
    margin-top: auto;
  }

  .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    box-shadow: 0 8px 20px color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 18%, transparent);
  }

  .tour-sequence-rail.compact .tour-contextual-actions .tour-add-step:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
    color: var(--lq-color-on-primary);
  }

  .tour-appearance-entry {
    display: grid;
    min-height: 58px;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    margin: 8px 16px 0;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 8px 12px;
    text-align: left;
  }

  .tour-appearance-entry:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-appearance-icon {
    display: inline-grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-primary);
  }
`;
