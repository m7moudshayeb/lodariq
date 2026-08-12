import { ControllerLifecycleFeature } from './controller-lifecycle';
import { authoringText } from '../../i18n';
import { type LodariqBlock } from '@lodariq/schema';
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import { type BlockInsertPosition, type EditableBlockType } from '../document-ops';
import { blocksFromSafePasteData } from '../../editor';
import type { EditableButtonVariant, EditableActionType, SlashCommand } from './types';
import { EDITABLE_BUTTON_VARIANT_OPTIONS } from './types';
import {
  closestBlockId,
  closestButton,
  editableActionValue,
  editableBlockTypeValue,
  isEditableControl,
  slashCommandValue,
} from './utils';
import {
  closestStepContentDragTarget,
  closestTopLevelInsertTarget,
  dropPosition,
  nativeDataTransfer,
  primeDragTransfer,
} from './controller-drag';

export abstract class ControllerNativeEventsFeature extends ControllerLifecycleFeature {
  protected abstract activateActionButton(button: HTMLButtonElement, action: string): void;
  protected abstract appendPastedBlocks(blocksToAdd: LodariqBlock[]): void;
  abstract appendStep(title?: string): string;
  protected abstract autoScrollDuringDrag(event: Event | DragEvent<HTMLElement>): void;
  protected abstract clearDragState(): void;
  protected abstract commitActionUrl(blockId: string, value: string): void;
  protected abstract commitContent(blockId: string, value: string): void;
  abstract commitDocumentTitle(value: string): void;
  protected abstract dropPositionFallback(targetBlockId: string): BlockInsertPosition;
  protected abstract handleSlashEnter(
    key: string,
    rawText: string,
    preventDefault: () => void,
  ): void;
  abstract reorderStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    targetChildBlockId: string,
    position: BlockInsertPosition,
  ): void;
  abstract reorderTopLevelBlock(
    blockId: string,
    targetBlockId: string,
    position?: BlockInsertPosition,
  ): void;
  protected abstract setAction(blockId: string, actionType: EditableActionType): void;
  abstract setButtonVariant(blockId: string, variant: EditableButtonVariant): void;
  protected abstract startDraggingStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    dataTransfer: DataTransfer | null,
  ): void;
  protected abstract stepContentDropPositionFallback(
    stepBlockId: string,
    targetChildBlockId: string,
  ): BlockInsertPosition;
  protected abstract transformBlock(blockId: string, type: EditableBlockType): void;
  protected abstract updateDragTarget(
    blockId: string | null,
    position: BlockInsertPosition | null,
  ): void;

  handleSlashKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSlashComposer();
      return;
    }
    this.handleSlashEnter(event.key, this.slashText, () => event.preventDefault());
  }

  activateCommand(command: SlashCommand): void {
    if (command === 'step') {
      this.appendStep();
      return;
    }
    this.setStatus(authoringText('Open a step to add content.'));
  }

  handlePaste(event: ClipboardEvent<HTMLElement>): void {
    if (isEditableControl(event.target)) return;
    const blocksToAdd = blocksFromSafePasteData(event.clipboardData);
    if (!blocksToAdd.length) return;
    event.preventDefault();
    this.appendPastedBlocks(blocksToAdd);
  }

  handleNativeInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset['action'] === 'experience-composer') {
      this.setSlashText(target.value);
      return;
    }
    if (event.isTrusted) return;
    if (target instanceof HTMLInputElement && target.dataset['action'] === 'edit-title') {
      event.stopPropagation();
      return;
    }
    if (target instanceof HTMLTextAreaElement && target.dataset['action'] === 'edit-draft-backup') {
      event.stopPropagation();
      this.setJsonText(target.value);
    }
  }

  handleNativeKeyDown(event: Event): void {
    if (!(event instanceof globalThis.KeyboardEvent)) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset['action'] !== 'experience-composer') return;
    if (event.key === 'Escape') {
      this.closeSlashComposer();
      return;
    }
    this.handleSlashEnter(event.key, target.value, () => event.preventDefault());
  }

  handleNativePointerDown(event: Event): void {
    if (event.isTrusted) return;
    const button = closestButton(event.target);
    const command = slashCommandValue(button?.dataset['command']);
    if (!button || !command || !button.closest('.menu')) return;
    event.preventDefault();
    event.stopPropagation();
    this.activateCommand(command);
  }

  handleNativeClick(event: Event): void {
    if (event.isTrusted) return;
    const button = closestButton(event.target);
    if (!button) return;

    const command = slashCommandValue(button.dataset['command']);
    if (command) {
      event.preventDefault();
      event.stopPropagation();
      this.activateCommand(command);
      return;
    }

    const action = button.dataset['action'];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    this.activateActionButton(button, action);
  }

  handleNativePaste(event: Event): void {
    if (event.isTrusted || isEditableControl(event.target)) return;
    const clipboardData = (event as { clipboardData?: DataTransfer }).clipboardData;
    if (!clipboardData) return;
    const blocksToAdd = blocksFromSafePasteData(clipboardData);
    if (!blocksToAdd.length) return;
    event.preventDefault();
    event.stopPropagation();
    this.appendPastedBlocks(blocksToAdd);
  }

  handleNativeDragStart(event: Event): void {
    if (event.isTrusted) return;
    const stepContentTarget = closestStepContentDragTarget(event.target);
    if (stepContentTarget) {
      this.startDraggingStepContentBlock(
        stepContentTarget.stepBlockId,
        stepContentTarget.blockId,
        nativeDataTransfer(event),
      );
      return;
    }
    const blockId = closestBlockId(event.target);
    if (!blockId) return;
    this.draggingBlockId = blockId;
    primeDragTransfer(nativeDataTransfer(event), blockId);
  }

  handleNativeDragOver(event: Event): void {
    if (event.isTrusted || !this.draggingBlockId) return;
    this.autoScrollDuringDrag(event);
    if (this.draggingStepBlockId) {
      const target = closestStepContentDragTarget(event.target);
      if (!target || target.stepBlockId !== this.draggingStepBlockId) return;
      event.preventDefault();
      const transfer = nativeDataTransfer(event);
      if (transfer) transfer.dropEffect = 'move';
      this.updateDragTarget(
        target.blockId,
        dropPosition(
          event,
          this.stepContentDropPositionFallback(target.stepBlockId, target.blockId),
          '.step-child[data-block-id]',
        ),
      );
      return;
    }
    event.preventDefault();
    const transfer = nativeDataTransfer(event);
    if (transfer) transfer.dropEffect = 'move';
    const insertTarget = closestTopLevelInsertTarget(event.target);
    if (insertTarget) {
      this.updateDragTarget(insertTarget.anchorBlockId, insertTarget.position);
      return;
    }
    const targetBlockId = closestBlockId(event.target);
    if (!targetBlockId) return;
    this.updateDragTarget(
      targetBlockId,
      dropPosition(event, this.dropPositionFallback(targetBlockId)),
    );
  }

  handleNativeDrop(event: Event): void {
    if (event.isTrusted) return;
    event.preventDefault();
    if (this.draggingStepBlockId && this.draggingBlockId) {
      const target = closestStepContentDragTarget(event.target);
      if (target && target.stepBlockId === this.draggingStepBlockId) {
        this.reorderStepContentBlock(
          this.draggingStepBlockId,
          this.draggingBlockId,
          target.blockId,
          dropPosition(
            event,
            this.stepContentDropPositionFallback(target.stepBlockId, target.blockId),
            '.step-child[data-block-id]',
          ),
        );
      }
      this.clearDragState();
      return;
    }
    const insertTarget = closestTopLevelInsertTarget(event.target);
    if (this.draggingBlockId && insertTarget) {
      this.reorderTopLevelBlock(
        this.draggingBlockId,
        insertTarget.anchorBlockId,
        insertTarget.position,
      );
      this.clearDragState();
      return;
    }
    const targetBlockId = closestBlockId(event.target);
    if (this.draggingBlockId && targetBlockId) {
      const position = dropPosition(event, this.dropPositionFallback(targetBlockId));
      this.reorderTopLevelBlock(this.draggingBlockId, targetBlockId, position);
    }
    this.clearDragState();
  }

  handleNativeChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset['action'] === 'edit-title') {
      this.commitDocumentTitle(target.value);
      return;
    }

    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
      target.dataset['action'] === 'edit-content'
    ) {
      const blockId = target.dataset['blockId'];
      if (!blockId) return;
      this.commitContent(blockId, target.value);
      return;
    }

    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
      target.dataset['action'] === 'edit-action-url'
    ) {
      const blockId = target.dataset['blockId'];
      if (!blockId) return;
      this.commitActionUrl(blockId, target.value);
      return;
    }

    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset['action'] === 'set-button-style') {
      const blockId = target.dataset['blockId'];
      const variant = EDITABLE_BUTTON_VARIANT_OPTIONS.find(
        (option) => option.value === target.value,
      )?.value;
      if (!blockId || !variant) return;
      this.setButtonVariant(blockId, variant);
      return;
    }
    if (target.dataset['action'] === 'set-action') {
      const blockId = target.dataset['blockId'];
      const actionType = editableActionValue(target.value);
      if (!blockId) return;
      if (actionType === null) return;
      this.setAction(blockId, actionType);
      return;
    }

    if (target.dataset['action'] !== 'transform-block') return;
    const blockId = target.dataset['blockId'];
    const type = editableBlockTypeValue(target.value);
    if (!blockId || !type) return;
    this.transformBlock(blockId, type);
  }
}
