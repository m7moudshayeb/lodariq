import { TARGET_VIEWPORT_BREAKPOINTS } from '@lodariq/schema/target-runtime';
import type {
  TargetVisualDistanceBucket,
  TargetVisualRelation,
  TargetVisualTopology,
  TargetViewportClass,
} from '@lodariq/schema/target';
import type { TargetResolutionContext } from './contracts';
import {
  belongsToRoot,
  isVisible,
  parentElementAcrossOpenShadow,
  semanticRoleOf,
  stableKeyMatches,
} from './element-evidence';

const MIN_CONTAINER_AREA_MULTIPLIER = 1.25;
const MAX_CONTAINER_DEPTH = 6;
const MIN_RECT_DIMENSION = 0.5;
const SHAPE_RATIO_TOLERANCE = 0.12;
const SHAPE_CENTER_TOLERANCE = 0.18;
const SHAPE_ASPECT_RELATIVE_TOLERANCE = 0.35;
const CONTAINER_RATIO_TOLERANCE = 0.18;
const DISTANCE_TOLERANCE = 0.12;

interface RectShape {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface LiveTopology {
  viewportClass: TargetViewportClass;
  target: {
    widthRatio: number;
    heightRatio: number;
    aspectRatio: number;
    centerXRatio: number;
    centerYRatio: number;
  };
  container?: { widthRatio: number; heightRatio: number };
  targetRect: RectShape;
  containerRect: RectShape;
  containerElement?: Element;
  viewportRect: RectShape;
}

/**
 * Match only coarse, normalized topology. The caller decides whether topology
 * is supporting semantic evidence or one member of a presentation-only visual
 * evidence quorum; this function never resolves a target by itself.
 */
export function visualTopologyMatches(
  topologies: readonly TargetVisualTopology[] | undefined,
  candidate: Element,
  allElements: readonly Element[],
  root: ParentNode,
  context: TargetResolutionContext,
): boolean {
  if (!topologies?.length) return false;
  const live = liveTopologyOf(candidate);
  if (!live) return false;

  const eligible = selectTopologyVariants(topologies, live.viewportClass, context.stateId);
  return eligible.some((expected) => topologyMatches(expected, live, allElements, root, context));
}

export function viewportClassOf(root: ParentNode): TargetViewportClass | null {
  const document = root instanceof Document ? root : root.ownerDocument;
  if (!document) return null;
  const width = viewportWidth(document);
  if (width <= 0) return null;
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.mobileMaxWidth) return 'mobile';
  if (width <= TARGET_VIEWPORT_BREAKPOINTS.tabletMaxWidth) return 'tablet';
  return 'desktop';
}

function liveTopologyOf(candidate: Element): LiveTopology | null {
  const document = candidate.ownerDocument;
  const viewportWidthValue = viewportWidth(document);
  const viewportHeightValue = viewportHeight(document);
  if (viewportWidthValue <= 0 || viewportHeightValue <= 0) return null;

  const targetRect = safeRect(candidate);
  if (!targetRect) return null;
  const viewportRect = rectFromBounds(0, 0, viewportWidthValue, viewportHeightValue);
  const container = visualContainerOf(candidate, targetRect);
  const containerRect = container ? (safeRect(container) ?? viewportRect) : viewportRect;
  const centerReferenceWidth = container
    ? Math.max(containerRect.width, container.scrollWidth)
    : containerRect.width;
  const centerReferenceHeight = container
    ? Math.max(containerRect.height, container.scrollHeight)
    : containerRect.height;
  const viewportClass = viewportClassOf(document);
  if (!viewportClass) return null;

  return {
    viewportClass,
    target: {
      widthRatio: boundedRatio(targetRect.width, containerRect.width),
      heightRatio: boundedRatio(targetRect.height, containerRect.height),
      aspectRatio: clamp(targetRect.width / targetRect.height, 0.01, 100),
      centerXRatio: boundedRatio(
        centerX(targetRect) - containerRect.left + (container?.scrollLeft ?? 0),
        centerReferenceWidth,
      ),
      centerYRatio: boundedRatio(
        centerY(targetRect) - containerRect.top + (container?.scrollTop ?? 0),
        centerReferenceHeight,
      ),
    },
    ...(container
      ? {
          container: {
            widthRatio: boundedRatio(containerRect.width, viewportWidthValue),
            heightRatio: boundedRatio(containerRect.height, viewportHeightValue),
          },
        }
      : {}),
    targetRect,
    containerRect,
    ...(container ? { containerElement: container } : {}),
    viewportRect,
  };
}

