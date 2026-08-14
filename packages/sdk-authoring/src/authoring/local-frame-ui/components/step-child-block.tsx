import { useState, type DragEvent } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  Check,
  Copy,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from '../design-system';
import { EDITABLE_BLOCK_TYPES, type EditableBlockTypeValue } from '../types';
import { blockTypeLabel, editableBlockTypeValue } from '../utils';
import { COMMAND_DETAILS, InlineStepInsert } from './insert-menu';
import { ContentField } from './content-field';

const STEP_CONTENT_ACTION_LABELS = {
  heading: authoringText('heading'),
  paragraph: authoringText('text'),
  list: authoringText('list'),
  divider: authoringText('divider'),
  button: authoringText('button'),
  link: authoringText('link'),
  media: authoringText('media'),
} as const satisfies Record<EditableBlockTypeValue, string>;

export function StepChildBlock({
  block,
  controller,
  dropPosition,
  index,
  selected,
  stepBlockId,
  total,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  dropPosition?: 'before' | 'after' | null;
  index: number;
  selected: boolean;
  stepBlockId: string;
  total: number;
}) {
  return (
    <div
      className={`step-child step-child-${block.type} ${selected ? 'selected' : ''} ${
        dropPosition ? `drop-${dropPosition}` : ''
      }`.trim()}
      data-block-id={block.id}
      data-block-type={block.type}
      data-drop-position={dropPosition ?? undefined}
      data-step-block-id={stepBlockId}
      tabIndex={0}
      aria-label={authoringText('{type} content', { type: blockTypeLabel(block.type) })}
      aria-keyshortcuts="Control+D Meta+D Delete Backspace Alt+ArrowUp Alt+ArrowDown"
      onDragOver={(event) => controller.handleStepContentDragOver(event, stepBlockId, block.id)}
      onDrop={(event) => controller.handleStepContentDrop(event, stepBlockId, block.id)}
      onFocus={(event) => {
        event.stopPropagation();
        controller.selectBlock(block.id);
      }}
      onKeyDown={(event) => controller.handleStepContentKeyDown(event, stepBlockId, block.id)}
      onPointerDown={(event) => {
        event.stopPropagation();
        controller.selectBlock(block.id);
      }}
    >
      <div className="step-child-toolbar">
        <StepChildDragHandle block={block} controller={controller} stepBlockId={stepBlockId} />
        <div className="step-child-secondary-actions">
          <StepChildInlineActions block={block} controller={controller} stepBlockId={stepBlockId} />
          <StepChildActionMenu block={block} controller={controller} stepBlockId={stepBlockId} />
        </div>
      </div>
      <ContentField
        block={block}
        controller={controller}
        stepBlockId={stepBlockId}
        totalStepContent={total}
      />
      <InlineStepInsert
        controller={controller}
        index={index + 1}
        label={authoringText(
          index + 1 >= total ? 'Insert content at end of step' : 'Insert content after this',
        )}
        stepBlockId={stepBlockId}
      />
    </div>
  );
}

function StepChildDragHandle({
  block,
  controller,
  stepBlockId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId: string;
}) {
  const label = blockTypeLabel(block.type).toLowerCase();
  const startDrag = (event: DragEvent<HTMLButtonElement>): void => {
    controller.startDraggingStepContent(stepBlockId, block.id, event);
  };
  return (
    <button
      aria-label={authoringText('Drag {type}', { type: label })}
      className="step-child-drag-handle"
      draggable
      onDragEnd={() => controller.endDraggingStepContent()}
      onDragStart={startDrag}
      title={authoringText('Drag to reorder')}
      type="button"
    >
      <GripVertical size={14} strokeWidth={2.1} />
    </button>
  );
}

