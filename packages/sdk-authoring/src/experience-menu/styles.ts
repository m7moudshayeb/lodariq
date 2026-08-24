/**
 * The experience menu's chrome, in the panel's own menu language.
 *
 * One stylesheet for both hosts. The launcher adds it to the host page's head
 * and the pill adds it to the panel's shadow root, so the two surfaces are the
 * same pixels rather than two drawings of the same idea.
 *
 * Positioned fixed and mounted outside its anchor on purpose: both the pill and
 * the launcher carry a backdrop-filter, which makes them the containing block
 * for any fixed descendant, and the pill's menu is a scroll container that would
 * clip a flyout anchored inside it.
 */
import {
  AUTHORING_TYPOGRAPHY_CSS_PROPERTIES,
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_FONT_STACK,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_TOKENS,
} from '../creator-chrome-tokens';

/** Above every piece of creator chrome, because it is opened by all of them. */
const EXPERIENCE_MENU_LAYER = 2147483646;
export const EXPERIENCE_MENU_WIDTH = 288;
/** Roughly seven rows: enough that scrolling is obviously possible. */
export const EXPERIENCE_MENU_MAX_HEIGHT = 340;

export const EXPERIENCE_MENU_CSS = `
[data-lodariq-experience-menu='true'] {
  ${AUTHORING_TYPOGRAPHY_CSS_PROPERTIES}
  position: fixed;
  z-index: ${EXPERIENCE_MENU_LAYER};
  /* The panel's shadow root is pointer-events:none at the host; chrome opts back in by name. */
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  width: ${EXPERIENCE_MENU_WIDTH}px;
  max-height: ${EXPERIENCE_MENU_MAX_HEIGHT}px;
  padding: 5px;
  border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
  border-radius: 9px;
  background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
  box-shadow: ${CREATOR_CHROME_GLASS.shadowRaised};
  color: ${CREATOR_CHROME_TOKENS.ink};
  font: var(--lq-weight-regular) var(--lq-font-sm)/1.35 ${CREATOR_CHROME_FONT_STACK};
  text-align: start;
  white-space: normal;
  box-sizing: border-box;
}

[data-lodariq-experience-menu='true'][hidden] {
  display: none;
}

[data-lodariq-experience-menu='true'] *,
[data-lodariq-experience-menu='true'] *::before,
[data-lodariq-experience-menu='true'] *::after {
  box-sizing: border-box;
}

.lodariq-experience-menu-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px 6px;
}

.lodariq-experience-menu-head strong {
  color: ${CREATOR_CHROME_TOKENS.inkStrong};
  font: var(--lq-weight-bold) var(--lq-font-sm)/1.2 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-menu-head span {
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: var(--lq-weight-regular) var(--lq-font-xs)/1.4 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-menu-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 2px 4px 6px;
  padding: 0 8px;
  border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.border};
  border-radius: 7px;
  background: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
}

.lodariq-experience-menu-search:focus-within {
  border-color: ${CREATOR_CHROME_TOKENS.focus};
}

.lodariq-experience-menu-search svg {
  flex: none;
  color: ${CREATOR_CHROME_TOKENS.subtle};
}

.lodariq-experience-menu-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  padding: 7px 0;
  background: transparent;
  color: ${CREATOR_CHROME_TOKENS.ink};
  font: var(--lq-weight-regular) var(--lq-font-sm)/1.2 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-menu-search input::placeholder {
  color: ${CREATOR_CHROME_TOKENS.subtle};
}

.lodariq-experience-menu-search input::-webkit-search-cancel-button {
  appearance: none;
}

.lodariq-experience-menu-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/*
 * The scopes share the menu's height; each open one scrolls inside its share.
 *
 * Not one scroller around both. That reads better right up until the first list
 * pages: its rows push the second header past the bottom edge, and every scroll
 * toward that header loads ten more rows in front of it, so the second list is
 * never reached. Bounding the open section keeps both headers on screen, which
 * is the only reason its count is worth printing.
 */
.lodariq-experience-menu-scopes {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/*
 * Shrink, never grow: a short list stays short and the next header follows it
 * up the menu, rather than being pushed to the bottom edge across a gap.
 */
.lodariq-experience-menu-scope {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/*
 * A closed section is its header and nothing else, and gives up none of it.
 *
 * Left shrinkable it takes its share of the squeeze along with the open list
 * above it — about half its own height — and the header it is made of spills
 * out of the menu's bottom edge, which is the one thing it exists to avoid.
 */
.lodariq-experience-menu-scope[data-experience-scope-open='false'] {
  flex: none;
}

/*
 * 30px tall, and the full 288px wide.
 * WCAG 2.2 AA asks 24x24 (2.5.8); 44x44 is the AAA bar the launcher button
 * holds itself to. This is a full-width row, so it is a large target by area.
 */
.lodariq-experience-menu-scope-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 30px;
  border: 0;
  border-radius: 7px;
  padding: 6px 9px;
  background: transparent;
  color: ${CREATOR_CHROME_TOKENS.muted};
  cursor: pointer;
  font: var(--lq-weight-bold) var(--lq-font-xs)/1.3 ${CREATOR_CHROME_FONT_STACK};
  letter-spacing: 0.06em;
  text-align: start;
  text-transform: uppercase;
}

.lodariq-experience-menu-scope-head:hover {
  background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
  color: ${CREATOR_CHROME_TOKENS.inkStrong};
}

.lodariq-experience-menu-scope-head:focus-visible {
  outline: 2px solid ${CREATOR_CHROME_TOKENS.focus};
  outline-offset: -2px;
}

.lodariq-experience-menu-scope-head strong {
  flex: 1;
  min-width: 0;
  color: inherit;
  font: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * The disclosure marker, by rotation rather than by two glyphs.
 *
 * Collapsed it points along the reading direction, which is the other way round
 * in Arabic; open it points down, which is down in both. Rotating rather than
 * mirroring is what keeps the open state from ending up upside down in one of
 * them.
 */
.lodariq-experience-menu-scope-head > svg {
  flex: none;
  color: ${CREATOR_CHROME_TOKENS.subtle};
  transform: rotate(0deg);
}

[dir='rtl'] .lodariq-experience-menu-scope-head > svg {
  transform: rotate(180deg);
}

.lodariq-experience-menu-scope-head[aria-expanded='true'] > svg,
[dir='rtl'] .lodariq-experience-menu-scope-head[aria-expanded='true'] > svg {
  transform: rotate(90deg);
}

.lodariq-experience-menu-scope-head:hover > svg {
  color: inherit;
}

.lodariq-experience-menu-scope-count {
  flex: none;
  border-radius: 999px;
  padding: 1px 7px;
  background: ${CREATOR_CHROME_TOKENS.surfaceStrong};
  color: ${CREATOR_CHROME_TOKENS.subtle};
  font: var(--lq-weight-bold) var(--lq-font-xs)/1.5 ${CREATOR_CHROME_FONT_STACK};
  font-variant-numeric: tabular-nums;
  letter-spacing: normal;
}

/* A host that cannot count cheaply prints nothing, not a badge holding a space. */
.lodariq-experience-menu-scope-count:empty {
  display: none;
}

/* Indented in reading direction, so the rows read as belonging to the header. */
.lodariq-experience-menu-scope-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-inline-start: 8px;
}

.lodariq-experience-menu-scope-list[hidden] {
  display: none;
}

.lodariq-experience-menu-row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: 0;
  border-radius: 7px;
  padding: 7px 9px;
  background: transparent;
  color: ${CREATOR_CHROME_TOKENS.inkSoft};
  cursor: pointer;
  font: var(--lq-weight-regular) var(--lq-font-sm)/1.25 ${CREATOR_CHROME_FONT_STACK};
  text-align: start;
}

.lodariq-experience-menu-row:hover,
.lodariq-experience-menu-row[data-active='true'] {
  background: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
  color: ${CREATOR_CHROME_TOKENS.inkStrong};
}

.lodariq-experience-menu-row:focus-visible {
  outline: 2px solid ${CREATOR_CHROME_TOKENS.focus};
  outline-offset: -2px;
}

.lodariq-experience-menu-row[aria-busy='true'] {
  opacity: 0.6;
  cursor: progress;
}

.lodariq-experience-menu-row > svg {
  flex: none;
  color: ${CREATOR_CHROME_TOKENS.muted};
}

.lodariq-experience-menu-row:hover > svg,
.lodariq-experience-menu-row[data-active='true'] > svg {
  color: inherit;
}

.lodariq-experience-menu-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lodariq-experience-menu-copy strong {
  color: inherit;
  font: var(--lq-weight-bold) var(--lq-font-sm)/1.25 ${CREATOR_CHROME_FONT_STACK};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lodariq-experience-menu-copy small {
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: var(--lq-weight-regular) var(--lq-font-xs)/1.35 ${CREATOR_CHROME_FONT_STACK};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lodariq-experience-menu-badge {
  flex: none;
  border-radius: 999px;
  padding: 2px 7px;
  background: ${CREATOR_CHROME_TOKENS.surfaceStrong};
  color: ${CREATOR_CHROME_TOKENS.subtle};
  font: var(--lq-weight-bold) var(--lq-font-xs)/1.5 ${CREATOR_CHROME_FONT_STACK};
  text-transform: capitalize;
}

.lodariq-experience-menu-status {
  margin: 0;
  padding: 10px 9px;
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: var(--lq-weight-regular) var(--lq-font-sm)/1.45 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-menu-status button {
  margin-top: 6px;
  border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.border};
  border-radius: 7px;
  padding: 5px 10px;
  background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
  color: ${CREATOR_CHROME_TOKENS.ink};
  cursor: pointer;
  font: var(--lq-weight-bold) var(--lq-font-xs)/1.3 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-menu-sentinel {
  flex: none;
  height: 1px;
}

@media (prefers-reduced-motion: no-preference) {
  [data-lodariq-experience-menu='true'] {
    animation: lodariq-experience-menu-in 110ms ease-out;
  }

  .lodariq-experience-menu-scope-head > svg {
    transition: transform 120ms ease-out;
  }
}

@keyframes lodariq-experience-menu-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
`;

