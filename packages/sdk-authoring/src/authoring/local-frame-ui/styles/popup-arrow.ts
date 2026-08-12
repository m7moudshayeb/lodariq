export const AUTHORING_POPUP_ARROW_CSS = `
  .storyboard-editor-stage .storyboard-popup-arrow {
    position: absolute;
    z-index: 2;
    display: block;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    border: var(--lq-tour-border-width, 1px) solid
      var(--lq-popup-border, var(--lq-tour-border-color, var(--lq-color-border)));
    background: var(--lq-popup-surface, var(--lq-tour-surface, #ffffff));
    pointer-events: none;
    transform: rotate(45deg);
  }

  .storyboard-editor-stage
    .rich-step-popup-frame[data-lodariq-popup-border-weight='none']
    > .storyboard-popup-arrow {
    border-color: var(--lq-popup-surface, var(--lq-tour-surface, #ffffff));
  }

  .storyboard-editor-stage .storyboard-popup-arrow[data-placement='bottom'] {
    top: -8px;
    left: calc(50% - 8px);
    border-right: 0;
    border-bottom: 0;
  }

  .storyboard-editor-stage .storyboard-popup-arrow[data-placement='top'] {
    bottom: -8px;
    left: calc(50% - 8px);
    border-top: 0;
    border-left: 0;
  }

  .storyboard-editor-stage .storyboard-popup-arrow[data-placement='right'] {
    top: calc(50% - 8px);
    left: -8px;
    border-top: 0;
    border-right: 0;
  }

  .storyboard-editor-stage .storyboard-popup-arrow[data-placement='left'] {
    top: calc(50% - 8px);
    right: -8px;
    border-bottom: 0;
    border-left: 0;
  }
`;
