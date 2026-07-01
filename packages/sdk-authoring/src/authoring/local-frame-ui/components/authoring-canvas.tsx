import { useRef } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockStatus, isEditableControl } from '../utils';
import { BlockCard } from './block-card';
import { CanvasActions } from './canvas-actions';
import { InsertBar } from './insert-bar';
import { InlineTopLevelInsert } from './insert-menu';
import { Inspector } from './inspector';

export function AuthoringCanvas({
  controller,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const slashInputRef = useRef<HTMLInputElement | null>(null);
  const blocks = snapshot.documentState.blocks;
  const tourSteps = blocks.filter((block) => block.type === 'tourStep');
  const readyCount = tourSteps.filter((block) => blockStatus(block) === 'ready').length;
  const needsReviewCount = tourSteps.filter((block) => blockStatus(block) === 'incomplete').length;
  const needsFixCount = tourSteps.filter((block) => blockStatus(block) === 'invalid').length;

  return (
    <section
      className="canvas"
      aria-label="Experience editor"
      tabIndex={-1}
      onPointerDown={(event) => {
        if (isCommandComposerTarget(event.target)) return;
        controller.closeSlashComposer();
      }}
      onKeyDown={(event) => {
        if (
          event.key !== '/' ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          isEditableControl(event.target)
        ) {
          return;
        }
        event.preventDefault();
        controller.setSlashText('/');
        queueMicrotask(() => slashInputRef.current?.focus());
      }}
    >
      <div className="document-page">
        <CanvasActions controller={controller} />
        <header className="document-hero">
          <div className="document-hero-copy">
            <div className="document-context" aria-label="Experience type">
              <span>Tour</span>
            </div>
            <input
              key={snapshot.documentState.title}
              aria-label="Experience title"
              className="document-title-input"
              data-action="edit-title"
              defaultValue={snapshot.documentState.title}
              placeholder="Untitled experience"
              onBlur={(event) => controller.commitDocumentTitle(event.currentTarget.value)}
            />
          </div>
          <div className="document-hero-meta">
            <div className="document-stats" aria-label="Experience status">
              <span>{formatCount(tourSteps.length, 'step')}</span>
              <span>{readyCount} ready</span>
              {needsReviewCount > 0 ? <span>{needsReviewCount} need review</span> : null}
              {needsFixCount > 0 ? <span>{needsFixCount} need fixes</span> : null}
            </div>
          </div>
        </header>

        <div className="authoring-workspace">
          <div className="document-main">
            <section className="document" aria-label="Experience content">
              {blocks.map((block, index) => (
                <div className="document-block-group" key={block.id}>
                  {index === 0 ? (
                    <InlineTopLevelInsert
                      anchorBlockId={block.id}
                      controller={controller}
                      dropActive={
                        snapshot.dragTargetBlockId === block.id &&
                        snapshot.dragTargetPosition === 'before'
                      }
                      label="Add step before the first step"
                      position="before"
                    />
                  ) : null}
                  <BlockCard block={block} controller={controller} snapshot={snapshot} />
                  <InlineTopLevelInsert
                    anchorBlockId={block.id}
                    controller={controller}
                    dropActive={
                      snapshot.dragTargetBlockId === block.id &&
                      snapshot.dragTargetPosition === 'after'
                    }
                    label="Add step after this step"
                    position="after"
                  />
                </div>
              ))}
            </section>

            <InsertBar controller={controller} snapshot={snapshot} slashInputRef={slashInputRef} />
            <Inspector controller={controller} snapshot={snapshot} />
          </div>
        </div>
      </div>
    </section>
  );
}

function isCommandComposerTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('.slash, .command-menu'));
}

function formatCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}
