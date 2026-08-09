import {
  arrow as floatingArrow,
  computePosition,
  flip,
  offset,
  shift,
  type Placement,
  type VirtualElement,
} from '@floating-ui/dom';
import type { CompiledDocument, CompiledStep, RuntimeLifecycleHints } from '@lodariq/schema';
import {
  createNonceStyleElement,
  LODARIQ_AUTHORING_PREVIEW_OWNER_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_ID_ATTRIBUTE,
  LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE,
} from '@lodariq/schema/dom';
import { resolveSafeNavigationUrl } from '@lodariq/schema/url';
import { assertSupportedCompiledArtifactIfVersioned } from '../artifact-compatibility';
import {
  resolve,
  resolveTarget,
  type ResolvedAnchor,
  type ResolutionResult,
  type TargetResolutionContext,
} from '../resolver';
import { isVisible } from '../resolver/element-evidence';
import { applyCompiledTourTheme } from './tour-theme';

export { resolveCompiledTourTheme, type ResolvedTourThemeStyle } from './tour-theme';

const NETWORK_IDLE_QUIET_MS = 80;
const NETWORK_IDLE_POLL_MS = 20;
const DEFAULT_TARGET_RESOLUTION_TIMEOUT_MS = 1_500;
const TARGET_GLOBAL_REVALIDATION_THROTTLE_MS = 500;

type RuntimeBodyNode = CompiledStep['body'][number];
type RuntimeAction = NonNullable<RuntimeBodyNode['props']['action']>;
type RuntimeActionType = RuntimeAction['type'];
type RuntimeActionHandler = (player: TourPlayer, action: RuntimeAction) => void;
type BodyNodeRenderer = (node: RuntimeBodyNode, context: BodyNodeRenderContext) => HTMLElement;

interface BodyNodeRenderContext {
  onAction: (action: RuntimeAction | undefined) => void;
}

