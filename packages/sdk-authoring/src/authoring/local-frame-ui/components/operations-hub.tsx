import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LodariqBlock } from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { incompleteLocales, type CheckReport } from '../../publish-check';
import type { LocalAuthoringFrameController } from '../controller';
import {
  AUTHORING_OPERATIONS_GROUPS,
  type AuthoringOperationsTab,
  type LocalAuthoringFrameSnapshot,
} from '../types';
import {
  ChartColumn,
  CircleCheck,
  Columns2,
  ExternalLink,
  FileText,
  History,
  Languages,
  Layers,
  MapIcon,
  Mic,
  Palette,
  Rocket,
  ShieldCheck,
  Split,
  User,
  Users,
  X,
} from '../design-system';
import { useOptionalPanelModeStyles } from '../optional-panel-styles';
import { buildOperationsCheckReport, documentLocales, OperationsCheck } from './operations-check';
import { TourReviewWorkspace } from './tour-review-workspace';

const LazyTourFlowMap = lazy(async () => {
  const module = await import('./tour-flow-map');
  return { default: module.TourFlowMap };
});

const LazyTourBatchWorkspace = lazy(async () => {
  const module = await import('./tour-batch-workspace');
  return { default: module.TourBatchWorkspace };
});

/** Tier 3 sections load on demand: none of them is on the path to a first step. */
const LazyStoryboard = lazy(async () => {
  const module = await import('./operations-storyboard');
  return { default: module.OperationsStoryboard };
});
const LazyTemplates = lazy(async () => {
  const module = await import('./operations-templates');
  return { default: module.OperationsTemplates };
});
const LazyAudience = lazy(async () => {
  const module = await import('./operations-audience');
  return { default: module.OperationsAudience };
});
const LazyExperiment = lazy(async () => {
  const module = await import('./operations-experiment');
  return { default: module.OperationsExperiment };
});
const LazyAnalytics = lazy(async () => {
  const module = await import('./operations-analytics');
  return { default: module.OperationsAnalytics };
});
const LazyCollaboration = lazy(async () => {
  const module = await import('./operations-collaboration');
  return { default: module.OperationsCollaboration };
});
const LazyNarration = lazy(async () => {
  const module = await import('./operations-narration');
  return { default: module.OperationsNarration };
});
const LazyLanguage = lazy(async () => {
  const module = await import('./operations-language');
  return { default: module.OperationsLanguage };
});
const LazyAppearance = lazy(async () => {
  const module = await import('./panel-body-appearance-modes');
  return { default: module.AppearanceMode };
});
const LazyRelease = lazy(async () => {
  const module = await import('./panel-body-mode-impl');
  return { default: module.ReleaseVerificationMode };
});
const LazyRecovery = lazy(async () => {
  const module = await import('./panel-body-mode-impl');
  return { default: module.ReleaseHistoryMode };
});
const LazyShare = lazy(async () => {
  const module = await import('./operations-share');
  return { default: module.OperationsShare };
});

/**
 * Every section's name, glyph and opening line (§4.6).
 *
 * The lede is not decoration. Fourteen sections is more than anyone holds in
 * their head, and a creator who has never shipped a tour needs to know what
 * "Batch edits" or "A/B testing" will do to their work *before* they touch it.
 * Each carries its own glyph for the same reason the assist verbs do: fourteen
 * identical rows are fourteen rows nobody can scan.
 */
interface OperationsTabPresentation {
  readonly label: string;
  readonly icon: ReactNode;
  readonly lede: string;
}

