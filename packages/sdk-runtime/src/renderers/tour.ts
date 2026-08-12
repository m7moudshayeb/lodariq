import type { CompiledDocument, CompiledStep, RuntimeLifecycleHints } from '@lodariq/schema';
import { arrow, computePosition, flip, offset, shift, type Placement } from '@floating-ui/dom';
import { resolveExperienceAppearance } from '@lodariq/schema/brand-runtime';
import { LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE } from '@lodariq/schema/dom';
import { assertSupportedCompiledArtifactIfVersioned } from '../artifact-compatibility';
import {
  applyRuntimeLocale,
  configureRuntimeLocale,
  currentRuntimeLocale,
  runtimeText,
} from '../i18n';
import { resolveCompiledDocumentLocale } from '../document-localization';
import { clearActiveContentLocale, setActiveContentLocale } from '../runtime/content-locale-state';
import {
  resolve,
  resolveTarget,
  type ResolvedAnchor,
  type ResolutionResult,
  type TargetResolutionContext,
} from '../resolver';
import { isVisible } from '../resolver/element-evidence';
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
import {
  blurHiddenTourCard,
  canOwnPresentation,
  createTargetOutline,
  mutationAffectsPresentationOwner,
  positionTargetOutline,
  positionTourArrow,
  positioningReference,
  presentationOwnerObservationRoots,
  shadowRootHost,
} from './tour-positioning';

export { TourPresentationCanceledError, TourPresentationUnavailableError } from './tour-errors';
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
const TARGET_GLOBAL_REVALIDATION_THROTTLE_MS = 500;

type RuntimeActionType = RuntimeAction['type'];
type RuntimeActionHandler = (player: TourPlayer, action: RuntimeAction) => void;

