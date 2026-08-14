import type {
  InlineTextRun,
  LodariqBlock,
  LodariqDocument,
  PreviewPatchOperation,
  PreviewTransactionMetadata,
  TourStepStyleSnapshot,
} from '@lodariq/schema';
import { authoringText } from '../../i18n';
import type {
  AuthoringDocumentTransaction,
  AuthoringTransactionScope,
} from '../document-transaction-coordinator';
import {
  applyTourStepBatchPlacement,
  applyTourStepBatchTimeoutPolicy,
  deleteSelectedTourSteps,
  duplicateSelectedTourSteps,
  moveSelectedTourSteps,
  type TourStepBatchDirection,
  type TourStepBatchPlacement,
  type TourStepBatchTimeoutPolicy,
} from '../step-batch-operations';
import { applyTourStepStyle, extractTourStepStyle } from '../step-style-recipes';
import { ControllerDragDropFeature } from './controller-drag-drop';
import { blockDisplayTitle } from './utils';

export abstract class ControllerReliabilityFeature extends ControllerDragDropFeature {
  protected abstract afterDocumentMutation(): void;
  protected abstract commitContentRuns(
    blockId: string,
    value: string,
    contentRuns?: InlineTextRun[],
  ): void;
  protected abstract focusInsertedBlock(blockId: string): void;
  protected abstract recordChange(): void;
  protected abstract selectedTourStep(): LodariqBlock | null;
  protected abstract sendPreviewPatch(
    blockId: string,
    ops: PreviewPatchOperation[],
    locale?: string,
    transaction?: PreviewTransactionMetadata,
  ): void;

  toggleStepStyleSelection(stepId: string): void {
    const step = this.documentState.blocks.find(
      (candidate) => candidate.id === stepId && candidate.type === 'tourStep',
    );
    if (!step) return;
    if (this.selectedStepIds.has(stepId)) this.selectedStepIds.delete(stepId);
    else this.selectedStepIds.add(stepId);
    this.stepSelectionAnchorId = stepId;
    this.emit();
  }

  selectTourStepForBatch(
    stepId: string,
    options: { additive?: boolean; range?: boolean } = {},
  ): void {
    const steps = this.documentState.blocks.filter((block) => block.type === 'tourStep');
    if (!steps.some((step) => step.id === stepId)) return;
    if (options.range && this.stepSelectionAnchorId) {
      const anchorIndex = steps.findIndex((step) => step.id === this.stepSelectionAnchorId);
      const currentIndex = steps.findIndex((step) => step.id === stepId);
      if (!options.additive) this.selectedStepIds.clear();
      const start = Math.min(anchorIndex, currentIndex);
      const end = Math.max(anchorIndex, currentIndex);
      for (const step of steps.slice(start, end + 1)) this.selectedStepIds.add(step.id);
    } else {
      if (!options.additive) this.selectedStepIds.clear();
      if (options.additive && this.selectedStepIds.has(stepId)) this.selectedStepIds.delete(stepId);
      else this.selectedStepIds.add(stepId);
    }
    this.stepSelectionAnchorId = stepId;
    this.emit();
  }

  clearTourStepBatchSelection(): void {
    this.selectedStepIds.clear();
    this.stepSelectionAnchorId = null;
    this.emit();
  }

  setSelectedStepPlacement(placement: TourStepBatchPlacement): void {
    this.commitSelectedStepBatch(
      (document, stepIds) => applyTourStepBatchPlacement(document, stepIds, placement),
      authoringText('Placement applied to {count} steps', { count: this.selectedStepIds.size }),
      'appearance',
    );
  }

  setSelectedStepTimeoutPolicy(onTimeout: TourStepBatchTimeoutPolicy): void {
    this.commitSelectedStepBatch(
      (document, stepIds) => applyTourStepBatchTimeoutPolicy(document, stepIds, onTimeout),
      authoringText('Timeout policy applied to {count} steps', {
        count: this.selectedStepIds.size,
      }),
      'behavior',
    );
  }

