import { useState, type ReactNode } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, Heading, Image, Plus, Type, Wand2 } from '../design-system';
import { SLASH_COMMANDS, type SlashCommand } from '../types';

export type StepContentCommand = Exclude<SlashCommand, 'step'>;

export const COMMAND_DETAILS: Record<SlashCommand, { description: string; icon: ReactNode }> = {
  button: {
    description: 'Add a tour button',
    icon: <Wand2 size={14} strokeWidth={2.2} />,
  },
  heading: {
    description: 'Add a section title',
    icon: <Heading size={14} strokeWidth={2.2} />,
  },
  media: {
    description: 'Add a media placeholder',
    icon: <Image size={14} strokeWidth={2.2} />,
  },
  paragraph: {
    description: 'Add supporting copy',
    icon: <Type size={14} strokeWidth={2.2} />,
  },
  step: {
    description: 'Add a guided tour step',
    icon: <Plus size={14} strokeWidth={2.25} />,
  },
};

const STEP_CONTENT_COMMANDS = ['heading', 'paragraph', 'button', 'media'] as const;

export function InlineTopLevelInsert({
  anchorBlockId,
  controller,
  label,
  position,
}: {
  anchorBlockId: string;
  controller: LocalAuthoringFrameController;
  label: string;
  position: 'before' | 'after';
}) {
  return (
    <InlineInsertMenu
      commands={SLASH_COMMANDS.map((command) => command.value)}
      label={label}
      onCommand={(command) => controller.insertTopLevelCommand(command, anchorBlockId, position)}
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
  label,
  onCommand,
}: {
  commands: readonly TCommand[];
  compact?: boolean;
  label: string;
  onCommand: (command: TCommand) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`inline-insert ${compact ? 'compact' : ''}`.trim()}>
      <button
        type="button"
        className="inline-insert-trigger"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Plus size={13} strokeWidth={2.35} />
      </button>
      <div className="inline-command-menu" hidden={!open} role="menu">
        {commands.map((command) => {
          const details = COMMAND_DETAILS[command];
          const labelText = SLASH_COMMANDS.find((item) => item.value === command)?.label ?? command;
          return (
            <AuthoringButton
              key={command}
              className="inline-command"
              icon={details.icon}
              onClick={() => {
                onCommand(command);
                setOpen(false);
              }}
              role="menuitem"
            >
              <span className="inline-command-copy">
                <strong>{labelText}</strong>
                <small>{details.description}</small>
              </span>
            </AuthoringButton>
          );
        })}
      </div>
    </div>
  );
}
