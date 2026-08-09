import { useRef, type RefObject } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import { blockDisplayTitle, isEditableControl } from '../utils';
import { BlockCard } from './block-card';
import { CanvasActions } from './canvas-actions';
import { InsertBar } from './insert-bar';
import { InlineTopLevelInsert } from './insert-menu';
import { Inspector } from './inspector';
import { PanelBodyMode } from './panel-body-mode';
import { TourSequenceRail, TourStepInspector } from './tour-sequence-rail';
import { Check, Eye, Rocket } from '../design-system';

export function AuthoringCanvas({
  controller,
  frameMode,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  frameMode: 'panel' | 'standalone';
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const slashInputRef = useRef<HTMLInputElement | null>(null);
  const blocks = snapshot.documentState.blocks;
  const tourSteps = blocks.filter((block) => block.type === 'tourStep');
  const activeStepId = activeTourStepId(tourSteps, snapshot.selectedBlockId);
  const activeStepIndex = tourSteps.findIndex((step) => step.id === activeStepId);
  const activeStep = activeStepIndex >= 0 ? tourSteps[activeStepIndex] : null;
  const advancedStep = tourSteps.find((step) => step.id === snapshot.advancedEditorStepId) ?? null;

  if (frameMode === 'panel') {
    if (snapshot.panelWorkflow.mode !== 'edit') {
      return (
        <section className="canvas panel-canvas" aria-label="Experience editor" tabIndex={-1}>
          <div className="document-page">
            <PanelBodyMode controller={controller} snapshot={snapshot} />
          </div>
        </section>
      );
    }
    return (
      <section className="canvas panel-canvas" aria-label="Experience editor" tabIndex={-1}>
        <div className="document-page">
          {advancedStep ? (
            <div className="panel-hybrid-workspace panel-advanced-workspace">
              <TourSequenceRail
                activeStepId={advancedStep.id}
                compact
                controller={controller}
                snapshot={snapshot}
                steps={tourSteps}
              />
              <PanelAdvancedEditor
                controller={controller}
                slashInputRef={slashInputRef}
                snapshot={snapshot}
                step={advancedStep}
              />
            </div>
          ) : (
            <div className="panel-reference-workspace">
              <div className="authoring-workspace panel-hybrid-workspace">
                <TourSequenceRail
                  activeStepId={activeStepId}
                  compact
                  controller={controller}
                  snapshot={snapshot}
                  steps={tourSteps}
                />
                {activeStep ? (
                  <TourStepInspector
                    controller={controller}
                    snapshot={snapshot}
                    step={activeStep}
                    stepIndex={activeStepIndex}
                  />
                ) : null}
              </div>
              <footer
                className="panel-workspace-footer"
                aria-label="Release status"
                data-release-status={snapshot.release.status}
              >
                <span className="panel-draft-state">
                  <Check size={18} strokeWidth={2.2} aria-hidden="true" />
                  Draft saved
                </span>
                <span className="panel-release-actions">
                  <button type="button" onClick={() => controller.previewFullTour()}>
                    <Eye size={16} strokeWidth={2} aria-hidden="true" />
                    Preview
                  </button>
                  <button
                    type="button"
                    className="publish"
                    onClick={() => controller.openReleaseVerificationMode()}
                  >
                    <Rocket size={16} strokeWidth={2} aria-hidden="true" />
                    Release options
                  </button>
                </span>
              </footer>
            </div>
          )}
        </div>
      </section>
    );
  }

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
        <div className="authoring-workspace">
          <TourSequenceRail
            activeStepId={activeStepId}
            controller={controller}
            snapshot={snapshot}
            steps={tourSteps}
          />
          <div className="document-main">
            <section className="document" aria-label="Experience content">
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

function PanelAdvancedEditor({
  controller,
  slashInputRef,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  slashInputRef: RefObject<HTMLInputElement | null>;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock;
}) {
  return (
    <div className="panel-advanced-editor">
      <header className="panel-advanced-header">
        <button
          type="button"
          className="panel-advanced-back"
          onClick={() => controller.closeAdvancedEditor()}
        >
          Back
        </button>
        <span>
          <small>Step settings</small>
          <strong>{blockDisplayTitle(step)}</strong>
        </span>
      </header>
      <div className="document-main panel-advanced-main">
        <section className="document" aria-label="Advanced step settings">
          <div className="document-block-group active-step">
            <BlockCard block={step} controller={controller} snapshot={snapshot} />
          </div>
        </section>
        <InsertBar controller={controller} snapshot={snapshot} slashInputRef={slashInputRef} />
        <Inspector controller={controller} snapshot={snapshot} />
      </div>
    </div>
  );
}

function isCommandComposerTarget(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest('.slash, .command-menu'));
}

function activeTourStepId(steps: LodariqBlock[], selectedBlockId: string | null): string | null {
  if (selectedBlockId) {
    const selectedStep = steps.find((step) => containsBlock(step, selectedBlockId));
    if (selectedStep) return selectedStep.id;
  }
  return steps[0]?.id ?? null;
}

function containsBlock(block: LodariqBlock, blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => containsBlock(child, blockId));
}
