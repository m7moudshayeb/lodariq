import {
  AUTHORING_SHELL_CAPABILITIES_TYPE,
  AUTHORING_SHELL_MENU_STATE_TYPE,
  AUTHORING_SHELL_PALETTE_OPEN_TYPE,
  AUTHORING_SHELL_NOTICE_TYPE,
  AUTHORING_SHELL_SELECTION_TYPE,
  BRIDGE_PROTOCOL_VERSION,
  type AuthoringMediaAssetResource,
  type InlineTextRun,
  type LodariqBlock,
  type LodariqDocument,
  type PreviewPatchOperation,
  type PreviewTransactionMetadata,
  type TourStepStyleSnapshot,
} from '@lodariq/schema';
import { createBridgeCorrelationId } from '../../bridge/transport';
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
  protected abstract afterDocumentMutation(options?: { skipNormalize?: boolean }): void;
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

  /** Tells the host which steps are selected so the filmstrip can mark them (§4.5). */
  protected sendShellSelection(): void {
    if (!this.isHostedInParent) return;
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_shell_selection'),
      type: AUTHORING_SHELL_SELECTION_TYPE,
      stepIds: [...this.selectedStepIds],
    });
  }

  /**
   * The host paints its own chrome above the frame, so a dropdown inside the
   * frame opens underneath the card's resize handles. Telling the host a menu is
   * open lets it stand its handles down for the duration.
   */
  setFrameMenuOpen(open: boolean): void {
    if (!this.isHostedInParent) return;
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_shell_menu_state'),
      type: AUTHORING_SHELL_MENU_STATE_TYPE,
      open,
    });
  }

  /**
   * What this session can do, answered to the host's `init`.
   *
   * The assist provider is a per-session service the host never sees, so without
   * this the palette's AI rows would have to either lie or hide. Neither is the
   * house rule: a control that cannot work is printed and says why.
   */
  sendShellCapabilities(): void {
    if (!this.isHostedInParent) return;
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_shell_capabilities'),
      type: AUTHORING_SHELL_CAPABILITIES_TYPE,
      assist: Boolean(this.services.requestAiAssist),
    });
  }

  /**
   * ⌘K, pressed in here. The palette is host chrome and a key pressed inside the
   * frame never reaches the host document, so the chord travels instead.
   */
  requestCommandPalette(): void {
    if (!this.isHostedInParent) return;
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_shell_palette_open'),
      type: AUTHORING_SHELL_PALETTE_OPEN_TYPE,
    });
  }

  /** A transient notice over the page. Already-localized creator text only. */
  notify(message: string, kind?: 'neutral' | 'positive' | 'warning' | 'danger'): void {
    if (!this.isHostedInParent) return;
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_shell_notice'),
      type: AUTHORING_SHELL_NOTICE_TYPE,
      message,
      ...(kind ? { kind } : {}),
    });
  }

  toggleStepStyleSelection(stepId: string): void {
    const step = this.documentState.blocks.find(
      (candidate) => candidate.id === stepId && candidate.type === 'tourStep',
    );
    if (!step) return;
    if (this.selectedStepIds.has(stepId)) this.selectedStepIds.delete(stepId);
    else this.selectedStepIds.add(stepId);
    this.stepSelectionAnchorId = stepId;
    this.sendShellSelection();
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
    this.sendShellSelection();
    this.emit();
  }

  clearTourStepBatchSelection(): void {
    this.selectedStepIds.clear();
    this.sendShellSelection();
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
    this.stepStyleRecipeByStep.set(stepId, recipe.id);
    this.services.saveStepStyleRecipes?.(this.stepStyleRecipes.list());
    void this.persistAuthoringResources();
    this.setStatus(authoringText('Saved style recipe {name}', { name: recipe.name }));
  }

  /**
   * Re-saves a named style from a step that has since drifted from it, keeping the
   * name and dropping the old entry — a recipe id is its content hash, so saving
   * a changed snapshot mints a new one rather than overwriting.
   */
  updateStepStyleRecipe(recipeId: string, stepId: string): void {
    const prior = this.stepStyleRecipes.get(recipeId);
    const step = this.documentState.blocks.find((candidate) => candidate.id === stepId);
    if (!prior || !step || step.type !== 'tourStep') return;
    const recipe = this.stepStyleRecipes.save(prior.name, extractTourStepStyle(step));
    if (recipe.id !== prior.id) this.stepStyleRecipes.delete(prior.id);
    for (const [boundStepId, boundRecipeId] of this.stepStyleRecipeByStep) {
      if (boundRecipeId === prior.id) this.stepStyleRecipeByStep.set(boundStepId, recipe.id);
    }
    this.services.saveStepStyleRecipes?.(this.stepStyleRecipes.list());
    void this.persistAuthoringResources();
    this.setStatus(authoringText('Updated style {name}', { name: recipe.name }));
    this.recordMetric('style.recipe-updated');
  }

  applyStepStyleRecipe(recipeId: string, fallbackStepId: string): void {
    const recipe = this.stepStyleRecipes.get(recipeId);
    if (!recipe) return;
    const stepIds = this.selectedStepIds.size ? [...this.selectedStepIds] : [fallbackStepId];
    for (const stepId of stepIds) this.stepStyleRecipeByStep.set(stepId, recipeId);
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
    void this.persistAuthoringResources();
    this.setStatus(authoringText('Deleted style recipe {name}', { name: recipe.name }));
  }

  saveDraftCheckpoint(name: string): void {
    const checkpoint = this.draftCheckpoints.save(name, this.documentState);
    void this.persistAuthoringResources();
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
    void this.persistAuthoringResources();
    this.setStatus(authoringText('Checkpoint deleted'));
  }

  canUploadMediaAssets(): boolean {
    return Boolean(
      this.services.uploadMediaAsset && this.deliveryCapabilities.has('media-assets.v1'),
    );
  }

  async resolveMediaAssetPreview(assetId: string): Promise<string | null> {
    const cached = this.mediaAssetPreviewUrls.get(assetId);
    if (cached) return cached;
    const pending = this.mediaAssetPreviewRequests.get(assetId);
    if (pending) return pending;
    const asset = this.mediaAssets.find((candidate) => candidate.id === assetId);
    const loadPreview = this.services.loadMediaAssetPreview;
    if (!asset || !loadPreview || typeof URL.createObjectURL !== 'function') return null;
    const request = loadPreview(structuredClone(asset))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        this.mediaAssetPreviewUrls.set(assetId, url);
        return url;
      })
      .catch(() => null)
      .finally(() => this.mediaAssetPreviewRequests.delete(assetId));
    this.mediaAssetPreviewRequests.set(assetId, request);
    return request;
  }

  async uploadMediaAsset(
    kind: 'image' | 'video' | 'captions',
    file: File,
    options: { onProgress?: (progress: number) => void; savedToLibrary: boolean } = {
      savedToLibrary: false,
    },
  ): Promise<AuthoringMediaAssetResource | null> {
    const upload = this.services.uploadMediaAsset;
    if (!upload || !this.deliveryCapabilities.has('media-assets.v1')) return null;
    this.setStatus(authoringText('Uploading media…'));
    options.onProgress?.(0);
    try {
      const asset = await upload(kind, file, options);
      this.mediaAssets = [
        asset,
        ...this.mediaAssets.filter((candidate) => candidate.id !== asset.id),
      ];
      if (typeof URL.createObjectURL === 'function') {
        const existing = this.mediaAssetPreviewUrls.get(asset.id);
        if (existing && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(existing);
        this.mediaAssetPreviewUrls.set(asset.id, URL.createObjectURL(file));
      }
      this.setStatus(authoringText('Media uploaded'));
      options.onProgress?.(100);
      return structuredClone(asset);
    } catch {
      this.setStatus(authoringText('Media upload failed. Try again.'));
      return null;
    }
  }

  private async persistAuthoringResources(): Promise<void> {
    const persist = this.services.saveAuthoringResources;
    if (!persist) return;
    try {
      await persist(this.stepStyleRecipes.list(), this.draftCheckpoints.list());
    } catch {
      this.setStatus(authoringText('Authoring resources could not be saved'));
    }
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
    this.recordMetric(staged.coalesced ? 'transaction.coalesced' : 'transaction.committed', {
      transactionId: staged.transaction.transactionId,
      revision: staged.transaction.revision,
      scope: staged.transaction.scope,
      count: staged.transaction.operations.length,
    });
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
