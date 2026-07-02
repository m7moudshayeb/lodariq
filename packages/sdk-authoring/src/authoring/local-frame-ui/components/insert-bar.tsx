import type { RefObject } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, Plus, Type } from '../design-system';
import { SLASH_COMMANDS, type LocalAuthoringFrameSnapshot } from '../types';
import { COMMAND_DETAILS } from './insert-menu';

const TOP_LEVEL_COMMANDS = SLASH_COMMANDS.filter((command) => command.value === 'step');

export function InsertBar({
  controller,
  snapshot,
  slashInputRef,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  slashInputRef: RefObject<HTMLInputElement | null>;
}) {
  const trimmedComposerText = snapshot.slashText.trim();
  const commandQuery = trimmedComposerText.replace(/^\//, '').toLowerCase();
  const isPlainText = trimmedComposerText.length > 0 && !trimmedComposerText.startsWith('/');
  const filteredCommands =
    commandQuery.length === 0
      ? TOP_LEVEL_COMMANDS
      : TOP_LEVEL_COMMANDS.filter((command) => {
          const details = COMMAND_DETAILS[command.value];
          return (
            command.value.includes(commandQuery) ||
            command.label.toLowerCase().includes(commandQuery) ||
            details.description.toLowerCase().includes(commandQuery)
          );
        });

  return (
    <div className="insert-bar">
      <div className="composer-line">
        <span className="composer-plus" aria-hidden="true">
          <Plus size={15} strokeWidth={2.35} />
        </span>
        <section aria-label="Add step" className="slash">
          <input
            ref={slashInputRef}
            aria-label="Experience composer"
            aria-controls="slash-command-menu"
            aria-expanded={snapshot.slashOpen}
            aria-haspopup="listbox"
            placeholder="Write the next step title"
            value={snapshot.slashText}
            onInput={() => undefined}
          />
          <div
            id="slash-command-menu"
            aria-label="Step insert commands"
            className="menu command-menu"
            hidden={!snapshot.slashOpen}
            role="listbox"
          >
            <div className="command-menu-header">
              <span>{isPlainText ? 'Add step' : 'Add a step'}</span>
              <kbd>Add</kbd>
            </div>
            {isPlainText ? (
              <AuthoringButton
                className="command-item command-item-primary"
                onPointerDown={(event) => {
                  event.preventDefault();
                  controller.appendStep(trimmedComposerText);
                }}
                onClick={(event) => {
                  if (event.detail !== 0) return;
                  controller.appendStep(trimmedComposerText);
                }}
                role="option"
              >
                <span className="command-icon" aria-hidden="true">
                  <Type size={14} strokeWidth={2.2} />
                </span>
                <span className="command-copy">
                  <strong>New step</strong>
                  <small>{trimmedComposerText}</small>
                </span>
              </AuthoringButton>
            ) : null}
            {filteredCommands.map((command) => {
              const details = COMMAND_DETAILS[command.value];
              return (
                <AuthoringButton
                  key={command.value}
                  className="command-item"
                  data-command={command.value}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    controller.activateCommand(command.value);
                  }}
                  onClick={(event) => {
                    if (event.detail !== 0) return;
                    controller.activateCommand(command.value);
                  }}
                  role="option"
                >
                  <span className="command-icon" aria-hidden="true">
                    {details.icon}
                  </span>
                  <span className="command-copy">
                    <strong>{command.label}</strong>
                    <small>{details.description}</small>
                  </span>
                  <span className="command-description">Add</span>
                </AuthoringButton>
              );
            })}
            {!isPlainText && filteredCommands.length === 0 ? (
              <div className="command-empty">Open a step to add text, buttons, or media.</div>
            ) : null}
          </div>
        </section>
        <div className="quick-insert" aria-label="Quick insert">
          <AuthoringButton
            className="add-step"
            data-action="append-step"
            icon={<Plus size={15} strokeWidth={2.3} />}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => controller.appendStep()}
            tone="primary"
          >
            New step
          </AuthoringButton>
        </div>
      </div>
    </div>
  );
}
