import { useEffect, useState } from 'react';
import type {
  AuthoringAccessibilityPreviewMode,
  LodariqBlock,
  LodariqDocument,
  TourCompletionBehavior,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { AuthoringDraftCheckpoint } from '../../draft-checkpoints';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, AuthoringSelect, AuthoringTextField } from '../design-system';
import { blockDisplayTitle } from '../utils';

const ACCESSIBILITY_MODE_OPTIONS = [
  { value: 'keyboard', label: authoringText('Keyboard only') },
  { value: 'screenReader', label: authoringText('Screen-reader announcements') },
  { value: 'reducedMotion', label: authoringText('Reduced motion') },
  { value: 'zoom200', label: authoringText('200% zoom') },
  { value: 'rtl', label: authoringText('Right-to-left') },
  { value: 'compactReflow', label: authoringText('Compact reflow') },
] as const;

const COMPLETION_TYPE_OPTIONS = [
  { value: 'stop', label: authoringText('Stop silently') },
  { value: 'showStep', label: authoringText('Show a completion step') },
  { value: 'activateTarget', label: authoringText('Activate a safe target') },
  { value: 'openPage', label: authoringText('Open an allowed page') },
] as const;

export function AccessibilityPreviewEditor({
  controller,
}: {
  controller: LocalAuthoringFrameController;
}) {
  const [mode, setMode] = useState<AuthoringAccessibilityPreviewMode>('keyboard');
  return (
    <fieldset className="tour-accessibility-preview flow-settings-editor">
      <legend>{authoringText('Accessibility preview')}</legend>
      <label>
        <span>{authoringText('Preview mode')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('Accessibility preview mode')}
          dataAction="accessibility-preview-mode"
          dataBlockId="document"
          onValueChange={(value) => setMode(value as AuthoringAccessibilityPreviewMode)}
          options={ACCESSIBILITY_MODE_OPTIONS}
          value={mode}
        />
      </label>
      <AuthoringButton onClick={() => controller.previewAccessibilityMode(mode)} tone="primary">
        {authoringText('Start accessibility preview')}
      </AuthoringButton>
    </fieldset>
  );
}

export function DraftCheckpointEditor({
  checkpoints,
  controller,
}: {
  checkpoints: readonly AuthoringDraftCheckpoint[];
  controller: LocalAuthoringFrameController;
}) {
  const [name, setName] = useState('');
  const [selectedCheckpointId, setSelectedCheckpointId] = useState(
    checkpoints[checkpoints.length - 1]?.id ?? '',
  );
  useEffect(() => {
    if (checkpoints.some((checkpoint) => checkpoint.id === selectedCheckpointId)) return;
    setSelectedCheckpointId(checkpoints[checkpoints.length - 1]?.id ?? '');
  }, [checkpoints, selectedCheckpointId]);
  return (
    <fieldset className="tour-checkpoint-editor flow-settings-editor">
      <legend>{authoringText('Draft checkpoints')}</legend>
      <AuthoringTextField
        label={authoringText('Checkpoint name')}
        maxLength={80}
        onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !name.trim()) return;
          event.preventDefault();
          controller.saveDraftCheckpoint(name);
          setName('');
        }}
        placeholder={authoringText('Before launch changes')}
        value={name}
      />
      <AuthoringButton
        disabled={!name.trim()}
        onClick={() => {
          controller.saveDraftCheckpoint(name);
          setName('');
        }}
        tone="primary"
      >
        {authoringText('Save checkpoint')}
      </AuthoringButton>
      {checkpoints.length && selectedCheckpointId ? (
        <div className="tour-checkpoint-selection">
          <AuthoringSelect
            ariaLabel={authoringText('Draft checkpoints')}
            dataAction="draft-checkpoint"
            dataBlockId="document"
            onValueChange={setSelectedCheckpointId}
            options={checkpoints.map((checkpoint) => ({
              value: checkpoint.id,
              label: checkpoint.name,
            }))}
            value={selectedCheckpointId}
          />
          <span>
            <AuthoringButton
              onClick={() => controller.compareDraftCheckpoint(selectedCheckpointId)}
            >
              {authoringText('Compare')}
            </AuthoringButton>
            <AuthoringButton
              onClick={() => controller.restoreDraftCheckpoint(selectedCheckpointId)}
            >
              {authoringText('Restore')}
            </AuthoringButton>
            <AuthoringButton
              onClick={() => controller.deleteDraftCheckpoint(selectedCheckpointId)}
              tone="danger"
            >
              {authoringText('Delete')}
            </AuthoringButton>
          </span>
        </div>
      ) : null}
    </fieldset>
  );
}

export function CompletionBehaviorEditor({
  controller,
  document,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  document: LodariqDocument;
  steps: readonly LodariqBlock[];
}) {
  const completion = document.completion ?? { type: 'stop' as const };
  const updateType = (type: TourCompletionBehavior['type']): void => {
    if (type === 'stop') controller.setTourCompletionBehavior({ type });
    if (type === 'showStep' && steps[0]) {
      controller.setTourCompletionBehavior({ type, stepId: steps[0].id });
    }
    if (type === 'activateTarget' && document.targets[0]) {
      controller.setTourCompletionBehavior({ type, targetId: document.targets[0].id });
    }
    if (type === 'openPage') controller.setTourCompletionBehavior({ type, url: '/' });
  };

  return (
    <fieldset className="tour-completion-editor flow-settings-editor">
      <legend>{authoringText('Completion behavior')}</legend>
      <label>
        <span>{authoringText('When the tour completes')}</span>
        <AuthoringSelect
          ariaLabel={authoringText('When the tour completes')}
          dataAction="completion-behavior"
          dataBlockId={document.id}
          onValueChange={(value) => updateType(value as TourCompletionBehavior['type'])}
          options={COMPLETION_TYPE_OPTIONS}
          value={completion.type}
        />
      </label>
      {completion.type === 'showStep' ? (
        <label>
          <span>{authoringText('Completion step')}</span>
          <AuthoringSelect
            ariaLabel={authoringText('Completion step')}
            dataAction="completion-step"
            dataBlockId={document.id}
            onValueChange={(stepId) =>
              controller.setTourCompletionBehavior({ type: 'showStep', stepId })
            }
            options={steps.map((step, index) => ({
              value: step.id,
              label: `${authoringText('Step {number}', { number: index + 1 })} · ${blockDisplayTitle(step)}`,
            }))}
            value={completion.stepId}
          />
        </label>
      ) : null}
      {completion.type === 'activateTarget' ? (
        <label>
          <span>{authoringText('Completion target')}</span>
          <AuthoringSelect
            ariaLabel={authoringText('Completion target')}
            dataAction="completion-target"
            dataBlockId={document.id}
            onValueChange={(targetId) =>
              controller.setTourCompletionBehavior({ type: 'activateTarget', targetId })
            }
            options={document.targets.map((target) => ({ value: target.id, label: target.id }))}
            value={completion.targetId}
          />
        </label>
      ) : null}
      {completion.type === 'openPage' ? (
        <AuthoringTextField
          defaultValue={completion.url}
          key={completion.url}
          label={authoringText('Completion page')}
          onBlur={(event) =>
            controller.setTourCompletionBehavior({
              type: 'openPage',
              url: event.currentTarget.value.trim() || '/',
            })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder={authoringText('https://example.com or /path')}
        />
      ) : null}
    </fieldset>
  );
}
