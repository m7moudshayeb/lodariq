import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { MoreHorizontal, MousePointerClick, SquareMousePointer, X } from '../design-system';
import { EDITABLE_ACTION_OPTIONS } from '../types';
import { blockTypeLabel, editableActionValue } from '../utils';
import { canvasToolbarStyle } from '../../canvas/canvas-style';
import type { ActionToolbarPosition } from './tour-sequence-options';
import { blockTypeEditorLabel } from './rich-text-editing';

export function ActionContextToolbar({
  block,
  onDismiss,
  onBehavior,
  onMore,
  position,
}: {
  block: LodariqBlock;
  onDismiss: () => void;
  onBehavior: () => void;
  onMore: () => void;
  position: ActionToolbarPosition | null;
}) {
  const toolbarStyle = canvasToolbarStyle(position);
  const itemLabel = block.content?.trim() || blockTypeEditorLabel(block);
  const actionValue = editableActionValue(block.props.action?.type ?? '') ?? '';
  const behaviorLabel = optionLabel(EDITABLE_ACTION_OPTIONS, actionValue, authoringText('Action'));

  return (
    <div
      className="rich-step-toolbar action-context-toolbar"
      role="toolbar"
      aria-label={authoringText('{type} configuration', {
        type: blockTypeLabel(block.type),
      })}
      data-positioned={position ? 'true' : 'false'}
      style={toolbarStyle}
    >
      <span
        className="action-context-identity action-context-type"
        title={authoringText('{type}: {label}', {
          type: blockTypeLabel(block.type),
          label: itemLabel,
        })}
      >
        <SquareMousePointer size={16} strokeWidth={2} aria-hidden="true" />
        <strong>{blockTypeLabel(block.type)}</strong>
        <small>· {itemLabel}</small>
      </span>
      <button
        type="button"
        aria-label={
          block.type === 'link' ? authoringText('Link behavior') : authoringText('Action')
        }
        title={block.type === 'link' ? authoringText('Link behavior') : authoringText('Action')}
        onClick={onBehavior}
      >
        <MousePointerClick size={15} strokeWidth={2} aria-hidden="true" />
        <span>{behaviorLabel}</span>
      </button>
      <button
        type="button"
        aria-label={authoringText('More {type} settings', {
          type: blockTypeLabel(block.type).toLowerCase(),
        })}
        title={authoringText('More settings')}
        onClick={onMore}
      >
        <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="action-context-close"
        aria-label={authoringText('Close {type} controls', {
          type: blockTypeLabel(block.type).toLowerCase(),
        })}
        title={authoringText('Close controls')}
        onClick={onDismiss}
      >
        <X size={15} strokeWidth={2.1} aria-hidden="true" />
      </button>
    </div>
  );
}

function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
  fallback: string,
): string {
  return options.find((option) => option.value === value)?.label ?? fallback;
}