function StepChildInlineActions({
  block,
  controller,
  stepBlockId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId: string;
}) {
  const label = stepContentActionLabel(block.type);
  return (
    <div
      className="step-child-inline-actions"
      aria-label={authoringText('{type} quick actions', {
        type: blockTypeLabel(block.type),
      })}
    >
      <AuthoringButton
        aria-label={authoringText('Duplicate {type}', { type: label })}
        className="step-child-inline-action"
        data-action="duplicate-step-content"
        data-block-id={block.id}
        data-step-block-id={stepBlockId}
        icon={<Copy size={13} strokeWidth={2.25} />}
        onClick={() => controller.duplicateStepContentBlock(stepBlockId, block.id)}
        title={authoringText('Duplicate')}
        tone="ghost"
      />
      <AuthoringButton
        aria-label={authoringText('Delete {type}', { type: label })}
        className="step-child-inline-action step-child-inline-action-danger"
        data-action="delete-step-content"
        data-block-id={block.id}
        data-step-block-id={stepBlockId}
        icon={<Trash2 size={13} strokeWidth={2.25} />}
        onClick={() => controller.deleteStepContentBlock(stepBlockId, block.id)}
        title={authoringText('Delete')}
        tone="ghost"
      />
    </div>
  );
}

function stepContentActionLabel(type: LodariqBlock['type']): string {
  const editableType = editableBlockTypeValue(type);
  return editableType ? STEP_CONTENT_ACTION_LABELS[editableType] : authoringText('content');
}

function StepChildActionMenu({
  block,
  controller,
  stepBlockId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId: string;
}) {
  const [open, setOpen] = useState(false);
  const label = blockTypeLabel(block.type);
  const runAction = (action: () => void): void => {
    setOpen(false);
    action();
  };
  const transformTypes = EDITABLE_BLOCK_TYPES;
  return (
    <AuthoringPopover
      align="end"
      content={
        <div
          className="step-child-menu"
          role="menu"
          aria-label={authoringText('{type} move and format', { type: label })}
        >
          <div className="step-child-menu-header">
            <span>{label}</span>
            <strong>{authoringText('Move and format')}</strong>
          </div>
          <div className="step-child-menu-section">
            <AuthoringButton
              aria-label={authoringText('Move content up')}
              className="step-child-menu-item"
              data-action="move-step-content"
              data-block-id={block.id}
              data-direction="up"
              data-step-block-id={stepBlockId}
              icon={<ArrowUp size={14} strokeWidth={2.2} />}
              onClick={() =>
                runAction(() => controller.moveStepContentBlock(stepBlockId, block.id, 'up'))
              }
              role="menuitem"
            >
              {authoringText('Move up')}
            </AuthoringButton>
            <AuthoringButton
              aria-label={authoringText('Move content down')}
              className="step-child-menu-item"
              data-action="move-step-content"
              data-block-id={block.id}
              data-direction="down"
              data-step-block-id={stepBlockId}
              icon={<ArrowDown size={14} strokeWidth={2.2} />}
              onClick={() =>
                runAction(() => controller.moveStepContentBlock(stepBlockId, block.id, 'down'))
              }
              role="menuitem"
            >
              {authoringText('Move down')}
            </AuthoringButton>
          </div>
          <div className="step-child-menu-section step-child-menu-transform">
            <span className="step-child-menu-label">{authoringText('Format as')}</span>
            {transformTypes.map((type) => {
              const active = block.type === type;
              return (
                <AuthoringButton
                  key={type}
                  aria-current={active ? 'true' : undefined}
                  aria-label={authoringText('Turn content into {type}', {
                    type: blockTypeLabel(type).toLowerCase(),
                  })}
                  className={`step-child-menu-item ${active ? 'active' : ''}`.trim()}
                  data-action="transform-block"
                  data-block-id={block.id}
                  data-block-type={type}
                  icon={active ? <Check size={14} strokeWidth={2.2} /> : COMMAND_DETAILS[type].icon}
                  onClick={() =>
                    runAction(() => {
                      if (!active) controller.transformEditableBlock(block.id, type);
                    })
                  }
                  role="menuitem"
                >
                  {blockTypeLabel(type)}
                </AuthoringButton>
              );
            })}
          </div>
        </div>
      }
      contentClassName="step-child-action-popover"
      onOpenChange={setOpen}
      open={open}
      trigger={
        <AuthoringButton
          aria-label={authoringText('{type} move and format', { type: label })}
          className="step-child-menu-trigger"
          icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          title={authoringText('Move and format')}
          tone="ghost"
        />
      }
    />
  );
}
