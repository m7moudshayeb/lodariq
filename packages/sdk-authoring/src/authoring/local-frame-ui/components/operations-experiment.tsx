import {
  EXPERIMENT_SIGNIFICANCE_THRESHOLD,
  type Experiment,
  type ExperimentArm,
  type ExperimentOverride,
} from '@lodariq/schema';
import { productCapabilityIsImplemented } from '@lodariq/schema/product-capabilities-runtime';
import { useState, type ReactNode } from 'react';
import { authoringText } from '../../../i18n';
import { AuthoringRange, AuthoringSelect, FlaskConical, Gauge, Star } from '../design-system';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { findBlockById } from '../utils';

const EXPERIMENT_DELIVERY_AVAILABLE = productCapabilityIsImplemented('delivery.ab-testing');
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
  const [varies, setVaries] = useState<Experiment['varies']>('copy');

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
          <AuthoringSelect
            ariaLabel={authoringText('What should vary')}
            onValueChange={(value) => setVaries(value as Experiment['varies'])}
            options={EXPERIMENT_VARIATION_OPTIONS}
            value={varies}
          />
          <button
            className="ops-btn"
            data-variant="primary"
            disabled={!EXPERIMENT_DELIVERY_AVAILABLE}
            onClick={() => controller.createExperiment(varies)}
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
  const promoted = experiment.status === 'promoted';
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
            {!promoted ? (
              <button
                className="ops-btn"
                data-size="sm"
                data-variant={running ? undefined : 'primary'}
                disabled={!EXPERIMENT_DELIVERY_AVAILABLE}
                onClick={() => controller.setExperimentStatus(running ? 'stopped' : 'running')}
                title={EXPERIMENT_DELIVERY_AVAILABLE ? undefined : EXPERIMENT_UNAVAILABLE_REASON}
                type="button"
              >
                {running
                  ? authoringText('Stop the experiment')
                  : authoringText('Start the experiment')}
              </button>
            ) : null}
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
                <label className="storyboard-inline-field">
                  <span>{authoringText('Version name')}</span>
                  <textarea
                    defaultValue={arm.label}
                    disabled={experiment.status !== 'draft'}
                    key={`${arm.id}:${arm.label}`}
                    onBlur={(event) =>
                      controller.setExperimentArmLabel(arm.id, event.currentTarget.value.trim())
                    }
                    rows={1}
                  />
                </label>
                <ExperimentOverrideEditor
                  arm={arm}
                  controller={controller}
                  disabled={experiment.status !== 'draft'}
                  snapshot={snapshot}
                />
                <AuthoringRange
                  disabled={!EXPERIMENT_DELIVERY_AVAILABLE || promoted}
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
            disabled={!EXPERIMENT_DELIVERY_AVAILABLE || !conclusive || promoted}
            onClick={() => controller.promoteExperimentWinner()}
            title={promotionButtonTitle(conclusive)}
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
        {experimentSummary(experiment, results?.environmentId)}
      </p>
    </section>
  );
}

/** The creator's word for it, not the stored enum. */
function experimentStatusLabel(status: string): string {
  if (status === 'running') return authoringText('Running');
  if (status === 'stopped') return authoringText('Stopped');
  if (status === 'promoted') return authoringText('Winner in draft');
  return authoringText('Draft');
}

function promotionButtonTitle(conclusive: boolean): string | undefined {
  if (!EXPERIMENT_DELIVERY_AVAILABLE) return EXPERIMENT_UNAVAILABLE_REASON;
  return conclusive ? undefined : authoringText('Wait until one arm is clearly ahead.');
}

const EXPERIMENT_VARIATION_OPTIONS = [
  { value: 'copy', label: authoringText('Copy') },
  { value: 'placement', label: authoringText('Placement') },
  { value: 'style', label: authoringText('Style') },
  { value: 'conditions', label: authoringText('Conditions') },
  { value: 'media', label: authoringText('Media') },
] as const;

