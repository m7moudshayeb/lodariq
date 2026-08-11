import { useRef, useState } from 'react';
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
import { combinedReleaseFindings, releaseFooterSummary } from './release-findings';
import { TourSequenceRail, TourStepInspector, TourStoryboard } from './tour-sequence-rail';
import {
  ArrowLeft,
  AuthoringPopover,
  Check,
  CircleAlert,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  Palette,
  Rocket,
  Save,
  SlidersHorizontal,
} from '../design-system';

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
  const activeStep = activeStepIndex >= 0 ? (tourSteps[activeStepIndex] ?? null) : null;
  const advancedStep = tourSteps.find((step) => step.id === snapshot.advancedEditorStepId) ?? null;

  if (frameMode === 'panel') {
    if (snapshot.panelWorkflow.mode !== 'edit') {
      return (
        <section className="canvas panel-canvas" aria-label="Experience editor" tabIndex={-1}>
          <div className="document-page">
            <div className="panel-reference-workspace panel-mode-workspace">
              <PanelBodyMode controller={controller} snapshot={snapshot} />
              <PanelWorkspaceFooter controller={controller} snapshot={snapshot} step={activeStep} />
            </div>
          </div>
        </section>
      );
    }
    return (
      <section className="canvas panel-canvas" aria-label="Experience editor" tabIndex={-1}>
        <div className="document-page">
          <div className="panel-reference-workspace">
            {advancedStep ? (
              <div className="panel-storyboard-workspace panel-advanced-workspace">
                <TourStoryboard
                  activeStepId={advancedStep.id}
                  controller={controller}
                  snapshot={snapshot}
                  steps={tourSteps}
                />
                <PanelAdvancedEditor
                  controller={controller}
                  snapshot={snapshot}
                  step={advancedStep}
                />
              </div>
            ) : (
              <div className="panel-storyboard-workspace">
                <TourStoryboard
                  activeStepId={activeStepId}
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
            )}
            <PanelWorkspaceFooter
              controller={controller}
              snapshot={snapshot}
              step={advancedStep ?? activeStep}
            />
          </div>
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

function SaveStateIcon({ state }: { state: LocalAuthoringFrameSnapshot['saveState']['state'] }) {
  if (state === 'saving') {
    return <LoaderCircle className="panel-save-state-spinner" size={16} aria-hidden="true" />;
  }
  if (state === 'error') return <CircleAlert size={16} aria-hidden="true" />;
  return <Check size={16} strokeWidth={2.2} aria-hidden="true" />;
}

function PanelWorkspaceFooter({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock | null;
}) {
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const runMoreAction = (action: () => void): void => {
    setMoreActionsOpen(false);
    action();
  };

  return (
    <footer className="panel-workspace-footer" aria-label="Authoring actions">
      <span
        className="panel-footer-state"
        aria-label="Release status"
        data-release-status={snapshot.release.status}
      >
        <button
          type="button"
          className="panel-save-exit"
          onClick={() => controller.requestSaveAndExit()}
        >
          <Save size={16} strokeWidth={2} aria-hidden="true" />
          Save &amp; exit
        </button>
        <span
          className="panel-save-status"
          data-save-state
          data-state={snapshot.saveState.state}
          role="status"
          aria-live="polite"
        >
          <SaveStateIcon state={snapshot.saveState.state} />
          <span className="panel-save-status-copy">
            <strong data-save-state-label>{snapshot.saveState.label}</strong>
            <small className="panel-release-summary">
              {releaseFooterSummary(
                snapshot.release.status,
                combinedReleaseFindings(snapshot.documentState, snapshot.release.findings),
              )}
            </small>
          </span>
        </span>
      </span>
      <span className="panel-release-actions" role="group" aria-label="Experience actions">
        <button type="button" onClick={() => controller.previewFullTour()}>
          <Eye size={16} strokeWidth={2} aria-hidden="true" />
          Preview
        </button>
        <button
          type="button"
          className="publish"
          data-panel-entry="release"
          aria-label="Release options"
          onClick={() => controller.openReleaseVerificationMode()}
        >
          <Rocket size={16} strokeWidth={2} aria-hidden="true" />
          <span className="panel-release-full">Release options</span>
          <span className="panel-release-short">Release</span>
        </button>
        <AuthoringPopover
          align="end"
          content={
            <div
              className="panel-more-actions-menu"
              role="menu"
              aria-label="More experience actions"
            >
              <button
                type="button"
                data-panel-entry="appearance"
                aria-label="Customize"
                onClick={() => runMoreAction(() => controller.openAppearanceMode())}
                role="menuitem"
              >
                <Palette size={16} strokeWidth={2} aria-hidden="true" />
                <span>
                  <strong>Customize</strong>
                  <small>Brand and appearance</small>
                </span>
              </button>
              <button
                type="button"
                className="review-recovery"
                disabled={!step}
                onClick={() => {
                  if (step) runMoreAction(() => controller.openAdvancedEditor(step.id));
                }}
                role="menuitem"
              >
                <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
                <span>
                  <strong>Review &amp; recovery</strong>
                  <small>Checks, history, and recovery</small>
                </span>
              </button>
            </div>
          }
          contentClassName="panel-more-actions-popover"
          onOpenChange={setMoreActionsOpen}
          open={moreActionsOpen}
          portal
          side="top"
          trigger={
            <button
              type="button"
              className="panel-more-actions-trigger"
              aria-label="More experience actions"
            >
              <MoreHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          }
        />
      </span>
    </footer>
  );
}

function PanelAdvancedEditor({
  controller,
  snapshot,
  step,
}: {
  controller: LocalAuthoringFrameController;
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
          <ArrowLeft size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Back to editor</span>
        </button>
        <span className="panel-advanced-title">
          <small>Review &amp; recovery</small>
          <strong>{blockDisplayTitle(step)}</strong>
        </span>
        <span
          className="panel-advanced-save-status"
          data-state={snapshot.saveState.state}
          role="status"
          aria-live="polite"
        >
          <SaveStateIcon state={snapshot.saveState.state} />
          <strong data-save-state-label>{snapshot.saveState.label}</strong>
        </span>
      </header>
      <div className="document-main panel-advanced-main">
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
