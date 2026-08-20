export const AUTHORING_ADVANCED_SHELL_CSS = `

  .tour-appearance-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .tour-appearance-copy small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.055em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .tour-appearance-copy strong {
    overflow: hidden;
    font-size: 10px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-appearance-copy > span {
    color: var(--lq-color-muted);
    font-size: 8px;
    line-height: 1.3;
  }

  .tour-sequence-rail.compact .tour-release-strip {
    gap: 0;
    margin: 0 12px 12px;
    padding: 8px 12px;
  }

  .tour-sequence-rail.compact .tour-release-truth,
  .tour-sequence-rail.compact .tour-release-copy span {
    display: none;
  }

  .tour-sequence-rail.compact .tour-release-summary {
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }

  .tour-sequence-rail.compact .tour-release-icon {
    width: 28px;
    height: 36px;
    border-radius: 8px;
  }

  .tour-sequence-rail.compact .tour-release-copy strong {
    font-size: 12px;
  }

  .tour-release-strip {
    display: grid;
    flex: 0 0 auto;
    gap: 12px;
    margin: 0 16px 16px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    padding: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.26);
  }

  .tour-release-strip.ready {
    border-color: var(--lq-color-border);
  }

  .tour-release-strip.success {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-success-soft);
  }

  .tour-release-strip.warning {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-warning-soft);
  }

  .tour-release-strip.danger {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-danger-soft);
  }

  .tour-release-strip.neutral {
    background: rgba(255, 255, 255, 0.04);
    box-shadow: none;
  }

  .tour-release-strip.busy {
    border-color: var(--lq-color-blue-border);
    background: var(--lq-color-blue-soft);
  }

  .tour-release-truth {
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-release-summary {
    display: grid;
    min-width: 0;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
  }

  .tour-release-icon {
    display: inline-grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-primary);
  }

  .tour-release-strip.success .tour-release-icon {
    border-color: var(--lq-color-success-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-success);
  }

  .tour-release-strip.warning .tour-release-icon {
    border-color: var(--lq-color-warning-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-warning);
  }

  .tour-release-strip.danger .tour-release-icon {
    border-color: var(--lq-color-danger-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-danger);
  }

  .tour-release-strip.neutral .tour-release-icon {
    border-color: var(--lq-color-border);
    background: var(--lq-color-panel);
    color: var(--lq-color-muted);
  }

  .tour-release-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-release-copy small {
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.25;
    text-transform: uppercase;
  }

  .tour-release-copy strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.35;
  }

  .tour-release-copy > span {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.4;
  }

  .tour-release-findings {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0 0 0 40px;
    list-style: none;
  }

  .tour-release-findings li {
    display: grid;
    min-width: 0;
    grid-template-columns: 6px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.3;
  }

  .tour-release-findings li > span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--lq-color-warning);
  }

  .tour-release-findings li.blocker > span {
    background: var(--lq-color-danger);
  }

  .tour-release-action {
    display: inline-flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--lq-color-primary);
    border-radius: 12px;
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 12px;
    box-shadow: 0 8px 20px rgba(61, 232, 176, 0.2);
  }

  .tour-release-action:hover {
    border-color: var(--lq-color-primary-hover);
    background: var(--lq-color-primary-hover);
  }

  .tour-release-spinner {
    animation: lq-release-spin 900ms linear infinite;
  }

  .panel-hybrid-workspace {
    display: grid;
    height: 100vh;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    background: var(--lq-color-panel);
  }

  .panel-advanced-workspace > .tour-sequence-rail,
  .tour-step-inspector {
    display: none;
  }

  .tour-step-inspector-header {
    display: flex;
    min-height: 64px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 12px 16px;
  }

  .tour-step-inspector-header > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-inspector-header small,
  .tour-step-open-details small {
    color: var(--lq-color-muted);
    font-size: 10px;
    line-height: 1.35;
  }

  .tour-step-inspector-header > span > small {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .tour-step-inspector-header strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-inspector-header button {
    display: inline-flex;
    min-height: 36px;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 0 12px;
  }

  .tour-step-inspector-header button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-content-summary {
    display: grid;
    gap: 4px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 12px 16px 16px;
  }

  .tour-step-content-summary strong {
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 700;
    line-height: 1.4;
  }

  .tour-step-content-summary > span:last-child {
    display: -webkit-box;
    overflow: hidden;
    color: var(--lq-color-muted);
    font-size: 12px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }

  .tour-step-inspector-properties {
    display: grid;
  }

  .tour-step-inspector-row {
    display: grid;
    min-height: 58px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 12px 16px;
  }

  .tour-step-inspector-row > span:first-child {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-inspector-row small {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.25;
  }

  .tour-step-inspector-row > span > strong {
    overflow: hidden;
    color: var(--lq-color-ink);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tour-step-inspector-row > button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    padding: 0 12px;
  }

  .tour-step-inspector-row > button:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .tour-step-on-canvas-hint {
    color: var(--lq-color-muted);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  .tour-step-open-details {
    display: grid;
    min-height: 48px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--lq-color-border);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--lq-color-ink);
    cursor: pointer;
    margin: 12px 16px;
    padding: 8px 12px;
    text-align: left;
  }

  .tour-step-open-details:hover {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
  }

  .tour-step-open-details > span {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .tour-step-open-details strong {
    font-size: 12px;
    font-weight: 700;
  }

  .tour-step-accordion .tour-step-open-details.compact-details {
    min-height: 44px;
    margin: 0;
  }

  .shell-panel {
    --lq-color-ink: #162033;
    --lq-color-ink-soft: #334155;
    --lq-color-muted: #667085;
    --lq-color-subtle: #8b95a5;
    --lq-color-page: #ffffff;
    --lq-color-panel: #ffffff;
    --lq-color-panel-strong: #f7faf9;
    --lq-color-border: #d8dfe3;
    --lq-color-border-soft: #e8ecee;
    --lq-color-primary: #006b58;
    --lq-color-primary-hover: #005647;
    --lq-color-on-primary: #ffffff;
    --lq-color-primary-soft: #edf8f5;
    --lq-color-primary-border: #3b8d7e;
    --lq-color-blue: #367bf5;
    --lq-color-blue-soft: #eef4ff;
    --lq-color-blue-border: #367bf5;
    --lq-shadow-popover: 0 18px 44px rgba(15, 36, 31, 0.16);
    container-name: authoring-frame;
    container-type: inline-size;
    color-scheme: light;
  }
`;
