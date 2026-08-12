import { ControllerHistoryReleaseFeature } from './controller-history-release';
import { BRIDGE_PROTOCOL_VERSION, type LodariqBlock } from '@lodariq/schema';
import { createBridgeCorrelationId } from '../../bridge/transport';
import { editableBlockTypeValue, findBlockById, slashCommandType } from './utils';
import { blockContainsId, targetInspectActionForButtonAction } from './controller-model';

export abstract class ControllerPreviewFeature extends ControllerHistoryReleaseFeature {
  protected selectedTourStep(): LodariqBlock | null {
    const selectedBlockId = this.selectedBlockId;
    if (selectedBlockId) {
      const selectedStep = this.documentState.blocks.find(
        (block) => block.type === 'tourStep' && blockContainsId(block, selectedBlockId),
      );
      if (selectedStep) return selectedStep;
    }
    return this.documentState.blocks.find((block) => block.type === 'tourStep') ?? null;
  }

  protected sendPreviewRequest(mode: 'full' | 'step', stepId?: string): Promise<void> {
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

  protected readonly handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
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

  protected handleSlashEnter(key: string, rawText: string, preventDefault: () => void): void {
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

  protected activateActionButton(button: HTMLButtonElement, action: string): void {
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
}
