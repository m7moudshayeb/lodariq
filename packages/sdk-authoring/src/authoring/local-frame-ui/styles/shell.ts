export const AUTHORING_SHELL_CSS = `
  .shell {
    position: relative;
    min-height: 100vh;
    width: 100%;
    max-width: 100%;
    overflow-x: clip;
    padding: 0 0 32px;
    background: var(--lq-color-page);
  }

  lodariq-tour {
    --lodariq-tour-z-index: 8;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid rgba(7, 25, 22, 0.85);
    background: linear-gradient(180deg, var(--lq-color-chrome), #101216);
    padding: 12px 24px;
    backdrop-filter: blur(16px);
  }

  .brand,
  .brand-copy,
  .canvas,
  .document-page,
  .document-title-input,
  .inspector,
  .slash,
  .panel,
  .block-title {
    min-width: 0;
  }

  .brand-copy {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 12px;
  }

  .topbar h1 {
    color: var(--lq-color-chrome-text);
  }

  .topbar .eyebrow {
    color: var(--lq-color-chrome-muted);
  }

  .eyebrow {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    color: var(--lq-color-ink);
    letter-spacing: 0;
  }

  h1 {
    font-size: var(--lq-font-md);
    line-height: 1.18;
  }

  h2 {
    font-size: 28px;
    font-weight: var(--lq-weight-bold);
    line-height: 1.08;
  }

  .document-title-input {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--lq-color-ink);
    font-size: 28px;
    font-weight: var(--lq-weight-bold);
    line-height: 1.08;
    padding: 4px 8px;
    transform: translateX(-6px);
    transition:
      background 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .document-title-input:hover,
  .document-title-input:focus {
    border-color: var(--lq-color-border-soft);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .document-title-input::placeholder {
    color: var(--lq-color-subtle);
  }

  p {
    margin: 0;
  }

  #status {
    max-width: 58ch;
    overflow-wrap: anywhere;
    color: var(--lq-color-chrome-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.35;
  }
`;
