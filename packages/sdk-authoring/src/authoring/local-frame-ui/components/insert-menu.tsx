import { authoringText } from '../../../i18n';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { LocalAuthoringFrameController } from '../controller';
import {
  AuthoringButton,
  Heading,
  Image,
  CircleAlert,
  CircleCheck,
  Activity,
  Shapes,
  Link as LinkIcon,
  List,
  Minus,
  Plus,
  Type,
  Wand2,
  X,
} from '../design-system';
import { STEP_CONTENT_ENTRY_COMMANDS, type SlashCommand } from '../types';
import { slashCommandLabel } from '../utils';
import { claimContextualSurface } from '../../contextual-surface-coordinator';

export const COMMAND_DETAILS: Record<SlashCommand, { description: string; icon: ReactNode }> = {
  button: {
    description: authoringText('Add a button'),
    icon: <Wand2 size={14} strokeWidth={2.2} />,
  },
  heading: {
    description: authoringText('Add a title'),
    icon: <Heading size={14} strokeWidth={2.2} />,
  },
  media: {
    description: authoringText('Add an image or video'),
    icon: <Image size={14} strokeWidth={2.2} />,
  },
  callout: {
    description: authoringText('Add a callout'),
    icon: <CircleAlert size={14} strokeWidth={2.2} />,
  },
  stat: {
    description: authoringText('Add a stat'),
    icon: <Activity size={14} strokeWidth={2.2} />,
  },
  icon: {
    description: authoringText('Add an icon'),
    icon: <Shapes size={14} strokeWidth={2.2} />,
  },
  formField: {
    description: authoringText('Add a form field'),
    icon: <CircleCheck size={14} strokeWidth={2.2} />,
  },
  link: {
    description: authoringText('Add a link'),
    icon: <LinkIcon size={14} strokeWidth={2.2} />,
  },
  list: {
    description: authoringText('Add a list'),
    icon: <List size={14} strokeWidth={2.2} />,
  },
  divider: {
    description: authoringText('Add a divider'),
    icon: <Minus size={14} strokeWidth={2.2} />,
  },
  paragraph: {
    description: authoringText('Open the rich content editor'),
    icon: <Type size={14} strokeWidth={2.2} />,
  },
  step: {
    description: authoringText('Add another step'),
    icon: <Plus size={14} strokeWidth={2.25} />,
  },
};

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
      commands={STEP_CONTENT_ENTRY_COMMANDS}
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
  const insertRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<InlineCommandMenuPosition | null>(null);
  const surfaceId = useId();
  const filteredCommands = commands.filter((command) => {
    const details = COMMAND_DETAILS[command];
    const labelText = slashCommandLabel(command);
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
    return claimContextualSurface(`insert:${surfaceId}`, () => {
      setOpen(false);
      queueMicrotask(() => triggerRef.current?.focus());
    });
  }, [open, surfaceId]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => searchRef.current?.focus());
    const ownerDocument = insertRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: PointerEvent): void => {
      const eventTarget = event.target as Node;
      if (insertRef.current?.contains(eventTarget) || menuRef.current?.contains(eventTarget))
        return;
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

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const ownerWindow = trigger.ownerDocument.defaultView;
    if (!ownerWindow) return;

    const updateMenuPosition = (): void => {
      setMenuPosition(
        resolveInlineCommandMenuPosition(trigger.getBoundingClientRect(), ownerWindow),
      );
    };

    updateMenuPosition();
    if (typeof menu.showPopover === 'function' && !menu.matches(':popover-open')) {
      menu.showPopover();
    }
    ownerWindow.addEventListener('resize', updateMenuPosition);
    ownerWindow.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      ownerWindow.removeEventListener('resize', updateMenuPosition);
      ownerWindow.removeEventListener('scroll', updateMenuPosition, true);
      if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
        menu.hidePopover();
      }
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
      ref={insertRef}
    >
      <button
        type="button"
        className="inline-insert-trigger"
        ref={triggerRef}
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen((value) => !value);
          setQuery('');
        }}
      >
        <Plus size={13} strokeWidth={2.35} />
      </button>
      {open && insertRef.current
        ? createPortal(
            <div
              className="inline-command-menu"
              popover="manual"
              ref={menuRef}
              role="menu"
              style={inlineCommandMenuStyle(menuPosition)}
            >
              <div className="inline-command-header">
                <input
                  ref={searchRef}
                  className="inline-command-search"
                  aria-label={authoringText('Search content')}
                  placeholder={authoringText('Search content')}
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  onKeyDown={(event) =>
                    handleInlineCommandSearchKeyDown(event, {
                      activeCommandIndexRef,
                      commands: filteredCommands,
                      onCommand,
                      setActiveCommandIndex: setActiveCommandIndexValue,
                      setOpen,
                    })
                  }
                />
                <button
                  type="button"
                  className="inline-command-close"
                  aria-label={authoringText('Close content menu')}
                  title={authoringText('Close')}
                  onClick={() => setOpen(false)}
                >
                  <X size={16} strokeWidth={2.1} aria-hidden="true" />
                </button>
              </div>
              {filteredCommands.map((command, index) => {
                const details = COMMAND_DETAILS[command];
                const labelText = slashCommandLabel(command);
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
                <div className="inline-command-empty">{authoringText('No content found')}</div>
              ) : null}
            </div>,
            insertRef.current.ownerDocument.body,
          )
        : null}
    </div>
  );
}

