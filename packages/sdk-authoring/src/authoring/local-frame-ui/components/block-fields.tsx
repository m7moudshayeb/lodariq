import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
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
import {
  EDITABLE_ACTION_OPTIONS,
  EDITABLE_BLOCK_FIELD_CONFIG,
  EDITABLE_BLOCK_TYPES,
  STEP_CONTENT_COMMANDS,
  type EditableBlockTypeValue,
  type StepContentCommand,
} from '../types';
import {
  blockText,
  blockTypeLabel,
  editableActionValue,
  editableBlockTypeValue,
  isEditableContentBlock,
} from '../utils';
import { COMMAND_DETAILS, InlineStepInsert } from './insert-menu';

type ContentFieldProps = {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  stepBlockId?: string;
  totalStepContent?: number;
};

type FieldConfig = {
  fieldLabel: string;
  placeholder: string;
};

type ContentFieldContext = ContentFieldProps & {
  fieldConfig: FieldConfig;
  label: string;
  value: string;
};

type ContentFieldRenderer = (context: ContentFieldContext) => ReactNode;

const STEP_CONTENT_COMMAND_SET = new Set<string>(STEP_CONTENT_COMMANDS);

const STEP_COMMAND_ALIASES: Readonly<Record<string, StepContentCommand>> = {
  text: 'paragraph',
};

const COMMAND_NAVIGATION_DIRECTIONS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
};

const NATIVE_ENTER_BLOCK_TYPES = new Set<string>(['list']);

const STEP_CONTENT_ACTION_LABELS = {
  heading: 'heading',
  paragraph: 'text',
  list: 'list',
  divider: 'divider',
  button: 'button',
  link: 'link',
  media: 'media',
} as const satisfies Record<EditableBlockTypeValue, string>;

const CONTENT_FIELD_RENDERERS: Readonly<Record<string, ContentFieldRenderer>> = {
  divider: renderDividerField,
  media: renderMediaField,
  button: renderButtonField,
  link: renderLinkField,
};

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
  const filteredCommands = filterStepContentCommands(isSlashCommand, commandQuery);
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
          onKeyDown={(event) =>
            handleStepComposerKeyDown(event, {
              activeCommandIndexRef,
              clearComposer: () => {
                setValue('');
                setActiveCommandIndexValue(0);
              },
              commands: filteredCommands,
              insert,
              isSlashCommand,
              setActiveCommandIndex: setActiveCommandIndexValue,
            })
          }
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

function filterStepContentCommands(
  isSlashCommand: boolean,
  commandQuery: string,
): readonly StepContentCommand[] {
  if (!isSlashCommand || commandQuery.length === 0) return STEP_CONTENT_COMMANDS;
  return STEP_CONTENT_COMMANDS.filter((command) => stepCommandMatchesQuery(command, commandQuery));
}

function handleStepComposerKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  {
    activeCommandIndexRef,
    clearComposer,
    commands,
    insert,
    isSlashCommand,
    setActiveCommandIndex,
  }: {
    activeCommandIndexRef: { current: number };
    clearComposer: () => void;
    commands: readonly StepContentCommand[];
    insert: (type: StepContentCommand, content?: string) => void;
    isSlashCommand: boolean;
    setActiveCommandIndex: (index: number) => void;
  },
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    clearComposer();
    return;
  }

  const navigationDirection = COMMAND_NAVIGATION_DIRECTIONS[event.key];
  if (isSlashCommand && navigationDirection !== undefined) {
    event.preventDefault();
    if (commands.length === 0) return;
    setActiveCommandIndex(
      (activeCommandIndexRef.current + navigationDirection + commands.length) % commands.length,
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

  const command =
    stepCommandFromText(currentValue) ?? commands[activeCommandIndexRef.current] ?? commands[0];
  if (command) insert(command);
}

function stepCommandFromText(value: string): StepContentCommand | null {
  const normalized = value.replace(/^\//, '').trim().toLowerCase();
  return STEP_COMMAND_ALIASES[normalized] ?? stepContentCommandValue(normalized);
}

function stepCommandFromQuery(value: string): StepContentCommand | null {
  const normalized = value.replace(/^\//, '').trim().toLowerCase();
  if (!normalized) return null;
  const exactCommand = stepCommandFromText(value);
  if (exactCommand) return exactCommand;
  const aliasCommand = stepAliasCommandFromQuery(normalized);
  if (aliasCommand) return aliasCommand;
  return STEP_CONTENT_COMMANDS.find((command) => stepCommandMatchesQuery(command, normalized)) ?? null;
}

function stepContentCommandValue(value: string): StepContentCommand | null {
  return STEP_CONTENT_COMMAND_SET.has(value) ? (value as StepContentCommand) : null;
}

function stepAliasCommandFromQuery(query: string): StepContentCommand | null {
  const match = Object.entries(STEP_COMMAND_ALIASES).find(([alias]) => alias.startsWith(query));
  return match?.[1] ?? null;
}

function stepCommandMatchesQuery(command: StepContentCommand, query: string): boolean {
  const details = COMMAND_DETAILS[command];
  const label = blockTypeLabel(command);
  return [command, label, details.description].some((item) =>
    item.toLowerCase().includes(query),
  );
}

function stepQuickInsertLabel(command: StepContentCommand): string {
  return STEP_QUICK_INSERT_LABELS[command];
}

const STEP_QUICK_INSERT_LABELS = {
  heading: 'Title',
  paragraph: 'Text',
  list: 'List',
  divider: 'Divider',
  button: 'Button',
  link: 'Link',
  media: 'Media',
} as const satisfies Record<StepContentCommand, string>;

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
  const editableType = editableBlockTypeValue(type);
  return editableType ? STEP_CONTENT_ACTION_LABELS[editableType] : 'content';
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

function ContentField(props: ContentFieldProps) {
  const { block } = props;
  const value = block.content ?? '';
  const fieldConfig = fieldConfigForBlockType(block.type);
  const label = fieldConfig.fieldLabel;
  const renderer = CONTENT_FIELD_RENDERERS[block.type] ?? renderTextField;
  return <>{renderer({ ...props, fieldConfig, label, value })}</>;
}

function renderDividerField({ label }: ContentFieldContext): ReactNode {
  return (
    <div className="content-field divider-field" aria-label={label}>
      <span className="field-label">{label}</span>
      <div className="divider-preview" aria-hidden="true" />
    </div>
  );
}

function renderMediaField(context: ContentFieldContext): ReactNode {
  const { fieldConfig, label, value, block } = context;
  return (
    <label className="content-field media-field">
      <span className="field-label">{label}</span>
      <span className="media-placeholder-icon" aria-hidden="true">
        <Image size={18} strokeWidth={2.1} />
      </span>
      <SyncedInput
        className="block-input block-input-media"
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        committedValue={value}
        placeholder={fieldConfig.placeholder}
        onKeyDown={contentFieldKeyDownHandler(context)}
      />
      <span className="media-placeholder-state">Add media later</span>
    </label>
  );
}

function renderButtonField(context: ContentFieldContext): ReactNode {
  const { block, controller } = context;
  return (
    <div className={`button-field-shell ${fieldStateClass(Boolean(block.props.action?.type))}`}>
      {renderSingleLineField(context, 'button-label-field', 'block-input-button')}
      <ButtonActionControl block={block} controller={controller} />
    </div>
  );
}

function renderLinkField(context: ContentFieldContext): ReactNode {
  const { block, controller } = context;
  return (
    <div
      className={`button-field-shell link-field-shell ${fieldStateClass(
        Boolean(block.props.action?.url),
      )}`}
    >
      {renderSingleLineField(context, 'button-label-field', 'block-input-link')}
      <ActionUrlField block={block} controller={controller} />
    </div>
  );
}

function renderTextField(context: ContentFieldContext): ReactNode {
  const { block, fieldConfig, label, value } = context;
  return (
    <label className={`content-field content-field-${block.type}`}>
      <span className="field-label">{label}</span>
      <SyncedTextarea
        className={`block-input block-input-${block.type}`}
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        committedValue={value}
        placeholder={fieldConfig.placeholder}
        onKeyDown={contentFieldKeyDownHandler(context)}
        rows={1}
      />
    </label>
  );
}

function renderSingleLineField(
  context: ContentFieldContext,
  fieldClassName: string,
  inputClassName: string,
): ReactNode {
  const { block, fieldConfig, label, value } = context;
  return (
    <label className={`content-field ${fieldClassName}`}>
      <span className="field-label">{label}</span>
      <SyncedInput
        className={`block-input ${inputClassName}`}
        data-action="edit-content"
        data-block-id={block.id}
        aria-label={label}
        committedValue={value}
        placeholder={fieldConfig.placeholder}
        onKeyDown={contentFieldKeyDownHandler(context)}
      />
    </label>
  );
}

function contentFieldKeyDownHandler({
  block,
  controller,
  stepBlockId,
  totalStepContent,
}: ContentFieldContext): (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void {
  return (event) =>
    handleStepContentFieldKeyDown(event, {
      blockId: block.id,
      blockType: block.type,
      controller,
      stepBlockId,
      totalStepContent,
    });
}

function fieldStateClass(ready: boolean): 'ready' | 'incomplete' {
  return ready ? 'ready' : 'incomplete';
}

function handleStepContentFieldKeyDown(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  {
    blockId,
    blockType,
    controller,
    stepBlockId,
    totalStepContent,
  }: {
    blockId: string;
    blockType: LodariqBlock['type'];
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
    if (usesNativeEnterForNewLine(blockType)) return;
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

function usesNativeEnterForNewLine(blockType: LodariqBlock['type']): boolean {
  return NATIVE_ENTER_BLOCK_TYPES.has(blockType);
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
    <div className={`cta-panel ${fieldStateClass(ready)}`.trim()}>
      <span className="cta-panel-icon" aria-hidden="true">
        <MousePointer2 size={14} strokeWidth={2.2} />
      </span>
      <span className="cta-panel-label">Then</span>
      <AuthoringSelect
        ariaLabel="After click"
        dataAction="set-action"
        dataBlockId={block.id}
        onValueChange={(value) => handleButtonActionChange(value, block, controller)}
        options={EDITABLE_ACTION_OPTIONS}
        value={action}
      />
      {showsActionUrlField(action) ? <ActionUrlField block={block} controller={controller} /> : null}
    </div>
  );
}

function handleButtonActionChange(
  value: string,
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): void {
  const actionType = editableActionValue(value);
  if (actionType === null) return;
  controller.setButtonAction(block.id, actionType);
}

function fieldConfigForBlockType(type: LodariqBlock['type']): FieldConfig {
  const editableType = editableBlockTypeValue(type);
  return editableType ? EDITABLE_BLOCK_FIELD_CONFIG[editableType] : FALLBACK_FIELD_CONFIG;
}

const FALLBACK_FIELD_CONFIG = {
  fieldLabel: 'Body text',
  placeholder: 'Write supporting copy',
} as const satisfies { fieldLabel: string; placeholder: string };

function ActionUrlField({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const value = actionUrlValue(block);
  return (
    <label className="content-field action-url-field">
      <span className="field-label">Page URL</span>
      <SyncedInput
        className="block-input block-input-url"
        data-action="edit-action-url"
        data-block-id={block.id}
        aria-label="Page URL"
        committedValue={value}
        placeholder="/settings"
        onKeyDown={(event) => handleActionUrlKeyDown(event, block, controller)}
      />
    </label>
  );
}

function actionUrlValue(block: LodariqBlock): string {
  if (block.props.action?.type !== 'openPage') return '';
  return block.props.action.url ?? '';
}

function showsActionUrlField(action: string): boolean {
  return action === 'openPage';
}

function handleActionUrlKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): void {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  controller.setActionUrl(block.id, event.currentTarget.value);
}

type SyncedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'defaultValue' | 'value'> & {
  committedValue: string;
};

type SyncedTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'value'
> & {
  committedValue: string;
};

function SyncedInput({ committedValue, ...props }: SyncedInputProps) {
  const ref = useCommittedValueRef<HTMLInputElement>(committedValue);
  return <input {...props} ref={ref} defaultValue={committedValue} />;
}

function SyncedTextarea({ committedValue, ...props }: SyncedTextareaProps) {
  const ref = useCommittedValueRef<HTMLTextAreaElement>(committedValue);
  return <textarea {...props} ref={ref} defaultValue={committedValue} />;
}

function useCommittedValueRef<T extends HTMLInputElement | HTMLTextAreaElement>(
  committedValue: string,
) {
  const ref = useRef<T | null>(null);
  const previousCommittedValueRef = useRef(committedValue);

  useLayoutEffect(() => {
    const node = ref.current;
    const previousCommittedValue = previousCommittedValueRef.current;
    previousCommittedValueRef.current = committedValue;
    if (!node || node.value === committedValue) return;

    const isFocused = node.ownerDocument.activeElement === node;
    if (!isFocused || node.value === previousCommittedValue) {
      node.value = committedValue;
    }
  }, [committedValue]);

  return ref;
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
      onValueChange={(value) => handleTransformChange(value, block, controller)}
      options={EDITABLE_BLOCK_TYPES.map((type) => ({
        value: type,
        label: blockTypeLabel(type),
      }))}
      value={block.type}
    />
  );
}

function handleTransformChange(
  value: string,
  block: LodariqBlock,
  controller: LocalAuthoringFrameController,
): void {
  const blockType = editableBlockTypeValue(value);
  if (!blockType) return;
  controller.transformEditableBlock(block.id, blockType);
}
