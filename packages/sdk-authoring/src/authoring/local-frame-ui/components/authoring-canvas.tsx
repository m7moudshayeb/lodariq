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
  const readyCount = blocks.filter((block) => blockStatus(block) === 'ready').length;
  const incompleteCount = blocks.filter((block) => blockStatus(block) === 'incomplete').length;

  return (
    <section
      className="canvas"
      aria-label="Tour builder"
      tabIndex={-1}
      onPointerDown={(event) => {
        if (isCommandComposerTarget(event.target)) return;
        if (isInteractiveCanvasTarget(event.target)) {
          controller.closeSlashComposer();
          return;
        }
        controller.closeSlashComposer();
        slashInputRef.current?.focus();
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
            <p className="eyebrow">Tour document</p>
            <h2>{snapshot.documentState.title}</h2>
          </div>
          <div className="document-stats" aria-label="Document status">
            <span>{blocks.length} blocks</span>
            <span>{readyCount} ready</span>
            {incompleteCount > 0 ? <span>{incompleteCount} incomplete</span> : null}
          </div>
        </header>

        <section className="document" aria-label="Canonical document blocks">
          {blocks.map((block, index) => (
            <div className="document-block-group" key={block.id}>
              {index === 0 ? (
                <InlineTopLevelInsert
                  anchorBlockId={block.id}
                  controller={controller}
                  label="Insert block before first block"
                  position="before"
                />
              ) : null}
              <BlockCard block={block} controller={controller} snapshot={snapshot} />
              <InlineTopLevelInsert
                anchorBlockId={block.id}
                controller={controller}
                label="Insert block after this block"
                position="after"
              />
            </div>
          ))}
        </section>

        <InsertBar controller={controller} snapshot={snapshot} slashInputRef={slashInputRef} />

        <Inspector controller={controller} snapshot={snapshot} />
      </div>
    </section>
  );
}

function isInteractiveCanvasTarget(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false;
  if (isEditableControl(target)) return true;
  return Boolean(
    target.closest(
      'button, summary, select, [role="button"], [role="menuitem"], .block, .inline-insert, .step-child, .target-menu, .ui-popover-content, .ui-select-content, .panel',
    ),
  );
}

function isCommandComposerTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('.slash, .command-menu'));
}
