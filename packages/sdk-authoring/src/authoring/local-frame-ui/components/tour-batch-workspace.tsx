import { authoringText } from '../../../i18n';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { Check } from '../design-system';
import { stepHealth, stepTooltip } from '../tour-step-model';
import { blockDisplayTitle, targetIdOf, targetLabelOf } from '../utils';

export function TourBatchWorkspace({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}) {
  const selectedSteps = steps.filter((step) => snapshot.selectedStepIds.has(step.id));

  return (
    <section className="tour-batch-workspace" aria-label={authoringText('Batch edit')}>
      <header className="tour-batch-workspace-heading">
        <span>
          <small>{authoringText('Batch edit')}</small>
          <strong>
            {authoringText('{count} steps selected', { count: selectedSteps.length })}
          </strong>
        </span>
        <p className="visually-hidden">
          {authoringText(
            'Review the selected steps before applying shared placement, timing, style, or structure changes.',
          )}
        </p>
      </header>
      <div className="tour-batch-card-grid">
        {selectedSteps.map((step) => (
          <TourBatchCard
            controller={controller}
            key={step.id}
            snapshot={snapshot}
            step={step}
            stepIndex={steps.findIndex((candidate) => candidate.id === step.id)}
          />
        ))}
      </div>
    </section>
  );
}

function TourBatchCard({
  controller,
  snapshot,
  step,
  stepIndex,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
}) {
  const tooltip = stepTooltip(step);
  const targetId = targetIdOf(step);
  const target = targetId
    ? targetLabelOf(snapshot.documentState, targetId)
    : authoringText('No target selected');
  const placement = tooltip?.props.placement ?? 'bottom';
  const health = stepHealth(step, snapshot);

  return (
    <article className="tour-batch-card" data-health={health.tone}>
      <button
        className="tour-batch-card-open"
        onClick={() => controller.activateTourStep(step.id)}
        type="button"
      >
        <span className="tour-batch-card-title">
          <span className="tour-batch-card-number">{stepIndex + 1}</span>
          <strong>{blockDisplayTitle(step)}</strong>
          <Check size={14} strokeWidth={2.4} aria-hidden="true" />
        </span>
        <span className="tour-batch-card-facts">
          <span>
            <small>{authoringText('Target')}</small>
            <strong>{target}</strong>
          </span>
          <span>
            <small>{authoringText('Popup position')}</small>
            <strong>{placementLabel(placement)}</strong>
          </span>
        </span>
      </button>
    </article>
  );
}

function placementLabel(placement: string): string {
  if (placement === 'top') return authoringText('Above');
  if (placement === 'right') return authoringText('Right');
  if (placement === 'left') return authoringText('Left');
  return authoringText('Below');
}