  duplicateSelectedSteps(): void {
    if (!this.allowDocumentStructureMutation()) return;
    this.commitSelectedStepBatch(
      duplicateSelectedTourSteps,
      authoringText('Duplicated {count} selected steps', { count: this.selectedStepIds.size }),
      'structure',
    );
  }

  moveSelectedSteps(direction: TourStepBatchDirection): void {
    if (!this.allowDocumentStructureMutation()) return;
    this.commitSelectedStepBatch(
      (document, stepIds) => moveSelectedTourSteps(document, stepIds, direction),
      authoringText('Moved {count} selected steps', { count: this.selectedStepIds.size }),
      'structure',
    );
  }

  deleteSelectedSteps(): void {
    if (!this.allowDocumentStructureMutation()) return;
    const count = this.selectedStepIds.size;
    this.commitSelectedStepBatch(
      deleteSelectedTourSteps,
      authoringText('Deleted {count} selected steps', { count }),
      'structure',
    );
    this.clearTourStepBatchSelection();
  }

  copyStepStyle(stepId: string): void {
    const step = this.documentState.blocks.find((candidate) => candidate.id === stepId);
    if (!step || step.type !== 'tourStep') return;
    this.stepStyleClipboard = extractTourStepStyle(step);
    this.recordMetric('style.copied');
    this.setStatus(authoringText('Step style copied'));
  }

  pasteStepStyle(stepId: string): void {
    if (!this.stepStyleClipboard) {
      this.setStatus(authoringText('Copy a step style first'));
      return;
    }
    this.applyStepStyleSnapshot(
      [stepId],
      this.stepStyleClipboard,
      authoringText('Step style pasted'),
    );
    this.recordMetric('style.applied');
  }

  applyCopiedStyleToSelected(fallbackStepId: string): void {
    if (!this.stepStyleClipboard) {
      this.setStatus(authoringText('Copy a step style first'));
      return;
    }
    const stepIds = this.selectedStepIds.size ? [...this.selectedStepIds] : [fallbackStepId];
    this.applyStepStyleSnapshot(
      stepIds,
      this.stepStyleClipboard,
      authoringText('Style applied to {count} steps', { count: stepIds.length }),
    );
    this.recordMetric('style.applied');
  }

  saveStepStyleRecipe(stepId: string): void {
    const step = this.documentState.blocks.find((candidate) => candidate.id === stepId);
    if (!step || step.type !== 'tourStep') return;
    const recipe = this.stepStyleRecipes.save(
      authoringText('{title} style', { title: blockDisplayTitle(step) }),
      extractTourStepStyle(step),
    );
    this.services.saveStepStyleRecipes?.(this.stepStyleRecipes.list());
    this.setStatus(authoringText('Saved style recipe {name}', { name: recipe.name }));
  }

  applyStepStyleRecipe(recipeId: string, fallbackStepId: string): void {
    const recipe = this.stepStyleRecipes.get(recipeId);
    if (!recipe) return;
    const stepIds = this.selectedStepIds.size ? [...this.selectedStepIds] : [fallbackStepId];
    this.applyStepStyleSnapshot(
      stepIds,
      recipe.snapshot,
      authoringText('Applied {name} to {count} steps', {
        name: recipe.name,
        count: stepIds.length,
      }),
    );
    this.recordMetric('style.recipe-used');
  }

  deleteStepStyleRecipe(recipeId: string): void {
    const recipe = this.stepStyleRecipes.get(recipeId);
    if (!recipe || !this.stepStyleRecipes.delete(recipeId)) return;
    this.services.saveStepStyleRecipes?.(this.stepStyleRecipes.list());
    this.setStatus(authoringText('Deleted style recipe {name}', { name: recipe.name }));
  }

  saveDraftCheckpoint(name: string): void {
    const checkpoint = this.draftCheckpoints.save(name, this.documentState);
    this.recordMetric('checkpoint.saved');
    this.setStatus(authoringText('Saved checkpoint {name}', { name: checkpoint.name }));
  }

