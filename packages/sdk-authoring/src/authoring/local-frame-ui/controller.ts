import {
  AUTHORING_INLINE_CONTROL_COMMIT_TYPE,
  AUTHORING_INLINE_CONTENT_COMMIT_TYPE,
  AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
  AUTHORING_PANEL_MODE_OPEN_TYPE,
  BASIC_VISUAL_PREFLIGHT_ISSUE_CODES,
  BRIDGE_PROTOCOL_VERSION,
  isPresentationAnchor,
  DEFAULT_EXPERIENCE_APPEARANCE,
  type BlockActionProps,
  type BridgeMessage,
  type AuthoringPanelLayoutMode,
  type PreviewPatchOperation,
  type LodariqBlock,
  type LodariqDocument,
  type ExperienceAppearance,
  type PresentationAnchor,
  type RuntimeLifecycleHints,
  type TargetInspectAction,
  type TargetIdentityV2,
  type TargetLocale,
  type TargetRequiredAction,
  type TargetViewportClass,
  type TextStyleProps,
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
  setBlockPlacement,
  setBlockPresentationAnchor,
  setBlockTextStyle,
  transformBlocks,
  updateBlockContent,
  type BlockDirection,
  type BlockInsertPosition,
  type EditableBlockType,
  type TooltipPlacement,
} from '../document-ops';
import { LOCAL_AUTHORING_SESSION_ID } from '../constants';
import { AuthoringBridge, createBridgeCorrelationId } from '../../bridge/transport';
import {
  blocksFromSafePasteData,
  createLodariqEditor,
  createTargetId,
  fromBlockJson,
  toBlockJson,
  type SerializedEditorState,
} from '../../editor';
import type {
  AuthoringPanelMode,
  AuthoringPanelOperation,
  AuthoringReleaseViewState,
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
  AuthoringBrandMatchProposal,
  AuthoringBrandMatchRequest,
  AuthoringBrandWorkspaceState,
  AuthoringExactArtifactPromotionRequest,
  AuthoringReleaseArtifactState,
  AuthoringReleaseWorkflowState,
  AuthoringStagingPublicationResult,
  AuthoringStagingPublicationRequest,
  AuthoringStagingReleaseState,
  LocalAuthoringFrameMetricName,
  LocalAuthoringFrameOptions,
} from '../local-frame-types';
import {
  blockDisplayTitle,
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
import {
  isInlinePreviewContentType,
  normalizeInlinePreviewContent,
} from '../inline-preview-editor';

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
  private readonly activeTargetInspectionRequestIds = new Map<string, string>();
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
  private advancedEditorStepId: string | null = null;
  private hostPageRoute: string | undefined;
  private hostPageLocale: TargetLocale | undefined;
  private hostViewportClass: TargetViewportClass | undefined;
  private draggingBlockId: string | null = null;
  private draggingStepBlockId: string | null = null;
  private dragTargetBlockId: string | null = null;
  private dragTargetPosition: BlockInsertPosition | null = null;
  private pendingTargetBlockId: string | null = null;
  private activeTargetCaptureCorrelationId: string | null = null;
  private pendingPresentationAnchorPick: {
    blockId: string;
    targetId: string;
    requestCorrelationId: string;
  } | null = null;
  private previewPatchFlushQueued = false;
  private focusRequest: FocusRequest | null = null;
  private focusToken = 0;
  private release: AuthoringReleaseViewState;
  private releaseRequestVersion = 0;
  private documentChangeSequence = 0;
  private pendingPublicationRequest: AuthoringStagingPublicationRequest | null = null;
  private panelMode: AuthoringPanelMode = 'edit';
  private panelReturnMode: AuthoringPanelMode = 'edit';
  private panelFocusToken = 0;
  private panelReturnFocus: 'appearance' | 'release' | null = null;
  private panelOperation: AuthoringPanelOperation = null;
  private brandWorkflow = accessibleFallbackBrandState();
  private brandProposal: AuthoringBrandMatchProposal | null = null;
  private releaseWorkflow: AuthoringReleaseWorkflowState | null = null;
  private panelWorkflowRequestVersion = 0;
  private panelWorkflowError: string | null = null;
  private panelWorkflowNotice: string | null = null;
  private started = false;

  constructor(private readonly options: LocalAuthoringFrameOptions) {
    this.services = options.services;
    this.release = initialReleaseView(
      this.hasReleaseServices(),
      this.services.releaseUnavailableReason,
    );
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
    this.refreshStagingRelease();
    this.refreshPanelWorkflowState();
  }

  destroy(): void {
    if (!this.started) return;
    this.started = false;
    this.releaseRequestVersion += 1;
    this.panelWorkflowRequestVersion += 1;
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

  activateTourStep(stepId: string): void {
    const step = this.documentState.blocks.find(
      (block) => block.id === stepId && block.type === 'tourStep',
    );
    if (!step) return;
    this.selectedBlockId = stepId;
    this.advancedEditorStepId = null;
    void this.sendPreviewRequest('step', stepId).catch(() => {
      this.setStatus('Step preview could not start');
    });
    this.setStatus(`Showing ${blockDisplayTitle(step)}`);
  }

  openAdvancedEditor(stepId: string): void {
    const step = this.documentState.blocks.find(
      (block) => block.id === stepId && block.type === 'tourStep',
    );
    if (!step) return;
    this.selectedBlockId = stepId;
    this.advancedEditorStepId = stepId;
    this.setStatus(`Advanced settings for ${blockDisplayTitle(step)}`);
  }

  closeAdvancedEditor(): void {
    if (!this.advancedEditorStepId) return;
    this.advancedEditorStepId = null;
    this.setStatus('Back to live authoring');
  }

  togglePanelWorkspace(): void {
    const mode: AuthoringPanelLayoutMode = window.innerWidth >= 520 ? 'compact' : 'standard';
    this.requestPanelLayout(mode);
  }

  requestPanelLayout(mode: AuthoringPanelLayoutMode): void {
    if (!this.isHostedInParent) return;
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: createBridgeCorrelationId('authoring_panel_layout'),
          type: AUTHORING_PANEL_LAYOUT_REQUEST_TYPE,
          mode,
        },
        { timeoutMs: 2_000 },
      )
      .catch(() => this.setStatus('Workspace size could not be changed'));
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

  commitRichTextContent(blockId: string, value: string): void {
    this.commitContent(blockId, value);
  }

  setTextBlockStyle(blockId: string, patch: Partial<TextStyleProps>): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (!block || (block.type !== 'heading' && block.type !== 'paragraph')) return;
    const textStyle = { ...block.props.textStyle, ...patch };
    if (JSON.stringify(block.props.textStyle ?? {}) === JSON.stringify(textStyle)) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockTextStyle(this.documentState.blocks, blockId, textStyle),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blockId;
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setTextStyle', textStyle }]);
    this.setStatus('Text formatting updated');
  }

  setTooltipPlacement(blockId: string, placement: TooltipPlacement): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.type !== 'tooltip' || block.props.placement === placement) return;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockPlacement(this.documentState.blocks, blockId, placement),
    };
    this.afterDocumentMutation();
    this.selectedBlockId = blockId;
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [{ op: 'setPlacement', placement }]);
    this.setStatus(`Tooltip moved ${placement}`);
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

  setDocumentAppearance(appearance: ExperienceAppearance): void {
    const current = this.documentState.appearance ?? DEFAULT_EXPERIENCE_APPEARANCE;
    if (
      current.preset === appearance.preset &&
      current.density === appearance.density &&
      current.width === appearance.width &&
      current.colorMode === appearance.colorMode
    ) {
      return;
    }
    this.recordChange();
    this.documentState = { ...this.documentState, appearance: structuredClone(appearance) };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(this.documentState.id, [
      { op: 'setAppearance', appearance: structuredClone(appearance) },
    ]);
    this.setStatus('Appearance updated');
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

  appendStep(title?: string): string {
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
    return block.id;
  }

  appendStepAndChooseTarget(): void {
    const blockId = this.appendStep();
    this.startTargetPick(blockId);
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
    if (this.advancedEditorStepId === blockId) this.advancedEditorStepId = null;
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
    this.activeTargetInspectionRequestIds.delete(targetId);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.selectedBlockId = blockId;
    this.setStatus('Removing placement…');
    void this.sendConfirmedPreviewPatch(blockId, [{ op: 'removeTarget', targetId }]).then(
      () => this.setStatus('Removed placement; choose a new one'),
      () => this.setStatus('Placement removed, but the live preview did not confirm the change'),
    );
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
        if (this.hostPageLocale) next.waitForTextLocale = this.hostPageLocale;
      } else {
        delete next.waitForText;
        delete next.waitForTextLocale;
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
    const block = findBlockById(this.documentState.blocks, blockId);
    const targetId = block ? firstTargetIdInBlock(block) : null;
    const target = targetId ? this.targetById(targetId) : null;
    if (targetId) this.activeTargetInspectionRequestIds.delete(targetId);
    const captureCorrelationId = createBridgeCorrelationId('target_pick_start');
    this.activeTargetCaptureCorrelationId = captureCorrelationId;
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: captureCorrelationId,
          type: 'target.pick.start',
          blockId,
          requiredAction: requiredTargetActionForBlock(block),
          ...(target ? { fingerprint: structuredClone(target.fingerprint) } : {}),
          ...(target?.identity ? { identity: structuredClone(target.identity) } : {}),
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        if (this.activeTargetCaptureCorrelationId === captureCorrelationId) {
          this.activeTargetCaptureCorrelationId = null;
        }
        this.pendingTargetBlockId = null;
        this.recordMetric('target.pick.failed');
        this.setStatus('Placement picker did not respond');
      });
  }

  startPresentationAnchorPick(blockId: string, targetId: string): void {
    if (!this.isHostedInParent) {
      this.setStatus('Open the editor on a preview page to choose an exact area');
      return;
    }
    const contextBlock = findBlockById(this.documentState.blocks, blockId);
    const targetBlockId = contextBlock ? firstBlockIdForTarget([contextBlock], targetId) : null;
    const targetBlock = targetBlockId
      ? findBlockById(this.documentState.blocks, targetBlockId)
      : null;
    if (
      !targetBlockId ||
      !targetBlock ||
      targetBlock.props.targetId !== targetId ||
      !this.targetById(targetId)
    ) {
      this.setStatus('Choose a placement before setting an exact area');
      return;
    }

    const requestCorrelationId = createBridgeCorrelationId('presentation_anchor_pick_start');
    this.pendingPresentationAnchorPick = { blockId: targetBlockId, targetId, requestCorrelationId };
    this.selectBlock(blockId);
    this.setStatus('Drag an exact area, click for a point, or use the arrow keys');
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: requestCorrelationId,
          type: 'presentation.anchor.pick.start',
          blockId: targetBlockId,
          targetId,
          ...(targetBlock.props.presentationAnchor
            ? { current: structuredClone(targetBlock.props.presentationAnchor) }
            : {}),
        },
        { timeoutMs: 2_000 },
      )
      .catch(() => {
        if (this.pendingPresentationAnchorPick?.requestCorrelationId !== requestCorrelationId) {
          return;
        }
        this.pendingPresentationAnchorPick = null;
        this.setStatus('Exact area picker did not respond');
      });
  }

  useWholeElement(blockId: string, targetId: string): void {
    const contextBlock = findBlockById(this.documentState.blocks, blockId);
    const targetBlockId = contextBlock ? firstBlockIdForTarget([contextBlock], targetId) : null;
    if (!targetBlockId) return;
    const targetBlock = findBlockById(this.documentState.blocks, targetBlockId);
    if (targetBlock?.props.targetId !== targetId || !targetBlock.props.presentationAnchor) return;
    this.commitPresentationAnchor(targetBlockId, targetId);
  }

  requestTargetInspection(blockId: string, targetId: string, action: TargetInspectAction): void {
    const target = this.targetById(targetId);
    const contextBlock = findBlockById(this.documentState.blocks, blockId);
    if (!target || !contextBlock) return;
    if (!this.isHostedInParent) {
      this.setStatus('Open the editor on a preview page to check placements');
      return;
    }
    this.setStatus(targetInspectionPendingStatus(action));
    const requestCorrelationId = createBridgeCorrelationId('target_inspect_request');
    this.activeTargetInspectionRequestIds.set(targetId, requestCorrelationId);
    const requiredAction = requiredTargetActionForBlock(contextBlock);
    const inspectionIdentity: TargetIdentityV2 | undefined = target.identity
      ? {
          ...structuredClone(target.identity),
          intent:
            requiredAction === 'anchor'
              ? { ...target.identity.intent, requiredAction }
              : {
                  elementKind: target.identity.intent.elementKind,
                  requiredAction,
                  resolutionMode: 'semantic',
                },
        }
      : undefined;
    void this.bridge
      .sendWithAck(
        {
          protocol: BRIDGE_PROTOCOL_VERSION,
          sessionId: this.sessionId,
          documentId: this.documentState.id,
          correlationId: requestCorrelationId,
          type: 'target.inspect.request',
          blockId,
          targetId,
          action,
          fingerprint: target.fingerprint,
          ...(inspectionIdentity ? { identity: inspectionIdentity } : {}),
        },
        { timeoutMs: 2000 },
      )
      .catch(() => {
        if (this.activeTargetInspectionRequestIds.get(targetId) !== requestCorrelationId) return;
        this.activeTargetInspectionRequestIds.delete(targetId);
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

  refreshStagingRelease(): void {
    void this.loadStagingReleaseState(true);
  }

  publishCurrentTourToStaging(): void {
    void this.publishCurrentTourToStagingAsync();
  }

  openAppearanceMode(): void {
    this.panelReturnFocus = 'appearance';
    this.openPanelMode('appearance', 'edit');
  }

  openReleaseVerificationMode(): void {
    this.panelReturnFocus = 'release';
    this.openPanelMode('release-verification', 'edit');
  }

  openPromotionConfirmation(): void {
    this.panelReturnFocus = 'release';
    this.openPanelMode('promotion-confirmation', 'release-verification');
  }

  closePanelMode(): void {
    if (this.panelMode === 'edit') return;
    this.panelWorkflowRequestVersion += 1;
    this.panelOperation = null;
    const nextMode = this.panelReturnMode;
    this.panelMode = nextMode;
    this.panelReturnMode = nextMode === 'edit' ? 'edit' : 'appearance';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
  }

  matchProductBrand(strategy: AuthoringBrandMatchRequest['strategy']): void {
    void this.matchProductBrandAsync(strategy);
  }

  acceptBrandMatch(): void {
    const proposal = this.brandProposal;
    if (!proposal) return;
    void this.applyBrandMatchProposal(proposal);
  }

  chooseAnotherBrandSource(): void {
    this.brandProposal = null;
    this.panelMode = 'appearance';
    this.panelReturnMode = 'edit';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
    this.matchProductBrand('select-element');
  }

  verifyCurrentStagingArtifact(): void {
    void this.verifyCurrentStagingArtifactAsync();
  }

  promoteCurrentStagingArtifact(): void {
    void this.promoteCurrentStagingArtifactAsync();
  }

  requestPromotionApproval(): void {
    void this.requestPromotionApprovalAsync();
  }

  approveAndPromoteProduction(): void {
    void this.approveAndPromoteProductionAsync();
  }

  refreshPanelWorkflowState(): void {
    const getBrandWorkflowState = this.services.getBrandWorkflowState;
    const getReleaseWorkflowState = this.services.getReleaseWorkflowState;
    if (!getBrandWorkflowState && !getReleaseWorkflowState) return;

    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = getReleaseWorkflowState ? 'loading-release' : 'loading-brand';
    this.panelWorkflowError = null;
    this.emit();

    const requests: Promise<void>[] = [];
    if (getBrandWorkflowState) {
      requests.push(
        getBrandWorkflowState().then((brand) => {
          if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
          this.brandWorkflow = structuredClone(brand);
        }),
      );
    }
    if (getReleaseWorkflowState) {
      requests.push(
        getReleaseWorkflowState().then((release) => {
          if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
          this.releaseWorkflow = structuredClone(release);
        }),
      );
    }
    void Promise.all(requests).then(
      () => {
        if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
        this.panelOperation = null;
        this.emit();
      },
      () => {
        if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
        this.panelOperation = null;
        this.panelWorkflowError = 'Brand and release details could not be refreshed.';
        this.emit();
      },
    );
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
    const step = this.selectedTourStep();
    if (!step) {
      this.setStatus('Add a step before previewing');
      return;
    }
    const hostPreview = this.sendPreviewRequest('step', step.id);
    void Promise.all([hostPreview, this.services.compilePreview(this.documentState)])
      .then(([, doc]) => {
        this.compiledText = JSON.stringify(doc, null, 2);
        this.recordMetric('preview.opened');
        this.setStatus('Step preview ready');
      })
      .catch(() => this.setStatus('Step preview could not start'));
    this.emit();
  }

  previewFullTour(): void {
    this.syncFocusedEditControl();
    this.documentState = this.normalizeDocument(this.documentState);
    this.jsonText = this.services.exportDocument(this.documentState);
    this.services.saveDocument(this.documentState);
    const hostPreview = this.sendPreviewRequest('full');
    void Promise.all([hostPreview, this.services.compilePreview(this.documentState)])
      .then(([, doc]) => {
        this.compiledText = JSON.stringify(doc, null, 2);
        this.recordMetric('preview.opened');
        this.setStatus('Tour preview ready');
      })
      .catch(() => this.setStatus('Tour preview could not start'));
    this.emit();
  }

  exportMetrics(): void {
    this.metricsText = this.services.exportMetricsReport(this.metricsSessionId);
    this.setStatus('Activity report ready');
  }

  private readonly handlePageHide = (): void => {
    this.destroy();
  };

  private selectedTourStep(): LodariqBlock | null {
    const selectedBlockId = this.selectedBlockId;
    if (selectedBlockId) {
      const selectedStep = this.documentState.blocks.find(
        (block) => block.type === 'tourStep' && blockContainsId(block, selectedBlockId),
      );
      if (selectedStep) return selectedStep;
    }
    return this.documentState.blocks.find((block) => block.type === 'tourStep') ?? null;
  }

  private sendPreviewRequest(mode: 'full' | 'step', stepId?: string): Promise<void> {
    if (!this.isHostedInParent) return Promise.resolve();
    const envelope = {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('authoring_preview_request'),
      type: 'authoring.preview.request' as const,
    };
    if (mode === 'step') {
      if (!stepId) return Promise.reject(new Error('Lodariq step preview requires a step id'));
      return this.bridge.sendWithAck({ ...envelope, mode: 'step', stepId }, { timeoutMs: 2_000 });
    }
    return this.bridge.sendWithAck({ ...envelope, mode: 'full' }, { timeoutMs: 2_000 });
  }

  private readonly handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    const pendingAnchor = this.pendingPresentationAnchorPick;
    if (pendingAnchor) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pendingPresentationAnchorPick = null;
      this.setStatus('Exact area selection canceled');
      this.bridge.send({
        protocol: BRIDGE_PROTOCOL_VERSION,
        sessionId: this.sessionId,
        documentId: this.documentState.id,
        correlationId: createBridgeCorrelationId('presentation_anchor_pick_canceled'),
        type: 'presentation.anchor.pick.canceled',
        requestCorrelationId: pendingAnchor.requestCorrelationId,
        blockId: pendingAnchor.blockId,
        targetId: pendingAnchor.targetId,
      });
      return;
    }
    if (!this.pendingTargetBlockId) {
      if (this.panelMode !== 'edit') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.closePanelMode();
      }
      return;
    }
    const blockId = this.pendingTargetBlockId;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pendingTargetBlockId = null;
    this.activeTargetCaptureCorrelationId = null;
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
    if (command) {
      this.setStatus('Open a step to add content.');
      this.clearSlash();
      this.emit();
      return;
    }
    this.appendStep(text);
  }

  private activateActionButton(button: HTMLButtonElement, action: string): void {
    if (action === 'toggle-workspace') this.togglePanelWorkspace();
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
    if (action === 'presentation-anchor-pick') {
      const blockId = button.dataset['blockId'];
      const targetId = button.dataset['targetId'];
      if (blockId && targetId) this.startPresentationAnchorPick(blockId, targetId);
    }
    if (action === 'presentation-anchor-reset') {
      const blockId = button.dataset['blockId'];
      const targetId = button.dataset['targetId'];
      if (blockId && targetId) this.useWholeElement(blockId, targetId);
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

  private handleBridgeMessage(message: BridgeMessage): Promise<void> | void {
    if (message.sessionId !== this.sessionId || message.documentId !== this.documentState.id) {
      return;
    }

    if (message.type === 'authoring.save.request') {
      return this.persistRequestedDocument(message.correlationId);
    }

    if (message.type === AUTHORING_PANEL_MODE_OPEN_TYPE) {
      this.openAppearanceMode();
      return;
    }

    if (message.type === AUTHORING_INLINE_CONTENT_COMMIT_TYPE) {
      const block = findBlockById(this.documentState.blocks, message.blockId);
      if (!block || !isInlinePreviewContentType(block.type)) return;
      this.commitContent(message.blockId, normalizeInlinePreviewContent(message.content));
      this.setStatus('Content updated in preview');
      return;
    }

    if (message.type === AUTHORING_INLINE_CONTROL_COMMIT_TYPE) {
      const operation = message.operation;
      if (operation.kind === 'setDocumentTitle') {
        this.commitDocumentTitle(operation.title);
        return;
      }
      if (operation.kind === 'setAppearance') {
        this.setDocumentAppearance(operation.appearance);
        return;
      }
      if (operation.kind === 'setPlacement') {
        this.setTooltipPlacement(operation.blockId, operation.placement);
        return;
      }
      if (operation.kind === 'setAction') {
        const block = findBlockById(this.documentState.blocks, operation.blockId);
        if (block?.type !== 'button' && block?.type !== 'link') return;
        this.setButtonAction(operation.blockId, operation.actionType);
        this.setStatus('Button action updated in preview');
        return;
      }
      if (operation.kind === 'openAdvanced') this.openAdvancedEditor(operation.stepId);
      return;
    }

    if (message.type === 'page.lifecycle.update') {
      this.handlePageLifecycleUpdate(message.route, message.locale, message.viewportClass);
      return;
    }

    if (message.type === 'target.inspect.result') {
      const activeRequestId = this.activeTargetInspectionRequestIds.get(message.targetId);
      if (message.requestCorrelationId && activeRequestId !== message.requestCorrelationId) return;
      // A legacy uncorrelated result cannot be assigned safely while a newer
      // inspection or replacement capture owns the target generation.
      if (
        !message.requestCorrelationId &&
        (activeRequestId || this.activeTargetCaptureCorrelationId)
      ) {
        return;
      }
      if (
        !hasBlock(this.documentState.blocks, message.blockId) ||
        !this.targetById(message.targetId)
      ) {
        return;
      }
      this.activeTargetInspectionRequestIds.delete(message.targetId);
      this.targetDiagnostics.set(message.targetId, {
        action: message.action,
        diagnostic: message.diagnostic,
      });
      this.setStatus(targetInspectionStatus(message.action, message.diagnostic));
      return;
    }

    if (message.type === 'presentation.anchor.pick.canceled') {
      const pending = this.pendingPresentationAnchorPick;
      if (!presentationAnchorMessageMatchesPending(message, pending)) return;
      this.pendingPresentationAnchorPick = null;
      this.setStatus('Exact area selection canceled');
      return;
    }

    if (message.type === 'presentation.anchor.pick.result') {
      const pending = this.pendingPresentationAnchorPick;
      if (!presentationAnchorMessageMatchesPending(message, pending)) return;
      this.pendingPresentationAnchorPick = null;
      if (!isPresentationAnchor(message.presentationAnchor)) {
        this.setStatus('The exact area was invalid and was not saved');
        return;
      }
      const block = findBlockById(this.documentState.blocks, message.blockId);
      if (block?.props.targetId !== message.targetId || !this.targetById(message.targetId)) {
        this.setStatus('The placement changed before the exact area was saved');
        return;
      }
      this.commitPresentationAnchor(message.blockId, message.targetId, message.presentationAnchor);
      return;
    }

    if (message.type === 'target.pick.canceled') {
      const alreadyCanceled = this.canceledTargetBlockIds.has(message.blockId);
      this.pendingTargetBlockId = null;
      this.activeTargetCaptureCorrelationId = null;
      this.canceledTargetBlockIds.add(message.blockId);
      if (!alreadyCanceled) this.recordMetric('target.pick.canceled');
      this.setStatus('Placement selection canceled');
      return;
    }

    if (message.type === 'target.evidence.update') {
      this.handleTargetEvidenceUpdate(message);
      return;
    }

    if (message.type !== 'target.pick.result') return;
    if (!hasBlock(this.documentState.blocks, message.blockId)) return;
    if (this.canceledTargetBlockIds.has(message.blockId)) return;
    if (
      message.captureCorrelationId &&
      message.captureCorrelationId !== this.activeTargetCaptureCorrelationId
    ) {
      return;
    }
    this.pendingTargetBlockId = null;
    this.canceledTargetBlockIds.delete(message.blockId);

    const currentBlock = findBlockById(this.documentState.blocks, message.blockId);
    const existingTargetId = currentBlock ? firstTargetIdInBlock(currentBlock) : null;
    const previousTargetBlockId =
      currentBlock && existingTargetId
        ? firstBlockIdForTarget([currentBlock], existingTargetId)
        : null;
    const targetId = existingTargetId ?? createTargetId();
    const label =
      message.identity?.display.authorLabel ??
      message.fingerprint.accessibleName ??
      message.fingerprint.stableAttributes['data-lodariq-id'] ??
      message.fingerprint.tagName;

    this.recordChange();
    const previousTarget = existingTargetId ? this.targetById(existingTargetId) : null;
    const identity = message.identity
      ? { ...structuredClone(message.identity), targetId }
      : undefined;
    const nextTarget: DocumentTarget = {
      id: targetId,
      fingerprint: message.fingerprint,
      ...(previousTarget?.lifecycle
        ? { lifecycle: structuredClone(previousTarget.lifecycle) }
        : {}),
      ...(identity ? { identity } : {}),
    };
    this.documentState = {
      ...this.documentState,
      targets: existingTargetId
        ? this.documentState.targets.map((target) =>
            target.id === existingTargetId ? nextTarget : target,
          )
        : [...this.documentState.targets, nextTarget],
      blocks: attachTargetToBlocks(this.documentState.blocks, message.blockId, targetId, label, {
        resetPresentationAnchor: Boolean(previousTargetBlockId),
      }),
    };
    if (
      previousTargetBlockId &&
      this.pendingPresentationAnchorPick?.blockId === previousTargetBlockId
    ) {
      this.pendingPresentationAnchorPick = null;
    }
    this.targetDiagnostics.delete(targetId);
    this.afterDocumentMutation();
    this.selectedBlockId = message.blockId;
    this.services.saveDocument(this.documentState);
    this.recordMetric('target.pick.succeeded');
    if (previousTargetBlockId) {
      this.sendPreviewPatch(previousTargetBlockId, [{ op: 'setPresentationAnchor' }]);
    }
    const previewConfirmation = this.sendConfirmedPreviewPatch(message.blockId, [
      {
        op: 'attachTarget',
        targetId,
        fingerprint: message.fingerprint,
        ...(identity ? { identity } : {}),
      },
    ]);
    this.setStatus(`Placement set: ${label}. Verifying…`);
    this.requestTargetInspection(message.blockId, targetId, 'health');
    return previewConfirmation;
  }

  private async persistRequestedDocument(requestCorrelationId: string): Promise<void> {
    this.saveCurrentDocument();
    const document = structuredClone(this.documentState);
    const documentSequence = this.documentChangeSequence;
    const persistInFrame = this.services.persistDocumentOnSaveRequest !== false;
    if (persistInFrame && this.services.persistDocument) this.setStatus('Saving draft…');
    try {
      if (persistInFrame) {
        await this.services.persistDocument?.(structuredClone(document));
      }
    } catch {
      this.setStatus('Draft could not be saved');
      throw new Error('Authoring document persistence failed');
    }
    this.setStatus('Saved draft');
    if (documentSequence === this.documentChangeSequence) this.refreshStagingRelease();
    this.bridge.send({
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: document.id,
      correlationId: createBridgeCorrelationId('authoring_save_result'),
      type: 'authoring.save.result',
      requestCorrelationId,
      document,
    });
  }

  private openPanelMode(mode: AuthoringPanelMode, returnMode: AuthoringPanelMode): void {
    this.panelMode = mode;
    this.panelReturnMode = returnMode;
    this.panelWorkflowError = null;
    this.panelWorkflowNotice = null;
    this.panelFocusToken += 1;
    this.emit();
  }

  private async matchProductBrandAsync(
    requestedStrategy: AuthoringBrandMatchRequest['strategy'],
  ): Promise<void> {
    const sampleBrandStyle = this.services.sampleBrandStyle;
    if (!sampleBrandStyle) {
      this.panelWorkflowError =
        'Product matching is available from an authenticated development or staging session.';
      this.emit();
      return;
    }

    const selectedStep = this.selectedTourStep();
    const targetId = selectedStep ? firstTargetIdInBlock(selectedStep) : null;
    const strategy =
      requestedStrategy === 'current-target' && !targetId ? 'select-element' : requestedStrategy;
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'sampling-brand';
    this.panelWorkflowError = null;
    this.panelWorkflowNotice =
      strategy === 'select-element'
        ? 'Choose one representative product element.'
        : 'Matching the current step placement.';
    this.emit();

    try {
      const proposal = await sampleBrandStyle({
        documentId: this.documentState.id,
        ...(targetId ? { targetId } : {}),
        strategy,
      });
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowNotice = null;
      this.brandProposal = structuredClone(proposal);
      if (!proposal.requiresConfirmation && this.services.applyBrandMatch) {
        await this.applyBrandMatchProposal(proposal, requestVersion);
        return;
      }
      this.panelMode = 'brand-match-review';
      this.panelReturnMode = 'appearance';
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowNotice = null;
      this.panelWorkflowError =
        'This product style could not be sampled. Choose another representative element.';
      this.emit();
    }
  }

  private async applyBrandMatchProposal(
    proposal: AuthoringBrandMatchProposal,
    activeRequestVersion?: number,
  ): Promise<void> {
    const applyBrandMatch = this.services.applyBrandMatch;
    if (!applyBrandMatch) {
      this.panelWorkflowError = 'This session cannot save Brand proposals.';
      this.emit();
      return;
    }
    const requestVersion = activeRequestVersion ?? ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'applying-brand';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const result = await applyBrandMatch(structuredClone(proposal));
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.brandWorkflow = structuredClone(result.brand);
      this.brandProposal = null;
      this.panelOperation = null;
      this.panelMode = 'appearance';
      this.panelReturnMode = 'edit';
      this.panelWorkflowNotice =
        result.savedAs === 'unchanged'
          ? 'The current Brand theme already matches this product evidence.'
          : 'Product match saved as a workspace draft for approval.';
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = 'The Brand proposal could not be saved.';
      this.emit();
    }
  }

  private async verifyCurrentStagingArtifactAsync(): Promise<void> {
    const staging = this.releaseWorkflow?.staging;
    const verifyStagingRelease = this.services.verifyStagingRelease;
    this.panelReturnFocus = 'release';
    this.openPanelMode('release-verification', 'edit');
    if (!staging || !verifyStagingRelease) {
      this.panelWorkflowError = staging
        ? 'Exact staging verification is not available in this session.'
        : 'Publish this draft to staging before verification.';
      this.emit();
      return;
    }

    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'verifying-release';
    this.panelWorkflowError = null;
    this.releaseWorkflow = {
      ...this.releaseWorkflow!,
      staging: {
        ...staging,
        verification: { ...staging.verification, state: 'running', checks: [] },
      },
    };
    this.emit();
    try {
      const result = await verifyStagingRelease({
        ...(staging.publicationId ? { publicationId: staging.publicationId } : {}),
        artifactId: staging.artifactId,
        contentHash: staging.contentHash,
      });
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow?.staging) {
        return;
      }
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        staging: {
          ...this.releaseWorkflow.staging,
          verification: structuredClone(result.verification),
        },
      };
      this.panelOperation = null;
      this.panelWorkflowNotice =
        result.verification.state === 'passed'
          ? 'The exact staged artifact is verified.'
          : 'Verification found issues that need attention.';
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow?.staging) {
        return;
      }
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        staging: {
          ...this.releaseWorkflow.staging,
          verification: {
            ...this.releaseWorkflow.staging.verification,
            state: 'failed',
          },
        },
      };
      this.panelOperation = null;
      this.panelWorkflowError = 'The exact staged artifact could not be verified.';
      this.emit();
    }
  }

  private async promoteCurrentStagingArtifactAsync(): Promise<void> {
    const workflow = this.releaseWorkflow;
    const staging = workflow?.staging;
    const promoteExactArtifact = this.services.promoteExactArtifact;
    if (!workflow || !staging || staging.verification.state !== 'passed') {
      this.panelWorkflowError = 'Verify the exact staged artifact before promotion.';
      this.emit();
      return;
    }
    if (!promoteExactArtifact) {
      this.panelWorkflowError = 'Production promotion is not available in this session.';
      this.emit();
      return;
    }

    const request = exactArtifactPromotionRequest(workflow);
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'promoting-release';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const result = await promoteExactArtifact(request);
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow) return;
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        production: structuredClone(result.production),
        approval: 'approved',
      };
      this.panelOperation = null;
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelWorkflowNotice = result.replayed
        ? 'Production already points to this exact artifact.'
        : 'This exact staged artifact is live in production.';
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = 'The exact staged artifact could not be promoted.';
      this.emit();
    }
  }

  private async requestPromotionApprovalAsync(): Promise<void> {
    const workflow = this.releaseWorkflow;
    const requestPromotionApproval = this.services.requestPromotionApproval;
    if (!workflow?.staging || workflow.approval !== 'required' || !requestPromotionApproval) {
      this.panelWorkflowError = 'Promotion approval cannot be requested in this session.';
      this.emit();
      return;
    }
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'requesting-approval';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const result = await requestPromotionApproval(exactArtifactPromotionRequest(workflow));
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow) return;
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        approval: result.approval,
        approvalOperationId: result.operationId,
      };
      this.panelOperation = null;
      this.panelWorkflowNotice =
        result.approval === 'approved'
          ? 'Production approval is ready.'
          : 'Promotion approval was requested.';
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = 'Promotion approval could not be requested.';
      this.emit();
    }
  }

  private async approveAndPromoteProductionAsync(): Promise<void> {
    const workflow = this.releaseWorkflow;
    const staging = workflow?.staging;
    const approveAndPromote = this.services.approveAndPromoteExactArtifact;
    const operationId = workflow?.approvalOperationId;
    const canApprove = Boolean(
      workflow?.approval === 'requested' && workflow.canApprove && operationId,
    );
    if (
      !workflow ||
      !staging ||
      staging.verification.state !== 'passed' ||
      !canApprove ||
      !operationId
    ) {
      this.panelWorkflowError = 'This production approval is not ready for your action.';
      this.emit();
      return;
    }
    if (!approveAndPromote) {
      this.panelWorkflowError = 'Production approval is not available in this session.';
      this.emit();
      return;
    }
    const requestVersion = ++this.panelWorkflowRequestVersion;
    this.panelOperation = 'approving-release';
    this.panelWorkflowError = null;
    this.emit();
    try {
      const request = {
        ...exactArtifactPromotionRequest(workflow),
        operationId,
      };
      const result = await approveAndPromote(request);
      if (!this.panelWorkflowRequestIsCurrent(requestVersion) || !this.releaseWorkflow) return;
      if (
        result.production.artifactId !== request.artifactId ||
        result.production.contentHash !== request.contentHash
      ) {
        throw new Error('Approved production artifact does not match staging');
      }
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        production: structuredClone(result.production),
        approval: 'approved',
      };
      this.panelOperation = null;
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelWorkflowNotice = result.replayed
        ? 'This approval was already applied to the exact production artifact.'
        : 'Approved. This exact staged artifact is live in production.';
      this.panelFocusToken += 1;
      this.emit();
    } catch {
      if (!this.panelWorkflowRequestIsCurrent(requestVersion)) return;
      this.panelOperation = null;
      this.panelWorkflowError = 'The exact staged artifact could not be approved and promoted.';
      this.emit();
    }
  }

  private panelWorkflowRequestIsCurrent(requestVersion: number): boolean {
    return this.started && requestVersion === this.panelWorkflowRequestVersion;
  }

  private async publishCurrentTourToStagingAsync(): Promise<void> {
    const getReleaseState = this.services.getReleaseState;
    const publishToStaging = this.services.publishToStaging;
    const persistDocument = this.services.persistDocument;
    if (!getReleaseState || !publishToStaging || !persistDocument) {
      this.release = initialReleaseView(false, this.services.releaseUnavailableReason);
      this.emit();
      return;
    }
    if (this.release.status === 'checking' || this.release.status === 'publishing') return;

    this.saveCurrentDocument();
    const document = structuredClone(this.documentState);
    const documentSequence = this.documentChangeSequence;
    const requestVersion = ++this.releaseRequestVersion;
    this.release = {
      status: 'publishing',
      reason: 'publishing',
      expectedGeneration: this.release.expectedGeneration,
      findings: [],
    };
    this.setStatus('Saving before staging…');

    try {
      await persistDocument(structuredClone(document));
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;

      const remote = await getReleaseState();
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.syncReleaseWorkflowFromStagingRemote(remote);
      const remoteView = releaseViewFromRemote(remote);
      if (remoteView.status === 'current') {
        this.release = remoteView;
        this.pendingPublicationRequest = null;
        this.setStatus('Staging is current');
        return;
      }
      if (remoteView.status !== 'ready' || remote.state !== 'ready') {
        this.release =
          remote.state === 'no_saved_artifact'
            ? requestFailedReleaseView(remote.expectedGeneration)
            : remoteView;
        this.setStatus('Staging release needs attention');
        return;
      }

      if (!remote.draftArtifactId || !remote.draftContentHash) {
        this.release = requestFailedReleaseView(remote.expectedGeneration);
        this.setStatus('The reviewed staging artifact is unavailable');
        return;
      }
      const publicationRequest = this.publicationRequestFor({
        ...remote,
        draftArtifactId: remote.draftArtifactId,
        draftContentHash: remote.draftContentHash,
      });
      const result = await publishToStaging(publicationRequest);
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      if (!result.ok) {
        this.release = releaseViewFromPublicationFailure(result);
        if (RELEASE_ERRORS_REQUIRING_NEW_GUARD.has(result.code)) {
          this.pendingPublicationRequest = null;
        }
        this.setStatus('Staging release needs attention');
        return;
      }

      this.pendingPublicationRequest = null;
      this.release = {
        status: 'current',
        reason: 'current',
        expectedGeneration: result.generation,
        findings: structuredClone(result.findings),
      };
      this.releaseWorkflow = releaseWorkflowAfterStagingPublication(
        this.releaseWorkflow,
        publicationRequest,
        Boolean(this.services.verifyStagingRelease),
        Boolean(this.services.promoteExactArtifact),
      );
      this.setStatus(result.replayed ? 'Staging publication confirmed' : 'Published to staging');
    } catch {
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.release = requestFailedReleaseView(this.release.expectedGeneration);
      this.setStatus('Staging could not be updated');
    }
  }

  private async loadStagingReleaseState(announce: boolean): Promise<void> {
    const getReleaseState = this.services.getReleaseState;
    if (!getReleaseState) {
      this.release = initialReleaseView(false, this.services.releaseUnavailableReason);
      this.emit();
      return;
    }

    const requestVersion = ++this.releaseRequestVersion;
    const documentSequence = this.documentChangeSequence;
    if (announce) {
      this.release = {
        status: 'checking',
        reason: 'checking',
        expectedGeneration: this.release.expectedGeneration,
        findings: [],
      };
      this.emit();
    }
    try {
      const remote = await getReleaseState();
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.release = releaseViewFromRemote(remote);
      this.syncReleaseWorkflowFromStagingRemote(remote);
      this.emit();
    } catch {
      if (!this.releaseRequestIsCurrent(requestVersion, documentSequence)) return;
      this.release = requestFailedReleaseView(this.release.expectedGeneration);
      this.emit();
    }
  }

  private publicationRequestFor(
    remote: AuthoringStagingReleaseState & {
      draftArtifactId: string;
      draftContentHash: string;
    },
  ): AuthoringStagingPublicationRequest {
    const pending = this.pendingPublicationRequest;
    const sameReviewedArtifact =
      pending?.expectedGeneration === remote.expectedGeneration &&
      pending.expectedArtifactId === remote.draftArtifactId &&
      pending.expectedContentHash === remote.draftContentHash;
    if (pending && sameReviewedArtifact) return pending;
    const request = {
      expectedGeneration: remote.expectedGeneration,
      expectedArtifactId: remote.draftArtifactId,
      expectedContentHash: remote.draftContentHash,
      idempotencyKey: createBridgeCorrelationId('staging_publish'),
      correlationId: createBridgeCorrelationId('release'),
    };
    this.pendingPublicationRequest = request;
    return request;
  }

  private releaseRequestIsCurrent(requestVersion: number, documentSequence: number): boolean {
    return (
      this.started &&
      requestVersion === this.releaseRequestVersion &&
      documentSequence === this.documentChangeSequence
    );
  }

  private hasReleaseServices(): boolean {
    return Boolean(this.services.getReleaseState);
  }

  private syncReleaseWorkflowFromStagingRemote(remote: AuthoringStagingReleaseState): void {
    const draftArtifactId = remote.draftArtifactId;
    const draftContentHash = remote.draftContentHash;
    if (!draftArtifactId || !draftContentHash) return;
    const currentWorkflow = this.releaseWorkflow;
    const stagingMatchesRemote =
      currentWorkflow?.staging?.artifactId === draftArtifactId &&
      currentWorkflow.staging.contentHash === draftContentHash;
    let staging = currentWorkflow?.staging ?? null;
    if (remote.state === 'current') {
      const verification =
        stagingMatchesRemote && currentWorkflow?.staging
          ? structuredClone(currentWorkflow.staging.verification)
          : { state: 'not-run' as const, checks: [] };
      staging = {
        ...(stagingMatchesRemote && currentWorkflow?.staging?.version
          ? { version: currentWorkflow.staging.version }
          : {}),
        artifactId: draftArtifactId,
        contentHash: draftContentHash,
        verification,
      };
    }
    this.releaseWorkflow = {
      draft: {
        ...(currentWorkflow?.draft.version ? { version: currentWorkflow.draft.version } : {}),
        contentHash: draftContentHash,
        dirty: false,
      },
      staging,
      production: currentWorkflow?.production ?? null,
      ...(currentWorkflow?.rendererVersion
        ? { rendererVersion: currentWorkflow.rendererVersion }
        : {}),
      ...(currentWorkflow?.theme ? { theme: structuredClone(currentWorkflow.theme) } : {}),
      ...(currentWorkflow?.changes ? { changes: structuredClone(currentWorkflow.changes) } : {}),
      canVerify: Boolean(this.services.verifyStagingRelease),
      canPromote: Boolean(this.services.promoteExactArtifact),
      approval: currentWorkflow?.approval ?? 'not-required',
    };
  }

  private handleTargetEvidenceUpdate(
    message: Extract<BridgeMessage, { type: 'target.evidence.update' }>,
  ): void {
    if (message.captureCorrelationId !== this.activeTargetCaptureCorrelationId) return;
    if (!hasBlock(this.documentState.blocks, message.blockId)) return;
    if (this.canceledTargetBlockIds.has(message.blockId)) return;

    const block = findBlockById(this.documentState.blocks, message.blockId);
    const targetId = block ? firstTargetIdInBlock(block) : null;
    const previousTarget = targetId ? this.targetById(targetId) : null;
    if (!targetId || !previousTarget) return;

    const identity = { ...structuredClone(message.identity), targetId };
    this.documentState = {
      ...this.documentState,
      targets: this.documentState.targets.map((target) =>
        target.id === targetId
          ? {
              id: targetId,
              fingerprint: structuredClone(message.fingerprint),
              identity,
              ...(target.lifecycle ? { lifecycle: structuredClone(target.lifecycle) } : {}),
            }
          : target,
      ),
    };
    this.targetDiagnostics.delete(targetId);
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(message.blockId, [
      {
        op: 'updateTargetEvidence',
        targetId,
        fingerprint: message.fingerprint,
        identity,
      },
    ]);
    this.setStatus('Placement evidence stabilized. Verifying…');
    this.requestTargetInspection(message.blockId, targetId, 'health');
  }

  private handlePageLifecycleUpdate(
    route: string,
    locale: TargetLocale | undefined,
    viewportClass: TargetViewportClass | undefined,
  ): void {
    const previousRoute = this.hostPageRoute;
    const previousLocale = this.hostPageLocale;
    const previousViewportClass = this.hostViewportClass;
    this.hostPageRoute = route;
    if (locale !== undefined) this.hostPageLocale = locale;
    if (viewportClass !== undefined) this.hostViewportClass = viewportClass;

    const routeChanged = previousRoute !== undefined && previousRoute !== route;
    const localeChanged =
      previousLocale !== undefined && locale !== undefined && previousLocale !== locale;
    const viewportChanged =
      previousViewportClass !== undefined &&
      viewportClass !== undefined &&
      previousViewportClass !== viewportClass;
    const contextBecameKnown =
      previousRoute === undefined ||
      (previousLocale === undefined && locale !== undefined) ||
      (previousViewportClass === undefined && viewportClass !== undefined);
    const diagnosticsPredateKnownContext = contextBecameKnown && this.targetDiagnostics.size > 0;
    const contextChanged = routeChanged || localeChanged || viewportChanged;
    if ((!contextChanged && !diagnosticsPredateKnownContext) || this.targetDiagnostics.size === 0) {
      return;
    }

    this.targetDiagnostics.clear();
    this.setStatus('Page context changed; placements are unverified');
    const activeStep = this.selectedTourStep();
    const activeTargetId = activeStep ? firstTargetIdInBlock(activeStep) : null;
    if (activeStep && activeTargetId) {
      this.requestTargetInspection(activeStep.id, activeTargetId, 'health');
    }
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
    const targetContext = this.documentState.blocks.find((block) =>
      blockContainsId(block, blockId),
    );
    const targetId = targetContext ? firstTargetIdInBlock(targetContext) : null;
    if (targetContext && targetId) {
      this.targetDiagnostics.delete(targetId);
      this.requestTargetInspection(targetContext.id, targetId, 'health');
    }
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

  private sendConfirmedPreviewPatch(blockId: string, ops: PreviewPatchOperation[]): Promise<void> {
    this.flushPreviewPatches();
    return this.bridge.sendWithAck(this.previewPatchMessage(blockId, ops), { timeoutMs: 2_000 });
  }

  private flushPreviewPatches(): void {
    if (!this.previewPatchFlushQueued && this.pendingPreviewPatches.length === 0) return;
    this.previewPatchFlushQueued = false;
    const batches = this.pendingPreviewPatches.splice(0, this.pendingPreviewPatches.length);
    for (const batch of batches) {
      this.bridge.send(this.previewPatchMessage(batch.blockId, batch.ops));
    }
  }

  private previewPatchMessage(
    blockId: string,
    ops: PreviewPatchOperation[],
  ): Extract<BridgeMessage, { type: 'preview.patch' }> {
    return {
      protocol: BRIDGE_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      documentId: this.documentState.id,
      correlationId: createBridgeCorrelationId('preview_patch'),
      type: 'preview.patch',
      blockId,
      patch: { ops },
    };
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

  private commitPresentationAnchor(
    blockId: string,
    targetId: string,
    presentationAnchor?: PresentationAnchor,
  ): void {
    const block = findBlockById(this.documentState.blocks, blockId);
    if (block?.props.targetId !== targetId) return;
    const exactAnchor =
      presentationAnchor?.kind === 'point' || presentationAnchor?.kind === 'region'
        ? structuredClone(presentationAnchor)
        : undefined;
    this.recordChange();
    this.documentState = {
      ...this.documentState,
      blocks: setBlockPresentationAnchor(this.documentState.blocks, blockId, exactAnchor),
    };
    this.afterDocumentMutation();
    this.services.saveDocument(this.documentState);
    this.sendPreviewPatch(blockId, [
      exactAnchor
        ? { op: 'setPresentationAnchor', presentationAnchor: exactAnchor }
        : { op: 'setPresentationAnchor' },
    ]);
    this.setStatus(exactAnchor ? 'Exact area set' : 'Using the whole element');
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
    this.documentChangeSequence += 1;
    this.releaseRequestVersion += 1;
    this.panelWorkflowRequestVersion += 1;
    this.pendingPublicationRequest = null;
    if (
      this.panelOperation === 'verifying-release' ||
      this.panelOperation === 'promoting-release' ||
      this.panelOperation === 'requesting-approval' ||
      this.panelOperation === 'approving-release'
    ) {
      this.panelOperation = null;
      this.panelWorkflowNotice = 'Draft changed. Publish and verify the new artifact again.';
    }
    if (this.services.publishToStaging) {
      this.release = {
        status: 'ready',
        reason: 'unsaved_changes',
        expectedGeneration: this.release.expectedGeneration,
        findings: [],
      };
    }
    if (this.releaseWorkflow) {
      const nextDraftVersion = this.releaseWorkflow.draft.version;
      this.releaseWorkflow = {
        ...this.releaseWorkflow,
        draft: {
          ...(typeof nextDraftVersion === 'number' ? { version: nextDraftVersion + 1 } : {}),
          dirty: true,
        },
      };
    }
    if (this.panelMode === 'promotion-confirmation') {
      this.panelMode = 'release-verification';
      this.panelReturnMode = 'edit';
      this.panelFocusToken += 1;
    }
    if (this.selectedBlockId && !hasBlock(this.documentState.blocks, this.selectedBlockId)) {
      this.selectedBlockId = null;
    }
    if (
      this.advancedEditorStepId &&
      !this.documentState.blocks.some(
        (block) => block.id === this.advancedEditorStepId && block.type === 'tourStep',
      )
    ) {
      this.advancedEditorStepId = null;
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
      advancedEditorStepId: this.advancedEditorStepId,
      dragTargetBlockId: this.dragTargetBlockId,
      dragTargetPosition: this.dragTargetPosition,
      targetDiagnostics: new Map(this.targetDiagnostics),
      advancedTargetIds: new Set(this.advancedTargetIds),
      focusRequest: this.focusRequest,
      release: {
        ...this.release,
        findings: structuredClone(this.release.findings),
      },
      panelWorkflow: {
        mode: this.panelMode,
        returnMode: this.panelReturnMode,
        focusToken: this.panelFocusToken,
        returnFocus: this.panelReturnFocus,
        operation: this.panelOperation,
        brand: structuredClone(this.brandWorkflow),
        brandProposal: this.brandProposal ? structuredClone(this.brandProposal) : null,
        release: this.releaseWorkflow ? structuredClone(this.releaseWorkflow) : null,
        error: this.panelWorkflowError,
        notice: this.panelWorkflowNotice,
      },
    };
  }

  private emit(): void {
    this.snapshotValue = this.makeSnapshot();
    for (const subscriber of this.subscribers) {
      subscriber(this.snapshotValue);
    }
  }
}

function initialReleaseView(
  hasReleaseServices: boolean,
  unavailableReason: LocalAuthoringFrameOptions['services']['releaseUnavailableReason'],
): AuthoringReleaseViewState {
  if (hasReleaseServices) {
    return {
      status: 'checking',
      reason: 'checking',
      expectedGeneration: null,
      findings: [],
    };
  }
  return {
    status: 'unavailable',
    reason: unavailableReason === 'not-authorized' ? 'not_authorized' : 'local_preview',
    expectedGeneration: null,
    findings: [],
  };
}

function accessibleFallbackBrandState(): AuthoringBrandWorkspaceState {
  return {
    themeName: 'Lodariq accessible fallback',
    status: 'fallback',
    source: {
      kind: 'accessible-fallback',
      label: 'Accessible fallback',
      detail: 'Safe semantic defaults are active until a workspace Brand theme is approved.',
    },
    canEdit: false,
    canApprove: false,
  };
}

function exactArtifactPromotionRequest(
  workflow: AuthoringReleaseWorkflowState,
): AuthoringExactArtifactPromotionRequest {
  const staging = workflow.staging;
  if (!staging) throw new Error('A staging artifact is required for promotion');
  return {
    ...(staging.publicationId ? { sourcePublicationId: staging.publicationId } : {}),
    ...(workflow.production?.environmentId
      ? { productionEnvironmentId: workflow.production.environmentId }
      : {}),
    ...(typeof workflow.production?.generation === 'number'
      ? { expectedGeneration: workflow.production.generation }
      : {}),
    artifactId: staging.artifactId,
    contentHash: staging.contentHash,
    ...(workflow.production?.artifactId
      ? { expectedProductionArtifactId: workflow.production.artifactId }
      : {}),
  };
}

function releaseWorkflowAfterStagingPublication(
  current: AuthoringReleaseWorkflowState | null,
  request: AuthoringStagingPublicationRequest,
  canVerify: boolean,
  canPromote: boolean,
): AuthoringReleaseWorkflowState {
  const production: AuthoringReleaseArtifactState | null = current?.production
    ? structuredClone(current.production)
    : null;
  const approval =
    current && current.approval !== 'not-required'
      ? ('required' as const)
      : ('not-required' as const);
  return {
    draft: {
      ...(current?.draft.version ? { version: current.draft.version } : {}),
      contentHash: request.expectedContentHash,
      dirty: false,
    },
    staging: {
      ...(current?.staging?.version ? { version: current.staging.version } : {}),
      artifactId: request.expectedArtifactId,
      contentHash: request.expectedContentHash,
      verification: { state: 'not-run', checks: [] },
    },
    production,
    ...(current?.rendererVersion ? { rendererVersion: current.rendererVersion } : {}),
    ...(current?.theme ? { theme: structuredClone(current.theme) } : {}),
    ...(current?.changes ? { changes: structuredClone(current.changes) } : {}),
    canVerify,
    canPromote,
    canApprove: current?.canApprove ?? false,
    approval,
  };
}

function releaseViewFromRemote(remote: AuthoringStagingReleaseState): AuthoringReleaseViewState {
  const expectedGeneration = remote.expectedGeneration;
  const findings = structuredClone(remote.findings);
  if (!remote.available || remote.state === 'open_in_staging') {
    return {
      status: 'blocked',
      reason: 'open_in_staging',
      expectedGeneration,
      findings,
    };
  }
  if (findings.some((finding) => finding.severity === 'blocker')) {
    return {
      status: 'blocked',
      reason: releaseBlockerReason(findings),
      expectedGeneration,
      findings,
    };
  }
  if (remote.state === 'current') {
    return {
      status: 'current',
      reason: 'current',
      expectedGeneration,
      findings,
    };
  }
  return {
    status: 'ready',
    reason: remote.state === 'no_saved_artifact' ? 'no_saved_artifact' : 'ready',
    expectedGeneration,
    findings,
  };
}

function releaseViewFromPublicationFailure(
  result: Extract<AuthoringStagingPublicationResult, { ok: false }>,
): AuthoringReleaseViewState {
  if (BLOCKING_RELEASE_ERROR_CODES.has(result.code)) {
    return {
      status: 'blocked',
      reason:
        result.code === 'visual_preflight_blocked' ? 'visual_preflight_blocked' : 'publish_blocked',
      expectedGeneration: result.actualGeneration ?? result.expectedGeneration ?? null,
      findings: structuredClone(result.findings),
    };
  }
  return {
    ...requestFailedReleaseView(result.actualGeneration ?? result.expectedGeneration ?? null),
    findings: structuredClone(result.findings),
  };
}

function requestFailedReleaseView(expectedGeneration: number | null): AuthoringReleaseViewState {
  return {
    status: 'error',
    reason: 'request_failed',
    expectedGeneration,
    findings: [],
  };
}

const BLOCKING_RELEASE_ERROR_CODES = new Set([
  'publish_blocked',
  'visual_preflight_blocked',
  'staging_authoring_session_required',
  'theme_migration_required',
  'theme_review_required',
]);

const VISUAL_PREFLIGHT_ISSUE_CODES = new Set<string>(BASIC_VISUAL_PREFLIGHT_ISSUE_CODES);

function releaseBlockerReason(
  findings: AuthoringStagingReleaseState['findings'],
): 'publish_blocked' | 'visual_preflight_blocked' {
  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  return blockers.length > 0 &&
    blockers.every((finding) => VISUAL_PREFLIGHT_ISSUE_CODES.has(finding.code))
    ? 'visual_preflight_blocked'
    : 'publish_blocked';
}
const RELEASE_ERRORS_REQUIRING_NEW_GUARD = new Set([
  'deployment_changed',
  'idempotency_conflict',
  'reviewed_artifact_changed',
]);

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
  return 'Verifying placement';
}

