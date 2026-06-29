import { useState } from 'react';
import type { TalmehBlock } from '@talmeh/schema';
import type { LocalAuthoringFrameController } from '../controller';
import {
  ArrowDown,
  ArrowUp,
  AuthoringButton,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MousePointer2,
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
  block: TalmehBlock;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const statusValue = blockStatus(block);
  const targetId = targetIdOf(block);
  const targetLabel = targetId ? targetLabelOf(snapshot.documentState, targetId) : '';
  const title = blockDisplayTitle(block);
  const headerTitle = block.type === 'tourStep' ? 'Tour step' : blockTypeLabel(block.type);
  const targetActionLabel = targetId ? 'Change target' : 'Select target';
  const [expanded, setExpanded] = useState(true);

  return (
    <article
      className={`block ${statusValue === 'ready' ? '' : statusValue}`.trim()}
      draggable
      tabIndex={0}
      data-block-id={block.id}
      data-block-status={statusValue}
      data-block-type={block.type}
      aria-label={`${blockTypeLabel(block.type)} block`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onDragStart={() => controller.startDraggingBlock(block.id)}
      onDragOver={(event) => controller.handleBlockDragOver(event)}
      onDrop={(event) => controller.handleBlockDrop(event, block.id)}
      onKeyDown={(event) => controller.handleBlockKeyDown(event, block.id)}
    >
      <div className="block-side-rail" aria-label={`${blockTypeLabel(block.type)} controls`}>
        <span className="block-grip" aria-hidden="true" title="Drag block">
          <GripVertical size={15} strokeWidth={2.1} />
        </span>
        <div className="block-rail-moves">
          <AuthoringButton
            aria-label="Move block up"
            className="rail-button"
            data-action="move-block"
            data-direction="up"
            data-block-id={block.id}
            icon={<ArrowUp size={14} strokeWidth={2.2} />}
            onClick={() => controller.moveTopLevelBlock(block.id, 'up')}
          />
          <AuthoringButton
            aria-label="Move block down"
            className="rail-button"
            data-action="move-block"
            data-direction="down"
            data-block-id={block.id}
            icon={<ArrowDown size={14} strokeWidth={2.2} />}
            onClick={() => controller.moveTopLevelBlock(block.id, 'down')}
          />
        </div>
      </div>

      <div className="block-content">
        <header className="block-header">
          <button
            type="button"
            className="block-collapse"
            aria-label={expanded ? 'Collapse block' : 'Expand block'}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? (
              <ChevronDown size={14} strokeWidth={2.2} />
            ) : (
              <ChevronRight size={14} strokeWidth={2.2} />
            )}
          </button>
          <div className="block-title">
            <span className="block-kicker">{blockKicker(block)}</span>
            <strong title={headerTitle}>{headerTitle}</strong>
            {block.type === 'tourStep' ? (
              <span className="block-title-preview" title={title}>
                {title}
              </span>
            ) : null}
          </div>
          <span className={`badge ${statusValue === 'ready' ? '' : statusValue}`.trim()}>
            {statusValue}
          </span>
        </header>

        {expanded ? (
          <>
            <div className="block-section block-section-content">
              <span className="block-section-label">Content</span>
              <div className="block-body">
                <BlockBody block={block} controller={controller} />
              </div>
            </div>

            <div className="block-section block-section-target">
              <span className="block-section-label">Target</span>
              <div className="target-row">
                <AuthoringButton
                  data-action="target-pick"
                  data-block-id={block.id}
                  icon={<MousePointer2 size={14} strokeWidth={2.2} />}
                  onClick={() => controller.startTargetPick(block.id)}
                >
                  {targetActionLabel}
                </AuthoringButton>
                {targetId ? (
                  <TargetControls
                    block={block}
                    targetId={targetId}
                    targetLabel={targetLabel}
                    snapshot={snapshot}
                    controller={controller}
                  />
                ) : (
                  <span className="target-empty">No target selected</span>
                )}
              </div>
            </div>

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
          </>
        ) : null}
      </div>
    </article>
  );
}