function selectTopologyVariants(
  topologies: readonly TargetVisualTopology[],
  viewportClass: TargetViewportClass,
  stateId: string | undefined,
): TargetVisualTopology[] {
  const viewportMatches = topologies.filter((entry) => entry.viewportClass === viewportClass);
  if (!stateId) return viewportMatches.filter((entry) => !entry.stateId);
  const exactState = viewportMatches.filter((entry) => entry.stateId === stateId);
  if (exactState.length > 0) return exactState;
  return viewportMatches.filter((entry) => !entry.stateId);
}

function topologyMatches(
  expected: TargetVisualTopology,
  live: LiveTopology,
  allElements: readonly Element[],
  root: ParentNode,
  context: TargetResolutionContext,
): boolean {
  const shapeChanged =
    Math.abs(expected.target.widthRatio - live.target.widthRatio) > SHAPE_RATIO_TOLERANCE ||
    Math.abs(expected.target.heightRatio - live.target.heightRatio) > SHAPE_RATIO_TOLERANCE ||
    relativeDifference(expected.target.aspectRatio, live.target.aspectRatio) >
      SHAPE_ASPECT_RELATIVE_TOLERANCE;
  const containerRelativePositionChanged =
    Boolean(expected.container) &&
    expected.target.centerXRatio !== undefined &&
    expected.target.centerYRatio !== undefined &&
    (Math.abs(expected.target.centerXRatio - live.target.centerXRatio) > SHAPE_CENTER_TOLERANCE ||
      Math.abs(expected.target.centerYRatio - live.target.centerYRatio) > SHAPE_CENTER_TOLERANCE);
  if (shapeChanged || containerRelativePositionChanged) {
    return false;
  }
  if (expected.container) {
    if (!live.container) return false;
    if (
      Math.abs(expected.container.widthRatio - live.container.widthRatio) >
        CONTAINER_RATIO_TOLERANCE ||
      Math.abs(expected.container.heightRatio - live.container.heightRatio) >
        CONTAINER_RATIO_TOLERANCE
    ) {
      return false;
    }
  }
  if (expected.relations?.length) {
    const matchingRelations = expected.relations.filter((relation) =>
      visualRelationMatches(relation, live, allElements, root, context),
    ).length;
    if (matchingRelations / expected.relations.length < 0.6) return false;
  }
  return true;
}

function visualRelationMatches(
  expected: TargetVisualRelation,
  live: LiveTopology,
  allElements: readonly Element[],
  root: ParentNode,
  context: TargetResolutionContext,
): boolean {
  const referenceRect = referenceRectFor(expected, live, allElements, root, context);
  if (!referenceRect) return false;
  if (expected.kind === 'inside') {
    if (intersectionRatio(live.targetRect, referenceRect) < 0.9) return false;
  } else if (
    relativeVisualRelation(live.targetRect, referenceRect, live.containerRect) !== expected.kind
  ) {
    return false;
  }

  if (!expected.distanceBucket && expected.distanceRatio === undefined) return true;
  const distanceRatio = normalizedDistance(live.targetRect, referenceRect, live.containerRect);
  if (
    expected.distanceRatio !== undefined &&
    Math.abs(expected.distanceRatio - distanceRatio) > DISTANCE_TOLERANCE
  ) {
    return false;
  }
  if (expected.distanceBucket && distanceBucket(distanceRatio) !== expected.distanceBucket)
    return false;
  return true;
}

function referenceRectFor(
  expected: TargetVisualRelation,
  live: LiveTopology,
  allElements: readonly Element[],
  root: ParentNode,
  context: TargetResolutionContext,
): RectShape | null {
  if (expected.reference === 'viewport') return live.viewportRect;
  if (expected.reference === 'container') return live.containerRect;
  if (!expected.referenceKey) return null;

  const registered = safelyResolveStableKey(context, expected.referenceKey);
  if (
    registered &&
    belongsToRoot(registered, root) &&
    isVisible(registered) &&
    belongsToVisualContainer(registered, live.containerElement)
  ) {
    return safeRect(registered);
  }
  const peers = allElements.filter(
    (element) =>
      isVisible(element) &&
      belongsToVisualContainer(element, live.containerElement) &&
      stableKeyMatches(element, expected.referenceKey!),
  );
  return peers.length === 1 ? safeRect(peers[0]!) : null;
}