  restoreDraftCheckpoint(checkpointId: string): void {
    const document = this.draftCheckpoints.restore(checkpointId);
    if (!document || document.id !== this.documentState.id) return;
    this.documentTransactions.flush();
    this.undoStack.push(structuredClone(this.documentState));
    this.redoStack.length = 0;
    this.documentState = this.normalizeDocument(document);
    this.documentTransactions.adoptOptimisticDocument(this.documentState);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(this.documentState.id, [
      { op: 'replaceDocument', document: structuredClone(this.documentState) },
    ]);
    this.recordMetric('checkpoint.restored');
    this.setStatus(authoringText('Checkpoint restored'));
  }

  compareDraftCheckpoint(checkpointId: string): void {
    const comparison = this.draftCheckpoints.compare(checkpointId, this.documentState);
    if (!comparison) return;
    this.setStatus(
      authoringText(
        '{blocks} changed blocks · {targets} changed targets · Document settings {settings}',
        {
          blocks: comparison.changedBlocks,
          targets: comparison.changedTargets,
          settings: comparison.documentSettingsChanged
            ? authoringText('changed')
            : authoringText('unchanged'),
        },
      ),
    );
  }

  deleteDraftCheckpoint(checkpointId: string): void {
    if (!this.draftCheckpoints.delete(checkpointId)) return;
    this.setStatus(authoringText('Checkpoint deleted'));
  }

  protected commitCoordinatedMutation({
    blockId,
    coalescingKey,
    operations,
    reduce,
    scope = 'appearance',
    status,
  }: {
    blockId: string;
    coalescingKey: string;
    operations: PreviewPatchOperation[];
    reduce: (document: LodariqDocument) => LodariqDocument;
    scope?: AuthoringTransactionScope;
    status: string;
  }): void {
    const staged = this.documentTransactions.stage({
      document: this.documentState,
      scope,
      coalescingKey,
      operations,
      reduce,
    });
    if (staged.undoDocument) {
      this.undoStack.push(staged.undoDocument);
      this.redoStack.length = 0;
    }
    this.documentState = staged.document;
    this.selectedBlockId = blockId;
    this.afterDocumentMutation();
    this.documentTransactions.adoptOptimisticDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    const transaction = previewTransactionMetadata(staged.transaction);
    this.sendPreviewPatch(blockId, staged.transaction.operations, undefined, transaction);
    this.recordMetric(staged.coalesced ? 'transaction.coalesced' : 'transaction.committed');
    this.recordMetric('transaction.persisted');
    this.setStatus(status);
  }

  private commitSelectedStepBatch(
    reduce: (document: LodariqDocument, stepIds: ReadonlySet<string>) => LodariqDocument,
    status: string,
    scope: AuthoringTransactionScope,
  ): void {
    if (!this.selectedStepIds.size) {
      this.setStatus(authoringText('Select at least one step'));
      return;
    }
    const selected = new Set(this.selectedStepIds);
    const nextDocument = reduce(this.documentState, selected);
    this.commitCoordinatedMutation({
      blockId: [...selected][0] ?? this.documentState.id,
      coalescingKey: `step-batch:${scope}:${[...selected].sort().join(':')}`,
      operations: [{ op: 'replaceDocument', document: structuredClone(nextDocument) }],
      reduce: (document) => reduce(document, selected),
      scope,
      status,
    });
  }

  private applyStepStyleSnapshot(
    stepIds: readonly string[],
    snapshot: TourStepStyleSnapshot,
    status: string,
  ): void {
    const nextDocument = applyTourStepStyle(this.documentState, stepIds, snapshot);
    this.commitCoordinatedMutation({
      blockId: stepIds[0] ?? this.documentState.id,
      coalescingKey: `step-style:${[...stepIds].sort().join(':')}`,
      operations: [{ op: 'replaceDocument', document: structuredClone(nextDocument) }],
      reduce: (document) => applyTourStepStyle(document, stepIds, snapshot),
      scope: 'appearance',
      status,
    });
  }
}

function previewTransactionMetadata(
  transaction: AuthoringDocumentTransaction,
): PreviewTransactionMetadata {
  return {
    transactionId: transaction.transactionId,
    baseRevision: transaction.baseRevision,
    revision: transaction.revision,
    scope: transaction.scope,
    ...(transaction.coalescingKey ? { coalescingKey: transaction.coalescingKey } : {}),
  };
}
