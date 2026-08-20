/**
 * The Tier 3 sections added alongside the original eight. Everything reads from
 * the workspace token layer, so Operations stays one surface rather than a
 * collection of differently-styled screens.
 */
export const AUTHORING_OPERATIONS_SECTIONS_CSS = `
  .operations-hub-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /*
   * ── The sheet's shared vocabulary ─────────────────────────────────────
   *
   * Fourteen sections, one set of parts: a card, a column grid, a button, a
   * list, a table, a coverage bar, a key/value pair, an inline note, a tag.
   * The prototype's .box / .cols / .sbtn / .lst / .dt / .meter / .kv / .note /
   * .tag, under names that cannot collide with the authoring workspace's own.
   *
   * These carry no section knowledge. A section that needs something none of
   * them can express is a section that needs a new part here, not a local
   * one-off — that is how fourteen screens drift into fourteen designs.
   */
  .ops-box {
    margin-bottom: 13px;
    border: 1px solid var(--lq-color-border);
    border-radius: 11px;
    background: var(--lq-sheet-box);
    padding: 15px;
  }

  .ops-box > h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: var(--lq-font-md);
    font-weight: var(--lq-weight-semibold);
  }

  /* Controls that belong to the card's title rather than to its content. */
  .ops-box > h3 .ops-box-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .ops-box-body {
    margin: 0 0 10px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.65;
  }

  .ops-box-body:last-child {
    margin-bottom: 0;
  }

  .ops-cols {
    display: grid;
    gap: 13px;
  }

  .ops-cols[data-cols='2'] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ops-cols[data-cols='3'] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ops-cols[data-cols='4'] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  /* A card inside a column grid has already been spaced by the grid. */
  .ops-cols > .ops-box {
    margin-bottom: 0;
  }

  .ops-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--lq-color-control-border);
    border-radius: 8px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    padding: 7px 12px;
    white-space: nowrap;
  }

  .ops-btn:hover:not(:disabled) {
    background: var(--lq-color-control-hover);
  }

  .ops-btn[data-variant='primary'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  .ops-btn[data-variant='primary']:hover:not(:disabled) {
    background: var(--lq-color-primary-hover);
  }

  .ops-btn[data-variant='danger'] {
    border-color: var(--lq-color-danger-border);
    color: var(--lq-tag-bad-ink);
  }

  .ops-btn[data-variant='danger']:hover:not(:disabled) {
    background: var(--lq-color-danger-soft);
  }

  .ops-btn[data-size='sm'] {
    font-size: var(--lq-font-sm);
    padding: 4px 9px;
  }

  /* Disabled but still printed, with its reason on the control (§3 WIRE_). */
  .ops-btn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .ops-list {
    margin: 0;
    padding: 0;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    list-style: none;
  }

  .ops-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    padding: 9px 0;
    line-height: 1.55;
  }

  .ops-list li:last-child {
    border-bottom: none;
  }

  .ops-list-meta {
    display: block;
    margin-top: 2px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .ops-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--lq-font-sm);
  }

  .ops-table th {
    border-bottom: 1px solid var(--lq-color-border);
    padding: 8px 10px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.08em;
    text-align: left;
    text-transform: uppercase;
  }

  .ops-table td {
    border-bottom: 1px solid var(--lq-sheet-table-rule);
    padding: 9px 10px;
    color: var(--lq-color-ink-soft);
    vertical-align: middle;
  }

  .ops-table tr:last-child td {
    border-bottom: none;
  }

  /* The column that identifies the row, so the eye has one anchor per line. */
  .ops-table td.ops-table-key {
    color: var(--lq-color-ink-strong);
    font-weight: var(--lq-weight-medium);
  }

  .ops-table tr[data-selected='true'] {
    background: var(--lq-color-primary-soft);
  }

  /* Coverage, never alone: every meter is captioned with its own number. */
  .ops-meter {
    height: 7px;
    border-radius: 4px;
    background: var(--lq-sheet-meter-track);
    overflow: hidden;
  }

  .ops-meter > i {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--lq-color-primary);
  }

  .ops-meter > i[data-tone='ok'] {
    background: var(--lq-color-success);
  }

  .ops-meter > i[data-tone='warning'] {
    background: var(--lq-color-warning);
  }

  .ops-meter > i[data-tone='blocker'] {
    background: var(--lq-color-danger);
  }

  .ops-barrow {
    display: grid;
    grid-template-columns: 120px 1fr auto;
    align-items: center;
    gap: 11px;
    margin-bottom: 8px;
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
  }

  .ops-kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 5px 14px;
    margin: 0;
    font-size: var(--lq-font-sm);
  }

  .ops-kv dt {
    margin: 0;
    color: var(--lq-color-muted);
  }

  .ops-kv dd {
    margin: 0;
    color: var(--lq-color-ink);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  /*
   * An inline note. The left edge is coloured *and* so is the ink, because a
   * coloured rule alone is exactly the "colour carries the meaning" failure
   * §13 rules out.
   */
  .ops-callout {
    margin: 0 0 11px;
    border: 1px solid;
    border-left-width: 2px;
    border-radius: 0 8px 8px 0;
    padding: 10px 13px;
    font-size: var(--lq-font-sm);
    line-height: 1.65;
  }

  .ops-callout[data-tone='warning'] {
    border-color: var(--lq-note-warn-border);
    border-left-color: var(--lq-color-warning);
    background: var(--lq-note-warn);
    color: var(--lq-note-warn-ink);
  }

  .ops-callout[data-tone='ok'] {
    border-color: var(--lq-note-ok-border);
    border-left-color: var(--lq-color-success);
    background: var(--lq-note-ok);
    color: var(--lq-note-ok-ink);
  }

  .ops-callout[data-tone='blocker'] {
    border-color: var(--lq-note-bad-border);
    border-left-color: var(--lq-color-danger);
    background: var(--lq-note-bad);
    color: var(--lq-note-bad-ink);
  }

  .ops-callout[data-tone='info'] {
    border-color: var(--lq-note-info-border);
    border-left-color: var(--lq-color-primary);
    background: var(--lq-note-info);
    color: var(--lq-note-info-ink);
  }

  .ops-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border-radius: 5px;
    background: var(--lq-tag-neutral);
    padding: 2.5px 7px;
    color: var(--lq-tag-neutral-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ops-tag[data-tone='ok'] {
    background: var(--lq-tag-ok);
    color: var(--lq-tag-ok-ink);
  }

  .ops-tag[data-tone='warning'] {
    background: var(--lq-tag-warn);
    color: var(--lq-tag-warn-ink);
  }

  .ops-tag[data-tone='blocker'] {
    background: var(--lq-tag-bad);
    color: var(--lq-tag-bad-ink);
  }

  .ops-tag[data-tone='peer'] {
    background: var(--lq-tag-peer);
    color: var(--lq-tag-peer-ink);
  }

  .ops-tag[data-tone='accent'] {
    background: var(--lq-tag-accent);
    color: var(--lq-tag-accent-ink);
  }

  .ops-code {
    max-height: 280px;
    border: 1px solid var(--lq-color-border);
    border-radius: 8px;
    background: var(--lq-sheet-code);
    padding: 11px;
    color: var(--lq-color-subtle);
    font: var(--lq-font-sm)/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow: auto;
    white-space: pre-wrap;
  }

  .ops-pill-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 14px;
  }

  .ops-pill-tabs button {
    border: 1px solid var(--lq-color-control-border);
    border-radius: 20px;
    background: var(--lq-color-control);
    color: var(--lq-color-muted);
    cursor: pointer;
    font-size: var(--lq-font-sm);
    padding: 6px 12px;
  }

  .ops-pill-tabs button[aria-pressed='true'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary);
    color: var(--lq-color-on-primary);
    font-weight: var(--lq-weight-bold);
  }

  /* A label over a group of cards, one rung below the section's own name. */
  .ops-subhead {
    margin: 0 0 9px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  /* Pushes whatever follows it to the far end of a flex row. */
  .ops-spacer {
    flex: 1;
  }

  .ops-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* ── Language ──────────────────────────────────────────────────────── */

  .operations-language .ops-table-key {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* The bar and its number are one cell: a meter with no figure beside it is a
     picture of a fact rather than the fact. */
  .operations-language-coverage {
    display: grid;
    grid-template-columns: minmax(80px, 140px) auto;
    align-items: center;
    gap: 10px;
  }

  .operations-language-coverage > span {
    color: var(--lq-color-ink);
    font-variant-numeric: tabular-nums;
  }

  .operations-language-actions,
  .operations-language-actions-heading {
    display: flex;
    justify-content: flex-end;
    text-align: right;
  }

  /* ── Audience & triggers ───────────────────────────────────────────── */

  .operations-audience-rules {
    counter-reset: none;
  }

  /* Numbered because rules are read in order and referred to by position. */
  .operations-audience-rule-index {
    display: inline-grid;
    width: 18px;
    height: 18px;
    margin-right: 8px;
    place-items: center;
    border-radius: 5px;
    background: var(--lq-tag-neutral);
    color: var(--lq-tag-neutral-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .operations-audience-footer {
    margin-top: 10px;
  }

  /* Absence, in the one colour that is not a status. */
  .operations-audience-none {
    color: var(--lq-color-subtle);
  }

  .operations-audience-origins {
    font: var(--lq-font-sm) ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .operations-audience-hint {
    margin: 10px 0 0;
    font-size: var(--lq-font-sm);
  }

  /* A step this visitor would never be shown, in a table of steps that are. */
  .operations-audience tr[data-skipped='true'] .ops-table-key {
    color: var(--lq-color-subtle);
    text-decoration: line-through;
  }

  @media (max-width: 980px) {
    .ops-cols[data-cols='3'],
    .ops-cols[data-cols='4'] {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .ops-cols[data-cols='2'],
    .ops-cols[data-cols='3'],
    .ops-cols[data-cols='4'] {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .operations-lede {
    margin: 0 0 16px;
    max-width: 74ch;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.65;
  }

  .operations-note {
    margin: 10px 0 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    line-height: 1.6;
  }

  .operations-card {
    margin-bottom: 14px;
    padding: 16px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-panel);
  }

  .operations-card[data-blocking='true'] {
    border-color: var(--lq-color-warning-border);
  }

  .operations-card > h4,
  .operations-card-header h4 {
    margin: 0 0 8px;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  .operations-card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .operations-card-header h4 {
    flex: 1;
    margin: 0;
  }

  .operations-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--lq-font-xs);
  }

  .operations-table th[scope='col'] {
    padding: 8px 10px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.06em;
    text-align: left;
    text-transform: uppercase;
  }

  .operations-table td,
  .operations-table th[scope='row'] {
    padding: 9px 10px;
    border-bottom: 1px solid var(--lq-color-border-soft);
    text-align: left;
  }

  .operations-table tr[data-skipped='true'] {
    opacity: 0.55;
  }

  .operations-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
    font-size: var(--lq-font-xs);
  }

  .operations-facts dt {
    color: var(--lq-color-muted);
  }

  .operations-facts dd {
    margin: 0;
  }

  /** Tone is a data attribute so the same pill serves every section. */
  .operations-status,
  .storyboard-card-health {
    padding: 2px 8px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 999px;
    color: var(--lq-color-muted);
    font-size: 8px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .operations-status[data-tone='ok'],
  .storyboard-card-health[data-tone='ok'] {
    border-color: var(--lq-color-primary);
    color: var(--lq-color-primary);
  }

  .operations-status[data-tone='warn'],
  .storyboard-card-health[data-tone='warn'] {
    border-color: var(--lq-color-warning-border);
    color: var(--lq-color-ink);
  }

  .operations-link {
    padding: 10px 12px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel-strong);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--lq-font-xs);
    overflow-wrap: anywhere;
  }

  /* ── Storyboard ─────────────────────────────────────────────────────── */

  .storyboard-card-index {
    display: inline-grid;
    width: 18px;
    height: 18px;
    flex: none;
    place-items: center;
    border-radius: 5px;
    background: var(--lq-tag-neutral);
    color: var(--lq-tag-neutral-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
  }

  .storyboard-card[data-selected='true'] {
    border-color: var(--lq-color-primary);
  }

  /* Two steps that say the same thing. Marked on the copy itself, because the
     copy is what has to change. */
  .storyboard-card[data-overlaps='true'] .storyboard-card-preview p {
    text-decoration: underline wavy var(--lq-color-warning);
    text-underline-offset: 3px;
  }

  /* The step's words on their own plate: a picture of the card, not a row. */
  .storyboard-card-preview {
    display: grid;
    gap: 6px;
    border: 1px solid var(--lq-color-border-soft);
    border-radius: 8px;
    background: var(--lq-color-panel-strong);
    padding: 11px 12px;
  }

  .storyboard-card-preview strong {
    color: var(--lq-color-ink-strong);
    font-size: var(--lq-font-sm);
    line-height: 1.35;
  }

  .storyboard-card-preview p {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
    line-height: 1.55;
  }

  .storyboard-card-footer {
    margin-top: 11px;
  }

  .storyboard-card-words {
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-sm);
    white-space: nowrap;
  }

  .storyboard-compare-grid {
    display: grid;
    gap: 13px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .storyboard-compare-column h4 {
    margin: 0 0 8px;
    font-size: var(--lq-font-sm);
  }

  .storyboard-compare-column label {
    display: grid;
    gap: 4px;
    margin-bottom: 10px;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .storyboard-compare-column textarea {
    border: 1px solid var(--lq-color-control-border);
    border-radius: 8px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    padding: 8px 9px;
    resize: vertical;
  }

  /* ── A/B testing ────────────────────────────────────────────────────── */

  /* The arm's own numbers, under its traffic control. */
  .experiment-arm-results {
    margin-top: 10px;
  }

  /* ── Analytics ─────────────────────────────────────────────────────── */

  .analytics-summary {
    margin-bottom: 14px;
  }

  .analytics-kpi {
    display: grid;
    gap: 6px;
  }

  .analytics-kpi span {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-sm);
  }

  .analytics-kpi strong {
    color: var(--lq-color-ink);
    font-size: 24px;
    font-weight: var(--lq-weight-bold);
    letter-spacing: -0.03em;
  }

  /* Taller than a coverage bar: this one is the content of its row, not an
     annotation on it. */
  .analytics-meter {
    height: 20px;
    border-radius: 6px;
  }

  .analytics-meter > i {
    border-radius: 6px;
  }

  .analytics-bar-value {
    min-width: 130px;
    color: var(--lq-color-ink-soft);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .operations-analytics-hint {
    margin: 10px 0 0;
    font-size: var(--lq-font-sm);
  }

  /* ── Narration ──────────────────────────────────────────────────────── */

  .narration-stage {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* The caption at the size it will actually be read at, on the plate it will
     actually be read on (§4.7). */
  .narration-caption {
    min-height: 3.2em;
    margin: 0;
    border-radius: 10px;
    background: var(--lq-color-panel-recessed);
    padding: 14px 16px;
    color: var(--lq-color-ink-strong);
    font-size: var(--lq-font-md);
    line-height: 1.6;
    text-align: center;
  }

  .narration-where {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }

  .narration-transport {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .narration-scrubber {
    flex: 1;
    min-width: 120px;
    accent-color: var(--lq-color-primary);
  }

  .narration-clock {
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .narration-hint {
    margin: 10px 0 0;
    font-size: var(--lq-font-sm);
  }

  /* A step with nothing to say, in a table of steps that do. */
  .operations-narration tr[data-skipped='true'] .ops-table-key {
    color: var(--lq-color-subtle);
  }

  /* ── Appearance · Release · History, rendered as sections ───────────── */

  /*
   * These three are also panel modes reached from the canvas, so each wraps
   * itself in a PanelModeShell: a header with an eyebrow, a title and a back
   * button, over a body that owns the scroll.
   *
   * As sections that chrome is wrong twice over. The sheet's own head already
   * names the section, so the header is a second title; and the back button
   * closes a mode the creator is not in. The shell flattens to its content and
   * lets the sheet body scroll, which is what every other section does.
   */
  .operations-hub-body .panel-mode-shell {
    display: block;
    height: auto;
    min-height: 0;
    background: none;
  }

  .operations-hub-body .panel-mode-header {
    display: none;
  }

  /* Keeps its own grid and gap — that is the layout its cards are built for.
     Only the scroll and the outer padding go, because the sheet body owns both. */
  .operations-hub-body .panel-mode-body {
    height: auto;
    min-height: 0;
    padding: 0;
    overflow: visible;
  }

  /* Sized for a 320px panel. On the sheet a card is a card, at the sheet's own
     measure, so the three read as sections rather than as a panel pasted in. */
  .operations-hub-body .panel-mode-card,
  .operations-hub-body .panel-mode-section {
    border-radius: 11px;
    background: var(--lq-sheet-box);
  }

  /* ── Review ─────────────────────────────────────────────────────────── */

  /*
   * Review also renders as a standalone advanced editor, where its rows are
   * white plates on a white page. On the sheet that put near-white text on
   * near-white rows; here it is a card with ruled rows like every other section.
   */
  .operations-hub-body .tour-review-workspace {
    height: auto;
    border: 1px solid var(--lq-color-border);
    border-radius: 11px;
    background: var(--lq-sheet-box);
    overflow: visible;
  }

  .operations-hub-body .tour-review-main {
    overflow: visible;
  }

  .operations-hub-body .tour-review-row {
    border-bottom-color: var(--lq-color-border-soft);
    background: none;
    color: var(--lq-color-ink);
  }

  .operations-hub-body .tour-review-row:hover,
  .operations-hub-body .tour-review-row:focus-visible,
  .operations-hub-body .tour-review-row[aria-expanded='true'] {
    background: var(--lq-sheet-nav-hover);
  }

  .operations-hub-body .tour-review-row[data-tone='attention'] .tour-review-row-icon,
  .operations-hub-body .tour-review-row[data-tone='attention'] .tour-review-row-detail {
    color: var(--lq-tag-warn-ink);
  }

  /* The advanced editor's back button is a white pill in the light shell. */
  .operations-hub-body .panel-advanced-back {
    border: 1px solid var(--lq-color-control-border);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
  }

  .operations-hub-body .panel-advanced-back:hover {
    background: var(--lq-color-control-hover);
  }

  /* ── Flow map ───────────────────────────────────────────────────────── */

  /*
   * The map also renders as a standalone focused surface, where its canvas and
   * inspector are painted for the light workspace. On the sheet the inspector's
   * white plate put white text on white; both take the sheet's own pair here.
   */
  .operations-hub-body .tour-flow-canvas {
    background: var(--lq-sheet-map);
    background-image: radial-gradient(circle, var(--lq-sheet-map-dot) 1px, transparent 1px);
    background-size: 22px 22px;
  }

  .operations-hub-body .tour-flow-node-inspector {
    border-color: var(--lq-color-border);
    background: var(--lq-sheet-box);
    color: var(--lq-color-ink);
    box-shadow: var(--lq-shadow-popover);
  }

  /* The workspace and its toolbar are painted white for the light shell. */
  .operations-hub-body .tour-flow-map-workspace,
  .operations-hub-body .tour-flow-toolbar {
    background: var(--lq-sheet-box);
    color: var(--lq-color-ink);
  }

  .operations-hub-body .tour-flow-toolbar {
    border-bottom: 1px solid var(--lq-color-border);
  }

  .operations-hub-body .tour-flow-toolbar button,
  .operations-hub-body .tour-flow-return {
    border-color: var(--lq-color-control-border);
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
  }

  .operations-hub-body .tour-flow-toolbar button:hover:not(:disabled),
  .operations-hub-body .tour-flow-return:hover:not(:disabled) {
    background: var(--lq-color-control-hover);
  }

  /* The selected tool keeps the accent it already had. */
  .operations-hub-body .tour-flow-toolbar button[aria-pressed='true'] {
    border-color: var(--lq-color-primary);
    background: var(--lq-color-primary-soft);
    color: var(--lq-color-primary);
  }

  /*
   * The branch workbench — rules, conditions and the fallback card. Three light
   * plates (#ffffff, #f7faf9, #fbfcfb) that read as holes punched in the map.
   * A rule is a card on the sheet; a condition is the recess inside it.
   */
  .operations-hub-body .transition-rule,
  .operations-hub-body .transition-fallback-card,
  .operations-hub-body .transition-editor[data-branch-state='empty'] {
    border-color: var(--lq-color-border);
    background: var(--lq-sheet-box);
    color: var(--lq-color-ink);
  }

  .operations-hub-body .transition-condition {
    background: var(--lq-color-panel-strong);
  }

  .operations-hub-body .transition-editor-heading,
  .operations-hub-body .transition-rule > legend {
    color: var(--lq-color-ink);
  }

  /* ── Batch edits ────────────────────────────────────────────────────── */

  /*
   * The batch workspace also renders as a standalone focused surface, which
   * paints itself a light plate and pads for a page of its own. Inside the sheet
   * it is a section like any other.
   */
  .operations-hub-body .tour-batch-workspace {
    background: none;
    padding: 0;
    overflow: visible;
  }

  .tour-batch-table input[type='checkbox'] {
    width: 15px;
    height: 15px;
    accent-color: var(--lq-color-primary);
    cursor: pointer;
  }

  /* Nothing selected: the card still says what it would do, and cannot do it. */
  .tour-batch-operation[data-disabled='true'] > h3,
  .tour-batch-operation[data-disabled='true'] .ops-box-body {
    opacity: 0.55;
  }

  .tour-batch-choices {
    flex-wrap: wrap;
  }

  /* ── Collaboration ──────────────────────────────────────────────────── */

  .presence-person {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  /* Initials carry the identity; the hue only supports it (§15.2). */
  .presence-avatar {
    display: grid;
    width: 24px;
    height: 24px;
    flex: none;
    place-items: center;
    border-radius: 50%;
    background: var(--lq-tag-peer);
    color: var(--lq-tag-peer-ink);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.02em;
  }

  .operations-collaboration-hint {
    margin: 10px 0 0;
    font-size: var(--lq-font-sm);
  }

  /* Free, in the one colour that is not a status. */
  .operations-collaboration-free {
    color: var(--lq-color-subtle);
  }

  /* A thread is a stack, not a row: tags, then who, then what they said. */
  .comment-threads li {
    align-items: flex-start;
  }

  .comment-threads li[data-resolved='true'] {
    opacity: 0.6;
  }

  .comment-thread {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .comment-thread-head {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .comment-author {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--lq-color-ink-strong);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-semibold);
  }

  .comment-body {
    color: var(--lq-color-ink-soft);
    font-size: var(--lq-font-sm);
    line-height: 1.6;
  }

  .comment-composer {
    display: grid;
    gap: 8px;
    justify-items: start;
    margin-top: 12px;
  }

  .comment-composer label {
    display: grid;
    width: 100%;
    gap: 4px;
    color: var(--lq-color-subtle);
    font-size: var(--lq-font-xs);
    font-weight: var(--lq-weight-bold);
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .comment-composer textarea {
    width: 100%;
    border: 1px solid var(--lq-color-control-border);
    border-radius: 8px;
    background: var(--lq-color-control);
    color: var(--lq-color-ink);
    font: inherit;
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-regular);
    letter-spacing: normal;
    padding: 8px 9px;
    resize: vertical;
    text-transform: none;
  }
`;
