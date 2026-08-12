import { authoringText } from '../../../i18n';
import { useRef } from 'react';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { isEditableControl } from '../utils';
import { BlockCard } from './block-card';
import { CanvasActions } from './canvas-actions';
import { InsertBar } from './insert-bar';
import { InlineTopLevelInsert } from './insert-menu';
import { Inspector } from './inspector';
import { TourSequenceRail } from './tour-sequence-rail';

export function StandaloneAuthoringWorkspace({
  activeStepId,
  controller,
  snapshot,
}: {
  activeStepId: string | null;
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const slashInputRef = useRef<HTMLInputElement | null>(null);
  const blocks = snapshot.documentState.blocks;
  const tourSteps = blocks.filter((block) => block.type === 'tourStep');

  return (
    <section
      className="canvas"
      aria-label={authoringText('Experience editor')}
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
        <div className="authoring-workspace">
          <TourSequenceRail
            activeStepId={activeStepId}
            controller={controller}
            snapshot={snapshot}
            steps={tourSteps}
          />
          <div className="document-main">
            <section className="document" aria-label={authoringText('Experience content')}>
              {blocks.map((block, index) => (
                <div
                  className={`document-block-group ${
                    block.id === activeStepId ? 'active-step' : 'inactive-step'
                  }`.trim()}
                  key={block.id}
                >
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
