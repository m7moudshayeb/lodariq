import { authoringText } from '../../../i18n';
import type { ConflictChoice, ConflictPrompt } from '../../presence/conflict';
import { Columns2, Check, X } from '../design-system';

/**
 * The choice a creator gets when a write lost compare-and-swap (§15.3).
 *
 * Three things this must never do: report a status code, merge two block trees, or
 * lose the losing side. The message names the person and the property, the options
 * are explicit, and the line under them is a promise the model actually keeps —
 * both versions are saved whichever button is pressed.
 */
export function ConflictChooser({
  onChoose,
  prompt,
}: {
  onChoose: (choice: ConflictChoice) => void;
  prompt: ConflictPrompt;
}) {
  return (
    <section className="conflict-chooser" data-conflict-path={prompt.rejection.path} role="alertdialog">
      <p className="conflict-chooser-message">{prompt.message}</p>
      <div className="conflict-chooser-actions">
        <button type="button" data-conflict-choice="keep-mine" onClick={() => onChoose('keep-mine')}>
          <Check size={14} strokeWidth={2.4} aria-hidden="true" />
          {authoringText('Keep mine')}
        </button>
        <button
          type="button"
          data-conflict-choice="keep-theirs"
          onClick={() => onChoose('keep-theirs')}
        >
          <X size={14} strokeWidth={2.4} aria-hidden="true" />
          {authoringText('Keep theirs')}
        </button>
        <button type="button" data-conflict-choice="open-both" onClick={() => onChoose('open-both')}>
          <Columns2 size={14} strokeWidth={2.1} aria-hidden="true" />
          {authoringText('Open both side by side')}
        </button>
      </div>
      <p className="conflict-chooser-promise">
        {authoringText('Both versions are saved either way. Nothing is merged automatically.')}
      </p>
    </section>
  );
}
