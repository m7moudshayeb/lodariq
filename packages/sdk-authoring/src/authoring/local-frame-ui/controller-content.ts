import { ControllerPropertyFeature } from './controller-properties';
import { authoringText } from '../../i18n';
import type { LodariqBlock } from '@lodariq/schema';
import {
  documentWithBlocks,
  createContentBlock,
  createTourStep,
  duplicateStepChildBlock,
  hasBlock,
  insertBlockInsideTourStep,
  insertTopLevelBlock,
  moveStepChildBlock,
  mergeInlineTextRuns,
  reconcileInlineTextRuns,
  renumberTourSteps,
  removeStepChildBlock,
  replaceRichContentInsideTourStep,
  reorderStepChildBlock,
  splitInlineTextRuns,
  updateBlockContent,
  updateBlockContentRuns,
  type BlockDirection,
  type BlockInsertPosition,
  type EditableBlockType,
} from '../document-ops';
import type { SlashCommand } from './types';
import { blockTypeLabel } from './utils';
import { insertedStepContentDefault } from './controller-model';

export abstract class ControllerContentFeature extends ControllerPropertyFeature {
  protected abstract clearSlash(): void;
  protected abstract focusBlock(blockId: string): void;
  protected abstract focusEditableField(blockId: string, caret?: 'start' | 'end' | number): void;
  protected abstract nextStepIndex(): number;

  appendBlock(type: EditableBlockType, contentOverride?: string): void {
    void type;
    void contentOverride;
    this.setStatus(authoringText('Open a step to add content.'));
    this.clearSlash();
    this.emit();
  }

  insertTopLevelCommand(
    command: SlashCommand,
    anchorBlockId: string,
    position: BlockInsertPosition,
  ): void {
    if (!this.allowDocumentStructureMutation()) return;
    if (!hasBlock(this.documentState.blocks, anchorBlockId)) return;
    if (command !== 'step') {
      this.setStatus(authoringText('Open a step to add content.'));
      return;
    }
    const block = createTourStep(this.nextStepIndex());
    const blocks = insertTopLevelBlock(this.documentState.blocks, anchorBlockId, block, position);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.selectedBlockId = block.id;
    this.afterDocumentMutation();
    this.focusInsertedBlock(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Inserted ${blockTypeLabel(block.type).toLowerCase()}`);
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertBlock', block, anchorBlockId, position }]);
  }

  insertStepContent(
    stepBlockId: string,
    type: EditableBlockType,
    index: number,
    contentOverride?: string,
  ): void {
    if (!this.allowDocumentStructureMutation()) return;
    if (!hasBlock(this.documentState.blocks, stepBlockId)) return;
    const block = createContentBlock(type, contentOverride ?? insertedStepContentDefault(type));
    const blocks = insertBlockInsideTourStep(this.documentState.blocks, stepBlockId, block, index);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.selectedBlockId = block.id;
    this.afterDocumentMutation();
    this.focusInsertedBlock(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Inserted ${blockTypeLabel(type).toLowerCase()} in step`);
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertStepContent', stepBlockId, block, index }]);
  }

