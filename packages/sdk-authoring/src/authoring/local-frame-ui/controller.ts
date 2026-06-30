import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeMessage,
  type PreviewPatchOperation,
  type LodariqBlock,
  type LodariqDocument,
  type TargetInspectAction,
} from '@lodariq/schema';
import type { ClipboardEvent, DragEvent, KeyboardEvent } from 'react';
import {
  attachTargetToBlocks,
  blocksReferenceTarget,
  createContentBlock,
  createTourStep,
  hasBlock,
  insertBlockInsideTourStep,
  insertTopLevelBlock,
  moveStepChildBlock,
  moveTopLevelBlock as moveTopLevelBlocks,
  renumberTourSteps,
  removeTargetFromBlocks,
  reorderTopLevelBlock as reorderTopLevelBlocks,
  setBlockAction,
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
  FocusRequest,
  LocalAuthoringFrameSnapshot,
  SlashCommand,
  TargetInspectionState,
} from './types';
import type {
  LocalAuthoringFrameMetricName,
  LocalAuthoringFrameOptions,
} from '../local-frame-types';
import {
  blockTypeLabel,
  capitalize,
  closestBlockId,
  closestButton,
  findBlockById,
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
  private draggingBlockId: string | null = null;
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
    this.appendBlock(command);
  }

  handlePaste(event: ClipboardEvent<HTMLElement>): void {
    if (isEditableControl(event.target)) return;
    const blocksToAdd = blocksFromSafePasteData(event.clipboardData);
    if (!blocksToAdd.length) return;
    event.preventDefault();
    this.appendPastedBlocks(blocksToAdd);
  }

  handleNativeInput(event: Event): void {
    if (event.isTrusted) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement &&
      target.getAttribute('aria-label') === 'Block composer'
    ) {
      event.stopPropagation();
      this.setSlashText(target.value);
      return;
    }
    if (
      target instanceof HTMLTextAreaElement &&
      target.getAttribute('aria-label') === 'Document JSON'
    ) {
      event.stopPropagation();
      this.setJsonText(target.value);
    }
  }

  handleNativeKeyDown(event: Event): void {
    if (event.isTrusted || !(event instanceof globalThis.KeyboardEvent)) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.getAttribute('aria-label') !== 'Block composer') return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closeSlashComposer();
      return;
    }
    event.stopPropagation();
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
    this.draggingBlockId = closestBlockId(event.target);
  }

  handleNativeDragOver(event: Event): void {
    if (event.isTrusted || !this.draggingBlockId) return;
    event.preventDefault();
  }

  handleNativeDrop(event: Event): void {
    if (event.isTrusted) return;
    event.preventDefault();
    const targetBlockId = closestBlockId(event.target);
    if (this.draggingBlockId && targetBlockId) {
      this.reorderTopLevelBlock(this.draggingBlockId, targetBlockId);
    }
    this.draggingBlockId = null;
  }

  handleNativeChange(event: Event): void {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
      target.dataset['action'] === 'edit-content'
    ) {
      const blockId = target.dataset['blockId'];
      if (!blockId) return;
      this.commitContent(blockId, target.value);
      return;
    }

    if (!(target instanceof HTMLSelectElement)) return;
    if (target.dataset['action'] === 'set-action') {
      const blockId = target.dataset['blockId'];
      const actionType = target.value;
      if (!blockId) return;
      if (
        actionType !== '' &&
        actionType !== 'next' &&
        actionType !== 'clickTarget' &&
        actionType !== 'dismiss'
      ) {
        return;
      }
      this.setAction(blockId, actionType);
      return;
    }

    if (target.dataset['action'] !== 'transform-block') return;
    const blockId = target.dataset['blockId'];
    const type = target.value;
    if (
      !blockId ||
      (type !== 'paragraph' && type !== 'heading' && type !== 'button' && type !== 'media')
    ) {
      return;
    }
    this.transformBlock(blockId, type);
  }

  startDraggingBlock(blockId: string): void {
    this.draggingBlockId = blockId;
  }

  handleBlockDragOver(event: DragEvent<HTMLElement>): void {
    if (!this.draggingBlockId) return;
    event.preventDefault();
  }

  handleBlockDrop(event: DragEvent<HTMLElement>, targetBlockId: string): void {
    event.preventDefault();
    if (this.draggingBlockId && targetBlockId) {
      this.reorderTopLevelBlock(this.draggingBlockId, targetBlockId);
    }
    this.draggingBlockId = null;
  }

  handleBlockKeyDown(event: KeyboardEvent<HTMLElement>, blockId: string): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    if (isEditableControl(event.target)) return;
    event.preventDefault();
    this.moveTopLevelBlock(blockId, event.key === 'ArrowUp' ? 'up' : 'down');
    this.focusBlock(blockId);
  }

  setButtonAction(blockId: string, actionType: '' | 'next' | 'clickTarget' | 'dismiss'): void {
    this.setAction(blockId, actionType);
  }

  transformEditableBlock(blockId: string, type: EditableBlockType): void {
    this.transformBlock(blockId, type);
  }

  appendBlock(type: EditableBlockType, contentOverride?: string): void {
    const block = createContentBlock(type, contentOverride);
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: [...this.documentState.blocks, block],
    };
    this.afterDocumentMutation();
    this.clearSlash();
    this.focusEditableField(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Added ${blockTypeLabel(type).toLowerCase()}`);
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'insertBlock', block }]);
  }

  insertTopLevelCommand(
    command: SlashCommand,
    anchorBlockId: string,
    position: BlockInsertPosition,
  ): void {
    if (!hasBlock(this.documentState.blocks, anchorBlockId)) return;
    const block =
      command === 'step' ? createTourStep(this.nextStepIndex()) : createContentBlock(command);
    const blocks = insertTopLevelBlock(this.documentState.blocks, anchorBlockId, block, position);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.focusInsertedBlock(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Inserted ${blockTypeLabel(block.type).toLowerCase()}`);
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'replaceDocument', document: this.documentState }]);
  }

  insertStepContent(stepBlockId: string, type: EditableBlockType, index: number): void {
    if (!hasBlock(this.documentState.blocks, stepBlockId)) return;
    const block = createContentBlock(type);
    const blocks = insertBlockInsideTourStep(this.documentState.blocks, stepBlockId, block, index);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks };
    this.afterDocumentMutation();
    this.focusInsertedBlock(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus(`Inserted ${blockTypeLabel(type).toLowerCase()} in step`);
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(block.id, [{ op: 'replaceDocument', document: this.documentState }]);
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
    this.focusBlock(childBlockId);
    this.setStatus('Moved step content');
    this.sendPreviewPatch(childBlockId, [{ op: 'replaceDocument', document: this.documentState }]);
  }

  appendStep(): void {
    const block = createTourStep(this.nextStepIndex());
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: renumberTourSteps([...this.documentState.blocks, block]),
    };
    this.afterDocumentMutation();
    this.clearSlash();
    this.focusEditableField(block.id);
    this.services.saveDocument(this.documentState);
    this.setStatus('Added tour step');
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
    this.setStatus('Moved block');
    this.sendPreviewPatch(blockId, [{ op: 'moveBlock', direction }]);
  }

  reorderTopLevelBlock(blockId: string, beforeBlockId: string): void {
    const blocks = reorderTopLevelBlocks(this.documentState.blocks, blockId, beforeBlockId);
    if (!blocks) return;
    this.recordChange();
    this.documentState = { ...this.documentState, blocks: renumberTourSteps(blocks) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus('Reordered block');
    this.sendPreviewPatch(blockId, [{ op: 'reorderBlock', beforeBlockId }]);
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
    this.sendPreviewPatch(blockId, [{ op: 'removeTarget', targetId }]);
    this.setStatus('Removed target; step needs a target');
  }

  toggleTargetAdvanced(targetId: string): void {
    if (this.advancedTargetIds.has(targetId)) {
      this.advancedTargetIds.delete(targetId);
    } else {
      this.advancedTargetIds.add(targetId);
    }
    this.setStatus('Toggled target advanced details');
  }

  startTargetPick(blockId: string): void {
    if (!this.isHostedInParent) {
      this.setStatus('Open authoring from the fixture host to pick targets');
      return;
    }
    this.setStatus('Select a product element');
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
        this.setStatus('Target picker did not respond');
      });
  }

  requestTargetInspection(blockId: string, targetId: string, action: TargetInspectAction): void {
    const target = this.targetById(targetId);
    if (!target || !hasBlock(this.documentState.blocks, blockId)) return;
    if (!this.isHostedInParent) {
      this.setStatus('Open authoring from the fixture host to inspect targets');
      return;
    }
    this.setStatus(`${capitalize(action)} target`);
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
            message: 'Target inspector did not respond',
          },
        });
        this.setStatus('Target inspector did not respond');
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
    this.setStatus('Saved locally');
  }

  exportJson(): void {
    this.jsonText = this.services.exportDocument(this.documentState);
    this.recordMetric('document.exported');
    this.setStatus('Exported JSON');
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
    this.setStatus('Imported JSON');
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
    this.setStatus('Reset fixture');
  }

  compilePreview(): void {
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus('Preview ready');
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
      this.setStatus('Add a tour step before previewing');
      return;
    }
    this.sendPreviewPatch(step.id, [{ op: 'replaceDocument', document: this.documentState }]);
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus('Current step preview ready');
    });
    this.emit();
  }

  previewFullTour(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(this.documentState.id, [
      { op: 'replaceDocument', document: this.documentState },
    ]);
    void this.services.compilePreview(this.documentState).then((doc) => {
      this.compiledText = JSON.stringify(doc, null, 2);
      this.recordMetric('preview.opened');
      this.setStatus('Full tour preview ready');
    });
    this.emit();
  }

  exportMetrics(): void {
    this.metricsText = this.services.exportMetricsReport(this.metricsSessionId);
    this.setStatus('Exported metrics report');
  }

  private readonly handlePageHide = (): void => {
    this.destroy();
  };

  private readonly handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.pendingTargetBlockId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('target_pick_canceled'),
      type: 'target.pick.canceled',
      blockId: this.pendingTargetBlockId,
    });
  };

  private handleSlashEnter(key: string, rawText: string, preventDefault: () => void): void {
    const text = rawText.trim();
    if (key !== 'Enter' || text === '' || text === '/') return;
    preventDefault();
    const command = text.startsWith('/') ? slashCommandType(text) : null;
    if (command === 'step') {
      this.appendStep();
      return;
    }
    this.appendBlock(command ?? 'paragraph', command ? undefined : text);
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
      const inspectAction: TargetInspectAction =
        action === 'target-view' ? 'view' : action === 'target-test' ? 'test' : 'health';
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
      this.pendingTargetBlockId = null;
      this.canceledTargetBlockIds.add(message.blockId);
      this.recordMetric('target.pick.canceled');
      this.setStatus('Target picker canceled');
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
    this.services.saveDocument(this.documentState);
    this.recordMetric('target.pick.succeeded');
    this.sendPreviewPatch(message.blockId, [
      { op: 'attachTarget', targetId, fingerprint: message.fingerprint },
    ]);
    this.setStatus(`Attached target ${label}`);
  }

  private appendPastedBlocks(blocksToAdd: LodariqBlock[]): void {
    if (!blocksToAdd.length) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: [...this.documentState.blocks, ...blocksToAdd],
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.setStatus('Pasted safe text');
    this.recordMetric('block.inserted');
    this.sendPreviewPatch(blocksToAdd[0]!.id, [{ op: 'insertBlocks', blocks: blocksToAdd }]);
  }

  private setAction(blockId: string, actionType: '' | 'next' | 'clickTarget' | 'dismiss'): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockAction(
        this.documentState.blocks,
        blockId,
        actionType === '' ? null : { type: actionType },
      ),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(
      blockId,
      actionType === ''
        ? [{ op: 'setAction' }]
        : [{ op: 'setAction', action: { type: actionType } }],
    );
  }

  private transformBlock(blockId: string, type: EditableBlockType): void {
    if (!hasBlock(this.documentState.blocks, blockId)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: transformBlocks(this.documentState.blocks, blockId, type),
    };
    this.afterDocumentMutation();
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
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'updateContent', content: value }]);
  }

  private syncFocusedEditControl(): void {
    const active = this.options.root.ownerDocument.activeElement;
    if (
      !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) ||
      active.dataset['action'] !== 'edit-content'
    ) {
      return;
    }
    const blockId = active.dataset['blockId'];
    if (!blockId || !hasBlock(this.documentState.blocks, blockId)) return;
    this.commitContent(blockId, active.value);
  }

  private syncJsonTextControl(): void {
    const textarea = this.options.root.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Document JSON"]',
    );
    if (!textarea) return;
    this.jsonText = textarea.value;
  }

  private importScopedDocument(json: string): LodariqDocument | null {
    let imported: LodariqDocument;
    try {
      imported = this.normalizeDocument(this.services.importDocument(json));
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Import failed');
      return null;
    }
    if (imported.id !== this.baseDocument.id) {
      this.setStatus(`Import rejected: document id must remain ${this.baseDocument.id}`);
      return null;
    }
    if (imported.workspaceId !== this.baseDocument.workspaceId) {
      this.setStatus(`Import rejected: workspace id must remain ${this.baseDocument.workspaceId}`);
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
    queueMicrotask(() => this.flushPreviewPatches());
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

  private nextStepIndex(): number {
    return this.documentState.blocks.filter((block) => block.type === 'tourStep').length;
  }

  private normalizeDocument(doc: LodariqDocument): LodariqDocument {
    const lexicalState = fromBlockJson(doc.blocks);
    const parsed = this.lexicalEditor.parseEditorState(JSON.stringify(lexicalState)).toJSON();
    return { ...doc, blocks: toBlockJson(parsed as SerializedEditorState) };
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
    this.jsonText = this.services.exportDocument(this.documentState);
    this.renderMetrics();
    this.emit();
  }

  private clearSlash(): void {
    this.slashText = '';
    this.slashOpen = false;
  }

  private focusBlock(blockId: string): void {
    this.focusRequest = { blockId, target: 'block', token: ++this.focusToken };
    this.emit();
  }

  private focusEditableField(blockId: string): void {
    this.focusRequest = { blockId, target: 'edit', token: ++this.focusToken };
    this.emit();
  }

  private focusInsertedBlock(blockId: string): void {
    this.focusEditableField(blockId);
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
