import { ControllerNativeEventsFeature } from './controller-native-events';
import { authoringText } from '../../i18n';
import { type LodariqBlock } from '@lodariq/schema';
import type { DragEvent, KeyboardEvent } from 'react';
import { type BlockDirection, type BlockInsertPosition } from '../document-ops';
import { isEditableControl } from './utils';
import {
  DRAG_AUTO_SCROLL_EDGE_PX,
  dragAutoScrollDelta,
  dropPosition,
  primeDragTransfer,
  reactDataTransfer,
} from './controller-drag';

export abstract class ControllerDragDropFeature extends ControllerNativeEventsFeature {
  abstract deleteStepContentBlock(stepBlockId: string, childBlockId: string): void;
  abstract deleteTopLevelBlock(blockId: string): void;
  abstract duplicateStepContentBlock(stepBlockId: string, childBlockId: string): void;
  abstract duplicateTopLevelBlock(blockId: string): void;
  abstract moveStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    direction: BlockDirection,
  ): void;
  abstract moveTopLevelBlock(blockId: string, direction: BlockDirection): void;
  protected abstract stepContentBlocks(blocks: LodariqBlock[], stepBlockId: string): LodariqBlock[];

  startDraggingBlock(blockId: string, event?: DragEvent<HTMLElement>): void {
    this.selectBlock(blockId);
    this.draggingBlockId = blockId;
    primeDragTransfer(event ? reactDataTransfer(event) : null, blockId);
    this.updateDragTarget(null, null);
    this.setStatus(authoringText('Move item to a new position'));
  }

  handleBlockDragOver(event: DragEvent<HTMLElement>): void {
    if (!this.draggingBlockId || this.draggingStepBlockId) return;
    event.preventDefault();
    this.autoScrollDuringDrag(event);
    const transfer = reactDataTransfer(event);
    if (transfer) transfer.dropEffect = 'move';
    this.updateDragTarget(
      event.currentTarget.dataset['blockId'] ?? null,
      dropPosition(event, this.dropPositionFallback(event.currentTarget.dataset['blockId'] ?? '')),
    );
  }

  handleBlockDrop(event: DragEvent<HTMLElement>, targetBlockId: string): void {
    event.preventDefault();
    if (this.draggingStepBlockId) {
      this.clearDragState();
      return;
    }
    if (this.draggingBlockId && targetBlockId) {
      this.reorderTopLevelBlock(
        this.draggingBlockId,
        targetBlockId,
        dropPosition(event, this.dropPositionFallback(targetBlockId)),
      );
    }
    this.clearDragState();
  }

  handleTopLevelInsertDragOver(
    event: DragEvent<HTMLElement>,
    anchorBlockId: string,
    position: BlockInsertPosition,
  ): void {
    if (!this.draggingBlockId || this.draggingStepBlockId) return;
    event.preventDefault();
    event.stopPropagation();
    this.autoScrollDuringDrag(event);
    const transfer = reactDataTransfer(event);
    if (transfer) transfer.dropEffect = 'move';
    this.updateDragTarget(anchorBlockId, position);
  }

  handleTopLevelInsertDrop(
    event: DragEvent<HTMLElement>,
    anchorBlockId: string,
    position: BlockInsertPosition,
  ): void {
    if (!this.draggingBlockId || this.draggingStepBlockId) return;
    event.preventDefault();
    event.stopPropagation();
    const blockId = this.draggingBlockId;
    this.reorderTopLevelBlock(blockId, anchorBlockId, position);
    this.clearDragState();
  }

  endDraggingBlock(): void {
    this.clearDragState();
  }

  startDraggingStepContent(
    stepBlockId: string,
    childBlockId: string,
    event?: DragEvent<HTMLElement>,
  ): void {
    event?.stopPropagation();
    this.startDraggingStepContentBlock(
      stepBlockId,
      childBlockId,
      event ? reactDataTransfer(event) : null,
    );
  }

  handleStepContentDragOver(
    event: DragEvent<HTMLElement>,
    stepBlockId: string,
    targetChildBlockId: string,
  ): void {
    if (
      !this.draggingBlockId ||
      !this.draggingStepBlockId ||
      this.draggingStepBlockId !== stepBlockId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.autoScrollDuringDrag(event);
    const transfer = reactDataTransfer(event);
    if (transfer) transfer.dropEffect = 'move';
    this.updateDragTarget(
      targetChildBlockId,
      dropPosition(
        event,
        this.stepContentDropPositionFallback(stepBlockId, targetChildBlockId),
        '.step-child[data-block-id]',
      ),
    );
  }

  handleStepContentDrop(
    event: DragEvent<HTMLElement>,
    stepBlockId: string,
    targetChildBlockId: string,
  ): void {
    if (!this.draggingBlockId || this.draggingStepBlockId !== stepBlockId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.reorderStepContentBlock(
      stepBlockId,
      this.draggingBlockId,
      targetChildBlockId,
      dropPosition(
        event,
        this.stepContentDropPositionFallback(stepBlockId, targetChildBlockId),
        '.step-child[data-block-id]',
      ),
    );
    this.clearDragState();
  }

  endDraggingStepContent(): void {
    this.clearDragState();
  }

  protected dropPositionFallback(targetBlockId: string): BlockInsertPosition {
    if (!this.draggingBlockId) return 'before';
    const draggingIndex = this.documentState.blocks.findIndex(
      (block) => block.id === this.draggingBlockId,
    );
    const targetIndex = this.documentState.blocks.findIndex((block) => block.id === targetBlockId);
    if (draggingIndex < 0 || targetIndex < 0) return 'before';
    return draggingIndex < targetIndex ? 'after' : 'before';
  }

  protected autoScrollDuringDrag(event: Event | DragEvent<HTMLElement>): void {
    const clientY = 'clientY' in event ? event.clientY : null;
    if (typeof clientY !== 'number' || !Number.isFinite(clientY) || clientY <= 0) return;

    const view = this.options.root.ownerDocument.defaultView;
    if (!view) return;
    const viewportHeight = view.innerHeight;
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;

    const topDistance = clientY;
    const bottomDistance = viewportHeight - clientY;
    const edge = DRAG_AUTO_SCROLL_EDGE_PX;
    let delta = 0;
    if (topDistance < edge) {
      delta = -dragAutoScrollDelta(edge - topDistance);
    } else if (bottomDistance < edge) {
      delta = dragAutoScrollDelta(edge - bottomDistance);
    }
    if (delta === 0) return;
    view.scrollBy(0, delta);
  }

  protected stepContentDropPositionFallback(
    stepBlockId: string,
    targetChildBlockId: string,
  ): BlockInsertPosition {
    if (!this.draggingBlockId) return 'before';
    const blocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const draggingIndex = blocks.findIndex((block) => block.id === this.draggingBlockId);
    const targetIndex = blocks.findIndex((block) => block.id === targetChildBlockId);
    if (draggingIndex < 0 || targetIndex < 0) return 'before';
    return draggingIndex < targetIndex ? 'after' : 'before';
  }

  protected startDraggingStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    dataTransfer: DataTransfer | null,
  ): void {
    this.selectBlock(childBlockId);
    this.draggingBlockId = childBlockId;
    this.draggingStepBlockId = stepBlockId;
    primeDragTransfer(dataTransfer, childBlockId);
    this.updateDragTarget(null, null);
    this.setStatus(authoringText('Move content inside this step'));
  }

  handleBlockKeyDown(event: KeyboardEvent<HTMLElement>, blockId: string): void {
    if (isEditableControl(event.target)) return;
    this.selectBlock(blockId);
    const key = event.key.toLowerCase();
    const commandModifier = event.metaKey || event.ctrlKey;

    if (commandModifier && key === 'd') {
      event.preventDefault();
      this.duplicateTopLevelBlock(blockId);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteTopLevelBlock(blockId);
      return;
    }

    const moveShortcut =
      event.key === 'ArrowUp' || event.key === 'ArrowDown'
        ? event.altKey || (commandModifier && event.shiftKey)
        : false;
    if (!moveShortcut) return;
    event.preventDefault();
    this.moveTopLevelBlock(blockId, event.key === 'ArrowUp' ? 'up' : 'down');
  }

  handleStepContentKeyDown(
    event: KeyboardEvent<HTMLElement>,
    stepBlockId: string,
    childBlockId: string,
  ): void {
    if (isEditableControl(event.target)) return;
    this.selectBlock(childBlockId);
    const key = event.key.toLowerCase();
    const commandModifier = event.metaKey || event.ctrlKey;

    if (commandModifier && key === 'd') {
      event.preventDefault();
      event.stopPropagation();
      this.duplicateStepContentBlock(stepBlockId, childBlockId);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      this.deleteStepContentBlock(stepBlockId, childBlockId);
      return;
    }

    const moveShortcut =
      event.key === 'ArrowUp' || event.key === 'ArrowDown'
        ? event.altKey || (commandModifier && event.shiftKey)
        : false;
    if (!moveShortcut) return;
    event.preventDefault();
    event.stopPropagation();
    this.moveStepContentBlock(stepBlockId, childBlockId, event.key === 'ArrowUp' ? 'up' : 'down');
  }
}