interface TourPositionController {
  stop: () => void;
  update: () => void;
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
    if (previewContainer) {
      this.host.setAttribute('data-lodariq-embedded-preview', '');
      this.host.setAttribute('aria-hidden', 'true');
      this.host.setAttribute('inert', '');
    }
    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.card = document.createElement('div');
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', runtimeText('Lodariq tour'));
    this.card.setAttribute('aria-live', 'polite');
    this.card.tabIndex = -1;
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
    if (!this.host.isConnected) (previewContainer ?? document.body).appendChild(this.host);
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
        new TourPresentationUnavailableError(runtimeText('Lodariq tour has not started')),
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
  }

  private render(): void {
    this.invalidateCurrentRender(new TourPresentationCanceledError());
    const renderId = ++this.renderId;
    const abortController = new AbortController();
    this.renderAbortController = abortController;
    this.readiness = createTourPresentationReadiness(renderId);
    const step = this.doc.steps[this.index];
    if (!step) {
      this.rejectReadiness(
        renderId,
        new TourPresentationUnavailableError(runtimeText('Lodariq tour has no presentable step')),
      );
      return;
    }
    this.clearStepEffects();
    if (this.targetOutline) this.targetOutline.hidden = true;
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    this.card.hidden = Boolean(step.targetId);
    applyStepComposition(this.card, step);
    const content = this.card.ownerDocument.createElement('div');
    content.className = 'tour-content';
    appendStepBody(content, step, (node) => this.createBodyElement(node));
    content.appendChild(this.createSkipButton());
    this.card.appendChild(content);
    this.arrow.hidden = !step.targetId || step.tooltipLayout?.showArrow === false;
    this.card.appendChild(this.arrow);

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

  private createBodyElement(node: RuntimeBodyNode): HTMLElement {
    const renderer = BODY_NODE_RENDERERS[node.type] ?? renderTextNode;
    return renderer(node, { onAction: (action) => this.handleAction(action) });
  }

  private handleAction(action: RuntimeAction | undefined): void {
    if (!action || this.options.embeddedPreviewContainer) {
      return;
    }
    if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) {
      return;
    }
    TourPlayer.actionHandlers[action.type](this, action);
  }

  private createSkipButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tour-skip';
    button.textContent = runtimeText('Skip tour');
    button.addEventListener('click', () => {
      if (this.options.embeddedPreviewContainer) return;
      if (this.options.authoringPreviewOwnerId && !this.options.authoringPreviewInteractive) return;
      this.skip();
    });
    return button;
  }

  private complete(): void {
    this.options.onComplete?.();
    this.stop();
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

  private async findTarget(
    step: CompiledStep,
    signal: AbortSignal,
  ): Promise<ResolvedAnchor | null> {
    if (this.options.embeddedPreviewContainer) return null;
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
    return resolveTarget(target, document, targetResolutionContext);
  }

  private resolveAuthoringTargetOverride(step: CompiledStep): ResolutionResult | null {
    const override = this.options.authoringTargetOverride;
    if (!this.options.authoringPreviewOwnerId || !override || override.stepId !== step.id) {
      return null;
    }
    const element = override.element;
    if (element.ownerDocument !== document || !element.isConnected || !isVisible(element)) {
      return null;
    }
    return {
      state: 'found',
      element,
      anchor: {
        kind: 'visual-region',
        element,
        interactionSafe: false,
        getBoundingClientRect: () => element.getBoundingClientRect(),
      },
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
    let currentAnchor: ResolvedAnchor | null = null;
    let currentTarget: Element | null = null;
    let clearPosition = (): void => {};
    let updatePosition = (): void => {};
    let clearTargetAction = (): void => {};
    let revalidationTimer: ReturnType<typeof setTimeout> | null = null;
    let unavailable = false;
    let focusedOnce = false;
    let observer: MutationObserver | null = null;

    const markUnavailable = (): void => {
      if (!unavailable) blurHiddenTourCard(this.shadow, this.card);
      this.card.hidden = true;
      if (this.targetOutline) this.targetOutline.hidden = true;
      unavailable = true;
      clearTargetAction();
      clearTargetAction = () => {};
    };

    const bind = (anchor: ResolvedAnchor): void => {
      const target = anchor.element;
      clearPosition();
      clearTargetAction();
      currentAnchor = anchor;
      currentTarget = target;
      unavailable = false;
      this.card.hidden = true;
      if (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive) {
        this.scrollForLifecycle(target, step.lifecycle);
      }
      const position = this.position(
        anchor,
        (step.placement as Placement) ?? 'bottom',
        step.presentationAnchor,
        handleOwnerAvailability,
        () => this.resolveReadiness(renderId),
        (error) => this.rejectReadiness(renderId, normalizeTourPresentationError(error)),
      );
      clearPosition = position.stop;
      updatePosition = position.update;
      if (!canOwnPresentation(anchor)) {
        markUnavailable();
        if (this.options.authoringPreviewOwnerId) {
          this.rejectReadiness(
            renderId,
            new TourPresentationUnavailableError(
              `Lodariq tour target is not visible for step ${step.id}`,
            ),
          );
        }
        scheduleRevalidation(true);
        observePresentationOwnerRoots();
        return;
      }
      this.card.hidden = false;
      clearTargetAction =
        anchor.interactionSafe &&
        (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive) &&
        stepWaitsForTargetClick(step)
          ? this.armTargetClickAdvance(step, target, handleInvalidOwnerClick)
          : () => {};
      if (
        !focusedOnce &&
        (!this.options.authoringPreviewOwnerId || this.options.authoringPreviewInteractive)
      ) {
        focusedOnce = true;
        focusTourCard(this.card);
      }
      observePresentationOwnerRoots();
    };

    const revalidate = (): void => {
      revalidationTimer = null;
      if (renderId !== this.renderId || !this.host.isConnected) return;
      const result = this.resolveStepTarget(step);
      const safelyResolvedAnchor = result?.anchor;
      if (!safelyResolvedAnchor || !canOwnPresentation(safelyResolvedAnchor)) {
        markUnavailable();
        return;
      }
      if (
        safelyResolvedAnchor.element !== currentTarget ||
        safelyResolvedAnchor.kind !== currentAnchor?.kind ||
        unavailable
      ) {
        bind(safelyResolvedAnchor);
      } else {
        updatePosition();
      }
    };

    function scheduleRevalidation(immediate = false): void {
      if (revalidationTimer && !immediate) return;
      if (revalidationTimer) clearTimeout(revalidationTimer);
      revalidationTimer = setTimeout(
        revalidate,
        immediate ? 0 : TARGET_GLOBAL_REVALIDATION_THROTTLE_MS,
      );
    }

    function handleInvalidOwnerClick(): void {
      markUnavailable();
      scheduleRevalidation(true);
    }

    function handleOwnerAvailability(available: boolean): void {
      if (available) {
        if (unavailable) scheduleRevalidation(true);
        return;
      }
      markUnavailable();
      scheduleRevalidation(true);
    }

    function observePresentationOwnerRoots(): void {
      if (!observer || !currentTarget) return;
      observer.disconnect();
      for (const root of presentationOwnerObservationRoots(currentTarget)) {
        observer.observe(root, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
      }
    }

    bind(initialAnchor);
    const Observer = document.defaultView?.MutationObserver;
    observer = Observer
      ? new Observer((records) => {
          if (renderId !== this.renderId) return;
          if (!this.host.isConnected) {
            this.stop();
            return;
          }
          const ownerChanged = Boolean(
            currentTarget &&
            records.some((record) => mutationAffectsPresentationOwner(record, currentTarget!)),
          );
          if (ownerChanged) {
            // Routine SPA updates may change owner evidence without making the
            // live owner unusable. Hiding eagerly would blur authoring fields.
            if (!currentAnchor || !canOwnPresentation(currentAnchor)) markUnavailable();
            scheduleRevalidation(true);
            return;
          }
          scheduleRevalidation();
        })
      : null;
    observePresentationOwnerRoots();
    this.addCleanup(() => {
      observer?.disconnect();
      if (revalidationTimer) clearTimeout(revalidationTimer);
      revalidationTimer = null;
      clearPosition();
      updatePosition = () => {};
      clearTargetAction();
      currentAnchor = null;
      currentTarget = null;
    });
  }

  private position(
    anchor: ResolvedAnchor,
    placement: Placement,
    presentationAnchor: CompiledStep['presentationAnchor'],
    onOwnerAvailabilityChange: (available: boolean) => void,
    onPositioned: () => void,
    onPositionError: (error: unknown) => void,
  ): TourPositionController {
    let active = true;
    const owner = anchor.element;
    const reference = positioningReference(anchor, presentationAnchor);
    const update = (): void => {
      if (!canOwnPresentation(anchor)) {
        onOwnerAvailabilityChange(false);
        return;
      }
      onOwnerAvailabilityChange(true);
      positionTargetOutline(this.targetOutline, anchor.element);
      void computePosition(reference, this.card, {
        placement,
        strategy: 'fixed',
        middleware: [offset(12), flip(), shift({ padding: 8 }), arrow({ element: this.arrow })],
      })
        .then(({ x, y, placement: resolvedPlacement, middlewareData }) => {
          if (!active || !canOwnPresentation(anchor)) return;
          Object.assign(this.card.style, { position: 'fixed', left: `${x}px`, top: `${y}px` });
          positionTourArrow(this.arrow, resolvedPlacement, middlewareData.arrow);
          onPositioned();
        })
        .catch((error: unknown) => {
          if (active) {
            if (this.targetOutline) this.targetOutline.hidden = true;
            onPositionError(error);
          }
        });
    };
    const ownerWindow = owner.ownerDocument.defaultView ?? window;
    const ResizeObserverConstructor = ownerWindow.ResizeObserver;
    const resizeObserver = ResizeObserverConstructor ? new ResizeObserverConstructor(update) : null;
    const scrollTargets: EventTarget[] = [
      ownerWindow,
      ...presentationOwnerObservationRoots(owner).filter((root) => shadowRootHost(root)),
    ];
    resizeObserver?.observe(owner);
    update();
    for (const target of scrollTargets) target.addEventListener?.('scroll', update, true);
    ownerWindow.addEventListener('resize', update);
    return {
      update,
      stop: () => {
        active = false;
        if (this.targetOutline) this.targetOutline.hidden = true;
        resizeObserver?.disconnect();
        for (const target of scrollTargets) target.removeEventListener?.('scroll', update, true);
        ownerWindow.removeEventListener?.('resize', update);
      },
    };
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
      ? resolve(lifecycle.scrollContainer).element
      : null;
    const container = explicitContainer ?? nearestScrollable(target);
    const block = scrollBlockFor(lifecycle?.scrollStrategy);
    scrollIntoView(container ?? target, { block, inline: 'nearest' });
    if (container && container !== target)
      scrollIntoView(target, { block: 'nearest', inline: 'nearest' });
  }

  private nudgeVirtualizedContainer(lifecycle?: RuntimeLifecycleHints): void {
    if (lifecycle?.scrollStrategy !== 'virtualized-search' || !lifecycle.scrollContainer) return;
    const container = resolve(lifecycle.scrollContainer).element;
    if (!(container instanceof HTMLElement)) return;
    container.scrollTop += container.clientHeight || 200;
    container.dispatchEvent(new Event('scroll', { bubbles: true }));
  }
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
