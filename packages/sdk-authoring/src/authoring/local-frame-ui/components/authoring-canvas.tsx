import { authoringText } from '../../../i18n';
import { lazy, Suspense, useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import {
  experienceAuthoringProfile,
  selectExperienceRootBlocks,
} from '../../experience-authoring-capabilities';
import type { LocalAuthoringFrameController } from '../controller';
import type { LocalAuthoringFrameSnapshot } from '../types';
import type { LocalAuthoringInitialWorkspace } from '../../local-frame-types';
import { PanelBodyMode } from './panel-body-mode';
import { combinedReleaseFindings, releaseFooterSummary } from './release-findings';
import { TourStoryboard } from './tour-storyboard';
import { TourReviewWorkspace } from './tour-review-workspace';
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

const LazyTourStepInspector = lazy(async () => {
  const module = await import('./tour-sequence-rail');
  return { default: module.TourStepInspector };
});

const LazyTourFlowMap = lazy(async () => {
  const module = await import('./tour-flow-map');
  return { default: module.TourFlowMap };
});

const LazyTourBatchWorkspace = lazy(async () => {
  const module = await import('./tour-batch-workspace');
  return { default: module.TourBatchWorkspace };
});

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
  const activeStepIndex = tourSteps.findIndex((step) => step.id === activeStepId);
  const activeStep = activeStepIndex >= 0 ? (tourSteps[activeStepIndex] ?? null) : null;
  const advancedStep = tourSteps.find((step) => step.id === snapshot.advancedEditorStepId) ?? null;
  const opensFlowMap =
    initialWorkspace?.kind === 'flowMap' && profile.capabilities.includes('flow');
  const [flowMapOpen, setFlowMapOpen] = useState(opensFlowMap);
  const [flowMapFocusStepId, setFlowMapFocusStepId] = useState<string | null>(
    opensFlowMap ? (initialWorkspace.focusBlockId ?? null) : null,
  );
  const [flowMapFocusActionId, setFlowMapFocusActionId] = useState<string | null>(null);
  const [flowMapWorkbenchMode, setFlowMapWorkbenchMode] = useState<'branch' | 'sequence'>(
    'sequence',
  );
  const batchMode = snapshot.selectedStepIds.size > 0;

  if (frameMode === 'panel') {
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
      <section
        className="canvas panel-canvas"
        aria-label={authoringText('Experience editor')}
        tabIndex={-1}
      >
        <div className="document-page">
          <div className="panel-reference-workspace">
            {advancedStep ? (
              <div className="panel-storyboard-workspace panel-advanced-workspace panel-review-workspace">
                <TourStoryboard
                  activeStepId={advancedStep.id}
                  controller={controller}
                  flowMapOpen={false}
                  onFlowMapOpenChange={() => undefined}
                  snapshot={snapshot}
                  steps={tourSteps}
                />
                <TourReviewWorkspace
                  controller={controller}
                  snapshot={snapshot}
                  step={advancedStep}
                />
              </div>
            ) : (
              <div
                className="panel-storyboard-workspace"
                data-flow-map-open={flowMapOpen ? 'true' : 'false'}
              >
                {flowMapOpen ? null : (
                  <TourStoryboard
                    activeStepId={activeStepId}
                    controller={controller}
                    flowMapOpen={false}
                    onFlowMapOpenChange={(open) => {
                      if (open) controller.clearTourStepBatchSelection();
                      setFlowMapOpen(open);
                    }}
                    snapshot={snapshot}
                    steps={tourSteps}
                  />
                )}
                {flowMapOpen ? (
                  <Suspense fallback={<CanvasEditorLoading />}>
                    <LazyTourFlowMap
                      controller={controller}
                      document={snapshot.documentState}
                      initialActionBlockId={flowMapFocusActionId}
                      initialStepId={flowMapFocusStepId}
                      initialWorkbenchMode={flowMapWorkbenchMode}
                      onClose={() => {
                        setFlowMapFocusActionId(null);
                        setFlowMapFocusStepId(null);
                        setFlowMapOpen(false);
                      }}
                      steps={tourSteps}
                    />
                  </Suspense>
                ) : batchMode ? (
                  <Suspense fallback={<CanvasEditorLoading />}>
                    <LazyTourBatchWorkspace
                      controller={controller}
                      snapshot={snapshot}
                      steps={tourSteps}
                    />
                  </Suspense>
                ) : activeStep ? (
                  <Suspense fallback={<CanvasEditorLoading />}>
                    <LazyTourStepInspector
                      controller={controller}
                      onFlowMapOpen={(stepId, actionBlockId, mode = 'sequence') => {
                        controller.clearTourStepBatchSelection();
                        setFlowMapFocusActionId(actionBlockId);
                        setFlowMapFocusStepId(stepId);
                        setFlowMapWorkbenchMode(mode);
                        setFlowMapOpen(true);
                      }}
                      snapshot={snapshot}
                      step={activeStep}
                      stepIndex={activeStepIndex}
                    />
                  </Suspense>
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
                  if (step) runMoreAction(() => controller.openAdvancedEditor(step.id));
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
