/**
 * The name step between choosing a type and the experience existing (§10).
 *
 * A modal rather than a popover, for one reason: the type has already been
 * chosen by the time this opens, and a popover that dismisses on an outside
 * click would throw that choice away without saying so. This one has two exits
 * and both are named.
 */
import { EXPERIENCE_MENU_COPY } from './copy';

let dialogSequence = 0;

export interface ExperienceNameDialogOptions {
  readonly doc: Document;
  readonly container: HTMLElement | ShadowRoot;
  readonly title: string;
  readonly hint?: string;
  readonly initialValue: string;
  readonly confirmLabel: string;
  /** Returning to it on cancel is the whole point of remembering it. */
  readonly returnFocusTo?: HTMLElement | null;
}

/**
 * Resolves with the trimmed name, or null when the creator backed out.
 *
 * The caller does the creating: this collects an answer and nothing else, so a
 * failed create can leave the dialog closed and report through the host's own
 * error channel rather than inventing a second one.
 */
export function askForExperienceName(options: ExperienceNameDialogOptions): Promise<string | null> {
  const { doc } = options;

  const scrim = doc.createElement('div');
  scrim.dataset['lodariqExperienceDialogScrim'] = 'true';
  scrim.dataset['protectedChrome'] = 'true';
  scrim.dataset['lodariqAuthoringControl'] = 'true';

  const dialog = doc.createElement('div');
  dialog.className = 'lodariq-experience-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const header = doc.createElement('header');
  const heading = doc.createElement('strong');
  heading.textContent = options.title;
  header.appendChild(heading);
  if (options.hint) {
    const hint = doc.createElement('span');
    hint.textContent = options.hint;
    header.appendChild(hint);
  }

  const label = doc.createElement('label');
  label.append(doc.createTextNode(EXPERIENCE_MENU_COPY.nameLabel));
  const input = doc.createElement('input');
  input.type = 'text';
  input.value = options.initialValue;
  input.autocomplete = 'off';
  input.spellcheck = false;
  label.appendChild(input);

  const error = doc.createElement('p');
  error.className = 'lodariq-experience-dialog-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const footer = doc.createElement('footer');
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.textContent = EXPERIENCE_MENU_COPY.cancel;
  const confirm = doc.createElement('button');
  confirm.type = 'button';
  confirm.dataset['lodariqExperienceDialogConfirm'] = 'true';
  confirm.textContent = options.confirmLabel;
  footer.append(cancel, confirm);

  dialog.append(header, label, error, footer);
  scrim.appendChild(dialog);

  // Labelled by its own heading, so a screen reader announces what is being named.
  dialogSequence += 1;
  const headingId = `lodariq-experience-dialog-${dialogSequence.toString(36)}`;
  heading.id = headingId;
  dialog.setAttribute('aria-labelledby', headingId);

  return new Promise<string | null>((resolve) => {
    let settled = false;

    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      doc.removeEventListener('keydown', onKeyDown, true);
      scrim.remove();
      options.returnFocusTo?.focus();
      resolve(value);
    };

    const submit = (): void => {
      const value = input.value.trim();
      if (!value) {
        error.textContent = EXPERIENCE_MENU_COPY.nameRequired;
        error.hidden = false;
        input.focus();
        return;
      }
      finish(value);
    };

    /*
     * Captured on the document: the dialog may be mounted in a shadow root, and
     * a bubbling listener on the dialog itself would still let the customer's
     * page see the keystroke first.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.composedPath().includes(dialog)) {
        // Focus escaped the dialog — a modal has to pull it back rather than let
        // Tab walk into the page behind the scrim.
        if (event.key === 'Tab') {
          event.preventDefault();
          input.focus();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
        return;
      }
      if (event.key === 'Enter' && event.target === input) {
        event.preventDefault();
        submit();
      }
    }

    cancel.addEventListener('click', () => finish(null));
    confirm.addEventListener('click', submit);
    scrim.addEventListener('pointerdown', (event) => {
      // The scrim itself is not an exit. Clicking it flashes the dialog instead,
      // so the two named exits stay the only ones.
      if (event.target === scrim) {
        event.preventDefault();
        input.focus();
      }
    });
    input.addEventListener('input', () => {
      error.hidden = true;
    });
    doc.addEventListener('keydown', onKeyDown, true);

    options.container.appendChild(scrim);
    input.focus();
    input.select();
  });
}