const BODY_NODE_RENDERERS: Readonly<Record<string, BodyNodeRenderer>> = {
  button: renderButtonNode,
  divider: renderDividerNode,
  heading: renderHeadingNode,
  link: renderLinkNode,
  list: renderListNode,
  media: renderMediaNode,
  paragraph: renderTextNode,
};

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
    clickTarget: (player) => player.focusCurrentTarget(),
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
  private readonly cleanups: Array<() => void> = [];
  private readonly lifetimeCleanups: Array<() => void> = [];
  private renderAbortController: AbortController | null = null;
  private readiness: TourPresentationReadiness | null = null;
  private renderId = 0;

  constructor(
    private readonly doc: CompiledDocument,
    private readonly options: TourPlayerOptions = {},
  ) {
    assertSupportedCompiledArtifactIfVersioned(doc);
    const previewContainer = options.embeddedPreviewContainer;
    if (previewContainer && doc.steps.some((step) => step.targetId)) {
      throw new Error('Embedded Tour previews must use targetless compiled steps');
    }
    this.index = initialStepIndex(doc, options);
    this.host = document.createElement('lodariq-tour');
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
    this.card.setAttribute('aria-label', 'Lodariq tour');
    this.card.setAttribute('aria-live', 'polite');
    this.card.tabIndex = -1;
    this.arrow = document.createElement('div');
    this.arrow.className = 'tour-arrow';
    this.arrow.setAttribute('aria-hidden', 'true');
    this.lifetimeCleanups.push(applyCompiledTourTheme(this.host, this.doc));
    this.shadow.appendChild(createStyles());
    this.shadow.appendChild(this.card);
  }

  start(): void {
    const previewContainer = this.options.embeddedPreviewContainer;
    if (!previewContainer && !this.options.authoringPreviewOwnerId) {
      if (TourPlayer.active && TourPlayer.active !== this) TourPlayer.active.stop();
      TourPlayer.active = this;
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
      Promise.reject(new TourPresentationUnavailableError('Lodariq tour has not started'))
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
    if (TourPlayer.active === this) TourPlayer.active = null;
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
        new TourPresentationUnavailableError('Lodariq tour has no presentable step'),
      );
      return;
    }
    this.clearStepEffects();
    this.options.onStepChange?.(this.index, step);

    this.card.innerHTML = '';
    this.card.hidden = Boolean(step.targetId);
    for (const node of step.body) {
      this.card.appendChild(this.createBodyElement(node));
    }
    this.arrow.hidden = !step.targetId;
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

  private complete(): void {
    this.stop();
    this.options.onComplete?.();
  }

  private dismiss(): void {
    this.stop();
    this.options.onDismiss?.();
  }

  private openPage(action: RuntimeAction): void {
    const target = safeNavigationTarget(action.url);
    if (!target) return;
    window.location.assign(target);
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
    let clearTargetAction = (): void => {};
    let revalidationTimer: ReturnType<typeof setTimeout> | null = null;
    let unavailable = false;
    let focusedOnce = false;
    let observer: MutationObserver | null = null;

    const markUnavailable = (): void => {
      if (!unavailable) blurHiddenTourCard(this.shadow, this.card);
      this.card.hidden = true;
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
      clearPosition = this.position(
        anchor,
        (step.placement as Placement) ?? 'bottom',
        step.presentationAnchor,
        handleOwnerAvailability,
        () => this.resolveReadiness(renderId),
        (error) => this.rejectReadiness(renderId, normalizeTourPresentationError(error)),
      );
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
            markUnavailable();
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
  ): () => void {
    let active = true;
    const owner = anchor.element;
    const reference = positioningReference(anchor, presentationAnchor);
    const update = (): void => {
      if (!canOwnPresentation(anchor)) {
        onOwnerAvailabilityChange(false);
        return;
      }
      onOwnerAvailabilityChange(true);
      void computePosition(reference, this.card, {
        placement,
        strategy: 'fixed',
        middleware: [
          offset(12),
          flip(),
          shift({ padding: 8 }),
          floatingArrow({ element: this.arrow }),
        ],
      })
        .then(({ x, y, placement: resolvedPlacement, middlewareData }) => {
          if (!active || !canOwnPresentation(anchor)) return;
          Object.assign(this.card.style, { position: 'fixed', left: `${x}px`, top: `${y}px` });
          positionTourArrow(this.arrow, resolvedPlacement, middlewareData.arrow);
          onPositioned();
        })
        .catch((error: unknown) => {
          if (active) onPositionError(error);
        });
    };
    const ownerWindow = owner.ownerDocument.defaultView ?? window;
    const ResizeObserverConstructor = ownerWindow.ResizeObserver;
    const resizeObserver = ResizeObserverConstructor ? new ResizeObserverConstructor(update) : null;
    resizeObserver?.observe(owner);
    update();
    ownerWindow.addEventListener('scroll', update, true);
    ownerWindow.addEventListener('resize', update);
    return () => {
      active = false;
      resizeObserver?.disconnect();
      ownerWindow.removeEventListener?.('scroll', update, true);
      ownerWindow.removeEventListener?.('resize', update);
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

  private focusCurrentTarget(): void {
    const step = this.doc.steps[this.index];
    if (!step) return;
    const signal = this.renderAbortController?.signal;
    if (!signal) return;
    void this.findTarget(step, signal)
      .then((target) => {
        if (!target || !this.host.isConnected) return;
        this.scrollForLifecycle(target.element, step.lifecycle);
        if (target.interactionSafe && target.element instanceof HTMLElement) {
          target.element.focus({ preventScroll: true });
        }
      })
      .catch(() => {});
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

export type TourTargetResolutionDiagnostic = Omit<ResolutionResult, 'element' | 'anchor'>;

export class TourPresentationCanceledError extends Error {
  constructor(message = 'Lodariq tour presentation was canceled') {
    super(message);
    this.name = 'TourPresentationCanceledError';
  }
}

export class TourPresentationUnavailableError extends Error {
  constructor(message = 'Lodariq tour presentation is unavailable') {
    super(message);
    this.name = 'TourPresentationUnavailableError';
  }
}

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

function throwIfTourPresentationCanceled(signal: AbortSignal): void {
  if (signal.aborted) throw new TourPresentationCanceledError();
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

function blurHiddenTourCard(shadow: ShadowRoot, card: HTMLElement): void {
  const activeElement = shadow.activeElement as (Element & { blur?: () => void }) | null;
  if (activeElement && card.contains(activeElement)) activeElement.blur?.();
}

function mutationAffectsPresentationOwner(record: MutationRecord, owner: Element): boolean {
  const changedNode = record.target;
  if (changedNode === owner || owner.contains(changedNode)) return true;
  if (changedNode.contains(owner)) return true;
  return [...record.removedNodes, ...record.addedNodes].some(
    (node) => node === owner || node.contains(owner),
  );
}

function presentationOwnerObservationRoots(owner: Element): Node[] {
  const roots: Node[] = [owner.ownerDocument.documentElement];
  let root = owner.getRootNode();
  let shadowHost = shadowRootHost(root);
  while (shadowHost) {
    roots.push(root);
    root = shadowHost.getRootNode();
    shadowHost = shadowRootHost(root);
  }
  return [...new Set(roots)];
}

function shadowRootHost(root: Node): Element | null {
  return (root as ShadowRoot).host ?? null;
}

function positioningReference(
  anchor: ResolvedAnchor,
  presentationAnchor: CompiledStep['presentationAnchor'],
): Element | VirtualElement {
  const owner = anchor.element;
  if (!presentationAnchor && anchor.kind === 'element') return owner;
  return {
    contextElement: owner,
    getBoundingClientRect: () =>
      presentationAnchor
        ? projectPresentationAnchor(anchor.getBoundingClientRect(), presentationAnchor)
        : anchor.getBoundingClientRect(),
  };
}

function projectPresentationAnchor(
  ownerRect: DOMRect,
  presentationAnchor: NonNullable<CompiledStep['presentationAnchor']>,
): ReturnType<VirtualElement['getBoundingClientRect']> {
  if (presentationAnchor.kind === 'element-bounds') {
    return projectedRect(ownerRect.left, ownerRect.top, ownerRect.width, ownerRect.height);
  }
  const xRatio = clampRatio(presentationAnchor.xRatio);
  const yRatio = clampRatio(presentationAnchor.yRatio);
  const x = ownerRect.left + ownerRect.width * xRatio;
  const y = ownerRect.top + ownerRect.height * yRatio;
  if (presentationAnchor.kind === 'point') return projectedRect(x, y, 0, 0);
  const widthRatio = Math.min(clampRatio(presentationAnchor.widthRatio), 1 - xRatio);
  const heightRatio = Math.min(clampRatio(presentationAnchor.heightRatio), 1 - yRatio);
  return projectedRect(x, y, ownerRect.width * widthRatio, ownerRect.height * heightRatio);
}

function clampRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
}

function canOwnPresentation(anchor: ResolvedAnchor): boolean {
  const owner = anchor.element;
  if (!owner.isConnected || !isVisible(owner)) return false;
  const rect = anchor.getBoundingClientRect();
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function projectedRect(
  x: number,
  y: number,
  width: number,
  height: number,
): ReturnType<VirtualElement['getBoundingClientRect']> {
  return {
    x,
    y,
    width,
    height,
    top: y,
    right: x + width,
    bottom: y + height,
    left: x,
  };
}

function positionTourArrow(
  element: HTMLElement,
  placement: Placement,
  data: { x?: number; y?: number } | undefined,
): void {
  const side = placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left';
  const staticSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }[side];
  const isVertical = side === 'top' || side === 'bottom';
  element.dataset['side'] = side;
  Object.assign(element.style, {
    left: isVertical && data?.x !== undefined ? `${data.x}px` : '',
    top: !isVertical && data?.y !== undefined ? `${data.y}px` : '',
    right: '',
    bottom: '',
  });
  element.style.setProperty(staticSide, '-9px');
}

function renderHeadingNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('h2');
  setBodyNodeText(element, node);
  return element;
}

function renderTextNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('div');
  setBodyNodeText(element, node);
  return element;
}

function renderListNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('ul');
  setBodyNodeAttributes(element, node);
  for (const item of listItems(node.text)) {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    element.appendChild(listItem);
  }
  return element;
}

function renderDividerNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('hr');
  setBodyNodeAttributes(element, node);
  return element;
}

