import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, Heading, Image, Plus, Type, Wand2 } from '../design-system';
import { SLASH_COMMANDS, type SlashCommand } from '../types';

export type StepContentCommand = Exclude<SlashCommand, 'step'>;

export const COMMAND_DETAILS: Record<SlashCommand, { description: string; icon: ReactNode }> = {
  button: {
    description: 'Add a button',
    icon: <Wand2 size={14} strokeWidth={2.2} />,
  },
  heading: {
    description: 'Add a title',
    icon: <Heading size={14} strokeWidth={2.2} />,
  },
  media: {
    description: 'Add an image or video',
    icon: <Image size={14} strokeWidth={2.2} />,
  },
  paragraph: {
    description: 'Add text',
    icon: <Type size={14} strokeWidth={2.2} />,
  },
  step: {
    description: 'Add another step',
    icon: <Plus size={14} strokeWidth={2.25} />,
  },
};

export const STEP_CONTENT_COMMANDS = ['heading', 'paragraph', 'button', 'media'] as const;
const TOP_LEVEL_COMMANDS = ['step'] as const;

export function InlineTopLevelInsert({
  anchorBlockId,
  controller,
  dropActive = false,
  label,
  position,
}: {
  anchorBlockId: string;
  controller: LocalAuthoringFrameController;
  dropActive?: boolean;
  label: string;
  position: 'before' | 'after';
}) {
  return (
    <InlineInsertMenu
      commands={TOP_LEVEL_COMMANDS}
      dropAnchorBlockId={anchorBlockId}
      dropActive={dropActive}
      dropInsertPosition={position}
      label={label}
      onCommand={(command) => controller.insertTopLevelCommand(command, anchorBlockId, position)}
      onDragOver={(event) =>
        controller.handleTopLevelInsertDragOver(event, anchorBlockId, position)
      }
      onDrop={(event) => controller.handleTopLevelInsertDrop(event, anchorBlockId, position)}
    />
  );
}

export function InlineStepInsert({
  controller,
  index,
  label,
  stepBlockId,
}: {
  controller: LocalAuthoringFrameController;
  index: number;
  label: string;
  stepBlockId: string;
}) {
  return (
    <InlineInsertMenu
      commands={STEP_CONTENT_COMMANDS}
      compact
      label={label}
      onCommand={(command) => controller.insertStepContent(stepBlockId, command, index)}
    />
  );
}

function InlineInsertMenu<TCommand extends SlashCommand>({
  commands,
  compact = false,
  dropAnchorBlockId,
  dropActive = false,
  dropInsertPosition,
  label,
  onCommand,
  onDragOver,
  onDrop,
}: {
  commands: readonly TCommand[];
  compact?: boolean;
  dropAnchorBlockId?: string;
  dropActive?: boolean;
  dropInsertPosition?: 'before' | 'after';
  label: string;
  onCommand: (command: TCommand) => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const activeCommandIndexRef = useRef(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const filteredCommands = commands.filter((command) => {
    const details = COMMAND_DETAILS[command];
    const labelText = SLASH_COMMANDS.find((item) => item.value === command)?.label ?? command;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [command, labelText, details.description].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });

  useEffect(() => {
    setActiveCommandIndexValue(0);
  }, [open, query]);

  const setActiveCommandIndexValue = (nextIndex: number): void => {
    activeCommandIndexRef.current = nextIndex;
    setActiveCommandIndex(nextIndex);
  };

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => searchRef.current?.focus());
    const ownerDocument = menuRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: PointerEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
    };
    ownerDocument.addEventListener('pointerdown', handlePointerDown, true);
    ownerDocument.addEventListener('keydown', handleKeyDown, true);
    return () => {
      ownerDocument.removeEventListener('pointerdown', handlePointerDown, true);
      ownerDocument.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  return (
    <div
      className={`inline-insert ${compact ? 'compact' : ''} ${open ? 'open' : ''} ${
        dropActive ? 'drop-active' : ''
      }`.trim()}
      data-drop-position={dropActive ? dropInsertPosition : undefined}
      data-top-level-insert-anchor-id={dropAnchorBlockId}
      data-top-level-insert-position={dropInsertPosition}
      onDragOver={onDragOver}
      onDrop={onDrop}
      ref={menuRef}
    >
      <button
        type="button"
        className="inline-insert-trigger"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen((value) => !value);
          setQuery('');
        }}
      >
        <Plus size={13} strokeWidth={2.35} />
      </button>
      <div className="inline-command-menu" hidden={!open} role="menu">
        <input
          ref={searchRef}
          className="inline-command-search"
          aria-label="Search content"
          placeholder="Search content"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              return;
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (filteredCommands.length === 0) return;
              const currentIndex = activeCommandIndexRef.current;
              const direction = event.key === 'ArrowDown' ? 1 : -1;
              setActiveCommandIndexValue(
                (currentIndex + direction + filteredCommands.length) % filteredCommands.length,
              );
              return;
            }
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const command = filteredCommands[activeCommandIndexRef.current] ?? filteredCommands[0];
            if (!command) return;
            onCommand(command);
            setOpen(false);
          }}
        />
        {filteredCommands.map((command, index) => {
          const details = COMMAND_DETAILS[command];
          const labelText = SLASH_COMMANDS.find((item) => item.value === command)?.label ?? command;
          const active = index === activeCommandIndex;
          return (
            <AuthoringButton
              key={command}
              aria-selected={active}
              className={`inline-command ${active ? 'active' : ''}`.trim()}
              icon={details.icon}
              onClick={() => {
                onCommand(command);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveCommandIndexValue(index)}
              role="menuitem"
            >
              <span className="inline-command-copy">
                <strong>{labelText}</strong>
                <small>{details.description}</small>
              </span>
            </AuthoringButton>
          );
        })}
        {filteredCommands.length === 0 ? (
          <div className="inline-command-empty">No content found</div>
        ) : null}
      </div>
    </div>
  );
}