interface InlineCommandMenuPosition {
  left: number;
  maxHeight: number;
  top: number;
}

const INLINE_COMMAND_MENU_WIDTH = 288;
const INLINE_COMMAND_MENU_MAX_HEIGHT = 320;
const INLINE_COMMAND_MENU_VIEWPORT_PADDING = 12;
const INLINE_COMMAND_MENU_TRIGGER_GAP = 8;

function resolveInlineCommandMenuPosition(
  triggerRect: DOMRect,
  ownerWindow: Window,
): InlineCommandMenuPosition {
  const availableWidth = ownerWindow.innerWidth - INLINE_COMMAND_MENU_VIEWPORT_PADDING * 2;
  const menuWidth = Math.min(INLINE_COMMAND_MENU_WIDTH, availableWidth);
  const idealLeft = triggerRect.left + triggerRect.width / 2 - menuWidth / 2;
  const left = Math.min(
    Math.max(idealLeft, INLINE_COMMAND_MENU_VIEWPORT_PADDING),
    ownerWindow.innerWidth - menuWidth - INLINE_COMMAND_MENU_VIEWPORT_PADDING,
  );
  const spaceBelow =
    ownerWindow.innerHeight - triggerRect.bottom - INLINE_COMMAND_MENU_VIEWPORT_PADDING;
  const spaceAbove = triggerRect.top - INLINE_COMMAND_MENU_VIEWPORT_PADDING;
  const opensAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    INLINE_COMMAND_MENU_MAX_HEIGHT,
    Math.max(
      160,
      opensAbove
        ? spaceAbove - INLINE_COMMAND_MENU_TRIGGER_GAP
        : spaceBelow - INLINE_COMMAND_MENU_TRIGGER_GAP,
    ),
  );
  const top = opensAbove
    ? Math.max(
        INLINE_COMMAND_MENU_VIEWPORT_PADDING,
        triggerRect.top - maxHeight - INLINE_COMMAND_MENU_TRIGGER_GAP,
      )
    : triggerRect.bottom + INLINE_COMMAND_MENU_TRIGGER_GAP;

  return { left, maxHeight, top };
}

function inlineCommandMenuStyle(position: InlineCommandMenuPosition | null): CSSProperties {
  if (!position) return { visibility: 'hidden' };
  return {
    left: position.left,
    maxHeight: position.maxHeight,
    top: position.top,
  };
}

function handleInlineCommandSearchKeyDown<TCommand extends SlashCommand>(
  event: KeyboardEvent<HTMLInputElement>,
  {
    activeCommandIndexRef,
    commands,
    onCommand,
    setActiveCommandIndex,
    setOpen,
  }: {
    activeCommandIndexRef: { current: number };
    commands: readonly TCommand[];
    onCommand: (command: TCommand) => void;
    setActiveCommandIndex: (index: number) => void;
    setOpen: (open: boolean) => void;
  },
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    setOpen(false);
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (commands.length === 0) return;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    setActiveCommandIndex(
      (activeCommandIndexRef.current + direction + commands.length) % commands.length,
    );
    return;
  }

  if (event.key !== 'Enter') return;
  event.preventDefault();
  const command = commands[activeCommandIndexRef.current] ?? commands[0];
  if (!command) return;
  onCommand(command);
  setOpen(false);
}
