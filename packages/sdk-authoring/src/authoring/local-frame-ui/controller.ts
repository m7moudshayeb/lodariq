import {
  BRIDGE_PROTOCOL_VERSION,
  type BlockActionProps,
  type BridgeMessage,
  type PreviewPatchOperation,
  type LodariqBlock,
  type LodariqDocument,
  type RuntimeLifecycleHints,
  type TargetInspectAction,
} from '@lodariq/schema';
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import {
  attachTargetToBlocks,
  blocksReferenceTarget,
  createContentBlock,
  createTourStep,
  duplicateStepChildBlock,
  duplicateTopLevelBlock,
  hasBlock,
  insertBlockInsideTourStep,
  insertTopLevelBlock,
  moveStepChildBlock,
  moveTopLevelBlock as moveTopLevelBlocks,
  normalizeTourRootBlocks,
  renumberTourSteps,
  removeStepChildBlock,
  removeTopLevelBlock,
  reorderStepChildBlock,
  removeTargetFromBlocks,
  reorderTopLevelBlock as reorderTopLevelBlocks,
  setBlockAction,
  setBlockActionUrl,
  transformBlocks,
  updateBlockContent,
  type BlockDirection,
  type BlockInsertPosition,
  type EditableBlockType,
} from '../document-ops';
import { LOCAL_AUTHORING_SESSION_ID } from '../constants';
import { AuthoringBridge, createBridgeCorrelationId } from '../../bridge';
import {
  blocksFromSafePasteData,
  createLodariqEditor,
  createTargetId,
  fromBlockJson,
  toBlockJson,
  type SerializedEditorState,
} from '../../editor';
import type {
  DocumentTarget,
  EditableActionType,
  FocusRequest,
  LocalAuthoringFrameSnapshot,
  SlashCommand,
  TargetInspectionState,
} from './types';
import {
  TARGET_LIFECYCLE_SCROLL_VALUES,
  type TargetLifecycleControl,
  type TargetLifecycleScrollStrategy,
} from './types';
import type {
  LocalAuthoringFrameMetricName,
  LocalAuthoringFrameOptions,
} from '../local-frame-types';
import {
  blockTypeLabel,
  closestBlockId,
  closestButton,
  editableActionValue,
  editableBlockTypeValue,
  findBlockById,
  isEditableContentBlock,
  isEditableControl,
  slashCommandType,
  slashCommandValue,
  targetInspectionStatus,
} from './utils';

export class LocalAuthoringFrameController {
  private readonly services: LocalAuthoringFrameOptions['services'];
  private readonly sessionId: string;
  private readonly lexicalEditor = createLodariqEditor();
  private readonly baseDocument: LodariqDocument;
  private readonly metricsSessionId: string;
  private readonly peerWindow: Window;
  private readonly isHostedInParent: boolean;
  private readonly bridge: AuthoringBridge;
  private readonly subscribers = new Set<(snapshot: LocalAuthoringFrameSnapshot) => void>();
  private readonly canceledTargetBlockIds = new Set<string>();
  private readonly targetDiagnostics = new Map<string, TargetInspectionState>();
  private readonly advancedTargetIds = new Set<string>();
  private readonly undoStack: LodariqDocument[] = [];
  private readonly redoStack: LodariqDocument[] = [];
  private readonly pendingPreviewPatches: Array<{
    blockId: string;
    ops: PreviewPatchOperation[];
  }> = [];
  private documentState: LodariqDocument;
  private snapshotValue: LocalAuthoringFrameSnapshot;
  private slashText = '';
  private slashOpen = false;
  private status = '';
  private jsonText = '';
  private compiledText = '';
  private metricsText = '{}';
  private selectedBlockId: string | null = null;
  private draggingBlockId: string | null = null;
  private draggingStepBlockId: string | null = null;
  private dragTargetBlockId: string | null = null;
  private dragTargetPosition: BlockInsertPosition | null = null;
  private pendingTargetBlockId: string | null = null;
  private previewPatchFlushQueued = false;
  private focusRequest: FocusRequest | null = null;
  private focusToken = 0;
  private started = false;

  constructor(private readonly options: LocalAuthoringFrameOptions) {
    this.services = options.services;
    this.sessionId = options.sessionId ?? LOCAL_AUTHORING_SESSION_ID;
    this.baseDocument = this.normalizeDocument(structuredClone(options.baseDocument));
    this.documentState = this.normalizeDocument(
      this.services.loadDocument(this.baseDocument.id) ?? this.createBaseDocument(),
    );
    this.metricsSessionId = `${this.sessionId}:${options.now?.() ?? Date.now()}`;
    this.peerWindow = options.peerWindow ?? window.parent;
    this.isHostedInParent = this.peerWindow !== window;
    this.bridge = new AuthoringBridge(this.peerWindow, {
      allowedOrigins: options.allowedOrigins ?? [window.location.origin],
      targetOrigin: options.targetOrigin ?? window.location.origin,
      expectedSessionId: this.sessionId,
      expectedDocumentId: () => this.documentState.id,
      onMessage: (message) => this.handleBridgeMessage(message),
    });
    this.jsonText = this.services.exportDocument(this.documentState);
    this.status = `Editing ${this.documentState.title}`;
    this.renderMetrics();
    this.snapshotValue = this.makeSnapshot();
  }

  getSnapshot(): LocalAuthoringFrameSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: (snapshot: LocalAuthoringFrameSnapshot) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.bridge.start();
    window.addEventListener('pagehide', this.handlePageHide, { once: true });
    window.addEventListener('keydown', this.handleWindowKeyDown);
    this.recordMetric('authoring.opened');
  }

  destroy(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('pagehide', this.handlePageHide);
    window.removeEventListener('keydown', this.handleWindowKeyDown);
    this.flushPreviewPatches();
    this.bridge.stop();
  }

  setSlashText(value: string): void {
    this.slashText = value;
    this.slashOpen = value.trim().length > 0;
    this.emit();
  }

  closeSlashComposer(): void {
    if (!this.slashOpen) return;
    this.slashOpen = false;
    this.emit();
  }

  selectBlock(blockId: string): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    if (this.selectedBlockId === blockId) return;
    this.selectedBlockId = blockId;
    this.emit();
  }

  clearSelection(): void {
    if (!this.selectedBlockId) return;
    this.selectedBlockId = null;
    this.emit();
  }

  setJsonText(value: string): void {
    this.jsonText = value;
    this.emit();
  }

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
    this.setStatus('Open a step to add content.');
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
    if (
      target instanceof HTMLInputElement &&
      target.getAttribute('aria-label') === 'Experience composer'
    ) {
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
    if (target.getAttribute('aria-label') !== 'Experience composer') return;
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

  startDraggingBlock(blockId: string, event?: DragEvent<HTMLElement>): void {
    this.selectBlock(blockId);
    this.draggingBlockId = blockId;
    primeDragTransfer(event ? reactDataTransfer(event) : null, blockId);
    this.updateDragTarget(null, null);
    this.setStatus('Move item to a new position');
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

  private dropPositionFallback(targetBlockId: string): BlockInsertPosition {
    if (!this.draggingBlockId) return 'before';
    const draggingIndex = this.documentState.blocks.findIndex(
      (block) => block.id === this.draggingBlockId,
    );
    const targetIndex = this.documentState.blocks.findIndex((block) => block.id === targetBlockId);
    if (draggingIndex < 0 || targetIndex < 0) return 'before';
    return draggingIndex < targetIndex ? 'after' : 'before';
  }

  private autoScrollDuringDrag(event: Event | DragEvent<HTMLElement>): void {
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

  private stepContentDropPositionFallback(
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

  private startDraggingStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    dataTransfer: DataTransfer | null,
  ): void {
    this.selectBlock(childBlockId);
    this.draggingBlockId = childBlockId;
    this.draggingStepBlockId = stepBlockId;
    primeDragTransfer(dataTransfer, childBlockId);
    this.updateDragTarget(null, null);
    this.setStatus('Move content inside this step');
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

  setButtonAction(blockId: string, actionType: EditableActionType): void {
    this.setAction(blockId, actionType);
  }

  setActionUrl(blockId: string, url: string): void {
    this.commitActionUrl(blockId, url);
  }

  transformEditableBlock(blockId: string, type: EditableBlockType): void {
    this.transformBlock(blockId, type);
  }

  applyStepContentCommand(
    stepBlockId: string,
    childBlockId: string,
    type: EditableBlockType,
  ): void {
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    if (!currentBlocks.some((block) => block.id === childBlockId)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: transformBlocks(
        this.documentState.blocks,
        childBlockId,
        type,
        slashCommandDefaultContent(type),
      ),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = childBlockId;
    this.focusInsertedBlock(childBlockId);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Changed line to ${blockTypeLabel(type).toLowerCase()}`);
    this.sendPreviewPatch(childBlockId, [{ op: 'transformBlock', type }]);
  }

  commitDocumentTitle(value: string): void {
    const title = value.trim() || 'Untitled experience';
    if (this.documentState.title === title) return;
    this.recordChange();
    this.documentState = { ...this.documentState, title };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus('Title updated');
    this.sendPreviewPatch(this.documentState.id, [{ op: 'setDocumentTitle', title }]);
  }

  appendBlock(type: EditableBlockType, contentOverride?: string): void {
    void type;
    void contentOverride;
    this.setStatus('Open a step to add content.');
    this.clearSlash();
    this.emit();
  }

  insertTopLevelCommand(
    command: SlashCommand,
    anchorBlockId: string,
    position: BlockInsertPosition,
  ): void {
    if (!hasBlock(this.documentState.blocks, anchorBlockId)) return;
    if (command !== 'step') {
      this.setStatus('Open a step to add content.');
      return;
    }
    const block = createTourStep(this.nextStepIndex());
    const blocks = insertTopLevelBlock(this.documentState.blocks, anchorBlockId, block, position);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.selectedBlockId = block.id;
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
    if (!hasBlock(this.documentState.blocks, stepBlockId)) return;
    const block = createContentBlock(type, contentOverride ?? insertedStepContentDefault(type));
    const blocks = insertBlockInsideTourStep(this.documentState.blocks, stepBlockId, block, index);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation();
    this.selectedBlockId = block.id;
    this.focusInsertedBlock(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Inserted ${blockTypeLabel(type).toLowerCase()} in step`);
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertStepContent', stepBlockId, block, index }]);
  }

  continueStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    value: string,
    nextContent = '',
  ): void {
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    if (currentIndex < 0) return;
    const nextBlock = createContentBlock('paragraph', nextContent);
    const nextBlocks = updateBlockContent(this.documentState.blocks, childBlockId, value);
    const blocks = insertBlockInsideTourStep(nextBlocks, stepBlockId, nextBlock, currentIndex + 1);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation();
    this.selectedBlockId = nextBlock.id;
    this.focusEditableField(nextBlock.id, 'start');
    this.services.saveDocument(this.documentState);
    this.setStatus('Added text line');
    this.sendPreviewPatch(childBlockId, [
      { op: 'updateContent', content: value },
      { op: 'insertStepContent', stepBlockId, block: nextBlock, index: currentIndex + 1 },
    ]);
  }

  deleteEmptyStepContentBlock(stepBlockId: string, childBlockId: string): void {
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
    this.documentState = {
      ...this.documentState,
      blocks,
      targets: this.documentState.targets.filter((target) =>
        blocksReferenceTarget(blocks, target.id),
      ),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = nextSelection;
    this.focusEditableField(nextSelection, 'end');
    this.setStatus('Deleted empty line');
    this.sendPreviewPatch(childBlockId, [{ op: 'removeBlock', stepBlockId }]);
  }

  mergeStepContentBlockIntoPrevious(stepBlockId: string, childBlockId: string): boolean {
    const currentBlocks = this.stepContentBlocks(this.documentState.blocks, stepBlockId);
    const currentIndex = currentBlocks.findIndex((block) => block.id === childBlockId);
    const currentBlock = currentBlocks[currentIndex];
    const previousBlock = currentBlocks[currentIndex - 1];
    if (!currentBlock || !previousBlock) return false;
    if (currentBlock.type !== 'paragraph' || previousBlock.type !== 'paragraph') return false;
    const previousContent = previousBlock.content ?? '';
    const currentContent = currentBlock.content ?? '';
    const nextBlocks = updateBlockContent(
      this.documentState.blocks,
      previousBlock.id,
      `${previousContent}${currentContent}`,
    );
    const blocks = removeStepChildBlock(nextBlocks, stepBlockId, childBlockId);
    if (!blocks) return false;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks,
      targets: this.documentState.targets.filter((target) =>
        blocksReferenceTarget(blocks, target.id),
      ),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = previousBlock.id;
    this.focusEditableField(previousBlock.id, previousContent.length);
    this.setStatus('Merged text line');
    this.sendPreviewPatch(previousBlock.id, [
      { op: 'updateContent', content: `${previousContent}${currentContent}` },
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
    this.setStatus('Moved step content');
    this.sendPreviewPatch(childBlockId, [{ op: 'moveStepContent', stepBlockId, direction }]);
  }

  reorderStepContentBlock(
    stepBlockId: string,
    childBlockId: string,
    targetChildBlockId: string,
    position: BlockInsertPosition,
  ): void {
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
    this.setStatus('Moved step content');
    this.sendPreviewPatch(childBlockId, [
      { op: 'reorderStepContent', stepBlockId, targetChildBlockId, position },
    ]);
  }

  duplicateStepContentBlock(stepBlockId: string, childBlockId: string): void {
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
    this.setStatus('Duplicated content');
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
    const currentIndex = this.stepContentBlocks(this.documentState.blocks, stepBlockId).findIndex(
      (block) => block.id === childBlockId,
    );
    const blocks = removeStepChildBlock(this.documentState.blocks, stepBlockId, childBlockId);
    if (!blocks) return;
    const nextContentBlocks = this.stepContentBlocks(blocks, stepBlockId);
    const nextSelection =
      nextContentBlocks[Math.min(currentIndex, nextContentBlocks.length - 1)]?.id ?? stepBlockId;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks,
      targets: this.documentState.targets.filter((target) =>
        blocksReferenceTarget(blocks, target.id),
      ),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = nextSelection;
    this.focusBlock(nextSelection);
    this.setStatus('Deleted content');
    this.sendPreviewPatch(childBlockId, [{ op: 'removeBlock', stepBlockId }]);
  }

  appendStep(title?: string): void {
    const block = createTourStep(this.nextStepIndex(), title?.trim() || undefined);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: renumberTourSteps([...this.documentState.blocks, block]),
    };
    this.afterDocumentMutation();
    this.clearSlash();
    this.selectedBlockId = block.id;
    this.focusEditableField(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus('Added step');
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertBlock', block }]);
  }

  moveTopLevelBlock(blockId: string, direction: BlockDirection): void {
    const blocks = moveTopLevelBlocks(this.documentState.blocks, blockId, direction);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = blockId;
    this.focusBlock(blockId);
    this.setStatus('Moved step');
    this.sendPreviewPatch(blockId, [{ op: 'moveBlock', direction }]);
  }

  duplicateTopLevelBlock(blockId: string): void {
    const blockIndex = this.documentState.blocks.findIndex((block) => block.id === blockId);
    const blocks = duplicateTopLevelBlock(this.documentState.blocks, blockId);
    if (!blocks) return;
    const duplicatedBlockId = blocks[blockIndex + 1]?.id ?? blockId;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = duplicatedBlockId;
    this.focusBlock(duplicatedBlockId);
    this.setStatus('Duplicated step');
    const duplicatedBlock = blocks[blockIndex + 1];
    if (duplicatedBlock) {
      this.sendPreviewPatch(duplicatedBlock.id, [
        { op: 'insertBlock', block: duplicatedBlock, anchorBlockId: blockId, position: 'after' },
      ]);
    }
  }

  deleteTopLevelBlock(blockId: string): void {
    const blockIndex = this.documentState.blocks.findIndex((block) => block.id === blockId);
    const blocks = removeTopLevelBlock(this.documentState.blocks, blockId);
    if (!blocks) return;
    const nextSelection = blocks[Math.min(blockIndex, blocks.length - 1)]?.id ?? null;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: renumberTourSteps(blocks),
      targets: this.documentState.targets.filter((target) =>
        blocksReferenceTarget(blocks, target.id),
      ),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = nextSelection;
    if (nextSelection) this.focusBlock(nextSelection);
    this.setStatus('Deleted step');
    this.sendPreviewPatch(blockId, [{ op: 'removeBlock' }]);
  }

  reorderTopLevelBlock(
    blockId: string,
    targetBlockId: string,
    position: BlockInsertPosition = 'before',
  ): void {
    const blocks = reorderTopLevelBlocks(
      this.documentState.blocks,
      blockId,
      targetBlockId,
      position,
    );
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = blockId;
    this.focusBlock(blockId);
    this.setStatus('Moved step');
    this.sendPreviewPatch(blockId, [
      { op: 'reorderBlock', beforeBlockId: targetBlockId, position },
    ]);
  }

  removeTargetFromBlock(blockId: string, targetId: string): void {
    if (!hasBlock(this.documentState.blocks, blockId) || !this.targetById(targetId)) return;
    this.recordChange();
    const blocks = removeTargetFromBlocks(this.documentState.blocks, blockId, targetId);
    this.documentState = {
      ...this.documentState,
      targets: blocksReferenceTarget(blocks, targetId)
        ? this.documentState.targets
        : this.documentState.targets.filter((target) => target.id !== targetId),
      blocks,
    };
    this.targetDiagnostics.delete(targetId);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = blockId;
    this.sendPreviewPatch(blockId, [{ op: 'removeTarget', targetId }]);
    this.setStatus('Removed placement; choose a new one');
  }

  toggleTargetAdvanced(targetId: string): void {
    if (this.advancedTargetIds.has(targetId)) {
      this.advancedTargetIds.delete(targetId);
    } else {
      this.advancedTargetIds.add(targetId);
    }
    this.setStatus('Placement details updated');
  }

  setTargetWaitForText(targetId: string, waitForText: string): void {
    this.updateTargetLifecycle(targetId, (current) => {
      const next = { ...current };
      const trimmed = waitForText.trim();
      if (trimmed) {
        next.waitForText = trimmed;
      } else {
        delete next.waitForText;
      }
      return next;
    });
  }

  setTargetScrollStrategy(targetId: string, scrollStrategy: string): void {
    this.updateTargetLifecycle(targetId, (current) => {
      const next = { ...current };
      if (isTargetLifecycleScrollStrategy(scrollStrategy)) {
        next.scrollStrategy = scrollStrategy;
      } else {
        delete next.scrollStrategy;
      }
      return next;
    });
  }

  setTargetLifecycleControl(
    targetId: string,
    control: TargetLifecycleControl,
    enabled: boolean,
  ): void {
    const target = this.targetById(targetId);
    if (!target) return;
    this.updateTargetLifecycle(targetId, (current) => {
      const next = { ...current };
      if (enabled) {
        next[control] = structuredClone(target.fingerprint);
      } else {
        delete next[control];
      }
      return next;
    });
  }

  startTargetPick(blockId: string): void {
    if (!this.isHostedInParent) {
      this.setStatus('Open the editor on a preview page to choose placements');
      return;
    }
    this.setStatus('Select where this step appears');
    this.selectBlock(blockId);
    this.recordMetric('target.pick.started');
    this.pendingTargetBlockId = blockId;
    this.canceledTargetBlockIds.delete(blockId);
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: createBridgeCorrelationId('target_pick_start'),
          type: 'target.pick.start',
          blockId,
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        this.pendingTargetBlockId = null;
        this.recordMetric('target.pick.failed');
        this.setStatus('Placement picker did not respond');
      });
  }

  requestTargetInspection(blockId: string, targetId: string, action: TargetInspectAction): void {
    const target = this.targetById(targetId);
    if (!target || !hasBlock(this.documentState.blocks, blockId)) return;
    if (!this.isHostedInParent) {
      this.setStatus('Open the editor on a preview page to check placements');
      return;
    }
    this.setStatus(targetInspectionPendingStatus(action));
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: createBridgeCorrelationId('target_inspect_request'),
          type: 'target.inspect.request',
          blockId,
          targetId,
          action,
          fingerprint: target.fingerprint,
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        this.targetDiagnostics.set(targetId, {
          action,
          diagnostic: {
            state: 'missing',
            confidence: 0,
            candidateCount: 0,
            resolutionMethod: 'none',
            message: 'Placement check did not respond',
          },
        });
        this.setStatus('Placement check did not respond');
      });
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.snapshot());
    this.documentState = previous;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus('Undid change');
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.documentState = next;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus('Redid change');
  }

  saveCurrentDocument(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    this.flushPreviewPatches();
    this.setStatus('Saved draft');
  }

  exportJson(): void {
    this.jsonText = this.services.exportDocument(this.documentState);
    this.recordMetric('document.exported');
    this.setStatus('Backup is ready');
  }

  importJson(): void {
    this.syncJsonTextControl();
    const importedDocument = this.importScopedDocument(this.jsonText);
    if (!importedDocument) return;
    this.recordChange();
    this.documentState = importedDocument;
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(this.documentState.blocks[0]?.id ?? this.documentState.id, [
      { op: 'replaceDocument', document: this.documentState },
    ]);
    this.recordMetric('document.imported');
    this.setStatus('Backup restored');
  }

  reset(): void {
    this.recordChange();
    this.services.resetDocuments();
    this.documentState = this.createBaseDocument();
    this.compiledText = '';
    this.afterDocumentMutation();
    this.sendPreviewPatch(this.documentState.blocks[0]?.id ?? this.documentState.id, [
      { op: 'replaceDocument', document: this.documentState },
    ]);
    this.setStatus('Reset experience');
  }

  compilePreview(): void {
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus('Preview package ready');
    });
    this.emit();
  }

  previewCurrentStep(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    const step = this.documentState.blocks.find((block) => block.type === 'tourStep');
    if (!step) {
      this.setStatus('Add a step before previewing');
      return;
    }
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus('Step preview ready');
    });
    this.emit();
  }

  previewFullTour(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus('Tour preview ready');
    });
    this.emit();
  }

  exportMetrics(): void {
    this.metricsText = this.services.exportMetricsReport(this.metricsSessionId);
    this.setStatus('Activity report ready');
  }

  private readonly handlePageHide = (): void => {
    this.destroy();
  };

  private readonly handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.pendingTargetBlockId) return;
    const blockId = this.pendingTargetBlockId;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pendingTargetBlockId = null;
    this.canceledTargetBlockIds.add(blockId);
    this.recordMetric('target.pick.canceled');
    this.setStatus('Placement selection canceled');
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('target_pick_canceled'),
      type: 'target.pick.canceled',
      blockId,
    });
  };

  private handleSlashEnter(key: string, rawText: string, preventDefault: () => void): void {
    const text = rawText.trim();
    if (key !== 'Enter' || text === '' || text === '/') return;
    preventDefault();
    const isSlashCommand = text.startsWith('/');
    const command = isSlashCommand ? slashCommandType(text) : null;
    if (command === 'step') {
      this.appendStep();
      return;
    }
    if (isSlashCommand) {
      this.setStatus('Open a step to add content.');
      this.clearSlash();
      this.emit();
      return;
    }
    this.appendStep(text);
  }

  private activateActionButton(button: HTMLButtonElement, action: string): void {
    if (action === 'append-step') this.appendStep();
    if (action === 'undo') this.undo();
    if (action === 'redo') this.redo();
    if (action === 'save') this.saveCurrentDocument();
    if (action === 'export') this.exportJson();
    if (action === 'import') this.importJson();
    if (action === 'reset') this.reset();
    if (action === 'compile') this.compilePreview();
    if (action === 'preview-current') this.previewCurrentStep();
    if (action === 'preview-full') this.previewFullTour();
    if (action === 'export-metrics') this.exportMetrics();
    if (action === 'target-pick' || action === 'target-change') {
      const blockId = button.dataset['blockId'];
      if (blockId) this.startTargetPick(blockId);
    }
    if (action === 'target-view' || action === 'target-test' || action === 'target-health') {
      const blockId = button.dataset['blockId'];
      const targetId = button.dataset['targetId'];
      if (!blockId || !targetId) return;
      const inspectAction = targetInspectActionForButtonAction(action);
      this.requestTargetInspection(blockId, targetId, inspectAction);
    }
    if (action === 'target-advanced') {
      const targetId = button.dataset['targetId'];
      if (targetId) this.toggleTargetAdvanced(targetId);
    }
    if (action === 'target-remove') {
      const blockId = button.dataset['blockId'];
      const targetId = button.dataset['targetId'];
      if (blockId && targetId) this.removeTargetFromBlock(blockId, targetId);
    }
    if (action === 'move-block') {
      const blockId = button.dataset['blockId'];
      const direction = button.dataset['direction'];
      if (blockId && (direction === 'up' || direction === 'down')) {
        this.moveTopLevelBlock(blockId, direction);
      }
    }
    if (action === 'duplicate-block') {
      const blockId = button.dataset['blockId'];
      if (blockId) this.duplicateTopLevelBlock(blockId);
    }
    if (action === 'delete-block') {
      const blockId = button.dataset['blockId'];
      if (blockId) this.deleteTopLevelBlock(blockId);
    }
    if (action === 'move-step-content') {
      const stepBlockId = button.dataset['stepBlockId'];
      const blockId = button.dataset['blockId'];
      const direction = button.dataset['direction'];
      if (stepBlockId && blockId && (direction === 'up' || direction === 'down')) {
        this.moveStepContentBlock(stepBlockId, blockId, direction);
      }
    }
    if (action === 'duplicate-step-content') {
      const stepBlockId = button.dataset['stepBlockId'];
      const blockId = button.dataset['blockId'];
      if (stepBlockId && blockId) this.duplicateStepContentBlock(stepBlockId, blockId);
    }
    if (action === 'delete-step-content') {
      const stepBlockId = button.dataset['stepBlockId'];
      const blockId = button.dataset['blockId'];
      if (stepBlockId && blockId) this.deleteStepContentBlock(stepBlockId, blockId);
    }
    if (action === 'transform-block') {
      const blockId = button.dataset['blockId'];
      const type = editableBlockTypeValue(button.dataset['blockType'] ?? '');
      if (blockId && type) {
        if (findBlockById(this.documentState.blocks, blockId)?.type === type) return;
        this.transformEditableBlock(blockId, type);
      }
    }
  }

  private handleBridgeMessage(message: BridgeMessage): void {
    if (message.sessionId !== this.sessionId || message.documentId !== this.documentState.id) {
      return;
    }

    if (message.type === 'authoring.save.request') {
      this.saveCurrentDocument();
      this.bridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: this.sessionId,
        documentId: this.documentState.id,
        correlationId: createBridgeCorrelationId('authoring_save_result'),
        type: 'authoring.save.result',
        requestCorrelationId: message.correlationId,
        document: structuredClone(this.documentState),
      });
      return;
    }

    if (message.type === 'target.inspect.result') {
      if (
        !hasBlock(this.documentState.blocks, message.blockId) ||
        !this.targetById(message.targetId)
      ) {
        return;
      }
      this.targetDiagnostics.set(message.targetId, {
        action: message.action,
        diagnostic: message.diagnostic,
      });
      this.setStatus(targetInspectionStatus(message.action, message.diagnostic));
      return;
    }

    if (message.type === 'target.pick.canceled') {
      const alreadyCanceled = this.canceledTargetBlockIds.has(message.blockId);
      this.pendingTargetBlockId = null;
      this.canceledTargetBlockIds.add(message.blockId);
      if (!alreadyCanceled) this.recordMetric('target.pick.canceled');
      this.setStatus('Placement selection canceled');
      return;
    }

    if (message.type !== 'target.pick.result') return;
    if (!hasBlock(this.documentState.blocks, message.blockId)) return;
    if (this.canceledTargetBlockIds.has(message.blockId)) return;
    this.pendingTargetBlockId = null;
    this.canceledTargetBlockIds.delete(message.blockId);

    const targetId = createTargetId();
    const label =
      message.fingerprint.accessibleName ??
      message.fingerprint.stableAttributes['data-lodariq-id'] ??
      message.fingerprint.tagName;

    this.recordChange();
    this.documentState = {
      ...this.documentState,
      targets: [...this.documentState.targets, { id: targetId, fingerprint: message.fingerprint }],
      blocks: attachTargetToBlocks(this.documentState.blocks, message.blockId, targetId, label),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = message.blockId;
    this.services.saveDocument(this.documentState);
    this.recordMetric('target.pick.succeeded');
    this.sendPreviewPatch(message.blockId, [
      { op: 'attachTarget', targetId, fingerprint: message.fingerprint },
    ]);
    this.setStatus(`Placement set: ${label}`);
  }

  private appendPastedBlocks(blocksToAdd: LodariqBlock[]): void {
    if (!blocksToAdd.length) return;
    const blocks = normalizeTourRootBlocks(blocksToAdd);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: renumberTourSteps([...this.documentState.blocks, ...blocks]),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blocks[0]?.id ?? null;
    if (this.selectedBlockId) this.focusEditableField(this.selectedBlockId);
    this.services.saveDocument(this.documentState);
    this.setStatus('Pasted as steps');
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(blocks[0]!.id, [{ op: 'insertBlocks', blocks }]);
  }

  private setAction(blockId: string, actionType: EditableActionType): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    const currentAction = findBlockById(this.documentState.blocks, blockId)?.props.action;
    const nextAction = createNextAction(actionType, currentAction);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockAction(this.documentState.blocks, blockId, nextAction),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blockId;
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, previewPatchForAction(actionType, nextAction));
  }

  private commitActionUrl(blockId: string, value: string): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    const currentAction = findBlockById(this.documentState.blocks, blockId)?.props.action;
    const currentValue = currentAction?.type === 'openPage' ? (currentAction.url ?? '') : '';
    if (currentValue === value) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockActionUrl(this.documentState.blocks, blockId, value),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blockId;
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setAction', action: { type: 'openPage', url: value } }]);
  }

  private transformBlock(blockId: string, type: EditableBlockType): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: transformBlocks(this.documentState.blocks, blockId, type),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blockId;
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'transformBlock', type }]);
  }

  private commitContent(blockId: string, value: string): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    if ((findBlockById(this.documentState.blocks, blockId)?.content ?? '') === value) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: updateBlockContent(this.documentState.blocks, blockId, value),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blockId;
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'updateContent', content: value }]);
  }

  private syncFocusedEditControl(): void {
    const active = this.options.root.ownerDocument.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
      return;
    }
    if (active instanceof HTMLInputElement && active.dataset['action'] === 'edit-title') {
      this.commitDocumentTitle(active.value);
      return;
    }
    const blockId = active.dataset['blockId'];
    if (!blockId || !hasBlock(this.documentState.blocks, blockId)) return;
    if (active.dataset['action'] === 'edit-content') {
      this.commitContent(blockId, active.value);
      return;
    }
    if (active.dataset['action'] === 'edit-action-url') {
      this.commitActionUrl(blockId, active.value);
    }
  }

  private syncJsonTextControl(): void {
    const textarea = this.options.root.querySelector<HTMLTextAreaElement>(
      'textarea[data-action="edit-draft-backup"]',
    );
    if (!textarea) return;
    this.jsonText = textarea.value;
  }

  private importScopedDocument(json: string): LodariqDocument | null {
    let imported: LodariqDocument;
    try {
      imported = this.normalizeDocument(this.services.importDocument(json));
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'This backup is not valid.');
      return null;
    }
    if (imported.id !== this.baseDocument.id) {
      this.setStatus('This backup belongs to a different experience.');
      return null;
    }
    if (imported.workspaceId !== this.baseDocument.workspaceId) {
      this.setStatus('This backup belongs to a different workspace.');
      return null;
    }
    return imported;
  }

  private sendPreviewPatch(blockId: string, ops: PreviewPatchOperation[]): void {
    const last = this.pendingPreviewPatches[this.pendingPreviewPatches.length - 1];
    if (last?.blockId === blockId) {
      last.ops.push(...structuredClone(ops));
    } else {
      this.pendingPreviewPatches.push({ blockId, ops: structuredClone(ops) });
    }
    if (this.previewPatchFlushQueued) return;
    this.previewPatchFlushQueued = true;
    globalThis.setTimeout(() => this.flushPreviewPatches(), 0);
  }

  private flushPreviewPatches(): void {
    if (!this.previewPatchFlushQueued && this.pendingPreviewPatches.length === 0) return;
    this.previewPatchFlushQueued = false;
    const batches = this.pendingPreviewPatches.splice(0, this.pendingPreviewPatches.length);
    for (const batch of batches) {
      this.bridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: this.sessionId,
        documentId: this.documentState.id,
        correlationId: createBridgeCorrelationId('preview_patch'),
        type: 'preview.patch',
        blockId: batch.blockId,
        patch: { ops: batch.ops },
      });
    }
  }

  private targetById(targetId: string): DocumentTarget | undefined {
    return this.documentState.targets.find((item) => item.id === targetId);
  }

  private updateTargetLifecycle(
    targetId: string,
    updater: (current: RuntimeLifecycleHints) => RuntimeLifecycleHints,
  ): void {
    const target = this.targetById(targetId);
    if (!target) return;
    const nextLifecycle = normalizeTargetLifecycle(updater(target.lifecycle ?? {}));
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      targets: this.documentState.targets.map((item) => {
        if (item.id !== targetId) return item;
        return nextLifecycle
          ? { ...item, lifecycle: nextLifecycle }
          : { ...item, lifecycle: undefined };
      }),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus('Placement behavior updated');
    const blockId =
      firstBlockIdForTarget(this.documentState.blocks, targetId) ?? this.documentState.id;
    const op: PreviewPatchOperation = nextLifecycle
      ? { op: 'setTargetLifecycle', targetId, lifecycle: nextLifecycle }
      : { op: 'setTargetLifecycle', targetId };
    this.sendPreviewPatch(blockId, [op]);
  }

  private nextStepIndex(): number {
    return this.documentState.blocks.filter((block) => block.type === 'tourStep').length;
  }

  private normalizeDocument(doc: LodariqDocument): LodariqDocument {
    const lexicalState = fromBlockJson(doc.blocks);
    const parsed = this.lexicalEditor.parseEditorState(JSON.stringify(lexicalState)).toJSON();
    const blocks = toBlockJson(parsed as SerializedEditorState);
    return { ...doc, blocks: doc.type === 'tour' ? normalizeTourRootBlocks(blocks) : blocks };
  }

  private createBaseDocument(): LodariqDocument {
    return this.normalizeDocument(structuredClone(this.baseDocument));
  }

  private snapshot(): LodariqDocument {
    return structuredClone(this.documentState);
  }

  private recordChange(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
  }

  private recordMetric(name: LocalAuthoringFrameMetricName): void {
    this.services.recordMetric({
      sessionId: this.metricsSessionId,
      documentId: this.documentState.id,
      name,
    });
    this.renderMetrics();
    this.emit();
  }

  private renderMetrics(): void {
    const summary = this.services.getMetricsSummary(this.metricsSessionId);
    this.metricsText = JSON.stringify(summary ?? {}, null, 2);
  }

  private afterDocumentMutation(): void {
    this.documentState = this.normalizeDocument(this.documentState);
    if (this.selectedBlockId && !hasBlock(this.documentState.blocks, this.selectedBlockId)) {
      this.selectedBlockId = null;
    }
    this.jsonText = this.services.exportDocument(this.documentState);
    this.renderMetrics();
    if (this.dragTargetBlockId && !hasBlock(this.documentState.blocks, this.dragTargetBlockId)) {
      this.dragTargetBlockId = null;
      this.dragTargetPosition = null;
    }
    this.emit();
  }

  private clearSlash(): void {
    this.slashText = '';
    this.slashOpen = false;
  }

  private focusBlock(blockId: string): void {
    this.selectedBlockId = blockId;
    this.focusRequest = { blockId, target: 'block', token: ++this.focusToken };
    this.emit();
  }

  private focusEditableField(blockId: string, caret?: 'start' | 'end' | number): void {
    this.selectedBlockId = blockId;
    this.focusRequest = { blockId, target: 'edit', caret, token: ++this.focusToken };
    this.emit();
  }

  private focusInsertedBlock(blockId: string): void {
    this.focusEditableField(blockId);
  }

  private updateDragTarget(blockId: string | null, position: BlockInsertPosition | null): void {
    const nextBlockId =
      blockId && blockId !== this.draggingBlockId && hasBlock(this.documentState.blocks, blockId)
        ? blockId
        : null;
    const nextPosition = nextBlockId ? position : null;
    if (this.dragTargetBlockId === nextBlockId && this.dragTargetPosition === nextPosition) return;
    this.dragTargetBlockId = nextBlockId;
    this.dragTargetPosition = nextPosition;
    this.emit();
  }

  private clearDragState(): void {
    const hadDragState =
      this.draggingBlockId !== null ||
      this.draggingStepBlockId !== null ||
      this.dragTargetBlockId !== null ||
      this.dragTargetPosition !== null;
    this.draggingBlockId = null;
    this.draggingStepBlockId = null;
    this.dragTargetBlockId = null;
    this.dragTargetPosition = null;
    if (hadDragState) this.emit();
  }

  private stepContentBlocks(blocks: LodariqBlock[], stepBlockId: string): LodariqBlock[] {
    const step = findBlockById(blocks, stepBlockId);
    const tooltip = step?.children.find((child) => child.type === 'tooltip');
    return (tooltip?.children ?? []).filter(isEditableContentBlock);
  }

  private setStatus(message: string): void {
    this.status = message;
    this.emit();
  }

  private makeSnapshot(): LocalAuthoringFrameSnapshot {
    return {
      documentState: this.documentState,
      status: this.status,
      slashText: this.slashText,
      slashOpen: this.slashOpen,
      jsonText: this.jsonText,
      compiledText: this.compiledText,
      metricsText: this.metricsText,
      selectedBlockId: this.selectedBlockId,
      dragTargetBlockId: this.dragTargetBlockId,
      dragTargetPosition: this.dragTargetPosition,
      targetDiagnostics: new Map(this.targetDiagnostics),
      advancedTargetIds: new Set(this.advancedTargetIds),
      focusRequest: this.focusRequest,
    };
  }

  private emit(): void {
    this.snapshotValue = this.makeSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(this.snapshotValue);
    }
  }
}

