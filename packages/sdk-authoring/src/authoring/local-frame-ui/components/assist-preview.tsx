import { useState } from 'react';
import { authoringText } from '../../../i18n';
import type { AiAssistRequest } from '../../ai/assist-contract';
import { isAiAssistPreviewing, type AiAssistState } from '../../ai/assist-machine';
import type { LocalAuthoringFrameController } from '../controller';
import { Check, LoaderCircle, RotateCcw, Sparkles, X } from '../design-system';

/**
 * The assist loop's one visible surface: **preview → accept / reject / refine /
 * undo** (§7.5). It never applies on arrival, and a batch proposal stops on an
 * explicit confirm with the diff still on screen.
 */
export function AssistPreview({
  controller,
  request,
  state,
}: {
  controller: LocalAuthoringFrameController;
  /** The request to repeat when refining, with the creator's extra instruction. */
  request: AiAssistRequest | null;
  state: AiAssistState;
}) {
  const [refinement, setRefinement] = useState('');

  if (state.phase === 'idle') return null;

  return (
    <section
      aria-label={authoringText('Assist')}
      className="assist-preview"
      data-assist-phase={state.phase}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        controller.cancelAiAssist();
      }}
    >
      {/* Every phase can be walked away from, including one still drafting.
          Reject judges the proposal; this only closes the surface. */}
      <button
        aria-label={authoringText('Close assist')}
        className="assist-preview-close"
        data-assist-action="close"
        onClick={() => controller.cancelAiAssist()}
        title={authoringText('Close assist')}
        type="button"
      >
        <X size={13} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {state.phase === 'working' ? (
        <p aria-busy="true" aria-live="polite" role="status">
          <LoaderCircle className="tour-release-spinner" size={14} aria-hidden="true" />
          {authoringText('Drafting a suggestion…')}
        </p>
      ) : null}

      {state.phase === 'failed' ? (
        <p className="assist-preview-error" role="status">
          {state.error}
        </p>
      ) : null}

      {isAiAssistPreviewing(state) && state.proposal ? (
        <>
          <p className="assist-preview-summary">
            <Sparkles size={14} strokeWidth={2.2} aria-hidden="true" />
            {state.proposal.summary}
          </p>
          <ul className="assist-preview-edits">
            {state.proposal.edits.map((edit) => (
              <li key={edit.path} data-assist-edit={edit.path}>
                <del>{edit.before}</del>
                <ins>{edit.after}</ins>
                {edit.locale ? <small>{edit.locale}</small> : null}
              </li>
            ))}
          </ul>

          {state.phase === 'confirming' ? (
            <p className="assist-preview-confirm" role="status">
              {authoringText('This changes {count} steps. Confirm to apply.', {
                count: state.proposal.edits.length,
              })}
            </p>
          ) : null}

          <div className="assist-preview-actions">
            {state.phase === 'confirming' ? (
              <button
                data-assist-action="confirm"
                onClick={() => controller.confirmAiAssist()}
                type="button"
              >
                <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                {authoringText('Confirm')}
              </button>
            ) : (
              <button
                data-assist-action="accept"
                onClick={() => controller.acceptAiAssist()}
                type="button"
              >
                <Check size={14} strokeWidth={2.4} aria-hidden="true" />
                {authoringText('Accept')}
              </button>
            )}
            <button
              data-assist-action="reject"
              onClick={() => controller.rejectAiAssist()}
              type="button"
            >
              <X size={14} strokeWidth={2.4} aria-hidden="true" />
              {authoringText('Reject')}
            </button>
            {state.history.length > 0 ? (
              <button
                data-assist-action="undo"
                onClick={() => controller.undoAiAssist()}
                type="button"
              >
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                {authoringText('Undo')}
              </button>
            ) : null}
          </div>

          {request ? (
            <form
              className="assist-preview-refine"
              onSubmit={(event) => {
                event.preventDefault();
                const instruction = refinement.trim();
                if (!instruction) return;
                setRefinement('');
                controller.refineAiAssist(refinedRequest(request, instruction));
              }}
            >
              <label>
                <span>{authoringText('Refine')}</span>
                <input
                  data-assist-refine=""
                  onChange={(event) => setRefinement(event.target.value)}
                  placeholder={authoringText('Say what to change…')}
                  value={refinement}
                />
              </label>
            </form>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/**
 * The step-anchored ask (§7.5). One row, anchored to whatever opened it, and it
 * closes on Escape or its ✕ — an always-present chat box is what §7.8 rules out.
 *
 * Opened from the toolbar's Assist control, not from ⌘K: that chord is the host's
 * command palette, and one chord opening two different surfaces depending on
 * where the focus happened to be made the palette unreachable from in here.
 */
export function AssistPrompt({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  return (
    <form
      className="assist-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        const value = prompt.trim();
        if (!value) return;
        setPrompt('');
        onSubmit(value);
      }}
    >
      <label>
        <span>{authoringText('Ask Lodariq')}</span>
        <input
          autoFocus
          data-assist-prompt=""
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
          }}
          placeholder={authoringText('Describe the change for this step…')}
          value={prompt}
        />
      </label>
      <button data-assist-action="ask" type="submit">
        {authoringText('Ask')}
      </button>
      {/* Escape was the only way out, which is no way out for anyone using a mouse. */}
      <button
        aria-label={authoringText('Close assist')}
        className="assist-prompt-close"
        data-assist-action="close-prompt"
        onClick={onClose}
        title={authoringText('Close assist')}
        type="button"
      >
        <X size={13} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </form>
  );
}

/**
 * A refinement is the same anchored request plus an instruction — never a new,
 * wider scope. That is what keeps a refine chain from quietly escaping its step.
 */
function refinedRequest(request: AiAssistRequest, instruction: string): AiAssistRequest {
  if (request.kind === 'command') return { ...request, prompt: instruction };
  if (request.kind === 'rewrite') {
    return { kind: 'command', scope: 'step', prompt: instruction, stepIds: [] };
  }
  if (request.kind === 'draft-step') {
    return { kind: 'command', scope: 'step', prompt: instruction, stepIds: [request.stepId] };
  }
  return { kind: 'command', scope: 'batch', prompt: instruction, stepIds: request.stepIds };
}
