/** Focused batch-selection workspace and cards. */
export const AUTHORING_FOCUSED_BATCH_CSS = `
  .tour-batch-workspace {
    min-height: 0;
    overflow: auto;
    background: rgba(248, 247, 242, 0.92);
    padding: 24px;
  }

  .tour-batch-workspace-heading {
    display: flex;
    max-width: 1080px;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    margin: 0 auto 16px;
  }

  .tour-batch-workspace-heading > span {
    display: grid;
    gap: 4px;
  }

  .tour-batch-workspace-heading small {
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .tour-batch-workspace-heading strong {
    font-size: var(--lq-font-lg);
  }

  .tour-batch-workspace-heading p {
    max-width: 480px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.5;
    margin: 0;
  }

  .tour-batch-card-grid {
    display: grid;
    max-width: 1080px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin: 0 auto;
  }

  .tour-batch-card {
    min-width: 0;
    border: 1px solid var(--lq-color-primary-border);
    border-radius: 12px;
    background: #ffffff;
  }

  .tour-batch-card-open {
    display: grid;
    width: 100%;
    gap: 24px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    padding: 16px;
    text-align: left;
  }

  .tour-batch-card-title {
    display: grid;
    min-width: 0;
    grid-template-columns: 24px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 8px;
  }

  .tour-batch-card-title > svg {
    color: var(--lq-color-primary);
  }

  .tour-batch-card-number {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .tour-batch-card-facts {
    display: grid;
    gap: 12px;
  }

  .tour-batch-card-facts > span {
    display: grid;
    gap: 4px;
  }

  .tour-batch-card-facts small {
    color: var(--lq-color-muted);
    font-size: 8px;
  }

  .tour-batch-card-facts strong {
    overflow: hidden;
    font-size: var(--lq-font-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

`;
