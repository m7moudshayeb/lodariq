import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { ChevronRight, MousePointer2 } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { targetIdOf, targetLabelOf } from '../utils';
import {
  stepHealth,
  stepPlacementFact,
  stepTooltip,
  targetActionLabelFor,
} from '../tour-step-model';
import { TargetControls } from './target-controls';
import { TOOLTIP_POSITION_OPTIONS } from './tour-sequence-options';

export function StepPlacementEditor({
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
  const health = stepHealth(step, snapshot);
  const targetId = targetIdOf(step);
  const targetLabel = targetId
    ? targetLabelOf(snapshot.documentState, targetId)
    : authoringText('Choose where this step appears');
  const targetActionLabel = targetActionLabelFor(health.repair, Boolean(targetId));
  const tooltip = stepTooltip(step);
  const placement = tooltip?.props.placement ?? 'bottom';
  return (
    <section
      className="tour-step-config-section placement-section"
      aria-label={authoringText('Placement')}
    >
      <header className="tour-config-heading">
        <span>
          <small>{authoringText('Placement')}</small>
          <strong>{authoringText('Where the popup appears')}</strong>
        </span>
        <span className={`tour-config-status ${health.tone}`}>{health.label}</span>
      </header>
      {targetId ? (
        <div className="tour-live-target">
          <TargetControls
            block={step}
            controller={controller}
            snapshot={snapshot}
            targetId={targetId}
            targetLabel={targetLabel}
          />
        </div>
      ) : (
        <button
          type="button"
          className="tour-placement-card"
          aria-label={authoringText('{action} for step {number}', {
            action: targetActionLabel,
            number: stepIndex + 1,
          })}
          onClick={() => controller.startTargetPick(step.id)}
        >
          <MousePointer2 size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>{authoringText('Choose target')}</strong>
            <small>{stepPlacementFact(targetId, targetLabel, health)}</small>
          </span>
          <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      {tooltip ? (
        <div className="tour-position-group">
          <h4>{authoringText('Popup position')}</h4>
          <div
            className="tour-position-options"
            role="group"
            aria-label={authoringText('Tooltip position')}
          >
            {TOOLTIP_POSITION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = placement === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={selected ? 'selected' : undefined}
                  aria-pressed={selected}
                  onClick={() => controller.setTooltipPlacement(tooltip.id, option.value)}
                >
                  <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