const OPERATIONS_TABS: Record<AuthoringOperationsTab, OperationsTabPresentation> = {
  flow: {
    label: authoringText('Flow map'),
    icon: <MapIcon size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'The sequence, its branches and its entry points. Connector lines are decorative — every status is also in text. Click a node to jump to that step on the canvas.',
    ),
  },
  storyboard: {
    label: authoringText('Storyboard'),
    icon: <Columns2 size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Every step on one surface. The filmstrip shows order; this shows the whole story — which is how you notice that step 4 repeats step 2.',
    ),
  },
  batch: {
    label: authoringText('Batch edits'),
    icon: <Layers size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Changes across many steps at once. Every one previews the diff and asks you to confirm — anything that touches more than one step earns that friction.',
    ),
  },
  templates: {
    label: authoringText('Templates'),
    icon: <FileText size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Proven starting points. Pick one and Lodariq proposes the targets by reading your page — matched against what is actually on screen, not a placeholder you have to fix later.',
    ),
  },
  appearance: {
    label: authoringText('Appearance'),
    icon: <Palette size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Your brand theme and the named styles built on it. There is no raw-CSS layer, by decision — an escape hatch always becomes the real styling system.',
    ),
  },
  translation: {
    label: authoringText('Language'),
    icon: <Languages size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Targets are shared across locales; only the text varies. Lodariq drafts translations for you to refine — it never publishes one on your behalf.',
    ),
  },
  narration: {
    label: authoringText('Narration'),
    icon: <Mic size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'The spoken script for each step, and the voice that reads it. Written here, it also becomes the on-screen captions.',
    ),
  },
  audience: {
    label: authoringText('Audience & triggers'),
    icon: <Users size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Who sees this, when it starts, and how often. Everything here is a publish-time property — editing it never touches what is already live.',
    ),
  },
  experiment: {
    label: authoringText('A/B testing'),
    icon: <Split size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Two arms of one experience — one live slot, not two. Traffic splits automatically, and the result is measured against an event you declare, not against clicks on the tour itself.',
    ),
  },
  check: {
    label: authoringText('Check'),
    icon: <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Everything that must be true before this can publish. Saving almost always works; publishing can be blocked. Every row takes you to the thing to fix.',
    ),
  },
  analytics: {
    label: authoringText('Analytics'),
    icon: <ChartColumn size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Evidence it worked. Completions and drop-off are never gated at any plan. Full-app session replay stays permanently excluded.',
    ),
  },
  release: {
    label: authoringText('Release'),
    icon: <Rocket size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'One artifact, verified once and promoted unchanged. Production is refused at every layer from the SDK — shown disabled with the reason, never hidden.',
    ),
  },
  review: {
    label: authoringText('Review'),
    icon: <CircleCheck size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText('This step read end to end, the way a first-time user meets it.'),
  },
  recovery: {
    label: authoringText('History & recovery'),
    icon: <History size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Every version, a readable difference between any two, and a way back. Restoring never changes what is live — it makes a new draft.',
    ),
  },
  collaboration: {
    label: authoringText('Collaboration'),
    icon: <User size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Not co-editing, but three ways to keep out of each other’s way: presence, a lock on the step someone holds, and a chooser for when a lock lapses anyway.',
    ),
  },
  share: {
    label: authoringText('Share a demo'),
    icon: <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'The same experience, authored once, plays twice: as a guided tour for a real user and as a self-playing demo for a prospect. A recorded demo starts rotting the day it is taken; this one cannot.',
    ),
  },
};

/** Sections backed by the operations service rather than by the document. */
const OPERATIONS_DATA_TABS = new Set<AuthoringOperationsTab>([
  'audience',
  'experiment',
  'analytics',
  'collaboration',
]);

const OPERATIONS_GROUP_LABELS: Record<string, string> = {
  author: authoringText('Author'),
  look: authoringText('Look'),
  reach: authoringText('Reach'),
  prove: authoringText('Prove'),
  ship: authoringText('Ship'),
};

interface OperationsBadge {
  readonly count: number;
  readonly tone: 'neutral' | 'warning' | 'blocker';
  /** Read to a screen reader, which cannot infer "11" from a coloured pill. */
  readonly label: string;
}

/**
 * What each section would tell you if you opened it, on the row instead (§4.6).
 * Counts are read from the same report the section renders, so the row and the
 * section can never disagree.
 */
