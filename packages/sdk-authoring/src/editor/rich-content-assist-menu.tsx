import type { ReactElement } from 'react';
import { AI_REWRITE_VERBS, type AiRewriteVerb } from '../authoring/ai/assist-contract';
import { authoringText } from '../i18n';

/**
 * The `AI` toolbar control's verb list (§7.4). Scoped to the selection, never the
 * document — that scope is what keeps this from becoming an unanchored chat box.
 *
 * Presentational on purpose: the caller owns the selection and the request, so
 * this file stays free of Lexical and of the assist state machine.
 */
export function AssistVerbMenu({
  onPick,
  onAsk,
}: {
  onPick: (verb: AiRewriteVerb) => void;
  /** Opens the free-form prompt (`⌘K`), the §7.5 surface. */
  onAsk?: () => void;
}): ReactElement {
  return (
    <div className="rich-content-menu rich-content-assist-menu">
      {AI_REWRITE_VERBS.map((verb) => (
        <button
          key={verb}
          data-assist-verb={verb}
          onClick={() => onPick(verb)}
          onPointerDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          {ASSIST_VERB_LABELS[verb]}
        </button>
      ))}
      {onAsk ? (
        <>
          <span className="rich-content-menu-divider" aria-hidden="true" />
          <button
            data-assist-verb="ask"
            onClick={onAsk}
            onPointerDown={(event) => event.preventDefault()}
            role="menuitem"
            type="button"
          >
            {authoringText('Ask Lodariq…')}
          </button>
        </>
      ) : null}
    </div>
  );
}

export const ASSIST_VERB_LABELS: Record<AiRewriteVerb, string> = {
  shorter: authoringText('Shorter'),
  clearer: authoringText('Clearer'),
  'more-formal': authoringText('More formal'),
  friendlier: authoringText('Friendlier'),
  'fix-grammar': authoringText('Fix grammar'),
};
