import { useEffect, useRef, useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { ChevronRight, Pencil } from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle } from '../utils';
import {
  buttonAdvanceValue,
  stepHealth,
  stepPlacementFact,
  stepPrimaryButton,
  stepTooltip,
  type StepHealthTone,
} from '../tour-step-model';
import { useTourStepInspectorStyles } from '../tour-step-inspector-styles';
import {
  ADVANCE_OPTION_LABELS,
  STORYBOARD_TOOL_OPTIONS,
  TOOLTIP_PLACEMENT_LABELS,
  type StoryboardToolMode,
} from './tour-sequence-options';
import { RichStepContentEditor } from './rich-step-content-editor';

export function TourStepInspector({
  controller,
  onFlowMapOpen,
  snapshot,
  step,
  stepIndex,
}: {
  controller: LocalAuthoringFrameController;
  onFlowMapOpen: (stepId: string, actionBlockId: string, mode?: 'branch' | 'sequence') => void;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  stepIndex: number;
}) {
  useTourStepInspectorStyles();
  const health = stepHealth(step, snapshot);
  const tooltip = stepTooltip(step);
  const [toolMode, setToolMode] = useState<StoryboardToolMode>('content');
  const [contentTrayRequestToken, setContentTrayRequestToken] = useState(0);

  useEffect(() => setToolMode('content'), [step.id]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request || request.blockId !== step.id) return;
    if (request.reveal === 'placement' || request.reveal === 'popup') {
      setToolMode(request.reveal);
      return;
    }
    setToolMode('content');
  }, [snapshot.focusRequest, step.id]);

  return (
    <section
      className="tour-step-inspector storyboard-step-inspector"
      aria-label={authoringText('Step {number} details', { number: stepIndex + 1 })}
    >
      <section
        className="tour-step-editor-section storyboard-canvas"
        aria-label={authoringText('Rich content')}
      >
        <header className="storyboard-canvas-heading">
          <span>
            <small>
              {authoringText('Step')} {stepIndex + 1}
            </small>
            <strong>{blockDisplayTitle(step)}</strong>
          </span>
          <span className={`live-step-status ${health.tone}`}>{health.label}</span>
        </header>
        {tooltip ? (
          <RichStepContentEditor
            contentTrayRequestToken={contentTrayRequestToken}
            controller={controller}
            health={health}
            onFlowMapOpen={onFlowMapOpen}
            onToolModeChange={setToolMode}
            snapshot={snapshot}
            step={step}
            stepIndex={stepIndex}
            tooltip={tooltip}
            toolMode={toolMode}
          />
        ) : null}
        <nav className="storyboard-tool-dock" aria-label={authoringText('Authoring tools')}>
          {STORYBOARD_TOOL_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = toolMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={active ? 'active' : undefined}
                aria-label={option.label}
                aria-pressed={active}
                onClick={() => {
                  if (option.value === 'content') {
                    setToolMode('content');
                    setContentTrayRequestToken((token) => token + 1);
                    return;
                  }
                  setToolMode((current) => (current === option.value ? 'content' : option.value));
                }}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </nav>
      </section>
    </section>
  );
}

export function StepAccordionDetails({
  controller,
  health,
  step,
  stepIndex,
  targetActionLabel,
  targetId,
  targetLabel,
}: {
  controller: LocalAuthoringFrameController;
  health: { label: string; repair: boolean; tone: StepHealthTone };
  step: LodariqBlock;
  stepIndex: number;
  targetActionLabel: string;
  targetId: string | null;
  targetLabel: string;
}) {
  const accordionRef = useRef<HTMLDivElement | null>(null);
  const tooltip = stepTooltip(step);
  const button = stepPrimaryButton(step);
  const placement = tooltip?.props.placement ?? 'bottom';
  const advanceValue = buttonAdvanceValue(button);
  const placementFact = stepPlacementFact(targetId, targetLabel, health);

  useEffect(() => {
    const node = accordionRef.current;
    if (!node || typeof node.scrollIntoView !== 'function') return;
    node.scrollIntoView({ block: 'nearest' });
  }, [step.id]);

  return (
    <div ref={accordionRef} className="tour-step-accordion" data-step-accordion={step.id}>
      <section className="tour-step-detail-row" aria-label={authoringText('Placement')}>
        <span className="tour-step-detail-label">{authoringText('Placement')}</span>
        <div className="tour-step-detail-fact">
          <span className={`tour-step-detail-status ${health.tone}`}>
            <span className="tour-step-health-dot" aria-hidden="true" />
            <strong>{placementFact}</strong>
          </span>
          <button
            type="button"
            className="tour-step-detail-change"
            aria-label={authoringText('{action} for step {number}', {
              action: targetActionLabel,
              number: stepIndex + 1,
            })}
            onClick={() => controller.startTargetPick(step.id)}
          >
            {targetId ? authoringText('Change') : authoringText('Choose')}
          </button>
        </div>
      </section>

      <section className="tour-step-detail-row" aria-label={authoringText('Behavior')}>
        <span className="tour-step-detail-label">{authoringText('Behavior')}</span>
        <strong className="tour-step-behavior-summary">
          {TOOLTIP_PLACEMENT_LABELS[placement]} · {ADVANCE_OPTION_LABELS[advanceValue]}
        </strong>
      </section>

      <button
        type="button"
        className="tour-step-edit-on-page"
        onClick={() => {
          controller.closeAdvancedEditor();
          controller.requestPanelLayout('standard');
          controller.activateTourStep(step.id);
        }}
      >
        <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
        {authoringText('Edit content on page')}
      </button>

      <button
        type="button"
        className="tour-step-open-details compact-details"
        onClick={() => controller.openAdvancedEditor(step.id)}
      >
        <span>
          <strong>{authoringText('Edit details')}</strong>
          <small>{authoringText('Release review and recovery')}</small>
        </span>
        <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
