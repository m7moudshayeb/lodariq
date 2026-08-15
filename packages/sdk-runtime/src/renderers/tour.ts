import type {
  CompiledDocument,
  CompiledStep,
  RuntimeLifecycleHints,
  StepChoreography,
  StepChoreographyTransition,
  StepTransitionDestination,
  AuthoringAccessibilityPreviewMode,
} from '@lodariq/schema';
import { resolveExperienceAppearance } from '@lodariq/schema/brand-runtime';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
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
import { canOwnPresentation, createTargetOutline } from './tour-positioning';
import type { ChoreographyRecoveryUpdate, ChoreographyStageUpdate } from './tour-choreography';
import type { ProtectedSurfaceRect } from './protected-surface';
import type { TourFlowConditionContext } from './tour-flow';
import { applyStepMotion, resolveResponsiveTourStep } from './tour-presentation';
import { executeTourSequence } from './tour-choreography-sequence';
import { runTourFlowDestination } from './tour-flow-navigation';
import { trackTourTarget } from './tour-target-tracker';

export { TourPresentationCanceledError, TourPresentationUnavailableError } from './tour-errors';
export type { ProtectedSurfaceRect } from './protected-surface';
export type { ChoreographyRecoveryUpdate, ChoreographyStageUpdate } from './tour-choreography';
export {
  applyStepMotion,
  resolveResponsiveTourStep,
  runtimeViewportClass,
} from './tour-presentation';
export {
  resolveTourActionRecipe,
  resolveTourCompositionRecipe,
  resolveTourPopupStyleRecipe,
  tourPopupStyleVariables,
} from './tour-recipes';

export {
  resolveCompiledTourTheme,
  resolveTourThemeStyle,
  type ResolvedTourThemeStyle,
  type TourThemeStyleInput,
} from './tour-theme';

const DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS = 1_500;

