import type { LodariqBlock } from '@lodariq/schema';
import { useState } from 'react';
import { authoringText } from '../../../../i18n';
import type { LocalAuthoringFrameController } from '../../controller';
import { Eye, Network, Pencil, Trash2, X } from '../../design-system';
import { SequencePropertyEditor } from '../../properties/sequence-property-editor';
import { TransitionPropertyEditor } from '../../properties/transition-property-editor';

export type TourFlowWorkbenchMode = 'branch' | 'sequence';

export function TourFlowWorkbench({
  block,
  controller,
  mode,
  onClose,
  onEditStep,
  onModeChange,
  step,
  steps,
  tooltip,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  mode: TourFlowWorkbenchMode;
  onClose: () => void;
  onEditStep: () => void;
  onModeChange: (mode: TourFlowWorkbenchMode) => void;
  step: LodariqBlock;
  steps: readonly LodariqBlock[];
  tooltip: LodariqBlock;
}) {
  const [sequenceExpanded, setSequenceExpanded] = useState(false);
  const sequenceAvailable = block.props.action?.type === 'runSequence';
  const activeMode = sequenceAvailable ? mode : 'branch';
  return (
    <section
      className="tour-flow-workbench"
      aria-label={
        activeMode === 'sequence'
          ? authoringText('Action sequence')
          : authoringText('Action branch')
      }
      data-expanded={activeMode === 'sequence' && sequenceExpanded ? 'true' : 'false'}
      data-mode={activeMode}
    >
      <header className="tour-flow-workbench-header">
        <span className="tour-flow-workbench-title">
          <Network size={15} strokeWidth={2} aria-hidden="true" />
          <strong>
            {activeMode === 'sequence'
              ? authoringText('Action sequence')
              : authoringText('Action branch')}
          </strong>
        </span>
        <span className="tour-flow-workbench-actions">
          <button
            aria-label={authoringText('Edit step')}
            onClick={onEditStep}
            title={authoringText('Edit step')}
            type="button"
          >
            <Pencil size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            aria-label={authoringText('Preview from here')}
            onClick={() => controller.previewFullTourFromStep(step.id)}
            title={authoringText('Preview from here')}
            type="button"
          >
            <Eye size={14} strokeWidth={2} aria-hidden="true" />
          </button>
          {activeMode === 'branch' && block.props.action?.transition ? (
            <button
              aria-label={authoringText('Remove branch')}
              className="danger"
              onClick={() => controller.setButtonTransition(block.id, undefined)}
              title={authoringText('Remove branch')}
              type="button"
            >
              <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </span>
        <span
          aria-label={authoringText('Behavior settings')}
          className="tour-flow-workbench-tabs"
          role="tablist"
        >
          {sequenceAvailable ? (
            <button
              aria-selected={activeMode === 'sequence'}
              onClick={() => onModeChange('sequence')}
              role="tab"
              type="button"
            >
              {authoringText('Action sequence')}
            </button>
          ) : null}
          <button
            aria-selected={activeMode === 'branch'}
            onClick={() => onModeChange('branch')}
            role="tab"
            type="button"
          >
            {authoringText('Action branch')}
          </button>
        </span>
        <button
          aria-label={authoringText('Close settings')}
          className="tour-flow-workbench-close"
          onClick={onClose}
          type="button"
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      {activeMode === 'sequence' ? (
        <SequencePropertyEditor
          block={block}
          canvasMode
          controller={controller}
          expanded={sequenceExpanded}
          onExpandedChange={setSequenceExpanded}
          onTest={() => controller.previewFullTourFromStep(step.id)}
          steps={steps}
          tooltip={tooltip}
        />
      ) : (
        <TransitionPropertyEditor block={block} controller={controller} steps={steps} />
      )}
    </section>
  );
}
