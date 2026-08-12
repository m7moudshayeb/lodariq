import { ControllerContentFeature } from './controller-content';
import {
  BRIDGE_PROTOCOL_VERSION,
  type PreviewPatchOperation,
  type PresentationAnchor,
  type RuntimeLifecycleHints,
  type TargetInspectAction,
  type TargetIdentityV2,
} from '@lodariq/schema';
import {
  blocksReferenceTarget,
  createTourStep,
  duplicateTopLevelBlock,
  hasBlock,
  moveTopLevelBlock as moveTopLevelBlocks,
  renumberTourSteps,
  removeTopLevelBlock,
  removeTargetFromBlocks,
  reorderTopLevelBlock as reorderTopLevelBlocks,
  type BlockDirection,
  type BlockInsertPosition,
} from '../document-ops';
import { createBridgeCorrelationId } from '../../bridge/transport';
import type { DocumentTarget } from './types';
import { type TargetLifecycleControl } from './types';
import { findBlockById } from './utils';
import {
  firstBlockIdForTarget,
  firstTargetIdInBlock,
  isTargetLifecycleScrollStrategy,
  requiredTargetActionForBlock,
  targetInspectionPendingStatus,
} from './controller-model';

export abstract class ControllerStepsTargetsFeature extends ControllerContentFeature {
  protected abstract commitPresentationAnchor(
    blockId: string,
    targetId: string,
    presentationAnchor?: PresentationAnchor,
  ): void;
  protected abstract sendConfirmedPreviewPatch(
    blockId: string,
    ops: PreviewPatchOperation[],
  ): Promise<void>;
  protected abstract targetById(targetId: string): DocumentTarget | undefined;
  protected abstract updateTargetLifecycle(
    targetId: string,
    updater: (current: RuntimeLifecycleHints) => RuntimeLifecycleHints,
  ): void;

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
}
