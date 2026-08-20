import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { ChartColumn, Eye, Link, Video } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/**
 * WIRE_IFRAME: capture and redaction need a semantic host-page capture bridge.
 * WIRE_BE: reviewed captures and public-link state need document-scoped storage
 * and link issuance. Keep the prototype section visible, but inert, until both
 * sides exist so a status-only click cannot masquerade as a capture.
 */
const DEMO_CAPTURE_AVAILABLE = false;
const DEMO_SHARING_AVAILABLE = false;

/**
 * The same experience, authored once, playing two ways: a guided tour for a real
 * user, and a self-playing demo for a prospect.
 *
 * The demo is a *capture* — but content and capture stay separate objects here,
 * which is the whole difference from the category. Targets bind by accessible
 * name and role, so when the product changes you re-capture the surface and the
 * content re-binds. Drift detection says which captures went stale.
 *
 * Redaction is not optional: a capture serializes an authenticated page, and a
 * link cannot be created until that pass has been made.
 */
export function OperationsShare({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const demo = snapshot.demoLink;
  const capture = snapshot.demoCapture;
  const redactionPending = (capture?.unreviewedRegions ?? 0) > 0;

  return (
    <section className="operations-share" aria-label={authoringText('Share a demo')}>
      {/* The section's opening line is the sheet header's, not a second copy. */}
      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <Video size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('What was recorded')}
            <span className="ops-box-actions">
              <button
                className="ops-btn"
                data-size="sm"
                disabled={!DEMO_CAPTURE_AVAILABLE}
                onClick={() => controller.captureDemoSurface()}
                title={
                  DEMO_CAPTURE_AVAILABLE
                    ? undefined
                    : authoringText('Demo capture and public links are not available yet.')
                }
                type="button"
              >
                {capture ? authoringText('Record it again') : authoringText('Record the flow')}
              </button>
            </span>
          </h3>
          {capture ? (
            <dl className="ops-kv">
              <dt>{authoringText('States captured')}</dt>
              <dd>{capture.stateCount}</dd>
              <dt>{authoringText('Captured')}</dt>
              <dd>{capture.capturedAtLabel}</dd>
              <dt>{authoringText('Out of date')}</dt>
              <dd>
                {capture.staleStepIds.length
                  ? authoringText('{count} steps drifted since capture', {
                      count: capture.staleStepIds.length,
                    })
                  : authoringText('Nothing has drifted')}
              </dd>
            </dl>
          ) : (
            <p className="ops-box-body">
              {authoringText(
                'Walk the flow once. The same pass records the steps and the states they need, so a step inside a menu still has a menu to sit in.',
              )}
            </p>
          )}
        </div>

        {/* Not optional and not last: a capture serializes a signed-in page, so
            the link cannot exist until somebody has looked at what is in it. */}
        <div className="ops-box" data-blocking={redactionPending ? 'true' : 'false'}>
          <h3>
            <Eye size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('What a stranger would see')}
            <span className="ops-box-actions">
              <span className="ops-tag" data-tone={redactionPending ? 'warning' : undefined}>
                {capture
                  ? redactionPending
                    ? authoringText('{count} to check', { count: capture.unreviewedRegions })
                    : authoringText('Checked')
                  : authoringText('Nothing recorded')}
              </span>
            </span>
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'A capture contains whatever was on screen. Every region that looks like customer data must be reviewed before this can be shared.',
            )}
          </p>
          <button
            className="ops-btn"
            data-size="sm"
            disabled={!DEMO_CAPTURE_AVAILABLE || !capture}
            onClick={() => controller.openDemoRedaction()}
            title={
              DEMO_CAPTURE_AVAILABLE
                ? undefined
                : authoringText('Demo capture and public links are not available yet.')
            }
            type="button"
          >
            {authoringText('Review what will be published')}
          </button>
        </div>
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
              disabled={!DEMO_SHARING_AVAILABLE || !capture || redactionPending}
              onClick={() => controller.setDemoLinkEnabled(!demo?.enabled)}
              title={
                DEMO_SHARING_AVAILABLE
                  ? redactionPending
                    ? authoringText('Blocked until the redaction pass is done.')
                    : undefined
                  : authoringText('Demo capture and public links are not available yet.')
              }
              type="button"
            >
              {demo?.enabled ? authoringText('Turn the link off') : authoringText('Create the link')}
            </button>
          </span>
        </h3>
        {demo?.enabled ? (
          <p className="ops-code operations-share-link">{demo.url}</p>
        ) : (
          <p className="ops-box-body">
            {redactionPending
              ? authoringText('Blocked until the redaction pass is done.')
              : authoringText('Nothing is shared yet.')}
          </p>
        )}
      </div>

      {/*
        WIRE_BE: who watched and where they stopped is workspace telemetry keyed
        to a link that cannot be issued yet. Printed because it is the reason to
        send one at all.
      */}
      <div className="ops-box">
        <h3>
          <ChartColumn size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Who watched it')}
        </h3>
        <table className="ops-table">
          <thead>
            <tr>
              <th scope="col">{authoringText('Viewer')}</th>
              <th scope="col">{authoringText('Watched')}</th>
              <th scope="col">{authoringText('Stopped at')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={3}>
                {authoringText('Create the link to start collecting views.')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="ops-callout" data-tone="info" role="status">
        {authoringText('Demo capture and public links are not available yet.')}
      </p>
    </section>
  );
}
