import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { Check, Circle, RotateCcw } from '../design-system';

export function OperationsRecord({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const recording = snapshot.recordToAuthor;
  const proposal = recording?.proposal;

  return (
    <section className="operations-record" aria-label={authoringText('Record to author')}>
      <div className="ops-box">
        <h3>
          <Circle size={15} strokeWidth={2} aria-hidden="true" />
          {recording?.recording
            ? authoringText('Recording semantic evidence')
            : authoringText('Record a flow, then author it')}
        </h3>
        <p className="ops-box-body">
          {authoringText(
            'This recorder keeps semantic target names, roles, and bounded lifecycle states only. It never stores coordinates, selectors, page HTML, or customer values.',
          )}
        </p>
        <div className="ops-row">
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={Boolean(recording?.recording)}
            onClick={() => controller.startRecordToAuthor()}
            type="button"
          >
            {authoringText('Start recording')}
          </button>
          <button
            className="ops-btn"
            disabled={!recording?.recording}
            onClick={() => controller.stopRecordToAuthor()}
            type="button"
          >
            {authoringText('Stop and prepare review')}
          </button>
          <button
            className="ops-btn"
            disabled={!recording?.actionCount && !proposal}
            onClick={() => controller.clearRecordToAuthor()}
            type="button"
          >
            <RotateCcw size={13} strokeWidth={2} aria-hidden="true" />
            {authoringText('Clear')}
          </button>
        </div>
        <dl className="ops-kv">
          <dt>{authoringText('Semantic actions')}</dt>
          <dd>{recording?.actionCount ?? 0}</dd>
          <dt>{authoringText('Proposed steps')}</dt>
          <dd>{recording?.segmentCount ?? 0}</dd>
        </dl>
      </div>

      {proposal ? (
        <div className="ops-box" data-record-proposal="true">
          <h3>
            <Check size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Review the recorded flow')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'The proposal is evidence-bound and review-required. Adding it preserves available semantic target bindings and bounded lifecycle recipes; unresolved evidence stays visible for manual repair.',
            )}
          </p>
          <ol className="ops-list">
            {proposal.segments.map((segment) => (
              <li key={segment.segmentId}>
                <span>
                  <strong>{segment.proposedTitle}</strong>
                  <span className="ops-list-meta">{segment.proposedCopy}</span>
                </span>
                <span className="ops-tag">{segment.actionIndexes.length} actions</span>
              </li>
            ))}
          </ol>
          <button
            className="ops-btn"
            data-variant="primary"
            onClick={() => controller.applyRecordToAuthorProposal(proposal)}
            type="button"
          >
            {authoringText('Add reviewed flow to draft')}
          </button>
        </div>
      ) : (
        <p className="ops-callout" data-tone="info" role="status">
          {authoringText(
            'Start a recording, interact with the page through the semantic picker, then stop to review the proposed flow.',
          )}
        </p>
      )}
    </section>
  );
}
