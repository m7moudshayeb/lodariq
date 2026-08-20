import type { LodariqBlock } from '@lodariq/schema';
import { useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { Lock, MessageSquare, SendHorizontal, Users } from '../design-system';
import { blockDisplayTitle } from '../utils';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/**
 * Not real-time co-editing (§15.1). Three layers instead: presence so people can
 * see each other, step-level locks so they cannot collide, and comments anchored
 * to a step so review stops happening in Slack.
 */
export function OperationsCollaboration({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}): ReactNode {
  const [draft, setDraft] = useState('');
  const peers = snapshot.presence?.peers ?? [];
  const comments = snapshot.comments ?? [];
  const activeStepId = snapshot.activeStepId;

  return (
    <section className="operations-collaboration" aria-label={authoringText('Collaboration')}>
      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <Users size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Who is here')}
          </h3>
          {peers.length ? (
            <ul className="ops-list presence-list">
              {peers.map((peer) => {
                const step = steps.find((candidate) => candidate.id === peer.stepId);
                return (
                  <li key={peer.id}>
                    <span className="presence-person">
                      {/* Initials, not a colour alone: the hue only supports the
                          identity the letters already carry (§15.2). */}
                      <span aria-hidden="true" className="presence-avatar">
                        {initials(peer.name)}
                      </span>
                      <span>
                        {peer.name}
                        <small className="ops-list-meta">
                          {step
                            ? authoringText('On {step}', { step: blockDisplayTitle(step) })
                            : authoringText('Elsewhere in this experience')}
                          {peer.holdsLock ? ` · ${authoringText('holds the lock')}` : ''}
                        </small>
                      </span>
                    </span>
                    <span className="ops-row">
                      {peer.holdsLock ? (
                        <button
                          className="ops-btn"
                          data-size="sm"
                          onClick={() => controller.requestStepLock(peer.stepId)}
                          type="button"
                        >
                          {authoringText('Ask for it')}
                        </button>
                      ) : null}
                      <button
                        className="ops-btn"
                        data-size="sm"
                        onClick={() => controller.activateTourStep(peer.stepId)}
                        type="button"
                      >
                        {authoringText('Go there')}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="ops-box-body">
              {authoringText('Nobody else is in this experience right now.')}
            </p>
          )}
          <p className="ops-box-body operations-collaboration-hint">
            {authoringText(
              'A lock heartbeats every 90 seconds. If it lapses, the next edit goes through the conflict chooser rather than overwriting.',
            )}
          </p>
        </div>

        {/*
          Layer two of §15.1, and the only one that answers "why can I not edit
          this?". Presence says who is around; this says what they are holding.

          The lock is enforced, not just stated: `panel.ts` runs the same
          `stepEditability` decision before it accepts a frame patch and refuses
          with the holder's name. This table is the readable version of it.
        */}
        <div className="ops-box">
          <h3>
            <Lock size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Who is holding what')}
          </h3>
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{authoringText('Step')}</th>
                <th scope="col">{authoringText('Held by')}</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => {
                const holder = peers.find(
                  (peer) => peer.holdsLock && peer.stepId === step.id,
                );
                return (
                  <tr key={step.id}>
                    <td className="ops-table-key">
                      {index + 1}. {blockDisplayTitle(step)}
                    </td>
                    <td>
                      {holder ? (
                        <span className="ops-tag" data-tone="peer">
                          {holder.name}
                        </span>
                      ) : (
                        <span className="operations-collaboration-free">
                          {authoringText('Yours to edit')}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {steps.length === 0 ? (
                <tr>
                  <td colSpan={2}>{authoringText('Add a step from the filmstrip')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ops-box">
        <h3>
          <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Comments')}
          <span className="ops-box-actions">
            <span className="ops-tag">
              {authoringText(
                openCommentCount(comments) === 1 ? '{count} open' : '{count} open',
                { count: openCommentCount(comments) },
              )}
            </span>
          </span>
        </h3>
        {comments.length ? (
          <ul className="ops-list comment-threads">
            {comments.map((comment) => {
              const step = steps.find((candidate) => candidate.id === comment.stepId);
              return (
                <li key={comment.id} data-resolved={comment.resolved ? 'true' : 'false'}>
                  <span className="comment-thread">
                    <span className="comment-thread-head">
                      <span className="ops-tag">
                        {step ? blockDisplayTitle(step) : authoringText('This experience')}
                      </span>
                      {comment.resolved ? (
                        <span className="ops-tag" data-tone="ok">
                          {authoringText('Resolved')}
                        </span>
                      ) : null}
                    </span>
                    <span className="comment-author">
                      <span aria-hidden="true" className="presence-avatar">
                        {initials(comment.author)}
                      </span>
                      {comment.author}
                    </span>
                    <span className="comment-body">{comment.body}</span>
                  </span>
                  <span className="ops-row">
                    <button
                      className="ops-btn"
                      data-size="sm"
                      onClick={() => controller.activateTourStep(comment.stepId)}
                      type="button"
                    >
                      {authoringText('Take me there')}
                    </button>
                    <button
                      className="ops-btn"
                      data-size="sm"
                      onClick={() => controller.resolveComment(comment.id, !comment.resolved)}
                      type="button"
                    >
                      {comment.resolved ? authoringText('Reopen') : authoringText('Resolve')}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ops-box-body">{authoringText('No comments yet.')}</p>
        )}
        <form
          className="comment-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim() || !activeStepId) return;
            controller.addComment(activeStepId, draft.trim());
            setDraft('');
          }}
        >
          <label>
            <span>{authoringText('Comment on the step you have open')}</span>
            <textarea onChange={(event) => setDraft(event.target.value)} rows={2} value={draft} />
          </label>
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!draft.trim() || !activeStepId}
            title={activeStepId ? undefined : authoringText('Open a step to comment on it.')}
            type="submit"
          >
            <SendHorizontal size={13} strokeWidth={2} aria-hidden="true" />
            {authoringText('Post')}
          </button>
        </form>
      </div>
    </section>
  );
}

/** Two letters, so a face is identifiable before its colour is. */
function initials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function openCommentCount(comments: readonly { resolved: boolean }[]): number {
  return comments.filter((comment) => !comment.resolved).length;
}