function operationsBadge(
  tab: AuthoringOperationsTab,
  report: CheckReport,
  snapshot: LocalAuthoringFrameSnapshot,
): OperationsBadge | null {
  if (tab === 'check') {
    if (report.rows.length === 0) return null;
    return {
      count: report.rows.length,
      tone: report.blockers.length > 0 ? 'blocker' : 'warning',
      label: authoringText('{count} to look at before publishing', { count: report.rows.length }),
    };
  }
  if (tab === 'translation') {
    const locales = incompleteLocales(snapshot.documentState, documentLocales(snapshot)).length;
    if (locales === 0) return null;
    return {
      count: locales,
      tone: 'warning',
      label: authoringText(
        locales === 1 ? '{count} language still incomplete' : '{count} languages still incomplete',
        { count: locales },
      ),
    };
  }
  if (tab === 'collaboration') {
    const open = (snapshot.comments ?? []).filter((comment) => !comment.resolved).length;
    if (open === 0) return null;
    return {
      count: open,
      tone: 'neutral',
      label: authoringText(
        open === 1 ? '{count} comment still open' : '{count} comments still open',
        { count: open },
      ),
    };
  }
  if (tab === 'recovery') {
    const versions = snapshot.panelWorkflow.releaseRecovery.model?.historyItems.length ?? 0;
    if (versions === 0) return null;
    return {
      count: versions,
      tone: 'neutral',
      label: authoringText(versions === 1 ? '{count} version kept' : '{count} versions kept', {
        count: versions,
      }),
    };
  }
  return null;
}

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
  /* Appearance, Release and History are sections here, and every card, list and
     status row they draw lives in the panel-mode stylesheet. Without this they
     render as bare markup — an ordered list where the steps should be. */
  useOptionalPanelModeStyles();

  const [tab, setTab] = useState<AuthoringOperationsTab>(snapshot.panelWorkflow.operationsTab);
  const recoveryEnvironmentId =
    snapshot.panelWorkflow.releaseRecovery.environmentId ??
    snapshot.panelWorkflow.release?.staging?.environmentId ??
    snapshot.panelWorkflow.release?.production?.environmentId ??
    null;

  /* Built here rather than in Check, so the nav badge and the section are one
     answer. Check receives it instead of recomputing. */
  const report = useMemo(() => buildOperationsCheckReport(snapshot, steps), [snapshot, steps]);

  useEffect(() => {
    setTab(snapshot.panelWorkflow.operationsTab);
  }, [snapshot.panelWorkflow.operationsTab, snapshot.panelWorkflow.focusToken]);

  /*
   * Esc closes the sheet, which the Close button has been printing as its
   * shortcut all along.
   *
   * Anything that takes Esc for itself gets it first: a menu, a select, a
   * dialog, or a field somebody is typing in. Without that, one Esc out of a
   * dropdown would throw away the whole section behind it.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [aria-expanded="true"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      controller.closeOperationsMode();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [controller]);

  // Only the sections that read control-plane data pay for it. The flow map is
  // the common reason to open Operations and needs none of it.
  useEffect(() => {
    if (!OPERATIONS_DATA_TABS.has(tab)) return;
    controller.loadOperationsData(recoveryEnvironmentId ?? undefined);
  }, [controller, recoveryEnvironmentId, tab]);

  /* What the three panel-mode openers used to load on the way in. Release and
     History are sections here, so the load has to happen without the switch. */
  useEffect(() => {
    if (tab === 'release') controller.loadReleaseForOperations();
    if (tab === 'recovery' && recoveryEnvironmentId) {
      controller.loadRecoveryForOperations(recoveryEnvironmentId);
    }
  }, [controller, recoveryEnvironmentId, tab]);

  /*
   * Every row is a section of this sheet. Appearance, Release and History used
   * to call their panel-mode openers, which swapped the whole surface out and
   * unmounted the nav — three rows out of sixteen that navigated instead of
   * switching. They render here now; the openers still exist for the chrome
   * actions and the command palette, which reach them from the canvas.
   */
  const openTab = (next: AuthoringOperationsTab): void => {
    controller.setOperationsTab(next);
    setTab(next);
  };

  return (
    /*
     * The sheet is its own shell, not a panel mode wearing one.
     *
     * `PanelModeShell` spans a header across the top and puts the body beneath
     * it, which is right for a 320px panel and wrong here: the prototype keeps
     * the section's name and opening line *inside* the scrolling body, so they
     * belong to the section and scroll away with it, and gives the nav its own
     * full-height column beside them.
     */
    <section className="operations-hub" aria-label={authoringText('Operations')}>
      <nav className="operations-hub-nav" aria-label={authoringText('Operations')}>
        <p className="operations-hub-brand">
          <Layers size={16} strokeWidth={2} aria-hidden="true" />
          {authoringText('Operations')}
        </p>
        {/*
          The experience's name is document-scoped, so it sits with the document's
          other settings rather than in the filmstrip, which is about steps.
        */}
        <label className="operations-hub-title">
          <span>{authoringText('Experience title')}</span>
          <input
            defaultValue={snapshot.documentState.title}
            key={snapshot.documentState.id}
            onBlur={(event) => controller.commitDocumentTitle(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </label>
        {AUTHORING_OPERATIONS_GROUPS.map((group) => (
          <div className="operations-hub-group" key={group.id}>
            <p className="operations-hub-group-label">{OPERATIONS_GROUP_LABELS[group.id]}</p>
            {group.tabs.map((item) => {
              const badge = operationsBadge(item, report, snapshot);
              return (
                <button
                  key={item}
                  type="button"
                  aria-current={tab === item ? 'page' : undefined}
                  data-operations-tab={item}
                  onClick={() => openTab(item)}
                >
                  <span aria-hidden="true" className="operations-hub-nav-icon">
                    {OPERATIONS_TABS[item].icon}
                  </span>
                  <span className="operations-hub-nav-label">{OPERATIONS_TABS[item].label}</span>
                  {badge ? (
                    <span
                      aria-label={badge.label}
                      className="operations-hub-badge"
                      data-tone={badge.tone}
                      role="status"
                    >
                      {badge.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
        <OperationsPlanFooter localeCount={documentLocales(snapshot).length} />
      </nav>
      <div className="operations-hub-body">
        {/* Top-right of the body, over the content it dismisses, with its
            shortcut printed next to it — the prototype's `.sclose`. */}
        <button
          className="operations-hub-close"
          onClick={() => controller.closeOperationsMode()}
          type="button"
        >
          <X size={13} strokeWidth={2.2} aria-hidden="true" />
          {authoringText('Close')}
          <kbd>{authoringText('Esc')}</kbd>
        </button>
        <header className="operations-hub-head">
          <h2 key={snapshot.panelWorkflow.focusToken} tabIndex={-1} data-panel-mode-heading>
            <span aria-hidden="true">{OPERATIONS_TABS[tab].icon}</span>
            {OPERATIONS_TABS[tab].label}
          </h2>
          <p>{OPERATIONS_TABS[tab].lede}</p>
        </header>
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
          <Suspense fallback={<OperationsLoading />}>
            <LazyLanguage controller={controller} snapshot={snapshot} />
          </Suspense>
        ) : null}
        {tab === 'batch' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyTourBatchWorkspace controller={controller} snapshot={snapshot} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'check' ? (
          <OperationsCheck
            controller={controller}
            locales={documentLocales(snapshot).length}
            report={report}
            stepCount={steps.length}
          />
        ) : null}
        {tab === 'review' && step ? (
          <TourReviewWorkspace controller={controller} snapshot={snapshot} step={step} />
        ) : null}
        {tab === 'review' && !step ? (
          <p role="status">{authoringText('Add a step from the filmstrip')}</p>
        ) : null}
        {tab === 'storyboard' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyStoryboard controller={controller} snapshot={snapshot} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'templates' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyTemplates controller={controller} />
          </Suspense>
        ) : null}
        {tab === 'narration' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyNarration controller={controller} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'audience' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyAudience controller={controller} snapshot={snapshot} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'experiment' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyExperiment controller={controller} snapshot={snapshot} />
          </Suspense>
        ) : null}
        {tab === 'analytics' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyAnalytics controller={controller} snapshot={snapshot} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'collaboration' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyCollaboration controller={controller} snapshot={snapshot} steps={steps} />
          </Suspense>
        ) : null}
        {tab === 'appearance' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyAppearance controller={controller} snapshot={snapshot} />
          </Suspense>
        ) : null}
        {tab === 'release' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyRelease controller={controller} snapshot={snapshot} />
          </Suspense>
        ) : null}
        {tab === 'recovery' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyRecovery controller={controller} snapshot={snapshot} />
          </Suspense>
        ) : null}
        {tab === 'share' ? (
          <Suspense fallback={<OperationsLoading />}>
            <LazyShare controller={controller} snapshot={snapshot} />
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}

function OperationsLoading() {
  return (
    <p aria-busy="true" aria-live="polite" role="status">
      {authoringText('Loading authoring tools…')}
    </p>
  );
}

/**
 * What this workspace is allowed, at the bottom of the nav where the prototype
 * puts it — the moment you wonder whether you can add a locale is the moment you
 * are looking at the Language row.
 *
 * WIRE_BE: only the locale count is the document's to know. Seats, live
 * experiences, the plan name and the AI allowance are the workspace's, and no
 * message carries them to this frame yet. Printing invented numbers would read
 * as a real quota, so the line says what it is waiting for instead.
 */
function OperationsPlanFooter({ localeCount }: { localeCount: number }) {
  return (
    <div className="operations-hub-plan">
      <p className="operations-hub-group-label">{authoringText('This workspace')}</p>
      <p>
        {authoringText(
          localeCount === 1
            ? '{count} language in this experience'
            : '{count} languages in this experience',
          { count: localeCount },
        )}
        <br />
        {authoringText('Seats and plan limits load with the workspace.')}
      </p>
    </div>
  );
}
