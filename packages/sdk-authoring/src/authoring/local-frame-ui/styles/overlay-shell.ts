/**
 * The overlay frame's chrome.
 *
 * Two surfaces live in this file and they are deliberately opposite:
 *
 * - **`.shell-overlay`** floats over the customer's page — toolbar, inspector,
 *   the card's surroundings. It is restrained dark glass, because chrome that
 *   floats over someone else's (usually light) product has to read as an editing
 *   layer rather than as part of the page. It inherits `foundation.ts` unchanged.
 * - **`.shell-operations`** is a full-screen sheet with no page behind it. It is
 *   darker still than the glass: with nothing showing through, the sheet needs
 *   its own well/surface pair to seat a nav, a body and a card on.
 *
 * The card itself is neither: it renders in the customer's Brand Theme through
 * `--lq-tour-*`, because it is a preview of published output.
 *
 * Reference: authoring-spec.html → `--c-*` "restrained glass" · §4.2a, §4.3
 */
import {
  CREATOR_CHROME_CONTROL_TOKENS,
  CREATOR_CHROME_GLASS,
  CREATOR_CHROME_STATUS_TOKENS,
  CREATOR_CHROME_TOKENS,
  OPERATIONS_NOTE_TOKENS,
  OPERATIONS_SHEET_TOKENS,
  OPERATIONS_TAG_TOKENS,
} from '../../../creator-chrome-tokens';
import {
  OVERLAY_CHROME_PAD_PX,
  OVERLAY_INSPECTOR_MIN_HEIGHT_PX,
  OVERLAY_INSPECTOR_WIDTH_PX,
  OVERLAY_CONTROL_RADIUS_PX,
  OVERLAY_TOOLBAR_BAND_PX,
  OVERLAY_TOOLBAR_HEIGHT_PX,
  OVERLAY_TOOLBAR_RADIUS_PX,
} from '../../overlay/constants';

/**
 * The inspector column, spelled with its attribute so every correction below
 * outranks the wide-tray rules it is overriding without resorting to !important.
 */
const inspector = ".overlay-step-inspector[data-present='true']";

/** Floating chrome: one declaration, so toolbar and inspector cannot drift apart. */
const glassSurface = `
    background: var(--lq-glass-bg);
    backdrop-filter: var(--lq-glass-blur);
    border: 1px solid var(--lq-color-border);
    color: var(--lq-color-ink);
    color-scheme: dark;
`;

/**
 * The sheet is dark, like every other creator surface.
 *
 * It was light, which is the one thing §4.6 cannot afford: Operations is the
 * moment the creator stops looking at their product and looks at the tool, and a
 * white full-bleed sheet reads as *their page* rather than as Lodariq's. The
 * light contextual palette belongs to inline editing controls that sit inside a
 * customer's card — not to a surface that covers the viewport.
 */
const operationsTokens = `
    --lq-color-ink: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-ink-strong: ${CREATOR_CHROME_TOKENS.inkStrong};
    --lq-color-ink-soft: ${CREATOR_CHROME_TOKENS.inkSoft};
    --lq-color-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-subtle: ${CREATOR_CHROME_TOKENS.subtle};
    --lq-color-page: ${OPERATIONS_SHEET_TOKENS.body};
    --lq-color-panel: ${OPERATIONS_SHEET_TOKENS.box};
    --lq-color-panel-strong: ${CREATOR_CHROME_TOKENS.surface};
    --lq-color-panel-recessed: ${OPERATIONS_SHEET_TOKENS.code};
    --lq-color-border: ${CREATOR_CHROME_TOKENS.border};
    --lq-color-border-soft: ${CREATOR_CHROME_TOKENS.borderSoft};
    --lq-color-control: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
    --lq-color-control-hover: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    --lq-color-control-border: ${CREATOR_CHROME_CONTROL_TOKENS.border};
    --lq-color-primary: ${CREATOR_CHROME_TOKENS.action};
    --lq-color-primary-hover: ${CREATOR_CHROME_TOKENS.actionHover};
    --lq-color-on-primary: ${CREATOR_CHROME_TOKENS.onAction};
    --lq-color-blue: ${CREATOR_CHROME_TOKENS.focus};
    --lq-shadow-popover: ${CREATOR_CHROME_GLASS.shadowRaised};
    /* The sheet's own surfaces, used by operations-sections.ts. */
    --lq-sheet-body: ${OPERATIONS_SHEET_TOKENS.body};
    --lq-sheet-nav: ${OPERATIONS_SHEET_TOKENS.nav};
    --lq-sheet-box: ${OPERATIONS_SHEET_TOKENS.box};
    --lq-sheet-nav-hover: ${OPERATIONS_SHEET_TOKENS.navHover};
    --lq-sheet-nav-active: ${OPERATIONS_SHEET_TOKENS.navActive};
    --lq-sheet-meter-track: ${OPERATIONS_SHEET_TOKENS.meterTrack};
    --lq-sheet-table-rule: ${OPERATIONS_SHEET_TOKENS.tableRule};
    --lq-sheet-code: ${OPERATIONS_SHEET_TOKENS.code};
    --lq-sheet-map: ${OPERATIONS_SHEET_TOKENS.mapSurface};
    --lq-sheet-map-dot: ${OPERATIONS_SHEET_TOKENS.mapDot};
    --lq-sheet-map-node: ${OPERATIONS_SHEET_TOKENS.mapNode};
    --lq-tag-ok-ink: ${OPERATIONS_TAG_TOKENS.okInk};
    --lq-tag-warn-ink: ${OPERATIONS_TAG_TOKENS.warnInk};
    --lq-tag-bad-ink: ${OPERATIONS_TAG_TOKENS.badInk};
    --lq-tag-peer-ink: ${OPERATIONS_TAG_TOKENS.peerInk};
    --lq-tag-accent-ink: ${OPERATIONS_TAG_TOKENS.accentInk};
    --lq-tag-neutral: ${OPERATIONS_TAG_TOKENS.neutralSurface};
    --lq-tag-neutral-ink: ${OPERATIONS_TAG_TOKENS.neutralInk};
    --lq-tag-ok: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.positive} 15%, transparent);
    --lq-tag-warn: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.attention} 16%, transparent);
    --lq-tag-bad: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.danger} 15%, transparent);
    --lq-tag-peer: color-mix(in srgb, ${CREATOR_CHROME_STATUS_TOKENS.peer} 20%, transparent);
    --lq-tag-accent: color-mix(in srgb, ${CREATOR_CHROME_TOKENS.action} 18%, transparent);
    --lq-note-warn: ${OPERATIONS_NOTE_TOKENS.warnSurface};
    --lq-note-warn-border: ${OPERATIONS_NOTE_TOKENS.warnBorder};
    --lq-note-warn-ink: ${OPERATIONS_NOTE_TOKENS.warnInk};
    --lq-note-ok: ${OPERATIONS_NOTE_TOKENS.okSurface};
    --lq-note-ok-border: ${OPERATIONS_NOTE_TOKENS.okBorder};
    --lq-note-ok-ink: ${OPERATIONS_NOTE_TOKENS.okInk};
    --lq-note-bad: ${OPERATIONS_NOTE_TOKENS.badSurface};
    --lq-note-bad-border: ${OPERATIONS_NOTE_TOKENS.badBorder};
    --lq-note-bad-ink: ${OPERATIONS_NOTE_TOKENS.badInk};
    --lq-note-info: ${OPERATIONS_NOTE_TOKENS.infoSurface};
    --lq-note-info-border: ${OPERATIONS_NOTE_TOKENS.infoBorder};
    --lq-note-info-ink: ${OPERATIONS_NOTE_TOKENS.infoInk};
    background: var(--lq-sheet-body);
    color: var(--lq-color-ink);
    color-scheme: dark;
`;

/**
 * Menus, popovers and floating layers re-declare the light contextual palette on
 * themselves — correct in the light workspace, wrong on either dark surface. A
 * dropdown opened from the glass inspector, or from anywhere in the Operations
 * sheet, rendered as a white card with light borders. Both take the chrome's own
 * menu pair instead.
 */
