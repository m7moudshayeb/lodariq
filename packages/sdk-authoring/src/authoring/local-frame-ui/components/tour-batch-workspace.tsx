import { authoringText } from '../../../i18n';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Copy,
  Move,
  Timer,
  Trash2,
} from '../design-system';
import { stepHealth, type StepHealthTone } from '../tour-step-model';
import { blockDisplayTitle, targetIdOf, targetLabelOf } from '../utils';

/**
 * Operations → Batch edits (§4.6).
 *
 * The selection lives here rather than only in the filmstrip. Choosing which
 * steps to change is half of a batch edit, and a section that could only act on
 * a selection made somewhere else was empty the first time anyone opened it.
 *
 * Every operation states what it will do to how many steps before it runs — the
 * friction anything touching more than one step has to earn.
 */
export function TourBatchWorkspace({
  controller,
  snapshot,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: readonly LodariqBlock[];
}) {
  const selected = steps.filter((step) => snapshot.selectedStepIds.has(step.id));
  const count = selected.length;
  const none = count === 0;
  /* Named once, so every card says the same thing about the same selection. */
  const scope = authoringText(count === 1 ? '{count} step' : '{count} steps', { count });

  return (
    <section className="tour-batch-workspace" aria-label={authoringText('Batch edit')}>
      <div className="ops-box">
        <h3>
          <CircleCheck size={15} strokeWidth={2} aria-hidden="true" />
          {authoringText('Choose the steps')}
          <span className="ops-box-actions">
            <span className="ops-tag" data-tone={none ? undefined : 'accent'}>
              {authoringText('{count} selected', { count })}
            </span>
            <button
              className="ops-btn"
              data-size="sm"
              onClick={() => selectEvery(controller, steps)}
              type="button"
            >
              {authoringText('Select all')}
            </button>
            <button
              className="ops-btn"
              data-size="sm"
              disabled={none}
              onClick={() => controller.clearTourStepBatchSelection()}
              type="button"
            >
              {authoringText('Clear')}
            </button>
            <button
              className="ops-btn"
              data-size="sm"
              onClick={() => selectBroken(controller, snapshot, steps)}
              type="button"
            >
              {authoringText('Only the broken ones')}
            </button>
          </span>
        </h3>
        <table className="ops-table tour-batch-table">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{authoringText('Selected')}</span>
              </th>
              <th scope="col">{authoringText('Step')}</th>
              <th scope="col">{authoringText('Points at')}</th>
              <th scope="col">{authoringText('State')}</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step, index) => {
              const health = stepHealth(step, snapshot);
              const targetId = targetIdOf(step);
              const isSelected = snapshot.selectedStepIds.has(step.id);
              return (
                <tr data-selected={isSelected ? 'true' : 'false'} key={step.id}>
                  <td>
                    <input
                      aria-label={authoringText('Include {step}', {
                        step: blockDisplayTitle(step),
                      })}
                      checked={isSelected}
                      onChange={() => controller.toggleStepStyleSelection(step.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="ops-table-key">
                    {index + 1}. {blockDisplayTitle(step)}
                  </td>
                  <td>
                    {targetId
                      ? targetLabelOf(snapshot.documentState, targetId)
                      : authoringText('Nothing yet')}
                  </td>
                  <td>
                    <span className="ops-tag" data-tone={batchTone(health.tone)}>
                      {health.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {steps.length === 0 ? (
              <tr>
                <td colSpan={4}>{authoringText('Add a step from the filmstrip')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Disabled with nothing selected, and each card names the count it would
          act on — so nobody discovers the scope after the fact. */}
      <div className="ops-cols" data-cols="3">
        <BatchOperation
          description={authoringText('Move the popup to the same side of every chosen target.')}
          disabled={none}
          icon={<Move size={15} strokeWidth={2} aria-hidden="true" />}
          title={authoringText('Put the popup somewhere else')}
        >
          <div className="ops-row tour-batch-choices">
            {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
              <button
                className="ops-btn"
                data-size="sm"
                disabled={none}
                key={placement}
                onClick={() => controller.setSelectedStepPlacement(placement)}
                type="button"
              >
                {placementLabel(placement)}
              </button>
            ))}
          </div>
        </BatchOperation>

        <BatchOperation
          description={authoringText('What happens if somebody just stops, on every chosen step.')}
          disabled={none}
          icon={<Timer size={15} strokeWidth={2} aria-hidden="true" />}
          title={authoringText('If they walk away')}
        >
          <div className="ops-row tour-batch-choices">
            {(['stay', 'retry', 'skip', 'dismiss'] as const).map((policy) => (
              <button
                className="ops-btn"
                data-size="sm"
                disabled={none}
                key={policy}
                onClick={() => controller.setSelectedStepTimeoutPolicy(policy)}
                type="button"
              >
                {timeoutLabel(policy)}
              </button>
            ))}
          </div>
        </BatchOperation>

        <BatchOperation
          description={authoringText('A copy of each chosen step, right after it.')}
          disabled={none}
          icon={<Copy size={15} strokeWidth={2} aria-hidden="true" />}
          title={authoringText('Duplicate them')}
        >
          <button
            className="ops-btn"
            data-size="sm"
            disabled={none}
            onClick={() => controller.duplicateSelectedSteps()}
            type="button"
          >
            {authoringText('Duplicate {scope}', { scope })}
          </button>
        </BatchOperation>

        <BatchOperation
          description={authoringText('Shift the chosen steps together, keeping their order.')}
          disabled={none}
          icon={<ArrowUp size={15} strokeWidth={2} aria-hidden="true" />}
          title={authoringText('Move them in the sequence')}
        >
          <div className="ops-row tour-batch-choices">
            <button
              className="ops-btn"
              data-size="sm"
              disabled={none}
              onClick={() => controller.moveSelectedSteps('up')}
              type="button"
            >
              <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
              {authoringText('Earlier')}
            </button>
            <button
              className="ops-btn"
              data-size="sm"
              disabled={none}
              onClick={() => controller.moveSelectedSteps('down')}
              type="button"
            >
              <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
              {authoringText('Later')}
            </button>
          </div>
        </BatchOperation>

        <BatchOperation
          description={authoringText('Removes them from the sequence. Undo puts them back.')}
          disabled={none}
          icon={<Trash2 size={15} strokeWidth={2} aria-hidden="true" />}
          title={authoringText('Delete them')}
        >
          <button
            className="ops-btn"
            data-size="sm"
            data-variant="danger"
            disabled={none}
            onClick={() => controller.deleteSelectedSteps()}
            type="button"
          >
            {authoringText('Delete {scope}', { scope })}
          </button>
        </BatchOperation>
      </div>

      {none ? (
        <p className="ops-callout" data-tone="info" role="status">
          {authoringText('Tick some steps above to act on them together.')}
        </p>
      ) : null}
    </section>
  );
}

function BatchOperation({
  children,
  description,
  disabled,
  icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <article className="ops-box tour-batch-operation" data-disabled={disabled ? 'true' : 'false'}>
      <h3>
        {icon}
        {title}
      </h3>
      <p className="ops-box-body">{description}</p>
      {children}
    </article>
  );
}

/** Everything, in one pass, without leaning on the anchor-based range select. */
function selectEvery(
  controller: LocalAuthoringFrameController,
  steps: readonly LodariqBlock[],
): void {
  controller.clearTourStepBatchSelection();
  for (const step of steps) controller.toggleStepStyleSelection(step.id);
}

/**
 * The steps a check would complain about. This is the selection anyone actually
 * wants — "fix the broken ones" rather than "fix steps 2, 5 and 9".
 */
function selectBroken(
  controller: LocalAuthoringFrameController,
  snapshot: LocalAuthoringFrameSnapshot,
  steps: readonly LodariqBlock[],
): void {
  controller.clearTourStepBatchSelection();
  for (const step of steps) {
    if (stepHealth(step, snapshot).tone !== 'ready') controller.toggleStepStyleSelection(step.id);
  }
}

/** The step-health vocabulary, in the tag tones the sheet already speaks. */
function batchTone(tone: StepHealthTone): string | undefined {
  if (tone === 'ready') return 'ok';
  if (tone === 'repair') return 'blocker';
  return 'warning';
}

function placementLabel(placement: 'top' | 'right' | 'bottom' | 'left'): string {
  if (placement === 'top') return authoringText('Above');
  if (placement === 'right') return authoringText('Right');
  if (placement === 'bottom') return authoringText('Below');
  return authoringText('Left');
}

function timeoutLabel(policy: 'stay' | 'retry' | 'skip' | 'dismiss'): string {
  if (policy === 'stay') return authoringText('Wait');
  if (policy === 'retry') return authoringText('Try again');
  if (policy === 'skip') return authoringText('Move on');
  return authoringText('Close it');
}
