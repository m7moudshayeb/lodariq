import type { LodariqBlock, StepChoreography } from '@lodariq/schema';
import { useEffect, useState } from 'react';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowRight,
  AuthoringButton,
  AuthoringSelect,
  AuthoringTextField,
  Check,
  Eye,
  Pencil,
  RotateCcw,
} from '../design-system';
import {
  createWait,
  currentSequence,
  isTriggerType,
  isWaitType,
  TIMEOUT_OPTIONS,
  TRANSITION_OPTIONS,
  TRIGGER_OPTIONS,
  waitLabelFor,
  WAIT_OPTIONS,
} from './sequence-property-model';
import { SequenceWaitEditor } from './sequence-wait-editor';

export function SequencePropertyEditor({
  automatic = false,
  block,
  canvasMode = false,
  controller,
  expanded,
  onExpandedChange,
  onSequenceChange,
  onTest,
  sequence: sequenceOverride,
  steps = [],
  tooltip,
}: {
  automatic?: boolean;
  block: LodariqBlock;
  canvasMode?: boolean;
  controller: LocalAuthoringFrameController;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSequenceChange?: (sequence: StepChoreography) => void;
  onTest?: () => void;
  sequence?: StepChoreography;
  steps?: readonly LodariqBlock[];
  tooltip: LodariqBlock;
}) {
  const [uncontrolledDetailsOpen, setUncontrolledDetailsOpen] = useState(false);
  const [activeWaitIndex, setActiveWaitIndex] = useState(0);
  const detailsOpen = expanded ?? uncontrolledDetailsOpen;
  const setDetailsOpen = (open: boolean): void => {
    if (expanded === undefined) setUncontrolledDetailsOpen(open);
    onExpandedChange?.(open);
  };
  const sequence = sequenceOverride ?? currentSequence(block, tooltip.props.targetId);
  const targetId = tooltip.props.targetId;
  const update = (next: StepChoreography): void => {
    if (onSequenceChange) onSequenceChange(next);
    else controller.setButtonSequence(block.id, next);
  };
  const triggerOptions = automatic
    ? TRIGGER_OPTIONS.map((option) =>
        option.value === 'manual'
          ? { ...option, label: authoringText('Start when the step appears') }
          : option,
      )
    : TRIGGER_OPTIONS;
  const waitLabel = sequence.waitFor[0]
    ? waitLabelFor(sequence.waitFor[0])
    : authoringText('No additional condition');
  const transitionLabel =
    TRANSITION_OPTIONS.find((option) => option.value === sequence.transition.type)?.label ??
    authoringText('Continue to the next step');

  useEffect(() => {
    setActiveWaitIndex((current) => Math.min(current, Math.max(0, sequence.waitFor.length - 1)));
  }, [sequence.waitFor.length]);

  return (
    <section
      className="sequence-property-editor"
      aria-label={authoringText('Action sequence')}
      data-variant={canvasMode ? 'canvas' : 'default'}
    >
      {!canvasMode ? (
        <header className="sequence-summary-header">
          <span>
            <small>{authoringText('Action sequence')}</small>
            <strong>
              {authoringText('Run an explicit, bounded product sequence before continuing.')}
            </strong>
          </span>
        </header>
      ) : null}
      {canvasMode ? (
        <div className="sequence-editor-actions">
          <AuthoringButton
            icon={<Pencil size={14} strokeWidth={2} aria-hidden="true" />}
            onClick={() => setDetailsOpen(!detailsOpen)}
          >
            {detailsOpen ? authoringText('Done') : authoringText('Edit sequence')}
          </AuthoringButton>
        </div>
      ) : null}
      <div className="sequence-summary-strip">
        <span className="sequence-summary-card">
          <Eye size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>
              {triggerOptions.find((option) => option.value === sequence.trigger.type)?.label}
            </strong>
            <small>{authoringText('Sequence trigger')}</small>
          </span>
        </span>
        <ArrowRight
          className="sequence-summary-arrow"
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="sequence-summary-card">
          <RotateCcw size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>{waitLabel}</strong>
            <small>{authoringText('Then wait for')}</small>
          </span>
        </span>
        <ArrowRight
          className="sequence-summary-arrow"
          size={16}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="sequence-summary-card">
          <Check size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>{transitionLabel}</strong>
            <small>{authoringText('Continue with')}</small>
          </span>
        </span>
      </div>
      <details
        className="sequence-details"
        onToggle={(event) => {
          if (canvasMode) setDetailsOpen(event.currentTarget.open);
        }}
        open={canvasMode ? detailsOpen : undefined}
      >
        <summary>{authoringText('Action sequence')}</summary>
        <div className="sequence-details-grid">
          <fieldset className="sequence-guided-card sequence-trigger-card">
            <legend>
              <span aria-hidden="true">1</span>
              {authoringText('Sequence trigger')}
            </legend>
            <AuthoringSelect
              ariaLabel={authoringText('Sequence trigger')}
              dataAction="sequence-trigger"
              dataBlockId={block.id}
              onValueChange={(value) => {
                if (!isTriggerType(value)) return;
                update({
                  ...sequence,
                  trigger:
                    value === 'manual'
                      ? { type: value }
                      : { type: value, ...(targetId ? { targetId } : {}) },
                });
              }}
              options={triggerOptions}
              value={sequence.trigger.type}
            />
            {!targetId && sequence.trigger.type !== 'manual' ? (
              <output className="storyboard-property-note">
                {authoringText('Choose a step target before using a product trigger.')}
              </output>
            ) : null}
          </fieldset>

          <fieldset className="sequence-guided-card sequence-wait-list">
            <legend>
              <span aria-hidden="true">2</span>
              {authoringText('Then wait for')}
            </legend>
            {sequence.waitFor.length === 0 ? (
              <span>{authoringText('No additional condition')}</span>
            ) : null}
            {canvasMode && sequence.waitFor.length > 1 ? (
              <nav aria-label={authoringText('Then wait for')} className="sequence-wait-tabs">
                {sequence.waitFor.map((_wait, index) => (
                  <button
                    aria-current={activeWaitIndex === index ? 'page' : undefined}
                    aria-label={`${authoringText('Then wait for')} ${index + 1}`}
                    key={`wait-tab-${index}`}
                    onClick={() => setActiveWaitIndex(index)}
                    type="button"
                  >
                    {index + 1}
                  </button>
                ))}
              </nav>
            ) : null}
            {sequence.waitFor
              .filter((_wait, index) => !canvasMode || index === activeWaitIndex)
              .map((wait, index) => {
                const sourceWaitIndex = canvasMode ? activeWaitIndex : index;
                return (
                  <SequenceWaitEditor
                    key={`${wait.type}-${sourceWaitIndex}`}
                    index={sourceWaitIndex}
                    onChange={(nextWait) =>
                      update({
                        ...sequence,
                        waitFor: sequence.waitFor.map((candidate, waitIndex) =>
                          waitIndex === sourceWaitIndex ? nextWait : candidate,
                        ),
                      })
                    }
                    onRemove={() =>
                      update({
                        ...sequence,
                        waitFor: sequence.waitFor.filter(
                          (_candidate, waitIndex) => waitIndex !== sourceWaitIndex,
                        ),
                      })
                    }
                    wait={wait}
                  />
                );
              })}
            <AuthoringSelect
              ariaLabel={authoringText('Add wait condition')}
              dataAction="sequence-add-wait"
              dataBlockId={block.id}
              onValueChange={(value) => {
                if (!isWaitType(value)) return;
                const wait = createWait(value, targetId);
                if (wait) {
                  update({ ...sequence, waitFor: [...sequence.waitFor, wait] });
                  setActiveWaitIndex(sequence.waitFor.length);
                }
              }}
              options={[{ value: '', label: authoringText('Add a condition') }, ...WAIT_OPTIONS]}
              value=""
            />
          </fieldset>

          <fieldset className="sequence-guided-card sequence-transition-card">
            <legend>
              <span aria-hidden="true">3</span>
              {authoringText('Continue with')}
            </legend>
            <AuthoringSelect
              ariaLabel={authoringText('Sequence transition')}
              dataAction="sequence-transition"
              dataBlockId={block.id}
              onValueChange={(value) => {
                if (value === 'next' || value === 'complete' || value === 'stay') {
                  update({ ...sequence, transition: { type: value } });
                }
              }}
              options={TRANSITION_OPTIONS}
              value={sequence.transition.type === 'step' ? 'next' : sequence.transition.type}
            />
          </fieldset>

          <fieldset className="sequence-recovery-card">
            <legend>{authoringText('Limits & recovery')}</legend>
            <div className="sequence-timeout-fields">
              <AuthoringTextField
                aria-label={authoringText('Sequence time limit in seconds')}
                label={authoringText('Time limit')}
                max={60}
                min={0.25}
                onChange={(event) => {
                  const seconds = Number(event.currentTarget.value);
                  if (!Number.isFinite(seconds)) return;
                  update({ ...sequence, timeoutMs: Math.round(seconds * 1_000) });
                }}
                step={0.25}
                type="number"
                value={sequence.timeoutMs / 1_000}
              />
              <label className="sequence-native-field">
                <span>{authoringText('If time runs out')}</span>
                <AuthoringSelect
                  ariaLabel={authoringText('Sequence timeout behavior')}
                  dataAction="sequence-timeout-behavior"
                  dataBlockId={block.id}
                  onValueChange={(value) => {
                    if (value === 'goToStep') {
                      const fallbackStep = steps.find((step) => step.id !== tooltip.id);
                      if (fallbackStep) {
                        update({ ...sequence, onTimeout: value, timeoutStepId: fallbackStep.id });
                      }
                      return;
                    }
                    if (
                      value === 'retry' ||
                      value === 'stay' ||
                      value === 'skip' ||
                      value === 'dismiss'
                    ) {
                      const { timeoutStepId: _removed, ...base } = sequence as StepChoreography & {
                        timeoutStepId?: string;
                      };
                      update({ ...base, onTimeout: value });
                    }
                  }}
                  options={TIMEOUT_OPTIONS}
                  value={sequence.onTimeout}
                />
              </label>
              {sequence.onTimeout === 'goToStep' ? (
                <label className="sequence-native-field">
                  <span>{authoringText('Recovery step')}</span>
                  <AuthoringSelect
                    ariaLabel={authoringText('Recovery step')}
                    dataAction="sequence-recovery-step"
                    dataBlockId={block.id}
                    onValueChange={(timeoutStepId) => update({ ...sequence, timeoutStepId })}
                    options={steps.map((step, index) => ({
                      value: step.id,
                      label: authoringText('Step {number}', { number: index + 1 }),
                    }))}
                    value={sequence.timeoutStepId}
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
          {onTest ? (
            <AuthoringButton onClick={onTest}>
              {authoringText('Test sequence from this step')}
            </AuthoringButton>
          ) : null}
        </div>
      </details>
    </section>
  );
}
