import type {
  CompiledDocument,
  CompiledStep,
  RuntimeLifecycleHints,
  StepChoreography,
  StepChoreographyTransition,
  StepTransitionDestination,
  AuthoringAccessibilityPreviewMode,
  JourneyHandoff,
} from '@lodariq/schema';
import { resolveExperienceAppearance } from '@lodariq/schema/brand-runtime';
import {
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_TOUR_ANCHORED_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { hostSafe } from '../host-safety';
import { assertSupportedCompiledArtifactIfVersioned } from '../artifact-compatibility';
import { applyRuntimeLocale, configureRuntimeLocale, currentRuntimeLocale } from '../i18n';
import { tourRuntimeText } from '../tour-i18n';
import { resolveCompiledDocumentLocale } from '../document-localization';
import { clearActiveContentLocale, setActiveContentLocale } from '../runtime/content-locale-state';
import type {
  ResolvedAnchor,
  ResolutionResult,
  TargetResolutionContext,
  resolve,
  resolveTarget,
} from '../resolver';
import { applyCompiledTourTheme } from './tour-theme';
import { createTourStyles } from './tour-styles';
import {
  BODY_NODE_RENDERERS,
  appendStepBody,
  applyStepComposition,
  renderTextNode,
  safeNavigationDestination,
  type RuntimeAction,
  type RuntimeBodyNode,
} from './tour-content';
import { resolveTourCompositionRecipe } from './tour-recipes';
import {
  attachTourStepIndicator,
  createTourStepIndicator,
  resolveTourStepIndicatorRecipe,
} from './tour-step-indicator';
import {
  TourPresentationCanceledError,
  TourPresentationUnavailableError,
  throwIfTourPresentationCanceled,
} from './tour-errors';
import {
  acquireNetworkActivityTracker,
  activateLifecycleControl,
  delay,
  lifecycleTextAppliesToCurrentLocale,
  nearestScrollable,
  routeMatches,
  scrollBlockFor,
  scrollIntoView,
  waitForResolvedElement,
  waitUntil,
} from './tour-lifecycle';
import { pageKeyMatches } from '@lodariq/schema/page-key';
import { canOwnPresentation, createTargetOutline } from './tour-positioning';
import type { ExperienceSurfaceDefinition } from './experience-surface-registry';
import { currentPageKey, goToPageKey, watchPageKey } from './tour-page-scope';
import {
  applyStepOutlineEmphasis,
  armBackdropClick,
  createTourBackdrop,
  resetTourBackdrop,
} from './tour-emphasis';
import type { ChoreographyRecoveryUpdate, ChoreographyStageUpdate } from './tour-choreography';
import type { ProtectedSurfaceRect } from './protected-surface';
import {
  showWhenMatches,
  type TourFlowConditionContext,
  type TourFlowConditionDiagnostic,
} from './tour-flow';
import { applyStepMotion, resolveResponsiveTourStep } from './tour-presentation';
import { executeTourSequence } from './tour-choreography-sequence';
import { runTourFlowDestination } from './tour-flow-navigation';
import { trackTourTarget } from './tour-target-tracker';
import { collectStepFormResponses, type CapturedFormResponse } from './tour-form-responses';
import { handoffDestinationUrl } from '../journey-handoff-destination';
import type { TargetApproachOutcome, TargetApproachStageUpdate } from './target-approach-runtime';

export { TourPresentationCanceledError, TourPresentationUnavailableError } from './tour-errors';
export type { ProtectedSurfaceRect } from './protected-surface';
/** The ring's default gap, so authoring chrome can sit on the ring it drew. */
export { TARGET_OUTLINE_GAP_PX } from './tour-positioning';
export type { ChoreographyRecoveryUpdate, ChoreographyStageUpdate } from './tour-choreography';
export type { TargetApproachOutcome, TargetApproachStageUpdate } from './target-approach-runtime';

export interface TourConditionDiagnostic extends TourFlowConditionDiagnostic {
  blockId: string;
}
export {
  applyStepMotion,
  resolveResponsiveTourStep,
  runtimeViewportClass,
} from './tour-presentation';
export {
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  tourCompositionPaddingVariables,
  tourPopupStyleVariables,
} from './tour-recipes';

export {
  resolveCompiledTourTheme,
  resolveTourThemeStyle,
  type ResolvedTourThemeStyle,
  type TourThemeStyleInput,
} from './tour-theme';

const DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS = 1_500;
/** Upper bound on waiting for a genuinely idle moment to warm the chunks. */
const PREFETCH_IDLE_TIMEOUT_MS = 2_000;

type RuntimeActionType = RuntimeAction['type'];
type RuntimeActionHandler = (player: TourPlayer, action: RuntimeAction) => void;
type TargetResolver = typeof resolveTarget;
type FingerprintResolver = typeof resolve;
interface ExperienceRuntimeModule {
  experienceCompletionLabel(document: CompiledDocument): string;
  experienceIsSuppressed(document: CompiledDocument): boolean;
  experienceRuntimeLabel(document: CompiledDocument): string;
  experienceSurfaceDefinition(document: CompiledDocument): ExperienceSurfaceDefinition;
  markExperienceShown(document: CompiledDocument): void;
  mountExperienceRuntime(
    document: CompiledDocument,
    host: HTMLElement,
    card: HTMLElement,
    content: HTMLElement,
    callbacks: {
      complete(): void;
      dismiss(): void;
      dismissOnOutsidePress: boolean;
      onChecklistItemChange?: TourPlayerOptions['onChecklistItemChange'];
      onSurveySubmit?: TourPlayerOptions['onSurveySubmit'];
    },
    backdrop?: HTMLElement,
  ): () => void;
}

/**
 * Exact, in-memory element chosen during authoring. It is intentionally absent
 * from compiled artifacts and is accepted only by an owned authoring preview.
 */
export interface AuthoringTargetOverride {
  stepId: string;
  element: Element;
}

/**
 * Linear tour renderer (PRD §9.3, §16.1).
 *
 * Renders overlays into a Shadow DOM root and positions them with Floating UI.
 * Shadow DOM is used for style isolation of overlays only — it is NOT claimed
 * as a JavaScript sandbox (PRD §20).
 */
export interface TourPlayerOptions {
  /** Optional BCP 47 language override for Lodariq-owned runtime controls. */
  locale?: string;
  initialStepId?: string;
  initialStepIndex?: number;
  /**
   * Mount a targetless, non-interactive Tour inside a positioned element for a
   * trusted product preview. Delivery playback remains body-mounted and
   * singleton; embedded previews may coexist because they never resolve or act
   * on customer-page targets.
   */
  embeddedPreviewContainer?: HTMLElement;
  /**
   * Opaque creator-session owner for a customer-page authoring preview.
   * Authoring previews coexist with delivery playback and suppress document
   * actions; creator-only tooling binds to this exact marker.
   */
  authoringPreviewOwnerId?: string;
  /** Explicit full-preview mode; enables real tour navigation in authoring. */
  authoringPreviewInteractive?: boolean;
  authoringAccessibilityMode?: AuthoringAccessibilityPreviewMode;
  /** Creator-only live anchor used while the selected element remains connected. */
  authoringTargetOverride?: AuthoringTargetOverride;
  onStepChange?: (index: number, step: CompiledStep) => void;
  /**
   * Answers a visitor gave on the step being left. Customer content, so it is
   * handed over separately from analytics and never as event properties.
   */
  onFormResponses?: (responses: readonly CapturedFormResponse[]) => void;
  onBeforeStepChange?: (index: number, step: CompiledStep) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  onStart?: () => void;
  onFrequencySuppressed?: () => void;
  onChecklistItemChange?: (
    blockId: string,
    completed: boolean,
    completedCount: number,
    total: number,
  ) => void;
  onSurveySubmit?: () => void;
  /** Explicit visitor choice to end the entire tour before completion. */
  onSkip?: () => void;
  /** One bounded result per step attempt for privacy-safe diagnostics. */
  onTargetResolution?: (step: CompiledStep, result: TourTargetResolutionDiagnostic) => void;
  /** One bounded stage update for each immutable approach leg. */
  onTargetApproachStageChange?: (step: CompiledStep, update: TargetApproachStageUpdate) => void;
  onTargetApproachOutcome?: (step: CompiledStep, outcome: TargetApproachOutcome) => void;
  /** Bounded, payload-free stage diagnostics for runtime progress and telemetry. */
  onChoreographyStageChange?: (step: CompiledStep, update: ChoreographyStageUpdate) => void;
  onChoreographyRecovery?: (step: CompiledStep, update: ChoreographyRecoveryUpdate) => void;
  /** Authoring-only live chrome rectangles; never used to resolve or activate a target. */
  getAuthoringProtectedSurfaces?: () => readonly ProtectedSurfaceRect[];
  /** Authoring-only runtime card geometry for reciprocal chrome avoidance. */
  onAuthoringSurfaceChange?: (rect: ProtectedSurfaceRect | null) => void;
  /** Explicit SDK-provided safe state used only by closed flow conditions. */
  flowConditionContext?: Pick<TourFlowConditionContext, 'identifyTraits' | 'documentState'>;
  /** Lazy adaptive wrapper hook; absent in the base renderer. */
  skipStep?: (step: CompiledStep) => boolean;
  onConditionDiagnostic?: (step: CompiledStep, diagnostic: TourConditionDiagnostic) => void;
  onBranchChoice?: (step: CompiledStep, ruleIndex: number | null, destination: string) => void;
  /** Fires immediately before this origin navigates away for a cross-app handoff. */
  onJourneyHandoff?: (step: CompiledStep, handoff: JourneyHandoff, destination: string) => void;
  /** Resolves server-validated asset IDs; canonical documents never carry raw src attributes. */
  resolveMediaAsset?: (
    assetId: string,
    kind: 'image' | 'video' | 'captions' | 'audio',
  ) => string | null | Promise<string | null>;
  /** Opaque delivery context used by Target Identity V2 hard gates. */
  targetResolutionContext?: TargetResolutionContext;
}

export class TourPlayer {
  private static active: TourPlayer | null = null;
  private static readonly actionHandlers: Readonly<
    Record<RuntimeActionType, RuntimeActionHandler>
  > = {
    back: (player) => player.previous(),
    clickTarget: (player) => player.clickCurrentTarget(),
    complete: (player) => player.complete(),
    dismiss: (player) => player.dismiss(),
    next: (player) => player.next(),
    openPage: (player, action) => player.openPage(action),
    runSequence: (player, action) => {
      if (action.type === 'runSequence') void player.runSequence(action.sequence);
    },
  };

  private index: number;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly card: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly targetOutline: HTMLDivElement | null;
  private readonly backdrop: HTMLDivElement;
  private readonly cleanups: Array<() => void> = [];
  private readonly lifetimeCleanups: Array<() => void> = [];
  private renderAbortController: AbortController | null = null;
  private readiness: TourPresentationReadiness | null = null;
  private renderId = 0;
  private choreographyRetryCount = 0;
  private completionStepActive = false;
  private stepTransitionPending = false;
  private cancelExitMotion: (() => void) | null = null;
  private pendingStepTransition: (() => void) | null = null;
  private readonly completedStepIds = new Set<string>();
  private readonly accessibilityAnnouncements: string[] = [];
  private announcementRegion: HTMLParagraphElement | null = null;
  private restoreFocusTarget: HTMLElement | null = null;
  private targetResolver: TargetResolver | null = null;
  private fingerprintResolver: FingerprintResolver | null = null;
  private narrationUnlocked = false;
  private experienceRuntime: ExperienceRuntimeModule | null = null;
  private startGeneration = 0;

  private experienceRuntimeStart: Promise<void> | null = null;
  /** The page the current step appeared on; null until it has appeared. */
  private stepPageKey: string | null = null;
  private suspendedForPage = false;
  private pageScopeWatched = false;
  private sequenceDepth = 0;

  readonly contentLocale: string;

  constructor(
    private readonly doc: CompiledDocument,
    private readonly options: TourPlayerOptions = {},
  ) {
    assertSupportedCompiledArtifactIfVersioned(doc);
    if (options.locale) configureRuntimeLocale([options.locale]);
    const localized = resolveCompiledDocumentLocale(doc, options.locale ?? currentRuntimeLocale());
    this.doc = localized.document;
    this.contentLocale = localized.locale;
    const previewContainer = options.embeddedPreviewContainer;
    if (previewContainer && this.doc.steps.some((step) => step.targetId)) {
      throw new Error('Embedded Tour previews must use targetless compiled steps');
    }
    this.index = initialStepIndex(this.doc, options);
    this.host = document.createElement('lodariq-tour');
    applyRuntimeLocale(this.host);
    this.host.lang = this.contentLocale;
    this.host.dir = contentLocaleDirection(this.contentLocale);
    this.host.dataset['lodariqContentLocale'] = this.contentLocale;
    const authoringPreviewOwnerId = options.authoringPreviewOwnerId?.trim();
    if (options.authoringPreviewOwnerId !== undefined && !authoringPreviewOwnerId) {
      throw new Error('Lodariq authoring preview owner id is required');
    }
    if (options.authoringTargetOverride && !authoringPreviewOwnerId) {
      throw new Error('Lodariq authoring target overrides require an owned authoring preview');
    }
    if (authoringPreviewOwnerId) {
      this.host.setAttribute(LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE, authoringPreviewOwnerId);
    }
    if (options.authoringPreviewInteractive) {
      this.host.setAttribute('data-lodariq-preview-interactive', '');
    }
    if (options.authoringAccessibilityMode && !authoringPreviewOwnerId) {
      throw new Error('Lodariq accessibility preview requires an owned authoring preview');
    }
    if (options.authoringAccessibilityMode) {
      this.host.dataset['lodariqAccessibilityPreview'] = options.authoringAccessibilityMode;
      if (options.authoringAccessibilityMode === 'rtl') this.host.dir = 'rtl';
    }
    if (previewContainer) {
      this.host.setAttribute('data-lodariq-embedded-preview', '');
      this.host.setAttribute('aria-hidden', 'true');
      this.host.setAttribute('inert', '');
    }
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.card = document.createElement('div');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', tourRuntimeText('Lodariq tour'));
    this.card.setAttribute('aria-live', 'polite');
    this.card.tabIndex = -1;
    this.card.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || this.options.embeddedPreviewContainer) return;
      if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) return;
      event.preventDefault();
      this.dismiss();
    });
    this.arrow = document.createElement('div');
    this.arrow.className = 'tour-arrow';
    this.arrow.setAttribute('aria-hidden', 'true');
    this.targetOutline = resolveExperienceAppearance(
      'appearance' in this.doc ? this.doc.appearance : undefined,
    ).displayTargetOutline
      ? createTargetOutline(document)
      : null;
    this.backdrop = createTourBackdrop(document);
    this.lifetimeCleanups.push(applyCompiledTourTheme(this.host, this.doc));
    this.shadow.appendChild(createTourStyles());
    this.shadow.appendChild(this.backdrop);
    if (this.targetOutline) this.shadow.appendChild(this.targetOutline);
    this.shadow.appendChild(this.card);
  }

  start(): void {
    const generation = ++this.startGeneration;
    if (documentExperienceType(this.doc) !== 'tour' && !this.experienceRuntime) {
      const pending = import('./experience-runtime')
        .then((experienceRuntime) => {
          if (generation !== this.startGeneration) return;
          this.experienceRuntime = experienceRuntime;
          this.card.setAttribute(
            'aria-label',
            this.experienceRuntime.experienceRuntimeLabel(this.doc),
          );
          this.startReady();
        });
      this.experienceRuntimeStart = pending;
      void pending
        .catch(() => {})
        .finally(() => {
          if (this.experienceRuntimeStart === pending) this.experienceRuntimeStart = null;
        });
      return;
    }
    this.startReady();
  }

  private startReady(): void {
    if (
      !this.options.authoringPreviewOwnerId &&
      !this.options.embeddedPreviewContainer &&
      this.experienceRuntime?.experienceIsSuppressed(this.doc)
    ) {
      this.options.onFrequencySuppressed?.();
      return;
    }
    if (!this.options.authoringPreviewOwnerId && !this.options.embeddedPreviewContainer) {
      this.experienceRuntime?.markExperienceShown(this.doc);
      this.options.onStart?.();
    }
    const previewContainer = this.options.embeddedPreviewContainer;
    if (!previewContainer && !this.options.authoringPreviewOwnerId) {
      if (TourPlayer.active && TourPlayer.active !== this) TourPlayer.active.stop();
      TourPlayer.active = this;
      setActiveContentLocale(this.contentLocale);
    }
    if (!this.host.isConnected) {
      const activeElement = document.activeElement;
      if (!previewContainer && activeElement instanceof HTMLElement) {
        this.restoreFocusTarget = activeElement;
      }
      (previewContainer ?? document.body).appendChild(this.host);
    }
    const firstIndex = this.displayableStepIndex(this.index, 1);
    if (firstIndex < 0) {
      this.completeNow();
      return;
    }
    this.index = firstIndex;
    this.watchPageScope();
    this.render();
    this.prefetchResolutionChunks();
  }

  /**
   * Warm the chunks findTarget imports so the first interaction pays no fetch.
   * The approach engine is only worth fetching for a tour that can reach it.
   */
  private prefetchResolutionChunks(): void {
    if (this.options.embeddedPreviewContainer || typeof window === 'undefined') return;
    const view = window;
    let cancelled = false;
    const warm = (): void => {
      if (cancelled) return;
      void this.ensureResolvers().catch(() => undefined);
      if (this.documentHasTargetApproach()) {
        void import('./target-approach-runtime').catch(() => undefined);
      }
    };
    if (typeof view.requestIdleCallback === 'function') {
      const handle = view.requestIdleCallback(warm, { timeout: PREFETCH_IDLE_TIMEOUT_MS });
      this.lifetimeCleanups.push(() => {
        cancelled = true;
        view.cancelIdleCallback?.(handle);
      });
      return;
    }
    const timer = setTimeout(warm, PREFETCH_IDLE_TIMEOUT_MS);
    this.lifetimeCleanups.push(() => {
      cancelled = true;
      clearTimeout(timer);
    });
  }

  private documentHasTargetApproach(): boolean {
    return this.doc.steps.some((step) => this.targetHasApproach(step.targetId));
  }

  /** Suspend a displayed step when the visitor leaves the page it appeared on. */
  private watchPageScope(): void {
    if (this.pageScopeWatched || !this.pageScopeApplies()) return;
    this.pageScopeWatched = true;
    const watch = watchPageKey(() => this.applyPageScope());
    this.lifetimeCleanups.push(watch.stop);
  }

  /** The editing canvas owns its own page navigation; visitor preview does not. */
  private pageScopeApplies(): boolean {
    if (this.options.embeddedPreviewContainer) return false;
    if (!this.options.authoringPreviewOwnerId) return true;
    return Boolean(this.options.authoringPreviewInteractive);
  }

  private markStepPage(renderId: number): void {
    if (renderId !== this.renderId || !this.pageScopeApplies()) return;
    this.stepPageKey = currentPageKey();
  }

  private applyPageScope(): void {
    if (this.sequenceDepth > 0) return;
    // No page of its own means the step never found its target where it landed,
    // which is what a resumed step looks like on the wrong screen. The visitor
    // moving is the one event that can change that answer, so it tries again
    // rather than staying dead for the rest of the visit.
    if (!this.stepPageKey) {
      this.render();
      return;
    }
    const suspend = currentPageKey() !== this.stepPageKey;
    if (suspend === this.suspendedForPage) return;
    if (!suspend) {
      this.render();
      return;
    }
    this.suspendedForPage = true;
    this.invalidateCurrentRender(new TourPresentationCanceledError());
    this.renderId += 1;
    this.clearStepEffects();
    this.card.hidden = true;
    if (this.targetOutline) this.targetOutline.hidden = true;
    this.backdrop.hidden = true;
  }

  /**
   * Resolves for the current step only after its card is presentable. Targeted
   * steps wait for a safely resolved, visible owner and completed positioning.
   */
  waitUntilReady(): Promise<void> {
    const readiness = this.readiness;
    if (readiness) return readiness.promise;
    const pending = this.experienceRuntimeStart;
    if (pending) {
      return pending.then(() => {
        const startedReadiness = this.readiness;
        if (startedReadiness) return startedReadiness.promise;
        throw new TourPresentationUnavailableError(tourRuntimeText('Lodariq tour has not started'));
      });
    }
    return Promise.reject(
      new TourPresentationUnavailableError(tourRuntimeText('Lodariq tour has not started')),
    );
  }

  next(): void {
    this.leaveCurrentStep(() => this.advanceToNext(true));
  }

  previous(): void {
    const previousIndex = this.displayableStepIndex(this.index - 1, -1);
    const previousStep = this.doc.steps[previousIndex];
    if (!previousStep) return;
    this.leaveCurrentStep(() => {
      this.notifyBeforeStepChange(previousIndex, previousStep);
      this.index = previousIndex;
      this.render();
    });
  }

  private advanceToNext(notify: boolean): void {
    // A step that hands off ends this application's part of the journey; the
    // destination continues it. Nothing after this line runs on this origin.
    if (this.leaveForHandoff(this.doc.steps[this.index])) return;
    // Steps whose visibility rule excludes this visitor are stepped over, not
    // rendered and hidden — a card that flashes and vanishes is worse than one
    // that never appears.
    const nextIndex = this.displayableStepIndex(this.index + 1, 1);
    const nextStep = this.doc.steps[nextIndex];
    if (!nextStep) {
      this.completeNow();
      return;
    }
    if (notify) this.notifyBeforeStepChange(nextIndex, nextStep);
    this.index = nextIndex;
    this.render();
  }

  /**
   * Navigates to the application this step hands off to, carrying progress in
   * the URL because the two origins share no storage. Returns false — and stays
   * put — whenever the destination cannot be resolved from the artifact, so a
   * misconfigured handoff degrades to an ordinary next step.
   */
  private leaveForHandoff(step: CompiledStep | undefined): boolean {
    const handoff = step?.handoff;
    if (!handoff || this.options.authoringPreviewOwnerId || this.options.embeddedPreviewContainer) {
      return false;
    }
    const applications = 'applications' in this.doc ? this.doc.applications : undefined;
    const application = applications?.find((entry) => entry.id === handoff.applicationId);
    if (!application) return false;
    const destination = handoffDestinationUrl(application, {
      applicationId: handoff.applicationId,
      documentId: handoff.documentId ?? this.doc.documentId,
      stepId: step!.id,
      contentHash: this.doc.contentHash,
      resumeMode: handoff.resumeMode,
      issuedAt: Date.now(),
    });
    if (!destination) return false;
    this.options.onJourneyHandoff?.(step!, handoff, destination);
    window.location.assign(destination);
    return true;
  }

  /** A step with no rule always shows, so existing documents behave unchanged. */
  private stepIsVisible(step: CompiledStep | undefined): boolean {
    if (!step) return false;
    const matches = !step.showWhen || showWhenMatches(step.showWhen, this.flowConditionContext());
    return matches && !this.options.skipStep?.(step);
  }

  private displayableStepIndex(startIndex: number, direction: 1 | -1): number {
    for (let index = startIndex; this.doc.steps[index]; index += direction) {
      if (this.stepIsVisible(this.doc.steps[index])) return index;
    }
    return -1;
  }

  stop(): void {
    this.startGeneration += 1;
    this.cancelPendingStepTransition();
    this.invalidateCurrentRender(new TourPresentationCanceledError());
    this.renderId += 1;
    this.clearStepEffects();
    while (this.lifetimeCleanups.length) this.lifetimeCleanups.pop()?.();
    this.pageScopeWatched = false;
    this.stepPageKey = null;
    this.suspendedForPage = false;
    this.sequenceDepth = 0;
    if (TourPlayer.active === this) {
      TourPlayer.active = null;
      clearActiveContentLocale();
    }
    this.host.remove();
    const focusTarget = this.restoreFocusTarget;
    this.restoreFocusTarget = null;
    if (focusTarget?.isConnected) {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch {
        focusTarget.focus();
      }
    }
    if (this.options.authoringPreviewOwnerId) this.options.onAuthoringSurfaceChange?.(null);
  }

  private render(): void {
    // Cancelling the exit motion skips the animation; the navigation behind it
    // still runs, and its own render supersedes this one.
    if (this.flushPendingStepTransition()) return;
    this.invalidateCurrentRender(new TourPresentationCanceledError());
    // A new render establishes its own page; the previous step's does not carry.
    this.stepPageKey = null;
    this.suspendedForPage = false;
    const renderId = ++this.renderId;
    const abortController = new AbortController();
    this.renderAbortController = abortController;
    this.readiness = createTourPresentationReadiness(renderId);
    const sourceStep = this.doc.steps[this.index];
    const step = sourceStep
      ? resolveResponsiveTourStep(sourceStep, document.documentElement.clientWidth)
      : undefined;
    if (!step) {
      this.rejectReadiness(
        renderId,
        new TourPresentationUnavailableError(
          tourRuntimeText('Lodariq tour has no presentable step'),
        ),
      );
      return;
    }
    this.clearStepEffects();
    this.choreographyRetryCount = 0;
    if (this.targetOutline) this.targetOutline.hidden = true;
    if (!step.targetId || !step.emphasis?.backdrop) resetTourBackdrop(this.backdrop);
    else this.backdrop.hidden = true;
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    // A target still gates appearance, so the card waits for one either way.
    this.card.hidden = Boolean(step.targetId);
    this.card.style.removeProperty('visibility');
    /*
     * An anchored card is placed by the positioner once its target resolves. A
     * targetless one never goes through that path, so without this it inherits
     * the host's origin and renders in the page's top-left corner, over whatever
     * the product has there.
     */
    const anchorsToTarget = this.surfaceAnchorsToTarget(step);
    this.card.toggleAttribute(LODARIQ_TOUR_ANCHORED_ATTRIBUTE, anchorsToTarget);
    applyStepComposition(this.card, step);
    applyStepMotion(this.card, step);
    this.card.setAttribute('aria-label', step.accessibilityName ?? this.runtimeLabel());
    if (this.targetOutline) {
      if (step.spotlight) {
        this.targetOutline.dataset['lodariqSpotlight'] = step.spotlight.emphasis;
        this.targetOutline.dataset['lodariqSpotlightPulse'] = step.spotlight.pulse
          ? 'true'
          : 'false';
      } else {
        delete this.targetOutline.dataset['lodariqSpotlight'];
        delete this.targetOutline.dataset['lodariqSpotlightPulse'];
      }
    }
    applyStepOutlineEmphasis(this.targetOutline, step.emphasis);
    this.addCleanup(
      armBackdropClick(this.backdrop, step.emphasis?.backdrop, {
        advance: () => this.next(),
        dismiss: () => this.dismiss(),
      }),
    );
    const content = this.card.ownerDocument.createElement('div');
    content.className = 'tour-content';
    this.announcementRegion = this.card.ownerDocument.createElement('p');
    visuallyHideElement(this.announcementRegion);
    this.announcementRegion.setAttribute('role', 'status');
    this.announcementRegion.setAttribute('aria-live', 'polite');
    this.announcementRegion.setAttribute('aria-atomic', 'true');
    content.appendChild(this.announcementRegion);
    let conditionDiagnosticCount = 0;
    const conditionContext = this.flowConditionContext();
    appendStepBody(
      content,
      step,
      (node) => this.createBodyElement(node),
      (node) =>
        showWhenMatches(node.props.showWhen, conditionContext, (diagnostic) => {
          if (conditionDiagnosticCount >= 8) return;
          conditionDiagnosticCount += 1;
          try {
            this.options.onConditionDiagnostic?.(step, { ...diagnostic, blockId: node.id });
          } catch {
            /* Diagnostics hooks must never alter content visibility. */
          }
        }),
    );
    // Denominator is the authored step count, held fixed: a total that moved as
    // conditions resolved would be more confusing than one that overstates.
    const totalSteps = this.doc.steps.length;
    const indicatorRecipe = resolveTourStepIndicatorRecipe(
      'experience' in this.doc ? this.doc.experience : undefined,
      totalSteps,
      resolveTourCompositionRecipe(step.tooltipLayout).actionLayout,
    );
    const stepIndicator = createTourStepIndicator(
      this.card.ownerDocument,
      indicatorRecipe,
      this.index,
      totalSteps,
    );
    if (stepIndicator) attachTourStepIndicator(content, stepIndicator, indicatorRecipe.placement);
    this.recordAccessibilityAnnouncement(step.accessibilityName ?? this.runtimeLabel(), false);
    this.card.appendChild(content);
    const experienceRuntimeCleanup = this.experienceRuntime?.mountExperienceRuntime(
      this.doc,
      this.host,
      this.card,
      content,
      {
        complete: () => this.complete(),
        dismiss: () => this.dismiss(),
        dismissOnOutsidePress:
          !this.options.embeddedPreviewContainer && !this.options.authoringPreviewOwnerId,
        ...(this.options.onChecklistItemChange
          ? { onChecklistItemChange: this.options.onChecklistItemChange }
          : {}),
        ...(this.options.onSurveySubmit ? { onSurveySubmit: this.options.onSurveySubmit } : {}),
      },
      this.backdrop,
    );
    if (experienceRuntimeCleanup) this.addCleanup(experienceRuntimeCleanup);
    this.armNarration(step, content, renderId, abortController.signal);
    if ('showLodariqBadge' in this.doc && this.doc.showLodariqBadge) {
      void import('./tour-badge')
        .then(({ appendTourBadge }) => appendTourBadge(this.card))
        .catch(() => {});
    }
    if (this.options.authoringAccessibilityMode) {
      void import('./tour-accessibility-preview').then(
        ({ appendAuthoringAccessibilityEvidence }) => {
          if (content.parentElement !== this.card) return;
          appendAuthoringAccessibilityEvidence(
            content,
            step,
            this.options.authoringAccessibilityMode,
            this.accessibilityAnnouncements,
          );
        },
      );
    }
    this.arrow.hidden = !anchorsToTarget || step.tooltipLayout?.showArrow === false;
    this.card.appendChild(this.arrow);
    this.armEntrySequence(step, renderId, abortController.signal);

    if (!step.targetId) {
      let lifecycleWait: Promise<void> | null = null;
      if (
        !this.options.embeddedPreviewContainer &&
        (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive)
      ) {
        focusTourCard(this.card);
        if (step.lifecycle) {
          lifecycleWait = this.waitForLifecycle(step.lifecycle, abortController.signal);
        }
      }
      // A step waiting on a route belongs to the page it is waiting for, not
      // the one it was queued on, so the page is read once the wait settles.
      if (lifecycleWait) void lifecycleWait.then(() => this.markStepPage(renderId)).catch(() => {});
      else this.markStepPage(renderId);
      this.resolveReadiness(renderId);
      return;
    }
    void this.findTarget(step, abortController.signal)
      .then((target) => {
        if (
          abortController.signal.aborted ||
          renderId !== this.renderId ||
          !this.host.isConnected
        ) {
          return;
        }
        if (!target) {
          this.stepPageKey = null;
          this.suspendedForPage = false;
          this.rejectReadiness(
            renderId,
            new TourPresentationUnavailableError(
              `Lodariq tour target could not be resolved for step ${step.id}`,
            ),
          );
          return;
        }
        this.markStepPage(renderId);
        if (!anchorsToTarget) {
          this.presentAtViewport(step, target.element, renderId);
          return;
        }
        this.trackLiveTarget(step, target, renderId);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        const presentationError = normalizeTourPresentationError(error);
        if (this.targetHasApproach(step.targetId)) {
          this.showTargetApproachRecovery(renderId);
        }
        this.rejectReadiness(renderId, presentationError);
      });
  }

  /**
   * Where the surface sits. A target scopes *when* an experience appears; only
   * a target-anchored surface is also placed by it, so a banner given a target
   * stays a banner instead of turning back into a tour tooltip.
   */
  private surfaceAnchorsToTarget(step: CompiledStep): boolean {
    if (!step.targetId) return false;
    return this.experienceRuntime?.experienceSurfaceDefinition(this.doc).anchor !== 'viewport';
  }

  /**
   * Its target has been found, which is the only thing the target decided. The
   * surface's own stylesheet places it; no positioner runs and no arrow points.
   */
  private presentAtViewport(step: CompiledStep, target: Element, renderId: number): void {
    this.card.hidden = false;
    if (
      !this.options.embeddedPreviewContainer &&
      (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive)
    ) {
      this.scrollForLifecycle(target, step.lifecycle);
      focusTourCard(this.card);
    }
    this.resolveReadiness(renderId);
  }

  private showTargetApproachRecovery(renderId: number): void {
    this.card.hidden = false;
    this.card.removeAttribute(LODARIQ_TOUR_ANCHORED_ATTRIBUTE);
    this.recordAccessibilityAnnouncement(tourRuntimeText('This step could not continue.'), false);
    void import('./target-approach-runtime').then(({ showTargetApproachRecovery }) =>
      showTargetApproachRecovery(this.card, () => renderId === this.renderId, {
        retry: () => this.render(),
        skip: () => this.next(),
        dismiss: () => this.dismiss(),
      }),
    );
  }

  private armEntrySequence(step: CompiledStep, renderId: number, signal: AbortSignal): void {
    if (!step.entrySequence || this.options.embeddedPreviewContainer) return;
    if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) return;
    void this.waitUntilReady()
      .then(() => {
        if (signal.aborted || renderId !== this.renderId || !this.host.isConnected) return;
        void this.runSequence(step.entrySequence!);
      })
      .catch(() => {});
  }

  private armNarration(
    step: CompiledStep,
    content: HTMLElement,
    renderId: number,
    signal: AbortSignal,
  ): void {
    if (!step.narration || this.options.embeddedPreviewContainer) return;
    if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) return;
    let cleanup: (() => void) | null = null;
    let disposed = false;
    this.addCleanup(() => {
      disposed = true;
      cleanup?.();
    });
    void import('./tour-narration')
      .then(({ mountTourNarration }) =>
        mountTourNarration(content, step.narration!, {
          autoplay: this.narrationUnlocked,
          resolveMediaAsset: this.options.resolveMediaAsset,
          onPlayGesture: () => {
            this.narrationUnlocked = true;
          },
          onEnded: () => {
            if (!signal.aborted && renderId === this.renderId) this.next();
          },
        }),
      )
      .then((dispose) => {
        if (disposed || signal.aborted || renderId !== this.renderId) dispose();
        else cleanup = dispose;
      })
      .catch(() => {});
  }

  private createBodyElement(node: RuntimeBodyNode): HTMLElement {
    const renderer = BODY_NODE_RENDERERS[node.type] ?? renderTextNode;
    return renderer(node, {
      onAction: (action) => this.handleAction(action),
      resolveMediaAsset: this.options.resolveMediaAsset,
    });
  }

  private flowConditionContext(): TourFlowConditionContext {
    return {
      ...this.options.flowConditionContext,
      locale: this.contentLocale,
      completedStepIds: this.completedStepIds,
    };
  }

  private handleAction(action: RuntimeAction | undefined): void {
    if (!action || this.options.embeddedPreviewContainer) {
      return;
    }
    if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) {
      return;
    }
    if (action.type === 'runSequence') {
      void this.runSequence(action.sequence, action.transition);
      return;
    }
    if (action.transition) {
      this.followActionTransition(action.transition);
      return;
    }
    TourPlayer.actionHandlers[action.type](this, action);
  }

  private followActionTransition(transition: NonNullable<RuntimeAction['transition']>): void {
    const step = this.doc.steps[this.index];
    if (!step) return;
    this.completedStepIds.add(step.id);
    void this.resolveActionTransition(step, transition);
  }

  private async resolveActionTransition(
    step: CompiledStep,
    transition: NonNullable<RuntimeAction['transition']>,
  ): Promise<void> {
    const { resolveStepTransition } = await import('./tour-flow');
    if (!this.host.isConnected) return;
    const resolved = resolveStepTransition(transition, {
      ...this.options.flowConditionContext,
      locale: this.contentLocale,
      completedStepIds: this.completedStepIds,
    });
    try {
      this.options.onBranchChoice?.(
        step,
        resolved.ruleIndex,
        resolved.destination.type === 'step'
          ? resolved.destination.stepId
          : resolved.destination.type,
      );
    } catch {
      /* Diagnostics hooks must never alter branch evaluation. */
    }
    this.recordAccessibilityAnnouncement(tourRuntimeText('Tour path selected'));
    this.runFlowDestination(resolved.destination);
  }

  private runFlowDestination(destination: StepTransitionDestination): void {
    runTourFlowDestination(destination, {
      complete: () => this.complete(),
      dismiss: () => this.dismiss(),
      goToStep: (stepId) => this.goToStep(stepId),
      next: () => this.next(),
    });
  }

  private complete(): void {
    this.leaveCurrentStep(() => this.completeNow());
  }

  private completeNow(): void {
    const completion = 'completion' in this.doc ? this.doc.completion : undefined;
    if (!this.completionStepActive && completion) {
      if (completion.type === 'showStep') {
        const nextIndex = this.doc.steps.findIndex((step) => step.id === completion.stepId);
        if (nextIndex >= 0 && nextIndex !== this.index) {
          this.completionStepActive = true;
          this.goToStepNow(completion.stepId);
          return;
        }
      }
      if (completion.type === 'activateTarget') {
        this.activateCompletionTarget(completion.targetId);
      }
      if (completion.type === 'openPage') {
        const destination = safeNavigationDestination(completion.url);
        if (destination?.kind === 'external') {
          window.open(destination.href, '_blank', 'noopener,noreferrer');
        } else if (destination) {
          window.location.assign(destination.href);
        }
      }
    }
    if (completion?.type !== 'stop') {
      const completionAnnouncement =
        this.experienceRuntime?.experienceCompletionLabel(this.doc) ??
        tourRuntimeText('Tour complete');
      this.recordAccessibilityAnnouncement(completionAnnouncement, false);
      const ownerDocument = this.host.ownerDocument;
      void import('./tour-completion-announcement').then(({ announceAfterTourStops }) => {
        announceAfterTourStops(ownerDocument, completionAnnouncement);
      });
    }
    this.captureFormResponses();
    this.options.onComplete?.();
    this.stop();
  }

  private activateCompletionTarget(targetId: string): void {
    const target = this.doc.targets.find((candidate) => candidate.id === targetId);
    if (!target) return;
    void this.ensureResolvers().then(() => {
      const result = this.targetResolver?.(target, document, {
        ...this.options.targetResolutionContext,
        requiredAction: 'observe-click',
      });
      if (!result?.anchor?.interactionSafe || !canOwnPresentation(result.anchor)) return;
      if (result.anchor.element instanceof HTMLElement) result.anchor.element.click();
    });
  }

  private dismiss(): void {
    this.leaveCurrentStep(() => this.dismissNow());
  }

  private dismissNow(): void {
    // Someone who answers and then closes still answered.
    this.captureFormResponses();
    this.options.onDismiss?.();
    this.stop();
  }

  private openPage(action: RuntimeAction): void {
    if (action.type !== 'openPage') return;
    this.leaveCurrentStep(() => this.openPageNow(action));
  }

  private openPageNow(action: Extract<RuntimeAction, { type: 'openPage' }>): void {
    const destination = safeNavigationDestination(action.url);
    if (!destination) return;
    if (destination.kind === 'external') {
      window.open(destination.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (destination.kind === 'internal' && action.navigationBehavior === 'continue') {
      this.prepareToContinueAfterNavigation();
    }
    window.location.assign(destination.href);
  }

  private prepareToContinueAfterNavigation(): void {
    const nextIndex = this.displayableStepIndex(this.index + 1, 1);
    const nextStep = this.doc.steps[nextIndex];
    if (nextStep) {
      this.notifyBeforeStepChange(nextIndex, nextStep);
      return;
    }
    this.completeNow();
  }

  private async runSequence(
    sequence: StepChoreography,
    actionTransition?: NonNullable<RuntimeAction['transition']>,
  ): Promise<void> {
    const step = this.doc.steps[this.index];
    const signal = this.renderAbortController?.signal;
    if (!step || !signal || signal.aborted || !this.host.isConnected) return;
    this.card.querySelector('.tour-choreography-recovery')?.remove();
    this.sequenceDepth += 1;
    try {
      await this.runSequenceStages(sequence, step, signal, actionTransition);
    } finally {
      this.sequenceDepth -= 1;
      // The sequence may have walked the visitor somewhere its step does not
      // belong, so the deferred decision is taken now rather than dropped.
      if (this.sequenceDepth === 0) this.applyPageScope();
    }
  }

  private async runSequenceStages(
    sequence: StepChoreography,
    step: CompiledStep,
    signal: AbortSignal,
    actionTransition?: NonNullable<RuntimeAction['transition']>,
  ): Promise<void> {
    await this.ensureResolvers();
    if (signal.aborted || !this.host.isConnected) return;
    const result = await executeTourSequence({
      sequence,
      signal,
      step,
      resolveTarget: (targetId, requiredAction) =>
        this.resolveChoreographyTarget(targetId, requiredAction),
      runTransition: () => {
        if (actionTransition) this.followActionTransition(actionTransition);
        else this.runChoreographyTransition(sequence.transition);
      },
      onStageUpdate: (update) => {
        if (update.stage === 'wait' && update.status === 'started') {
          this.recordAccessibilityAnnouncement(tourRuntimeText('Waiting for the next condition'));
        }
        try {
          this.options.onChoreographyStageChange?.(step, update);
        } catch {
          /* Diagnostics hooks must never alter playback. */
        }
      },
    });
    if (result === 'aborted') return;
    if (result === 'completed') {
      this.notifyChoreographyRecovery(step, 'completed');
      return;
    }
    if (result === 'dismiss') this.dismiss();
    else if (result === 'skip') {
      this.notifyChoreographyRecovery(step, 'skipped');
      this.next();
    } else if (typeof result === 'object') this.goToStep(result.stepId);
    else if (result === 'retry' && this.choreographyRetryCount === 0) {
      this.choreographyRetryCount += 1;
      this.notifyChoreographyRecovery(step, 'retried');
      void this.runSequence(sequence, actionTransition);
    } else {
      this.showChoreographyRecovery(sequence, actionTransition);
    }
  }

  private resolveChoreographyTarget(
    targetId: string,
    requiredAction: 'activate' | 'observe-click' | 'focus' | 'input' | 'anchor',
  ): Element | null {
    const step = this.doc.steps[this.index];
    if (step?.targetId === targetId) {
      const override = this.resolveAuthoringTargetOverride(step)?.anchor;
      if (override && (override.interactionSafe || requiredAction === 'anchor')) {
        return override.element;
      }
    }
    const target = this.doc.targets.find((candidate) => candidate.id === targetId);
    if (!target) return null;
    const result = this.targetResolver?.(target, document, {
      ...this.options.targetResolutionContext,
      requiredAction: requiredAction === 'activate' ? 'observe-click' : requiredAction,
    });
    if (!result?.anchor || !canOwnPresentation(result.anchor)) return null;
    if (requiredAction !== 'anchor' && !result.anchor.interactionSafe) return null;
    return result.anchor.element;
  }

  private runChoreographyTransition(transition: StepChoreographyTransition): void {
    if (transition.type === 'next') {
      this.next();
      return;
    }
    if (transition.type === 'complete') {
      this.complete();
      return;
    }
    if (transition.type === 'step') this.goToStep(transition.stepId);
  }

  private goToStep(stepId: string): void {
    this.leaveCurrentStep(() => this.goToStepNow(stepId));
  }

  private goToStepNow(stepId: string): void {
    const requestedIndex = this.doc.steps.findIndex((candidate) => candidate.id === stepId);
    if (requestedIndex < 0) return;
    let nextIndex = this.displayableStepIndex(requestedIndex, 1);
    if (nextIndex === this.index) nextIndex = this.displayableStepIndex(this.index + 1, 1);
    const nextStep = this.doc.steps[nextIndex];
    if (nextIndex < 0 || !nextStep) {
      this.completeNow();
      return;
    }
    this.notifyBeforeStepChange(nextIndex, nextStep);
    this.index = nextIndex;
    this.render();
  }

  private showChoreographyRecovery(
    sequence: StepChoreography,
    actionTransition?: NonNullable<RuntimeAction['transition']>,
  ): void {
    this.recordAccessibilityAnnouncement(tourRuntimeText('This step could not continue.'), false);
    if (this.options.authoringPreviewOwnerId) return;
    void import('./tour-choreography-recovery').then(({ showTourChoreographyRecovery }) => {
      if (!this.card.isConnected) return;
      showTourChoreographyRecovery(this.card, {
        dismiss: () => this.dismiss(),
        retry: () => {
          const step = this.doc.steps[this.index];
          if (step) this.notifyChoreographyRecovery(step, 'retried');
          void this.runSequence(sequence, actionTransition);
        },
        skip: () => {
          const step = this.doc.steps[this.index];
          if (step) this.notifyChoreographyRecovery(step, 'skipped');
          this.next();
        },
      });
    });
  }

  private notifyChoreographyRecovery(
    step: CompiledStep,
    status: ChoreographyRecoveryUpdate['status'],
  ): void {
    try {
      this.options.onChoreographyRecovery?.(step, {
        status,
        retryCount: this.choreographyRetryCount,
      });
    } catch {
      /* Diagnostics hooks must never alter playback. */
    }
  }

  private recordAccessibilityAnnouncement(message: string, announce = true): void {
    if (this.accessibilityAnnouncements[this.accessibilityAnnouncements.length - 1] !== message) {
      this.accessibilityAnnouncements.push(message);
      if (this.accessibilityAnnouncements.length > 20) this.accessibilityAnnouncements.shift();
    }
    if (announce && this.announcementRegion) this.announcementRegion.textContent = message;
    const content = this.card.querySelector<HTMLElement>('.tour-content');
    if (content && this.options.authoringAccessibilityMode === 'screenReader') {
      void import('./tour-accessibility-preview').then(({ updateAuthoringScreenReaderLog }) => {
        if (content.isConnected) {
          updateAuthoringScreenReaderLog(content, this.accessibilityAnnouncements);
        }
      });
    }
  }

  private async findTarget(
    step: CompiledStep,
    signal: AbortSignal,
  ): Promise<ResolvedAnchor | null> {
    if (this.options.embeddedPreviewContainer) return null;
    const startedAt = Date.now();
    await this.reachStepPage(step, signal);
    const pageAt = Date.now();
    await this.ensureResolvers();
    throwIfTourPresentationCanceled(signal);
    const resolversAt = Date.now();
    await this.waitForLifecycle(step.lifecycle, signal);
    throwIfTourPresentationCanceled(signal);
    const lifecycleAt = Date.now();
    let result = this.resolveStepTarget(step);
    if (!result) return null;
    const resolvedOnFirstPass = Boolean(result.anchor);
    let approachRan = false;
    const hasApproach = this.targetHasApproach(step.targetId);
    const mayActOnProduct =
      !this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive;
    if (!result.anchor && hasApproach && mayActOnProduct) {
      approachRan = true;
      const { executeStepTargetApproach } = await import('./target-approach-runtime');
      await executeStepTargetApproach(
        this.doc,
        step,
        (targetId, requiredAction) => this.resolveChoreographyTarget(targetId, requiredAction),
        signal,
        this.options.onTargetApproachStageChange,
        this.options.onTargetApproachOutcome,
      );
      result = this.resolveStepTarget(step) ?? result;
    }
    const approachAt = Date.now();
    let settleAttempts = 0;
    // Route transitions and lazy UI commonly commit after the product click
    // handler returns. Every targeted step gets a short semantic settling
    // window even when the creator did not add an explicit lifecycle hint.
    const deadline =
      Date.now() + (step.lifecycle?.timeoutMs ?? DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS);
    while (!result.anchor && Date.now() < deadline) {
      settleAttempts += 1;
      throwIfTourPresentationCanceled(signal);
      if (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive) {
        this.nudgeVirtualizedContainer(step.lifecycle);
      }
      await delay(50, signal);
      result = this.resolveStepTarget(step) ?? result;
    }
    const settledAt = Date.now();
    throwIfTourPresentationCanceled(signal);
    try {
      this.options.onTargetResolution?.(
        step,
        targetResolutionDiagnostic(result, {
          totalMs: settledAt - startedAt,
          pageMs: pageAt - startedAt,
          resolversMs: resolversAt - pageAt,
          lifecycleMs: lifecycleAt - resolversAt,
          approachMs: approachAt - lifecycleAt,
          settleMs: settledAt - approachAt,
          settleAttempts,
          resolvedOnFirstPass,
          approachRan,
          settlingTimedOut: !result.anchor,
        }),
      );
    } catch {
      /* Diagnostics hooks must never alter delivery behavior. */
    }
    return result.anchor;
  }

  /** Route into the page a targeted step was authored on before resolving it. */
  private async reachStepPage(step: CompiledStep, signal: AbortSignal): Promise<void> {
    if (!this.pageScopeApplies()) return;
    const page = this.doc.targets.find((candidate) => candidate.id === step.targetId)?.identity
      ?.context.page;
    const onPage = (): boolean => {
      const here = currentPageKey();
      return Boolean(page && here && pageKeyMatches(page.key, page.match, here));
    };
    if (!page || !currentPageKey() || onPage()) return;
    goToPageKey(page.key);
    await waitUntil(
      onPage,
      step.lifecycle?.timeoutMs ?? DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS,
      signal,
    );
  }

  private targetHasApproach(targetId: string | undefined): boolean {
    const target = targetId
      ? this.doc.targets.find((candidate) => candidate.id === targetId)
      : undefined;
    if (!target || !('approach' in target)) return false;
    const approach = target.approach;
    return Boolean(approach && typeof approach === 'object' && 'legs' in approach);
  }

  private resolveStepTarget(step: CompiledStep): ResolutionResult | null {
    if (!step.targetId) return null;
    const authoringResolution = this.resolveAuthoringTargetOverride(step);
    if (authoringResolution) return authoringResolution;
    const target = this.doc.targets.find((candidate) => candidate.id === step.targetId);
    if (!target) return null;
    const targetResolutionContext: TargetResolutionContext = {
      ...this.options.targetResolutionContext,
      ...(stepWaitsForTargetClick(step) ? { requiredAction: 'observe-click' as const } : {}),
    };
    return this.targetResolver?.(target, document, targetResolutionContext) ?? null;
  }

  private resolveAuthoringTargetOverride(step: CompiledStep): ResolutionResult | null {
    const override = this.options.authoringTargetOverride;
    if (!this.options.authoringPreviewOwnerId || !override || override.stepId !== step.id) {
      return null;
    }
    const element = override.element;
    const anchor: ResolvedAnchor = {
      kind: 'visual-region',
      element,
      interactionSafe: false,
      getBoundingClientRect: () => element.getBoundingClientRect(),
    };
    if (element.ownerDocument !== document || !canOwnPresentation(anchor)) {
      return null;
    }
    return {
      state: 'found',
      element,
      anchor,
      confidence: 100,
      candidateCount: 1,
      resolutionMethod: 'authoring_selection',
      reasonCode: 'resolved',
      evidenceFamilies: [],
      runnerUpConfidence: null,
      currentLocale: this.options.targetResolutionContext?.locale ?? null,
    };
  }

  private trackLiveTarget(
    step: CompiledStep,
    initialAnchor: ResolvedAnchor,
    renderId: number,
  ): void {
    this.addCleanup(
      trackTourTarget({
        anchor: initialAnchor,
        arrow: this.arrow,
        authoringPreviewInteractive: Boolean(this.options.authoringPreviewInteractive),
        authoringPreviewOwnerId: this.options.authoringPreviewOwnerId,
        card: this.card,
        getProtectedSurfaces: this.options.getAuthoringProtectedSurfaces,
        host: this.host,
        isCurrentRender: () => renderId === this.renderId,
        onPositionError: (error) => this.rejectReadiness(renderId, error),
        onPositioned: () => this.resolveReadiness(renderId),
        onSurfaceChange: this.options.onAuthoringSurfaceChange,
        resolveStepTarget: () => this.resolveStepTarget(step),
        scrollForLifecycle: (target) => this.scrollForLifecycle(target, step.lifecycle),
        shadow: this.shadow,
        step,
        stopPlayer: () => this.stop(),
        targetOutline: this.targetOutline,
        backdrop: this.backdrop,
        armTargetClickAdvance: (target, onInvalidOwner) =>
          this.armTargetClickAdvance(step, target, onInvalidOwner),
      }),
    );
  }

  private armTargetClickAdvance(
    step: CompiledStep,
    target: Element,
    onInvalidOwner: () => void,
  ): () => void {
    let consumed = false;
    const onClick = (): void => {
      if (consumed) return;
      const freshlyResolved = this.resolveStepTarget(step);
      /**
       * The listener sits on the target, so the click was on it by
       * construction. Identity is still required while that element is in the
       * document — a re-flow can slide a different control under the pointer.
       * Once it has been replaced, though, a fresh resolution is the only
       * honest answer: a product that re-renders on click is not a product
       * whose tour should stop.
       */
      const replaced = !target.isConnected;
      if (
        !freshlyResolved?.anchor?.interactionSafe ||
        (!replaced && freshlyResolved.anchor.element !== target) ||
        !canOwnPresentation(freshlyResolved.anchor)
      ) {
        onInvalidOwner();
        return;
      }
      consumed = true;
      const nextIndex = this.displayableStepIndex(this.index + 1, 1);
      const nextStep = this.doc.steps[nextIndex];
      if (nextStep) this.notifyBeforeStepChange(nextIndex, nextStep);
      window.setTimeout(() => {
        if (this.host.isConnected) {
          this.leaveCurrentStep(() => this.advanceToNext(false));
        }
      }, 0);
    };
    // Capture phase on the customer's own element: a throw here would abort
    // their click dispatch, so the boundary is not optional.
    const safeOnClick = hostSafe('tour.advanceOnTargetClick', onClick);
    target.addEventListener('click', safeOnClick, true);
    return () => target.removeEventListener('click', safeOnClick, true);
  }

  /**
   * Answers are read when the step is left rather than on every keystroke: a
   * half-typed sentence is not an answer, and streaming one would be the kind of
   * input capture ADR-0015 rules out.
   */
  private captureFormResponses(): void {
    if (!this.options.onFormResponses || this.options.authoringPreviewOwnerId) return;
    const step = this.doc.steps[this.index];
    if (!step) return;
    const responses = collectStepFormResponses(this.card, step.id);
    if (!responses.length) return;
    try {
      this.options.onFormResponses(responses);
    } catch {
      /* Losing an answer must never strand the visitor mid-experience. */
    }
  }

  private notifyBeforeStepChange(index: number, step: CompiledStep): void {
    this.captureFormResponses();
    try {
      this.options.onBeforeStepChange?.(index, step);
    } catch {
      /* Persistence hooks must never block the host application's click flow. */
    }
  }

  private clickCurrentTarget(): void {
    const step = this.doc.steps[this.index];
    if (!step) return;
    const target = this.resolveStepTarget(step)?.anchor;
    if (!target || !this.host.isConnected) return;
    this.scrollForLifecycle(target.element, step.lifecycle);
    if (
      target.interactionSafe &&
      canOwnPresentation(target) &&
      target.element instanceof HTMLElement
    ) {
      target.element.click();
    }
  }

  private leaveCurrentStep(transition: () => void): void {
    if (this.stepTransitionPending) return;
    const step = this.doc.steps[this.index] as CompiledStep | undefined;
    if (!step) return;
    const startingIndex = this.index;
    this.stepTransitionPending = true;
    const finish = (): void => {
      this.cancelExitMotion = null;
      this.pendingStepTransition = null;
      this.stepTransitionPending = false;
      if (!this.host.isConnected || this.index !== startingIndex) return;
      transition();
    };
    if (!step.motion) {
      this.stepTransitionPending = false;
      transition();
      return;
    }
    let active = true;
    this.pendingStepTransition = finish;
    this.cancelExitMotion = () => {
      active = false;
    };
    void import('./tour-presentation-effects')
      .then(({ startStepExitMotion }) => {
        if (!active) return;
        const cancel = startStepExitMotion(this.card, step, finish);
        if (!cancel) finish();
        else this.cancelExitMotion = cancel;
      })
      .catch(() => {
        if (active) finish();
      });
  }

  /** Tearing down abandons the navigation; a re-render (flush) keeps it. */
  private cancelPendingStepTransition(flush = false): void {
    const pending = this.pendingStepTransition;
    this.pendingStepTransition = null;
    this.cancelExitMotion?.();
    this.cancelExitMotion = null;
    this.stepTransitionPending = false;
    if (flush) pending?.();
  }

  /** True when the flushed navigation superseded the render that asked for it. */
  private flushPendingStepTransition(): boolean {
    const renderId = this.renderId;
    const index = this.index;
    this.cancelPendingStepTransition(true);
    return this.renderId !== renderId || this.index !== index;
  }

  private addCleanup(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  private runtimeLabel(): string {
    return (
      this.experienceRuntime?.experienceRuntimeLabel(this.doc) ?? tourRuntimeText('Lodariq tour')
    );
  }

  private clearStepEffects(): void {
    while (this.cleanups.length) this.cleanups.pop()?.();
  }

  private invalidateCurrentRender(error: TourPresentationCanceledError): void {
    this.renderAbortController?.abort();
    this.renderAbortController = null;
    const readiness = this.readiness;
    if (!readiness || readiness.settled) return;
    readiness.settled = true;
    readiness.reject(error);
  }

  private resolveReadiness(renderId: number): void {
    const readiness = this.readiness;
    if (!readiness || readiness.renderId !== renderId || readiness.settled) return;
    readiness.settled = true;
    readiness.resolve();
  }

  private rejectReadiness(renderId: number, error: Error): void {
    const readiness = this.readiness;
    if (!readiness || readiness.renderId !== renderId || readiness.settled) return;
    readiness.settled = true;
    readiness.reject(error);
  }

  private async waitForLifecycle(
    lifecycle: RuntimeLifecycleHints | undefined,
    signal: AbortSignal,
  ): Promise<void> {
    if (!lifecycle) return;
    const timeoutMs = lifecycle.timeoutMs ?? 1000;
    const expectedRoute = lifecycle.expectedRoute;
    const isAuthoringPreview = Boolean(
      this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive,
    );
    const networkTracker =
      lifecycle.waitForNetworkIdle && !isAuthoringPreview ? acquireNetworkActivityTracker() : null;
    try {
      if (expectedRoute) await waitUntil(() => routeMatches(expectedRoute), timeoutMs, signal);
      throwIfTourPresentationCanceled(signal);
      if (lifecycle.openPanel && !isAuthoringPreview)
        await activateLifecycleControl(lifecycle.openPanel, timeoutMs, signal);
      throwIfTourPresentationCanceled(signal);
      if (lifecycle.selectTab && !isAuthoringPreview)
        await activateLifecycleControl(lifecycle.selectTab, timeoutMs, signal);
      throwIfTourPresentationCanceled(signal);
      if (networkTracker) await networkTracker.waitForIdle(timeoutMs, signal);
      throwIfTourPresentationCanceled(signal);
      if (lifecycle.waitForText && lifecycleTextAppliesToCurrentLocale(lifecycle)) {
        await waitUntil(
          () => document.body.textContent?.includes(lifecycle.waitForText!) ?? false,
          timeoutMs,
          signal,
        );
      }
      throwIfTourPresentationCanceled(signal);
      if (lifecycle.waitForElement)
        await waitForResolvedElement(lifecycle.waitForElement, timeoutMs, signal);
    } finally {
      networkTracker?.release();
    }
  }

  private scrollForLifecycle(target: Element, lifecycle?: RuntimeLifecycleHints): void {
    const explicitContainer = lifecycle?.scrollContainer
      ? this.fingerprintResolver?.(lifecycle.scrollContainer).element
      : null;
    const container = explicitContainer ?? nearestScrollable(target);
    const block = scrollBlockFor(lifecycle?.scrollStrategy);
    scrollIntoView(container ?? target, { block, inline: 'nearest' });
    if (container && container !== target)
      scrollIntoView(target, { block: 'nearest', inline: 'nearest' });
  }

  private nudgeVirtualizedContainer(lifecycle?: RuntimeLifecycleHints): void {
    if (lifecycle?.scrollStrategy !== 'virtualized-search' || !lifecycle.scrollContainer) return;
    const container = this.fingerprintResolver?.(lifecycle.scrollContainer).element;
    if (!(container instanceof HTMLElement)) return;
    container.scrollTop += container.clientHeight || 200;
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  private async ensureResolvers(): Promise<void> {
    if (this.targetResolver && this.fingerprintResolver) return;
    const resolver = await import('../resolver');
    this.targetResolver = resolver.resolveTarget;
    this.fingerprintResolver = resolver.resolve;
  }
}

function visuallyHideElement(element: HTMLElement): void {
  Object.assign(element.style, {
    border: '0',
    clipPath: 'inset(50%)',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    padding: '0',
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: '1px',
  });
}

function contentLocaleDirection(locale: string): 'ltr' | 'rtl' {
  try {
    const language = new Intl.Locale(locale).language;
    return new Set(['ar', 'fa', 'he', 'ur']).has(language) ? 'rtl' : 'ltr';
  } catch {
    return 'ltr';
  }
}

function documentExperienceType(document: CompiledDocument): string {
  if ('experience' in document && document.experience) return document.experience.type;
  return document.type;
}

/** Where a targeted step's resolution spent its time. Bounded numbers only. */
export interface TourTargetResolutionTiming {
  readonly totalMs: number;
  readonly pageMs: number;
  readonly resolversMs: number;
  readonly lifecycleMs: number;
  readonly approachMs: number;
  readonly settleMs: number;
  readonly settleAttempts: number;
  /** The question behind the latency: did resolution work before any waiting? */
  readonly resolvedOnFirstPass: boolean;
  readonly approachRan: boolean;
  readonly settlingTimedOut: boolean;
}

export type TourTargetResolutionDiagnostic = Omit<ResolutionResult, 'element' | 'anchor'> & {
  readonly timing: TourTargetResolutionTiming;
};

interface TourPresentationReadiness {
  renderId: number;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  settled: boolean;
}

function createTourPresentationReadiness(renderId: number): TourPresentationReadiness {
  let resolve = (): void => {};
  let reject = (_error: Error): void => {};
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  // Delivery playback does not need to await readiness. Keep its ignored
  // readiness promise from surfacing an unhandled rejection while returning
  // the original promise to preview callers that do await it.
  void promise.catch(() => {});
  return { renderId, promise, resolve, reject, settled: false };
}

function normalizeTourPresentationError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new TourPresentationUnavailableError();
}

function targetResolutionDiagnostic(
  result: ResolutionResult,
  timing: TourTargetResolutionTiming,
): TourTargetResolutionDiagnostic {
  return {
    timing,
    state: result.state,
    confidence: result.confidence,
    candidateCount: result.candidateCount,
    resolutionMethod: result.resolutionMethod,
    reasonCode: result.reasonCode,
    evidenceFamilies: [...result.evidenceFamilies],
    runnerUpConfidence: result.runnerUpConfidence,
    currentLocale: result.currentLocale,
  };
}

function stepWaitsForTargetClick(step: CompiledStep): boolean {
  return step.body.some((node) => node.props.action?.type === 'clickTarget');
}

function focusTourCard(card: HTMLElement): void {
  (card.querySelector<HTMLElement>('button, a[href]') ?? card).focus();
}

function initialStepIndex(doc: CompiledDocument, options: TourPlayerOptions): number {
  if (typeof options.initialStepIndex === 'number') {
    return Math.min(Math.max(0, options.initialStepIndex), Math.max(0, doc.steps.length - 1));
  }
  if (options.initialStepId) {
    const index = doc.steps.findIndex((step) => step.id === options.initialStepId);
    if (index >= 0) return index;
  }
  return 0;
}
