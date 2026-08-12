import { authoringText } from '../../../i18n';
import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle } from '../utils';
import {
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  Check,
  Copy,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
} from '../design-system';
import { stepHealth, storyboardStepPreview } from '../tour-step-model';
import { ExperienceLanguageSelect } from './experience-language-select';

export function TourStoryboard({
  activeStepId,
  controller,
  snapshot,
  steps,
}: {
  activeStepId: string | null;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  steps: LodariqBlock[];
}) {
  const health = steps.map((step) => stepHealth(step, snapshot));

  return (
    <nav className="tour-storyboard" aria-label={authoringText('Tour steps')}>
      <div className="tour-storyboard-scroll">
        <ol className="tour-storyboard-list">
          {steps.map((step, index) => {
            const active = step.id === activeStepId;
            const itemHealth = health[index]!;
            const preview = storyboardStepPreview(step);
            return (
              <li
                className={`tour-storyboard-step ${active ? 'active' : ''} ${itemHealth.tone}`.trim()}
                data-block-id={step.id}
                key={step.id}
                onDragOver={(event) => controller.handleBlockDragOver(event)}
                onDrop={(event) => controller.handleBlockDrop(event, step.id)}
              >
                <button
                  type="button"
                  className="tour-storyboard-drag"
                  draggable
                  aria-label={`Drag step ${index + 1}`}
                  title={authoringText('Drag to reorder step')}
                  onDragEnd={() => controller.endDraggingBlock()}
                  onDragStart={(event) => controller.startDraggingBlock(step.id, event)}
                >
                  <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tour-storyboard-select"
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Edit step ${index + 1}: ${blockDisplayTitle(step)}`}
                  onClick={() => controller.activateTourStep(step.id)}
                >
                  <span className="tour-storyboard-heading">
                    <span className="tour-storyboard-number">{index + 1}</span>
                    <strong>{blockDisplayTitle(step)}</strong>
                    <span className={`tour-storyboard-health ${itemHealth.tone}`}>
                      {itemHealth.tone === 'ready' ? (
                        <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                      ) : (
                        <span className="tour-step-health-dot" aria-hidden="true" />
                      )}
                      <span className="visually-hidden">{itemHealth.label}</span>
                    </span>
                  </span>
                  <span className="tour-storyboard-preview" aria-hidden="true">
                    <span>{preview.body}</span>
                    {preview.action ? <strong>{preview.action}</strong> : null}
                  </span>
                </button>
                <TourStepActionMenu controller={controller} step={step} stepIndex={index} />
              </li>
            );
          })}
          <li className="tour-storyboard-add-item">
            <button
              type="button"
              className="tour-storyboard-add"
              aria-label={authoringText('Add step')}
              onClick={() => controller.appendStepAndChooseTarget()}
            >
              <Plus size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </li>
        </ol>
      </div>
      <div className="tour-storyboard-language">
        <span className="tour-storyboard-language-label">
          {authoringText('Experience language')}
        </span>
        <ExperienceLanguageSelect
          controller={controller}
          presentation="studio"
          snapshot={snapshot}
        />
      </div>
    </nav>
  );
}

export function TourStepActionMenu({
  controller,
  step,
  stepIndex,
}: {
  controller: LocalAuthoringFrameController;
  step: LodariqBlock;
  stepIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };
  return (
    <AuthoringPopover
      align="end"
      open={open}
      onOpenChange={setOpen}
      contentClassName="tour-step-action-popover"
      trigger={
        <AuthoringButton
          aria-label={`Step ${stepIndex + 1} actions`}
          className="tour-step-action-trigger"
          icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          title={`Step ${stepIndex + 1} actions`}
          tone="ghost"
        />
      }
      content={
        <div
          className="tour-step-action-menu"
          role="menu"
          aria-label={`Step ${stepIndex + 1} actions`}
        >
          <AuthoringButton
            icon={<ArrowUp size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveTopLevelBlock(step.id, 'up'))}
            role="menuitem"
          >
            {authoringText('Move up')}
          </AuthoringButton>
          <AuthoringButton
            icon={<ArrowDown size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.moveTopLevelBlock(step.id, 'down'))}
            role="menuitem"
          >
            {authoringText('Move down')}
          </AuthoringButton>
          <AuthoringButton
            icon={<Copy size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.duplicateTopLevelBlock(step.id))}
            role="menuitem"
          >
            {authoringText('Duplicate')}
          </AuthoringButton>
          <AuthoringButton
            className="danger"
            icon={<Trash2 size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.deleteTopLevelBlock(step.id))}
            role="menuitem"
          >
            {authoringText('Delete')}
          </AuthoringButton>
        </div>
      }
    />
  );
}
