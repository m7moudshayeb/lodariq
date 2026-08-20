import { authoringText } from '../../i18n';
import { escapeHtml } from './html';
import { OVERLAY_GLYPHS } from './icons';

/**
 * The overlay's one modal shell (§10), for the few things that are not about the
 * product and want the middle of the screen — a reference table, a backup, a
 * diagnostic dump. Drawn here rather than in the frame because the frame is
 * content-sized and 720px would need its own presentation mode.
 */
export interface BigModalAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly onSelect: () => void;
}

export interface BigModalModel {
  readonly title: string;
  /** Already-escaped markup: callers build their own tables and paragraphs. */
  readonly bodyHtml: string;
  readonly actions?: readonly BigModalAction[];
}

export interface BigModal {
  readonly element: HTMLElement;
  readonly open: (model: BigModalModel) => void;
  readonly close: () => void;
  readonly isOpen: () => boolean;
}

export function createBigModal(doc: Document): BigModal {
  const scrim = doc.createElement('div');
  scrim.className = 'overlay-big-modal';
  scrim.dataset['protectedChrome'] = 'true';
  scrim.dataset['lodariqAuthoringControl'] = 'true';
  scrim.hidden = true;

  let actions: readonly BigModalAction[] = [];

  const close = (): void => {
    if (scrim.hidden) return;
    scrim.hidden = true;
    scrim.replaceChildren();
    actions = [];
  };

  const open = (model: BigModalModel): void => {
    actions = model.actions ?? [];
    scrim.innerHTML = render(model, actions);
    scrim.hidden = false;
    scrim.querySelector<HTMLButtonElement>('[data-big-modal-close]')?.focus();
  };

  scrim.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Only the scrim itself dismisses; a click inside the sheet is the sheet's.
    if (target === scrim || target.closest('[data-big-modal-close]')) {
      close();
      return;
    }
    const action = target.closest<HTMLElement>('[data-big-modal-action]');
    if (!action) return;
    const index = Number.parseInt(action.dataset['bigModalAction'] ?? '', 10);
    actions[index]?.onSelect();
  });

  // Owned here: the shell would have to track open-ness to route the key.
  doc.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || scrim.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    },
    true,
  );

  return { element: scrim, open, close, isOpen: () => !scrim.hidden };
}

function render(model: BigModalModel, actions: readonly BigModalAction[]): string {
  const footer = actions.length
    ? `<footer class="overlay-big-modal-footer">${actions
        .map(
          (action, index) =>
            `<button type="button" class="overlay-big-modal-button" data-big-modal-action="${index}"${
              action.primary ? ' data-primary="true"' : ''
            }>${escapeHtml(action.label)}</button>`,
        )
        .join('')}</footer>`
    : '';
  return `
    <div class="overlay-big-modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(model.title)}">
      <header class="overlay-big-modal-header">
        <b>${escapeHtml(model.title)}</b>
        <button type="button" class="overlay-big-modal-close" data-big-modal-close
          aria-label="${escapeHtml(authoringText('Close'))}">${OVERLAY_GLYPHS.close}</button>
      </header>
      <div class="overlay-big-modal-body">${model.bodyHtml}</div>
      ${footer}
    </div>
  `;
}
