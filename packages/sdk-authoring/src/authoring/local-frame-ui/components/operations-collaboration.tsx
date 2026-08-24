import type { ExperienceCommentAnchor, LodariqBlock, LodariqDocument } from '@lodariq/schema';
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
  const [anchorType, setAnchorType] = useState<'step' | 'target'>('step');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const peers = snapshot.presence?.peers ?? [];
  const comments = snapshot.comments ?? [];
  const activeStepId = snapshot.activeStepId;
  const activeStep = steps.find((candidate) => candidate.id === activeStepId);
  const activeTargetId = activeStep ? firstBlockTargetId(activeStep) : undefined;
  const features = snapshot.commercialUsage?.features;
  const locksEnabled = !features || features.includes('step-locks');
  const commentsEnabled = !features || features.includes('comments');

  return (
    <section className="operations-collaboration" aria-label={authoringText('Collaboration')}>
      {snapshot.presence?.connection === 'reconnecting' ? (
        <p className="ops-callout" role="status">
          {authoringText('Reconnecting collaboration…')}
        </p>
      ) : null}
      {snapshot.presence?.draftChanged ? (
        <p className="ops-callout" data-tone="warning" role="alert">
          {authoringText('The draft changed in another authoring session. Review before saving.')}
        </p>
      ) : null}
      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <Users size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Who is here')}
          </h3>
          {peers.length ? (
            <ul className="ops-list presence-list">
              {peers.map((peer) => {
                const stepId = peer.stepId;
                const step = steps.find((candidate) => candidate.id === stepId);
                return (
                  <li key={peer.id}>
                    <span className="presence-person">
                      {/* Initials, not a colour alone: the hue only supports the
                          identity the letters already carry (§15.2). */}
                      <span aria-hidden="true" className="presence-avatar">
                        {initials(peer.name)}
                      </span>
                      <span>
                        {peer.sameCreator ? authoringText('You · another tab') : peer.name}
                        <small className="ops-list-meta">
                          {step
                            ? authoringText('On {step}', { step: blockDisplayTitle(step) })
                            : authoringText('Elsewhere in this experience')}
                          {peer.selection
                            ? ` · ${authoringText('Selecting {selection}', {
                                selection: presenceSelectionLabel(
                                  peer.selection,
                                  snapshot.documentState,
                                ),
                              })}`
                            : ''}
                          {peer.holdsLock ? ` · ${authoringText('holds the lock')}` : ''}
                        </small>
                      </span>
                    </span>
                    <span className="ops-row">
                      {peer.holdsLock && stepId ? (
                        <button
                          className="ops-btn"
                          data-size="sm"
                          disabled={!locksEnabled}
                          onClick={() => controller.requestStepLock(stepId)}
                          title={commercialFeatureTitle(locksEnabled)}
                          type="button"
                        >
                          {authoringText('Ask for it')}
                        </button>
                      ) : null}
                      {peer.canTakeover && stepId ? (
                        <button
                          className="ops-btn"
                          data-size="sm"
                          disabled={!locksEnabled}
                          onClick={() => controller.takeOverStepLock(stepId)}
                          title={commercialFeatureTitle(locksEnabled)}
                          type="button"
                        >
                          {authoringText('Take over')}
                        </button>
                      ) : null}
                      {stepId ? (
                        <button
                          className="ops-btn"
                          data-size="sm"
                          onClick={() => controller.activateTourStep(stepId)}
                          type="button"
                        >
                          {authoringText('Go there')}
                        </button>
                      ) : null}
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
                const holder = peers.find((peer) => peer.holdsLock && peer.stepId === step.id);
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
              {authoringText(openCommentCount(comments) === 1 ? '{count} open' : '{count} open', {
                count: openCommentCount(comments),
              })}
            </span>
          </span>
        </h3>
        {comments.length ? (
          <ul className="ops-list comment-threads">
            {comments.map((comment) => {
              const submitReply = (): void => {
                if (!replyDraft.trim()) return;
                controller.replyToComment(comment.id, replyDraft.trim());
                setReplyDraft('');
                setReplyingTo(null);
              };
              return (
                <li key={comment.id} data-resolved={comment.resolved ? 'true' : 'false'}>
                  <div className="comment-thread">
                    <span className="comment-thread-head">
                      <span className="ops-tag">
                        {commentAnchorLabel(comment.anchor, steps, snapshot.documentState.targets)}
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
                    {comment.replies.length ? (
                      <ul className="comment-replies" aria-label={authoringText('Replies')}>
                        {comment.replies.map((reply) => (
                          <li key={reply.id}>
                            <span className="comment-author">
                              <span aria-hidden="true" className="presence-avatar">
                                {initials(reply.author)}
                              </span>
                              {reply.author}
                            </span>
                            <span className="comment-body">{reply.body}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {replyingTo === comment.id ? (
                      <form
                        className="comment-reply-composer"
                        onSubmit={(event) => {
                          event.preventDefault();
                          submitReply();
                        }}
                      >
                        <textarea
                          aria-label={authoringText('Reply to {author}', {
                            author: comment.author,
                          })}
                          autoFocus
                          disabled={!commentsEnabled}
                          onChange={(event) => setReplyDraft(event.target.value)}
                          rows={2}
                          value={replyDraft}
                        />
                        <span className="ops-row">
                          <button
                            className="ops-btn"
                            data-size="sm"
                            disabled={!commentsEnabled || !replyDraft.trim()}
                            onClick={submitReply}
                            title={commercialFeatureTitle(commentsEnabled)}
                            type="button"
                          >
                            {authoringText('Reply')}
                          </button>
                          <button
                            className="ops-btn"
                            data-size="sm"
                            onClick={() => {
                              setReplyDraft('');
                              setReplyingTo(null);
                            }}
                            type="button"
                          >
                            {authoringText('Cancel')}
                          </button>
                        </span>
                      </form>
                    ) : null}
                  </div>
                  <span className="ops-row">
                    <button
                      className="ops-btn"
                      data-size="sm"
                      onClick={() => controller.activateTourStep(comment.anchor.stepId)}
                      type="button"
                    >
                      {authoringText('Take me there')}
                    </button>
                    <button
                      className="ops-btn"
                      data-size="sm"
                      disabled={!commentsEnabled}
                      onClick={() => {
                        setReplyDraft('');
                        setReplyingTo(comment.id);
                      }}
                      title={commercialFeatureTitle(commentsEnabled)}
                      type="button"
                    >
                      {authoringText('Reply')}
                    </button>
                    <button
                      className="ops-btn"
                      data-size="sm"
                      disabled={!commentsEnabled}
                      onClick={() => controller.resolveComment(comment.id, !comment.resolved)}
                      title={commercialFeatureTitle(commentsEnabled)}
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
            controller.addComment(
              anchorType === 'target' && activeTargetId
                ? { type: 'target', stepId: activeStepId, targetId: activeTargetId }
                : { type: 'step', stepId: activeStepId },
              draft.trim(),
            );
            setDraft('');
          }}
        >
          {activeTargetId ? (
            <label>
              <span>{authoringText('Comment on')}</span>
              <select
                disabled={!commentsEnabled}
                onChange={(event) => setAnchorType(event.target.value as 'step' | 'target')}
                value={anchorType}
              >
                <option value="step">{authoringText('This step')}</option>
                <option value="target">{authoringText('Its target')}</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>{authoringText('Comment on the step you have open')}</span>
            <textarea
              disabled={!commentsEnabled}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              value={draft}
            />
          </label>
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!commentsEnabled || !draft.trim() || !activeStepId}
            title={commentComposerTitle(commentsEnabled, activeStepId)}
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

function commercialFeatureTitle(enabled: boolean): string | undefined {
  return enabled
    ? undefined
    : authoringText('This tool is not included in the current workspace plan.');
}

function commentComposerTitle(
  commentsEnabled: boolean,
  activeStepId: string | null | undefined,
): string | undefined {
  if (!commentsEnabled) return commercialFeatureTitle(false);
  return activeStepId ? undefined : authoringText('Open a step to comment on it.');
}

function commentAnchorLabel(
  anchor: ExperienceCommentAnchor,
  steps: readonly LodariqBlock[],
  targets: LodariqDocument['targets'],
): string {
  const step = steps.find((candidate) => candidate.id === anchor.stepId);
  if (anchor.type === 'step') {
    return step ? blockDisplayTitle(step) : authoringText('This experience');
  }
  const target = targets.find((candidate) => candidate.id === anchor.targetId);
  const targetLabel = target?.identity?.display.authorLabel;
  if (targetLabel) return authoringText('Target · {target}', { target: targetLabel });
  if (step) return authoringText('Target · {target}', { target: blockDisplayTitle(step) });
  return authoringText('Selected target');
}

function firstBlockTargetId(block: LodariqBlock): string | undefined {
  if (block.props.targetId) return block.props.targetId;
  for (const child of block.children) {
    const targetId = firstBlockTargetId(child);
    if (targetId) return targetId;
  }
  return undefined;
}

function presenceSelectionLabel(
  selection: NonNullable<LocalAuthoringFrameSnapshot['presence']>['peers'][number]['selection'],
  document: LodariqDocument,
): string {
  if (!selection) return authoringText('This experience');
  if (selection.type === 'target') {
    return (
      document.targets.find((target) => target.id === selection.targetId)?.identity?.display
        .authorLabel ?? authoringText('Selected target')
    );
  }
  const block = findBlock(document.blocks, selection.blockId);
  return block ? blockDisplayTitle(block) : authoringText('This experience');
}

function findBlock(blocks: readonly LodariqBlock[], blockId: string): LodariqBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = findBlock(block.children, blockId);
    if (child) return child;
  }
  return null;
}
