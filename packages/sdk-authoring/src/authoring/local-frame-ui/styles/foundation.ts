import {
  AUTHORING_CONTROL_HEIGHT,
  AUTHORING_RADIUS_SCALE,
  AUTHORING_SPACE_SCALE,
  AUTHORING_TYPOGRAPHY_CSS_PROPERTIES,
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_STATUS_TOKENS,
  CREATOR_CHROME_TOKENS,
} from '../../../creator-chrome-tokens';

export const AUTHORING_FOUNDATION_CSS = `
  :root {
    ${AUTHORING_TYPOGRAPHY_CSS_PROPERTIES}
    --lq-color-ink: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-ink-strong: ${CREATOR_CHROME_TOKENS.inkStrong};
    --lq-color-ink-soft: ${CREATOR_CHROME_TOKENS.inkSoft};
    --lq-color-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-subtle: ${CREATOR_CHROME_TOKENS.subtle};
    --lq-color-page: ${CREATOR_CHROME_TOKENS.canvas};
    --lq-color-panel: ${CREATOR_CHROME_TOKENS.surface};
    --lq-color-panel-strong: ${CREATOR_CHROME_TOKENS.surfaceStrong};
    /* A well rather than a raised surface: index chips, tracks, grooves. */
    --lq-color-panel-recessed: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
    --lq-color-border: ${CREATOR_CHROME_TOKENS.border};
    --lq-color-border-soft: ${CREATOR_CHROME_TOKENS.borderSoft};
    --lq-color-chrome: ${CREATOR_CHROME_TOKENS.chrome};
    --lq-color-chrome-text: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-chrome-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-primary: ${CREATOR_CHROME_TOKENS.action};
    --lq-color-primary-hover: ${CREATOR_CHROME_TOKENS.actionHover};
    --lq-color-on-primary: ${CREATOR_CHROME_TOKENS.onAction};
    --lq-color-primary-soft: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 10%, transparent);
    --lq-color-primary-border: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 32%, transparent);
    --lq-color-blue: ${CREATOR_CHROME_TOKENS.focus};
    --lq-color-blue-soft: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.focus} 10%, transparent);
    --lq-color-blue-border: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.focus} 32%, transparent);
    --lq-color-success: ${CREATOR_CHROME_STATUS_TOKENS.positive};
    --lq-color-success-soft: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.positive} 12%, transparent);
    --lq-color-success-border: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.positive} 34%, transparent);
    --lq-color-warning: ${CREATOR_CHROME_STATUS_TOKENS.attention};
    --lq-color-warning-soft: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.attention} 12%, transparent);
    --lq-color-warning-border: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.attention} 34%, transparent);
    --lq-color-danger: ${CREATOR_CHROME_STATUS_TOKENS.danger};
    --lq-color-danger-soft: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.danger} 12%, transparent);
    --lq-color-danger-border: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.danger} 34%, transparent);
    --lq-color-peer: ${CREATOR_CHROME_STATUS_TOKENS.peer};
    /*
     * Concentric-circle crosshair, as a mask so it inherits the colour of
     * whatever draws it. It lives here rather than in a component because it is
     * painted by a pseudo-element, which cannot hold an inline SVG child.
     */
    --lq-glyph-target: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.75'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Ccircle cx='12' cy='12' r='5'/%3E%3Ccircle cx='12' cy='12' r='1'/%3E%3C/svg%3E");
    --lq-color-success-ink: ${CREATOR_CHROME_STATUS_TOKENS.positiveInk};
    --lq-color-warning-ink: ${CREATOR_CHROME_STATUS_TOKENS.attentionInk};
    --lq-color-danger-ink: ${CREATOR_CHROME_STATUS_TOKENS.dangerInk};
    /*
     * The hairline that pairs with glass on floating chrome. Separate from
     * --lq-color-border because that one is re-declared per surface context
     * (light in the workspace, menu-dark over a customer page) — glass chrome
     * is the same dark chip in every shell, so its edge must not follow.
     */
    --lq-color-chrome-border: ${CREATOR_CHROME_TOKENS.border};
    --lq-glass-bg: ${CREATOR_CHROME_GLASS.background};
    --lq-glass-blur: ${CREATOR_CHROME_GLASS.blur};
    --lq-shadow-chrome: ${CREATOR_CHROME_GLASS.shadow};
    --lq-color-control: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
    --lq-color-control-hover: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    --lq-color-control-border: ${CREATOR_CHROME_CONTROL_TOKENS.border};
    --lq-color-control-quiet: ${CREATOR_CHROME_CONTROL_TOKENS.quiet};
    --lq-color-menu: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
    --lq-color-menu-border: ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
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
    --lq-control-sm: ${AUTHORING_CONTROL_HEIGHT.sm}px;
    --lq-control-md: ${AUTHORING_CONTROL_HEIGHT.md}px;
    --lq-control-lg: ${AUTHORING_CONTROL_HEIGHT.lg}px;
    --lq-shadow-popover: ${CREATOR_CHROME_GLASS.shadowRaised};
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