function renderMediaNode(node: RuntimeBodyNode): HTMLElement {
  const element = document.createElement('div');
  setBodyNodeText(element, node);
  return element;
}

function renderButtonNode(node: RuntimeBodyNode, context: BodyNodeRenderContext): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  setBodyNodeText(element, node);
  configureActionElement(element, node.props.action, context);
  return element;
}

function renderLinkNode(node: RuntimeBodyNode, context: BodyNodeRenderContext): HTMLElement {
  const element = document.createElement('a');
  const target = safeNavigationTarget(node.props.action?.url);
  element.href = target ?? '#';
  setBodyNodeText(element, node);
  configureActionElement(element, node.props.action, context);
  return element;
}

function setBodyNodeText(element: HTMLElement, node: RuntimeBodyNode): void {
  setBodyNodeAttributes(element, node);
  element.textContent = node.text ?? '';
}

function setBodyNodeAttributes(element: HTMLElement, node: RuntimeBodyNode): void {
  element.setAttribute(LODARIQ_RENDERED_NODE_ID_ATTRIBUTE, node.id);
  element.setAttribute(LODARIQ_RENDERED_NODE_TYPE_ATTRIBUTE, node.type);
  if (node.props.variant) {
    element.setAttribute('data-lodariq-action-variant', node.props.variant);
  }
  const textStyle = node.props.textStyle;
  if (textStyle?.align) element.style.textAlign = textStyle.align;
  if (textStyle?.fontSizePx) element.style.fontSize = `${textStyle.fontSizePx}px`;
  if (textStyle?.color) element.style.color = textStyle.color;
  if (textStyle?.fontWeight) element.style.fontWeight = String(textStyle.fontWeight);
  if (textStyle?.fontStyle) element.style.fontStyle = textStyle.fontStyle;
}

