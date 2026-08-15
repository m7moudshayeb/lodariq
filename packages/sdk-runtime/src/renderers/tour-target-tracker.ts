import type { CompiledStep } from '@lodariq/schema';
import type { Placement } from '@floating-ui/dom';
import type { ResolvedAnchor, ResolutionResult } from '../resolver';
import { TourPresentationUnavailableError } from './tour-errors';
import {
  blurHiddenTourCard,
  canOwnPresentation,
  mutationAffectsPresentationOwner,
  positionTargetOutline,
  positionTourArrow,
  positioningReference,
  presentationOwnerObservationRoots,
  shadowRootHost,
} from './tour-positioning';
import { rectFromDomRect, type ProtectedSurfaceRect } from './protected-surface';
import { computeCollisionAwareTourPosition } from './tour-protected-positioning';

const TARGET_REVALIDATION_THROTTLE_MS = 500;

export interface TrackTourTargetOptions {
  anchor: ResolvedAnchor;
  armTargetClickAdvance: (target: Element, onInvalidOwner: () => void) => () => void;
  arrow: HTMLElement;
  authoringPreviewInteractive: boolean;
  authoringPreviewOwnerId?: string;
  card: HTMLElement;
  getProtectedSurfaces?: () => readonly ProtectedSurfaceRect[];
  host: HTMLElement;
  isCurrentRender: () => boolean;
  onPositionError: (error: Error) => void;
  onPositioned: () => void;
  onSurfaceChange?: (rect: ProtectedSurfaceRect | null) => void;
  resolveStepTarget: () => ResolutionResult | null;
  scrollForLifecycle: (target: Element) => void;
  shadow: ShadowRoot;
  step: CompiledStep;
  stopPlayer: () => void;
  targetOutline: HTMLElement | null;
}

export function trackTourTarget(options: TrackTourTargetOptions): () => void {
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
    if (!unavailable) blurHiddenTourCard(options.shadow, options.card);
    options.card.hidden = true;
    if (options.targetOutline) options.targetOutline.hidden = true;
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
    options.card.hidden = true;
    if (!options.authoringPreviewOwnerId || options.authoringPreviewInteractive) {
      options.scrollForLifecycle(target);
    }
    const position = positionTrackedTourTarget(options, anchor, handleOwnerAvailability);
    clearPosition = position.stop;
    updatePosition = position.update;
    if (!canOwnPresentation(anchor)) {
      markUnavailable();
      if (options.authoringPreviewOwnerId) {
        options.onPositionError(
          new TourPresentationUnavailableError(
            `Lodariq tour target is not visible for step ${options.step.id}`,
          ),
        );
      }
      scheduleRevalidation(true);
      observePresentationOwnerRoots();
      return;
    }
    options.card.hidden = false;
    clearTargetAction =
      anchor.interactionSafe &&
      (!options.authoringPreviewOwnerId || options.authoringPreviewInteractive) &&
      stepWaitsForTargetClick(options.step)
        ? options.armTargetClickAdvance(target, handleInvalidOwnerClick)
        : () => {};
    if (!focusedOnce && (!options.authoringPreviewOwnerId || options.authoringPreviewInteractive)) {
      focusedOnce = true;
      focusTourCard(options.card);
    }
    observePresentationOwnerRoots();
  };

  const revalidate = (): void => {
    revalidationTimer = null;
    if (!options.isCurrentRender() || !options.host.isConnected) return;
    const safelyResolvedAnchor = options.resolveStepTarget()?.anchor;
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
    revalidationTimer = setTimeout(revalidate, immediate ? 0 : TARGET_REVALIDATION_THROTTLE_MS);
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

  bind(options.anchor);
  const Observer = options.card.ownerDocument.defaultView?.MutationObserver;
  observer = Observer
    ? new Observer((records) => {
        if (!options.isCurrentRender()) return;
        if (!options.host.isConnected) {
          options.stopPlayer();
          return;
        }
        const ownerChanged = Boolean(
          currentTarget &&
          records.some((record) => mutationAffectsPresentationOwner(record, currentTarget!)),
        );
        if (ownerChanged) {
          if (!currentAnchor || !canOwnPresentation(currentAnchor)) markUnavailable();
          scheduleRevalidation(true);
          return;
        }
        scheduleRevalidation();
      })
    : null;
  observePresentationOwnerRoots();

  return () => {
    observer?.disconnect();
    if (revalidationTimer) clearTimeout(revalidationTimer);
    clearPosition();
    clearTargetAction();
    options.onSurfaceChange?.(null);
  };
}

function positionTrackedTourTarget(
  options: TrackTourTargetOptions,
  anchor: ResolvedAnchor,
  onOwnerAvailabilityChange: (available: boolean) => void,
): { stop: () => void; update: () => void } {
  let active = true;
  const owner = anchor.element;
  const reference = positioningReference(anchor, options.step.presentationAnchor);
  const placement = (options.step.placement as Placement) ?? 'bottom';
  const update = (): void => {
    if (!canOwnPresentation(anchor)) {
      onOwnerAvailabilityChange(false);
      return;
    }
    onOwnerAvailabilityChange(true);
    positionTargetOutline(options.targetOutline, anchor.element);
    let protectedSurfaces: readonly ProtectedSurfaceRect[] | undefined;
    if (options.authoringPreviewOwnerId && options.getProtectedSurfaces) {
      try {
        protectedSurfaces = options.getProtectedSurfaces();
      } catch {
        protectedSurfaces = undefined;
      }
    }
    void computeCollisionAwareTourPosition({
      anchor,
      arrowElement: options.arrow,
      card: options.card,
      placement,
      protectedSurfaces,
      reference,
    })
      .then(({ x, y, placement: resolvedPlacement, middlewareData }) => {
        if (!active || !canOwnPresentation(anchor)) return;
        Object.assign(options.card.style, { position: 'fixed', left: `${x}px`, top: `${y}px` });
        positionTourArrow(options.arrow, resolvedPlacement, middlewareData.arrow);
        if (options.authoringPreviewOwnerId) {
          options.onSurfaceChange?.(rectFromDomRect(options.card.getBoundingClientRect(), 4));
        }
        options.onPositioned();
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (options.targetOutline) options.targetOutline.hidden = true;
        options.onPositionError(normalizeTourPresentationError(error));
      });
  };
  const ownerWindow = owner.ownerDocument.defaultView ?? window;
  const resizeObserver = ownerWindow.ResizeObserver ? new ownerWindow.ResizeObserver(update) : null;
  const scrollTargets: EventTarget[] = [
    ownerWindow,
    ...presentationOwnerObservationRoots(owner).filter((root) => shadowRootHost(root)),
  ];
  resizeObserver?.observe(owner);
  update();
  for (const target of scrollTargets) target.addEventListener?.('scroll', update, true);
  ownerWindow.addEventListener?.('resize', update);
  return {
    update,
    stop: () => {
      active = false;
      if (options.targetOutline) options.targetOutline.hidden = true;
      resizeObserver?.disconnect();
      for (const target of scrollTargets) target.removeEventListener?.('scroll', update, true);
      ownerWindow.removeEventListener?.('resize', update);
    },
  };
}

function normalizeTourPresentationError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new TourPresentationUnavailableError();
}

function stepWaitsForTargetClick(step: CompiledStep): boolean {
  return step.body.some((node) => node.props.action?.type === 'clickTarget');
}

function focusTourCard(card: HTMLElement): void {
  (card.querySelector<HTMLElement>('button, a[href]') ?? card).focus();
}
