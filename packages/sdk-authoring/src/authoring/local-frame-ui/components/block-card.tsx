import { authoringText } from '../../../i18n';
import { useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  AuthoringPopover,
  Copy,
  GripVertical,
  MoreHorizontal,
  MousePointer2,
  Trash2,
} from '../design-system';
import type { LocalAuthoringFrameSnapshot } from '../types';
import {
  blockDisplayTitle,
  blockKicker,
  blockStatus,
  blockTypeLabel,
  propertyChipLabels,
  targetIdOf,
  targetLabelOf,
} from '../utils';
import { BlockBody, TransformControl } from './block-fields';
import { TargetControls } from './target-controls';

export function BlockCard({
  block,
  controller,
  snapshot,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const statusValue = blockStatus(block);
  const targetId = targetIdOf(block);
  const targetLabel = targetId ? targetLabelOf(snapshot.documentState, targetId) : '';
  const title = blockDisplayTitle(block);
  const headerTitle = block.type === 'tourStep' ? title : blockTypeLabel(block.type);
  const headerKicker = block.type === 'tourStep' ? blockKicker(block) : blockTypeLabel(block.type);
  const statusLabel = blockStatusLabel(block, statusValue, targetId);
  const needsPageElement = statusValue === 'incomplete' && block.type === 'tourStep' && !targetId;
  const showStatusBadge = statusValue !== 'ready' && !needsPageElement;
  const showAnchor = block.type === 'tourStep' || Boolean(targetId);
  const selected = snapshot.selectedBlockId === block.id;
  const dropPosition = snapshot.dragTargetBlockId === block.id ? snapshot.dragTargetPosition : null;

  return (
    <article
      className={`block document-block ${statusValue === 'ready' ? '' : statusValue} ${
        selected ? 'selected' : ''
      } ${dropPosition ? `drop-${dropPosition}` : ''}`.trim()}
      tabIndex={0}
      data-block-id={block.id}
      data-drop-position={dropPosition ?? undefined}
      data-block-status={statusValue}
      data-block-type={block.type}
      aria-label={`${blockTypeLabel(block.type)}: ${title}`}
      aria-keyshortcuts="Control+D Meta+D Delete Backspace Alt+ArrowUp Alt+ArrowDown"
      onDragOver={(event) => controller.handleBlockDragOver(event)}
      onDrop={(event) => controller.handleBlockDrop(event, block.id)}
      onFocus={() => controller.selectBlock(block.id)}
      onKeyDown={(event) => controller.handleBlockKeyDown(event, block.id)}
      onPointerDown={() => controller.selectBlock(block.id)}
    >
      <div className="block-side-rail" aria-label={`${blockTypeLabel(block.type)} controls`}>
        <button
          type="button"
          className="block-grip"
          draggable
          aria-label={`Drag ${blockTypeLabel(block.type).toLowerCase()}`}
          title={authoringText('Drag to reorder')}
          onDragEnd={() => controller.endDraggingBlock()}
          onDragStart={(event) => controller.startDraggingBlock(block.id, event)}
        >
          <GripVertical size={15} strokeWidth={2.1} />
        </button>
      </div>

      <div className="block-content">
        <header className="block-header">
          <div className="block-title">
            <span className="block-kicker">{headerKicker}</span>
            {block.type === 'tourStep' ? null : <strong title={title}>{headerTitle}</strong>}
            {showStatusBadge ? (
              <span className={`badge ${statusValue}`.trim()}>{statusLabel}</span>
            ) : null}
          </div>
          {showAnchor ? (
            <div className="block-anchor-slot">
              {targetId ? (
                <TargetControls
                  block={block}
                  targetId={targetId}
                  targetLabel={targetLabel}
                  snapshot={snapshot}
                  controller={controller}
                />
              ) : (
                <AuthoringButton
                  aria-label={authoringText('Choose placement')}
                  className={`anchor-button ${needsPageElement ? 'anchor-button-empty' : ''}`.trim()}
                  data-action="target-pick"
                  data-block-id={block.id}
                  icon={<MousePointer2 size={13} strokeWidth={2.2} />}
                  onClick={() => controller.startTargetPick(block.id)}
                >
                  {authoringText('Choose placement')}
                </AuthoringButton>
              )}
            </div>
          ) : null}
          <div className="block-header-actions">
            <BlockInlineActions block={block} controller={controller} />
            <BlockActionMenu block={block} controller={controller} />
          </div>
        </header>

        <div className="block-section block-section-content">
          <div className="block-body">
            <BlockBody
              block={block}
              controller={controller}
              dragTargetBlockId={snapshot.dragTargetBlockId}
              dragTargetPosition={snapshot.dragTargetPosition}
              selectedBlockId={snapshot.selectedBlockId}
            />
          </div>
        </div>

        {block.type === 'tourStep' ? null : (
          <div className="block-footer">
            <div className="block-tools">
              <TransformControl block={block} controller={controller} />
            </div>
            <div className="block-meta">
              {propertyChipLabels(block).map((label) => (
                <span key={label} className="property-chip" title={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function blockStatusLabel(
  block: LodariqBlock,
  statusValue: 'ready' | 'incomplete' | 'invalid',
  targetId: string | null,
): string {
  if (statusValue === 'invalid') return authoringText('Needs fix');
  if (statusValue === 'incomplete' && block.type === 'tourStep' && !targetId) {
    return authoringText('Choose placement');
  }
  if (statusValue === 'incomplete') return authoringText('Needs review');
  return authoringText('Ready');
}

function BlockInlineActions({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const label = blockTypeLabel(block.type).toLowerCase();
  return (
    <div
      className="block-inline-actions"
      aria-label={`${blockTypeLabel(block.type)} quick actions`}
    >
      <AuthoringButton
        aria-label={`Duplicate ${label}`}
        className="block-inline-action"
        data-action="duplicate-block"
        data-block-id={block.id}
        icon={<Copy size={13} strokeWidth={2.25} />}
        onClick={() => controller.duplicateTopLevelBlock(block.id)}
        title={authoringText('Duplicate')}
        tone="ghost"
      />
      <AuthoringButton
        aria-label={`Delete ${label}`}
        className="block-inline-action block-inline-action-danger"
        data-action="delete-block"
        data-block-id={block.id}
        icon={<Trash2 size={13} strokeWidth={2.25} />}
        onClick={() => controller.deleteTopLevelBlock(block.id)}
        title={authoringText('Delete')}
        tone="ghost"
      />
    </div>
  );
}

function BlockActionMenu({
  block,
  controller,
}: {
  block: LodariqBlock;
  controller: LocalAuthoringFrameController;
}) {
  const [open, setOpen] = useState(false);
  const runAction = (action: () => void): void => {
    setOpen(false);
    action();
  };
  return (
    <AuthoringPopover
      align="end"
      content={
        <div
          className="block-action-menu"
          role="menu"
          aria-label={`${blockTypeLabel(block.type)} actions`}
        >
          <div className="block-action-menu-header">
            <span>{blockTypeLabel(block.type)}</span>
            <strong>{authoringText('Actions')}</strong>
          </div>
          <AuthoringButton
            className="block-action-menu-item"
            data-action="move-block"
            data-block-id={block.id}
            data-direction="up"
            icon={<ArrowUp size={14} strokeWidth={2.2} />}
            onClick={() => runAction(() => controller.moveTopLevelBlock(block.id, 'up'))}
            role="menuitem"
          >
            {authoringText('Move up')}
          </AuthoringButton>
          <AuthoringButton
            className="block-action-menu-item"
            data-action="move-block"
            data-block-id={block.id}
            data-direction="down"
            icon={<ArrowDown size={14} strokeWidth={2.2} />}
            onClick={() => runAction(() => controller.moveTopLevelBlock(block.id, 'down'))}
            role="menuitem"
          >
            {authoringText('Move down')}
          </AuthoringButton>
        </div>
      }
      contentClassName="block-action-popover"
      onOpenChange={setOpen}
      open={open}
      trigger={
        <AuthoringButton
          aria-label={`${blockTypeLabel(block.type)} actions`}
          className="block-action-trigger"
          icon={<MoreHorizontal size={15} strokeWidth={2.2} />}
          title={`${blockTypeLabel(block.type)} actions`}
        />
      }
    />
  );
}