function presentationAnchorMessageMatchesPending(
  message: Extract<
    BridgeMessage,
    { type: 'presentation.anchor.pick.canceled' | 'presentation.anchor.pick.result' }
  >,
  pending: {
    blockId: string;
    targetId: string;
    requestCorrelationId: string;
  } | null,
): boolean {
  return Boolean(
    pending &&
    pending.requestCorrelationId === message.requestCorrelationId &&
    pending.blockId === message.blockId &&
    pending.targetId === message.targetId,
  );
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
      delete next.waitForTextLocale;
    }
  }
  if (!next.waitForText) delete next.waitForTextLocale;
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

function blockContainsId(block: LodariqBlock, blockId: string): boolean {
  return block.id === blockId || block.children.some((child) => blockContainsId(child, blockId));
}

function firstTargetIdInBlock(block: LodariqBlock): string | null {
  if (typeof block.props.targetId === 'string' && block.props.targetId) return block.props.targetId;
  for (const child of block.children) {
    const targetId = firstTargetIdInBlock(child);
    if (targetId) return targetId;
  }
  return null;
}

function requiredTargetActionForBlock(block: LodariqBlock | null): TargetRequiredAction {
  if (!block) return 'anchor';
  if (block.props.action?.type === 'clickTarget') return 'observe-click';
  return block.children.some((child) => requiredTargetActionForBlock(child) === 'observe-click')
    ? 'observe-click'
    : 'anchor';
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