type RuntimeActionType = RuntimeAction['type'];
type RuntimeActionHandler = (player: TourPlayer, action: RuntimeAction) => void;
type TargetResolver = typeof resolveTarget;
type FingerprintResolver = typeof resolve;

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
  onBeforeStepChange?: (index: number, step: CompiledStep) => void;
  onComplete?: () => void;
  onDismiss?: () => void;
  /** Explicit visitor choice to end the entire tour before completion. */
  onSkip?: () => void;
  /** One bounded result per step attempt for privacy-safe diagnostics. */
  onTargetResolution?: (step: CompiledStep, result: TourTargetResolutionDiagnostic) => void;
  /** Bounded, payload-free stage diagnostics for runtime progress and telemetry. */
  onChoreographyStageChange?: (step: CompiledStep, update: ChoreographyStageUpdate) => void;
  onChoreographyRecovery?: (step: CompiledStep, update: ChoreographyRecoveryUpdate) => void;
  /** Authoring-only live chrome rectangles; never used to resolve or activate a target. */
  getAuthoringProtectedSurfaces?: () => readonly ProtectedSurfaceRect[];
  /** Authoring-only runtime card geometry for reciprocal chrome avoidance. */
  onAuthoringSurfaceChange?: (rect: ProtectedSurfaceRect | null) => void;
  /** Explicit SDK-provided safe state used only by closed flow conditions. */
  flowConditionContext?: Pick<TourFlowConditionContext, 'identifyTraits' | 'documentState'>;
  onBranchChoice?: (step: CompiledStep, ruleIndex: number | null, destination: string) => void;
  /** Resolves server-validated asset IDs; canonical documents never carry raw src attributes. */
  resolveMediaAsset?: (assetId: string, kind: 'image' | 'video' | 'captions') => string | null;
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
  private readonly cleanups: Array<() => void> = [];
  private readonly lifetimeCleanups: Array<() => void> = [];
  private renderAbortController: AbortController | null = null;
  private readiness: TourPresentationReadiness | null = null;
  private renderId = 0;
  private choreographyRetryCount = 0;
  private completionStepActive = false;
  private readonly completedStepIds = new Set<string>();
  private readonly accessibilityAnnouncements: string[] = [];
  private announcementRegion: HTMLParagraphElement | null = null;
  private restoreFocusTarget: HTMLElement | null = null;
  private targetResolver: TargetResolver | null = null;
  private fingerprintResolver: FingerprintResolver | null = null;

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
    this.lifetimeCleanups.push(applyCompiledTourTheme(this.host, this.doc));
    this.shadow.appendChild(createTourStyles());
    if (this.targetOutline) this.shadow.appendChild(this.targetOutline);
    this.shadow.appendChild(this.card);
  }

  start(): void {
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
    this.render();
  }

  /**
   * Resolves for the current step only after its card is presentable. Targeted
   * steps wait for a safely resolved, visible owner and completed positioning.
   */
  waitUntilReady(): Promise<void> {
    return (
      this.readiness?.promise ??
      Promise.reject(
        new TourPresentationUnavailableError(tourRuntimeText('Lodariq tour has not started')),
      )
    );
  }

  next(): void {
    this.advanceToNext(true);
  }

  previous(): void {
    const previousIndex = this.index - 1;
    const previousStep = this.doc.steps[previousIndex];
    if (!previousStep) return;
    this.notifyBeforeStepChange(previousIndex, previousStep);
    this.index = previousIndex;
    this.render();
  }

  private advanceToNext(notify: boolean): void {
    const nextIndex = this.index + 1;
    const nextStep = this.doc.steps[nextIndex];
    if (!nextStep) {
      this.complete();
      return;
    }
    if (notify) this.notifyBeforeStepChange(nextIndex, nextStep);
    this.index = nextIndex;
    this.render();
  }

  stop(): void {
    this.invalidateCurrentRender(new TourPresentationCanceledError());
    this.renderId += 1;
    this.clearStepEffects();
    while (this.lifetimeCleanups.length) this.lifetimeCleanups.pop()?.();
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
    this.invalidateCurrentRender(new TourPresentationCanceledError());
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
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    this.card.hidden = Boolean(step.targetId);
    applyStepComposition(this.card, step);
    applyStepMotion(this.card, step);
    this.card.setAttribute('aria-label', step.accessibilityName ?? tourRuntimeText('Lodariq tour'));
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
    const content = this.card.ownerDocument.createElement('div');
    content.className = 'tour-content';
    this.announcementRegion = this.card.ownerDocument.createElement('p');
    visuallyHideElement(this.announcementRegion);
    this.announcementRegion.setAttribute('role', 'status');
    this.announcementRegion.setAttribute('aria-live', 'polite');
    this.announcementRegion.setAttribute('aria-atomic', 'true');
    content.appendChild(this.announcementRegion);
    appendStepBody(content, step, (node) => this.createBodyElement(node));
    content.appendChild(this.createSkipButton());
    this.recordAccessibilityAnnouncement(
      step.accessibilityName ?? tourRuntimeText('Lodariq tour'),
      false,
    );
    this.card.appendChild(content);
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
    this.arrow.hidden = !step.targetId || step.tooltipLayout?.showArrow === false;
    this.card.appendChild(this.arrow);
    this.armEntrySequence(step, renderId, abortController.signal);

    if (!step.targetId) {
      if (
        !this.options.embeddedPreviewContainer &&
        (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive)
      ) {
        focusTourCard(this.card);
        if (step.lifecycle) {
          void this.waitForLifecycle(step.lifecycle, abortController.signal).catch(() => {});
        }
      }
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
          this.rejectReadiness(
            renderId,
            new TourPresentationUnavailableError(
              `Lodariq tour target could not be resolved for step ${step.id}`,
            ),
          );
          return;
        }
        this.trackLiveTarget(step, target, renderId);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        this.rejectReadiness(renderId, normalizeTourPresentationError(error));
      });
  }

  private armEntrySequence(step: CompiledStep, renderId: number, signal: AbortSignal): void {
    if (!step.entrySequence || this.options.embeddedPreviewContainer) return;
    void this.waitUntilReady()
      .then(() => {
        if (signal.aborted || renderId !== this.renderId || !this.host.isConnected) return;
        void this.runSequence(step.entrySequence!);
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

  private createSkipButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tour-skip';
    button.textContent = tourRuntimeText('Skip tour');
    button.addEventListener('click', () => {
      if (this.options.embeddedPreviewContainer) return;
      if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) return;
      this.skip();
    });
    return button;
  }

  private complete(): void {
    const completion = 'completion' in this.doc ? this.doc.completion : undefined;
    if (!this.completionStepActive && completion) {
      if (completion.type === 'showStep') {
        const nextIndex = this.doc.steps.findIndex((step) => step.id === completion.stepId);
        if (nextIndex >= 0 && nextIndex !== this.index) {
          this.completionStepActive = true;
          this.goToStep(completion.stepId);
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
      const completionAnnouncement = tourRuntimeText('Tour complete');
      this.recordAccessibilityAnnouncement(completionAnnouncement, false);
      const ownerDocument = this.host.ownerDocument;
      void import('./tour-completion-announcement').then(({ announceAfterTourStops }) => {
        announceAfterTourStops(ownerDocument, completionAnnouncement);
      });
    }
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
    this.options.onDismiss?.();
    this.stop();
  }

  private skip(): void {
    this.options.onSkip?.();
    this.stop();
  }

  private openPage(action: RuntimeAction): void {
    if (action.type !== 'openPage') return;
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
    const nextIndex = this.index + 1;
    const nextStep = this.doc.steps[nextIndex];
    if (nextStep) {
      this.notifyBeforeStepChange(nextIndex, nextStep);
      return;
    }
    this.complete();
  }

  private async runSequence(
    sequence: StepChoreography,
    actionTransition?: NonNullable<RuntimeAction['transition']>,
  ): Promise<void> {
    const step = this.doc.steps[this.index];
    const signal = this.renderAbortController?.signal;
    if (!step || !signal || signal.aborted || !this.host.isConnected) return;
    this.card.querySelector('.tour-choreography-recovery')?.remove();
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
      if (override?.interactionSafe || requiredAction === 'anchor')
        return override?.element ?? null;
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
    const nextIndex = this.doc.steps.findIndex((candidate) => candidate.id === stepId);
    const nextStep = this.doc.steps[nextIndex];
    if (nextIndex < 0 || !nextStep || nextIndex === this.index) return;
    this.notifyBeforeStepChange(nextIndex, nextStep);
    this.index = nextIndex;
    this.render();
  }

  private showChoreographyRecovery(
    sequence: StepChoreography,
    actionTransition?: NonNullable<RuntimeAction['transition']>,
  ): void {
    this.recordAccessibilityAnnouncement(tourRuntimeText('This step could not continue.'), false);
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
    await this.ensureResolvers();
    throwIfTourPresentationCanceled(signal);
    await this.waitForLifecycle(step.lifecycle, signal);
    throwIfTourPresentationCanceled(signal);
    let result = this.resolveStepTarget(step);
    if (!result) return null;
    // Route transitions and lazy UI commonly commit after the product click
    // handler returns. Every targeted step gets a short semantic settling
    // window even when the creator did not add an explicit lifecycle hint.
    const deadline =
      Date.now() + (step.lifecycle?.timeoutMs ?? DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS);
    while (!result.anchor && Date.now() < deadline) {
      throwIfTourPresentationCanceled(signal);
      if (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive) {
        this.nudgeVirtualizedContainer(step.lifecycle);
      }
      await delay(50, signal);
      result = this.resolveStepTarget(step) ?? result;
    }
    throwIfTourPresentationCanceled(signal);
    try {
      this.options.onTargetResolution?.(step, targetResolutionDiagnostic(result));
    } catch {
      /* Diagnostics hooks must never alter delivery behavior. */
    }
    return result.anchor;
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
      if (
        !freshlyResolved?.anchor?.interactionSafe ||
        freshlyResolved.anchor.element !== target ||
        !canOwnPresentation(freshlyResolved.anchor)
      ) {
        onInvalidOwner();
        return;
      }
      consumed = true;
      const nextIndex = this.index + 1;
      const nextStep = this.doc.steps[nextIndex];
      if (nextStep) this.notifyBeforeStepChange(nextIndex, nextStep);
      window.setTimeout(() => {
        if (this.host.isConnected) this.advanceToNext(false);
      }, 0);
    };
    target.addEventListener('click', onClick, true);
    return () => target.removeEventListener('click', onClick, true);
  }

  private notifyBeforeStepChange(index: number, step: CompiledStep): void {
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

  private addCleanup(cleanup: () => void): void {
    this.cleanups.push(cleanup);
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

export type TourTargetResolutionDiagnostic = Omit<ResolutionResult, 'element' | 'anchor'>;

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

function targetResolutionDiagnostic(result: ResolutionResult): TourTargetResolutionDiagnostic {
  return {
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
