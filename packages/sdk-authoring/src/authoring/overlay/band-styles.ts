/**
 * Bands (§3.3, §4.4a, §15.2) — the full-width glass strips that speak for a
 * whole mode: the picker's instruction, its breadcrumb, and the step lock.
 *
 * One stylesheet for both documents. The picker's bands live on the host page
 * (the bridge owns them) and the lock band lives in the panel's shadow root, so
 * without a shared source they drift into two things that look almost alike.
 */
import {
  AUTHORING_TYPOGRAPHY_CSS_PROPERTIES,
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_STATUS_TOKENS,
  CREATOR_CHROME_TOKENS,
} from '../../creator-chrome-tokens';

/** The strip's own height, so callers can inset around one. */
export const BAND_HEIGHT_PX = 46;

export function bandStyles(zIndex: number): string {
  return `
  /*
   * Edge to edge and pointer-transparent.
   *
   * The band has to be readable as a mode the whole page is in, which is why it
   * spans the viewport. But the top edge is where a product keeps its own
   * navigation, and that is often exactly what the creator is trying to point
   * at — so the strip takes no clicks and only its controls do. The highlight
   * and the crosshair still track whatever is underneath.
   */
  .lq-band {
    ${AUTHORING_TYPOGRAPHY_CSS_PROPERTIES}
    position: fixed;
    left: 0;
    right: 0;
    top: 0;
    z-index: ${zIndex};
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 14px;
    background: ${CREATOR_CHROME_GLASS.background};
    backdrop-filter: ${CREATOR_CHROME_GLASS.blur};
    border-bottom: 1px solid ${CREATOR_CHROME_TOKENS.border};
    color: ${CREATOR_CHROME_TOKENS.ink};
    font: var(--lq-weight-regular) var(--lq-font-md)/1.5 ${CREATOR_CHROME_FONT_STACK};
    pointer-events: none;
    transition: opacity 120ms linear;
  }

  /*
   * Automatic avoidance (§3.4 rule 5). Pointer-transparency means you can reach
   * the header under the band, but not see it, and you cannot choose what you
   * cannot see. So the band steps aside while the thing you are pointing at is
   * underneath it, and comes back the moment it is not. Reaching for the band's
   * own buttons restores it, because a child with pointer-events still hovers
   * its parent.
   */
  .lq-band[data-dodge='true'] {
    opacity: 0.12;
  }

  .lq-band[data-dodge='true']:hover {
    opacity: 1;
  }

  .lq-band[data-band='bottom'] {
    top: auto;
    bottom: 0;
    border-bottom: 0;
    border-top: 1px solid ${CREATOR_CHROME_TOKENS.border};
  }

  .lq-band button,
  .lq-band [data-band-crumbs] {
    pointer-events: auto;
  }

  /* Flex children ignore the hidden attribute unless it is said again. */
  .lq-band [hidden] {
    display: none;
  }

  .lq-band-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-weight: var(--lq-weight-bold);
  }

  .lq-band-title svg {
    flex: none;
  }

  .lq-band-grow {
    flex: 1;
  }

  .lq-band button {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 27px;
    padding: 6px 12px;
    border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.border};
    border-radius: 7px;
    background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
    color: ${CREATOR_CHROME_TOKENS.ink};
    cursor: pointer;
    font: var(--lq-weight-regular) var(--lq-font-sm)/1 ${CREATOR_CHROME_FONT_STACK};
    white-space: nowrap;
  }

  /* A button's glyph is smaller than the band's own lead icon, as in §4.4a. */
  .lq-band button svg {
    flex: none;
    width: 13px;
    height: 13px;
  }

  .lq-band button:hover:not(:disabled) {
    background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
  }

  .lq-band button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  /* One primary per band: the thing the mode exists to do. */
  .lq-band button[data-band-primary] {
    border-color: ${CREATOR_CHROME_TOKENS.action};
    background: ${CREATOR_CHROME_TOKENS.action};
    color: ${CREATOR_CHROME_TOKENS.onAction};
    font-weight: var(--lq-weight-bold);
  }

  .lq-band button[data-band-primary]:hover:not(:disabled) {
    background: ${CREATOR_CHROME_TOKENS.actionHover};
  }

  .lq-band-tag {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2.5px 7px;
    border-radius: 5px;
    background: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.attention} 16%, transparent);
    color: ${CREATOR_CHROME_STATUS_TOKENS.attention};
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  /* The ancestor trail, in plain language. Every crumb is a click target (§4.4). */
  .lq-band-crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    min-width: 0;
    color: ${CREATOR_CHROME_TOKENS.muted};
    font-size: var(--lq-font-sm);
  }

  .lq-band-crumbs button {
    min-height: 19px;
    padding: 3px 7px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: ${CREATOR_CHROME_TOKENS.muted};
    line-height: 1.15;
  }

  .lq-band-crumbs button:hover:not(:disabled) {
    background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    color: ${CREATOR_CHROME_TOKENS.inkStrong};
  }

  .lq-band-crumbs button[aria-current='true'] {
    background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
    color: ${CREATOR_CHROME_TOKENS.inkStrong};
    font-weight: var(--lq-weight-semibold);
  }

  .lq-band-crumbs [data-band-separator] {
    display: flex;
    flex: none;
    color: ${CREATOR_CHROME_TOKENS.subtle};
  }
  `;
}
