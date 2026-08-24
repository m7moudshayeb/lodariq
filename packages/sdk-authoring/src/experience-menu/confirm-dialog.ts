/**
 * A confirm for changes that look destructive and are not.
 *
 * Written for the experience-type switch (§5), which was five bare rows in a
 * hover menu. Choosing one re-filters the canvas by the new type's root blocks,
 * so a Tour converted to an Announcement renders nothing at all — every step
 * still saved, still undoable, and completely gone from the screen. That is a
 * fine thing to allow and a terrible thing to do silently.
 */
import { EXPERIENCE_MENU_COPY } from './copy';

let confirmSequence = 0;

export interface ConfirmDialogOptions {
  readonly doc: Document;
  readonly container: HTMLElement | ShadowRoot;
  readonly title: string;
  /** The consequence, in the creator's terms. Never "Are you sure?". */
  readonly body: string;
  readonly confirmLabel: string;
  readonly returnFocusTo?: HTMLElement | null;
}

export function confirmExperienceChange(options: ConfirmDialogOptions): Promise<boolean> {
  const { doc } = options;

  const scrim = doc.createElement('div');
  scrim.dataset['lodariqExperienceDialogScrim'] = 'true';
  scrim.dataset['protectedChrome'] = 'true';
  scrim.dataset['lodariqAuthoringControl'] = 'true';

  const dialog = doc.createElement('div');
  dialog.className = 'lodariq-experience-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  confirmSequence += 1;
  const headingId = `lodariq-experience-confirm-${confirmSequence.toString(36)}`;
  const header = doc.createElement('header');
  const heading = doc.createElement('strong');
  heading.id = headingId;
  heading.textContent = options.title;
  const body = doc.createElement('span');
  body.textContent = options.body;
  header.append(heading, body);
  dialog.setAttribute('aria-labelledby', headingId);

  const footer = doc.createElement('footer');
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.textContent = EXPERIENCE_MENU_COPY.cancel;
  const confirm = doc.createElement('button');
  confirm.type = 'button';
  confirm.dataset['lodariqExperienceDialogConfirm'] = 'true';
  confirm.textContent = options.confirmLabel;
  footer.append(cancel, confirm);

  dialog.append(header, footer);
  scrim.appendChild(dialog);

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      doc.removeEventListener('keydown', onKeyDown, true);
      scrim.remove();
      options.returnFocusTo?.focus();
      resolve(value);
    };

    function onKeyDown(event: KeyboardEvent): void {
      if (!event.composedPath().includes(dialog)) {
        if (event.key === 'Tab') {
          event.preventDefault();
          cancel.focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }

    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    scrim.addEventListener('pointerdown', (event) => {
      if (event.target === scrim) {
        event.preventDefault();
        cancel.focus();
      }
    });
    doc.addEventListener('keydown', onKeyDown, true);

    options.container.appendChild(scrim);
    // Cancel takes focus, not confirm: the safe answer should be the one a
    // reflexive Enter gives.
    cancel.focus();
  });
}
