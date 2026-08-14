import {
  AUTHORING_CONTROL_HEIGHT,
  AUTHORING_FONT_WEIGHT,
  AUTHORING_RADIUS_SCALE,
  AUTHORING_SPACE_SCALE,
  AUTHORING_TYPE_SCALE,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_TOKENS,
} from '../../../creator-chrome-tokens';

export const AUTHORING_FOUNDATION_CSS = `
  :root {
    --lq-color-ink: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-ink-soft: #c6cbd3;
    --lq-color-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-subtle: #7a828d;
    --lq-color-page: ${CREATOR_CHROME_TOKENS.canvas};
    --lq-color-panel: ${CREATOR_CHROME_TOKENS.surface};
    --lq-color-panel-strong: #26292f;
    --lq-color-border: ${CREATOR_CHROME_TOKENS.border};
    --lq-color-border-soft: #26292f;
    --lq-color-chrome: #101216;
    --lq-color-chrome-text: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-chrome-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-primary: ${CREATOR_CHROME_TOKENS.action};
    --lq-color-primary-hover: ${CREATOR_CHROME_TOKENS.actionHover};
    --lq-color-on-primary: ${CREATOR_CHROME_TOKENS.onAction};
    --lq-color-primary-soft: rgba(61, 232, 176, 0.1);
    --lq-color-primary-border: rgba(61, 232, 176, 0.32);
    --lq-color-blue: ${CREATOR_CHROME_TOKENS.focus};
    --lq-color-blue-soft: rgba(61, 232, 176, 0.1);
    --lq-color-blue-border: rgba(61, 232, 176, 0.32);
    --lq-color-success: #34c98e;
    --lq-color-success-soft: rgba(52, 201, 142, 0.12);
    --lq-color-success-border: rgba(52, 201, 142, 0.34);
    --lq-color-warning: #f5b84d;
    --lq-color-warning-soft: rgba(245, 184, 77, 0.12);
    --lq-color-warning-border: rgba(245, 184, 77, 0.34);
    --lq-color-danger: #f26d6d;
    --lq-color-danger-soft: rgba(242, 109, 109, 0.12);
    --lq-color-danger-border: rgba(242, 109, 109, 0.34);
    --lq-radius-xs: ${AUTHORING_RADIUS_SCALE[0]}px;
    --lq-radius-sm: ${AUTHORING_RADIUS_SCALE[0]}px;
    --lq-radius-md: ${AUTHORING_RADIUS_SCALE[1]}px;
    --lq-space-1: ${AUTHORING_SPACE_SCALE[0]}px;
    --lq-space-2: ${AUTHORING_SPACE_SCALE[1]}px;
    --lq-space-3: ${AUTHORING_SPACE_SCALE[2]}px;
    --lq-space-4: ${AUTHORING_SPACE_SCALE[3]}px;
    --lq-space-5: ${AUTHORING_SPACE_SCALE[4]}px;
    --lq-space-6: ${AUTHORING_SPACE_SCALE[5]}px;
    --lq-space-7: ${AUTHORING_SPACE_SCALE[6]}px;
    --lq-font-2xs: ${AUTHORING_TYPE_SCALE[0]}px;
    --lq-font-xs: ${AUTHORING_TYPE_SCALE[1]}px;
    --lq-font-sm: ${AUTHORING_TYPE_SCALE[2]}px;
    --lq-font-md: ${AUTHORING_TYPE_SCALE[3]}px;
    --lq-font-lg: ${AUTHORING_TYPE_SCALE[4]}px;
    --lq-font-xl: ${AUTHORING_TYPE_SCALE[5]}px;
    --lq-font-2xl: ${AUTHORING_TYPE_SCALE[6]}px;
    --lq-font-3xl: ${AUTHORING_TYPE_SCALE[7]}px;
    --lq-font-4xl: ${AUTHORING_TYPE_SCALE[8]}px;
    --lq-weight-regular: ${AUTHORING_FONT_WEIGHT.regular};
    --lq-weight-medium: ${AUTHORING_FONT_WEIGHT.medium};
    --lq-weight-semibold: ${AUTHORING_FONT_WEIGHT.semibold};
    --lq-weight-bold: ${AUTHORING_FONT_WEIGHT.bold};
    --lq-control-sm: ${AUTHORING_CONTROL_HEIGHT.sm}px;
    --lq-control-md: ${AUTHORING_CONTROL_HEIGHT.md}px;
    --lq-control-lg: ${AUTHORING_CONTROL_HEIGHT.lg}px;
    --lq-shadow-popover: 0 16px 40px rgba(0, 0, 0, 0.44);
    font-family: ${CREATOR_CHROME_FONT_STACK};
    color: var(--lq-color-ink);
    background: var(--lq-color-page);
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    background: var(--lq-color-page);
    overflow-x: clip;
  }

  button,
  input,
  select,
  textarea {
    max-width: 100%;
    font: inherit;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible,
  .block:focus-visible,
  .ui-select-trigger:focus-visible,
  .ui-select-item:focus-visible,
  .ui-number-combobox-trigger:focus-visible,
  .ui-number-combobox-option:focus-visible,
  .ui-tabs-trigger:focus-visible {
    outline: 2px solid var(--lq-color-blue);
    outline-offset: 2px;
  }

  .document-title-input:focus-visible,
  .slash input:focus-visible,
  .step-composer-input:focus-visible,
  .block-input:focus-visible,
  .inline-command-search:focus-visible {
    outline: 0;
  }
`;
