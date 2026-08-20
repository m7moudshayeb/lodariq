import { useState } from 'react';
import { Bot, GitBranch, Map } from 'lucide-react';
import {
  STEP_CHOREOGRAPHY_TIMEOUT_LIMITS,
  type LodariqBlock,
  type StepChoreography,
  type StepChoreographyWait,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { PropertyChoiceField, PropertyNumberField } from '../properties/property-controls';
import { firstHeadingText } from '../../overlay/filmstrip';

const NO_HANDOFF = 'this-application';
const NOTHING = 'nothing';
/** §4.3's own default, and the one a creator sees before they touch the row. */
const DEFAULT_TIMEOUT_MS = 8_000;

/** A step nobody has choreographed yet still has to read back its behaviour. */
function defaultSequence(targetId: string | undefined): StepChoreography {
  return {
    trigger: targetId ? { type: 'observeTargetClick', targetId } : { type: 'manual' },
    waitFor: [],
    transition: { type: 'next' },
    timeoutMs: DEFAULT_TIMEOUT_MS,
    onTimeout: 'stay',
  };
}

/** The five ways a step can hand over, in the creator's words (§4.3). */
const ADVANCE_OPTIONS = [
  { value: 'activateTarget', label: authoringText('Lodariq clicks the target') },
  { value: 'observeTargetClick', label: authoringText('They click the target') },
  { value: 'observeTargetFocus', label: authoringText('They focus the target') },
  { value: 'observeTargetInput', label: authoringText('They type into the target') },
  { value: 'manual', label: authoringText('They press a button') },
] as const;

const WAIT_OPTIONS = [
  { value: NOTHING, label: authoringText('nothing') },
  { value: 'targetAvailable', label: authoringText('the target to appear') },
  { value: 'networkIdle', label: authoringText('the page to settle') },
  { value: 'route', label: authoringText('a page address…') },
  { value: 'event', label: authoringText('a product event…') },
] as const;

const ON_TIMEOUT_OPTIONS = [
  { value: 'stay', label: authoringText('offer them a way out') },
  { value: 'retry', label: authoringText('try once more') },
  { value: 'skip', label: authoringText('skip this step') },
  { value: 'dismiss', label: authoringText('end the tour') },
] as const;

/** Waits that carry a value the creator has to type. */
type TypedWait = 'route' | 'event';

function waitValue(wait: StepChoreographyWait | undefined): string {
  if (!wait) return NOTHING;
  return wait.type;
}

function waitSummary(wait: StepChoreographyWait | undefined): string | null {
  if (!wait) return null;
  if (wait.type === 'route') return wait.value;
  if (wait.type === 'event') return wait.eventName;
  if (wait.type === 'textVisible') return wait.value;
  return null;
}

/**
 * The step's own behaviour (§4.3 `Step`): how it advances, what it waits for,
 * how long it will wait, where it goes next, what it counts as teaching, and
 * where the journey continues.
 *
 * Every row shows its value whether or not the step has a choreography yet — the
 * four middle rows used to be hidden behind `Advance when = Lodariq runs a
 * sequence`, so a creator asking "how long does this wait?" was told only if they
 * had already chosen to automate. Editing any of them is what writes the
 * choreography; a step nobody touched still saves nothing.
 */
export function StepFlowSection({
  controller,
  snapshot,
  step,
  steps,
  tooltip,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
  steps: readonly LodariqBlock[];
  tooltip: LodariqBlock;
}) {
  const [typing, setTyping] = useState<TypedWait | null>(null);
  const targetId = tooltip.props.targetId ?? step.props.targetId;
  const stored = step.props.entrySequence;
  const sequence = stored ?? defaultSequence(targetId);
  const applications = snapshot.applications ?? [];
  const handoff = step.props.handoff;
  const wait = sequence.waitFor[0];

  const write = (next: StepChoreography): void => controller.setBlockEntrySequence(step.id, next);

  const setWait = (value: string): void => {
    if (value === 'route' || value === 'event') {
      setTyping(value);
      return;
    }
    setTyping(null);
    if (value === NOTHING) {
      write({ ...sequence, waitFor: [] });
      return;
    }
    if (value === 'targetAvailable') {
      if (!targetId) return;
      write({ ...sequence, waitFor: [{ type: 'targetAvailable', targetId }] });
      return;
    }
    write({ ...sequence, waitFor: [{ type: 'networkIdle' }] });
  };

  const others = steps.filter((candidate) => candidate.id !== step.id);
  const transitionValue =
    sequence.transition.type === 'step' ? sequence.transition.stepId : sequence.transition.type;

  return (
    <>
      <PropertyChoiceField
        label={authoringText('Advance when')}
        onChange={(value) => {
          if (value === 'manual') {
            if (stored) write({ ...sequence, trigger: { type: 'manual' } });
            return;
          }
          write({
            ...sequence,
            trigger: {
              type: value as Exclude<StepChoreography['trigger']['type'], 'manual'>,
              ...(targetId ? { targetId } : {}),
            },
          });
        }}
        options={ADVANCE_OPTIONS}
        presentation="menu"
        value={sequence.trigger.type}
      />

      <PropertyChoiceField
        label={authoringText('Before showing, wait for')}
        onChange={setWait}
        options={WAIT_OPTIONS}
        presentation="menu"
        value={waitValue(wait)}
      />
      {/* The value the chosen wait needs, on its own row rather than over the panel. */}
      {typing ? (
        <TypedWaitField
          kind={typing}
          onCancel={() => setTyping(null)}
          onCommit={(value) => {
            write({
              ...sequence,
              waitFor: [
                typing === 'route'
                  ? { type: 'route', match: 'prefix', value }
                  : { type: 'event', eventName: value },
              ],
            });
            setTyping(null);
          }}
        />
      ) : null}
      {!typing && waitSummary(wait) ? (
        <p className="overlay-step-inspector-note" data-step-wait-value="">
          {waitSummary(wait)}
        </p>
      ) : null}

      <PropertyNumberField
        label={authoringText('Give up after')}
        max={STEP_CHOREOGRAPHY_TIMEOUT_LIMITS.max}
        min={STEP_CHOREOGRAPHY_TIMEOUT_LIMITS.min}
        onChange={(value) =>
          write({ ...sequence, timeoutMs: value ?? DEFAULT_TIMEOUT_MS })
        }
        step={250}
        suffix={authoringText('ms')}
        value={sequence.timeoutMs}
      />

      <PropertyChoiceField
        label={authoringText('If it never appears')}
        onChange={(value) => {
          const { timeoutStepId: _dropped, ...base } = sequence as StepChoreography & {
            timeoutStepId?: string;
          };
          write({
            ...base,
            onTimeout: value as (typeof ON_TIMEOUT_OPTIONS)[number]['value'],
          });
        }}
        options={ON_TIMEOUT_OPTIONS}
        presentation="menu"
        value={sequence.onTimeout === 'goToStep' ? 'stay' : sequence.onTimeout}
      />

      <PropertyChoiceField
        label={authoringText('Then go to')}
        onChange={(value) => {
          if (value === 'next' || value === 'complete' || value === 'stay') {
            write({ ...sequence, transition: { type: value } });
            return;
          }
          write({ ...sequence, transition: { type: 'step', stepId: value } });
        }}
        options={[
          { value: 'next', label: authoringText('the next step') },
          { value: 'complete', label: authoringText('the end of the tour') },
          { value: 'stay', label: authoringText('nowhere — stay here') },
          ...others.map((candidate, index) => ({
            value: candidate.id,
            label:
              firstHeadingText(candidate) ||
              authoringText('Step {number}', { number: index + 1 }),
          })),
        ]}
        presentation="menu"
        value={transitionValue}
      />

      {/* A slug, so the field keeps to the shape the schema accepts. */}
      <label className="rich-step-choice-field" data-presentation="text">
        <span className="rich-step-field-label">{authoringText('Teaches')}</span>
        <input
          className="rich-step-text-value"
          data-step-teaches=""
          onChange={(event) => {
            const slug = event.target.value.toLowerCase().replace(/[^a-z0-9_]/gu, '');
            controller.setStepTeaches(step.id, slug || undefined);
          }}
          placeholder={authoringText('nothing measurable')}
          type="text"
          value={step.props.teaches ?? ''}
        />
      </label>

      <PropertyChoiceField
        label={authoringText('Continues in')}
        onChange={(applicationId) =>
          controller.setStepHandoff(
            step.id,
            applicationId === NO_HANDOFF
              ? undefined
              : { applicationId, resumeMode: handoff?.resumeMode ?? 'same-step' },
          )
        }
        options={[
          { value: NO_HANDOFF, label: authoringText('this application') },
          ...applications.map((application) => ({
            value: application.id,
            label: application.name,
          })),
        ]}
        presentation="menu"
        value={handoff?.applicationId ?? NO_HANDOFF}
      />

      <p className="storyboard-property-hint">
        {authoringText('Branching to a different step is drawn in the flow map.')}
      </p>
      <div className="inspector-menu">
        <button
          data-flow-link="flow"
          onClick={() => controller.openOperationsMode('flow')}
          type="button"
        >
          <Map size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Open the flow map')}
        </button>
        <button
          data-flow-link="branch"
          onClick={() => controller.openOperationsMode('flow')}
          type="button"
        >
          <GitBranch size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Add a branch from here…')}
        </button>
        {/* WIRE_BE: adaptive skipping reads product usage the frame cannot see. */}
        <button data-flow-link="adaptive" disabled type="button">
          <Bot size={14} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Adaptive skipping…')}
        </button>
      </div>
    </>
  );
}

/** One line, same grammar as the Conditions section: Enter commits, Esc cancels. */
function TypedWaitField({
  kind,
  onCancel,
  onCommit,
}: {
  kind: TypedWait;
  onCancel: () => void;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const commit = (): void => {
    const value = draft.trim();
    if (value) onCommit(value);
    else onCancel();
  };
  return (
    <label className="rich-step-choice-field" data-presentation="text">
      <span className="rich-step-field-label">
        {kind === 'route'
          ? authoringText('The page address starts with')
          : authoringText('The product event named')}
      </span>
      <input
        autoFocus
        className="rich-step-text-value"
        data-wait-draft={kind}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
          }
        }}
        placeholder={kind === 'route' ? '/projects' : 'project_created'}
        type="text"
        value={draft}
      />
    </label>
  );
}