function configureActionElement(
  element: HTMLButtonElement | HTMLAnchorElement,
  action: RuntimeAction | undefined,
  context: BodyNodeRenderContext,
): void {
  if (!actionEnabled(action)) {
    disableActionElement(element);
    return;
  }
  element.addEventListener('click', (event) => {
    event.preventDefault();
    context.onAction(action);
  });
}

function actionEnabled(action: RuntimeAction | undefined): action is RuntimeAction {
  if (!action) return false;
  if (action.type !== 'openPage') return true;
  return Boolean(safeNavigationTarget(action.url));
}

function disableActionElement(element: HTMLButtonElement | HTMLAnchorElement): void {
  element.setAttribute('aria-disabled', 'true');
  if (element instanceof HTMLButtonElement) {
    element.disabled = true;
    return;
  }
  element.removeAttribute('href');
  element.tabIndex = -1;
}

function listItems(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function safeNavigationTarget(rawUrl: string | undefined): string | null {
  return resolveSafeNavigationUrl(rawUrl, { baseUrl: window.location.href });
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

function routeMatches(expectedRoute: string): boolean {
  return `${location.pathname}${location.search}${location.hash}` === expectedRoute;
}

function scrollBlockFor(
  strategy: RuntimeLifecycleHints['scrollStrategy'] | undefined,
): ScrollLogicalPosition {
  if (strategy === 'top') return 'start';
  if (strategy === 'bottom') return 'end';
  if (strategy === 'nearest' || strategy === 'virtualized-search') return 'nearest';
  return 'center';
}

interface NetworkActivityTrackerHandle {
  waitForIdle: (timeoutMs: number, signal?: AbortSignal) => Promise<void>;
  release: () => void;
}

class NetworkActivityTracker {
  private static shared: NetworkActivityTracker | null = null;

  static acquire(): NetworkActivityTrackerHandle {
    const tracker = (NetworkActivityTracker.shared ??= new NetworkActivityTracker());
    tracker.references += 1;
    tracker.install();
    return {
      waitForIdle: (timeoutMs: number, signal?: AbortSignal) =>
        tracker.waitForIdle(timeoutMs, signal),
      release: () => tracker.release(),
    };
  }

  private references = 0;
  private activeRequests = 0;
  private lastActivityAt = Date.now();
  private originalFetch: typeof window.fetch | null = null;
  private trackedFetch: typeof window.fetch | null = null;
  private originalXhrSend: typeof XMLHttpRequest.prototype.send | null = null;
  private trackedXhrSend: typeof XMLHttpRequest.prototype.send | null = null;

  private install(): void {
    if (!this.trackedFetch && typeof window.fetch === 'function') {
      this.originalFetch = window.fetch;
      const originalFetch = this.originalFetch;
      const beginRequest = (): void => this.beginRequest();
      const endRequest = (): void => this.endRequest();
      this.trackedFetch = function trackedFetch(
        this: Window,
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): ReturnType<typeof fetch> {
        beginRequest();
        try {
          return originalFetch.call(this, input, init).finally(endRequest);
        } catch (error) {
          endRequest();
          throw error;
        }
      };
      window.fetch = this.trackedFetch;
    }

    if (!this.trackedXhrSend && typeof XMLHttpRequest !== 'undefined') {
      this.originalXhrSend = XMLHttpRequest.prototype.send;
      const originalXhrSend = this.originalXhrSend;
      const beginRequest = (): void => this.beginRequest();
      const endRequest = (): void => this.endRequest();
      this.trackedXhrSend = function trackedXhrSend(
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null,
      ): void {
        beginRequest();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          endRequest();
        };
        this.addEventListener('loadend', finish, { once: true });
        try {
          originalXhrSend.call(this, body);
        } catch (error) {
          finish();
          throw error;
        }
      };
      XMLHttpRequest.prototype.send = this.trackedXhrSend;
    }
  }

  private release(): void {
    this.references = Math.max(0, this.references - 1);
    if (this.references > 0) return;
    if (this.trackedFetch && window.fetch === this.trackedFetch && this.originalFetch) {
      window.fetch = this.originalFetch;
    }
    if (
      this.trackedXhrSend &&
      typeof XMLHttpRequest !== 'undefined' &&
      XMLHttpRequest.prototype.send === this.trackedXhrSend &&
      this.originalXhrSend
    ) {
      XMLHttpRequest.prototype.send = this.originalXhrSend;
    }
    this.trackedFetch = null;
    this.originalFetch = null;
    this.trackedXhrSend = null;
    this.originalXhrSend = null;
    NetworkActivityTracker.shared = null;
  }

  private beginRequest(): void {
    this.activeRequests += 1;
    this.lastActivityAt = Date.now();
  }

  private endRequest(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.lastActivityAt = Date.now();
  }

  private async waitForIdle(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal) throwIfTourPresentationCanceled(signal);
      const quietForMs = Date.now() - this.lastActivityAt;
      if (this.activeRequests === 0 && quietForMs >= NETWORK_IDLE_QUIET_MS) return;
      await delay(NETWORK_IDLE_POLL_MS, signal);
    }
  }
}

