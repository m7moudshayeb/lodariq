/**
 * §7.5's command palette, on the host page.
 *
 * One box that is both the search over everything the build can do and the place
 * a creator types a sentence. Drawn here rather than in the frame for the same
 * reason as the big modal: it is 620px of chrome that belongs to the session, not
 * to the card.
 *
 * ⌘K opens it, but the pill's menu opens it too — §3.1a: no shortcut is the only
 * way to reach anything.
 */
import { escapeHtml } from './html';
import { OVERLAY_GLYPHS } from './icons';
import {
  matchedCommands,
  matchedPhrasings,
  PALETTE_COPY,
  type PaletteActions,
  type PaletteCommand,
} from './palette-commands';

export interface CommandPaletteOptions {
  readonly actions: PaletteActions;
  /** False when the session has no assist provider: the AI rows say so (§7.4). */
  readonly assistAvailable: () => boolean;
}

export interface CommandPalette {
  readonly element: HTMLElement;
  readonly open: () => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
  readonly destroy: () => void;
}

/** The prototype shows ten; more than that is a list to read, not one to scan. */
const MAX_ROWS = 10;

export function createCommandPalette(
  doc: Document,
  options: CommandPaletteOptions,
): CommandPalette {
  const element = doc.createElement('div');
  element.className = 'overlay-palette';
  element.dataset['protectedChrome'] = 'true';
  element.dataset['lodariqAuthoringControl'] = 'true';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'false');
  element.setAttribute('aria-label', PALETTE_COPY.region);
  element.hidden = true;
  element.innerHTML = `
    <div class="overlay-palette-input">
      ${OVERLAY_GLYPHS.sparkle}
      <input type="text" data-palette-input spellcheck="false" autocomplete="off"
        aria-label="${escapeHtml(PALETTE_COPY.region)}"
        placeholder="${escapeHtml(PALETTE_COPY.placeholder)}">
      <kbd>Esc</kbd>
    </div>
    <div class="overlay-palette-list" role="listbox" data-palette-list></div>
  `;

  const input = element.querySelector<HTMLInputElement>('[data-palette-input]');
  const list = element.querySelector<HTMLElement>('[data-palette-list]');
  let rows: readonly PaletteCommand[] = [];
  let active = 0;

  /** The typed sentence itself, offered when no command matched it. */
  function freeformRow(query: string): PaletteCommand {
    return {
      id: 'freeform',
      label: PALETTE_COPY.freeform(query),
      group: PALETTE_COPY.region,
      assist: true,
      run: (actions) => actions.ask(query),
    };
  }

  function blocked(row: PaletteCommand | undefined): boolean {
    return Boolean(row?.assist) && !options.assistAvailable();
  }

  /**
   * Where the cursor rests when the list is rebuilt.
   *
   * Not index 0: with no assist provider the three AI rows are the first three,
   * so Enter on a fresh palette did nothing at all. Arrowing onto a blocked row
   * is still allowed — that is how its reason gets read.
   */
  function firstRunnable(): number {
    const index = rows.findIndex((row) => !blocked(row));
    return index < 0 ? 0 : index;
  }

  function render(): void {
    if (!input || !list) return;
    const query = input.value;
    // Never empty: an unmatched query becomes the ask itself, as in the prototype.
    rows = [...matchedPhrasings(query), ...matchedCommands(query)].slice(0, MAX_ROWS);
    if (rows.length === 0 && query.trim()) rows = [freeformRow(query.trim())];
    active = Math.min(active, Math.max(0, rows.length - 1));
    list.innerHTML = rows
      .map((row, index) => {
        const off = blocked(row);
        const reason = off ? PALETTE_COPY.assistUnavailable : '';
        return `<div class="overlay-palette-row" role="option" data-palette-row="${index}"
          aria-selected="${index === active ? 'true' : 'false'}"
          ${index === active ? 'data-active="true"' : ''}
          ${off ? `aria-disabled="true" title="${escapeHtml(reason)}"` : ''}>
          ${row.assist ? OVERLAY_GLYPHS.sparkle : OVERLAY_GLYPHS.chevronRight}
          <span class="overlay-palette-label">${escapeHtml(row.label)}</span>
          <span class="overlay-palette-group">${escapeHtml(off ? reason : row.group)}</span>
        </div>`;
      })
      .join('');
  }

  function run(index: number): void {
    const row = rows[index];
    if (!row) return;
    // A blocked row keeps the palette open: closing it would take the reason away
    // with it, and the creator would be left with nothing but a box that shut.
    if (blocked(row)) return;
    close();
    row.run(options.actions);
  }

  function move(delta: number): void {
    if (rows.length === 0) return;
    active = Math.min(rows.length - 1, Math.max(0, active + delta));
    render();
  }

  function open(): void {
    if (!element.hidden) return;
    if (input) input.value = '';
    active = 0;
    element.hidden = false;
    render();
    active = firstRunnable();
    render();
    input?.focus();
  }

  function close(): void {
    element.hidden = true;
  }

  element.addEventListener('click', (event) => {
    const row = (event.target as Element | null)?.closest<HTMLElement>('[data-palette-row]');
    if (row) run(Number(row.dataset['paletteRow']));
  });
  input?.addEventListener('input', () => {
    active = 0;
    render();
    active = firstRunnable();
    render();
  });
  /*
   * Keys are taken on the input rather than the document so the palette never
   * competes with the page underneath, and stopped there so a product listening
   * for `/` or arrow keys does not act on what is being typed into Lodariq.
   */
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
    else if (event.key === 'ArrowDown') move(1);
    else if (event.key === 'ArrowUp') move(-1);
    else if (event.key === 'Enter') run(active);
    else {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });

  /** ⌘K, and a click anywhere outside. Both owned here: only this knows it is open. */
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (element.hidden) open();
      else close();
      return;
    }
    if (event.key === 'Escape' && !element.hidden) close();
  };
  const onDocumentPointerDown = (event: Event): void => {
    if (!element.hidden && !event.composedPath().includes(element)) close();
  };
  doc.addEventListener('keydown', onDocumentKeyDown);
  doc.addEventListener('pointerdown', onDocumentPointerDown, true);

  return {
    element,
    open,
    close,
    isOpen: () => !element.hidden,
    destroy: () => {
      doc.removeEventListener('keydown', onDocumentKeyDown);
      doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
      element.remove();
    },
  };
}