type ConcreteEditableActionType = Exclude<EditableActionType, ''>;
type EditableActionFactory = (currentAction: BlockActionProps | undefined) => BlockActionProps;

const EDITABLE_ACTION_FACTORIES: Readonly<
  Record<ConcreteEditableActionType, EditableActionFactory>
> = {
  next: () => ({ type: 'next' }),
  back: () => ({ type: 'back' }),
  complete: () => ({ type: 'complete' }),
  clickTarget: () => ({ type: 'clickTarget' }),
  openPage: (currentAction) => ({
    type: 'openPage',
    url: currentOpenPageUrl(currentAction),
  }),
  dismiss: () => ({ type: 'dismiss' }),
};

const TARGET_INSPECT_ACTIONS: Readonly<Record<string, TargetInspectAction>> = {
  'target-view': 'view',
  'target-test': 'test',
  'target-health': 'health',
};
const DRAG_AUTO_SCROLL_EDGE_PX = 88;
const DRAG_AUTO_SCROLL_MAX_DELTA_PX = 28;

function createNextAction(
  actionType: EditableActionType,
  currentAction: BlockActionProps | undefined,
): BlockActionProps | null {
  if (actionType === '') return null;
  return EDITABLE_ACTION_FACTORIES[actionType](currentAction);
}