function acquireNetworkActivityTracker(): NetworkActivityTrackerHandle {
  return NetworkActivityTracker.acquire();
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    if (signal) throwIfTourPresentationCanceled(signal);
    await delay(50, signal);
  }
}

async function activateLifecycleControl(
  fingerprint: RuntimeLifecycleHints['openPanel'] | RuntimeLifecycleHints['selectTab'],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!fingerprint) return;
  const element = await waitForResolvedElement(fingerprint, timeoutMs, signal);
  if (signal) throwIfTourPresentationCanceled(signal);
  if (element instanceof HTMLElement) element.click();
}

async function waitForResolvedElement(
  fingerprint: NonNullable<RuntimeLifecycleHints['waitForElement']>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs;
  let result = resolve(fingerprint);
  while (!result.element && Date.now() < deadline) {
    if (signal) throwIfTourPresentationCanceled(signal);
    await delay(50, signal);
    result = resolve(fingerprint);
  }
  return result.element;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
  if (signal.aborted) return Promise.reject(new TourPresentationCanceledError());
  return new Promise((resolveDelay, rejectDelay) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolveDelay();
    }, ms);
    const cancel = (): void => {
      clearTimeout(timer);
      rejectDelay(new TourPresentationCanceledError());
    };
    signal.addEventListener('abort', cancel, { once: true });
  });
}