function ExperimentOverrideEditor({
  arm,
  controller,
  disabled,
  snapshot,
}: {
  arm: ExperimentArm;
  controller: LocalAuthoringFrameController;
  disabled: boolean;
  snapshot: LocalAuthoringFrameSnapshot;
}): ReactNode {
  const override = arm.overrides?.[0];
  if (!override) {
    return <p className="ops-box-body">{authoringText('Uses the current draft.')}</p>;
  }
  const label = <span>{authoringText('Variant change')}</span>;
  if (override.type === 'copy') {
    const current = findBlockById(snapshot.documentState.blocks, override.blockId)?.content ?? '';
    return (
      <label className="storyboard-inline-field">
        {label}
        <textarea
          defaultValue={override.text || current}
          disabled={disabled}
          key={`${arm.id}:${override.blockId}:${override.text}`}
          onBlur={(event) =>
            controller.setExperimentArmOverride(arm.id, {
              ...override,
              text: event.currentTarget.value,
            })
          }
          rows={3}
        />
      </label>
    );
  }
  if (override.type === 'placement') {
    return (
      <label className="storyboard-inline-field">
        {label}
        <AuthoringSelect
          ariaLabel={authoringText('Variant placement')}
          disabled={disabled}
          onValueChange={(placement) =>
            controller.setExperimentArmOverride(arm.id, {
              ...override,
              placement: placement as typeof override.placement,
            })
          }
          options={PLACEMENT_OPTIONS}
          value={override.placement}
        />
      </label>
    );
  }
  if (override.type === 'style') {
    return (
      <label className="storyboard-inline-field">
        {label}
        <AuthoringSelect
          ariaLabel={authoringText('Variant elevation')}
          disabled={disabled}
          onValueChange={(elevation) =>
            controller.setExperimentArmOverride(arm.id, {
              ...override,
              tooltipStyle: {
                ...override.tooltipStyle,
                elevation: elevation as 'theme' | 'none' | 'resting' | 'floating',
              },
            })
          }
          options={ELEVATION_OPTIONS}
          value={override.tooltipStyle.elevation ?? 'theme'}
        />
      </label>
    );
  }
  if (override.type === 'condition' && override.showWhen.source === 'namedEvent') {
    return (
      <label className="storyboard-inline-field">
        {label}
        <textarea
          defaultValue={override.showWhen.eventName}
          disabled={disabled}
          key={`${arm.id}:${override.blockId}:${override.showWhen.eventName}`}
          onBlur={(event) =>
            updateNamedEventOverride(controller, arm.id, override, event.currentTarget.value)
          }
          rows={1}
        />
      </label>
    );
  }
  if (override.type === 'media') {
    return (
      <label className="storyboard-inline-field">
        {label}
        <AuthoringSelect
          ariaLabel={authoringText('Variant media fit')}
          disabled={disabled}
          onValueChange={(fit) =>
            controller.setExperimentArmOverride(arm.id, {
              ...override,
              media: { ...override.media, fit: fit as 'contain' | 'cover' | 'fill' },
            })
          }
          options={MEDIA_FIT_OPTIONS}
          value={override.media.fit ?? 'contain'}
        />
      </label>
    );
  }
  return <p className="ops-box-body">{authoringText('This condition uses the current rule.')}</p>;
}

const PLACEMENT_OPTIONS = [
  { value: 'top', label: authoringText('Top') },
  { value: 'right', label: authoringText('Right') },
  { value: 'bottom', label: authoringText('Bottom') },
  { value: 'left', label: authoringText('Left') },
] as const;
const ELEVATION_OPTIONS = [
  { value: 'theme', label: authoringText('Theme') },
  { value: 'none', label: authoringText('None') },
  { value: 'resting', label: authoringText('Resting') },
  { value: 'floating', label: authoringText('Floating') },
] as const;
const MEDIA_FIT_OPTIONS = [
  { value: 'contain', label: authoringText('Contain') },
  { value: 'cover', label: authoringText('Cover') },
  { value: 'fill', label: authoringText('Fill') },
] as const;

function updateNamedEventOverride(
  controller: LocalAuthoringFrameController,
  armId: ExperimentArm['id'],
  override: Extract<ExperimentOverride, { type: 'condition' }>,
  value: string,
): void {
  const eventName = value.trim();
  if (!eventName) return;
  controller.setExperimentArmOverride(armId, {
    ...override,
    showWhen: { source: 'namedEvent', eventName },
  });
}

function experimentSummary(experiment: Experiment, environmentId?: string): string {
  if (!EXPERIMENT_DELIVERY_AVAILABLE) return EXPERIMENT_UNAVAILABLE_REASON;
  if (experiment.status === 'promoted') {
    return authoringText('The winner is in the draft. Release it explicitly when ready.');
  }
  return environmentId
    ? authoringText('Results are scoped to {environment}. Allocation revision {revision}.', {
        environment: environmentId,
        revision: experiment.allocationRevision,
      })
    : authoringText(
        'Two arms consume one live-experience slot, not two. Allocation revision {revision}.',
        { revision: experiment.allocationRevision },
      );
}
