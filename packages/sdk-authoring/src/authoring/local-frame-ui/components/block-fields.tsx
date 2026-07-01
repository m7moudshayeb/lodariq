import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  AuthoringSelect,
  Check,
  Copy,
  GripVertical,
  Image,
  MoreHorizontal,
  MousePointer2,
  Plus,
  Trash2,
} from '../design-system';
import type { StepContentCommand } from './insert-menu';
import { blockText, blockTypeLabel, isEditableContentBlock } from '../utils';
import { COMMAND_DETAILS, InlineStepInsert, STEP_CONTENT_COMMANDS } from './insert-menu';

export function BlockBody({
  block,
  controller,
  dragTargetBlockId,
  dragTargetPosition,
  selectedBlockId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  dragTargetBlockId?: string | null;
  dragTargetPosition?: 'before' | 'after' | null;
  selectedBlockId?: string | null;
}) {
  if (block.type === 'tourStep') {
    const tooltip = block.children.find((child) => child.type === 'tooltip');
    const fields = (tooltip?.children ?? []).filter(isEditableContentBlock);
    return (
      <div className="step-document" aria-label="Step content">
        <InlineStepInsert
          controller={controller}
          index={0}
          label="Insert content at start of step"
          stepBlockId={block.id}
        />
        {fields.map((field, index) => (
          <StepChildBlock
            key={field.id}
            block={field}
            controller={controller}
            dropPosition={dragTargetBlockId === field.id ? dragTargetPosition : null}
            index={index}
            selected={selectedBlockId === field.id}
            stepBlockId={block.id}
            total={fields.length}
          />
        ))}
        <StepComposer controller={controller} index={fields.length} stepBlockId={block.id} />
      </div>
    );
  }

  if (isEditableContentBlock(block)) return <ContentField block={block} controller={controller} />;
  const content = blockText(block);
  return <div>{content || block.id}</div>;
}

