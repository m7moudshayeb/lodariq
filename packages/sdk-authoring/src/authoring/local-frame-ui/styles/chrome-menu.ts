/**
 * The one floating menu shape used by every creator-chrome control (§4.2a).
 *
 * The prototype opens the same popover from the toolbar, the gutter, the
 * filmstrip, the mode pill and the inspector — one geometry, one set of parts:
 * an uppercase section head, rows that carry an icon, a label and the shortcut
 * that duplicates them, hairline separators, a quiet explanatory note, and two
 * dense layouts (a four-up grid for block types, a swatch row for colour roles).
 *
 * Menus are opaque rather than glass: they float *above* glass chrome, and a
 * translucent surface stacked on a translucent surface stops being readable.
 *
 * Reference: authoring-spec.html → `.menu` / `menu()` · authoring-ux-model.md §4.2a
 */
export const AUTHORING_CHROME_MENU_CSS = `
  /*
   * The toolbar's style menu is listed alongside every rule below rather than
   * carrying its own copy. Its copy had drifted — no font-size at all, so its
   * rows inherited the frame body's 16px and rendered half again too large,
   * with a different radius, padding and gap besides. A menu that looks like
   * the others because it *is* the others cannot drift again.
   */
  .chrome-menu,
  .toolbar-style-menu {
    position: fixed;
    inset: auto;
    z-index: 95;
    display: flex;
    flex-direction: column;
    min-width: 196px;
    /*
     * Sized by its widest line, like the prototype's: a guardrail note that
     * wraps to three lines reads as a paragraph to skip rather than as the one
     * sentence that explains the control.
     */
    max-width: min(440px, calc(100vw - 16px));
    max-height: 70vh;
    margin: 0;
    padding: 5px;
    overflow-y: auto;
    border: 1px solid var(--lq-color-menu-border);
    border-radius: 9px;
    background: var(--lq-color-menu);
    box-shadow: var(--lq-shadow-popover);
    color: var(--lq-color-ink);
  }

  .chrome-menu:popover-open,
  .toolbar-style-menu:popover-open {
    display: flex;
  }

  /* Says what the rows under it are, so a menu is never an unlabelled list. */
  .chrome-menu-heading,
  .toolbar-style-group {
    margin: 0;
    padding: 7px 9px 5px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .chrome-menu-item,
  .toolbar-style-menu button {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 9px;
    padding: 7px 9px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--lq-color-ink-soft);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    text-align: left;
  }

  .chrome-menu-item > svg,
  .toolbar-style-menu button > svg {
    flex: none;
  }

  /* The one step of emphasis chrome has: a hovered row lifts to pure white. */
  .chrome-menu-item:hover:not(:disabled),
  .toolbar-style-menu button:hover:not(:disabled) {
    background: var(--lq-color-control-hover);
    color: var(--lq-color-ink-strong);
  }

  .chrome-menu-item[aria-checked='true'],
  .chrome-menu-item[data-selected='true'],
  .toolbar-style-menu button[aria-checked='true'] {
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  .chrome-menu-item:disabled,
  .toolbar-style-menu button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  /*
   * The accelerator is printed beside the control it duplicates, never taught
   * separately (§3.1a) — so it is decoration on a row that already works.
   */
  .chrome-menu-item kbd,
  .toolbar-style-menu button kbd {
    margin-left: auto;
    padding-left: 8px;
    background: none;
    color: var(--lq-color-subtle);
    font: var(--lq-font-xs) ui-monospace, Menlo, monospace;
  }

  .chrome-menu-separator {
    height: 1px;
    margin: 4px 0;
    background: var(--lq-color-menu-border);
  }

  .chrome-menu-note {
    margin: 0;
    padding: 6px 9px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
  }

  /* Block types are recognised by shape, so they get a grid rather than a list. */
  .chrome-menu-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 4px;
  }

  .chrome-menu-grid .chrome-menu-item {
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 8px 4px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    text-align: center;
  }

  .chrome-menu-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 5px 9px 8px;
  }

  .chrome-menu-swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1.5px solid color-mix(in srgb, var(--lq-color-ink) 16%, transparent);
    border-radius: 6px;
    cursor: pointer;
  }

  .chrome-menu-swatch[data-selected='true'] {
    outline: 2px solid var(--lq-color-primary);
    outline-offset: 2px;
  }

  /* Numeric menus: type it, step it, or drag it — three ways to the same value. */
  .chrome-menu-number {
    padding: 6px 9px 9px;
  }

  .chrome-menu-number-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .chrome-menu-number-row input {
    flex: 1;
    width: 100%;
    padding: 5px 7px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-variant-numeric: tabular-nums;
  }

  .chrome-menu-step {
    display: flex;
    height: 26px;
    min-width: 26px;
    align-items: center;
    justify-content: center;
    padding: 0 9px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    cursor: pointer;
  }

  .chrome-menu-step:hover {
    background: var(--lq-color-control-hover);
  }

  .chrome-menu-bounds {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-variant-numeric: tabular-nums;
  }

  .chrome-menu-text {
    padding: 4px 9px 9px;
  }

  .chrome-menu-text textarea {
    width: 100%;
    padding: 6px 9px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: var(--lq-radius-xs);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    line-height: 1.5;
    resize: vertical;
  }

  .chrome-menu-text-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 7px;
  }

  .chrome-menu input:focus-visible,
  .chrome-menu textarea:focus-visible {
    border-color: var(--lq-color-blue);
    outline: 0;
    box-shadow: 0 0 0 2px var(--lq-color-blue-border);
  }
`;
