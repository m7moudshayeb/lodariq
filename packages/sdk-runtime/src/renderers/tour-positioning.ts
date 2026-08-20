import type { Placement, VirtualElement } from '@floating-ui/dom';
import type { CompiledStep } from '@lodariq/schema';
import type { ResolvedAnchor } from '../resolver';
import { isVisible } from '../resolver/element-evidence';

export const TARGET_OUTLINE_GAP_PX = 3;

export function createTargetOutline(doc: Document): HTMLDivElement {
  const outline = doc.createElement('div');
  outline.className = 'tour-target-outline';
  outline.setAttribute('data-lodariq-target-outline', '');
  outline.setAttribute('aria-hidden', 'true');
  outline.hidden = true;
  return outline;
}

export function positionTargetOutline(
  outline: HTMLElement | null,
  owner: Element,
  offsetPx: number = TARGET_OUTLINE_GAP_PX,
): void {
  if (!outline) return;
  const rect = owner.getBoundingClientRect();
  Object.assign(outline.style, {
    left: `${rect.left - offsetPx}px`,
    top: `${rect.top - offsetPx}px`,
    width: `${rect.width + offsetPx * 2}px`,
    height: `${rect.height + offsetPx * 2}px`,
  });
  if (outline.dataset['lodariqOutlineFollowRadius'] === 'true') {
    const radius = owner.ownerDocument.defaultView?.getComputedStyle(owner).borderRadius;
    if (radius) outline.style.setProperty('--lq-outline-radius', radius);
  }
  outline.hidden = false;
}

export function blurHiddenTourCard(shadow: ShadowRoot, card: HTMLElement): void {
  const activeElement = shadow.activeElement as (Element & { blur?: () => void }) | null;
  if (activeElement && card.contains(activeElement)) activeElement.blur?.();
}

export function mutationAffectsPresentationOwner(record: MutationRecord, owner: Element): boolean {
  const changedNode = record.target;
  if (changedNode === owner || owner.contains(changedNode)) return true;
  if (record.type === 'attributes' && changedNode.contains(owner)) return true;
  if (record.type !== 'childList') return false;
  return [...record.removedNodes, ...record.addedNodes].some(
    (node) => node === owner || node.contains(owner),
  );
}

export function presentationOwnerObservationRoots(owner: Element): Node[] {
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

export function shadowRootHost(root: Node): Element | null {
  return (root as ShadowRoot).host ?? null;
}

export function positioningReference(
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

export function canOwnPresentation(anchor: ResolvedAnchor): boolean {
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

export function positionTourArrow(
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