function StepComposer({
  controller,
  index,
  stepBlockId,
}: {
  controller: LocalAuthoringFrameController;
  index: number;
  stepBlockId: string;
}) {
  const [value, setValue] = useState('');
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const activeCommandIndexRef = useRef(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const trimmedValue = value.trim();
  const isSlashCommand = trimmedValue.startsWith('/');
  const isPlainText = trimmedValue.length > 0 && !isSlashCommand;
  const commandQuery = isSlashCommand ? trimmedValue.slice(1).toLowerCase() : '';
  const filteredCommands =
    !isSlashCommand || commandQuery.length === 0
      ? STEP_CONTENT_COMMANDS
      : STEP_CONTENT_COMMANDS.filter((command) => {
          const details = COMMAND_DETAILS[command];
          const label = blockTypeLabel(command);
          return [command, label, details.description].some((item) =>
            item.toLowerCase().includes(commandQuery),
          );
        });
  const insert = (type: StepContentCommand, content?: string): void => {
    controller.insertStepContent(stepBlockId, type, index, content);
    setValue('');
    setActiveCommandIndexValue(0);
  };

  const setActiveCommandIndexValue = (nextIndex: number): void => {
    activeCommandIndexRef.current = nextIndex;
    setActiveCommandIndex(nextIndex);
  };

  useEffect(() => {
    setActiveCommandIndexValue(0);
  }, [commandQuery, isSlashCommand]);

  useEffect(() => {
    if (trimmedValue.length === 0) return;
    const ownerDocument = composerRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: PointerEvent): void => {
      if (composerRef.current?.contains(event.target as Node)) return;
      setValue('');
    };
    ownerDocument.addEventListener('pointerdown', handlePointerDown, true);
    return () => ownerDocument.removeEventListener('pointerdown', handlePointerDown, true);
  }, [trimmedValue.length]);

  useEffect(() => {
    if (trimmedValue.length === 0) return;
    const menu = commandMenuRef.current;
    if (!menu || typeof menu.scrollIntoView !== 'function') return;
    const frame = menu.ownerDocument.defaultView;
    frame?.requestAnimationFrame(() => {
      menu.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [trimmedValue.length, filteredCommands.length, isPlainText]);

  return (
    <div className="step-composer" ref={composerRef}>
      <span className="step-composer-plus" aria-hidden="true">
        <Plus size={15} strokeWidth={2.35} />
      </span>
      <div className="step-composer-body">
        <input
          aria-controls={`step-command-menu-${stepBlockId}`}
          aria-expanded={trimmedValue.length > 0}
          aria-label="Step composer"
          aria-haspopup="listbox"
          className="step-composer-input"
          placeholder="Write inside this step, or type /"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setValue('');
              setActiveCommandIndexValue(0);
              return;
            }
            if (isSlashCommand && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              if (filteredCommands.length === 0) return;
              const currentIndex = activeCommandIndexRef.current;
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              setActiveCommandIndexValue(
                (currentIndex + direction + filteredCommands.length) % filteredCommands.length,
              );
              return;
            }
            const currentValue = event.currentTarget.value.trim();
            if (event.key !== 'Enter' || currentValue === '') return;
            event.preventDefault();
            if (!currentValue.startsWith('/')) {
              insert('paragraph', currentValue);
              return;
            }
            const currentCommand = stepCommandFromText(currentValue);
            if (currentCommand) {
              insert(currentCommand);
              return;
            }
            const activeCommand =
              filteredCommands[activeCommandIndexRef.current] ?? filteredCommands[0];
            if (activeCommand) insert(activeCommand);
          }}
        />
        <div className="step-quick-insert" aria-label="Add content to this step">
          {STEP_CONTENT_COMMANDS.map((command) => (
            <AuthoringButton
              key={command}
              aria-label={`Add ${stepQuickInsertLabel(command).toLowerCase()} to this step`}
              className="step-quick-insert-button"
              data-action="insert-step-content"
              data-block-type={command}
              data-step-block-id={stepBlockId}
              icon={COMMAND_DETAILS[command].icon}
              onPointerDown={(event) => {
                event.preventDefault();
                insert(command);
              }}
              onClick={(event) => {
                if (event.detail !== 0) return;
                insert(command);
              }}
              title={`Add ${stepQuickInsertLabel(command).toLowerCase()}`}
              tone="ghost"
            />
          ))}
        </div>
        <div
          ref={commandMenuRef}
          id={`step-command-menu-${stepBlockId}`}
          aria-label="Step insert commands"
          className="step-command-menu"
          hidden={trimmedValue.length === 0}
          role="listbox"
        >
          <div className="command-menu-header">
            <span>{isPlainText ? 'Add text' : 'Add content'}</span>
            <kbd>Add</kbd>
          </div>
          {isPlainText ? (
            <AuthoringButton
              className="command-item command-item-primary"
              onPointerDown={(event) => {
                event.preventDefault();
                insert('paragraph', trimmedValue);
              }}
              onClick={(event) => {
                if (event.detail !== 0) return;
                insert('paragraph', trimmedValue);
              }}
              role="option"
            >
              <span className="command-icon" aria-hidden="true">
                {COMMAND_DETAILS.paragraph.icon}
              </span>
              <span className="command-copy">
                <strong>Add text</strong>
                <small>{trimmedValue}</small>
              </span>
            </AuthoringButton>
          ) : null}
          {isSlashCommand
            ? filteredCommands.map((command) => {
                const details = COMMAND_DETAILS[command];
                const label = blockTypeLabel(command);
                const active = filteredCommands[activeCommandIndex] === command;
                return (
                  <AuthoringButton
                    key={command}
                    aria-selected={active}
                    className={`command-item ${active ? 'active' : ''}`.trim()}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      insert(command);
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0) return;
                      insert(command);
                    }}
                    onMouseEnter={() =>
                      setActiveCommandIndexValue(
                        filteredCommands.findIndex((item) => item === command),
                      )
                    }
                    role="option"
                  >
                    <span className="command-icon" aria-hidden="true">
                      {details.icon}
                    </span>
                    <span className="command-copy">
                      <strong>{label}</strong>
                      <small>{details.description}</small>
                    </span>
                    <span className="command-description">Add</span>
                  </AuthoringButton>
                );
              })
            : null}
          {isSlashCommand && filteredCommands.length === 0 ? (
            <div className="command-empty">No matching content</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
function stepCommandFromText(value: string): StepContentCommand | null {
  const normalized = value.replace(/^\//, '').trim().toLowerCase();
  if (normalized === 'text') return 'paragraph';
  return STEP_CONTENT_COMMANDS.find((command) => command === normalized) ?? null;
}

function stepCommandFromQuery(value: string): StepContentCommand | null {
  const normalized = value.replace(/^\//, '').trim().toLowerCase();
  if (!normalized) return null;
  const exactCommand = stepCommandFromText(value);
  if (exactCommand) return exactCommand;
  if ('text'.startsWith(normalized)) return 'paragraph';
  return (
    STEP_CONTENT_COMMANDS.find((command) => {
      const details = COMMAND_DETAILS[command];
      const label = blockTypeLabel(command);
      return [command, label, details.description].some((item) =>
        item.toLowerCase().includes(normalized),
      );
    }) ?? null
  );
}

function stepQuickInsertLabel(command: StepContentCommand): string {
  if (command === 'heading') return 'Title';
  if (command === 'paragraph') return 'Text';
  if (command === 'button') return 'Button';
  return 'Media';
}

function StepChildBlock({
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
      aria-label={`${blockTypeLabel(block.type)} content`}
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
        label={index + 1 >= total ? 'Insert content at end of step' : 'Insert content after this'}
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
      aria-label={`Drag ${label}`}
      className="step-child-drag-handle"
      draggable
      onDragEnd={() => controller.endDraggingStepContent()}
      onDragStart={startDrag}
      title="Drag to reorder"
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
      aria-label={`${blockTypeLabel(block.type)} quick actions`}
    >
      <AuthoringButton
        aria-label={`Duplicate ${label}`}
        className="step-child-inline-action"
        data-action="duplicate-step-content"
        data-block-id={block.id}
        data-step-block-id={stepBlockId}
        icon={<Copy size={13} strokeWidth={2.25} />}
        onClick={() => controller.duplicateStepContentBlock(stepBlockId, block.id)}
        title="Duplicate"
        tone="ghost"
      />
      <AuthoringButton
        aria-label={`Delete ${label}`}
        className="step-child-inline-action step-child-inline-action-danger"
        data-action="delete-step-content"
        data-block-id={block.id}
        data-step-block-id={stepBlockId}
        icon={<Trash2 size={13} strokeWidth={2.25} />}
        onClick={() => controller.deleteStepContentBlock(stepBlockId, block.id)}
        title="Delete"
        tone="ghost"
      />
    </div>
  );
}

function stepContentActionLabel(type: LodariqBlock['type']): string {
  if (type === 'heading') return 'title';
  if (type === 'paragraph') return 'text';
  if (type === 'button') return 'button';
  if (type === 'media') return 'media';
  return 'content';
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
  const transformTypes = ['heading', 'paragraph', 'button', 'media'] as const;
  return (
    <AuthoringPopover
      align="end"
      content={
        <div className="step-child-menu" role="menu" aria-label={`${label} move and format`}>
          <div className="step-child-menu-header">
            <span>{label}</span>
            <strong>Move and format</strong>
          </div>
          <div className="step-child-menu-section">
            <AuthoringButton
              aria-label="Move content up"
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
              Move up
            </AuthoringButton>
            <AuthoringButton
              aria-label="Move content down"
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
              Move down
            </AuthoringButton>
          </div>
          <div className="step-child-menu-section step-child-menu-transform">
            <span className="step-child-menu-label">Format as</span>
            {transformTypes.map((type) => {
              const active = block.type === type;
              return (
                <AuthoringButton
                  key={type}
                  aria-current={active ? 'true' : undefined}
                  aria-label={`Turn content into ${blockTypeLabel(type).toLowerCase()}`}
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
          aria-label={`${label} move and format`}
          className="step-child-menu-trigger"
          icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          title="Move and format"
          tone="ghost"
        />
      }
    />
  );
}

function ContentField({
  block,
  controller,
  stepBlockId,
  totalStepContent,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId?: string;
  totalStepContent?: number;
}) {
  const value = block.content ?? '';
  const label =
    block.type === 'heading'
      ? 'Heading'
      : block.type === 'button'
        ? 'Button label'
        : block.type === 'media'
          ? 'Media placeholder'
          : 'Body text';

  if (block.type === 'media') {
    return (
      <label className="content-field media-field">
        <span className="field-label">{label}</span>
        <span className="media-placeholder-icon" aria-hidden="true">
          <Image size={18} strokeWidth={2.1} />
        </span>
        <input
          key={`${block.id}:${value}`}
          className="block-input block-input-media"
          data-action="edit-content"
          data-block-id={block.id}
          aria-label={label}
          placeholder="Media placeholder"
          defaultValue={value}
          onKeyDown={(event) =>
            handleStepContentFieldKeyDown(event, {
              blockId: block.id,
              controller,
              stepBlockId,
              totalStepContent,
            })
          }
        />
        <span className="media-placeholder-state">Add media later</span>
      </label>
    );
  }

  if (block.type === 'button') {
    return (
      <div className={`button-field-shell ${block.props.action?.type ? 'ready' : 'incomplete'}`}>
        <label className="content-field button-label-field">
          <span className="field-label">{label}</span>
          <input
            key={`${block.id}:${value}`}
            className="block-input block-input-button"
            data-action="edit-content"
            data-block-id={block.id}
            aria-label={label}
            placeholder="Button label"
            defaultValue={value}
            onKeyDown={(event) =>
              handleStepContentFieldKeyDown(event, {
                blockId: block.id,
                controller,
                stepBlockId,
                totalStepContent,
              })
            }
          />
        </label>
        <ButtonActionControl block={block} controller={controller} />
      </div>
    );
  }

  return (
    <label className={`content-field content-field-${block.type}`}>
      <span className="field-label">{label}</span>
      <textarea
        key={`${block.id}:${value}`}
        className={`block-input block-input-${block.type}`}
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        placeholder={block.type === 'heading' ? 'Untitled heading' : 'Write supporting copy'}
        defaultValue={value}
        onKeyDown={(event) =>
          handleStepContentFieldKeyDown(event, {
            blockId: block.id,
            controller,
            stepBlockId,
            totalStepContent,
          })
        }
        rows={1}
      />
    </label>
  );
}

function handleStepContentFieldKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  {
    blockId,
    controller,
    stepBlockId,
    totalStepContent,
  }: {
    blockId: string;
    controller: LocalAuthoringFrameController;
    stepBlockId?: string;
    totalStepContent?: number;
  },
): void {
  if (!stepBlockId) return;
  const rawValue = event.currentTarget.value;
  const selectionStart = event.currentTarget.selectionStart ?? rawValue.length;
  const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
  const collapsedSelection = selectionStart === selectionEnd;
  const hasNavigationModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  if (
    event.key === 'ArrowUp' &&
    collapsedSelection &&
    selectionStart === 0 &&
    !hasNavigationModifier
  ) {
    if (controller.focusPreviousStepContentBlock(stepBlockId, blockId)) {
      event.preventDefault();
    }
    return;
  }
  if (
    event.key === 'ArrowDown' &&
    collapsedSelection &&
    selectionEnd === rawValue.length &&
    !hasNavigationModifier
  ) {
    if (controller.focusNextStepContentBlock(stepBlockId, blockId)) {
      event.preventDefault();
    }
    return;
  }
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    const currentValue = event.currentTarget.value.trim();
    const inlineCommand = currentValue.startsWith('/') ? stepCommandFromQuery(currentValue) : null;
    if (inlineCommand) {
      event.preventDefault();
      controller.applyStepContentCommand(stepBlockId, blockId, inlineCommand);
      return;
    }
    event.preventDefault();
    const isTextLine = event.currentTarget instanceof HTMLTextAreaElement;
    const currentLineValue = isTextLine ? rawValue.slice(0, selectionStart) : rawValue;
    const nextLineValue = isTextLine ? rawValue.slice(selectionEnd) : '';
    controller.continueStepContentBlock(stepBlockId, blockId, currentLineValue, nextLineValue);
    return;
  }
  if (event.key !== 'Backspace' || (totalStepContent ?? 0) <= 1) return;
  if (selectionStart !== 0 || selectionEnd !== 0) {
    return;
  }
  if (event.currentTarget.value.trim().length > 0) {
    if (controller.mergeStepContentBlockIntoPrevious(stepBlockId, blockId)) {
      event.preventDefault();
      return;
    }
    if (controller.focusPreviousStepContentBlock(stepBlockId, blockId)) {
      event.preventDefault();
    }
    return;
  }
  event.preventDefault();
  controller.deleteEmptyStepContentBlock(stepBlockId, blockId);
}

function ButtonActionControl({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const action = block.props.action?.type ?? '';
  const ready = action !== '';
  return (
    <div className={`cta-panel ${ready ? 'ready' : 'incomplete'}`.trim()}>
      <span className="cta-panel-icon" aria-hidden="true">
        <MousePointer2 size={14} strokeWidth={2.2} />
      </span>
      <span className="cta-panel-label">Then</span>
      <AuthoringSelect
        ariaLabel="After click"
        dataAction="set-action"
        dataBlockId={block.id}
        onValueChange={(value) => {
          if (value === '' || value === 'next' || value === 'clickTarget' || value === 'dismiss') {
            controller.setButtonAction(block.id, value);
          }
        }}
        options={[
          { value: '', label: 'Choose next action' },
          { value: 'next', label: 'Go to next step' },
          { value: 'clickTarget', label: 'Wait for placement' },
          { value: 'dismiss', label: 'Close experience' },
        ]}
        value={action}
      />
    </div>
  );
}

export function TransformControl({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  if (!isEditableContentBlock(block)) return null;
  return (
    <AuthoringSelect
      ariaLabel="Change content format"
      dataAction="transform-block"
      dataBlockId={block.id}
      onValueChange={(value) => {
        if (
          value === 'paragraph' ||
          value === 'heading' ||
          value === 'button' ||
          value === 'media'
        ) {
          controller.transformEditableBlock(block.id, value);
        }
      }}
      options={(['paragraph', 'heading', 'button', 'media'] as const).map((type) => ({
        value: type,
        label: blockTypeLabel(type),
      }))}
      value={block.type}
    />
  );
}
