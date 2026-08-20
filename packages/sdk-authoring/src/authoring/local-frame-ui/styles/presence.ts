/**
 * Presence, soft locks and the conflict chooser (§15).
 *
 * Nothing here carries information by colour alone: an avatar shows initials, a
 * lock shows a name, and the conflict chooser shows words.
 */
export const AUTHORING_PRESENCE_CSS = `
  /* The step lock is a band on the page now — see overlay/lock-band.ts (§15.2). */

  /* §6.3: a theme change must never be silent. */
  .appearance-theme-stale {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-warning-border);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-warning-soft);
    padding: var(--lq-space-2);
    margin: 0 0 var(--lq-space-3);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
  }

  .conflict-chooser {
    display: grid;
    gap: var(--lq-space-2);
    border: 1px solid var(--lq-color-warning-border);
    border-radius: var(--lq-radius-md);
    background: var(--lq-color-warning-soft);
    padding: var(--lq-space-3);
  }

  .conflict-chooser-message {
    margin: 0;
    color: var(--lq-color-ink);
    font-size: var(--lq-font-sm);
    font-weight: var(--lq-weight-medium);
  }

  .conflict-chooser-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--lq-space-2);
  }

  .conflict-chooser-actions button {
    display: inline-flex;
    height: var(--lq-control-sm);
    align-items: center;
    gap: var(--lq-space-1);
    border: 1px solid var(--lq-color-border-soft);
    border-radius: var(--lq-radius-sm);
    background: var(--lq-color-panel);
    padding: 0 var(--lq-space-2);
    color: var(--lq-color-ink);
    font-size: var(--lq-font-xs);
    cursor: pointer;
  }

  .conflict-chooser-promise {
    margin: 0;
    color: var(--lq-color-muted);
    font-size: var(--lq-font-xs);
  }
`;