  replaceStepRichContent(stepBlockId: string, richContent: readonly LodariqBlock[]): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blocks = replaceRichContentInsideTourStep(
      this.documentState.blocks,
      stepBlockId,
      richContent,
    );
    if (!blocks || JSON.stringify(blocks) === JSON.stringify(this.documentState.blocks)) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation({ skipNormalize: true });
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(stepBlockId, [
      { op: 'replaceStepRichContent', stepBlockId, blocks: [...richContent] },
    ]);
  }

  continueStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    value: string,
    nextContent = '',
  ): void {
    if (!this.allowDocumentStructureMutation()) return;
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    const currentBlock = currentBlocks[currentIndex];
    if (!currentBlock) return;
    const combinedContent = `${value}${nextContent}`;
    const reconciledRuns = reconcileInlineTextRuns(
      currentBlock.content ?? '',
      currentBlock.contentRuns,
      combinedContent,
    );
    const splitRuns = splitInlineTextRuns(combinedContent, reconciledRuns, value.length);
    const nextBlock = createContentBlock('paragraph', nextContent);
    if (splitRuns.after) nextBlock.contentRuns = splitRuns.after;
    const nextBlocks = currentBlock.contentRuns
      ? updateBlockContentRuns(this.documentState.blocks, childBlockId, value, splitRuns.before)
      : updateBlockContent(this.documentState.blocks, childBlockId, value);
    const blocks = insertBlockInsideTourStep(nextBlocks, stepBlockId, nextBlock, currentIndex + 1);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.selectedBlockId = nextBlock.id;
    this.afterDocumentMutation();
    this.focusEditableField(nextBlock.id, 'start');
    this.services.saveDocument(this.documentState);
    this.setStatus(authoringText('Added text line'));
    this.sendPreviewPatch(childBlockId, [
      currentBlock.contentRuns
        ? { op: 'updateContentRuns', content: value, contentRuns: splitRuns.before }
        : { op: 'updateContent', content: value },
      { op: 'insertStepContent', stepBlockId, block: nextBlock, index: currentIndex + 1 },
    ]);
  }

  deleteEmptyStepContentBlock(stepBlockId: string, childBlockId: string): void {
    if (!this.allowDocumentStructureMutation()) return;
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    if (currentBlocks.length <= 1) return;
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    const blocks = removeStepChildBlock(this.documentState.blocks, stepBlockId, childBlockId);
    if (!blocks) return;
    const nextContentBlocks = this.stepContentBlocks(blocks, stepBlockId);
    const nextSelection =
      nextContentBlocks[Math.max(0, currentIndex - 1)]?.id ??
      nextContentBlocks[0]?.id ??
      stepBlockId;
    this.recordChange();
    this.documentState = documentWithBlocks(this.documentState, blocks);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = nextSelection;
    this.focusEditableField(nextSelection, 'end');
    this.setStatus(authoringText('Deleted empty line'));
    this.sendPreviewPatch(childBlockId, [{ op: 'removeBlock', stepBlockId }]);
  }

  mergeStepContentBlockIntoPrevious(
    stepBlockId: string,
    childBlockId: string,
    pendingContent?: string,
  ): boolean {
    if (!this.allowDocumentStructureMutation()) return false;
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    const currentBlock = currentBlocks[currentIndex];
    const previousBlock = currentBlocks[currentIndex - 1];
    if (!currentBlock || !previousBlock) return false;
    if (currentBlock.type !== 'paragraph' || previousBlock.type !== 'paragraph') return false;
    const previousContent = previousBlock.content ?? '';
    const storedCurrentContent = currentBlock.content ?? '';
    const currentContent = pendingContent ?? storedCurrentContent;
    const currentRuns = reconcileInlineTextRuns(
      storedCurrentContent,
      currentBlock.contentRuns,
      currentContent,
    );
    const mergedContent = `${previousContent}${currentContent}`;
    const mergedRuns = mergeInlineTextRuns(
      previousContent,
      previousBlock.contentRuns,
      currentContent,
      currentRuns,
    );
    const nextBlocks = mergedRuns
      ? updateBlockContentRuns(
          this.documentState.blocks,
          previousBlock.id,
          mergedContent,
          mergedRuns,
        )
      : updateBlockContent(this.documentState.blocks, previousBlock.id, mergedContent);
    const blocks = removeStepChildBlock(nextBlocks, stepBlockId, childBlockId);
    if (!blocks) return false;
    this.recordChange();
    this.documentState = documentWithBlocks(this.documentState, blocks);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = previousBlock.id;
    this.focusEditableField(previousBlock.id, previousContent.length);
    this.setStatus(authoringText('Merged text line'));
    this.sendPreviewPatch(previousBlock.id, [
      mergedRuns
        ? { op: 'updateContentRuns', content: mergedContent, contentRuns: mergedRuns }
        : { op: 'updateContent', content: mergedContent },
    ]);
    this.sendPreviewPatch(childBlockId, [{ op: 'removeBlock', stepBlockId }]);
    return true;
  }

  focusPreviousStepContentBlock(stepBlockId: string, childBlockId: string): boolean {
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    const previousBlockId = currentBlocks[currentIndex - 1]?.id;
    if (!previousBlockId) return false;
    this.focusEditableField(previousBlockId, 'end');
    return true;
  }

  focusNextStepContentBlock(stepBlockId: string, childBlockId: string): boolean {
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    const nextBlockId = currentBlocks[currentIndex + 1]?.id;
    if (!nextBlockId) return false;
    this.focusEditableField(nextBlockId, 'start');
    return true;
  }

  moveStepContentBlock(stepBlockId: string, childBlockId: string, direction: BlockDirection): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blocks = moveStepChildBlock(
      this.documentState.blocks,
      stepBlockId,
      childBlockId,
      direction,
    );
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = childBlockId;
    this.focusBlock(childBlockId);
    this.setStatus(authoringText('Moved step content'));
    this.sendPreviewPatch(childBlockId, [{ op: 'moveStepContent', stepBlockId, direction }]);
  }

  moveStepActionRelativeToRichContent(
    stepBlockId: string,
    childBlockId: string,
    position: BlockInsertPosition,
  ): void {
    const richContent = this.stepContentBlocks(this.documentState.blocks, stepBlockId).filter(
      (block) => block.type !== 'button' && block.type !== 'link',
    );
    const target = position === 'before' ? richContent[0] : richContent[richContent.length - 1];
    if (!target) return;
    this.reorderStepContentBlock(stepBlockId, childBlockId, target.id, position);
  }

  reorderStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    targetChildBlockId: string,
    position: BlockInsertPosition,
  ): void {
    if (!this.allowDocumentStructureMutation()) return;
    const blocks = reorderStepChildBlock(
      this.documentState.blocks,
      stepBlockId,
      childBlockId,
      targetChildBlockId,
      position,
    );
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = childBlockId;
    this.focusBlock(childBlockId);
    this.setStatus(authoringText('Moved step content'));
    this.sendPreviewPatch(childBlockId, [
      { op: 'reorderStepContent', stepBlockId, targetChildBlockId, position },
    ]);
  }

  duplicateStepContentBlock(stepBlockId: string, childBlockId: string): void {
    if (!this.allowDocumentStructureMutation()) return;
    const currentIndex = this.stepContentBlocks(this.documentState.blocks, stepBlockId).findIndex(
      (block) => block.id === childBlockId,
    );
    const blocks = duplicateStepChildBlock(this.documentState.blocks, stepBlockId, childBlockId);
    if (!blocks) return;
    const duplicatedBlockId =
      this.stepContentBlocks(blocks, stepBlockId)[currentIndex + 1]?.id ?? childBlockId;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = duplicatedBlockId;
    this.focusInsertedBlock(duplicatedBlockId);
    this.setStatus(authoringText('Duplicated content'));
    const duplicatedBlock = this.stepContentBlocks(blocks, stepBlockId)[currentIndex + 1];
    if (duplicatedBlock) {
      this.sendPreviewPatch(duplicatedBlock.id, [
        {
          op: 'insertStepContent',
          stepBlockId,
          block: duplicatedBlock,
          index: currentIndex + 1,
        },
      ]);
    }
  }

  deleteStepContentBlock(stepBlockId: string, childBlockId: string): void {
    if (!this.allowDocumentStructureMutation()) return;
    const currentIndex = this.stepContentBlocks(this.documentState.blocks, stepBlockId).findIndex(
      (block) => block.id === childBlockId,
    );
    const blocks = removeStepChildBlock(this.documentState.blocks, stepBlockId, childBlockId);
    if (!blocks) return;
    const nextContentBlocks = this.stepContentBlocks(blocks, stepBlockId);
    const nextSelection =
      nextContentBlocks[Math.min(currentIndex, nextContentBlocks.length - 1)]?.id ?? stepBlockId;
    this.recordChange();
    this.documentState = documentWithBlocks(this.documentState, blocks);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = nextSelection;
    this.focusBlock(nextSelection);
    this.setStatus(authoringText('Deleted content'));
    this.sendPreviewPatch(childBlockId, [{ op: 'removeBlock', stepBlockId }]);
  }
}