function currentOpenPageUrl(currentAction: BlockActionProps | undefined): string {
  if (currentAction?.type !== 'openPage') return '';
  return currentAction.url ?? '';
}

function previewPatchForAction(
  actionType: EditableActionType,
  action: BlockActionProps | null,
): PreviewPatchOperation[] {
  if (actionType === '' || !action) return [{ op: 'setAction' }];
  return [{ op: 'setAction', action }];
}

function targetInspectActionForButtonAction(action: string): TargetInspectAction {
  return TARGET_INSPECT_ACTIONS[action] ?? 'health';
}

function dropPosition(
  event: Event | DragEvent<HTMLElement>,
  fallback: BlockInsertPosition = 'before',
  selector = '.block[data-block-id]',
): BlockInsertPosition {
  const clientY = 'clientY' in event ? event.clientY : null;
  if (typeof clientY !== 'number' || !Number.isFinite(clientY) || clientY <= 0) {
    return fallback;
  }
  const targetBlockElement =
    event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
  const currentTarget = event.currentTarget;
  const currentTargetBlockElement =
    currentTarget instanceof HTMLElement && currentTarget.matches(selector) ? currentTarget : null;
  const blockElement = targetBlockElement ?? currentTargetBlockElement;
  if (!blockElement) return fallback;
  const rect = blockElement.getBoundingClientRect();
  if (rect.height <= 0) return fallback;
  return clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}

