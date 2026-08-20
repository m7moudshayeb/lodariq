import { authoringText } from '../../../i18n';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import {
  experienceAuthoringProfile,
  selectExperienceRootBlocks,
} from '../../experience-authoring-capabilities';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import type { LocalAuthoringInitialWorkspace } from '../../local-frame-types';
import { PanelBodyMode } from './panel-body-mode';
import { OverlayStepEditor } from './overlay-step-editor';
import { OperationsHub } from './operations-hub';
import { combinedReleaseFindings, releaseFooterSummary } from './release-findings';
import {
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

const LazyStandaloneAuthoringWorkspace = lazy(async () => {
  const module = await import('./standalone-authoring-workspace');
  return { default: module.StandaloneAuthoringWorkspace };
});

export function AuthoringCanvas({
  controller,
  frameMode,
  initialWorkspace,
  snapshot,
}: {
  controller: LocalAuthoringFrameController;
  frameMode: 'panel' | 'standalone';
  initialWorkspace?: LocalAuthoringInitialWorkspace;
  snapshot: LocalAuthoringFrameSnapshot;
}) {
  const profile = experienceAuthoringProfile(snapshot.documentState.type);
  const experienceItems = selectExperienceRootBlocks(snapshot.documentState);
  const tourSteps = profile.workspace === 'sequence' ? experienceItems : [];
  const activeStepId = activeTourStepId(tourSteps, snapshot.selectedBlockId);
  const activeStep = tourSteps.find((step) => step.id === activeStepId) ?? null;
  useEffect(() => {
    if (
      frameMode === 'panel' &&
      initialWorkspace?.kind === 'flowMap' &&
      snapshot.panelWorkflow.mode === 'edit'
    ) {
      controller.openOperationsMode('flow');
    }
  }, [controller, frameMode, initialWorkspace, snapshot.panelWorkflow.mode]);

  if (frameMode === 'panel') {
    if (snapshot.panelWorkflow.mode === 'operations') {
      return (
        <section
          className="canvas panel-canvas"
          aria-label={authoringText('Experience editor')}
          tabIndex={-1}
        >
          <div className="document-page">
            {/*
              No workspace footer here, unlike every other panel mode. The sheet
              is a place you go *from* the canvas and come back to it — Close is
              top-right and Esc works — so a Save & exit / Preview bar under it
              offers a second, different way out of a surface you have not
              finished with. The prototype's sheet has none for the same reason.
            */}
            <div className="panel-reference-workspace panel-mode-workspace">
              <OperationsHub
                controller={controller}
                snapshot={snapshot}
                step={activeStep}
                steps={tourSteps}
              />
            </div>
          </div>
        </section>
      );
    }
    if (snapshot.panelWorkflow.mode !== 'edit') {
      return (
        <section
          className="canvas panel-canvas"
          aria-label={authoringText('Experience editor')}
          tabIndex={-1}
        >
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
      <OverlayStepEditor controller={controller} snapshot={snapshot} step={activeStep} />
    );
  }

  return (
    <Suspense fallback={<CanvasEditorLoading />}>
      <LazyStandaloneAuthoringWorkspace
        activeStepId={activeStepId}
        controller={controller}
        snapshot={snapshot}
      />
    </Suspense>
  );
}

function CanvasEditorLoading() {
  return (
    <div className="canvas-editor-loading" role="status" aria-live="polite">
      <LoaderCircle size={16} aria-hidden="true" />
      {authoringText('Loading editor')}
    </div>
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
    <footer
      className="panel-workspace-footer"
      aria-label={authoringText('Authoring actions')}
      role="contentinfo"
    >
      <span
        className="panel-footer-state"
        aria-label={authoringText('Release status')}
        data-release-status={snapshot.release.status}
      >
        <button
          type="button"
          className="panel-save-exit"
          onClick={() => controller.requestSaveAndExit()}
        >
          <Save size={16} strokeWidth={2} aria-hidden="true" />
          {authoringText('Save & exit')}
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
      <span
        className="panel-release-actions"
        role="group"
        aria-label={authoringText('Experience actions')}
      >
        <button type="button" onClick={() => controller.previewFullTour()}>
          <Eye size={16} strokeWidth={2} aria-hidden="true" />
          {authoringText('Preview')}
        </button>
        <button
          type="button"
          className="publish"
          data-panel-entry="release"
          aria-label={authoringText('Release options')}
          onClick={() => controller.openReleaseVerificationMode()}
        >
          <Rocket size={16} strokeWidth={2} aria-hidden="true" />
          <span className="panel-release-full">{authoringText('Release options')}</span>
          <span className="panel-release-short">{authoringText('Release')}</span>
        </button>
        <AuthoringPopover
          align="end"
          content={
            <div
              className="panel-more-actions-menu"
              role="menu"
              aria-label={authoringText('More experience actions')}
            >
              <button
                type="button"
                data-panel-entry="appearance"
                aria-label={authoringText('Customize')}
                onClick={() => runMoreAction(() => controller.openAppearanceMode())}
                role="menuitem"
              >
                <Palette size={16} strokeWidth={2} aria-hidden="true" />
                <span>
                  <strong>{authoringText('Customize')}</strong>
                  <small>{authoringText('Brand and appearance')}</small>
                </span>
              </button>
              <button
                type="button"
                className="review-recovery"
                disabled={!step}
                onClick={() => {
                  if (!step) return;
                  runMoreAction(() => controller.openOperationsMode('review'));
                }}
                role="menuitem"
              >
                <SlidersHorizontal size={16} strokeWidth={2} aria-hidden="true" />
                <span>
                  <strong>{authoringText('Review & recovery')}</strong>
                  <small>{authoringText('Checks, history, and recovery')}</small>
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
              aria-label={authoringText('More experience actions')}
            >
              <MoreHorizontal size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          }
        />
      </span>
    </footer>
  );
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