const chromeMenuTokens = `
    --lq-color-ink: ${CREATOR_CHROME_TOKENS.ink};
    --lq-color-ink-soft: ${CREATOR_CHROME_TOKENS.inkSoft};
    --lq-color-muted: ${CREATOR_CHROME_TOKENS.muted};
    --lq-color-subtle: ${CREATOR_CHROME_TOKENS.subtle};
    --lq-color-page: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
    --lq-color-panel: ${CREATOR_CHROME_CONTROL_TOKENS.menu};
    --lq-color-panel-strong: ${CREATOR_CHROME_CONTROL_TOKENS.surface};
    --lq-color-border: ${CREATOR_CHROME_CONTROL_TOKENS.menuBorder};
    --lq-color-border-soft: ${CREATOR_CHROME_TOKENS.borderSoft};
    --lq-color-primary: ${CREATOR_CHROME_TOKENS.action};
    --lq-color-primary-hover: ${CREATOR_CHROME_TOKENS.actionHover};
    --lq-color-primary-soft: ${CREATOR_CHROME_CONTROL_TOKENS.hover};
    --lq-color-blue: ${CREATOR_CHROME_TOKENS.focus};
    color: var(--lq-color-ink);
    color-scheme: dark;
`;

const CHROME_MENU_SURFACES = [
  '.menu',
  '.inline-command-menu',
  '.step-command-menu',
  '.ui-select-content',
  '.ui-searchable-select-content',
  '.ui-popover-content',
  '.rich-content-menu',
  '.rich-content-block-handles',
  '.rich-content-floating-layer',
].flatMap((selector) => [
  `html:has(.shell-overlay) ${selector}`,
  `html:has(.shell-operations) ${selector}`,
]).join(',\n  ');

