import { EXPERIMENT_SIGNIFICANCE_THRESHOLD } from '@lodariq/schema';
import type { ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { AuthoringRange, FlaskConical, Gauge, Star } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';

/*
 * WIRE_BE: the control plane does not assign an arm yet.
 * WIRE_RUNTIME: delivery does not resolve `overridesRef` or stamp `armId` on
 * exposures.
 * Keep the promised surface visible and honest until that runtime seam exists.
 */
const EXPERIMENT_DELIVERY_AVAILABLE = false;
const EXPERIMENT_UNAVAILABLE_REASON = authoringText(
  'A/B delivery is not available yet. Existing experiment data remains readable.',
);

/**
 * Two arms of one experience — one live slot, not two. Significance is reported
 * against a declared success event rather than clicks on the experience itself,
 * because "they pressed Next" is not evidence the thing worked.
 */
export function OperationsExperiment({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const experiment = snapshot.experiment;
  const results = snapshot.experimentResults;

  if (!experiment) {
    return (
      <section className="operations-experiment" aria-label={authoringText('A/B testing')}>
        {/* The section's opening line is the sheet header's, not a second copy. */}
        <div className="ops-box">
          <h3>
            <FlaskConical size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('No experiment yet')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'An experiment splits this experience into two versions and reports which one moved the number you care about.',
            )}
          </p>
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!EXPERIMENT_DELIVERY_AVAILABLE}
            onClick={() => controller.createExperiment()}
            title={EXPERIMENT_DELIVERY_AVAILABLE ? undefined : EXPERIMENT_UNAVAILABLE_REASON}
            type="button"
          >
            {authoringText('Set up an experiment')}
          </button>
        </div>
        {!EXPERIMENT_DELIVERY_AVAILABLE ? (
          <p className="ops-callout" data-tone="info" role="status">
            {EXPERIMENT_UNAVAILABLE_REASON}
          </p>
        ) : null}
      </section>
    );
  }

  const confidence = results?.confidencePercent ?? null;
  const conclusive = confidence !== null && confidence >= EXPERIMENT_SIGNIFICANCE_THRESHOLD;
  const running = experiment.status === 'running';
  /* The first arm is the thing being compared against, so every lift below is
     measured from it rather than from the best result so far. */
  const controlRate = results?.arms.find(
    (candidate) => candidate.armId === experiment.arms[0]?.id,
  )?.conversionRate;

  return (
    <section className="operations-experiment" aria-label={authoringText('A/B testing')}>
      <div className="ops-box">
        <h3>
          <FlaskConical size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Experiment')}
          <span className="ops-box-actions">
            <span className="ops-tag" data-tone={running ? 'ok' : undefined}>
              {experimentStatusLabel(experiment.status)}
            </span>
            <button
              className="ops-btn"
              data-size="sm"
              data-variant={running ? undefined : 'primary'}
              disabled={!EXPERIMENT_DELIVERY_AVAILABLE}
              onClick={() => controller.setExperimentStatus(running ? 'stopped' : 'running')}
              title={EXPERIMENT_DELIVERY_AVAILABLE ? undefined : EXPERIMENT_UNAVAILABLE_REASON}
              type="button"
            >
              {running ? authoringText('Stop the experiment') : authoringText('Start the experiment')}
            </button>
          </span>
        </h3>

        <div className="ops-cols" data-cols="2">
          {experiment.arms.map((arm, index) => {
            const armResult = results?.arms.find((candidate) => candidate.armId === arm.id);
            const lift =
              index > 0 && armResult && controlRate !== undefined
                ? (armResult.conversionRate - controlRate) * 100
                : null;
            return (
              <article className="ops-box experiment-arm" key={arm.id}>
                <h3>
                  <span className="ops-tag" data-tone="accent">
                    {authoringText('Arm {id}', { id: arm.id })}
                  </span>
                  {arm.label}
                </h3>
                <AuthoringRange
                  disabled={!EXPERIMENT_DELIVERY_AVAILABLE}
                  label={authoringText('Traffic')}
                  max={90}
                  min={10}
                  onValueChange={(value) => controller.setExperimentArmTraffic(arm.id, value)}
                  step={5}
                  unit="%"
                  value={arm.trafficPercent}
                />
                <dl className="ops-kv experiment-arm-results">
                  <dt>{authoringText('Shown to')}</dt>
                  <dd>{armResult?.exposures ?? 0}</dd>
                  <dt>{authoringText('Converted')}</dt>
                  <dd>
                    {armResult
                      ? authoringText('{percent}%', {
                          percent: (armResult.conversionRate * 100).toFixed(1),
                        })
                      : authoringText('—')}
                  </dd>
                  <dt>{authoringText('Difference')}</dt>
                  <dd>
                    {lift === null
                      ? authoringText('—')
                      : authoringText('{points}pt', {
                          points: `${lift >= 0 ? '+' : ''}${lift.toFixed(1)}`,
                        })}
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>
      </div>

      <div className="ops-cols" data-cols="2">
        <div className="ops-box">
          <h3>
            <Gauge size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('How sure we are')}
          </h3>
          {/* The bar is captioned with its own number, and the sentence beneath
              says what the number means — a meter alone invites a decision the
              data does not support. */}
          <div className="ops-barrow">
            <span>{authoringText('Confidence')}</span>
            <span className="ops-meter">
              <i
                data-tone={conclusive ? 'ok' : 'warning'}
                style={{ width: `${confidence ?? 0}%` }}
              />
            </span>
            <span>
              {confidence === null
                ? authoringText('—')
                : authoringText('{percent}%', { percent: confidence })}
            </span>
          </div>
          <p className="ops-callout" data-tone={conclusive ? 'ok' : 'warning'}>
            {confidence === null
              ? authoringText('Not enough exposures yet to say anything.')
              : conclusive
                ? authoringText('Arm {id} wins at {confidence}% confidence.', {
                    id: results?.leadingArmId ?? '—',
                    confidence,
                  })
                : authoringText('Not yet conclusive — {confidence}% confidence.', { confidence })}
          </p>
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!EXPERIMENT_DELIVERY_AVAILABLE || !conclusive}
            onClick={() => controller.promoteExperimentWinner()}
            title={
              EXPERIMENT_DELIVERY_AVAILABLE
                ? conclusive
                  ? undefined
                  : authoringText('Wait until one arm is clearly ahead.')
                : EXPERIMENT_UNAVAILABLE_REASON
            }
            type="button"
          >
            {authoringText('Promote the winner')}
          </button>
        </div>

        <div className="ops-box">
          <h3>
            <Star size={15} strokeWidth={2} aria-hidden="true" />
            {authoringText('What counts as working')}
          </h3>
          <p className="ops-box-body">
            {authoringText(
              'The experiment is judged on what happened in your product afterwards, not on whether somebody clicked Next.',
            )}
          </p>
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">{authoringText('Event')}</th>
                <th scope="col">{authoringText('Counted within')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="ops-table-key">{experiment.successEventName}</td>
                <td>{authoringText('The window you set when you made it')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="ops-callout" data-tone="info" role="status">
        {!EXPERIMENT_DELIVERY_AVAILABLE
          ? EXPERIMENT_UNAVAILABLE_REASON
          : authoringText('Two arms consume one live-experience slot, not two.')}
      </p>
    </section>
  );
}

/** The creator's word for it, not the stored enum. */
function experimentStatusLabel(status: string): string {
  if (status === 'running') return authoringText('Running');
  if (status === 'stopped') return authoringText('Stopped');
  return authoringText('Draft');
}
