import type { ReactNode } from 'react';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { authoringText } from '../../../i18n';
import { ChartColumn, Eye, Link } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

const DEMO_SHARING_AVAILABLE = productCapabilityIsImplemented('authoring.shareable-demo-links');

/** Artifact-backed sharing; no customer page, DOM, selectors, or coordinates are captured. */
export function OperationsShare({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const demo = snapshot.demoLink;
  const review = snapshot.demoArtifactReview;
  const analytics = snapshot.demoAnalytics;
  const staging = snapshot.panelWorkflow.release?.staging;
  const reviewIsCurrent = Boolean(
    review?.approved &&
    review.publicationId === staging?.publicationId &&
    review.sourceContentHash === staging?.contentHash,
  );

  return (
    <section className="operations-share" aria-label={authoringText('Share a demo')}>
      <div className="ops-cols" data-cols="2">
        <div className="ops-box" data-blocking={reviewIsCurrent ? undefined : 'true'}>
          <h3>
            <Eye size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('Structured artifact review')}
            <span className="ops-box-actions">
              <span className="ops-tag" data-tone={reviewIsCurrent ? undefined : 'warning'}>
                {reviewIsCurrent ? authoringText('Approved') : authoringText('Review required')}
              </span>
            </span>
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'The server creates a targetless presentation from the immutable staging artifact. Product targets, lifecycle actions, external links, audience rules, raw DOM, CSS, selectors, and coordinates are excluded.',
            )}
          </p>
          <button
            className="ops-btn"
            data-size="sm"
            disabled={!DEMO_SHARING_AVAILABLE || !staging?.publicationId || !staging.contentHash}
            onClick={() => controller.reviewDemoArtifact()}
            type="button"
          >
            {reviewIsCurrent ? authoringText('Review again') : authoringText('Review artifact')}
          </button>
        </div>

        <div className="ops-box">
          <h3>
            <Link size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('The link you send')}
            <span className="ops-box-actions">
              <button
                className="ops-btn"
                data-size="sm"
                data-variant={demo?.enabled ? undefined : 'primary'}
                disabled={!DEMO_SHARING_AVAILABLE || (!demo?.enabled && !reviewIsCurrent)}
                onClick={() => controller.setDemoLinkEnabled(!demo?.enabled)}
                type="button"
              >
                {demo?.enabled
                  ? authoringText('Turn the link off')
                  : authoringText('Create the link')}
              </button>
            </span>
          </h3>
          {demo?.enabled ? (
            <p className="ops-code operations-share-link">{demo.url}</p>
          ) : (
            <p className="ops-box-body">
              {reviewIsCurrent
                ? authoringText('The reviewed artifact is ready for a time-limited link.')
                : authoringText('Nothing is shared yet.')}
            </p>
          )}
        </div>
      </div>

      {review ? (
        <div className="ops-box">
          <h3>{authoringText('Review evidence')}</h3>
          <dl className="ops-kv">
            <dt>{authoringText('Policy version')}</dt>
            <dd>{review.policyVersion}</dd>
            <dt>{authoringText('Target bindings removed')}</dt>
            <dd>{review.summary.targetBindingsRemoved}</dd>
            <dt>{authoringText('Product actions replaced')}</dt>
            <dd>{review.summary.unsafeActionsReplaced}</dd>
            <dt>{authoringText('External links removed')}</dt>
            <dd>{review.summary.externalLinksRemoved}</dd>
            <dt>{authoringText('Audience rules removed')}</dt>
            <dd>{review.summary.audienceRulesRemoved}</dd>
          </dl>
        </div>
      ) : null}

      <div className="ops-box">
        <h3>
          <ChartColumn size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Anonymous demo activity')}
        </h3>
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">{authoringText('Views')}</th>
              <th scope="col">{authoringText('Completed')}</th>
              <th scope="col">{authoringText('Last step')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{analytics?.views ?? 0}</td>
              <td>{analytics?.completions ?? 0}</td>
              <td>
                {analytics?.lastStepIds?.[analytics.lastStepIds.length - 1] ??
                  authoringText('No visits yet')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="ops-callout" data-tone="info" role="status">
        {demo?.enabled
          ? authoringText(
              'Views are anonymous and scoped to this demo link. The active publication is never mutated.',
            )
          : authoringText(
              'Publish to staging, review the structured artifact, then create a time-limited demo link.',
            )}
      </p>
    </section>
  );
}
