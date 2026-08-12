import type { DragEvent } from 'react';
import type { BlockInsertPosition } from '../document-ops';

export const DRAG_AUTO_SCROLL_EDGE_PX = 88;
const AUTO_SCROLL_MAX_DELTA_PX = 28;

export function dropPosition(
  event: Event | DragEvent<HTMLElement>,
  fallback: BlockInsertPosition = 'before',
  selector = '.block[data-block-id]',
): BlockInsertPosition {
  const clientY = 'clientY' in event ? event.clientY : null;
  if (typeof clientY !== 'number' || !Number.isFinite(clientY) || clientY <= 0) return fallback;

  const targetElement =
    event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
  const currentTarget = event.currentTarget;
  const currentTargetElement =
    currentTarget instanceof HTMLElement && currentTarget.matches(selector) ? currentTarget : null;
  const blockElement = targetElement ?? currentTargetElement;
  if (!blockElement) return fallback;

  const rect = blockElement.getBoundingClientRect();
  if (rect.height <= 0) return fallback;
  return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}

export function dragAutoScrollDelta(edgeOverlap: number): number {
  const progress = Math.max(0, Math.min(1, edgeOverlap / DRAG_AUTO_SCROLL_EDGE_PX));
  return Math.ceil(6 + progress * (AUTO_SCROLL_MAX_DELTA_PX - 6));
}

export function closestStepContentDragTarget(
  target: EventTarget | null,
): { blockId: string; stepBlockId: string } | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('.step-child[data-block-id][data-step-block-id]');
  const blockId = element?.dataset['blockId'];
  const stepBlockId = element?.dataset['stepBlockId'];
  return blockId && stepBlockId ? { blockId, stepBlockId } : null;
}

export function closestTopLevelInsertTarget(
  target: EventTarget | null,
): { anchorBlockId: string; position: BlockInsertPosition } | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>(
    '.inline-insert[data-top-level-insert-anchor-id][data-top-level-insert-position]',
  );
  const anchorBlockId = element?.dataset['topLevelInsertAnchorId'];
  const position = element?.dataset['topLevelInsertPosition'];
  if (!anchorBlockId || (position !== 'before' && position !== 'after')) return null;
  return { anchorBlockId, position };
}

export function nativeDataTransfer(event: Event): DataTransfer | null {
  return (event as { dataTransfer?: DataTransfer | null }).dataTransfer ?? null;
}

export function reactDataTransfer(event: DragEvent<HTMLElement>): DataTransfer | null {
  return (
    (event as DragEvent<HTMLElement> & { dataTransfer?: DataTransfer | null }).dataTransfer ?? null
  );
}

export function primeDragTransfer(dataTransfer: DataTransfer | null, blockId: string): void {
  if (!dataTransfer) return;
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData('text/plain', blockId);
}
