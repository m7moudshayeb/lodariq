import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  COMMERCIAL_PLAN_LABELS,
  documentLocaleCount,
  type CommercialFeatureId,
  type CommercialUsageValue,
  type LodariqBlock,
  type WorkspaceCommercialUsage,
} from '@lodariq/schema';
import { authoringText } from '../../../i18n';
import { incompleteLocales } from '../../publish-check';
import type { LocalAuthoringFrameController } from '../controller';
import {
  AUTHORING_OPERATIONS_GROUPS,
  type AuthoringOperationsTab,
  type LocalAuthoringFrameSnapshot,
} from '../types';
import {
  ChartColumn,
  ClipboardPaste,
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
  Pencil,
  Rocket,
  ShieldCheck,
  Split,
  User,
  Users,
  Video,
  X,
} from '../design-system';
import { useOptionalPanelModeStyles } from '../optional-panel-styles';
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
const LazyVoice = lazy(async () => {
  const module = await import('./operations-voice');
  return { default: module.OperationsVoice };
});
const LazyRecord = lazy(async () => {
  const module = await import('./operations-record');
  return { default: module.OperationsRecord };
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
const LazyCopy = lazy(async () => {
  const module = await import('./operations-copy');
  return { default: module.OperationsCopy };
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
const LazyDiff = lazy(async () => {
  const module = await import('./operations-diff');
  return { default: module.OperationsDiff };
});
const LazyShare = lazy(async () => {
  const module = await import('./operations-share');
  return { default: module.OperationsShare };
});
const LazyAudit = lazy(async () => {
  const module = await import('./operations-audit');
  return { default: module.OperationsAudit };
});
const LazyCheck = lazy(async () => {
  const module = await import('./operations-check');
  return { default: module.OperationsCheck };
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
      'Every step on one surface. The filmstrip shows order; this shows the whole story — which is how a repeated or contradictory step gives itself away.',
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
  voice: {
    label: authoringText('Voice authoring'),
    icon: <Mic size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Speak a step, review the bounded proposal, and add it to the draft only when the words and intent look right.',
    ),
  },
  record: {
    label: authoringText('Record to author'),
    icon: <Video size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Capture semantic targets and lifecycle states during an explicit session, then review the proposed flow before adding draft steps.',
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
  copy: {
    label: authoringText('Copy fixes'),
    icon: <Pencil size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Turn bounded drift evidence into before-and-after copy patches with confidence, explicit apply, and undo.',
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
  diff: {
    label: authoringText('Semantic diff'),
    icon: <FileText size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Compare the available canonical baseline with this draft by meaning, then link each finding to review before release.',
    ),
  },
  collaboration: {
    label: authoringText('Collaboration'),
    icon: <User size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'Not co-editing, but three ways to keep out of each other’s way: presence, a lock on the step someone holds, and a chooser for when a lock lapses anyway.',
    ),
  },
  audit: {
    label: authoringText('Audit log'),
    icon: <ClipboardPaste size={15} strokeWidth={2} aria-hidden="true" />,
    lede: authoringText(
      'A chronological record of sensitive workspace changes, with actor and target details and a safe CSV export.',
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
  'diff',
  'copy',
  'audience',
  'experiment',
  'analytics',
  'collaboration',
  'audit',
]);

const COMMERCIAL_FEATURE_BY_OPERATIONS_TAB: Partial<
  Record<AuthoringOperationsTab, CommercialFeatureId>
> = {
  flow: 'flow-map',
  batch: 'batch-operations',
  narration: 'narration',
  audience: 'audience-segmentation',
  experiment: 'experiments',
  release: 'release-management',
  recovery: 'recovery',
  collaboration: 'presence',
  audit: 'audit-log',
};

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
 * Persisted and rendered diagnostics are available without loading the full
 * predictive Check implementation. The complete report remains deferred until
 * the creator opens Check.
 */
function operationsBadge(
  tab: AuthoringOperationsTab,
  snapshot: LocalAuthoringFrameSnapshot,
): OperationsBadge | null {
  if (tab === 'check') {
    const layoutFindings = snapshot.localeLayoutQa?.report?.findings ?? [];
    const accessibilityFindings =
      snapshot.accessibilitySweep?.result?.findings.filter(
        (finding) => finding.status === 'open',
      ) ?? [];
    const count = layoutFindings.length + accessibilityFindings.length;
    if (count === 0) return null;
    const blocked =
      layoutFindings.some((finding) => finding.status === 'failed') ||
      accessibilityFindings.some((finding) => finding.severity === 'blocker');
    return {
      count,
      tone: blocked ? 'blocker' : 'warning',
      label: authoringText('{count} to look at before publishing', { count }),
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

  const tab = snapshot.panelWorkflow.operationsTab;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const hubRef = useRef<HTMLElement | null>(null);
  const operationsViewRef = useRef(snapshot.panelWorkflow.operationsView);
  operationsViewRef.current = snapshot.panelWorkflow.operationsView;
  const recoveryEnvironmentId =
    snapshot.panelWorkflow.releaseRecovery.environmentId ??
    snapshot.panelWorkflow.release?.staging?.environmentId ??
    snapshot.panelWorkflow.release?.production?.environmentId ??
    null;

  const tabEntitled = commercialTabEnabled(tab, snapshot.commercialUsage);

  useLayoutEffect(() => {
    const view = operationsViewRef.current;
    const restore = (): void => {
      const body = bodyRef.current;
      if (!body) return;
      body.scrollTop = view.scrollTop;
      if (!view.focusKey) return;
      const target = [
        ...(hubRef.current?.querySelectorAll<HTMLElement>('[data-operations-focus-key]') ?? []),
      ].find((candidate) => candidate.dataset['operationsFocusKey'] === view.focusKey);
      target?.focus();
    };
    restore();
    queueMicrotask(restore);
    const frame = window.requestAnimationFrame(restore);
    const timers = [40, 160].map((delay) => window.setTimeout(restore, delay));
    return () => {
      window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [snapshot.panelWorkflow.focusToken, tab]);

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
    controller.loadCommercialUsage();
  }, [controller]);

  useEffect(() => {
    if (!OPERATIONS_DATA_TABS.has(tab)) return;
    controller.loadOperationsData(recoveryEnvironmentId ?? undefined);
  }, [controller, recoveryEnvironmentId, tab]);

  /* What the three panel-mode openers used to load on the way in. Release and
     History are sections here, so the load has to happen without the switch. */
  useEffect(() => {
    if (tab === 'release' || tab === 'audience') controller.loadReleaseForOperations();
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
    controller.rememberOperationsView(tab, { scrollTop: bodyRef.current?.scrollTop ?? 0 });
    controller.setOperationsTab(next);
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
    <section ref={hubRef} className="operations-hub" aria-label={authoringText('Operations')}>
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
            data-action="edit-title"
            data-operations-focus-key="experience-title"
            defaultValue={snapshot.documentState.title}
            key={`${snapshot.documentState.id}:${snapshot.documentState.title}`}
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
              const badge = operationsBadge(item, snapshot);
              const entitled = commercialTabEnabled(item, snapshot.commercialUsage);
              return (
                <button
                  key={item}
                  type="button"
                  aria-current={tab === item ? 'page' : undefined}
                  disabled={!entitled}
                  data-operations-tab={item}
                  data-operations-focus-key={`tab:${item}`}
                  onClick={() => openTab(item)}
                  title={
                    entitled
                      ? undefined
                      : authoringText('This tool is not included in the current workspace plan.')
                  }
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
        <OperationsPlanFooter
          localeCount={documentLocaleCount(
            snapshot.canonicalDocumentState ?? snapshot.documentState,
          )}
          usage={snapshot.commercialUsage}
        />
      </nav>
      <div
        ref={bodyRef}
        className="operations-hub-body"
        onFocusCapture={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          const keyed = target.closest<HTMLElement>('[data-operations-focus-key]');
          const focusKey = keyed?.dataset['operationsFocusKey'];
          if (focusKey) controller.rememberOperationsView(tab, { focusKey });
        }}
        onScroll={(event) =>
          controller.rememberOperationsView(tab, { scrollTop: event.currentTarget.scrollTop })
        }
      >
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
        {tabEntitled ? (
          <>
            {tab === 'flow' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyTourFlowMap
                  controller={controller}
                  document={snapshot.documentState}
                  initialStepId={step?.id}
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
              <Suspense fallback={<OperationsLoading />}>
                <LazyCheck controller={controller} snapshot={snapshot} steps={steps} />
              </Suspense>
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
                <LazyTemplates controller={controller} snapshot={snapshot} />
              </Suspense>
            ) : null}
            {tab === 'voice' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyVoice controller={controller} snapshot={snapshot} />
              </Suspense>
            ) : null}
            {tab === 'record' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyRecord controller={controller} snapshot={snapshot} />
              </Suspense>
            ) : null}
            {tab === 'narration' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyNarration controller={controller} steps={steps} />
              </Suspense>
            ) : null}
            {tab === 'copy' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyCopy controller={controller} snapshot={snapshot} />
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
            {tab === 'audit' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyAudit controller={controller} snapshot={snapshot} />
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
            {tab === 'diff' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyDiff controller={controller} snapshot={snapshot} />
              </Suspense>
            ) : null}
            {tab === 'share' ? (
              <Suspense fallback={<OperationsLoading />}>
                <LazyShare controller={controller} snapshot={snapshot} />
              </Suspense>
            ) : null}
          </>
        ) : (
          <p className="operations-note" role="status">
            {authoringText('This tool is not included in the current workspace plan.')}
          </p>
        )}
      </div>
    </section>
  );
}

function documentLocales(snapshot: LocalAuthoringFrameSnapshot): readonly string[] {
  const document = snapshot.canonicalDocumentState ?? snapshot.documentState;
  return document.localization?.variants.map((variant) => variant.locale) ?? [];
}

function commercialTabEnabled(
  tab: AuthoringOperationsTab,
  usage: WorkspaceCommercialUsage | undefined,
): boolean {
  const feature = COMMERCIAL_FEATURE_BY_OPERATIONS_TAB[tab];
  return !usage || !feature || usage.features.includes(feature);
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
 * Document locale coverage stays beside the server-authoritative workspace
 * limits so the footer never invents commercial state.
 */
function OperationsPlanFooter({
  localeCount,
  usage,
}: {
  localeCount: number;
  usage?: WorkspaceCommercialUsage;
}) {
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
        {usage ? (
          <>
            <br />
            {authoringText('{plan} plan', { plan: COMMERCIAL_PLAN_LABELS[usage.planId] })}
            <br />
            {usageLine(authoringText('Creator seats'), usage.creatorSeats)}
            <br />
            {usageLine(authoringText('Live experiences'), usage.liveExperiences)}
            <br />
            {usageLine(authoringText('AI credits'), usage.aiCredits)}
          </>
        ) : (
          <>
            <br />
            {authoringText('Seats and plan limits load with the workspace.')}
          </>
        )}
      </p>
    </div>
  );
}

function usageLine(label: string, usage: CommercialUsageValue): string {
  if (usage.limit === null) {
    return authoringText('{label}: {used}, no limit', { label, used: usage.used });
  }
  return authoringText('{label}: {used} of {limit}', {
    label,
    used: usage.used,
    limit: usage.limit,
  });
}
