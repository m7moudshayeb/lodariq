/** Approved step-presentation preview and settings. */
export const AUTHORING_AGREED_PRESENTATION_CSS = `
  .storyboard-property-tray[data-tool-mode='popup'] > .step-presentation {
    display: grid;
    grid-template-columns: minmax(240px, 0.8fr) minmax(420px, 1.2fr);
    align-items: stretch;
    gap: 16px;
  }

  .step-presentation-preview,
  .step-presentation-settings {
    display: grid;
    min-width: 0;
    align-content: start;
    gap: 12px;
  }

  .step-presentation-preview-heading {
    display: flex;
    min-height: var(--lq-control-sm);
    align-items: center;
    justify-content: space-between;
    gap: var(--lq-space-2);
  }

  .step-presentation-preview-heading button {
    display: grid;
    width: var(--lq-control-sm);
    height: var(--lq-control-sm);
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    color: var(--lq-color-muted);
    cursor: pointer;
    padding: 0;
  }

  .step-presentation-preview-heading button:hover,
  .step-presentation-preview-heading button:focus-visible {
    border-color: var(--lq-color-primary-border);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  .step-presentation-preview-stage {
    display: grid;
    min-height: 164px;
    place-items: center;
    background: #eef0ef;
    padding: 12px;
  }

  .step-presentation-preview-card {
    display: grid;
    box-sizing: border-box;
    width: min(var(--lq-preview-popup-width, 280px), 100%);
    min-width: 0;
    max-width: 100%;
    min-height: min(var(--lq-preview-popup-height, 0px), 164px);
    align-content: start;
    gap: var(--lq-tour-space-sm, var(--lq-space-2));
    overflow: hidden;
    border: var(--lq-tour-border-width, 1px) solid
      var(--lq-popup-border, var(--lq-tour-border-color, var(--lq-color-border)));
    border-radius: var(--lq-tour-radius, var(--lq-radius-md));
    background: var(--lq-popup-surface, var(--lq-tour-surface, var(--lq-color-panel)));
    color: var(--lq-popup-text, var(--lq-tour-text-color, var(--lq-color-ink)));
    font-family: var(--lq-tour-font-family, inherit);
    padding: var(--lq-tour-composition-padding, var(--lq-tour-spacing, var(--lq-space-3)));
    box-shadow: var(
      --lq-tour-elevation,
      0 var(--lq-space-3) var(--lq-space-6) rgba(15, 36, 31, 0.1)
    );
  }

  .step-presentation-preview-card[data-lodariq-content-align='center'] {
    text-align: center;
  }

  .step-presentation-preview-card[data-lodariq-content-align='right'] {
    text-align: right;
  }

  .step-presentation-preview-card[data-lodariq-composition-padding='compact'] {
    --lq-tour-composition-padding: var(--lq-tour-space-sm, var(--lq-space-2));
  }

  .step-presentation-preview-card[data-lodariq-composition-padding='relaxed'] {
    --lq-tour-composition-padding: var(--lq-tour-space-lg, var(--lq-space-4));
  }

  .step-presentation-preview-card[data-lodariq-popup-radius='square'] {
    border-radius: 0;
  }

  .step-presentation-preview-card[data-lodariq-popup-radius='soft'] {
    border-radius: var(--lq-tour-radius-sm, var(--lq-radius-sm));
  }

  .step-presentation-preview-card[data-lodariq-popup-radius='round'] {
    border-radius: var(--lq-tour-radius-lg, var(--lq-radius-md));
  }

  .step-presentation-preview-card[data-lodariq-popup-border-weight='none'] {
    border-width: 0;
  }

  .step-presentation-preview-card[data-lodariq-popup-border-weight='subtle'] {
    border-width: var(--lq-tour-border-width-subtle, 1px);
  }

  .step-presentation-preview-card[data-lodariq-popup-border-weight='strong'] {
    border-width: var(--lq-tour-border-width-strong, 2px);
  }

  .step-presentation-preview-card[data-lodariq-popup-elevation='none'] {
    box-shadow: none;
  }

  .step-presentation-preview-card[data-lodariq-popup-elevation='resting'] {
    box-shadow: var(--lq-tour-elevation-resting, 0 1px 2px rgba(15, 36, 31, 0.12));
  }

  .step-presentation-preview-card[data-lodariq-popup-elevation='floating'] {
    box-shadow: var(--lq-tour-elevation-floating, 0 8px 24px rgba(15, 36, 31, 0.18));
  }

  .step-presentation-preview-stage[data-spotlight='subtle'] .step-presentation-preview-card {
    box-shadow:
      0 0 0 4px rgba(0, 107, 88, 0.08),
      0 12px 24px rgba(15, 36, 31, 0.1);
  }

  .step-presentation-preview-stage[data-spotlight='standard'] .step-presentation-preview-card {
    box-shadow:
      0 0 0 8px rgba(0, 107, 88, 0.1),
      0 12px 24px rgba(15, 36, 31, 0.1);
  }

  .step-presentation-preview-stage[data-spotlight='strong'] .step-presentation-preview-card {
    box-shadow:
      0 0 0 12px rgba(0, 107, 88, 0.12),
      0 12px 24px rgba(15, 36, 31, 0.1);
  }

  .step-presentation-preview-card[data-motion='fade'] {
    animation: lq-presentation-preview-fade var(--lq-preview-motion-duration) ease both;
  }

  .step-presentation-preview-card[data-motion='lift'] {
    animation: lq-presentation-preview-lift var(--lq-preview-motion-duration) ease both;
  }

  .step-presentation-preview-card[data-motion='scale'] {
    animation: lq-presentation-preview-scale var(--lq-preview-motion-duration) ease both;
  }

  .step-presentation-preview-card[data-motion='pulse'] {
    animation: lq-presentation-preview-pulse var(--lq-preview-motion-duration) ease 2;
  }

  @keyframes lq-presentation-preview-fade {
    from { opacity: 0; }
  }

  @keyframes lq-presentation-preview-lift {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @keyframes lq-presentation-preview-scale {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }

  @keyframes lq-presentation-preview-pulse {
    50% { transform: scale(1.02); }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-presentation-preview-card[data-motion] {
      animation: none;
    }
  }

  .step-presentation-preview-copy,
  .step-presentation-preview-list,
  .step-presentation-preview-action-stage,
  .step-presentation-preview-action,
  .step-presentation-preview-action-label {
    min-width: 0;
    max-width: 100%;
  }

  .step-presentation-preview-copy {
    display: -webkit-box;
    overflow: hidden;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
  }

  .step-presentation-preview-copy.heading {
    color: var(--lq-popup-text, var(--lq-tour-text-color, var(--lq-color-ink)));
    font-size: var(--lq-tour-base-font-size, var(--lq-font-md));
    font-weight: var(--lq-tour-heading-font-weight, var(--lq-weight-bold));
    line-height: var(--lq-tour-heading-line-height, 1.3);
    -webkit-line-clamp: 2;
  }

  .step-presentation-preview-copy.paragraph,
  .step-presentation-preview-copy.supporting {
    color: var(--lq-popup-muted-text, var(--lq-tour-muted-text-color, var(--lq-color-muted)));
    font-size: var(--lq-tour-small-font-size, var(--lq-font-xs));
    line-height: var(--lq-tour-body-line-height, 1.5);
    -webkit-line-clamp: 3;
  }

  .step-presentation-preview-list {
    display: grid;
    gap: var(--lq-space-1);
    margin: 0;
    overflow-wrap: anywhere;
    padding-inline-start: var(--lq-space-4);
  }

  .step-presentation-preview-divider {
    height: 1px;
    background: var(--lq-popup-border, var(--lq-tour-border-color, var(--lq-color-border)));
  }

  .step-presentation-preview-action-stage {
    display: flex;
    justify-content: flex-start;
  }

  .step-presentation-preview-action-stage[data-lodariq-action-align='center'] {
    justify-content: center;
  }

  .step-presentation-preview-action-stage[data-lodariq-action-align='end'] {
    justify-content: flex-end;
  }

  .step-presentation-preview-action-stage[data-lodariq-action-align='stretch']
    .step-presentation-preview-action,
  .step-presentation-preview-card[data-lodariq-action-layout='stack']
    .step-presentation-preview-action {
    width: 100%;
  }

  .step-presentation-preview-action {
    overflow: hidden;
    font-size: var(--lq-tour-small-font-size, var(--lq-font-xs));
  }

  .step-presentation-preview-action-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-presentation-settings {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .step-presentation-settings > * {
    min-width: 0;
  }

  .step-presentation-settings .progressive-setting-panel {
    min-height: 0;
  }

  .step-presentation-settings .sequence-property-editor {
    border: 0;
    padding: 0;
  }

  .step-presentation-settings .sequence-summary-header,
  .step-presentation-settings .sequence-details {
    display: none;
  }

  .step-presentation-settings .sequence-summary-strip {
    grid-template-columns: minmax(72px, 1fr) auto minmax(72px, 1fr) auto minmax(72px, 1fr);
  }

`;
