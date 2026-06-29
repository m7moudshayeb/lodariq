import type { RefObject } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import { AuthoringButton, Heading, Image, Plus, Type, Wand2 } from '../design-system';
import { SLASH_COMMANDS, type LocalAuthoringFrameSnapshot } from '../types';
import { COMMAND_DETAILS } from './insert-menu';

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
      ? SLASH_COMMANDS
      : SLASH_COMMANDS.filter((command) => {
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
        <section aria-label="Insert blocks" className="slash">
          <input
            ref={slashInputRef}
            aria-label="Block composer"
            aria-controls="slash-command-menu"
            aria-expanded={snapshot.slashOpen}
            aria-haspopup="listbox"
            placeholder="Type / for blocks, or write a paragraph"
            value={snapshot.slashText}
            onInput={(event) => controller.setSlashText(event.currentTarget.value)}
            onKeyDown={(event) => controller.handleSlashKeyDown(event)}
          />
          <div
            id="slash-command-menu"
            aria-label="Block insert commands"
            className="menu command-menu"
            hidden={!snapshot.slashOpen}
            role="listbox"
          >
            <div className="command-menu-header">
              <span>{isPlainText ? 'Create from text' : 'Insert block'}</span>
              <kbd>Enter</kbd>
            </div>
            {isPlainText ? (
              <AuthoringButton
                className="command-item command-item-primary"
                onPointerDown={(event) => {
                  event.preventDefault();
                  controller.appendBlock('paragraph', trimmedComposerText);
                }}
                onClick={(event) => {
                  if (event.detail !== 0) return;
                  controller.appendBlock('paragraph', trimmedComposerText);
                }}
                role="option"
              >
                <span className="command-icon" aria-hidden="true">
                  <Type size={14} strokeWidth={2.2} />
                </span>
                <span className="command-copy">
                  <strong>Add paragraph</strong>
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
                    <small>/{command.value}</small>
                  </span>
                  <span className="command-description">{details.description}</span>
                </AuthoringButton>
              );
            })}
            {!isPlainText && filteredCommands.length === 0 ? (
              <div className="command-empty">No matching blocks</div>
            ) : null}
          </div>
        </section>
      </div>
      <div className="quick-insert" aria-label="Quick insert">
        <AuthoringButton
          className="add-step"
          data-action="append-step"
          icon={<Plus size={15} strokeWidth={2.3} />}
          onClick={() => controller.appendStep()}
          tone="primary"
        >
          Add step
        </AuthoringButton>
        <AuthoringButton
          data-command="heading"
          icon={<Heading size={14} strokeWidth={2.2} />}
          onClick={() => controller.appendBlock('heading')}
        >
          Heading
        </AuthoringButton>
        <AuthoringButton
          data-command="paragraph"
          icon={<Type size={14} strokeWidth={2.2} />}
          onClick={() => controller.appendBlock('paragraph')}
        >
          Paragraph
        </AuthoringButton>
        <AuthoringButton
          data-command="button"
          icon={<Wand2 size={14} strokeWidth={2.2} />}
          onClick={() => controller.appendBlock('button')}
        >
          Button
        </AuthoringButton>
        <AuthoringButton
          data-command="media"
          icon={<Image size={14} strokeWidth={2.2} />}
          onClick={() => controller.appendBlock('media')}
        >
          Media
        </AuthoringButton>
      </div>
    </div>
  );
}
