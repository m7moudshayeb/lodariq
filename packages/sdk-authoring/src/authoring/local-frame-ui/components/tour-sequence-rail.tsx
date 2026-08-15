import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { Check, ChevronRight, GripVertical, MousePointer2, Plus } from '../design-system';
import { elementActionLabelFor, stepHealth, targetActionLabelFor } from '../tour-step-model';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle, targetIdOf, targetLabelOf } from '../utils';
import { ExperienceLanguageSelect } from './experience-language-select';
import { StepAccordionDetails } from './tour-step-inspector';
import { TourStepActionMenu } from './tour-storyboard';

export { TourStepInspector } from './tour-step-inspector';

export function TourSequenceRail({
  activeStepId,
  compact = false,
  controller,
  snapshot,
  steps,
}: {
  activeStepId: string | null;
  compact?: boolean;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: LodariqBlock[];
}) {
  const health = steps.map((step) => stepHealth(step, snapshot));
  const verifiedCount = health.filter((item) => item.tone === 'ready').length;
  const activeStep = steps.find((step) => step.id === activeStepId) ?? null;
  const activeHealth = activeStep
    ? health[steps.findIndex((step) => step.id === activeStep.id)]
    : null;
  const activeTargetId = activeStep ? targetIdOf(activeStep) : null;
  const activeTargetLabel = activeTargetId
    ? targetLabelOf(snapshot.documentState, activeTargetId)
    : authoringText('Choose where this step appears');
  const activeStepIndex = activeStep ? steps.findIndex((step) => step.id === activeStep.id) : -1;
  const targetActionLabel = compact
    ? elementActionLabelFor(Boolean(activeHealth?.repair), Boolean(activeTargetId))
    : targetActionLabelFor(Boolean(activeHealth?.repair), Boolean(activeTargetId));

  return (
    <aside
      className={`tour-sequence-rail ${compact ? 'compact' : ''}`.trim()}
      aria-label={authoringText('Tour steps')}
    >
      {compact ? (
        <header className="tour-sequence-header compact-header">
          <strong>{authoringText('Steps')}</strong>
          <div className="tour-sequence-compact-actions">
            <span>
              {authoringText(steps.length === 1 ? '{count} step' : '{count} steps', {
                count: steps.length,
              })}
            </span>
            <ExperienceLanguageSelect controller={controller} snapshot={snapshot} />
          </div>
        </header>
      ) : (
        <header className="tour-sequence-header document-hero">
          <div className="tour-sequence-title">
            <span
              className="tour-sequence-kicker document-context"
              aria-label={authoringText('Experience type')}
            >
              {authoringText('Tour')}
            </span>
            <input
              key={snapshot.documentState.title}
              aria-label={authoringText('Experience title')}
              className="document-title-input"
              data-action="edit-title"
              defaultValue={snapshot.documentState.title}
              placeholder={authoringText('Untitled experience')}
              onBlur={(event) => controller.commitDocumentTitle(event.currentTarget.value)}
            />
            <ExperienceLanguageSelect controller={controller} snapshot={snapshot} />
          </div>
          <span
            className="tour-health-count"
            aria-label={authoringText('Experience status: {verified} of {total} verified', {
              verified: verifiedCount,
              total: steps.length,
            })}
          >
            {verifiedCount}/{steps.length} {authoringText('verified')}
          </span>
        </header>
      )}

      <ol className="tour-step-list">
        {steps.map((step, index) => {
          const itemHealth = health[index]!;
          const active = step.id === activeStepId;
          const targetId = targetIdOf(step);
          const targetLabel = targetId
            ? targetLabelOf(snapshot.documentState, targetId)
            : authoringText('No placement yet');
          return (
            <li
              className={`tour-step-row ${active ? 'active' : ''} ${
                active && compact ? 'expanded' : ''
              } ${itemHealth.tone}`.trim()}
              data-block-id={step.id}
              key={step.id}
              onDragOver={(event) => controller.handleBlockDragOver(event)}
              onDrop={(event) => controller.handleBlockDrop(event, step.id)}
            >
              <div className="tour-step-row-main">
                <button
                  type="button"
                  className="tour-step-drag-handle"
                  draggable
                  aria-label={authoringText('Drag step {number}', { number: index + 1 })}
                  title={authoringText('Drag to reorder step')}
                  onDragEnd={() => controller.endDraggingBlock()}
                  onDragStart={(event) => controller.startDraggingBlock(step.id, event)}
                >
                  <GripVertical className="tour-step-grip" size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="tour-step-select"
                  aria-current={active ? 'step' : undefined}
                  aria-expanded={compact ? active : undefined}
                  aria-label={authoringText('Edit step {number}: {title}', {
                    number: index + 1,
                    title: blockDisplayTitle(step),
                  })}
                  onClick={() => controller.activateTourStep(step.id)}
                >
                  <span className="tour-step-number">{index + 1}</span>
                  <span className="tour-step-copy">
                    <strong>{blockDisplayTitle(step)}</strong>
                    {compact ? null : <span className="tour-step-placement">{targetLabel}</span>}
                  </span>
                  <span className={`tour-step-health ${itemHealth.tone}`}>
                    {itemHealth.tone === 'ready' ? (
                      <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                    ) : (
                      <span className="tour-step-health-dot" aria-hidden="true" />
                    )}
                    {compact ? null : itemHealth.label}
                    <ChevronRight className="tour-step-chevron" size={15} strokeWidth={2.2} />
                  </span>
                </button>
                <label className="tour-step-multi-select">
                  <input
                    aria-label={authoringText('Select step {number} for batch changes', {
                      number: index + 1,
                    })}
                    checked={snapshot.selectedStepIds.has(step.id)}
                    onChange={() => controller.toggleStepStyleSelection(step.id)}
                    type="checkbox"
                  />
                  <span aria-hidden="true" />
                </label>
                <TourStepActionMenu
                  controller={controller}
                  snapshot={snapshot}
                  step={step}
                  stepIndex={index}
                />
              </div>

              {compact && active && activeHealth ? (
                <StepAccordionDetails
                  controller={controller}
                  health={activeHealth}
                  step={step}
                  stepIndex={index}
                  targetActionLabel={targetActionLabel}
                  targetId={targetId}
                  targetLabel={
                    targetId ? targetLabel : authoringText('Choose where this step appears')
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {!compact && activeStep && activeHealth ? (
        <footer className={`tour-active-step-footer ${activeHealth.tone}`}>
          <div className="tour-active-target">
            <span className="tour-active-target-icon" aria-hidden="true">
              {activeHealth.tone === 'ready' ? (
                <Check size={14} strokeWidth={2.4} />
              ) : (
                <MousePointer2 size={14} strokeWidth={2.2} />
              )}
            </span>
            <span className="tour-active-target-copy">
              <small>{activeHealth.label}</small>
              <strong>{activeTargetLabel}</strong>
            </span>
          </div>
          <div className="tour-active-actions">
            <button
              type="button"
              aria-label={authoringText('{action} for step {number}', {
                action: targetActionLabel,
                number: activeStepIndex + 1,
              })}
              onClick={() => controller.startTargetPick(activeStep.id)}
            >
              {targetActionLabel}
            </button>
          </div>
        </footer>
      ) : null}

      <div className="tour-contextual-actions">
        <button
          type="button"
          className="tour-add-step"
          onClick={() => controller.appendStepAndChooseTarget()}
        >
          <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Add step')}
        </button>
      </div>
    </aside>
  );
}
