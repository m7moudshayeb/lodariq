import { lazy, Suspense, useEffect, useState } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import type { LocalAuthoringFrameController } from '../controller';
import {
  AUTHORING_OPERATIONS_TABS,
  type AuthoringOperationsTab,
  type LocalAuthoringFrameSnapshot,
} from '../types';
import { ExperienceLanguageSelect } from './experience-language-select';
import { PanelModeShell } from './panel-mode-shell';
import { TourReviewWorkspace } from './tour-review-workspace';

const LazyTourFlowMap = lazy(async () => {
  const module = await import('./tour-flow-map');
  return { default: module.TourFlowMap };
});

const LazyTourBatchWorkspace = lazy(async () => {
  const module = await import('./tour-batch-workspace');
  return { default: module.TourBatchWorkspace };
});

const OPERATIONS_TAB_LABELS: Record<AuthoringOperationsTab, string> = {
  flow: authoringText('Flow'),
  translation: authoringText('Translation'),
  batch: authoringText('Batch'),
  appearance: authoringText('Appearance'),
  release: authoringText('Release'),
  review: authoringText('Review'),
  recovery: authoringText('Recovery'),
};

export function OperationsHub({
  controller,
  snapshot,
  step,
  steps,
}: {
  controller: LocalAuthoringFrameController;
  snapshot: LocalAuthoringFrameSnapshot;
  step: LodariqBlock | null;
  steps: LodariqBlock[];
}) {
  const [tab, setTab] = useState<AuthoringOperationsTab>(snapshot.panelWorkflow.operationsTab);
  const recoveryEnvironmentId =
    snapshot.panelWorkflow.releaseRecovery.environmentId ??
    snapshot.panelWorkflow.release?.staging?.environmentId ??
    snapshot.panelWorkflow.release?.production?.environmentId ??
    null;

  useEffect(() => {
    setTab(snapshot.panelWorkflow.operationsTab);
  }, [snapshot.panelWorkflow.operationsTab, snapshot.panelWorkflow.focusToken]);

  const openTab = (next: AuthoringOperationsTab): void => {
    if (next === 'appearance') {
      controller.openAppearanceMode();
      return;
    }
    if (next === 'release') {
      controller.openReleaseVerificationMode();
      return;
    }
    if (next === 'recovery') {
      if (recoveryEnvironmentId) controller.openReleaseHistoryMode(recoveryEnvironmentId);
      else controller.openReleaseVerificationMode();
      return;
    }
    controller.setOperationsTab(next);
    setTab(next);
  };

  return (
    <PanelModeShell
      className="operations-hub"
      controller={controller}
      eyebrow={authoringText('Operations')}
      focusToken={snapshot.panelWorkflow.focusToken}
      title={OPERATIONS_TAB_LABELS[tab]}
    >
      <nav className="operations-hub-nav" aria-label={authoringText('Operations')}>
        {AUTHORING_OPERATIONS_TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? 'page' : undefined}
            data-operations-tab={item}
            onClick={() => openTab(item)}
          >
            {OPERATIONS_TAB_LABELS[item]}
          </button>
        ))}
      </nav>
      <div className="operations-hub-body">
        {tab === 'flow' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyTourFlowMap
              controller={controller}
              document={snapshot.documentState}
              onClose={() => controller.closeOperationsMode()}
              steps={steps}
            />
          </Suspense>
        ) : null}
        {tab === 'translation' ? (
          <ExperienceLanguageSelect
            controller={controller}
            presentation="studio"
            snapshot={snapshot}
          />
        ) : null}
        {tab === 'batch' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyTourBatchWorkspace controller={controller} snapshot={snapshot} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'review' && step ? (
          <TourReviewWorkspace controller={controller} snapshot={snapshot} step={step} />
        ) : null}
        {tab === 'review' && !step ? (
          <p role="status">{authoringText('Add a step from the filmstrip')}</p>
        ) : null}
      </div>
    </PanelModeShell>
  );
}

function OperationsLoading() {
  return (
    <p aria-busy="true" aria-live="polite" role="status">
      {authoringText('Loading authoring tools…')}
    </p>
  );
}