/**
 * The name dialog (§10 modal rules, at the small end).
 *
 * A scrim rather than a popover: naming the thing is the only job on screen
 * until it is answered, and a popover that closes on an outside click would
 * throw the type choice away with it.
 */
export const EXPERIENCE_NAME_DIALOG_CSS = `
[data-lodariq-experience-dialog-scrim='true'] {
  ${AUTHORING_TYPOGRAPHY_CSS_PROPERTIES}
  position: fixed;
  inset: 0;
  z-index: ${EXPERIENCE_MENU_LAYER};
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: ${CREATOR_CHROME_TOKENS.imageScrim};
}

.lodariq-experience-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(360px, 100%);
  border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
  border-radius: 12px;
  padding: 18px;
  background: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
  box-shadow: ${CREATOR_CHROME_GLASS.shadowRaised};
  box-sizing: border-box;
}

.lodariq-experience-dialog * {
  box-sizing: border-box;
}

.lodariq-experience-dialog header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lodariq-experience-dialog header strong {
  color: ${CREATOR_CHROME_TOKENS.inkStrong};
  font: var(--lq-weight-bold) var(--lq-font-md)/1.25 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-dialog header span {
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: var(--lq-weight-regular) var(--lq-font-sm)/1.45 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-dialog label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: ${CREATOR_CHROME_TOKENS.muted};
  font: var(--lq-weight-bold) var(--lq-font-xs)/1.3 ${CREATOR_CHROME_FONT_STACK};
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lodariq-experience-dialog input {
  border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.border};
  border-radius: 8px;
  padding: 9px 11px;
  background: ${CREATOR_CHROME_TOKENS.surfaceRecessed};
  color: ${CREATOR_CHROME_TOKENS.ink};
  font: var(--lq-weight-regular) var(--lq-font-sm)/1.3 ${CREATOR_CHROME_FONT_STACK};
  letter-spacing: normal;
  text-transform: none;
}

.lodariq-experience-dialog input:focus-visible {
  outline: none;
  border-color: ${CREATOR_CHROME_TOKENS.focus};
}

.lodariq-experience-dialog-error {
  margin: 0;
  color: ${CREATOR_CHROME_TOKENS.action};
  font: var(--lq-weight-regular) var(--lq-font-xs)/1.4 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-dialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.lodariq-experience-dialog footer button {
  border: 1px solid ${CREATOR_CHROME_CONTROL_TOKENS.border};
  border-radius: 8px;
  padding: 8px 14px;
  background: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
  color: ${CREATOR_CHROME_TOKENS.ink};
  cursor: pointer;
  font: var(--lq-weight-bold) var(--lq-font-sm)/1.2 ${CREATOR_CHROME_FONT_STACK};
}

.lodariq-experience-dialog footer button[data-lodariq-experience-dialog-confirm] {
  border-color: transparent;
  background: ${CREATOR_CHROME_TOKENS.action};
  color: ${CREATOR_CHROME_TOKENS.onAction};
}

.lodariq-experience-dialog footer button[aria-busy='true'] {
  opacity: 0.6;
  cursor: progress;
}
`;
