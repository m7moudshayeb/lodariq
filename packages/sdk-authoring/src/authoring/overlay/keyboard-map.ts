import { authoringText } from '../../i18n';
import type { BigModalModel } from './big-modal';
import { escapeHtml } from './html';

/**
 * §4.1's keyboard map (§10). It was a view of the pill's menu until there was a
 * modal to put it in — a reference table read three rows at a time is one nobody
 * reads. Only keys the build actually binds are printed: a map is a promise.
 */
export const KEYBOARD_MAP_COPY = {
  title: authoringText('Keyboard map'),
  /** §3.1a is the whole point of printing the map: none of it is the only way. */
  note: authoringText(
    'Every one of these repeats a visible, labelled control. Nothing here is the only way to do anything.',
  ),
  undo: authoringText('Undo / redo'),
  ask: authoringText('Ask Lodariq'),
  duplicate: authoringText('Duplicate what is selected'),
  remove: authoringText('Remove what is selected'),
  move: authoringText('Move what is selected up or down'),
  panels: authoringText('Hide or show all panels'),
  preview: authoringText('Preview as a user'),
  escape: authoringText('Back out of anything'),
  extend: authoringText('Extend the filmstrip selection'),
  add: authoringText('Add to the filmstrip selection'),
} as const;

const ROWS: readonly { readonly keys: string; readonly label: string }[] = [
  { keys: '⌘Z / ⇧⌘Z', label: KEYBOARD_MAP_COPY.undo },
  { keys: '⌘K', label: KEYBOARD_MAP_COPY.ask },
  { keys: '⌘D', label: KEYBOARD_MAP_COPY.duplicate },
  { keys: '⌫', label: KEYBOARD_MAP_COPY.remove },
  { keys: '⌥↑ / ⌥↓', label: KEYBOARD_MAP_COPY.move },
  { keys: '⌘⇧\\', label: KEYBOARD_MAP_COPY.panels },
  { keys: 'P', label: KEYBOARD_MAP_COPY.preview },
  { keys: 'Esc', label: KEYBOARD_MAP_COPY.escape },
  { keys: '⇧-click', label: KEYBOARD_MAP_COPY.extend },
  { keys: '⌘-click', label: KEYBOARD_MAP_COPY.add },
];

export function keyboardMapModal(): BigModalModel {
  return {
    title: KEYBOARD_MAP_COPY.title,
    bodyHtml: `
      <p class="overlay-big-modal-note">${escapeHtml(KEYBOARD_MAP_COPY.note)}</p>
      <table class="overlay-big-modal-table"><tbody>
        ${ROWS.map(
          (row) =>
            `<tr><td><kbd>${escapeHtml(row.keys)}</kbd></td><td>${escapeHtml(row.label)}</td></tr>`,
        ).join('')}
      </tbody></table>
    `,
  };
}
