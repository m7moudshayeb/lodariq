import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  Copy,
  MoreHorizontal,
  Trash2,
} from '../design-system';
import { blockTypeEditorLabel } from './rich-text-editing';

export function ContentBlockActionMenu({
  block,
  controller,
  hasRichContent,
  stepId,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  hasRichContent: boolean;
  stepId: string;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void): void => {
    setOpen(false);
    action();
  };
  const label = blockTypeEditorLabel(block);
  return (
    <AuthoringPopover
      align="end"
      open={open}
      onOpenChange={setOpen}
      contentClassName="rich-step-block-action-popover"
      trigger={
        <AuthoringButton
          aria-label={authoringText('{type} line actions', { type: label })}
          className="rich-step-block-actions"
          icon={<MoreHorizontal size={14} strokeWidth={2.2} />}
          title={authoringText('{type} line actions', { type: label })}
          tone="ghost"
        />
      }
      content={
        <div
          className="rich-step-block-action-menu"
          role="menu"
          aria-label={authoringText('{type} line actions', { type: label })}
        >
          {hasRichContent ? (
            <>
              <AuthoringButton
                icon={<ArrowUp size={14} strokeWidth={2.2} />}
                onClick={() =>
                  run(() =>
                    controller.moveStepActionRelativeToRichContent(stepId, block.id, 'before'),
                  )
                }
                role="menuitem"
              >
                {authoringText('Place before rich content')}
              </AuthoringButton>
              <AuthoringButton
                icon={<ArrowDown size={14} strokeWidth={2.2} />}
                onClick={() =>
                  run(() =>
                    controller.moveStepActionRelativeToRichContent(stepId, block.id, 'after'),
                  )
                }
                role="menuitem"
              >
                {authoringText('Place after rich content')}
              </AuthoringButton>
            </>
          ) : (
            <>
              <AuthoringButton
                icon={<ArrowUp size={14} strokeWidth={2.2} />}
                onClick={() => run(() => controller.moveStepContentBlock(stepId, block.id, 'up'))}
                role="menuitem"
              >
                {authoringText('Move up')}
              </AuthoringButton>
              <AuthoringButton
                icon={<ArrowDown size={14} strokeWidth={2.2} />}
                onClick={() => run(() => controller.moveStepContentBlock(stepId, block.id, 'down'))}
                role="menuitem"
              >
                {authoringText('Move down')}
              </AuthoringButton>
            </>
          )}
          <AuthoringButton
            icon={<Copy size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.duplicateStepContentBlock(stepId, block.id))}
            role="menuitem"
          >
            {authoringText('Duplicate')}
          </AuthoringButton>
          <AuthoringButton
            className="danger"
            icon={<Trash2 size={14} strokeWidth={2.2} />}
            onClick={() => run(() => controller.deleteStepContentBlock(stepId, block.id))}
            role="menuitem"
          >
            {authoringText('Delete')}
          </AuthoringButton>
        </div>
      }
    />
  );
}
