export const AUTHORING_BLOCK_INSPECTOR_CSS = `
  .rich-step-content {
    box-sizing: border-box;
    min-height: 160px;
    max-height: 480px;
    overflow: auto;
    resize: vertical;
    cursor: text;
    outline: 0;
    padding: var(
        --lq-tour-composition-padding-block,
        var(--lq-tour-composition-padding, var(--lq-space-3))
      )
      var(
        --lq-tour-composition-padding-inline,
        var(--lq-tour-composition-padding, var(--lq-space-3))
      );
  }

  .rich-step-content[data-lodariq-content-align='center'] {
    text-align: center;
  }

  .rich-step-content[data-lodariq-content-align='right'] {
    text-align: right;
  }

  .rich-step-content[data-lodariq-composition-padding='compact'] {
    --lq-tour-composition-padding: var(--lq-tour-space-sm);
  }

  .rich-step-content[data-lodariq-composition-padding='relaxed'] {
    --lq-tour-composition-padding: var(--lq-tour-space-lg);
  }

  .rich-step-content:focus-within {
    box-shadow: 0 0 0 2px var(--lq-color-blue) inset;
  }

  .rich-step-action-preview {
    position: relative;
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    min-height: var(--lq-control-md);
    align-items: center;
    justify-content: center;
    gap: var(--lq-space-2);
    border: var(--lq-tour-border-width, 1px) solid transparent;
    border-radius: var(--lq-tour-radius, var(--lq-radius-sm));
    background: var(--lq-action-fill, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    color: var(--lq-action-text, var(--lq-tour-primary-text, #ffffff));
    font-weight: var(--lq-tour-action-font-weight, var(--lq-weight-bold));
    padding: var(--lq-tour-space-xs, var(--lq-space-2)) var(--lq-tour-space-sm, var(--lq-space-3));
  }

  .rich-step-action-preview[data-lodariq-action-width='fill'] {
    width: 100%;
  }

  .rich-step-action-preview[data-lodariq-action-width='custom'] {
    width: min(100%, var(--lq-action-width, 100%));
  }

  .rich-step-action-preview[data-lodariq-action-size='compact'] {
    min-height: var(--lq-control-sm);
    padding-inline: var(--lq-tour-space-xs, var(--lq-space-2));
  }

  .rich-step-action-preview[data-lodariq-action-radius='square'] {
    border-radius: 0;
  }

  .rich-step-action-preview[data-lodariq-action-radius='soft'] {
    border-radius: var(--lq-tour-radius-sm, var(--lq-radius-md));
  }

  .rich-step-action-preview[data-lodariq-action-radius='round'] {
    border-radius: 999px;
  }

  .rich-step-action-preview[data-lodariq-action-variant='secondary'] {
    border-color: var(--lq-action-border, var(--lq-tour-border-color, var(--lq-color-border)));
    background: var(--lq-action-fill, var(--lq-tour-secondary-surface, var(--lq-color-panel-strong)));
    color: var(--lq-action-text, var(--lq-tour-secondary-text, var(--lq-color-ink)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='subtle'] {
    background: var(--lq-action-fill, color-mix(in srgb, var(--lq-tour-primary-surface) 12%, transparent));
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='outline'] {
    border-color: var(--lq-action-border, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
  }

  .rich-step-action-preview[data-lodariq-action-variant='link'] {
    min-height: var(--lq-control-sm);
    border-color: transparent;
    background: transparent;
    color: var(--lq-action-text, var(--lq-tour-primary-surface, var(--lq-color-primary)));
    padding: 0;
    text-decoration: underline;
  }
`;