function lifecycleTextAppliesToCurrentLocale(lifecycle: RuntimeLifecycleHints): boolean {
  if (!lifecycle.waitForTextLocale) return true;
  const expected = canonicalLocale(lifecycle.waitForTextLocale);
  const current = canonicalLocale(document.documentElement.lang || navigator.language);
  if (!expected || !current) return false;
  return expected === current || expected.split('-')[0] === current.split('-')[0];
}

function canonicalLocale(value: string): string | null {
  const candidate = value.trim().replace(/_/g, '-');
  if (!candidate) return null;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

function nearestScrollable(element: Element): Element | null {
  let current = element.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(`${style.overflow}${style.overflowY}${style.overflowX}`))
      return current;
    current = current.parentElement;
  }
  return null;
}

function scrollIntoView(element: Element, options: ScrollIntoViewOptions): void {
  if ('scrollIntoView' in element && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView(options);
  }
}

function createStyles(): HTMLStyleElement {
  return createNonceStyleElement(
    document,
    `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--lodariq-tour-z-index, 2147483647);
      pointer-events: none;
      font-family: var(--lq-tour-font-family);
    }

    div[role="dialog"] {
      box-sizing: border-box;
      width: min(var(--lq-tour-width), calc(100vw - 24px));
      padding: var(--lq-tour-spacing);
      border: var(--lq-tour-border-width) solid var(--lq-tour-border-color);
      border-radius: var(--lq-tour-radius);
      background: var(--lq-tour-surface);
      box-shadow: var(--lq-tour-elevation);
      color: var(--lq-tour-text-color);
      pointer-events: auto;
      transition:
        background-color var(--lq-tour-motion-duration) var(--lq-tour-motion-easing),
        border-color var(--lq-tour-motion-duration) var(--lq-tour-motion-easing),
        color var(--lq-tour-motion-duration) var(--lq-tour-motion-easing);
    }

    .tour-arrow {
      position: absolute;
      z-index: 1;
      width: 16px;
      height: 16px;
      border: 0;
      background: transparent;
      pointer-events: none;
    }

    .tour-arrow::before,
    .tour-arrow::after {
      position: absolute;
      width: 0;
      height: 0;
      content: "";
    }

    .tour-arrow[data-side="bottom"]::before {
      top: 0;
      left: 0;
      border-right: 8px solid transparent;
      border-bottom: 9px solid var(--lq-tour-border-color);
      border-left: 8px solid transparent;
    }

    .tour-arrow[data-side="bottom"]::after {
      top: 2px;
      left: 2px;
      border-right: 6px solid transparent;
      border-bottom: 7px solid var(--lq-tour-surface);
      border-left: 6px solid transparent;
    }

    .tour-arrow[data-side="top"]::before {
      bottom: 0;
      left: 0;
      border-top: 9px solid var(--lq-tour-border-color);
      border-right: 8px solid transparent;
      border-left: 8px solid transparent;
    }

    .tour-arrow[data-side="top"]::after {
      bottom: 2px;
      left: 2px;
      border-top: 7px solid var(--lq-tour-surface);
      border-right: 6px solid transparent;
      border-left: 6px solid transparent;
    }

    .tour-arrow[data-side="right"]::before {
      top: 0;
      left: 0;
      border-top: 8px solid transparent;
      border-right: 9px solid var(--lq-tour-border-color);
      border-bottom: 8px solid transparent;
    }

    .tour-arrow[data-side="right"]::after {
      top: 2px;
      left: 2px;
      border-top: 6px solid transparent;
      border-right: 7px solid var(--lq-tour-surface);
      border-bottom: 6px solid transparent;
    }

    .tour-arrow[data-side="left"]::before {
      top: 0;
      right: 0;
      border-top: 8px solid transparent;
      border-bottom: 8px solid transparent;
      border-left: 9px solid var(--lq-tour-border-color);
    }

    .tour-arrow[data-side="left"]::after {
      top: 2px;
      right: 2px;
      border-top: 6px solid transparent;
      border-bottom: 6px solid transparent;
      border-left: 7px solid var(--lq-tour-surface);
    }

    .tour-arrow[hidden] {
      display: none;
    }

    [data-lodariq-node-type="heading"] {
      margin: 0 0 calc(var(--lq-tour-spacing) * .5);
      font-size: var(--lq-tour-base-font-size);
      font-weight: var(--lq-tour-heading-font-weight);
      line-height: var(--lq-tour-heading-line-height);
    }

    [data-lodariq-node-type="paragraph"] {
      margin: 0 0 var(--lq-tour-spacing);
      color: var(--lq-tour-muted-text-color);
      font-size: var(--lq-tour-small-font-size);
      line-height: var(--lq-tour-body-line-height);
    }

    [data-lodariq-node-type="list"] {
      margin: 0 0 var(--lq-tour-spacing) calc(var(--lq-tour-spacing) * 1.5);
      padding: 0;
      color: var(--lq-tour-text-color);
      font-size: var(--lq-tour-small-font-size);
      line-height: var(--lq-tour-body-line-height);
    }

    [data-lodariq-node-type="list"] li + li {
      margin-top: 4px;
    }

    [data-lodariq-node-type="divider"] {
      margin: var(--lq-tour-spacing) 0;
      border: 0;
      border-top: var(--lq-tour-border-width) solid var(--lq-tour-border-color);
    }

    [data-lodariq-node-type="media"] {
      margin: var(--lq-tour-spacing) 0;
      padding: var(--lq-tour-spacing);
      border: var(--lq-tour-border-width) dashed var(--lq-tour-border-color);
      border-radius: var(--lq-tour-radius);
      background: var(--lq-tour-secondary-surface);
      color: var(--lq-tour-secondary-text);
      font-size: var(--lq-tour-small-font-size);
      line-height: var(--lq-tour-body-line-height);
      text-align: center;
    }

    a {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      margin-top: 2px;
      color: var(--lq-tour-primary-surface);
      font-size: var(--lq-tour-small-font-size);
      font-weight: var(--lq-tour-action-font-weight);
      text-decoration: none;
      cursor: pointer;
    }

    a:hover {
      text-decoration: underline;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: calc(var(--lq-tour-spacing) * .6) var(--lq-tour-spacing);
      border: var(--lq-tour-border-width) solid transparent;
      border-radius: var(--lq-tour-radius);
      background: var(--lq-tour-primary-surface);
      color: var(--lq-tour-primary-text);
      font: inherit;
      font-weight: var(--lq-tour-action-font-weight);
      cursor: pointer;
    }

    button[data-lodariq-action-variant="secondary"] {
      border-color: var(--lq-tour-border-color);
      background: var(--lq-tour-secondary-surface);
      color: var(--lq-tour-secondary-text);
    }

    button:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--lq-tour-focus-color);
      outline-offset: 2px;
    }

    button[disabled],
    [aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.55;
    }

    :host([data-lodariq-embedded-preview]) {
      position: absolute;
      z-index: 1;
      display: grid;
      place-items: center;
      box-sizing: border-box;
      padding: 12px;
      overflow: hidden;
    }

    :host([data-lodariq-embedded-preview]) div[role="dialog"] {
      width: min(var(--lq-tour-width), 100%);
      max-height: 100%;
      overflow: auto;
      pointer-events: none;
    }
  `,
  );
}