function belongsToVisualContainer(element: Element, container: Element | undefined): boolean {
  if (!container) return true;
  let current: Element | null = element;
  while (current) {
    if (current === container) return true;
    current = parentElementAcrossOpenShadow(current);
  }
  return false;
}

function safelyResolveStableKey(
  context: TargetResolutionContext,
  stableKey: string,
): Element | null {
  try {
    return context.resolveStableKey?.(stableKey) ?? null;
  } catch {
    return null;
  }
}

function visualContainerOf(candidate: Element, targetRect: RectShape): Element | null {
  const targetArea = area(targetRect);
  let current = parentElementAcrossOpenShadow(candidate);
  let depth = 0;
  while (current && depth < MAX_CONTAINER_DEPTH) {
    if (isStableVisualContainer(current) && isVisible(current)) {
      const rect = safeRect(current);
      if (
        rect &&
        containsRect(rect, targetRect) &&
        area(rect) >= targetArea * MIN_CONTAINER_AREA_MULTIPLIER
      ) {
        return current;
      }
    }
    current = parentElementAcrossOpenShadow(current);
    depth += 1;
  }
  return null;
}

/** Ignore generic wrappers so wrapper churn does not change topology space. */
function isStableVisualContainer(element: Element): boolean {
  return Boolean(semanticRoleOf(element));
}

function safeRect(element: Element): RectShape | null {
  try {
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
    if (rect.width < MIN_RECT_DIMENSION || rect.height < MIN_RECT_DIMENSION) return null;
    return rectFromBounds(rect.left, rect.top, rect.width, rect.height);
  } catch {
    return null;
  }
}

function rectFromBounds(left: number, top: number, width: number, height: number): RectShape {
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function viewportWidth(document: Document): number {
  return document.defaultView?.innerWidth || document.documentElement.clientWidth || 0;
}

function viewportHeight(document: Document): number {
  return document.defaultView?.innerHeight || document.documentElement.clientHeight || 0;
}

function intersectionRatio(target: RectShape, reference: RectShape): number {
  const targetArea = area(target);
  return targetArea > 0 ? intersectionArea(target, reference) / targetArea : 0;
}

function intersectionArea(first: RectShape, second: RectShape): number {
  const width = Math.max(
    0,
    Math.min(first.right, second.right) - Math.max(first.left, second.left),
  );
  const height = Math.max(
    0,
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top),
  );
  return width * height;
}

function area(rect: RectShape): number {
  return rect.width * rect.height;
}

function containsRect(container: RectShape, child: RectShape): boolean {
  return (
    child.left >= container.left - 1 &&
    child.top >= container.top - 1 &&
    child.right <= container.right + 1 &&
    child.bottom <= container.bottom + 1
  );
}

function centerX(rect: RectShape): number {
  return rect.left + rect.width / 2;
}

function centerY(rect: RectShape): number {
  return rect.top + rect.height / 2;
}

function normalizedDistance(target: RectShape, reference: RectShape, container: RectShape): number {
  const x = centerX(target) - centerX(reference);
  const y = centerY(target) - centerY(reference);
  const distance = Math.hypot(x, y);
  return boundedRatio(distance, Math.hypot(container.width, container.height));
}

function distanceBucket(ratio: number): TargetVisualDistanceBucket {
  if (ratio <= 0.15) return 'near';
  if (ratio <= 0.4) return 'medium';
  return 'far';
}

function relativeDifference(first: number, second: number): number {
  return Math.abs(first - second) / Math.max(Math.abs(first), Math.abs(second), 0.0001);
}

function relativeVisualRelation(
  target: RectShape,
  peer: RectShape,
  container: RectShape,
): TargetVisualRelation['kind'] {
  const dx = centerX(peer) - centerX(target);
  const dy = centerY(peer) - centerY(target);
  const alignedX = Math.abs(dx) <= Math.max(8, container.width * 0.03);
  const alignedY = Math.abs(dy) <= Math.max(8, container.height * 0.03);
  if (alignedX && !alignedY) return 'aligned-x';
  if (alignedY && !alignedX) return 'aligned-y';
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'right-of' : 'left-of';
  return dy < 0 ? 'below' : 'above';
}

function boundedRatio(value: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return clamp(value / denominator, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