export const AUTHORING_OVERLAY_SHELL_CSS = `
  ${CHROME_MENU_SURFACES} {
    ${chromeMenuTokens}
  }

  html:has(.shell-operations) {
    ${operationsTokens}
  }

  html:has(.shell-overlay),
  html:has(.shell-overlay) body,
  .shell.shell-overlay,
  .shell-overlay .workspace,
  .shell-overlay .overlay-step-shell,
  .shell-overlay .canvas,
  .shell-overlay .panel-canvas {
    background: transparent !important;
  }

  html:has(.shell-overlay),
  html:has(.shell-overlay) body {
    position: relative;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    /**
     * The document itself is forced transparent above, so the customer's page is
     * the ground. This token is not the ground though — around twenty controls
     * fill with it (inputs, popovers, chips), so it has to stay a real surface or
     * they render as bare text over the product.
     */
    --lq-color-page: ${CREATOR_CHROME_TOKENS.canvas};
    /**
     * normal, not dark. A root color-scheme of dark makes the UA paint its own
     * dark canvas, and a transparent document then shows *that* rather than the
     * page underneath — the overlay rendered as a black slab around the card. The
     * chrome surfaces below opt into the dark scheme individually, which is where
     * it is actually wanted (form controls inside the inspector).
     */
    color-scheme: normal;
  }

  .shell.shell-overlay {
    position: absolute !important;
    inset: 0 !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  .shell-overlay .workspace,
  .overlay-step-shell {
    position: absolute;
    inset: 0;
    height: auto;
    min-height: 0;
    overflow: visible;
    padding: 0;
  }

  html:has(.shell-operations),
  html:has(.shell-operations) body {
    position: relative;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--lq-sheet-body);
  }

  .shell.shell-operations {
    position: absolute;
    inset: 0;
    height: auto;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  .shell-operations .workspace {
    position: absolute;
    inset: 0;
    height: auto;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }

  .shell-overlay {
    min-height: 0;
    height: 100%;
    padding: 0;
    overflow: hidden;
  }

  .shell-panel.shell-overlay {
    container-type: normal;
  }

  .shell-overlay .workspace {
    height: 100%;
    min-height: 0;
    padding: 0;
  }

  /**
   * Three absolutely positioned peers, each at the box the host solved for it —
   * the prototype's #tbar / #cwrap / #insp. Nothing is in flow, so no
   * surface can push another: the card stays exactly where the runtime will ship
   * it, and opening the inspector cannot move it.
   */
  .overlay-step-shell,
  .overlay-step-main {
    padding: 0;
    pointer-events: none;
  }

  .overlay-step-main {
    position: absolute;
    inset: 0;
  }

  /**
   * The bar takes the width of its controls, centred over the span the solver
   * cleared for it.
   *
   * §4.2a rule 1 is about not being *coupled* to the card — it exists so a text
   * toolbar is never squeezed into a 260px card and left with 14px hit targets.
   * Reserving the full 420px minimum for three words satisfied the rule and
   * looked broken: a mostly-empty bar with the trailing control marooned at the
   * far end. Content-sized never squeezes either, and the reserved span is still
   * the ceiling, so the bar cannot leave the frame.
   */
  .overlay-step-toolbar {
    position: absolute;
    left: var(--overlay-toolbar-center, 50%);
    top: var(--overlay-toolbar-y, ${OVERLAY_CHROME_PAD_PX}px);
    width: max-content;
    max-width: var(--overlay-toolbar-width, 100%);
    transform: translateX(-50%);
  }

  .overlay-step-card,
  .overlay-step-empty {
    position: absolute;
    left: var(--overlay-card-x, ${OVERLAY_CHROME_PAD_PX}px);
    top: var(--overlay-card-y, ${OVERLAY_TOOLBAR_BAND_PX}px);
    width: var(--overlay-card-width, auto);
    /*
     * The card is absolutely positioned, so without a height it is sized by its
     * content and a creator who drags it taller gets a taller *frame* around an
     * unchanged card. The authored height is what they chose; content grows past
     * it, never shrinks below it.
     */
    min-height: var(--overlay-card-height, auto);
  }

  .overlay-step-toolbar,
  .overlay-step-card,
  .overlay-choose-target,
  .overlay-step-empty,
  .overlay-step-inspector[data-present='true'] {
    pointer-events: auto;
  }

  .overlay-step-inspector[data-present='false'] {
    display: none;
  }

  .overlay-step-inspector[data-present='true'] {
    position: absolute;
    left: var(--overlay-inspector-x, ${OVERLAY_CHROME_PAD_PX}px);
    top: var(--overlay-inspector-y, ${OVERLAY_CHROME_PAD_PX}px);
    z-index: 2;
    display: flex;
    flex-direction: column;
    width: ${OVERLAY_INSPECTOR_WIDTH_PX}px;
    /**
     * §4.3's 60vh cap is applied by the host, which is the only side that knows
     * the real viewport: inside the frame, vh resolves against the frame's own
     * height — which the host sized from this value — so a cap declared here would
     * shrink to 60% of itself on every pass.
     */
    height: var(--overlay-inspector-height, ${OVERLAY_INSPECTOR_MIN_HEIGHT_PX}px);
    overflow: hidden;
    ${glassSurface}
    border-radius: var(--lq-radius-md);
    box-shadow: var(--lq-shadow-popover);
  }

  /**
   * §4.3's last resort: no side fits, so the inspector takes a corner and a leader
   * line keeps the relationship to the card legible.
   */
  .overlay-step-shell.inspector-corner
    .overlay-step-inspector[data-present='true']::before {
    position: absolute;
    inset-block-start: -${OVERLAY_CHROME_PAD_PX}px;
    inset-inline-start: 50%;
    width: 1px;
    height: ${OVERLAY_CHROME_PAD_PX}px;
    background: var(--lq-color-border);
    content: '';
  }

  .overlay-step-inspector .storyboard-tray-handle {
    display: none;
  }

  /**
   * The tray brings the light workspace surface with it. On glass that painted a
   * white panel and then drew the inherited light-on-dark text onto it, so the
   * inspector rendered as white-on-white.
   */
  .overlay-step-inspector .storyboard-property-tray,
  .overlay-step-inspector .overlay-step-inspector-panel {
    display: flex;
    overflow: hidden;
    flex: 1 1 auto;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    max-height: none;
    border: 0;
    background: transparent;
    color: inherit;
    box-shadow: none;
  }

  /**
   * The block inspector (button, media, field) portals in as bare children, and
   * its header only had a layout inside the wide content tray — here the title and
   * its close button sat side by side mid-sentence with no rule under them. It
   * gets the same header and the same scrolling body as the step inspector.
   */
  ${inspector} [data-rich-content-inspector-slot] {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
  }

  ${inspector} .content-inspector-chrome {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--lq-color-border);
    padding: 9px 11px;
  }

  ${inspector} .content-inspector-title {
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-semibold);
    letter-spacing: -0.01em;
  }

  /*
   * The section list is *not* a scroller. It was one, from before the block
   * inspector grew the same scrolling body the step inspector has — which left
   * two nested scroll containers, the inner one with nothing to scroll and
   * overscroll-behavior contain to stop the wheel reaching the outer one. The
   * panel had 234px of content below the fold and no way to get to it.
   */
  ${inspector} [data-rich-content-inspector-slot] .inspector-sections {
    flex: 1 1 auto;
    min-height: 0;
  }

  /* The scroller. The header above it stays put, as the prototype's does. */
  .overlay-step-inspector-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 0 8px;
  }

  .overlay-step-inspector .storyboard-property-tray[data-tool-mode='content'] > .storyboard-tab-panel.behavior,
  .overlay-step-inspector
    .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='action'],
  .overlay-step-inspector
    .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='field'],
  .overlay-step-inspector
    .storyboard-property-tray[data-tool-mode='content']
    > .storyboard-tab-panel.behavior[data-section='media'] {
    grid-template-columns: minmax(0, 1fr);
  }

  /**
   * The prototype's .pk pill: the control the anchored inspector is built from.
   *
   * A pill showing the current value, opening its choices in a menu. It replaces
   * the expanded segmented groups and the inline palette — the same options, at
   * one visible control each instead of nine, which is the whole density story.
   */
  ${inspector} .inspector-pill,
  ${inspector} .ui-select-trigger[data-size='compact'] {
    display: inline-flex;
    width: auto;
    min-width: 0;
    min-height: 26px;
    height: auto;
    max-width: 190px;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    padding: 5px 9px;
    /* The value is the answer to the row's question, so it reads at full ink. */
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    text-align: left;
  }

  ${inspector} .inspector-pill:hover,
  ${inspector} .ui-select-trigger[data-size='compact']:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  ${inspector} .ui-select-trigger[data-size='compact'] .ui-select-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  ${inspector} .inspector-pill-swatch {
    flex: 0 0 auto;
    width: 13px;
    height: 13px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: 3px;
  }

  ${inspector} .inspector-pill-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* An override is a dot, as the prototype marks it — never a sentence. */
  ${inspector} .inspector-pill-override {
    flex: 0 0 auto;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lq-color-primary);
  }

  /*
   * A named group inside one section, for the rare case where a section styles
   * two things and then how they sit together. Quiet enough that it reads as a
   * divider with a name rather than as a second level of section.
   */
  ${inspector} .inspector-group-title {
    margin: 10px 0 7px;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 9px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  ${inspector} .inspector-section-body > .inspector-group-title:first-child {
    margin-top: 0;
    border-top: 0;
    padding-top: 0;
  }

  /* A fact, not a choice: same row rhythm as a pill, without the affordance. */
  ${inspector} .inspector-readback {
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
   * §7.2: shown only when the pair fails, beside the control that failed. The
   * token was --lq-color-attention, which no stylesheet defines — so every
   * warning in the inspector fell through to muted grey and read as a caption.
   */
  ${inspector} .inspector-warning {
    flex: 1 0 100%;
    color: var(--lq-color-warning, var(--lq-color-muted));
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  ${inspector} .inspector-warning[data-contrast-state='unusable'] {
    color: var(--lq-color-danger, var(--lq-color-muted));
  }

  ${inspector} .inspector-warning > small {
    margin-left: 6px;
  }

  /* The palette, in the pill's menu, where it has the room it always needed. */
  .inspector-pill-menu {
    display: grid;
    gap: 7px;
    min-width: 190px;
  }

  .inspector-pill-menu .rich-step-color-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .inspector-pill-menu .rich-step-color-swatches > button {
    display: grid;
    width: 24px;
    height: 24px;
    min-width: 0;
    min-height: 0;
    place-items: center;
    border: 1px solid var(--lq-color-border);
    border-radius: 999px;
    /* The swatch is the control: its own colour, not the menu's surface. */
    background: var(--storyboard-swatch, transparent);
    /**
     * The check rides on an arbitrary customer colour, so no single ink reads on
     * every swatch. The selected ring below is what carries the state; the glyph
     * only reinforces it where it happens to be legible.
     */
    color: var(--lq-color-ink);
    padding: 0;
  }

  .inspector-pill-menu .rich-step-color-swatches > button[aria-pressed='true'] {
    border-color: var(--lq-color-primary);
    box-shadow: 0 0 0 2px var(--lq-color-page);
  }

  .inspector-pill-menu .rich-step-custom-color {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 26px;
    border: 1px solid var(--lq-color-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    padding: 3px 8px;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-sm);
  }

  .inspector-pill-menu .rich-step-custom-color > span {
    flex: 1 1 auto;
  }

  .inspector-pill-menu .rich-step-custom-color input[type='color'] {
    width: 26px;
    height: 18px;
    flex: 0 0 auto;
    border: 1px solid var(--lq-color-border);
    border-radius: 4px;
    background: none;
    cursor: pointer;
    padding: 0;
  }

  .inspector-pill-menu .rich-step-theme-color {
    width: 100%;
    min-height: 26px;
    border: 1px solid var(--lq-color-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-panel-strong);
    padding: 4px 8px;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
  }

  .inspector-pill-menu .rich-step-theme-color:disabled {
    color: var(--lq-color-muted);
    cursor: not-allowed;
  }

  /**
   * The prototype's .fld row: one row per property, label left, control right.
   *
   * The workspace stacks a bold caption over a full-width control, which is right
   * in a 640px-wide tray and wrong in a 320px popover — four properties filled the
   * whole 60vh cap and the section read as a form. Same controls, at the density
   * §4.3 asks for.
   *
   * Everything here is scoped through ${inspector} rather than the bare class so it
   * outranks the tray rules it is correcting, which are written for the wide tray.
   */
  ${inspector} .rich-step-choice-field,
  ${inspector} .storyboard-property-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 8px;
    margin: 0 0 7px;
    border: 0;
    padding: 0;
  }

  /*
   * §4.3's .inum: a fixed, right-aligned box with its unit beside it. Fixed
   * width so Width and Min height line up down the column, right-aligned and
   * tabular so the digits do too — a size read against another size is the
   * whole reason both are on screen.
   */
  /*
   * The unit belongs inside the box, as §4.3 draws it — "396px", one value. Held
   * outside the border it read as a separate word next to a number, and the row
   * gained a third thing to look at.
   */
  ${inspector} .rich-step-number-value {
    display: flex;
    align-items: center;
    gap: 1px;
    box-sizing: border-box;
    min-height: 26px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    padding: 0 7px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  ${inspector} .rich-step-number-value input {
    box-sizing: border-box;
    width: 46px;
    border: 0;
    background: transparent;
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    font-variant-numeric: tabular-nums;
    padding: 5px 0;
    text-align: right;
  }

  ${inspector} .rich-step-number-value input:focus-visible {
    outline: none;
  }

  ${inspector} .rich-step-number-value:focus-within {
    border-color: var(--lq-color-blue);
    outline: 2px solid var(--lq-color-blue-soft);
    outline-offset: 0;
  }

  /* A full palette needs the width, so its label takes its own line. */
  ${inspector} .rich-step-color-field {
    display: grid;
    gap: 5px;
    margin: 0 0 9px;
    border: 0;
    padding: 0;
  }

  /* §4.3's .inum/.itext: the value box sits right, sized to the row. */
  ${inspector} .rich-step-text-value {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 190px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    padding: 5px 9px;
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
  }

  /* A described image needs more than one line, so alt text takes the full row. */
  ${inspector} textarea.rich-step-text-value {
    flex: 1 0 100%;
    max-width: none;
    resize: vertical;
  }

  /* A detected fact, not a control: the prototype states it as a tag. */
  ${inspector} .step-narration-language-tag {
    flex: none;
    border-radius: 5px;
    background: var(--lq-color-panel-recessed);
    padding: 2.5px 7px;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* Behind a pill it is one property again, so it takes the .fld row: 26 and 8. */
  ${inspector} .rich-step-color-field[data-presentation='menu'],
  ${inspector} .rich-step-choice-field[data-presentation='menu'],
  ${inspector} .rich-step-choice-field[data-presentation='text'],
  ${inspector} .rich-step-choice-field[data-presentation='number'] {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 8px;
    min-height: 26px;
    margin: 0 0 8px;
  }

  ${inspector} .storyboard-property-color-row,
  ${inspector} .step-style-reuse-actions,
  ${inspector} .storyboard-tab-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  ${inspector} .rich-step-field-label,
  ${inspector} .storyboard-property-control > label {
    flex: 0 0 auto;
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-regular);
    letter-spacing: normal;
    text-transform: none;
  }

  /* A chip row rather than a full-width segmented bar (the prototype's .schip). */
  ${inspector} .ui-segmented,
  ${inspector} .rich-step-choice-list,
  ${inspector} .rich-step-color-swatches {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    grid-template-columns: none;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 0;
  }

  ${inspector} .rich-step-color-swatches {
    justify-content: flex-start;
  }

  ${inspector} .ui-segmented-option,
  ${inspector} .rich-step-choice-list button,
  ${inspector} .rich-step-custom-color,
  ${inspector} .rich-step-theme-color {
    min-width: 0;
    min-height: 24px;
    height: auto;
    padding: 3px 8px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-regular);
  }

  /* Wrap to another row rather than truncating: "Automat…" names nothing. */
  ${inspector} .ui-segmented-option,
  ${inspector} .rich-step-choice-list button {
    flex: 0 0 auto;
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
  }

  ${inspector} .rich-step-color-swatches > button {
    width: 22px;
    height: 22px;
    min-width: 0;
    min-height: 0;
    padding: 0;
  }

  ${inspector} .ui-segmented-option:hover,
  ${inspector} .rich-step-choice-list button:hover,
  ${inspector} .rich-step-custom-color:hover,
  ${inspector} .rich-step-theme-color:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  ${inspector} .ui-segmented-option[aria-pressed='true'],
  ${inspector} .rich-step-choice-list button[aria-pressed='true'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  /**
   * One rhythm for both sections, set by the container rather than by each row's
   * own margin. A note carried margin-top only, so whatever followed it sat
   * against its last line — which is exactly what happened between the flip note
   * and Entry motion.
   */
  ${inspector} .step-actions-section {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  ${inspector} .step-actions-section > * {
    margin-top: 0;
    margin-bottom: 0;
  }

  /**
   * The prototype's .fld.col + .seg, for Actions and Placement: caption over a
   * recessed track holding every option at once. The chip row above is the right
   * answer for a long option list that has to wrap; a track is the right answer
   * for four short ones, because it shows the whole choice without a click.
   */
  ${inspector} .rich-step-choice-field[data-presentation='track'] {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  }

  ${inspector} [data-presentation='track'] .ui-segmented {
    justify-content: stretch;
    flex-wrap: nowrap;
    gap: 2px;
    border-radius: 7px;
    background: var(--lq-color-panel-recessed);
    padding: 2px;
  }

  ${inspector} [data-presentation='track'] .ui-segmented-option {
    flex: 1 1 0;
    justify-content: center;
    min-width: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    padding: 4px 6px;
    color: var(--lq-color-muted);
  }

  ${inspector} [data-presentation='track'] .ui-segmented-option[aria-pressed='true'] {
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  /**
   * The appearance editor is a two-column workspace with a review aside, built for
   * the 640px tray. In a 320px popover the aside pushed the controls into a 100px
   * gutter and brought the light workspace surface onto glass with it. Stacked, and
   * the review reads as one line of evidence under the control it belongs to.
   */
  ${inspector} .popup-appearance-workspace,
  ${inspector} .popup-appearance-progressive {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
  }

  ${inspector} .progressive-setting-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border: 0;
    background: transparent;
    padding: 0;
  }

  ${inspector} .progressive-setting-tabs button,
  ${inspector} .popup-style-reset {
    min-width: 0;
    min-height: 24px;
    height: auto;
    padding: 3px 8px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
  }

  /* Wrap to a second row rather than truncating: "Bord…" names nothing. */
  ${inspector} .progressive-setting-tabs button {
    flex: 0 0 auto;
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
  }

  ${inspector} .progressive-setting-tabs button[aria-current='page'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  ${inspector} .popup-contrast-check {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    border: 1px solid var(--lq-color-menu-border);
    border-radius: 7px;
    background: var(--lq-color-menu);
    padding: 7px 9px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  ${inspector} .popup-contrast-check > div {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  ${inspector} .popup-contrast-check strong {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
  }

  /* Two readouts on one line ran off a 320px popover; they wrap now. */
  ${inspector} .rich-step-contrast-status {
    display: block;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  /* The APCA figure rides along after the WCAG verdict, not against it. */
  ${inspector} .rich-step-contrast-status > small {
    margin-left: 6px;
  }

  /**
   * The prototype's .steps-num: an ordered list of the things a section is
   * about — the buttons in Actions, the rules in Conditions. Each row is a
   * whole control, so it gets a control's fill and edge rather than reading as
   * body copy that happens to be indented.
   */
  ${inspector} .inspector-numbered-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 8px;
  }

  ${inspector} .inspector-numbered-row {
    display: flex;
    align-items: center;
    border: 1px solid var(--lq-color-control-border);
    border-radius: 6px;
    background: var(--lq-color-control);
  }

  /* The row is one hit target that selects the button it names. */
  ${inspector} .inspector-numbered-open {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    border: 0;
    border-radius: 6px 0 0 6px;
    background: transparent;
    padding: 6px 0 6px 8px;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    text-align: left;
  }

  ${inspector} .inspector-numbered-row:hover {
    border-color: var(--lq-color-control-hover);
  }

  ${inspector} .inspector-numbered-open > b {
    flex: 0 1 auto;
    overflow: hidden;
    color: var(--lq-color-ink-strong);
    font-weight: var(--lq-weight-semibold);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  ${inspector} .inspector-numbered-index {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: var(--lq-color-panel-recessed);
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  /* What it looks like and what it does, subordinate to what it says. */
  ${inspector} .inspector-numbered-meta {
    flex: 1 1 auto;
    overflow: hidden;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  ${inspector} .inspector-numbered-remove {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    min-height: 0;
    border: 0;
    border-radius: 0 6px 6px 0;
    background: transparent;
    padding: 0;
    color: var(--lq-color-muted);
    opacity: 0.5;
  }

  ${inspector} .inspector-numbered-remove:hover {
    color: var(--lq-color-danger);
    opacity: 1;
  }

  /* The empty row states a fact rather than offering one, so it reads back. */
  ${inspector} .inspector-numbered-row[data-empty] {
    padding: 6px 10px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    opacity: 0.55;
  }

  ${inspector} .inspector-numbered-row[data-empty]:hover {
    border-color: var(--lq-color-control-border);
  }

  /* A rule is one sentence on one line — it truncates rather than wrapping. */
  ${inspector} .step-condition-sentence {
    flex: 1 1 auto;
    overflow: hidden;
    text-align: left;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  /* The prototype's .imenu: a list of one-shot commands, not a row of buttons. */
  ${inspector} .step-style-reuse-actions,
  ${inspector} .inspector-menu {
    gap: 0;
    margin-top: 7px;
    border: 1px solid var(--lq-color-menu-border);
    border-radius: 7px;
    background: var(--lq-color-menu);
    overflow: hidden;
  }

  ${inspector} .step-style-reuse-actions > button,
  ${inspector} .inspector-menu > button {
    display: flex;
    align-items: center;
    /*
     * Left-aligned, so a leading glyph sits against its label rather than being
     * flung to the far edge of the row. Trailing hints claim the gap themselves.
     */
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    min-height: 0;
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    padding: 6px 10px;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    text-align: left;
  }

  ${inspector} .step-style-reuse-actions > button:last-child,
  ${inspector} .inspector-menu > button:last-child {
    border-bottom: 0;
  }

  ${inspector} .step-style-reuse-actions > button:hover,
  ${inspector} .inspector-menu > button:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  /* A disabled command still says what it will do; it just cannot be reached. */
  ${inspector} .inspector-menu > button:disabled {
    opacity: 0.45;
  }

  ${inspector} .inspector-menu > button:disabled:hover {
    background: transparent;
    color: var(--lq-color-ink-soft);
  }

  /* The shortcut claims the gap the label leaves, right-aligned and quiet. */
  ${inspector} .inspector-menu > button > kbd {
    margin-left: auto;
    color: var(--lq-color-subtle);
    font-family: inherit;
    font-size: var(--lq-font-sm);
    letter-spacing: 0.02em;
  }

  /* An unpointed step states a fact; the icon carries the tone, not colour. */
  ${inspector} .step-target-unpointed {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  ${inspector} .step-target-unpointed > svg {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  /**
   * The workspace sections bring their own padding, border and surface, which is
   * right in a tray and wrong inside a popover that already has all three.
   */
  ${inspector} .tour-step-config-section {
    display: grid;
    gap: 7px;
    margin: 0;
    border: 0;
    background: transparent;
    padding: 0;
  }

  /* Side, as one row: label left, the four sides as chips right. */
  ${inspector} .tour-position-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 8px;
    margin: 0;
  }

  ${inspector} .tour-position-group h4 {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-regular);
    letter-spacing: normal;
    text-transform: none;
  }

  ${inspector} .tour-position-options {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    grid-template-columns: none;
  }

  ${inspector} .tour-position-options button {
    display: inline-flex;
    width: auto;
    min-width: 0;
    min-height: 24px;
    height: auto;
    padding: 3px 9px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
  }

  /* The word is the affordance at this size; a 24px glyph beside it is noise. */
  ${inspector} .tour-position-options button svg {
    display: none;
  }

  ${inspector} .tour-position-options button:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  ${inspector} .tour-position-options button[aria-pressed='true'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  ${inspector} .tour-position-group > .storyboard-property-hint {
    flex: 1 0 100%;
  }

  /**
   * Advanced (§4.3): collapsed, last, and never on the default path — so it is
   * the one section that must not read as a second workspace. The live preview
   * keeps its own light surface, because it is a preview of shipped output, but
   * it gets a frame and a caption so it reads as a specimen rather than a panel
   * that has escaped.
   */
  ${inspector} .step-presentation {
    display: grid;
    gap: 9px;
  }

  ${inspector} .step-presentation-preview,
  ${inspector} .step-presentation-settings {
    display: grid;
    gap: 6px;
    margin: 0;
    border: 0;
    background: transparent;
    padding: 0;
  }

  ${inspector} .step-presentation-preview-heading small,
  ${inspector} .step-presentation-settings > small {
    color: var(--lq-color-muted);
    font-size: 8px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  ${inspector} .step-presentation-preview-stage {
    border: 1px solid var(--lq-color-menu-border);
    border-radius: 8px;
    background: var(--lq-color-menu);
    padding: 9px;
  }

  /**
   * The action sequence, as the prototype's Approach list: numbered lines in
   * plain language, then the controls.
   *
   * It ships as a horizontal trigger → wait → continue strip with arrows, which
   * needs about 600px. At 320 the three cards stacked into an unreadable pile and
   * the arrows pointed at nothing. Vertical and numbered says the same thing in a
   * third of the width, and the order is legible at a glance.
   */
  ${inspector} .sequence-property-editor {
    display: grid;
    gap: 7px;
  }

  /**
   * The tray's own card surfaces, cleared. Each of these paints a light panel with
   * a border, which is correct in the workspace and reads as a hole punched in the
   * glass here — the popover is already the surface.
   */
  ${inspector} .sequence-property-editor,
  ${inspector} .progressive-setting-panel,
  ${inspector} .step-presentation-settings,
  ${inspector} .storyboard-tab-panel {
    border: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
  }

  /*
   * §4.3's rhythm is one pitch the whole way down: a 26px row and 8px under it.
   * The Style section stacks four panels, each of which used to add its own grid
   * gap on top of that margin, so the pitch drifted between 33 and 46 depending
   * on how deep a row happened to sit. The rows own the spacing; wrappers add none.
   */
  /*
   * §4.3's rhythm is one pitch the whole way down: a 26px row and 8px under it.
   * The Style section stacks four panels, each nesting boxes that exist only to
   * hang the wide tray's tabs and audit aside off. None of them render here, so
   * every one becomes a pass-through and the rows share a single flow — which is
   * what makes the pitch uniform instead of drifting between 33 and 46.
   */
  ${inspector} .storyboard-tab-panel.popup-layout,
  ${inspector} .popup-appearance-workspace,
  ${inspector} .popup-appearance-progressive,
  ${inspector} .progressive-setting-panel {
    display: contents;
  }

  /* The section summary above already names it; this repeated the name and a lede. */
  ${inspector} .sequence-summary-header {
    display: none;
  }

  ${inspector} .sequence-summary-strip {
    display: grid;
    /* One column, explicitly: the tray's five-track strip is what stacked here. */
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    counter-reset: sequence-step;
    border: 1px solid var(--lq-color-menu-border);
    border-radius: 8px;
    background: var(--lq-color-menu);
    padding: 2px 0;
  }

  ${inspector} .sequence-summary-card {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: baseline;
    gap: 8px;
    /* The tray gives each stage its own light card; on glass they are rows. */
    border: 0;
    border-bottom: 1px solid var(--lq-color-border-soft);
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    padding: 6px 10px;
  }

  ${inspector} .sequence-summary-card:last-child {
    border-bottom: 0;
  }

  ${inspector} .sequence-summary-card::before {
    counter-increment: sequence-step;
    color: var(--lq-color-muted);
    content: counter(sequence-step) '.';
    font-size: var(--lq-font-sm);
    font-variant-numeric: tabular-nums;
  }

  /* The number carries the order, so the per-stage icon is one glyph too many. */
  ${inspector} .sequence-summary-card > svg,
  ${inspector} .sequence-summary-arrow {
    display: none;
  }

  ${inspector} .sequence-summary-card strong {
    display: block;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  ${inspector} .sequence-summary-card small {
    display: block;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  ${inspector} .sequence-details > summary {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    list-style: none;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    padding: 5px 9px;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
  }

  ${inspector} .sequence-details > summary::-webkit-details-marker {
    display: none;
  }

  ${inspector} .sequence-details-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
    margin-top: 7px;
  }

  ${inspector} .sequence-guided-card,
  ${inspector} .sequence-recovery-card {
    display: grid;
    gap: 6px;
    margin: 0;
    border: 1px solid var(--lq-color-menu-border);
    border-radius: 8px;
    background: var(--lq-color-menu);
    padding: 8px 9px;
  }

  ${inspector} .sequence-guided-card > legend,
  ${inspector} .sequence-recovery-card > legend {
    float: left;
    width: 100%;
    margin: 0 0 4px;
    padding: 0;
    color: var(--lq-color-muted);
    font-size: 8px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  ${inspector} .sequence-wait-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  ${inspector} .sequence-native-field,
  ${inspector} .sequence-timeout-fields {
    display: grid;
    gap: 4px;
    font-size: var(--lq-font-sm);
  }

  /* Destructive, and dressed as such: a bordered row, not another menu entry. */
  ${inspector} .step-danger-zone {
    display: grid;
    gap: 4px;
    margin-top: 4px;
    border-top: 1px solid var(--lq-color-border);
    padding-top: 9px;
  }

  ${inspector} .step-danger-action {
    justify-self: start;
    min-height: 26px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: var(--lq-color-control);
    padding: 4px 10px;
    color: var(--lq-color-danger, var(--lq-color-ink));
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  ${inspector} .step-danger-action:hover:not(:disabled) {
    border-color: var(--lq-color-danger, var(--lq-color-primary));
    background: var(--lq-color-danger, var(--lq-color-primary));
    color: var(--lq-color-on-primary);
  }

  ${inspector} .step-danger-action:disabled {
    color: var(--lq-color-muted);
    cursor: not-allowed;
  }

  ${inspector} .step-danger-note {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  /* How far this step has drifted from the style it wears, and the way back. */
  ${inspector} .step-style-overrides {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 0 9px;
    color: var(--lq-color-primary);
    font-size: var(--lq-font-sm);
  }

  ${inspector} .step-style-override-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--lq-color-primary);
  }

  ${inspector} .step-style-overrides button {
    margin-left: auto;
    padding: 3px 8px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    font: inherit;
    cursor: pointer;
  }

  /*
   * The .why sentence: why a control is a refinement rather than the tool.
   * Upright, as §4.3 sets it — a whole paragraph of italics reads as an aside
   * to skip, and these sentences are the ones that teach the panel.
   */
  ${inspector} .overlay-step-inspector-note,
  ${inspector} .step-style-reuse-hint,
  ${inspector} .storyboard-property-hint {
    margin: 7px 0 0;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-sm);
    line-height: 1.55;
  }

  /**
   * §4.2a: a persistent frame with a contextual middle. Insert and the inspector
   * affordance never move, so the toolbar never reflows under the pointer; only
   * the middle swaps, and it announces what it is now editing.
   */
  .overlay-step-toolbar {
    flex: 0 0 ${OVERLAY_TOOLBAR_HEIGHT_PX}px;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 2px;
    min-width: 0;
    height: ${OVERLAY_TOOLBAR_HEIGHT_PX}px;
    padding: 0 6px;
    /* Never sideways: what does not fit moves into the trailing menu (§4.2a). */
    overflow: hidden;
    ${glassSurface}
    border-radius: ${OVERLAY_TOOLBAR_RADIUS_PX}px;
    box-shadow: var(--lq-shadow-chrome);
    white-space: nowrap;
  }

  /* Docked: no room above or below the card, so it takes the top edge. */
  .overlay-step-toolbar[data-anchor='docked'] {
    border-top: none;
    border-radius: 0 0 ${OVERLAY_TOOLBAR_RADIUS_PX}px ${OVERLAY_TOOLBAR_RADIUS_PX}px;
  }

  /**
   * Nothing is selected inside the card, so the middle offers the step's own parts
   * and nothing else (§4.2a rule 4). The editor's formatting controls appear the
   * moment the caret lands in text, which is the only moment they mean anything.
   */
  .overlay-step-toolbar[data-context='step'] .overlay-step-toolbar-slot {
    display: none;
  }

  .overlay-step-toolbar-slot {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .overlay-step-toolbar-slot .rich-content-toolbar {
    flex-wrap: nowrap;
    max-height: none;
    overflow: hidden;
  }

  /*
   * Only the middle clips (§4.2a). The frame's own controls — Insert on the left,
   * assist, undo and the inspector on the right — must survive any context, so
   * the overflow is contained here rather than on the bar.
   */
  .overlay-step-toolbar-context {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  /*
   * Stepped down by useToolbarFit rather than clipped. Labels go first; the
   * context label goes last, because it is the only part that says what the
   * middle is editing. No control is ever removed — the glyph and its title
   * remain, so everything stays reachable at any card width.
   */
  .overlay-step-toolbar-context[data-toolbar-fit='icons'] .overlay-toolbar-control > span,
  .overlay-step-toolbar-context[data-toolbar-fit='icons'] .toolbar-style-trigger > span,
  .overlay-step-toolbar-context[data-toolbar-fit='compact'] .overlay-toolbar-control > span,
  .overlay-step-toolbar-context[data-toolbar-fit='compact'] .toolbar-style-trigger > span {
    display: none;
  }

  .overlay-step-toolbar-context[data-toolbar-fit='compact'] .overlay-step-toolbar-label {
    display: none;
  }

  @keyframes overlay-toolbar-swap {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }

    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay-step-toolbar-label {
      animation: none;
    }
  }

  /* Names what the middle is editing, so the swap is never a guess. */
  .overlay-step-toolbar-label {
    flex: 0 0 auto;
    padding: 0 7px 0 3px;
    color: var(--lq-color-muted);
    /*
     * Off the 8/10/12 workspace ladder on purpose: at 8px the label was a smudge
     * beside 12.5px controls, and this bar is measured against the customer's
     * product rather than against the workspace.
     */
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.09em;
    text-transform: uppercase;
    animation: overlay-toolbar-swap 220ms ease;
  }

  .overlay-step-toolbar-separator {
    flex: 0 0 auto;
    width: 1px;
    height: 18px;
    margin: 0 4px;
    /* The control border, not the panel border: this divides controls. */
    background: var(--lq-color-control-border);
  }

  .overlay-step-toolbar button {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    height: 28px;
    min-width: 28px;
    padding: 0 7px;
    border: none;
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: transparent;
    color: var(--lq-color-ink);
    cursor: pointer;
    /* Half a pixel off the ladder, and the one size the bar reads right at. */
    font-size: var(--lq-font-md);
  }

  /* A named part of the step: icon, current value, chevron. Text, so it reads. */
  .overlay-toolbar-control {
    padding: 0 10px;
    white-space: nowrap;
  }

  .overlay-toolbar-control[aria-expanded='true'] {
    background: var(--lq-color-control-hover);
  }

  /*
   * An icon beside a label is a flex item, and flex will shrink an SVG to zero
   * before it wraps the text — which is exactly how the Insert glyph vanished the
   * moment the word was added next to it.
   */
  .overlay-step-toolbar button > svg {
    flex: none;
  }

  .overlay-step-toolbar button:hover {
    background: var(--lq-color-control-hover);
  }

  .overlay-step-toolbar button[aria-pressed='true'],
  .overlay-step-toolbar button[data-active='true'] {
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  /*
   * The editor's own toolbar buttons are 36px squares; Insert is a *worded*
   * control on this bar, so it sizes to its label instead. Without this the
   * label overflowed a square and printed on top of the context label beside it.
   */
  .overlay-step-toolbar-insert {
    display: flex;
    flex: none;
    padding: 0;
  }

  .overlay-step-toolbar-insert button {
    width: auto !important;
    min-width: 28px;
    height: 28px !important;
    padding: 0 10px !important;
  }

  /* Step context: named parts of the step, not glyphs. Text, so they read. */
  /* Readiness beside the step's name, worded rather than colour-only. */
  .overlay-step-inspector-status {
    flex: none;
    margin-left: auto;
    border: 1px solid var(--lq-color-warning-border);
    border-radius: var(--lq-radius-xs);
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.06em;
    padding: 2px 6px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .overlay-step-inspector-status[data-status='invalid'] {
    border-color: var(--lq-color-danger);
  }

  /* Named step style, on the bar (§6.2). */
  .toolbar-style-picker {
    position: relative;
    display: flex;
  }

  .toolbar-style-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    border: 0;
    border-radius: ${OVERLAY_CONTROL_RADIUS_PX}px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    font-size: var(--lq-font-md);
    padding: 0 10px;
    white-space: nowrap;
  }

  .toolbar-style-trigger:hover,
  .toolbar-style-trigger[aria-expanded='true'] {
    background: var(--lq-color-control-hover);
  }

  .toolbar-style-swatch {
    width: 12px;
    height: 12px;
    flex: none;
    border: 1.5px solid currentColor;
    border-radius: 3px;
  }

  /*
   * The assist loop lands under the card rather than over it: a proposal is read
   * against the step it changes, and covering that step to show a diff of it is
   * the one thing this surface must not do. A fourth absolutely positioned peer,
   * for the same reason as the other three — nothing may push the card.
   */
  .overlay-step-assist:empty {
    display: none;
  }

  .overlay-step-assist {
    position: absolute;
    left: var(--overlay-card-x, ${OVERLAY_CHROME_PAD_PX}px);
    top: calc(
      var(--overlay-card-y, ${OVERLAY_TOOLBAR_BAND_PX}px) + var(--overlay-card-height, 0px) + 8px
    );
    z-index: 3;
    width: var(--overlay-card-width, auto);
    min-width: 320px;
    pointer-events: auto;
    ${glassSurface}
    border-radius: ${OVERLAY_TOOLBAR_RADIUS_PX}px;
    box-shadow: var(--lq-shadow-chrome);
  }

  .overlay-step-assist .assist-preview,
  .overlay-step-assist .assist-prompt {
    padding: 10px 12px;
  }

  .overlay-step-card.rich-step-content {
    display: flex;
    flex: 1 1 0;
    /* The authored width, published by the host — never the toolbar's. */
    width: var(--overlay-card-width, 100%);
    max-width: 100%;
    flex-direction: column;
    /* The authored height. Content may grow past it; it never shrinks below. */
    min-height: var(--overlay-card-height, 0px);
    /*
     * ...but only up to what the viewport can show. The card had a floor and no
     * roof, so a step with a dozen blocks grew past the frame and painted its
     * content over the page. The overflow rule below was already here and never
     * fired,
     * because nothing ever constrained the box for it to overflow.
     */
    max-height: var(--overlay-card-max-height, none);
    overflow: auto;
    resize: none;
    padding-left: var(--lq-tour-composition-padding, var(--lq-space-3, 12px));
    background: var(--lq-tour-surface, #fff);
    color: var(--lq-tour-text-color, var(--lq-color-ink));
    border-radius: 12px;
    box-shadow: var(--lq-shadow-popover);
  }

  .overlay-step-card.rich-step-content[data-lodariq-popup-radius='square'] {
    border-radius: 0;
  }

  .overlay-step-card.rich-step-content[data-lodariq-popup-radius='soft'] {
    border-radius: 8px;
  }

  .overlay-step-card.rich-step-content[data-lodariq-popup-radius='round'] {
    border-radius: 16px;
  }

  .overlay-step-card.rich-step-content:focus-within {
    box-shadow: var(--lq-shadow-popover);
  }

  .overlay-step-card .rich-content-editor {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .overlay-step-card .rich-content-canvas {
    min-height: 0;
    caret-color: var(--lq-tour-text-color, currentColor);
    font-size: var(--lq-font-md);
  }

  .overlay-step-card .rich-content-placeholder {
    font-size: var(--lq-font-md);
    color: color-mix(in srgb, var(--lq-tour-text-color, currentColor) 42%, transparent);
  }

  /**
   * Controls sitting on glass need their own fill. The workspace styles paint them
   * with --lq-color-page, which is transparent here by design — so without this
   * the block-style chip and the selects lose their edges against the card behind.
   */
  .overlay-step-toolbar .rich-content-block-style-trigger,
  .overlay-step-toolbar .ui-select-trigger,
  .overlay-step-toolbar .ui-number-combobox-trigger {
    min-width: 0;
    border-color: var(--lq-color-control-border) !important;
    background: var(--lq-color-control) !important;
    color: var(--lq-color-ink) !important;
  }

  .overlay-step-toolbar .rich-content-block-style-trigger:hover,
  .overlay-step-toolbar .ui-select-trigger:hover {
    background: var(--lq-color-control-hover) !important;
  }

  /* Glyph buttons stay transparent until touched, exactly as the prototype has them. */
  .overlay-step-toolbar .rich-content-toolbar > button,
  .overlay-step-toolbar .rich-content-toolbar-popover > button,
  .overlay-step-toolbar .rich-content-color-control {
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-ink);
  }

  .overlay-step-toolbar .rich-content-toolbar > button:hover,
  .overlay-step-toolbar .rich-content-toolbar-popover > button:hover,
  .overlay-step-toolbar .rich-content-color-control:hover {
    border-color: transparent;
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  .overlay-step-toolbar .rich-content-toolbar button[aria-pressed='true'] {
    border-color: transparent;
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  .overlay-step-toolbar .rich-content-toolbar-divider {
    background: var(--lq-color-border);
  }


  .overlay-step-empty {
    margin: var(--lq-space-4);
    color: var(--lq-color-muted);
  }

  /* An unplaced step's one job, so it reads as the action and not as a chip. */
  .overlay-step-toolbar .overlay-choose-target {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--lq-color-control);
    border: 1px solid var(--lq-color-control-border);
    color: var(--lq-color-ink);
    padding: 0 9px;
  }

  /*
   * With a target set the control is a glyph — the step already shows what it
   * points at. Without one it keeps its words, because a bare crosshair does not
   * tell a creator the step is unfinished.
   */
  .overlay-step-toolbar .overlay-choose-target[data-has-target='true'] {
    border-color: transparent;
    background: transparent;
    color: var(--lq-color-muted);
    padding: 0 7px;
  }

  .overlay-step-toolbar .overlay-choose-target[data-has-target='true']:hover {
    color: var(--lq-color-ink);
  }

  .overlay-step-toolbar .overlay-choose-target:hover {
    background: var(--lq-color-control-hover);
  }

  /*
   * A glyph button is a toolbar button like any other: same height, ink and
   * size. This is the shared look; the settings class below is an identity,
   * worn only by the inspector's single entry point (§4.2a). They were one
   * class, so Undo and Assist both answered to the inspector's name.
   */
  .overlay-step-toolbar .overlay-toolbar-glyph {
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    line-height: 1;
    pointer-events: auto;
  }

  .overlay-step-toolbar .overlay-step-settings[aria-expanded='true'] {
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
  }

  /* Sections, not tabs (§4.3). One rule set for every inspector. */
  .content-inspector-title {
    font-size: var(--lq-font-md);
    letter-spacing: -0.01em;
  }

  .overlay-step-inspector-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid var(--lq-color-border);
    padding: 9px 10px;
  }

  /*
   * One row, whatever the step is called. A long heading truncates rather than
   * wrapping the tag onto a second line and pushing every section down.
   */
  .overlay-step-inspector-header strong {
    min-width: 0;
    overflow: hidden;
    font-size: var(--lq-font-md);
    /* Semibold, not the UA's bold: a title, not a shout. */
    font-weight: var(--lq-weight-semibold);
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A 24px square, not a tray-sized button: this popover has no tray chrome. */
  .overlay-step-inspector .storyboard-tray-close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: var(--lq-color-control-quiet);
    color: var(--lq-color-ink-soft);
  }

  .overlay-step-inspector .storyboard-tray-close:hover {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink);
  }

  .inspector-section {
    border-bottom: 1px solid var(--lq-color-border-soft);
  }

  .inspector-section:last-child {
    border-bottom: 0;
  }

  .inspector-section > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    cursor: pointer;
    list-style: none;
    padding: 9px 11px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    user-select: none;
  }

  .inspector-section > summary::-webkit-details-marker {
    display: none;
  }

  /*
   * Barely there, and deliberately so: the row is 320px wide and full-bleed, so
   * a control-strength hover reads as a selection rather than as a pointer.
   */
  .inspector-section > summary:hover {
    background: color-mix(in srgb, var(--lq-color-ink-strong) 4%, transparent);
  }

  /* Pure white: the open section is the one place a list of seven needs to
     name where the creator is, and ink alone did not separate it enough. */
  .inspector-section[open] > summary {
    color: var(--lq-color-ink-strong);
    font-weight: var(--lq-weight-semibold);
  }

  /* Points right when closed, down when open — the state, not a decoration. */
  .inspector-section-chevron {
    flex: none;
    margin-left: auto;
    color: var(--lq-color-subtle);
    transition: transform 0.15s;
  }

  .inspector-section[open] > summary .inspector-section-chevron {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .inspector-section-chevron {
      transition: none;
    }
  }

  .inspector-section-body {
    padding: 2px 11px 12px;
  }

  /*
   * The block inspector's rows sit straight in the section body, while the
   * card's sit inside a grid that adds 8px between them — so the same 26px row
   * came out on a 33px pitch here and a 41px pitch there, and the two panels
   * read as different densities. One rhythm, set in one place.
   */
  ${inspector} .storyboard-property-tray[data-tool-mode='content'] .inspector-section-body {
    display: grid;
    gap: 8px;
  }

  /*
   * §4.3's field vocabulary. The prototype gives every value in the inspector
   * the same control size, so a section reads as a column of rows rather than a
   * collage of differently-sized widgets. These are scoped to the inspector
   * because the same controls are a comfortable size in the workspace, where
   * there is room; here there is 320px and seven sections.
   */
  .overlay-step-inspector input[type='number'],
  .overlay-step-inspector input[type='text'],
  .overlay-step-inspector textarea {
    font-size: var(--lq-font-sm);
  }

  .overlay-step-inspector input[type='number'] {
    /* Digits that line up down a column read as a scale, not as a list. */
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  /* Operations → Check (§4.6). Severity is carried by a word plus a count, never colour alone. */
  .operations-check {
    display: block;
  }

  /* How bad, and against how much — four numbers read faster than eleven rows. */
  .operations-check-tally {
    margin-bottom: 14px;
  }

  .operations-check-tally-cell {
    display: grid;
    gap: 6px;
  }

  .operations-check-tally-cell span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .operations-check-tally-cell strong {
    color: var(--lq-color-ink);
    font-size: 24px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: -0.03em;
  }

  .operations-check-tally-cell[data-tone='blocker'] strong {
    color: var(--lq-color-danger);
  }

  .operations-check-tally-cell[data-tone='warning'] strong {
    color: var(--lq-color-warning);
  }

  .operations-check-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }

  /* Target section (§4.4): one of three states, its meaning, and what to do. */
  .step-target-section {
    display: grid;
    gap: 6px;
  }

  .step-target-state {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    font-size: var(--lq-font-sm);
  }

  .step-target-state-label {
    border-radius: 999px;
    padding: 2px 8px;
    font-weight: var(--lq-weight-bold);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  /* The token names are success/warning; positive/attention resolve to nothing. */
  .step-target-state[data-tone='positive'] .step-target-state-label {
    background: var(--lq-color-success-soft);
    color: var(--lq-color-success);
  }

  .step-target-state[data-tone='attention'] .step-target-state-label {
    background: var(--lq-color-warning-soft);
    color: var(--lq-color-warning);
  }

  .step-target-state[data-tone='danger'] .step-target-state-label {
    background: var(--lq-color-danger-soft);
    color: var(--lq-color-danger);
  }

  .step-target-points-at {
    color: var(--lq-color-ink);
    font-weight: var(--lq-weight-semibold);
  }

  .step-target-meaning,
  .step-target-action,
  .step-target-evidence {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .step-target-section > button {
    justify-self: start;
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 7px 11px;
  }

  /*
   * Nested target concerns. Quieter than a top-level section — a row inside a
   * section has to read as a level down, or the Target section looks like six
   * sections that lost their heading.
   */
  .target-subsections {
    display: grid;
    gap: 1px;
    margin: 9px 0 0;
    border-top: 1px solid var(--lq-color-border-soft);
    padding-top: 6px;
  }

  /* Smaller and quieter than a section heading, or it reads as a sixth section. */
  .target-subsection > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 6px;
    color: var(--lq-color-subtle);
    cursor: pointer;
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.06em;
    list-style: none;
    padding: 6px 7px;
    text-transform: uppercase;
    user-select: none;
  }

  .target-subsection > summary::-webkit-details-marker {
    display: none;
  }

  .target-subsection > summary:hover {
    background: var(--lq-color-control-hover);
  }

  .target-subsection[open] > summary {
    color: var(--lq-color-ink);
  }

  .target-subsection[open] > summary .inspector-section-chevron {
    transform: rotate(90deg);
  }

  .target-subsection-body {
    display: grid;
    gap: 7px;
    padding: 4px 7px 10px;
  }

  /* §4.3 target rows: Evidence, Approach and Repair bodies. */
  .target-evidence-rows {
    display: grid;
    gap: 5px;
    margin: 9px 0 0;
  }

  .target-evidence-row {
    display: flex;
    align-items: baseline;
    gap: 7px;
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .target-evidence-row svg {
    align-self: center;
    flex: none;
    color: var(--lq-color-success);
  }

  .target-evidence-row dt {
    flex: 1;
    color: var(--lq-color-muted);
    margin: 0;
  }

  .target-evidence-row dd {
    margin: 0;
    color: var(--lq-color-ink);
    font-weight: var(--lq-weight-semibold);
    text-align: right;
  }

  /* Numbered, because the order of the legs is the recipe. */
  .target-approach-legs {
    display: grid;
    gap: 5px;
    margin: 9px 0 0;
    padding: 0;
    list-style: none;
    counter-reset: none;
  }

  .target-approach-legs li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: var(--lq-font-sm);
    line-height: 1.5;
    color: var(--lq-color-ink);
  }

  .target-approach-index {
    display: grid;
    width: 16px;
    height: 16px;
    flex: none;
    place-items: center;
    border-radius: 50%;
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .target-approach-empty,
  .target-repair-clear,
  .target-repair-drift {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 9px 0 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .target-repair-clear svg {
    flex: none;
    color: var(--lq-color-success);
  }

  .target-repair-drift {
    color: var(--lq-color-warning);
  }

  .target-repair-drift svg {
    flex: none;
  }

  /* Style reuse (§6.2). Every row is a labelled control, never a bare glyph. */
  .step-style-reuse-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .step-style-reuse-actions button {
    border: 1px solid var(--lq-color-border);
    border-radius: 7px;
    background: var(--lq-color-panel);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    padding: 7px 8px;
    text-align: left;
  }

  .step-style-reuse-actions button:disabled {
    color: var(--lq-color-muted);
    cursor: default;
  }

  .step-style-reuse-hint {
    margin: 7px 0 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .step-style-recipe-list {
    display: grid;
    gap: 3px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .step-style-recipe-list li {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .step-style-recipe-list li > button:first-child {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 7px;
    background: var(--lq-color-panel-strong);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    padding: 6px 8px;
    text-align: left;
  }

  .step-style-recipe-swatch {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    border: 1px solid var(--lq-color-border);
    border-radius: 4px;
  }

  .step-style-recipe-remove {
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    padding: 5px 6px;
  }

  /* Destructive, so it is stated in words and coloured — never colour alone. */
  .step-danger-zone {
    display: grid;
    gap: 4px;
    margin-top: var(--lq-space-2);
  }

  .step-danger-action {
    justify-self: start;
    min-height: var(--lq-control-sm);
    border: 1px solid var(--lq-color-danger-border, var(--lq-color-border));
    border-radius: 7px;
    background: var(--lq-color-danger-soft, transparent);
    color: var(--lq-color-danger);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
    padding: 0 11px;
  }

  .step-danger-action:disabled {
    border-color: var(--lq-color-border-soft);
    background: transparent;
    color: var(--lq-color-muted);
    cursor: default;
  }

  .step-danger-note {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .overlay-step-inspector-note {
    margin: 8px 0 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  .shell-operations,
  .shell-operations .workspace,
  .shell-operations .panel-canvas,
  .shell-operations .document-page,
  .shell-operations .panel-reference-workspace {
    background: var(--lq-sheet-body);
    height: 100%;
    min-height: 0;
  }

  /* Nav rail beside a scrolling body — the prototype's #sheet exactly. */
  .operations-hub {
    display: grid;
    grid-template-columns: 214px minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    background: var(--lq-sheet-body);
    color: var(--lq-color-ink);
  }

  .operations-hub-nav {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--lq-color-border);
    background: var(--lq-sheet-nav);
    padding: 12px 9px;
  }

  /* Names the surface you are standing on, since the sheet has no other chrome. */
  .operations-hub-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 0;
    padding: 4px 8px 14px;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-bold);
    letter-spacing: -0.02em;
  }

  /* The experience's name, where the rest of its document settings live. */
  .operations-hub-title {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0 9px 6px;
  }

  .operations-hub-title span {
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .operations-hub-title input {
    border: 1px solid var(--lq-color-control-border);
    border-radius: 7px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    padding: 6px 9px;
  }

  .operations-hub-title input:focus-visible {
    border-color: var(--lq-color-primary);
    outline: 2px solid var(--lq-color-primary-soft);
    outline-offset: 1px;
  }

  .operations-hub-group-label {
    margin: 0;
    padding: 13px 9px 5px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .operations-hub-nav button {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    border: none;
    border-radius: 7px;
    background: none;
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-md);
    line-height: 1.3;
    padding: 7px 9px;
    text-align: left;
  }

  .operations-hub-nav button:hover {
    background: var(--lq-sheet-nav-hover);
    color: var(--lq-color-ink-strong);
  }

  .operations-hub-nav button[aria-current='page'] {
    background: var(--lq-sheet-nav-active);
    color: var(--lq-color-ink-strong);
    font-weight: var(--lq-weight-semibold);
  }

  /* Fixed box: the glyphs differ in width, and a ragged label column is what
     makes a sixteen-row list unscannable. */
  .operations-hub-nav-icon {
    display: grid;
    width: 15px;
    flex: none;
    place-items: center;
  }

  .operations-hub-nav-label {
    min-width: 0;
    flex: 1;
  }

  /* What the section would tell you, on the row instead. Never colour alone —
     the count is the message and the aria-label spells it out. */
  .operations-hub-badge {
    margin-left: auto;
    border-radius: 9px;
    background: var(--lq-color-control);
    padding: 1px 6px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .operations-hub-badge[data-tone='warning'] {
    background: var(--lq-tag-warn);
    color: var(--lq-tag-warn-ink);
  }

  .operations-hub-badge[data-tone='blocker'] {
    background: var(--lq-tag-bad);
    color: var(--lq-tag-bad-ink);
  }

  /* Pinned to the floor of the nav, under everything the groups put above it. */
  .operations-hub-plan {
    margin-top: auto;
  }

  .operations-hub-plan p:last-child {
    margin: 0;
    padding: 4px 9px 10px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-sm);
    line-height: 1.7;
  }

  .operations-hub-body {
    position: relative;
    min-height: 0;
    overflow-y: auto;
    padding: 22px 26px 46px;
  }

  /*
   * Over the content it dismisses, not in a bar above it. The sheet has no
   * header to hold a back button, and a creator who opens Operations by accident
   * should find the way out without reading anything.
   */
  .operations-hub-close {
    position: absolute;
    right: 16px;
    top: 14px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: 8px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    padding: 6px 12px;
  }

  .operations-hub-close:hover {
    background: var(--lq-color-control-hover);
  }

  .operations-hub-close kbd {
    color: var(--lq-color-subtle);
    font: var(--lq-font-xs) ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  /*
   * The section's name and opening line, inside the body so they scroll with it
   * (§4.6). Measured at 74ch, not full width: past about that the eye loses the
   * start of the next line.
   */
  .operations-hub-head {
    max-width: 74ch;
    margin-bottom: 18px;
  }

  /* Hugs its text. As a full-width flex block the focus ring drew a box the
     whole measure wide around a two-word heading. */
  .operations-hub-head h2 {
    display: flex;
    width: max-content;
    max-width: 100%;
    align-items: center;
    gap: 10px;
    margin: 0 0 4px;
    font-size: var(--lq-font-xl);
    font-weight: var(--lq-weight-semibold);
    letter-spacing: -0.025em;
  }

  /* Focus lands here on every section change, to move the screen reader to the
     new section. The heading is not interactive and Chrome still treats a
     scripted focus after a keypress as focus-visible, so it drew a ring around
     a title nobody had tabbed to. Announcement is the point; the ring is not. */
  .operations-hub-head h2:focus,
  .operations-hub-head h2:focus-visible {
    outline: none;
  }

  /* The glyph is shared with the nav, which needs it at 15. */
  .operations-hub-head h2 svg {
    width: 18px;
    height: 18px;
    flex: none;
  }

  .operations-hub-head p {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-md);
    line-height: 1.65;
  }

  /* The map is a canvas, not a document: it takes the body whole. */
  .operations-hub-body:has(.tour-flow-map-workspace) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .operations-hub-body .tour-flow-map-workspace {
    flex: 1 1 auto;
    min-height: 0;
  }

  @media (max-width: 720px) {
    .operations-hub {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .operations-hub-nav {
      flex-direction: row;
      align-items: center;
      overflow-x: auto;
      overflow-y: hidden;
      border-right: 0;
      border-bottom: 1px solid var(--lq-color-border);
      padding: 8px 12px;
    }

    .operations-hub-nav button {
      width: auto;
      flex: 0 0 auto;
      white-space: nowrap;
    }

    /* A horizontal scroller has no floor to pin these to, and neither is worth a
       row of one. */
    .operations-hub-brand,
    .operations-hub-group-label,
    .operations-hub-plan,
    .operations-hub-title {
      display: none;
    }

    .operations-hub-body {
      padding: 16px 16px 32px;
    }

    .operations-check-tally {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
