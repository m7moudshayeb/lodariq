import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, Plus } from '../design-system';
import { STEP_CONTENT_COMMANDS, type StepContentCommand } from '../types';
import { blockTypeLabel, stepContentCommandFromQuery } from '../utils';
import { COMMAND_DETAILS } from './insert-menu';

const COMMAND_NAVIGATION_DIRECTIONS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
};

export function StepComposer({
  controller,
  index,
  stepBlockId,
}: {
  controller: LocalAuthoringFrameController;
  index: number;
  stepBlockId: string;
}) {
  const [value, setValue] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const activeCommandIndexRef = useRef(0);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const commandMenuRef = useRef<HTMLDivElement | null>(null);
  const trimmedValue = value.trim();
  const isSlashCommand = trimmedValue.startsWith('/');
  const isPlainText = trimmedValue.length > 0 && !isSlashCommand;
  const isCommandMenuOpen = trimmedValue.length > 0 || isPickerOpen;
  const showsCommands = isSlashCommand || (isPickerOpen && !isPlainText);
  const commandQuery = isSlashCommand ? trimmedValue.slice(1).toLowerCase() : '';
  const filteredCommands = filterStepContentCommands(showsCommands, commandQuery);
  const insert = (type: StepContentCommand, content?: string): void => {
    controller.insertStepContent(stepBlockId, type, index, content);
    setValue('');
    setIsPickerOpen(false);
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
    if (!isCommandMenuOpen) return;
    const ownerDocument = composerRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: PointerEvent): void => {
      if (composerRef.current?.contains(event.target as Node)) return;
      if (commandMenuRef.current?.contains(event.target as Node)) return;
      setValue('');
      setIsPickerOpen(false);
    };
    ownerDocument.addEventListener('pointerdown', handlePointerDown, true);
    return () => ownerDocument.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isCommandMenuOpen]);

  useLayoutEffect(() => {
    if (!isCommandMenuOpen) {
      setMenuPosition(null);
      return;
    }
    const input = composerInputRef.current;
    const menu = commandMenuRef.current;
    const frame = input?.ownerDocument.defaultView;
    if (!input || !menu || !frame) return;
    const positionMenu = (): void => {
      const inputRect = input.getBoundingClientRect();
      const menuHeight = menu.getBoundingClientRect().height;
      const menuWidth = Math.min(236, frame.innerWidth - 16);
      const left = Math.max(8, Math.min(inputRect.left, frame.innerWidth - menuWidth - 8));
      const below = inputRect.bottom + 6;
      const top =
        below + menuHeight <= frame.innerHeight - 8
          ? below
          : Math.max(8, inputRect.top - menuHeight - 6);
      setMenuPosition({ left, top });
    };
    positionMenu();
    frame.addEventListener('resize', positionMenu);
    frame.addEventListener('scroll', positionMenu, true);
    return () => {
      frame.removeEventListener('resize', positionMenu);
      frame.removeEventListener('scroll', positionMenu, true);
    };
  }, [filteredCommands.length, isCommandMenuOpen, isPlainText]);

  return (
    <div
      className="step-composer"
      data-command-menu-open={isCommandMenuOpen ? 'true' : undefined}
      ref={composerRef}
    >
      <button
        type="button"
        aria-controls={`step-command-menu-${stepBlockId}`}
        aria-expanded={isCommandMenuOpen}
        aria-haspopup="listbox"
        aria-label={authoringText('Open add content menu')}
        className="step-composer-plus"
        onClick={() => {
          if (isCommandMenuOpen) {
            setValue('');
            setIsPickerOpen(false);
            return;
          }
          setIsPickerOpen(true);
          setActiveCommandIndexValue(0);
          queueMicrotask(() => composerInputRef.current?.focus());
        }}
      >
        <Plus size={15} strokeWidth={2.35} />
      </button>
      <div className="step-composer-body">
        <input
          ref={composerInputRef}
          aria-controls={`step-command-menu-${stepBlockId}`}
          aria-expanded={isCommandMenuOpen}
          aria-label={authoringText('Step composer')}
          aria-haspopup="listbox"
          className="step-composer-input"
          placeholder={authoringText('Write inside this step, or type /')}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) =>
            handleStepComposerKeyDown(event, {
              activeCommandIndexRef,
              clearComposer: () => {
                setValue('');
                setIsPickerOpen(false);
                setActiveCommandIndexValue(0);
              },
              commands: filteredCommands,
              insert,
              isCommandMenuOpen,
              setActiveCommandIndex: setActiveCommandIndexValue,
            })
          }
        />
        <div className="step-quick-insert" aria-label={authoringText('Add content to this step')}>
          {STEP_CONTENT_COMMANDS.map((command) => (
            <AuthoringButton
              key={command}
              aria-label={authoringText('Add {type} to this step', {
                type: stepQuickInsertLabel(command).toLowerCase(),
              })}
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
              title={authoringText('Add {type}', {
                type: stepQuickInsertLabel(command).toLowerCase(),
              })}
              tone="ghost"
            />
          ))}
        </div>
        {isCommandMenuOpen && composerRef.current
          ? createPortal(
              <div
                ref={commandMenuRef}
                id={`step-command-menu-${stepBlockId}`}
                aria-label={authoringText('Step insert commands')}
                className="step-command-menu"
                role="listbox"
                style={
                  menuPosition
                    ? { left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }
                    : { left: '-9999px', top: '-9999px' }
                }
              >
                <div className="command-menu-header">
                  <span>{authoringText(isPlainText ? 'Add text' : 'Add content')}</span>
                  <kbd>{authoringText('Add')}</kbd>
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
                      <strong>{authoringText('Add text')}</strong>
                      <small>{trimmedValue}</small>
                    </span>
                  </AuthoringButton>
                ) : null}
                {showsCommands
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
                          <span className="command-description">{authoringText('Add')}</span>
                        </AuthoringButton>
                      );
                    })
                  : null}
                {showsCommands && filteredCommands.length === 0 ? (
                  <div className="command-empty">{authoringText('No matching content')}</div>
                ) : null}
              </div>,
              composerRef.current.ownerDocument.body,
            )
          : null}
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
    isCommandMenuOpen,
    setActiveCommandIndex,
  }: {
    activeCommandIndexRef: { current: number };
    clearComposer: () => void;
    commands: readonly StepContentCommand[];
    insert: (type: StepContentCommand, content?: string) => void;
    isCommandMenuOpen: boolean;
    setActiveCommandIndex: (index: number) => void;
  },
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    clearComposer();
    return;
  }

  const navigationDirection = COMMAND_NAVIGATION_DIRECTIONS[event.key];
  if (isCommandMenuOpen && navigationDirection !== undefined) {
    event.preventDefault();
    if (commands.length === 0) return;
    setActiveCommandIndex(
      (activeCommandIndexRef.current + navigationDirection + commands.length) % commands.length,
    );
    return;
  }

  const currentValue = event.currentTarget.value.trim();
  if (event.key !== 'Enter') return;
  event.preventDefault();

  if (currentValue === '') {
    const command = commands[activeCommandIndexRef.current] ?? commands[0];
    if (isCommandMenuOpen && command) insert(command);
    return;
  }

  if (!currentValue.startsWith('/')) {
    insert('paragraph', currentValue);
    return;
  }

  const command =
    stepContentCommandFromQuery(currentValue) ??
    commands[activeCommandIndexRef.current] ??
    commands[0];
  if (command) insert(command);
}

function stepCommandMatchesQuery(command: StepContentCommand, query: string): boolean {
  const details = COMMAND_DETAILS[command];
  const label = blockTypeLabel(command);
  return [command, label, details.description].some((item) => item.toLowerCase().includes(query));
}

function stepQuickInsertLabel(command: StepContentCommand): string {
  return STEP_QUICK_INSERT_LABELS[command];
}

const STEP_QUICK_INSERT_LABELS = {
  heading: authoringText('Title'),
  paragraph: authoringText('Text'),
  list: authoringText('List'),
  divider: authoringText('Divider'),
  button: authoringText('Button'),
  link: authoringText('Link'),
  media: authoringText('Media'),
} as const satisfies Record<StepContentCommand, string>;