function dragAutoScrollDelta(edgeOverlap: number): number {
  const progress = Math.max(0, Math.min(1, edgeOverlap / DRAG_AUTO_SCROLL_EDGE_PX));
  return Math.ceil(6 + progress * (DRAG_AUTO_SCROLL_MAX_DELTA_PX - 6));
}

function closestStepContentDragTarget(
  target: EventTarget | null,
): { blockId: string; stepBlockId: string } | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>('.step-child[data-block-id][data-step-block-id]');
  const blockId = element?.dataset['blockId'];
  const stepBlockId = element?.dataset['stepBlockId'];
  return blockId && stepBlockId ? { blockId, stepBlockId } : null;
}

function closestTopLevelInsertTarget(
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

function nativeDataTransfer(event: Event): DataTransfer | null {
  const maybeDragEvent = event as { dataTransfer?: DataTransfer | null };
  return maybeDragEvent.dataTransfer ?? null;
}

function reactDataTransfer(event: DragEvent<HTMLElement>): DataTransfer | null {
  const maybeDragEvent = event as DragEvent<HTMLElement> & {
    dataTransfer?: DataTransfer | null;
  };
  return maybeDragEvent.dataTransfer ?? null;
}

function primeDragTransfer(dataTransfer: DataTransfer | null, blockId: string): void {
  if (!dataTransfer) return;
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData('text/plain', blockId);
}

function targetInspectionPendingStatus(action: TargetInspectAction): string {
  if (action === 'view') return 'Highlighting placement';
  return 'Checking placement';
}

function isTargetLifecycleScrollStrategy(value: string): value is TargetLifecycleScrollStrategy {
  return TARGET_LIFECYCLE_SCROLL_VALUES.some((strategy) => strategy === value);
}

function normalizeTargetLifecycle(
  lifecycle: RuntimeLifecycleHints,
): RuntimeLifecycleHints | undefined {
  const next = { ...lifecycle };
  if (typeof next.waitForText === 'string') {
    const trimmed = next.waitForText.trim();
    if (trimmed) {
      next.waitForText = trimmed;
    } else {
      delete next.waitForText;
    }
  }
  if (!next.scrollStrategy) delete next.scrollStrategy;
  return Object.keys(next).length > 0 ? next : undefined;
}

function firstBlockIdForTarget(blocks: LodariqBlock[], targetId: string): string | null {
  for (const block of blocks) {
    if (block.props.targetId === targetId) return block.id;
    const childBlockId = firstBlockIdForTarget(block.children, targetId);
    if (childBlockId) return childBlockId;
  }
  return null;
}

function slashCommandDefaultContent(type: EditableBlockType): string {
  if (type === 'button') return 'Continue';
  if (type === 'media') return 'Media placeholder';
  return '';
}

function insertedStepContentDefault(type: EditableBlockType): string {
  if (type === 'button') return 'Continue';
  if (type === 'media') return 'Media placeholder';
  return '';
}
